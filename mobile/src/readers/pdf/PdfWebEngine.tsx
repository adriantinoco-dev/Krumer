import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, View } from 'react-native';
import { File, FileMode } from 'expo-file-system';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType, WebViewMessageEvent } from 'react-native-webview';
import { useApp } from '../../context/AppContext';
import { PDF_DEFAULTS, type PdfEngineHandle, type PdfDisplayMode, type PdfPageSize } from '../PdfReader.types';
import { describePdfSource, pdfDevLog, pdfDevMetric, pdfDevWarn } from './pdfDebug';
import { getCachedPdfWebRuntimeUri, preparePdfWebRuntime } from './pdfWebRuntimeAsset';
import {
  createPdfWebBridgeCommand,
  PDF_WEB_BRIDGE_QUEUE_LIMIT,
  parsePdfWebBridgeEvent,
  type PdfWebBridgeCommand,
  type PdfWebRuntimeMetrics,
} from './pdfWebBridge';
const RUNTIME_READY_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT_RANGES = 2;
const MAX_PENDING_RANGES = 24;
const MAX_RANGE_BYTES = 1024 * 1024;
// The Android WebView route carries ranges as a local file URL query. Keep
// the bridge fallback available for older builds or devices where that route
// is unavailable; setting the env var to 0 is an emergency opt-out.
const PDF_WEB_BINARY_RANGE_ENABLED = Platform.OS === 'android'
  && process.env.EXPO_PUBLIC_PDF_WEBVIEW_BINARY_RANGE !== '0';
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
  resolvedUri: string | null;
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

function createPdfRangeUrl(uri: string): string {
  const hashIndex = uri.indexOf('#');
  const fragment = hashIndex >= 0 ? uri.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? uri.slice(0, hashIndex) : uri;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}krumerRange=1${fragment}`;
}

async function readPdfRange(handle: ReturnType<File['open']>, begin: number, end: number): Promise<string> {
  const length = end - begin;
  if (length <= 0 || length > MAX_RANGE_BYTES) throw new Error('Invalid PDF byte range.');
  handle.offset = begin;
  return bytesToBase64(handle.readBytes(length));
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
    const activeFileRef = useRef<{
      handle: ReturnType<File['open']>;
      uri: string;
    } | null>(null);
    const currentPageRef = useRef(initialPage);
    const totalPagesRef = useRef(0);
    const runtimeStartedAtRef = useRef(Date.now());
    const bookOpenedRef = useRef(false);
    const [binaryRangeDisabled, setBinaryRangeDisabled] = useState(false);
    const [runtimeUri, setRuntimeUri] = useState(getCachedPdfWebRuntimeUri);
    const source = useMemo(() => (runtimeUri ? { uri: runtimeUri } : null), [runtimeUri]);

    const postCommand = useCallback((command: PdfWebBridgeCommand) => {
      webviewRef.current?.postMessage(JSON.stringify(command));
    }, []);

    const sendCommand = useCallback((command: PdfWebBridgeCommand) => {
      if (runtimeReadyRef.current) {
        postCommand(command);
        return;
      }
      if (pendingCommandsRef.current.length >= PDF_WEB_BRIDGE_QUEUE_LIMIT) {
        onError(new Error('PDF runtime command queue is full.'));
        return;
      }
      pendingCommandsRef.current.push(command);
    }, [onError, postCommand]);

    const flushPendingCommands = useCallback(() => {
      const commands = pendingCommandsRef.current.splice(0, PDF_WEB_BRIDGE_QUEUE_LIMIT);
      commands.forEach(postCommand);
    }, [postCommand]);

    const closeActiveFile = useCallback(() => {
      const activeFile = activeFileRef.current;
      activeFileRef.current = null;
      try {
        activeFile?.handle.close();
      } catch {
        // Closing is idempotent from the reader's point of view.
      }
    }, []);

    const drainRangeQueue = useCallback(() => {
      while (activeRangeCountRef.current < MAX_CONCURRENT_RANGES && rangeQueueRef.current.length) {
        const request = rangeQueueRef.current.shift();
        if (!request) break;
        const activeFile = activeFileRef.current;
        if (!activeFile || activeFile.uri !== request.bookId) continue;
        activeRangeCountRef.current += 1;
        void readPdfRange(activeFile.handle, request.begin, request.end)
          .then((dataBase64) => {
            if (request.generation !== openGenerationRef.current) return;
            postCommand(createPdfWebBridgeCommand('READ_RANGE_RESULT', {
              bookId: request.bookId,
              dataBase64,
              requestId: request.requestId,
            }));
          })
          .catch((error: unknown) => {
            if (request.generation !== openGenerationRef.current) return;
            postCommand(createPdfWebBridgeCommand('READ_RANGE_RESULT', {
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
    }, [postCommand]);

    const handleMessage = useCallback((event: WebViewMessageEvent) => {
      const message = parsePdfWebBridgeEvent(event.nativeEvent.data);
      if (!message) {
        pdfDevWarn('web:invalid-message');
        return;
      }

      if (message.type === 'READY') {
        if (runtimeReadyRef.current) return;
        runtimeReadyRef.current = true;
        if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
        pdfDevMetric('web:runtime-ready', {
          elapsedMs: Date.now() - runtimeStartedAtRef.current,
          engine: 'webview',
        });
        flushPendingCommands();
        return;
      }
      if (message.type === 'READ_RANGE') {
        if (message.payload.bookId !== resolvedUri) return;
        if (rangeQueueRef.current.length + activeRangeCountRef.current >= MAX_PENDING_RANGES) {
          postCommand(createPdfWebBridgeCommand('READ_RANGE_RESULT', {
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
        bookOpenedRef.current = true;
        currentPageRef.current = message.payload.page;
        totalPagesRef.current = message.payload.totalPages;
        onLoadComplete(message.payload.totalPages, message.payload.bookId, {
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
      if (message.type === 'VOLUME_SCROLL_METRICS') {
        pdfDevMetric('web:volume-scroll', {
          engine: 'webview',
          ...message.payload,
          slowFrameRatio: message.payload.frames
            ? message.payload.slowFrames / message.payload.frames
            : 0,
        });
        return;
      }
      if (message.type === 'PERFORMANCE_METRIC') {
        pdfDevMetric(`web:${message.payload.stage}`, {
          engine: 'webview',
          ...message.payload,
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
        if (
          message.payload.code === 'OPEN_FAILED'
          && !bookOpenedRef.current
          && PDF_WEB_BINARY_RANGE_ENABLED
          && !binaryRangeDisabled
        ) {
          // A local file route can return a response with the right length but
          // unusable bytes on some WebView builds. Retry the same document once
          // through the proven bridge path before surfacing an open failure.
          pdfDevWarn('web:binary-range-retry-bridge', { detail });
          setBinaryRangeDisabled(true);
          return;
        }
        onError(new Error(detail));
      }
    }, [binaryRangeDisabled, drainRangeQueue, flushPendingCommands, onError, onExternalLink, onLoadComplete, onLoadProgress, onPageChanged, onScaleChanged, onSingleTap, postCommand, resolvedUri]);

    useImperativeHandle(ref, () => ({
      scrollByViewport: (fraction, repeat = false) => {
        sendCommand(createPdfWebBridgeCommand('SCROLL_BY_VIEWPORT', { fraction, repeat }));
      },
      stopViewportScroll: () => {
        sendCommand(createPdfWebBridgeCommand('STOP_VIEWPORT_SCROLL', {}));
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
      runtimeStartedAtRef.current = Date.now();
      let cancelled = false;
      void preparePdfWebRuntime()
        .then((uri) => {
          if (!cancelled) setRuntimeUri(uri);
        })
        .catch(onError);
      return () => {
        cancelled = true;
      };
    }, [onError]);

    useEffect(() => {
      if (!runtimeUri) return undefined;
      const timer = setTimeout(() => {
        if (!runtimeReadyRef.current) onError(new Error('PDF WebView runtime did not become ready.'));
      }, RUNTIME_READY_TIMEOUT_MS);
      readyTimerRef.current = timer;
      return () => clearTimeout(timer);
    }, [onError, runtimeUri]);

    useEffect(() => {
      if (!resolvedUri) return undefined;
      const generation = openGenerationRef.current + 1;
      openGenerationRef.current = generation;
      bookOpenedRef.current = false;
      rangeQueueRef.current = [];
      pendingCommandsRef.current = pendingCommandsRef.current.filter((command) => command.type !== 'OPEN_BOOK');
      if (runtimeReadyRef.current) sendCommand(createPdfWebBridgeCommand('CLOSE_BOOK', {}));
      closeActiveFile();

      let byteLength = Math.max(0, Math.trunc(fileSize ?? 0));
      try {
        const file = new File(resolvedUri);
        byteLength = file.size || byteLength;
        activeFileRef.current = {
          handle: file.open(FileMode.ReadOnly),
          uri: resolvedUri,
        };
      } catch (error) {
        closeActiveFile();
        onError(error);
        return undefined;
      }
      if (!byteLength) byteLength = 0;
      sendCommand(createPdfWebBridgeCommand('OPEN_BOOK', {
        bookId: resolvedUri,
        byteLength,
        displayMode,
        initialPage,
        rangeUrl: PDF_WEB_BINARY_RANGE_ENABLED && !binaryRangeDisabled
          ? createPdfRangeUrl(resolvedUri)
          : undefined,
        scale,
      }));
      pdfDevLog('web:open-request', {
        binaryRange: PDF_WEB_BINARY_RANGE_ENABLED && !binaryRangeDisabled,
        displayMode,
        page: initialPage,
        scale,
        source: describePdfSource(resolvedUri),
      });
      return () => {
        if (openGenerationRef.current === generation) {
          pendingCommandsRef.current = pendingCommandsRef.current.filter((command) => command.type !== 'OPEN_BOOK');
          closeActiveFile();
        }
      };
    }, [binaryRangeDisabled, closeActiveFile, fileSize, onError, resolvedUri, sendCommand]);

    useEffect(() => {
      sendCommand(createPdfWebBridgeCommand('SET_DISPLAY_MODE', { displayMode }));
    }, [displayMode, sendCommand]);

    useEffect(() => {
      sendCommand(createPdfWebBridgeCommand('SET_PAGE', { page: initialPage }));
    }, [initialPage, sendCommand]);

    useEffect(() => () => {
      openGenerationRef.current += 1;
      if (runtimeReadyRef.current) postCommand(createPdfWebBridgeCommand('CLOSE_BOOK', {}));
      closeActiveFile();
      pendingCommandsRef.current = [];
      rangeQueueRef.current = [];
      runtimeReadyRef.current = false;
    }, [closeActiveFile, postCommand]);

    const handleNavigationRequest = useCallback((request: { url: string }) => {
      const { url } = request;
      if (
        url === 'about:blank'
        || (runtimeUri !== null && url.startsWith(runtimeUri))
        || url.startsWith('blob:')
        || url.startsWith('data:')
      ) return true;
      if (/^(https?:|mailto:|tel:)/i.test(url)) onExternalLink?.(url);
      return false;
    }, [onExternalLink, runtimeUri]);

    if (!source) return <View style={{ backgroundColor: theme.bg, flex: 1 }} />;

    return (
      <View style={{ backgroundColor: theme.bg, flex: 1 }}>
        <WebView
          ref={webviewRef}
          androidLayerType={PDF_WEB_ANDROID_LAYER_TYPE}
          allowFileAccess
          allowFileAccessFromFileURLs={PDF_WEB_BINARY_RANGE_ENABLED}
          allowUniversalAccessFromFileURLs={false}
          cacheEnabled
          domStorageEnabled={false}
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
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          setSupportMultipleWindows={false}
          source={source}
          style={{ backgroundColor: '#00000000', flex: 1 }}
        />
      </View>
    );
  },
));
