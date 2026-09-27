import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
import { loadEpubFontFaces } from './readerFonts';
import { EPUB_RUNTIME_HANDSHAKE_SCRIPT, EPUB_RUNTIME_HTML } from './epubRuntime';
import { subscribeToEpubVolumeKeys } from './epubVolumeKeys';
import { listReaderEpubHighlights, saveReaderEpubHighlight } from '../storage/readerDatabase';

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
  barsVisible?: boolean;
  bookId: string;
  filePath: string;
  fileSize?: number;
  fontSize?: number;
  initialLocator?: EpubLocator | null;
  lineHeight?: number;
  marginHorizontal?: number;
  onCenterTap?: () => void;
  onExternalLink?: (url: string) => void;
  onPositionStabilized?: (locator: EpubLocator, source: 'restore' | 'reflow') => void;
  onRelocate?: (locator: EpubLocator, source: EpubRelocationSource) => void;
  onViewStatus?: (status: EpubViewStatus) => void;
  readOnly?: boolean;
  readingPreferences?: ReadingPreferences;
  useBookMargins?: boolean;
};

export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(function EpubReader(
  {
    barsVisible = false,
    bookId,
    filePath,
    fileSize,
    fontSize = 18,
    initialLocator,
    lineHeight = 1.5,
    marginHorizontal = 20,
    onCenterTap,
    onExternalLink,
    onPositionStabilized,
    onRelocate,
    onViewStatus,
    readOnly = false,
    readingPreferences = DEFAULT_READING_PREFERENCES,
    useBookMargins = true,
  },
  forwardedRef,
) {
  const { preferences, theme, t } = useApp();
  const currentBookIdRef = useRef(bookId);
  currentBookIdRef.current = bookId;
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
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; cfiRange: string | null; gestureId: number } | null>(null);
  const lastAutomaticGestureRef = useRef(-1);
  const highlightQueueRef = useRef<Promise<void>>(Promise.resolve());
  const source = useMemo(() => ({ html: EPUB_RUNTIME_HTML, baseUrl: RUNTIME_ORIGIN }), []);
  const appearance = useMemo<EpubAppearance>(() => {
    const appearancePreferences = {
      displayMode: readingPreferences.displayMode,
      doubleColumn: readingPreferences.doubleColumn,
      orientation: readingPreferences.orientation,
      fontFamily: readingPreferences.fontFamily,
      fontWeight: readingPreferences.fontWeight,
    };
    if (theme.name === 'dark') {
      return {
        ...appearancePreferences,
        fontSize,
        lineHeight,
        marginHorizontal,
        useBookMargins,
        visualTheme: { backgroundColor: '#202020', linkColor: '#f59a5a', textColor: '#e7e7e7' },
      };
    }
    if (theme.name === 'sepia') {
      return {
        ...appearancePreferences,
        fontSize,
        lineHeight,
        marginHorizontal,
        useBookMargins,
        visualTheme: { backgroundColor: '#f4ecd8', linkColor: '#a94f12', textColor: '#3b2f1e' },
      };
    }
    return {
      ...appearancePreferences,
      fontSize,
      lineHeight,
      marginHorizontal,
      useBookMargins,
      visualTheme: { backgroundColor: '#ffffff', linkColor: '#c2570a', textColor: '#222222' },
    };
  }, [fontSize, lineHeight, marginHorizontal, readingPreferences.displayMode,
    readingPreferences.doubleColumn, readingPreferences.orientation,
    readingPreferences.fontFamily, readingPreferences.fontWeight, theme.name, useBookMargins]);
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
      setError(t('reader.epubRuntimeNotReady'));
      return;
    }
    pendingCommandsRef.current.push(command);
  }, [injectCommand, t]);

  const refreshHighlights = useCallback(async () => {
    const highlights = await listReaderEpubHighlights(bookId);
    if (!bookOpenedRef.current || currentBookIdRef.current !== bookId) return;
    sendCommand(createEpubBridgeCommand('SET_HIGHLIGHTS', {
      highlights: highlights.map(({ cfiRange, color }) => ({ cfiRange, color })),
    }));
  }, [bookId, sendCommand]);

  const performSelectionAction = useCallback(async (
    action: 'copy' | 'highlight',
    value: { text: string; cfiRange: string | null },
  ) => {
    try {
      if (action === 'copy') {
        await Clipboard.setStringAsync(value.text);
      } else if (value.cfiRange) {
        const cfiRange = value.cfiRange;
        const queued = highlightQueueRef.current.then(async () => {
          await saveReaderEpubHighlight(bookId, cfiRange, value.text, 'yellow');
          if (bookOpenedRef.current && currentBookIdRef.current === bookId) {
            sendCommand(createEpubBridgeCommand('UPSERT_HIGHLIGHT', { cfiRange, color: 'yellow' }));
          }
        });
        highlightQueueRef.current = queued.catch(() => undefined);
        await queued;
      }
    } catch (caught) {
      console.warn('[Krumer EpubReader] selection action failed', caught);
    }
  }, [bookId, sendCommand]);

  const registerFontFamily = useCallback((family: ReadingPreferences['fontFamily']) => {
    if (registeredFontFamiliesRef.current.has(family)) return Promise.resolve();
    const inFlight = fontRegistrationPromisesRef.current.get(family);
    if (inFlight) return inFlight;

    const registration = loadEpubFontFaces(family).then((faces) => new Promise<void>((resolve, reject) => {
      const command = createEpubBridgeCommand('REGISTER_FONT_FACES', { family, faces });
      const timer = setTimeout(() => {
        pendingFontRequestsRef.current.delete(command.id);
        reject(new Error(t('reader.epubFontRegistrationTimeout').replace('{0}', family)));
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
  }, [sendCommand, t]);

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

  useEffect(() => {
    if (readOnly) return undefined;
    return subscribeToEpubVolumeKeys((direction) => {
    if (!bookOpenedRef.current) return;
    sendCommand(createEpubBridgeCommand(direction === 'next' ? 'NEXT' : 'PREVIOUS', {}));
    });
  }, [readOnly, sendCommand]);

  useEffect(() => {
    if (bookOpenedRef.current) return;
    void registerFontFamily(appearance.fontFamily).catch(() => undefined);
  }, [appearance.fontFamily, registerFontFamily]);

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
    setLoading(true);
    setLoadProgress(0);
    setError(null);
    setSelection(null);
    lastAutomaticGestureRef.current = -1;

    prepareEpubFile(filePath, fileSize, preferences.language)
      .then((result) => {
        if (!cancelled) {
          setPrepared(result);
          setLoadProgress((current) => Math.max(current, 0.45));
        }
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
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, fileSize, injectCommand, preferences.language, t]);

  useEffect(() => {
    if (!prepared) return;
    const openGeneration = openGenerationRef.current + 1;
    openGenerationRef.current = openGeneration;
    pendingCommandsRef.current = pendingCommandsRef.current.filter((command) => command.type !== 'OPEN_BOOK');
    const initialFontFamily = appearanceRef.current.fontFamily;
    void registerFontFamily(initialFontFamily).then(() => {
      if (openGeneration !== openGenerationRef.current) return;
      setLoadProgress((current) => Math.max(current, 0.75));
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
      setError(caught instanceof Error ? caught.message : t('reader.epubFontLoadFailed'));
    });
  }, [bookId, initialLocator, prepared, registerFontFamily, sendCommand, t]);

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
      pending.reject(new Error(t('reader.epubClosedBeforeFonts')));
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
  }, [injectCommand, t]);

  const armRuntimeReadyTimeout = useCallback(() => {
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    readyTimerRef.current = setTimeout(() => {
      if (runtimeReadyRef.current) return;
      pendingCommandsRef.current = [];
      setLoading(false);
      setError(t('reader.epubRuntimeNotReady'));
    }, RUNTIME_READY_TIMEOUT_MS);
  }, [t]);

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
      setLoadProgress((current) => Math.max(current, 0.25));
      return;
    }

    if (message.type === 'BOOK_OPENED') {
      if (message.payload.bookId !== bookId) return;
      bookOpenedRef.current = true;
      setError(null);
      setLoadProgress(1);
      setLoading(false);
      if (!readOnly) void refreshHighlights().catch((caught) => {
        console.warn('[Krumer EpubReader] failed to load highlights', caught);
      });
      return;
    }

    if (message.type === 'SELECTION_CLEARED') {
      setSelection(null);
      return;
    }

    if (message.type === 'SELECTION_READY') {
      if (readOnly) return;
      setSelection(message.payload);
      const action = readingPreferences.selectionQuickAction;
      if (action !== 'off'
        && (action === 'copy' || message.payload.cfiRange)
        && lastAutomaticGestureRef.current !== message.payload.gestureId) {
        lastAutomaticGestureRef.current = message.payload.gestureId;
        void performSelectionAction(action, message.payload);
      }
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

    if (message.type === 'SELECTION_BOUNDS_STATUS') {
      if (__DEV__) console.info('[Krumer EPUB] limite de selecao paginada', message.payload);
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
    setError(message.payload.message || t('reader.epubOpenFailed'));
  }, [bookId, flushPendingCommands, onCenterTap, onExternalLink, onPositionStabilized,
    onRelocate, onViewStatus, performSelectionAction, readOnly, readingPreferences.selectionQuickAction,
    refreshHighlights, t]);

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
            {t('reader.epubOpenFailed')}
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

  return (
    <View style={{ backgroundColor: visualTheme.backgroundColor, flex: 1 }}>
      {loading ? (
        <View style={{ alignItems: 'center', backgroundColor: visualTheme.backgroundColor, bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 }}>
          <ActivityIndicator color="#f97316" size="large" />
          <Text
            accessibilityRole="progressbar"
            accessibilityValue={{ max: 100, min: 0, now: Math.round(loadProgress * 100) }}
            style={{ color: visualTheme.textColor, fontFamily: serifFont, fontSize: 12, marginTop: spacing.sm }}
          >
            Carregando EPUB... {Math.round(loadProgress * 100)}%
          </Text>
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
        pointerEvents={readOnly ? 'none' : 'auto'}
        style={{ backgroundColor: '#00000000', flex: 1, opacity: loading ? 0 : 1 }}
        onError={(event) => {
          console.warn('[Krumer EpubReader] WebView error', event.nativeEvent);
          setLoading(false);
          setError(t('reader.epubWebViewUnavailable'));
        }}
      />
      {!readOnly && !loading && selection ? (
        <View pointerEvents="box-none" style={{ alignItems: 'center', bottom: barsVisible ? 88 : spacing.md, elevation: 2, left: 0, position: 'absolute', right: 0, zIndex: 2 }}>
          <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => { void performSelectionAction('copy', selection); }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm })}
            >
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14 }}>{t('reader.selectionCopy')}</Text>
            </Pressable>
            <View style={{ backgroundColor: theme.border, width: 1 }} />
            <Pressable
              accessibilityRole="button"
              disabled={!selection.cfiRange}
              onPress={() => { void performSelectionAction('highlight', selection); }}
              style={({ pressed }) => ({ opacity: !selection.cfiRange ? 0.4 : pressed ? 0.6 : 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm })}
            >
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14 }}>{t('reader.selectionHighlight')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
});
