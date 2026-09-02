import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { View } from 'react-native';
import { File, FileMode } from 'expo-file-system';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType, WebViewMessageEvent } from 'react-native-webview';
import { useApp } from '../../context/AppContext';
import { PDF_DEFAULTS, type PdfEngineHandle, type PdfDisplayMode, type PdfPageSize } from '../PdfReader.types';
import { describePdfSource, pdfDevLog, pdfDevMetric, pdfDevWarn } from './pdfDebug';
import {
  createPdfWebBridgeCommand,
  PDF_WEB_BRIDGE_QUEUE_LIMIT,
  parsePdfWebBridgeEvent,
  type PdfWebBridgeCommand,
  type PdfWebRuntimeMetrics,
} from './pdfWebBridge';
import { PDF_WEB_RUNTIME_HTML } from './web/pdfWebRuntime';

const RUNTIME_ORIGIN = 'https://krumer.pdf.local/';
const RUNTIME_READY_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT_RANGES = 2;
const MAX_PENDING_RANGES = 24;
const MAX_RANGE_BYTES = 1024 * 1024;
const PDF_WEB_ANDROID_LAYER_TYPE = process.env.EXPO_PUBLIC_PDF_WEBVIEW_LAYER_TYPE === 'hardware'
  ? 'hardware'
  : 'none';

type PdfWebEngineProps = {
  displayMode: PdfDisplayMode;
  fileSize?: number;
  initialPage: number;
  onError: (error: unknown) => void;
  onExternalLink?: (url: string) => void;
  onLoadComplete: (pages: number, path: string, size: PdfPageSize) => void;
  onLoadProgress?: (percent: number) => void;
  onPageChanged: (page: number, total: number) => void;
  onScaleChanged?: (scale: number) => void;
  onSingleTap: (page: number, x: number, y: number) => void;
  resolvedUri: string;
  scale: number;
};

type RangeRequest = {
  begin: number;
  bookId: string;
  end: number;
  generation: number;
  requestId: string;
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += BASE64_ALPHABET[first >> 2];
    result += BASE64_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    result += second === undefined ? '=' : BASE64_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    result += third === undefined ? '=' : BASE64_ALPHABET[third & 63];
  }
  return result;
}

async function readPdfRange(uri: string, begin: number, end: number): Promise<string> {
  const length = end - begin;
  if (length <= 0 || length > MAX_RANGE_BYTES) throw new Error('Invalid PDF byte range.');
  const file = new File(uri);
  if (!file.exists) throw new Error('PDF file is no longer available.');
  const handle = file.open(FileMode.ReadOnly);
  try {
    handle.offset = begin;
    return bytesToBase64(handle.readBytes(length));
  } finally {
    handle.close();
  }
}

/** PDF.js + foliate-js fixed-layout engine running inside one stable WebView. */
export const PdfWebEngine = memo(forwardRef<PdfEngineHandle, PdfWebEngineProps>(
  function PdfWebEngine(
    {
      displayMode,
      fileSize,
      initialPage,
      onError,
      onExternalLink,
      onLoadComplete,
      onLoadProgress,
      onPageChanged,
      onScaleChanged,
      onSingleTap,
      resolvedUri,
      scale,
    },
    ref,
  ) {
    const { theme } = useApp();
    const webviewRef = useRef<WebViewType>(null);
    const runtimeReadyRef = useRef(false);
    const pendingCommandsRef = useRef<PdfWebBridgeCommand[]>([]);
    const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openGenerationRef = useRef(0);
    const rangeQueueRef = useRef<RangeRequest[]>([]);
    const activeRangeCountRef = useRef(0);
    const currentPageRef = useRef(initialPage);
    const totalPagesRef = useRef(0);
    const source = useMemo(() => ({ html: PDF_WEB_RUNTIME_HTML, baseUrl: RUNTIME_ORIGIN }), []);

    const injectCommand = useCallback((command: PdfWebBridgeCommand) => {
      const serialized = JSON.stringify(command);
      const safeArgument = JSON.stringify(serialized);
      webviewRef.current?.injectJavaScript(
        `window.KrumerPdfBridge && window.KrumerPdfBridge.receive(${safeArgument}); true;`,
      );
    }, []);

    const sendCommand = useCallback((command: PdfWebBridgeCommand) => {
      if (runtimeReadyRef.current) {
        injectCommand(command);
        return;
      }
      if (pendingCommandsRef.current.length >= PDF_WEB_BRIDGE_QUEUE_LIMIT) {
        onError(new Error('PDF runtime command queue is full.'));
        return;
      }
      pendingCommandsRef.current.push(command);
    }, [injectCommand, onError]);

    const flushPendingCommands = useCallback(() => {
      const commands = pendingCommandsRef.current.splice(0, PDF_WEB_BRIDGE_QUEUE_LIMIT);
      commands.forEach(injectCommand);
    }, [injectCommand]);

    const drainRangeQueue = useCallback(() => {
      while (activeRangeCountRef.current < MAX_CONCURRENT_RANGES && rangeQueueRef.current.length) {
        const request = rangeQueueRef.current.shift();
        if (!request) break;
        activeRangeCountRef.current += 1;
        void readPdfRange(request.bookId, request.begin, request.end)
          .then((dataBase64) => {
            if (request.generation !== openGenerationRef.current) return;
            injectCommand(createPdfWebBridgeCommand('READ_RANGE_RESULT', {
              bookId: request.bookId,
              dataBase64,
              requestId: request.requestId,
            }));
          })
          .catch((error: unknown) => {
            if (request.generation !== openGenerationRef.current) return;
            injectCommand(createPdfWebBridgeCommand('READ_RANGE_RESULT', {
              bookId: request.bookId,
              error: error instanceof Error ? error.message : String(error),
              requestId: request.requestId,
            }));
          })
          .finally(() => {
            activeRangeCountRef.current = Math.max(0, activeRangeCountRef.current - 1);
            drainRangeQueue();
          });
      }
    }, [injectCommand]);

    const handleMessage = useCallback((event: WebViewMessageEvent) => {
      const message = parsePdfWebBridgeEvent(event.nativeEvent.data);
      if (!message) {
        pdfDevWarn('web:invalid-message');
        return;
      }

      if (message.type === 'READY') {
        runtimeReadyRef.current = true;
        if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
        flushPendingCommands();
        return;
      }
      if (message.type === 'READ_RANGE') {
        if (message.payload.bookId !== resolvedUri) return;
        if (rangeQueueRef.current.length + activeRangeCountRef.current >= MAX_PENDING_RANGES) {
          injectCommand(createPdfWebBridgeCommand('READ_RANGE_RESULT', {
            bookId: message.payload.bookId,
            error: 'PDF byte range queue is full.',
            requestId: message.payload.requestId,
          }));
          return;
        }
        rangeQueueRef.current.push({
          ...message.payload,
          generation: openGenerationRef.current,
        });
        drainRangeQueue();
        return;
      }
      if (message.type === 'BOOK_OPENED') {
        if (message.payload.bookId !== resolvedUri) return;
        currentPageRef.current = message.payload.page;
        totalPagesRef.current = message.payload.totalPages;
        onLoadComplete(message.payload.totalPages, resolvedUri, {
          height: message.payload.height,
          width: message.payload.width,
        });
        return;
      }
      if (message.type === 'PAGE_CHANGED') {
        if (totalPagesRef.current && message.payload.totalPages !== totalPagesRef.current) return;
        currentPageRef.current = message.payload.page;
        totalPagesRef.current = message.payload.totalPages;
        onPageChanged(message.payload.page, message.payload.totalPages);
        return;
      }
      if (message.type === 'LOAD_PROGRESS') {
        onLoadProgress?.(message.payload.progress);
        return;
      }
      if (message.type === 'SCALE_CHANGED') {
        onScaleChanged?.(message.payload.scale);
        pdfDevMetric('reader:scale-ready', {
          engine: 'webview',
          gestureMs: message.payload.gestureMs,
          latencyMs: message.payload.gestureMs,
          scale: message.payload.scale,
        });
        return;
      }
      if (message.type === 'RUNTIME_METRICS') {
        const metrics: PdfWebRuntimeMetrics = message.payload;
        pdfDevLog('web:runtime-metrics', metrics);
        pdfDevMetric('web:runtime-open', {
          engine: 'webview',
          elapsedMs: metrics.openMs,
          pagesLoaded: metrics.pagesLoaded,
          rangeBytes: metrics.rangeBytes,
          rangeRejected: metrics.rangeRejected,
          rangeRequests: metrics.rangeRequests,
          rangeTimeouts: metrics.rangeTimeouts,
          androidLayerType: PDF_WEB_ANDROID_LAYER_TYPE,
        });
        return;
      }
      if (message.type === 'SINGLE_TAP') {
        // Runtime viewport CSS pixels and React Native layout points are both
        // density-independent here; keep the coordinate space explicit.
        onSingleTap(message.payload.page, message.payload.x, message.payload.y);
        return;
      }
      if (message.type === 'LINK_PRESSED') {
        onExternalLink?.(message.payload.url);
        return;
      }
      if (message.type === 'CENTER_TAP') {
        onSingleTap(currentPageRef.current, 0, 0);
        return;
      }
      if (message.type === 'ERROR') {
        const detail = message.payload.code
          ? `${message.payload.code}: ${message.payload.message}`
          : message.payload.message;
        onError(new Error(detail));
      }
    }, [drainRangeQueue, flushPendingCommands, injectCommand, onError, onExternalLink, onLoadComplete, onLoadProgress, onPageChanged, onScaleChanged, onSingleTap, resolvedUri]);

    useImperativeHandle(ref, () => ({
      scrollByViewport: (fraction) => {
        sendCommand(createPdfWebBridgeCommand('SCROLL_BY_VIEWPORT', { fraction }));
      },
      setPage: (page) => {
        currentPageRef.current = page;
        sendCommand(createPdfWebBridgeCommand('SET_PAGE', { page }));
      },
      setScale: (nextScale) => {
        sendCommand(createPdfWebBridgeCommand('SET_SCALE', { scale: nextScale }));
      },
    }), [sendCommand]);

    useEffect(() => {
      const timer = setTimeout(() => {
        if (!runtimeReadyRef.current) onError(new Error('PDF WebView runtime did not become ready.'));
      }, RUNTIME_READY_TIMEOUT_MS);
      readyTimerRef.current = timer;
      return () => clearTimeout(timer);
    }, [onError]);

    useEffect(() => {
      const generation = openGenerationRef.current + 1;
      openGenerationRef.current = generation;
      rangeQueueRef.current = [];
      pendingCommandsRef.current = pendingCommandsRef.current.filter((command) => command.type !== 'OPEN_BOOK');
      if (runtimeReadyRef.current) sendCommand(createPdfWebBridgeCommand('CLOSE_BOOK', {}));

      let byteLength = Math.max(0, Math.trunc(fileSize ?? 0));
      try {
        const file = new File(resolvedUri);
        byteLength = file.size || byteLength;
      } catch (error) {
        onError(error);
        return undefined;
      }
      if (!byteLength) byteLength = 0;
      sendCommand(createPdfWebBridgeCommand('OPEN_BOOK', {
        bookId: resolvedUri,
        byteLength,
        displayMode,
        initialPage,
        scale,
      }));
      pdfDevLog('web:open-request', {
        displayMode,
        page: initialPage,
        scale,
        source: describePdfSource(resolvedUri),
      });
      return () => {
        if (openGenerationRef.current === generation) {
          pendingCommandsRef.current = pendingCommandsRef.current.filter((command) => command.type !== 'OPEN_BOOK');
        }
      };
    }, [fileSize, onError, resolvedUri, sendCommand]);

    useEffect(() => {
      sendCommand(createPdfWebBridgeCommand('SET_DISPLAY_MODE', { displayMode }));
    }, [displayMode, sendCommand]);

    useEffect(() => {
      sendCommand(createPdfWebBridgeCommand('SET_PAGE', { page: initialPage }));
    }, [initialPage, sendCommand]);

    useEffect(() => () => {
      openGenerationRef.current += 1;
      if (runtimeReadyRef.current) injectCommand(createPdfWebBridgeCommand('CLOSE_BOOK', {}));
      pendingCommandsRef.current = [];
      rangeQueueRef.current = [];
      runtimeReadyRef.current = false;
    }, [injectCommand]);

    const handleNavigationRequest = useCallback((request: { url: string }) => {
      const { url } = request;
      if (
        url === 'about:blank'
        || url.startsWith(RUNTIME_ORIGIN)
        || url.startsWith('blob:')
        || url.startsWith('data:')
      ) return true;
      if (/^(https?:|mailto:|tel:)/i.test(url)) onExternalLink?.(url);
      return false;
    }, [onExternalLink]);

    return (
      <View style={{ backgroundColor: theme.bg, flex: 1 }}>
        <WebView
          ref={webviewRef}
          androidLayerType={PDF_WEB_ANDROID_LAYER_TYPE}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          cacheEnabled={false}
          domStorageEnabled={false}
          incognito
          javaScriptCanOpenWindowsAutomatically={false}
          javaScriptEnabled
          mixedContentMode="never"
          onError={(event) => onError(new Error(event.nativeEvent.description || 'PDF WebView failed.'))}
          onLoad={() => pdfDevLog('web:runtime-html-loaded', {
            androidLayerType: PDF_WEB_ANDROID_LAYER_TYPE,
          })}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleNavigationRequest}
          originWhitelist={['*']}
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          source={source}
          style={{ backgroundColor: '#00000000', flex: 1 }}
        />
      </View>
    );
  },
));
