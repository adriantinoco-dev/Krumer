import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StatusBar, Text, TextInput, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Anchor, ArrowLeft, Bookmark, BookmarkPlus, Feather, ListTree, Settings, StickyNote, Sun, Trash2, X } from 'lucide-react-native';
import * as Brightness from 'expo-brightness';
import { ReadingSettingsButton } from '../components/ReadingSettingsButton';
import { ReadingSettingsModal } from '../components/ReadingSettingsModal';
import { LayoutSettingsButton } from '../components/LayoutSettingsButton';
import { LayoutSettingsModal } from '../components/LayoutSettingsModal';
import { PaginationSettingsButton } from '../components/PaginationSettingsButton';
import { PaginationSettingsModal } from '../components/PaginationSettingsModal';
import { ActionSheetModal } from '../components/ActionSheetModal';
import { EpubReader, type EpubReaderHandle } from '../readers/EpubReader';
import type { EpubRelocationSource, EpubTocItem, EpubViewStatus } from '../readers/epubBridge';
import { PdfReader } from '../readers/PdfReader';
import { useEpubPersistence } from '../readers/useEpubPersistence';
import { useEpubNotes } from '../readers/useEpubNotes';
import { useOrientation } from '../readers/useOrientation';
import { useReadingPreferences } from '../readers/useReadingPreferences';
import { useReaderLayoutSettings } from '../readers/useReaderLayoutSettings';
import { ThemeCard } from '../components/ThemeCard';
import { useApp } from '../context/AppContext';
import type { EpubLocator, ReaderNote } from '../models/reader';
import type { RootStackParamList } from '../navigation/types';
import { radii, serifFont, spacing, type ThemeName } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;
const FONT_SIZE_DEFAULT = 18;
const LINE_HEIGHT_MIN = 1.0;
const LINE_HEIGHT_MAX = 2.4;
const LINE_HEIGHT_DEFAULT = 1.5;
const HIDE_DELAY = 4000;
const EPUB_CONTENT_VERTICAL_OFFSET = 26;
const EPUB_CHROME_VERTICAL_SCALE = 0.6;
const READER_SETTINGS_KEY = 'krumer.reader.settings';

function scaleEpubChrome(value: number) {
  return Math.round(value * EPUB_CHROME_VERTICAL_SCALE);
}

type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
};

async function loadReaderSettings(): Promise<ReaderSettings> {
  const raw = await AsyncStorage.getItem(READER_SETTINGS_KEY);
  if (!raw) return { fontSize: FONT_SIZE_DEFAULT, lineHeight: LINE_HEIGHT_DEFAULT };
  return { fontSize: FONT_SIZE_DEFAULT, lineHeight: LINE_HEIGHT_DEFAULT, ...JSON.parse(raw) };
}

async function saveReaderSettings(settings: ReaderSettings) {
  await AsyncStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
}

export function ReaderScreen({ navigation, route }: Props) {
  const { book } = route.params;
  const isEpub = book.format === 'epub';
  const { preferences, setThemeName, theme, t, updateBookProgress } = useApp();
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const readingPreferences = useReadingPreferences(isEpub);
  const readerLayout = useReaderLayoutSettings(isEpub);
  const { isLandscape } = useOrientation(isEpub ? readingPreferences.preferences.orientation : 'portrait');
  const [progress, setProgress] = useState((book.progressPct ?? 0) / 100);
  const [savedPosition, setSavedPosition] = useState<string | null>(book.progress);
  const [barsVisible, setBarsVisible] = useState(book.format !== 'epub');
  const [bookmarksVisible, setBookmarksVisible] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [paginationSettingsVisible, setPaginationSettingsVisible] = useState(false);
  const [layoutSettingsVisible, setLayoutSettingsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(book.currentPage ?? 1);
  const [totalPages, setTotalPages] = useState(book.totalPages ?? 0);
  const [epubViewStatus, setEpubViewStatus] = useState<EpubViewStatus | null>(null);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>({
    fontSize: FONT_SIZE_DEFAULT,
    lineHeight: LINE_HEIGHT_DEFAULT,
  });
  const [tocVisible, setTocVisible] = useState(false);
  const [tocItems, setTocItems] = useState<EpubTocItem[] | null>(null);
  const [tocLoading, setTocLoading] = useState(false);
  const [brightnessVisible, setBrightnessVisible] = useState(false);
  const [brightness, setBrightnessState] = useState(0.7);
  const [brightnessSupported, setBrightnessSupported] = useState(true);
  const [notesVisible, setNotesVisible] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ReaderNote | null>(null);
  const [previewNote, setPreviewNote] = useState<ReaderNote | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const originalBrightnessRef = useRef<number | null>(null);
  const brightnessSupportedRef = useRef(true);
  const lastBrightnessApplyRef = useRef(0);
  const pendingBrightnessRef = useRef(0.7);
  const sliderWidthRef = useRef(0);
  const [trackWidthState, setTrackWidthState] = useState(300);
  const brightnessAnim = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(book.format === 'epub' ? 0 : 1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epubReaderRef = useRef<EpubReaderHandle>(null);
  const allowControlledCloseRef = useRef(false);
  const controlledCloseInFlightRef = useRef(false);
  const epubBackground = theme.name === 'dark' ? '#202020' : theme.name === 'sepia' ? '#f4ecd8' : '#ffffff';
  const epubText = theme.name === 'dark' ? '#e7e7e7' : theme.name === 'sepia' ? '#3b2f1e' : '#222222';
  const epubMuted = theme.name === 'dark' ? '#a2a2a2' : theme.name === 'sepia' ? '#796c52' : '#6f6f6f';
  const epubTopChrome = theme.name === 'dark' ? '#202020' : theme.name === 'sepia' ? '#f4ecd8' : '#ffffff';
  const epubContentVerticalInset = Math.max(insets.top, insets.bottom, 0) + EPUB_CONTENT_VERTICAL_OFFSET;
  const previewCardWidth = Math.max(1, Math.min(windowDimensions.width - spacing.lg * 2, 520));
  const previewCardMaxHeight = Math.max(1, windowDimensions.height * 0.88);
  const previewHeaderHeight = 54;
  const previewReaderWidth = Math.max(1, windowDimensions.width);
  const previewReaderHeight = Math.max(
    1,
    windowDimensions.height - epubContentVerticalInset * 2,
  );
  const previewAvailableWidth = Math.max(1, previewCardWidth - spacing.md * 2);
  const previewAvailableHeight = Math.max(1, previewCardMaxHeight - previewHeaderHeight - spacing.md * 2);
  const previewScale = Math.min(1, previewAvailableWidth / previewReaderWidth, previewAvailableHeight / previewReaderHeight);
  const previewFrameWidth = previewReaderWidth * previewScale;
  const previewFrameHeight = previewReaderHeight * previewScale;

  const syncDurableEpubProgress = useCallback(async (locator: EpubLocator) => {
    const nextProgress = locator.totalProgression ?? (book.progressPct ?? 0) / 100;
    await updateBookProgress(book.id, {
      progress: locator.cfi ?? book.progress,
      progressPct: Math.max(0, Math.min(100, nextProgress * 100)),
      cfi: locator.cfi,
      isRead: nextProgress >= 0.999,
    });
  }, [book.id, book.progress, book.progressPct, updateBookProgress]);

  const epubPersistence = useEpubPersistence({
    bookId: book.id,
    enabled: isEpub,
    legacyCfi: book.cfi ?? book.progress,
    onDurableProgress: syncDurableEpubProgress,
  });

  const epubNotes = useEpubNotes(isEpub ? book.id : null, isEpub ? 'epub' : 'pdf');

  const handleEpubRelocate = useCallback((locator: EpubLocator, source: EpubRelocationSource) => {
    if (locator.totalProgression !== null) setProgress(locator.totalProgression);
    epubPersistence.handleRelocate(locator, source);
  }, [epubPersistence.handleRelocate]);

  const handleEpubPositionStabilized = useCallback((locator: EpubLocator) => {
    if (locator.totalProgression !== null) setProgress(locator.totalProgression);
    epubPersistence.handlePositionStabilized(locator);
  }, [epubPersistence.handlePositionStabilized]);

  const handleEpubViewStatus = useCallback((status: EpubViewStatus) => {
    setEpubViewStatus(status);
    if (status.currentPage != null) setCurrentPage(status.currentPage);
    if (status.totalPages != null) setTotalPages(status.totalPages);
  }, []);

  useEffect(() => {
    if (!isEpub) AsyncStorage.getItem(`progress_${book.id}`).then(setSavedPosition);
    loadReaderSettings().then(setReaderSettings);
  }, [book.id, isEpub]);

  useEffect(() => {
    allowControlledCloseRef.current = false;
    controlledCloseInFlightRef.current = false;
    return navigation.addListener('beforeRemove', (event) => {
      if (!isEpub || allowControlledCloseRef.current) return;
      event.preventDefault();
      if (controlledCloseInFlightRef.current) return;
      controlledCloseInFlightRef.current = true;
      const locatorRequest = epubReaderRef.current?.getCurrentLocator() ?? Promise.resolve(null);
      void locatorRequest
        .catch(() => null)
        .then((locator) => epubPersistence.flush(locator))
        .catch((error) => {
          console.warn('[Krumer ReaderScreen] falha no flush ao fechar EPUB', error);
        })
        .finally(() => {
          allowControlledCloseRef.current = true;
          controlledCloseInFlightRef.current = false;
          navigation.dispatch(event.data.action);
        });
    });
  }, [epubPersistence.flush, isEpub, navigation]);

  useEffect(() => {
    if (!isEpub) {
      hideTimer.current = setTimeout(() => setBars(false), HIDE_DELAY);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isEpub]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBars(false), HIDE_DELAY);
  }, []);

  const closeBookmarks = useCallback(() => {
    setBookmarksVisible(false);
    scheduleHide();
  }, [scheduleHide]);

  const openNotes = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setNotesVisible(true);
  }, []);

  const closeNotes = useCallback(() => {
    setNotesVisible(false);
    scheduleHide();
  }, [scheduleHide]);

  const handleSelectNote = useCallback((note: ReaderNote) => {
    setSelectedNote(note);
    setDetailVisible(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailVisible(false);
    setSelectedNote(null);
    scheduleHide();
  }, [scheduleHide]);

  const handleAnchorPress = useCallback((note: ReaderNote) => {
    if (note.locator.format === 'epub') setPreviewNote(note);
    setNotesVisible(false);
    setDetailVisible(false);
    setEditorVisible(false);
    scheduleHide();
  }, [scheduleHide]);

  const closePreview = useCallback(() => {
    setPreviewNote(null);
    scheduleHide();
  }, [scheduleHide]);

  const handleCreateNote = useCallback(() => {
    setNotesVisible(false);
    setDetailVisible(false);
    setEditingNoteId(null);
    setNoteDraft('');
    setEditorVisible(true);
  }, []);

  const handleEditNote = useCallback((note: ReaderNote) => {
    setNotesVisible(false);
    setEditingNoteId(note.id);
    setNoteDraft(note.content);
    setEditorVisible(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorVisible(false);
    setEditingNoteId(null);
    setNoteDraft('');
    scheduleHide();
  }, [scheduleHide]);

  const handleSaveNote = useCallback(async () => {
    const content = noteDraft.trim();
    if (!content) return;
    const locator = epubPersistence.currentLocator;
    if (!locator) return;
    const pageNumber = epubViewStatus?.currentPage ?? 1;
    if (editingNoteId) {
      await epubNotes.editNote(editingNoteId, content);
      setSelectedNote((current) => current && current.id === editingNoteId
        ? { ...current, content, updatedAt: new Date().toISOString() }
        : current);
    } else {
      await epubNotes.addNote(locator, content, pageNumber);
    }
    closeEditor();
  }, [noteDraft, editingNoteId, epubPersistence.currentLocator, epubViewStatus?.currentPage, epubNotes, closeEditor]);

  const handleDeleteNote = useCallback(async (id: string) => {
    await epubNotes.removeNote(id);
    if (selectedNote?.id === id) {
      setDetailVisible(false);
      setSelectedNote(null);
    }
  }, [epubNotes, selectedNote?.id]);

  function setBars(visible: boolean) {
    if (!visible && hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setBarsVisible(visible);
    Animated.timing(opacity, {
      duration: 200,
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
    }).start();
    if (visible) scheduleHide();
  }

  function toggleBars() {
    setBars(!barsVisible);
  }

  async function saveProgress(value: string, percent: number, page?: number, total?: number) {
    setProgress(percent);
    if (page !== undefined) setCurrentPage(page);
    if (total !== undefined) setTotalPages(total);
    await AsyncStorage.setItem(`progress_${book.id}`, value);
    await updateBookProgress(book.id, {
      progress: value,
      progressPct: Math.max(0, Math.min(100, percent * 100)),
      currentPage: page ?? book.currentPage ?? 0,
      totalPages: total ?? book.totalPages ?? null,
      cfi: book.format === 'epub' ? value : null,
      isRead: percent >= 1,
    });
  }

  function changeFontSize(delta: number) {
    setReaderSettings((prev) => {
      const next = { ...prev, fontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prev.fontSize + delta)) };
      saveReaderSettings(next);
      return next;
    });
  }

  function changeLineHeight(delta: number) {
    setReaderSettings((prev) => {
      const raw = prev.lineHeight + delta;
      const clamped = Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, Math.round(raw * 10) / 10));
      const next = { ...prev, lineHeight: clamped };
      saveReaderSettings(next);
      return next;
    });
  }

  // Brightness initialization (isAvailable + getBrightness)
  useEffect(() => {
    if (!isEpub) return;
    let mounted = true;
    (async () => {
      try {
        const available = await Brightness.isAvailableAsync();
        if (!mounted) return;
        if (!available) {
          setBrightnessSupported(false);
          brightnessSupportedRef.current = false;
          return;
        }
        const current = await Brightness.getBrightnessAsync();
        if (mounted && Number.isFinite(current)) {
          const clamped = Math.max(0.1, Math.min(1, current));
          setBrightnessState(clamped);
          brightnessAnim.setValue(clamped);
          pendingBrightnessRef.current = clamped;
          originalBrightnessRef.current = current;
        }
      } catch {
        if (mounted) setBrightnessSupported(false);
      }
    })();
    return () => { mounted = false; };
  }, [isEpub]);

  // Restore original brightness when leaving reader
  useEffect(() => {
    return () => {
      const original = originalBrightnessRef.current;
      if (original !== null && Number.isFinite(original)) {
        Brightness.setBrightnessAsync(original).catch(() => {});
      }
    };
  }, []);

  const applyDeviceBrightness = useCallback((value: number) => {
    if (!brightnessSupportedRef.current) return;
    pendingBrightnessRef.current = value;
    Brightness.setBrightnessAsync(value).catch((err) =>
      console.warn('[Krumer ReaderScreen] falha ao ajustar brilho', err)
    );
  }, []);

  const updateBrightness = useCallback((value: number) => {
    const clamped = Math.max(0.1, Math.min(1, Math.round(value * 100) / 100));
    setBrightnessState(clamped);
    pendingBrightnessRef.current = clamped;
    // animação visual imediata com easing suave (não bloqueia o toque)
    Animated.timing(brightnessAnim, {
      toValue: clamped,
      duration: 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (!brightnessSupportedRef.current) return;
    const now = Date.now();
    if (now - lastBrightnessApplyRef.current < 16) return;
    lastBrightnessApplyRef.current = now;
    applyDeviceBrightness(clamped);
  }, [applyDeviceBrightness, brightnessAnim]);

  const openToc = useCallback(async () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTocVisible(true);
    setTocLoading(true);
    try {
      const toc = await epubReaderRef.current?.getToc();
      setTocItems(toc ?? []);
    } catch (err) {
      console.warn('[Krumer ReaderScreen] falha ao carregar sumário', err);
      setTocItems([]);
    } finally {
      setTocLoading(false);
    }
  }, []);

  const closeToc = useCallback(() => {
    setTocVisible(false);
    scheduleHide();
  }, [scheduleHide]);

  const handleTocSelect = useCallback((href: string) => {
    if (!href) return;
    epubReaderRef.current?.goToHref(href);
    setTocVisible(false);
    scheduleHide();
  }, [scheduleHide]);

  const openBrightness = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setBrightnessVisible(true);
  }, []);

  const closeBrightness = useCallback(() => {
    setBrightnessVisible(false);
    scheduleHide();
  }, [scheduleHide]);

  const brightnessPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        const w = sliderWidthRef.current || 1;
        const x = evt.nativeEvent.locationX;
        updateBrightness(Math.max(0.1, Math.min(1, x / w)));
      },
      onPanResponderRelease: () => {
        applyDeviceBrightness(pendingBrightnessRef.current);
      },
      onPanResponderTerminate: () => {
        applyDeviceBrightness(pendingBrightnessRef.current);
      },
    })
  ).current;

  function renderTocItems(items: EpubTocItem[], depth = 0): React.ReactNode {
    return items.map((item, index) => (
      <View key={`${item.href}-${index}-${depth}`}>
        <Pressable
          accessibilityRole="button"
          onPress={() => handleTocSelect(item.href)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? theme.card : 'transparent',
            borderBottomColor: theme.border,
            borderBottomWidth: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.md,
            paddingLeft: spacing.md + depth * 16,
          })}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent, opacity: 0.8 }} />
          <Text numberOfLines={2} style={{ flex: 1, color: theme.textPrimary, fontFamily: serifFont, fontSize: 13, lineHeight: 18 }}>
            {item.label}
          </Text>
        </Pressable>
        {item.subitems && item.subitems.length ? renderTocItems(item.subitems, depth + 1) : null}
      </View>
    ));
  }

  function countTocItems(items: EpubTocItem[]): number {
    let count = 0;
    for (const item of items) {
      count += 1;
      if (item.subitems?.length) count += countTocItems(item.subitems);
    }
    return count;
  }

  const progressPercent = Math.round(progress * 100);
  const hasReadyPageCount = epubViewStatus?.paginationState === 'ready' && currentPage > 0 && totalPages > 0;

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <StatusBar hidden={isEpub || !barsVisible} animated={!isEpub} />

      {/* Reader content */}
      {book.format === 'pdf' ? (
        <PdfReader
          filePath={book.filePath}
          initialPage={savedPosition ? Number(savedPosition) : 1}
          onPageChange={(page, total) => saveProgress(String(page), total ? page / total : 0, page, total)}
          onCenterTap={toggleBars}
        />
      ) : (
        <View
          style={{
            backgroundColor: epubBackground,
            flex: 1,
            paddingBottom: epubContentVerticalInset,
            paddingHorizontal: 0,
            paddingTop: epubContentVerticalInset,
          }}
        >
          {epubPersistence.hydrated && readingPreferences.hydrated && readerLayout.hydrated ? (
            <EpubReader
              ref={epubReaderRef}
              bookId={book.id}
              filePath={book.filePath}
              fileSize={book.fileSize}
              fontSize={readerSettings.fontSize}
              initialLocator={epubPersistence.initialLocator}
              lineHeight={readerSettings.lineHeight}
              marginHorizontal={readerLayout.settings.marginHorizontal}
              onCenterTap={toggleBars}
              onPositionStabilized={handleEpubPositionStabilized}
              onRelocate={handleEpubRelocate}
              onViewStatus={handleEpubViewStatus}
              readingPreferences={readingPreferences.preferences}
              useBookMargins={readerLayout.settings.useBookMargins}
              onExternalLink={(url) => {
                Linking.openURL(url).catch((caught: unknown) => {
                  console.warn('[Krumer ReaderScreen] falha ao abrir link externo', caught);
                });
              }}
            />
          ) : (
            <View style={{ alignItems: 'center', backgroundColor: epubBackground, flex: 1, justifyContent: 'center' }}>
              <ActivityIndicator color="#f97316" size="large" />
            </View>
          )}
        </View>
      )}

      {isEpub && !barsVisible ? (
        <View
          pointerEvents="none"
          style={{
            bottom: 0,
            elevation: 95,
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
            zIndex: 95,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: epubMuted,
              fontFamily: serifFont,
              fontSize: 14,
              left: Math.max(insets.left, 0) + 32,
              lineHeight: 20,
              maxWidth: '72%',
              opacity: 0.68,
              position: 'absolute',
              textTransform: 'uppercase',
              top: Math.max(insets.top, 0) + 16,
            }}
          >
            {epubViewStatus?.chapterTitle || book.title}
          </Text>
        </View>
      ) : null}

      {isEpub ? (
        <View
          pointerEvents="none"
          style={{
            bottom: 0,
            elevation: 90,
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
            zIndex: 90,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: epubMuted,
              fontFamily: serifFont,
              fontSize: 14,
              opacity: 0.68,
              position: 'absolute',
              bottom: Math.max(insets.bottom, 0) + 16,
              right: Math.max(insets.right, 0) + 32,
            }}
          >
            {hasReadyPageCount ? `${currentPage} / ${totalPages}` : '- / -'}
          </Text>
        </View>
      ) : null}

      {/* Top bar */}
      <Animated.View
        onTouchStart={scheduleHide}
        pointerEvents={barsVisible ? 'auto' : 'none'}
        style={{
          backgroundColor: isEpub ? epubTopChrome : theme.surface + 'ee',
          borderBottomColor: theme.border,
          borderBottomWidth: isEpub ? 0 : 1,
          elevation: isEpub ? 20 : 0,
          left: 0,
          opacity: isEpub ? (barsVisible ? 1 : 0) : opacity,
          paddingBottom: isEpub ? scaleEpubChrome(spacing.sm) : spacing.sm,
          paddingLeft: Math.max(insets.left, spacing.md),
          paddingRight: Math.max(insets.right, spacing.md),
          paddingTop: isEpub
            ? Math.max(insets.top, scaleEpubChrome(Platform.OS === 'ios' ? 44 : 24)) + scaleEpubChrome(spacing.xs)
            : Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24) + spacing.xs,
          position: 'absolute',
          right: 0,
          top: 0,
          zIndex: 100,
        }}
      >
        {isEpub ? (
          <View
            style={{
              alignItems: 'center',
              backgroundColor: epubTopChrome,
              flexDirection: 'row',
              minHeight: scaleEpubChrome(44),
              position: 'relative',
              zIndex: 101,
            }}
          >
            <Pressable
              accessibilityLabel={t('reader.addBookmark')}
              disabled={!epubPersistence.currentLocator || bookmarkBusy}
              hitSlop={6}
              onPress={() => {
                setBookmarkBusy(true);
                void epubPersistence.addBookmark()
                  .catch((error) => console.warn('[Krumer ReaderScreen] falha ao criar marcador', error))
                  .finally(() => setBookmarkBusy(false));
              }}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: scaleEpubChrome(40),
                justifyContent: 'center',
                opacity: !epubPersistence.currentLocator || bookmarkBusy ? 0.32 : pressed ? 0.55 : 1,
                width: 44,
              })}
            >
              <BookmarkPlus color={theme.accent} size={21} strokeWidth={1.8} />
            </Pressable>
            <Pressable
              accessibilityLabel={t('reader.bookmarks')}
              hitSlop={6}
              onPress={() => {
                if (hideTimer.current) clearTimeout(hideTimer.current);
                setBookmarksVisible(true);
              }}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: scaleEpubChrome(40),
                justifyContent: 'center',
                opacity: pressed ? 0.55 : 1,
                width: 44,
              })}
            >
              <Bookmark
                color={epubText}
                fill={epubPersistence.bookmarks.length ? epubText : 'transparent'}
                size={20}
                strokeWidth={1.7}
              />
            </Pressable>
            <Text
              numberOfLines={1}
              style={{
                color: epubMuted,
                flex: 1,
                fontFamily: serifFont,
                fontSize: 12,
                marginHorizontal: spacing.sm,
                textAlign: 'center',
              }}
            >
              {book.title}
            </Text>
            <ReadingSettingsButton
              color={epubText}
              onPress={() => {
                if (hideTimer.current) clearTimeout(hideTimer.current);
                setSettingsVisible(true);
              }}
            />
            <PaginationSettingsButton
              color={epubText}
              onPress={() => {
                if (hideTimer.current) clearTimeout(hideTimer.current);
                setPaginationSettingsVisible(true);
              }}
            />
            <Pressable
              accessibilityLabel={t('common.cancel')}
              hitSlop={8}
              onPress={() => navigation.goBack()}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: scaleEpubChrome(40),
                justifyContent: 'center',
                opacity: pressed ? 0.5 : 1,
                width: 44,
              })}
            >
              <X color={epubText} size={20} strokeWidth={1.7} />
            </Pressable>
          </View>
        ) : (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md }}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              style={({ pressed }) => ({
                borderRadius: radii.sm,
                opacity: pressed ? 0.6 : 1,
                padding: spacing.xs,
              })}
            >
              <ArrowLeft color={theme.accent} size={22} />
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.textPrimary,
                  fontFamily: serifFont,
                  fontSize: 15,
                  fontWeight: '600',
                }}
              >
                {book.title}
              </Text>
              {book.author ? (
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.textMuted,
                    fontFamily: serifFont,
                    fontSize: 11,
                  }}
                >
                  {book.author}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </Animated.View>

      {/* Bottom bar - apenas PDF (EPUB sem barra/setas) */}
      {!isEpub && (
        <Animated.View
          onTouchStart={scheduleHide}
          pointerEvents={barsVisible ? 'auto' : 'none'}
          style={{
            backgroundColor: theme.surface + 'ee',
            borderTopColor: theme.border,
            borderTopWidth: 1,
            bottom: 0,
            left: 0,
            opacity,
            paddingBottom: Math.max(insets.bottom, 16) + spacing.xs,
            paddingLeft: Math.max(insets.left, spacing.md),
            paddingRight: Math.max(insets.right, spacing.md),
            paddingTop: spacing.sm,
            position: 'absolute',
            right: 0,
          }}
        >
          <>
            {/* Progress bar */}
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
              <View
                style={{
                  backgroundColor: theme.border,
                  borderRadius: radii.sm,
                  flex: 1,
                  height: 6,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    backgroundColor: theme.accent,
                    borderRadius: radii.sm,
                    height: '100%',
                    width: `${progressPercent}%`,
                  }}
                />
              </View>
              <Text
                style={{
                  color: theme.accent,
                  fontFamily: serifFont,
                  fontSize: 12,
                  fontWeight: '700',
                  minWidth: 36,
                  textAlign: 'right',
                }}
              >
                {progressPercent}%
              </Text>
            </View>

            {/* Page info + settings button */}
            <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text
                style={{
                  color: theme.textMuted,
                  fontFamily: serifFont,
                  fontSize: 12,
                }}
              >
                {totalPages ? `${t('reader.page')} ${currentPage} / ${totalPages}` : `${progressPercent}%`}
              </Text>
              <Pressable
                onPress={() => {
                  setSettingsVisible(true);
                  if (hideTimer.current) clearTimeout(hideTimer.current);
                }}
                hitSlop={10}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: radii.sm,
                  borderWidth: 1,
                  flexDirection: 'row',
                  gap: spacing.xs,
                  opacity: pressed ? 0.7 : 1,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                })}
              >
                <Settings color={theme.textSecondary} size={14} />
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 11 }}>
                  {t('reader.readingSettings')}
                </Text>
              </Pressable>
            </View>
          </>
        </Animated.View>
      )}

      {/* Bottom bar EPUB - Tópicos, layout e brilho */}
      {isEpub && (
        <Animated.View
          onTouchStart={scheduleHide}
          pointerEvents={barsVisible ? 'auto' : 'none'}
          style={{
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            borderTopWidth: 1,
            bottom: 0,
            elevation: 100,
            left: 0,
            opacity,
            paddingBottom: Math.max(insets.bottom, scaleEpubChrome(12)) + scaleEpubChrome(spacing.xs),
            paddingLeft: Math.max(insets.left, spacing.md),
            paddingRight: Math.max(insets.right, spacing.md),
            paddingTop: scaleEpubChrome(spacing.sm),
            position: 'absolute',
            right: 0,
            zIndex: 100,
          }}
        >
          <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-around', minHeight: scaleEpubChrome(44) }}>
            <Pressable
              accessibilityLabel="Tópicos"
              hitSlop={12}
              onPress={openToc}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.5 : 1,
                padding: 12,
              })}
            >
              <ListTree color={epubText} size={24} strokeWidth={1.9} />
            </Pressable>

            <LayoutSettingsButton
              color={epubText}
              onPress={() => {
                if (hideTimer.current) clearTimeout(hideTimer.current);
                setLayoutSettingsVisible(true);
              }}
            />

            <Pressable
              accessibilityLabel="Notas"
              accessibilityRole="button"
              hitSlop={12}
              onPress={openNotes}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.5 : 1,
                padding: 12,
              })}
            >
              <Feather color={epubText} size={24} strokeWidth={1.9} />
            </Pressable>

            <Pressable
              accessibilityLabel="Brilho"
              hitSlop={12}
              onPress={openBrightness}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.5 : 1,
                padding: 12,
              })}
            >
              <Sun color={epubText} size={24} strokeWidth={1.9} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      <ActionSheetModal backdropColor="rgba(0,0,0,0.53)" onClose={closeBookmarks} visible={bookmarksVisible && isEpub}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderTopLeftRadius: radii.lg,
              borderTopRightRadius: radii.lg,
              borderWidth: 1,
              maxHeight: '72%',
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
            }}
          >
            <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                <Bookmark color={theme.accent} size={19} />
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
                  {t('reader.bookmarks')}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={t('common.cancel')}
                hitSlop={10}
                onPress={closeBookmarks}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}
              >
                <X color={theme.textSecondary} size={20} />
              </Pressable>
            </View>

            {epubPersistence.bookmarks.length ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {epubPersistence.bookmarks.map((bookmark, index) => {
                  const locator = bookmark.locator;
                  if (locator.format !== 'epub') return null;
                  const bookmarkProgress = locator.totalProgression === null
                    ? null
                    : Math.round(locator.totalProgression * 100);
                  const excerpt = (bookmark.label || locator.excerpt).replace(/\s+/g, ' ').trim();
                  return (
                    <Pressable
                      key={bookmark.id}
                      accessibilityRole="button"
                      onPress={() => {
                        epubReaderRef.current?.goToLocator(locator);
                        closeBookmarks();
                      }}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: pressed ? theme.card : 'transparent',
                        borderBottomColor: theme.border,
                        borderBottomWidth: index === epubPersistence.bookmarks.length - 1 ? 0 : 1,
                        flexDirection: 'row',
                        gap: spacing.md,
                        minHeight: 68,
                        paddingVertical: spacing.sm,
                      })}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text numberOfLines={2} style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, lineHeight: 19 }}>
                          {excerpt || `${t('reader.bookmarks')} ${epubPersistence.bookmarks.length - index}`}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11 }}>
                          {bookmarkProgress === null ? '' : `${bookmarkProgress}%  `}
                          {new Date(bookmark.createdAt).toLocaleString()}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={t('reader.removeBookmark')}
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          void epubPersistence.removeBookmark(bookmark.id)
                            .catch((error) => console.warn('[Krumer ReaderScreen] falha ao remover marcador', error));
                        }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1, padding: spacing.sm })}
                      >
                        <Trash2 color={theme.textMuted} size={18} />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <Bookmark color={theme.textMuted} size={26} />
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13 }}>
                  {t('reader.noBookmarks')}
                </Text>
              </View>
            )}
          </Pressable>
      </ActionSheetModal>

      {/* TOC Modal - Sumário do EPUB */}
      <ActionSheetModal
        navigationBarTranslucent
        onClose={closeToc}
        statusBarTranslucent
        visible={tocVisible && isEpub}
      >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderTopLeftRadius: radii.lg,
              borderTopRightRadius: radii.lg,
              borderWidth: 1,
              maxHeight: '78%',
              overflow: 'hidden',
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
            }}
          >
            <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                <ListTree color={theme.accent} size={19} />
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
                  Tópicos
                </Text>
                {tocItems && !tocLoading ? (
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
                    ({countTocItems(tocItems)})
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel={t('common.cancel')}
                hitSlop={10}
                onPress={closeToc}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}
              >
                <X color={theme.textSecondary} size={20} />
              </Pressable>
            </View>

            {tocLoading ? (
              <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <ActivityIndicator color={theme.accent} />
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13 }}>Carregando tópicos...</Text>
              </View>
            ) : tocItems && tocItems.length ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {renderTocItems(tocItems)}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <ListTree color={theme.textMuted} size={26} />
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13, textAlign: 'center' }}>
                  Nenhum tópico disponível para este livro.
                </Text>
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, textAlign: 'center', opacity: 0.7 }}>
                  O sumário não foi encontrado no arquivo EPUB.
                </Text>
              </View>
            )}
          </Pressable>
      </ActionSheetModal>

      {/* Brightness Modal - Controle de brilho */}
      <ActionSheetModal
        navigationBarTranslucent
        onClose={closeBrightness}
        statusBarTranslucent
        visible={brightnessVisible && isEpub}
      >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderTopLeftRadius: radii.lg,
              borderTopRightRadius: radii.lg,
              borderWidth: 1,
              overflow: 'hidden',
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
            }}
          >
            <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                <Sun color={theme.accent} size={19} />
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
                  Brilho
                </Text>
              </View>
              <Pressable
                accessibilityLabel={t('common.cancel')}
                hitSlop={10}
                onPress={closeBrightness}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}
              >
                <X color={theme.textSecondary} size={20} />
              </Pressable>
            </View>

            {!brightnessSupported ? (
              <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
                <Sun color={theme.textMuted} size={26} />
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13, textAlign: 'center' }}>
                  Controle de brilho não disponível neste dispositivo.
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.xl, paddingBottom: spacing.sm, paddingTop: spacing.md }}>
                <View style={{ height: 56, justifyContent: 'center', paddingHorizontal: 12 }}>
                  <View
                    onLayout={(event) => {
                      const w = event.nativeEvent.layout.width;
                      sliderWidthRef.current = w;
                      setTrackWidthState(w);
                    }}
                    {...brightnessPanResponder.panHandlers}
                    style={{ height: 56, justifyContent: 'center' }}
                  >
                    <View style={{ backgroundColor: theme.border, borderRadius: 10, height: 14, overflow: 'hidden', width: '100%' }}>
                      <Animated.View
                        style={{
                          backgroundColor: theme.accent,
                          borderRadius: 10,
                          height: '100%',
                          width: '100%',
                          transform: [{ scaleX: brightnessAnim }],
                          transformOrigin: 'left center',
                        }}
                      />
                    </View>
                    <Animated.View
                      pointerEvents="none"
                      style={{
                        alignItems: 'center',
                        backgroundColor: theme.accent,
                        borderColor: theme.card,
                        borderRadius: 22,
                        borderWidth: 3,
                        elevation: 4,
                        height: 44,
                        justifyContent: 'center',
                        left: 0,
                        position: 'absolute',
                        shadowColor: '#000',
                        shadowOpacity: 0.25,
                        shadowRadius: 6,
                        top: 6,
                        width: 44,
                        transform: [
                          {
                            translateX: brightnessAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-22, trackWidthState - 22],
                              extrapolate: 'clamp',
                            }),
                          },
                        ],
                      }}
                    >
                      <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>
                        {Math.round(brightness * 100)}
                      </Text>
                    </Animated.View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 }}>
                  <Sun color={theme.textMuted} size={14} strokeWidth={1.8} />
                  <Sun color={theme.accent} size={18} strokeWidth={1.8} />
                </View>
              </View>
            )}
          </Pressable>
      </ActionSheetModal>

      <ReadingSettingsModal
        fontSize={readerSettings.fontSize}
        fontSizeMax={FONT_SIZE_MAX}
        fontSizeMin={FONT_SIZE_MIN}
        onChangeFontSize={changeFontSize}
        onClose={() => {
          setSettingsVisible(false);
          scheduleHide();
        }}
        onReset={() => {
          const defaults = { ...readerSettings, fontSize: FONT_SIZE_DEFAULT };
          setReaderSettings(defaults);
          void saveReaderSettings(defaults);
          readingPreferences.updatePreferences({
            fontFamily: 'serif',
            fontWeight: 'regular',
          });
        }}
        onUpdatePreferences={readingPreferences.updatePreferences}
        preferences={readingPreferences.preferences}
        visible={settingsVisible && isEpub}
      />

      <PaginationSettingsModal
        isLandscape={isLandscape}
        onClose={() => {
          setPaginationSettingsVisible(false);
          scheduleHide();
        }}
        onUpdatePreferences={readingPreferences.updatePreferences}
        preferences={readingPreferences.preferences}
        visible={paginationSettingsVisible && isEpub}
      />

      <LayoutSettingsModal
        lineHeight={readerSettings.lineHeight}
        lineHeightMax={LINE_HEIGHT_MAX}
        lineHeightMin={LINE_HEIGHT_MIN}
        onChangeLineHeight={changeLineHeight}
        onClose={() => {
          setLayoutSettingsVisible(false);
          scheduleHide();
        }}
        onReset={() => {
          readerLayout.resetSettings();
          setReaderSettings((previous) => {
            const next = { ...previous, lineHeight: LINE_HEIGHT_DEFAULT };
            void saveReaderSettings(next);
            return next;
          });
        }}
        onUpdateSettings={readerLayout.updateSettings}
        settings={readerLayout.settings}
        visible={layoutSettingsVisible && isEpub}
      />

      {/* PDF settings modal */}
      <ActionSheetModal
        backdropColor="rgba(0,0,0,0.53)"
        visible={settingsVisible && !isEpub}
        onClose={() => {
          setSettingsVisible(false);
          scheduleHide();
        }}
      >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderTopLeftRadius: radii.lg,
              borderTopRightRadius: radii.lg,
              borderWidth: 1,
              gap: spacing.lg,
              paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            {/* Handle indicator */}
            <View style={{ alignSelf: 'center', backgroundColor: theme.border, borderRadius: 2, height: 4, marginBottom: spacing.xs, width: 36 }} />

            <Text
              style={{
                color: theme.textPrimary,
                fontFamily: serifFont,
                fontSize: 18,
                fontWeight: '700',
              }}
            >
              {t('reader.readingSettings')}
            </Text>

            {/* Theme selector */}
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>
                {t('theme.label')}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['dark', 'light', 'sepia'] as ThemeName[]).map((name) => (
                  <ThemeCard key={name} value={name} selected={preferences.theme === name} onPress={setThemeName} />
                ))}
              </View>
            </View>

          </Pressable>
      </ActionSheetModal>

      {/* Notes List Modal */}
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={closeNotes}
        statusBarTranslucent
        transparent
        visible={notesVisible && isEpub}
      >
        <View style={{ backgroundColor: 'rgba(0, 0, 0, 0.48 )', flex: 1 }}>
          <Pressable onPress={closeNotes} style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg }}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderRadius: radii.lg,
                borderWidth: 1,
                maxHeight: '88%',
                maxWidth: 480,
                minHeight: epubNotes.notes.length === 0 ? 300 : undefined,
                overflow: 'hidden',
                paddingBottom: spacing.lg,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                width: '94%',
              }}
            >
              <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <Feather color={theme.accent} size={19} strokeWidth={1.7} />
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>Notas</Text>
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>({epubNotes.notes.length})</Text>
                </View>
                <Pressable hitSlop={10} onPress={closeNotes} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}>
                  <X color={theme.textSecondary} size={20} />
                </Pressable>
              </View>

              {epubNotes.notes.length === 0 ? (
                <View style={{ alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.xl }}>
                  <StickyNote color={theme.textMuted} size={32} strokeWidth={1.5} />
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>Nenhuma nota ainda.</Text>
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, lineHeight: 17, opacity: 0.8, textAlign: 'center' }}>Crie uma nota vinculada à página atual.</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleCreateNote}
                    style={({ pressed }) => ({
                      alignItems: 'center',
                      backgroundColor: theme.accent,
                      borderRadius: radii.md,
                      flexDirection: 'row',
                      gap: spacing.sm,
                      marginTop: spacing.md,
                      opacity: pressed ? 0.85 : 1,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.sm,
                    })}
                  >
                    <Feather color="#fff" size={16} strokeWidth={1.8} />
                    <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>Nova Nota</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                    {epubNotes.notes.map((note, index) => {
                      const preview = note.content.length > 80 ? note.content.slice(0, 80).trim() + '…' : note.content;
                      const pageLabel = note.pageNumber ? `Página ${note.pageNumber}` : 'Página —';
                      const dateLabel = new Date(note.createdAt).toLocaleDateString();
                      return (
                        <Pressable
                          key={note.id}
                          accessibilityRole="button"
                          onPress={() => handleSelectNote(note)}
                          style={({ pressed }) => ({
                            backgroundColor: pressed ? theme.surface : 'transparent',
                            borderBottomColor: theme.border,
                            borderBottomWidth: index === epubNotes.notes.length - 1 ? 0 : 1,
                            flexDirection: 'row',
                            gap: spacing.md,
                            paddingVertical: spacing.md,
                            paddingHorizontal: spacing.xs,
                          })}
                        >
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text numberOfLines={2} style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13, lineHeight: 18 }}>
                              {preview}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11 }}>
                              {pageLabel} · {dateLabel}
                            </Text>
                          </View>
                          <Pressable
                            hitSlop={8}
                            onPress={(e) => { e.stopPropagation(); void handleDeleteNote(note.id); }}
                            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1, padding: spacing.xs })}
                          >
                            <Trash2 color={theme.textMuted} size={16} />
                          </Pressable>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleCreateNote}
                    style={({ pressed }) => ({
                      alignItems: 'center',
                      alignSelf: 'center',
                      backgroundColor: theme.accent,
                      borderRadius: radii.md,
                      flexDirection: 'row',
                      gap: spacing.sm,
                      marginTop: spacing.md,
                      opacity: pressed ? 0.85 : 1,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.sm,
                    })}
                  >
                    <Feather color="#fff" size={16} strokeWidth={1.8} />
                    <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>Nova Nota</Text>
                  </Pressable>
                </>
              )}
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      {/* Note Detail Modal */}
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={closeDetail}
        statusBarTranslucent
        transparent
        visible={detailVisible && !!selectedNote}
      >
        <View style={{ backgroundColor: 'rgba(0, 0, 0, 0.48)', flex: 1 }}>
          <Pressable onPress={closeDetail} style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg }}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderRadius: radii.lg,
                borderWidth: 1,
                maxHeight: '72%',
                maxWidth: 480,
                overflow: 'hidden',
                paddingBottom: spacing.lg,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                width: '94%',
              }}
            >
              <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <Feather color={theme.accent} size={18} strokeWidth={1.7} />
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, fontWeight: '700' }}>Nota</Text>
                  {selectedNote?.pageNumber ? (
                    <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11 }}>Página {selectedNote.pageNumber}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <Pressable
                    accessibilityLabel="Ir para página da nota"
                    hitSlop={10}
                    onPress={() => selectedNote && handleAnchorPress(selectedNote)}
                    style={({ pressed }) => ({
                      alignItems: 'center',
                      backgroundColor: pressed ? theme.surface : theme.card,
                      borderColor: theme.border,
                      borderRadius: radii.sm,
                      borderWidth: 1,
                      height: 36,
                      justifyContent: 'center',
                      opacity: pressed ? 0.7 : 1,
                      width: 36,
                    })}
                  >
                    <Anchor color={theme.accent} size={18} strokeWidth={1.8} />
                  </Pressable>
                  <Pressable hitSlop={10} onPress={closeDetail} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}>
                    <X color={theme.textSecondary} size={20} />
                  </Pressable>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15, lineHeight: 22 }}>
                  {selectedNote?.content ?? ''}
                </Text>
                {selectedNote ? (
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, marginTop: spacing.md }}>
                    {new Date(selectedNote.createdAt).toLocaleString()} {selectedNote.pageNumber ? `· Página ${selectedNote.pageNumber}` : ''}
                  </Text>
                ) : null}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }}>
                <Pressable
                  onPress={() => selectedNote && handleEditNote(selectedNote)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? theme.border : theme.surface,
                    borderColor: theme.border,
                    borderRadius: radii.sm,
                    borderWidth: 1,
                    opacity: pressed ? 0.8 : 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>Editar</Text>
                </Pressable>
                <Pressable
                  onPress={() => selectedNote && handleDeleteNote(selectedNote.id)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? '#991b1b' : '#dc2626',
                    borderRadius: radii.sm,
                    opacity: pressed ? 0.85 : 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>Excluir</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      {/* Note Editor Modal */}
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={closeEditor}
        statusBarTranslucent
        transparent
        visible={editorVisible}
      >
        <View style={{ backgroundColor: 'rgba(0, 0, 0, 0.48)', flex: 1 }}>
          <Pressable onPress={closeEditor} style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg }}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderRadius: radii.lg,
                borderWidth: 1,
                maxHeight: 420,
                maxWidth: 480,
                overflow: 'hidden',
                paddingBottom: spacing.lg,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                width: '94%',
              }}
            >
              <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <Feather color={theme.accent} size={18} strokeWidth={1.7} />
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, fontWeight: '700' }}>
                    {editingNoteId ? 'Editar nota' : 'Nova nota'}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={closeEditor} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}>
                  <X color={theme.textSecondary} size={20} />
                </Pressable>
              </View>

              <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, marginBottom: spacing.sm }}>
                {editingNoteId && selectedNote?.pageNumber ? `Página ${selectedNote.pageNumber}` : epubViewStatus?.currentPage ? `Página ${epubViewStatus.currentPage}` : 'Página atual'}
                {' · '}será salva com esta anotação
              </Text>

              <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, height: 180, padding: spacing.sm }}>
                <TextInput
                  autoFocus
                  multiline
                  onChangeText={setNoteDraft}
                  placeholder="Escreva sua anotação..."
                  placeholderTextColor={theme.textMuted}
                  scrollEnabled
                  style={{ color: theme.textPrimary, flex: 1, fontFamily: serifFont, fontSize: 14, lineHeight: 20, textAlignVertical: 'top' }}
                  value={noteDraft}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }}>
                <Pressable
                  onPress={closeEditor}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? theme.border : theme.surface,
                    borderColor: theme.border,
                    borderRadius: radii.sm,
                    borderWidth: 1,
                    opacity: pressed ? 0.8 : 1,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  disabled={!noteDraft.trim()}
                  onPress={() => void handleSaveNote()}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: !noteDraft.trim() ? theme.border : theme.accent,
                    borderRadius: radii.sm,
                    opacity: pressed ? 0.85 : 1,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{editingNoteId ? 'Salvar' : 'Criar'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      {/* Page Preview Modal */}
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={closePreview}
        statusBarTranslucent
        transparent
        visible={!!previewNote && isEpub}
      >
        <View style={{ backgroundColor: 'rgba(0, 0, 0, 0.15)', flex: 1 }}>
          <Pressable onPress={closePreview} style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg }}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: epubBackground,
                borderColor: theme.border,
                borderRadius: radii.lg,
                borderWidth: 1,
                height: previewHeaderHeight + previewFrameHeight + spacing.md * 2,
                maxHeight: previewCardMaxHeight,
                overflow: 'hidden',
                width: previewCardWidth,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: epubTopChrome,
                  borderBottomColor: theme.border,
                  borderBottomWidth: 1,
                  flexDirection: 'row',
                  height: previewHeaderHeight,
                  justifyContent: 'space-between',
                  paddingHorizontal: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: epubText, fontFamily: serifFont, fontSize: 14, fontWeight: '700' }}>
                    Página da nota
                  </Text>
                  <Text numberOfLines={1} style={{ color: epubMuted, fontFamily: serifFont, fontSize: 11 }}>
                    {previewNote?.pageNumber ? `Página ${previewNote.pageNumber}` : 'Página salva'}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={closePreview} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}>
                  <X color={epubText} size={20} strokeWidth={1.7} />
                </Pressable>
              </View>

              {previewNote?.locator.format === 'epub' ? (
                <View style={{ alignItems: 'center', backgroundColor: epubBackground, flex: 1, justifyContent: 'center', padding: spacing.md }}>
                  <View
                    style={{
                      backgroundColor: epubBackground,
                      height: previewFrameHeight,
                      overflow: 'hidden',
                      width: previewFrameWidth,
                    }}
                  >
                    <View
                      style={{
                        height: previewReaderHeight,
                        left: 0,
                        position: 'absolute',
                        top: 0,
                        transform: [{ scale: previewScale }],
                        transformOrigin: 'top left',
                        width: previewReaderWidth,
                      }}
                    >
                      <EpubReader
                        bookId={`${book.id}-note-preview-${previewNote.id}`}
                        filePath={book.filePath}
                        fileSize={book.fileSize}
                        fontSize={readerSettings.fontSize}
                        initialLocator={previewNote.locator}
                        lineHeight={readerSettings.lineHeight}
                        marginHorizontal={readerLayout.settings.marginHorizontal}
                        readOnly
                        readingPreferences={readingPreferences.preferences}
                        useBookMargins={readerLayout.settings.useBookMargins}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
