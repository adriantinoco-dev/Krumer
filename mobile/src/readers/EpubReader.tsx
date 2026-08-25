import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';
import {
  EPUB_BRIDGE_QUEUE_LIMIT,
  createEpubBridgeCommand,
  parseEpubBridgeEvent,
  type EpubBridgeCommand,
} from './epubBridge';
import { EpubFileError, prepareEpubFile, type PreparedEpub } from './epubFile';
import { EPUB_RUNTIME_HANDSHAKE_SCRIPT, EPUB_RUNTIME_HTML } from './epubRuntime';

const RUNTIME_ORIGIN = 'https://krumer.local/';
const RUNTIME_READY_TIMEOUT_MS = 12_000;

export type EpubReaderHandle = {
  next: () => void;
  previous: () => void;
};

type EpubReaderProps = {
  bookId: string;
  filePath: string;
  fileSize?: number;
  onExternalLink?: (url: string) => void;
};

export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(function EpubReader(
  { bookId, filePath, fileSize, onExternalLink },
  forwardedRef,
) {
  const { theme } = useApp();
  const webviewRef = useRef<WebViewType>(null);
  const runtimeReadyRef = useRef(false);
  const bookOpenedRef = useRef(false);
  const pendingCommandsRef = useRef<EpubBridgeCommand[]>([]);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prepared, setPrepared] = useState<PreparedEpub | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const source = useMemo(() => ({ html: EPUB_RUNTIME_HTML, baseUrl: RUNTIME_ORIGIN }), []);

  const injectCommand = useCallback((command: EpubBridgeCommand) => {
    const serialized = JSON.stringify(command);
    const safeArgument = JSON.stringify(serialized);
    webviewRef.current?.injectJavaScript(
      `window.KrumerEpubBridge && window.KrumerEpubBridge.receive(${safeArgument}); true;`,
    );
  }, []);

  const sendCommand = useCallback((command: EpubBridgeCommand) => {
    if (runtimeReadyRef.current) {
      injectCommand(command);
      return;
    }

    if (pendingCommandsRef.current.length >= EPUB_BRIDGE_QUEUE_LIMIT) {
      setLoading(false);
      setError('O leitor EPUB nao respondeu durante a inicializacao.');
      return;
    }
    pendingCommandsRef.current.push(command);
  }, [injectCommand]);

  const flushPendingCommands = useCallback(() => {
    const commands = pendingCommandsRef.current.splice(0, EPUB_BRIDGE_QUEUE_LIMIT);
    commands.forEach(injectCommand);
  }, [injectCommand]);

  useImperativeHandle(forwardedRef, () => ({
    next: () => {
      if (bookOpenedRef.current) sendCommand(createEpubBridgeCommand('NEXT', {}));
    },
    previous: () => {
      if (bookOpenedRef.current) sendCommand(createEpubBridgeCommand('PREVIOUS', {}));
    },
  }), [sendCommand]);

  useEffect(() => {
    let cancelled = false;
    pendingCommandsRef.current = pendingCommandsRef.current.filter((command) => command.type !== 'OPEN_BOOK');
    if (bookOpenedRef.current && runtimeReadyRef.current) {
      injectCommand(createEpubBridgeCommand('CLOSE_BOOK', {}));
    }
    bookOpenedRef.current = false;
    setPrepared(null);
    setPreparing(true);
    setLoading(true);
    setError(null);

    prepareEpubFile(filePath, fileSize)
      .then((result) => {
        if (!cancelled) setPrepared(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const message = caught instanceof EpubFileError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : String(caught);
        setLoading(false);
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, fileSize, injectCommand]);

  useEffect(() => {
    if (!prepared) return;
    sendCommand(createEpubBridgeCommand('OPEN_BOOK', {
      bookId,
      byteLength: prepared.byteLength,
      dataBase64: prepared.base64,
    }));
  }, [bookId, prepared, sendCommand]);

  useEffect(() => () => {
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (runtimeReadyRef.current) {
      injectCommand(createEpubBridgeCommand('CLOSE_BOOK', {}));
    }
    pendingCommandsRef.current = [];
    runtimeReadyRef.current = false;
    bookOpenedRef.current = false;
  }, [injectCommand]);

  const armRuntimeReadyTimeout = useCallback(() => {
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    readyTimerRef.current = setTimeout(() => {
      if (runtimeReadyRef.current) return;
      pendingCommandsRef.current = [];
      setLoading(false);
      setError('O runtime EPUB nao ficou pronto no tempo esperado.');
    }, RUNTIME_READY_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    armRuntimeReadyTimeout();
    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [armRuntimeReadyTimeout]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    const message = parseEpubBridgeEvent(event.nativeEvent.data);
    if (!message) {
      console.warn('[Krumer EpubReader] mensagem de bridge descartada');
      return;
    }

    if (message.type === 'READY') {
      runtimeReadyRef.current = true;
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      flushPendingCommands();
      return;
    }

    if (message.type === 'BOOK_OPENED') {
      if (message.payload.bookId !== bookId) return;
      bookOpenedRef.current = true;
      setError(null);
      setLoading(false);
      return;
    }

    if (message.type === 'LINK_PRESSED') {
      if (/^(https?:|mailto:|tel:)/i.test(message.payload.url)) {
        onExternalLink?.(message.payload.url);
      }
      return;
    }

    console.warn('[Krumer EpubReader] runtime error', message.payload.code, message.payload.message);
    setLoading(false);
    setError(message.payload.message || 'Falha ao abrir EPUB.');
  }, [bookId, flushPendingCommands, onExternalLink]);

  const handleNavigationRequest = useCallback((request: { url: string }) => {
    const { url } = request;
    if (
      url === 'about:blank'
      || url.startsWith(RUNTIME_ORIGIN)
      || url.startsWith('blob:')
      || url.startsWith('data:')
    ) {
      return true;
    }

    if (/^(https?:|mailto:|tel:)/i.test(url)) onExternalLink?.(url);
    return false;
  }, [onExternalLink]);

  if (error) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.bg, flex: 1, justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg, borderWidth: 1, gap: spacing.sm, maxWidth: 360, padding: spacing.lg, width: '100%' }}>
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            Falha ao abrir EPUB
          </Text>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
            {error}
          </Text>
          <Text selectable style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 10, textAlign: 'center' }}>
            {filePath}
          </Text>
        </View>
      </View>
    );
  }

  if (preparing) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: '#ffffff', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" size="large" />
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: '#ffffff', flex: 1 }}>
      {loading ? (
        <View style={{ alignItems: 'center', backgroundColor: '#ffffff', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 }}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      ) : null}
      <WebView
        ref={webviewRef}
        source={source}
        injectedJavaScript={EPUB_RUNTIME_HANDSHAKE_SCRIPT}
        onLoad={() => console.info('[Krumer EpubReader] runtime HTML carregado')}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleNavigationRequest}
        originWhitelist={['*']}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        cacheEnabled={false}
        domStorageEnabled={false}
        incognito
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mixedContentMode="never"
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        style={{ backgroundColor: '#ffffff', flex: 1, opacity: loading ? 0 : 1 }}
        onError={(event) => {
          console.warn('[Krumer EpubReader] WebView error', event.nativeEvent);
          setLoading(false);
          setError('A WebView do leitor EPUB nao pode ser carregada.');
        }}
      />
    </View>
  );
});
