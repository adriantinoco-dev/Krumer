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
import type { EpubLocator } from '../models/reader';
import { DEFAULT_READING_PREFERENCES, type ReadingPreferences } from '../models/readingPreferences';
import { radii, serifFont, spacing } from '../theme';
import {
  EPUB_BRIDGE_QUEUE_LIMIT,
  createEpubBridgeCommand,
  parseEpubBridgeEvent,
  type EpubAppearance,
  type EpubBridgeCommand,
  type EpubRelocationSource,
  type EpubTocItem,
  type EpubViewStatus,
} from './epubBridge';
import { EpubFileError, prepareEpubFile, type PreparedEpub } from './epubFile';
import { loadEpubFontFaces, useReaderFonts } from './readerFonts';
import { EPUB_RUNTIME_HANDSHAKE_SCRIPT, EPUB_RUNTIME_HTML } from './epubRuntime';
import { subscribeToEpubVolumeKeys } from './epubVolumeKeys';

const RUNTIME_ORIGIN = 'https://krumer.local/';
const RUNTIME_READY_TIMEOUT_MS = 12_000;
const LOCATOR_REQUEST_TIMEOUT_MS = 1_000;
const TOC_REQUEST_TIMEOUT_MS = 2_000;
const FONT_REGISTRATION_TIMEOUT_MS = 5_000;

export type EpubReaderHandle = {
  getCurrentLocator: () => Promise<EpubLocator | null>;
  getToc: () => Promise<EpubTocItem[] | null>;
  goToHref: (href: string) => void;
  goToLocator: (locator: EpubLocator) => void;
  next: () => void;
  previous: () => void;
};

type EpubReaderProps = {
  bookId: string;
  filePath: string;
  fileSize?: number;
  fontSize?: number;
  initialLocator?: EpubLocator | null;
  lineHeight?: number;
  onCenterTap?: () => void;
  onExternalLink?: (url: string) => void;
  onPositionStabilized?: (locator: EpubLocator, source: 'restore' | 'reflow') => void;
  onRelocate?: (locator: EpubLocator, source: EpubRelocationSource) => void;
  onViewStatus?: (status: EpubViewStatus) => void;
  readingPreferences?: ReadingPreferences;
};

export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(function EpubReader(
  {
    bookId,
    filePath,
    fileSize,
    fontSize = 18,
    initialLocator,
    lineHeight = 1.5,
    onCenterTap,
    onExternalLink,
    onPositionStabilized,
    onRelocate,
    onViewStatus,
    readingPreferences = DEFAULT_READING_PREFERENCES,
  },
  forwardedRef,
) {
  const { theme } = useApp();
  const readerFonts = useReaderFonts();
  const webviewRef = useRef<WebViewType>(null);
  const runtimeReadyRef = useRef(false);
  const bookOpenedRef = useRef(false);
  const pendingCommandsRef = useRef<EpubBridgeCommand[]>([]);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontRegistrationPromisesRef = useRef(new Map<ReadingPreferences['fontFamily'], Promise<void>>());
  const pendingFontRequestsRef = useRef(new Map<string, {
    reject: (error: Error) => void;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  }>());
  const pendingLocatorRequestsRef = useRef(new Map<string, {
    resolve: (locator: EpubLocator | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }>());
  const pendingTocRequestsRef = useRef(new Map<string, {
    resolve: (toc: EpubTocItem[] | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }>());
  const registeredFontFamiliesRef = useRef(new Set<ReadingPreferences['fontFamily']>());
  const openGenerationRef = useRef(0);
  const appearanceGenerationRef = useRef(0);
  const [prepared, setPrepared] = useState<PreparedEpub | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const source = useMemo(() => ({ html: EPUB_RUNTIME_HTML, baseUrl: RUNTIME_ORIGIN }), []);
  const appearance = useMemo<EpubAppearance>(() => {
    if (theme.name === 'dark') {
      return {
        ...readingPreferences,
        fontSize,
        lineHeight,
        visualTheme: { backgroundColor: '#202020', linkColor: '#f59a5a', textColor: '#e7e7e7' },
      };
    }
    if (theme.name === 'sepia') {
      return {
        ...readingPreferences,
        fontSize,
        lineHeight,
        visualTheme: { backgroundColor: '#f4ecd8', linkColor: '#a94f12', textColor: '#3b2f1e' },
      };
    }
    return {
      ...readingPreferences,
      fontSize,
      lineHeight,
      visualTheme: { backgroundColor: '#ffffff', linkColor: '#c2570a', textColor: '#222222' },
    };
  }, [fontSize, lineHeight, readingPreferences, theme.name]);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const visualTheme = appearance.visualTheme;

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

  const registerFontFamily = useCallback((family: ReadingPreferences['fontFamily']) => {
    if (registeredFontFamiliesRef.current.has(family)) return Promise.resolve();
    const inFlight = fontRegistrationPromisesRef.current.get(family);
    if (inFlight) return inFlight;

    const registration = loadEpubFontFaces(family).then((faces) => new Promise<void>((resolve, reject) => {
      const command = createEpubBridgeCommand('REGISTER_FONT_FACES', { family, faces });
      const timer = setTimeout(() => {
        pendingFontRequestsRef.current.delete(command.id);
        reject(new Error(`Timeout ao registrar a familia ${family} no EPUB.`));
      }, FONT_REGISTRATION_TIMEOUT_MS);
      pendingFontRequestsRef.current.set(command.id, { reject, resolve, timer });
      sendCommand(command);
    })).then(() => {
      registeredFontFamiliesRef.current.add(family);
    }).finally(() => {
      fontRegistrationPromisesRef.current.delete(family);
    });
    fontRegistrationPromisesRef.current.set(family, registration);
    return registration;
  }, [sendCommand]);

  const flushPendingCommands = useCallback(() => {
    const commands = pendingCommandsRef.current.splice(0, EPUB_BRIDGE_QUEUE_LIMIT);
    commands.forEach(injectCommand);
  }, [injectCommand]);

  useImperativeHandle(forwardedRef, () => ({
    getCurrentLocator: () => {
      if (!bookOpenedRef.current) return Promise.resolve(null);
      const command = createEpubBridgeCommand('GET_CURRENT_LOCATOR', {});
      return new Promise<EpubLocator | null>((resolve) => {
        const timer = setTimeout(() => {
          pendingLocatorRequestsRef.current.delete(command.id);
          resolve(null);
        }, LOCATOR_REQUEST_TIMEOUT_MS);
        pendingLocatorRequestsRef.current.set(command.id, { resolve, timer });
        sendCommand(command);
      });
    },
    getToc: () => {
      if (!bookOpenedRef.current) return Promise.resolve(null);
      const command = createEpubBridgeCommand('GET_TOC', {});
      return new Promise<EpubTocItem[] | null>((resolve) => {
        const timer = setTimeout(() => {
          pendingTocRequestsRef.current.delete(command.id);
          resolve(null);
        }, TOC_REQUEST_TIMEOUT_MS);
        pendingTocRequestsRef.current.set(command.id, { resolve, timer });
        sendCommand(command);
      });
    },
    goToHref: (href) => {
      if (bookOpenedRef.current && href) {
        sendCommand(createEpubBridgeCommand('GO_TO_HREF', { href }));
      }
    },
    goToLocator: (locator) => {
      if (bookOpenedRef.current) {
        sendCommand(createEpubBridgeCommand('GO_TO_LOCATOR', { locator }));
      }
    },
    next: () => {
      if (bookOpenedRef.current) sendCommand(createEpubBridgeCommand('NEXT', {}));
    },
    previous: () => {
      if (bookOpenedRef.current) sendCommand(createEpubBridgeCommand('PREVIOUS', {}));
    },
  }), [sendCommand]);

  useEffect(() => subscribeToEpubVolumeKeys((direction) => {
    if (!bookOpenedRef.current) return;
    sendCommand(createEpubBridgeCommand(direction === 'next' ? 'NEXT' : 'PREVIOUS', {}));
  }), [sendCommand]);

  useEffect(() => {
    let cancelled = false;
    pendingCommandsRef.current = pendingCommandsRef.current.filter((command) => command.type !== 'OPEN_BOOK');
    if (bookOpenedRef.current && runtimeReadyRef.current) {
      injectCommand(createEpubBridgeCommand('CLOSE_BOOK', {}));
    }
    bookOpenedRef.current = false;
    openGenerationRef.current += 1;
    appearanceGenerationRef.current += 1;
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
    if (!prepared || !readerFonts.loaded) return;
    const openGeneration = openGenerationRef.current + 1;
    openGenerationRef.current = openGeneration;
    pendingCommandsRef.current = pendingCommandsRef.current.filter((command) => command.type !== 'OPEN_BOOK');
    const initialFontFamily = appearanceRef.current.fontFamily;
    void registerFontFamily(initialFontFamily).then(() => {
      if (openGeneration !== openGenerationRef.current) return;
      sendCommand(createEpubBridgeCommand('OPEN_BOOK', {
        bookId,
        byteLength: prepared.byteLength,
        dataBase64: prepared.base64,
        initialLocator,
        appearance: appearanceRef.current,
      }));
    }).catch((caught: unknown) => {
      if (openGeneration !== openGenerationRef.current) return;
      setLoading(false);
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar fontes do leitor EPUB.');
    });
  }, [bookId, initialLocator, prepared, readerFonts.loaded, registerFontFamily, sendCommand]);

  useEffect(() => {
    if (!bookOpenedRef.current) return;
    const appearanceGeneration = appearanceGenerationRef.current + 1;
    appearanceGenerationRef.current = appearanceGeneration;
    void registerFontFamily(appearance.fontFamily).then(() => {
      if (appearanceGeneration !== appearanceGenerationRef.current || !bookOpenedRef.current) return;
      sendCommand(createEpubBridgeCommand('SET_APPEARANCE', { appearance }));
    }).catch((caught: unknown) => {
      if (appearanceGeneration !== appearanceGenerationRef.current) return;
      console.warn('[Krumer EpubReader] falha ao aplicar fonte', caught);
    });
  }, [appearance, registerFontFamily, sendCommand]);

  useEffect(() => {
    if (!readerFonts.error) return;
    setLoading(false);
    setError(`Falha ao carregar fontes do leitor: ${readerFonts.error.message}`);
  }, [readerFonts.error]);

  useEffect(() => () => {
    openGenerationRef.current += 1;
    appearanceGenerationRef.current += 1;
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (runtimeReadyRef.current) {
      injectCommand(createEpubBridgeCommand('CLOSE_BOOK', {}));
    }
    pendingCommandsRef.current = [];
    pendingFontRequestsRef.current.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(new Error('O leitor EPUB foi fechado antes de registrar as fontes.'));
    });
    pendingFontRequestsRef.current.clear();
    pendingLocatorRequestsRef.current.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.resolve(null);
    });
    pendingLocatorRequestsRef.current.clear();
    pendingTocRequestsRef.current.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.resolve(null);
    });
    pendingTocRequestsRef.current.clear();
    fontRegistrationPromisesRef.current.clear();
    registeredFontFamiliesRef.current.clear();
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

    if (message.type === 'FONT_FACES_READY') {
      const pending = pendingFontRequestsRef.current.get(message.payload.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingFontRequestsRef.current.delete(message.payload.requestId);
      pending.resolve();
      return;
    }

    if (message.type === 'CURRENT_LOCATOR') {
      const pending = pendingLocatorRequestsRef.current.get(message.payload.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingLocatorRequestsRef.current.delete(message.payload.requestId);
      pending.resolve(message.payload.locator);
      return;
    }

    if (message.type === 'TOC') {
      const pending = pendingTocRequestsRef.current.get(message.payload.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingTocRequestsRef.current.delete(message.payload.requestId);
      pending.resolve(message.payload.toc);
      return;
    }

    if (message.type === 'LINK_PRESSED') {
      if (/^(https?:|mailto:|tel:)/i.test(message.payload.url)) {
        onExternalLink?.(message.payload.url);
      }
      return;
    }

    if (message.type === 'CENTER_TAP') {
      onCenterTap?.();
      return;
    }

    if (message.type === 'RELOCATE') {
      onRelocate?.(message.payload.locator, message.payload.source);
      return;
    }

    if (message.type === 'POSITION_STABILIZED') {
      onPositionStabilized?.(message.payload.locator, message.payload.source);
      return;
    }

    if (message.type === 'VIEW_STATUS') {
      onViewStatus?.(message.payload);
      return;
    }

    if (message.payload.requestId) {
      const pendingFont = pendingFontRequestsRef.current.get(message.payload.requestId);
      if (pendingFont) {
        clearTimeout(pendingFont.timer);
        pendingFontRequestsRef.current.delete(message.payload.requestId);
        pendingFont.reject(new Error(message.payload.message));
      }
      const pendingLocator = pendingLocatorRequestsRef.current.get(message.payload.requestId);
      if (pendingLocator) {
        clearTimeout(pendingLocator.timer);
        pendingLocatorRequestsRef.current.delete(message.payload.requestId);
        pendingLocator.resolve(null);
      }
      const pendingToc = pendingTocRequestsRef.current.get(message.payload.requestId);
      if (pendingToc) {
        clearTimeout(pendingToc.timer);
        pendingTocRequestsRef.current.delete(message.payload.requestId);
        pendingToc.resolve(null);
      }
    }
    console.warn('[Krumer EpubReader] runtime error', message.payload.code, message.payload.message);
    if (message.payload.code === 'LOCATOR_NOT_FOUND' || message.payload.code === 'INVALID_LOCATOR') return;
    setLoading(false);
    setError(message.payload.message || 'Falha ao abrir EPUB.');
  }, [bookId, flushPendingCommands, onCenterTap, onExternalLink, onPositionStabilized, onRelocate, onViewStatus]);

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

  if (preparing || !readerFonts.loaded) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: visualTheme.backgroundColor, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" size="large" />
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: visualTheme.backgroundColor, flex: 1 }}>
      {loading ? (
        <View style={{ alignItems: 'center', backgroundColor: visualTheme.backgroundColor, bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 }}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      ) : null}
      <WebView
        ref={webviewRef}
        androidLayerType="none"
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
        overScrollMode="never"
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        style={{ backgroundColor: '#00000000', flex: 1, opacity: loading ? 0 : 1 }}
        onError={(event) => {
          console.warn('[Krumer EpubReader] WebView error', event.nativeEvent);
          setLoading(false);
          setError('A WebView do leitor EPUB nao pode ser carregada.');
        }}
      />
    </View>
  );
});
