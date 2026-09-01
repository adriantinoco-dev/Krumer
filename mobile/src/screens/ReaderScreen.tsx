import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StatusBar, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Anchor, Bookmark, BookmarkPlus, Feather, ListTree, StickyNote, Sun, Trash2, X } from 'lucide-react-native';
import * as Brightness from 'expo-brightness';
import { ReadingSettingsButton } from '../components/ReadingSettingsButton';
import { ReadingSettingsModal } from '../components/ReadingSettingsModal';
import { LayoutSettingsButton } from '../components/LayoutSettingsButton';
import { LayoutSettingsModal } from '../components/LayoutSettingsModal';
import { PdfZoomButton } from '../components/PdfZoomButton';
import { PdfZoomModal } from '../components/PdfZoomModal';
import { PaginationSettingsButton } from '../components/PaginationSettingsButton';
import { PaginationSettingsModal } from '../components/PaginationSettingsModal';
import { ActionSheetModal } from '../components/ActionSheetModal';
import { EpubReader, type EpubReaderHandle } from '../readers/EpubReader';
import type { EpubRelocationSource, EpubTocItem, EpubViewStatus } from '../readers/epubBridge';
import { PdfReader } from '../readers/PdfReader';
import { PDF_DEFAULTS, type PdfDisplayMode, type PdfReaderHandle } from '../readers/PdfReader.types';
import { clampPdfScale } from '../readers/pdf/pdfState';
import { getCachedPdfPrefs, loadPdfPrefs, savePdfDisplayMode, savePdfOrientation } from '../readers/pdf/usePdfPrefs';
import { useEpubPersistence } from '../readers/useEpubPersistence';
import { useEpubNotes } from '../readers/useEpubNotes';
import { useOrientation } from '../readers/useOrientation';
import { usePdfBookmarks } from '../readers/usePdfBookmarks';
import { useReadingPreferences } from '../readers/useReadingPreferences';
import { useReaderLayoutSettings } from '../readers/useReaderLayoutSettings';
import {
  DEFAULT_READER_SETTINGS,
  getCachedReaderSettings,
  loadStoredReaderSettings,
  saveStoredReaderSettings,
  type ReaderSettings,
} from '../readers/readerSettings';
import { getCachedPdfProgress, loadPdfProgress, savePdfProgress } from '../readers/readerStartup';
import { useApp } from '../context/AppContext';
import { createPdfLocator, type EpubLocator, type ReaderNote } from '../models/reader';
import type { ReadingPreferences } from '../models/readingPreferences';
import type { RootStackParamList } from '../navigation/types';
import { radii, serifFont, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;
const FONT_SIZE_DEFAULT = DEFAULT_READER_SETTINGS.fontSize;
const LINE_HEIGHT_MIN = 1.0;
const LINE_HEIGHT_MAX = 2.4;
const LINE_HEIGHT_DEFAULT = DEFAULT_READER_SETTINGS.lineHeight;
const HIDE_DELAY = 4000;
const PDF_PROGRESS_SAVE_DELAY_MS = 500;
const EPUB_CONTENT_VERTICAL_OFFSET = 26;
const EPUB_CHROME_VERTICAL_SCALE = 0.6;
const EPUB_TOP_BAR_SIDE_WIDTH = 132;

function scaleEpubChrome(value: number) {
  return Math.round(value * EPUB_CHROME_VERTICAL_SCALE);
}

export function ReaderScreen({ navigation, route }: Props) {
  const { book } = route.params;
  const isEpub = book.format === 'epub';
  const { theme, t, updateBookProgress } = useApp();
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const readingPreferences = useReadingPreferences(isEpub);
  const readerLayout = useReaderLayoutSettings(isEpub);
  const initialPdfPreferences = useRef(getCachedPdfPrefs() ?? PDF_DEFAULTS).current;
  const [pdfDisplayMode, setPdfDisplayMode] = useState<PdfDisplayMode>(initialPdfPreferences.displayMode);
  const [pdfOrientation, setPdfOrientation] = useState<ReadingPreferences['orientation']>(initialPdfPreferences.orientation);
  const [pdfScale, setPdfScale] = useState<number>(PDF_DEFAULTS.scale);
  const { isLandscape } = useOrientation(isEpub ? readingPreferences.preferences.orientation : pdfOrientation);
  const [progress, setProgress] = useState((book.progressPct ?? 0) / 100);
  const [savedPosition, setSavedPosition] = useState<string | null>(() => {
    const cachedPdfProgress = isEpub ? undefined : getCachedPdfProgress(book.id);
    return cachedPdfProgress === undefined ? book.progress : cachedPdfProgress;
  });
  const [barsVisible, setBarsVisible] = useState(book.format !== 'epub');
  const [bookmarksVisible, setBookmarksVisible] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [paginationSettingsVisible, setPaginationSettingsVisible] = useState(false);
  const [pdfZoomVisible, setPdfZoomVisible] = useState(false);
  const [layoutSettingsVisible, setLayoutSettingsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(book.currentPage ?? 1);
  const [totalPages, setTotalPages] = useState(book.totalPages ?? 0);
  const [pdfPreferencesHydrated, setPdfPreferencesHydrated] = useState(
    isEpub || getCachedPdfPrefs() !== null,
  );
  const [epubViewStatus, setEpubViewStatus] = useState<EpubViewStatus | null>(null);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    () => getCachedReaderSettings() ?? DEFAULT_READER_SETTINGS,
  );
  const [tocVisible, setTocVisible] = useState(false);
  const [tocItems, setTocItems] = useState<EpubTocItem[] | null>(null);
  const [tocLoading, setTocLoading] = useState(false);
  const [brightnessVisible, setBrightnessVisible] = useState(false);
  const [brightness, setBrightnessState] = useState(0.7);
  const [brightnessSupported, setBrightnessSupported] = useState(true);
  const [notesVisible, setNotesVisible] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ReaderNote | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<ReaderNote | null>(null);
  const [previewNote, setPreviewNote] = useState<ReaderNote | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const originalBrightnessRef = useRef<number | null>(null);
  const originalBrightnessUsesSystemRef = useRef<boolean | null>(null);
  const brightnessSupportedRef = useRef(true);
  const lastBrightnessApplyRef = useRef(0);
  const pendingBrightnessRef = useRef(0.7);
  const sliderWidthRef = useRef(0);
  const [trackWidthState, setTrackWidthState] = useState(300);
  const brightnessAnim = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(book.format === 'epub' ? 0 : 1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPdfProgressRef = useRef<{ page: number; total: number } | null>(null);
  const epubReaderRef = useRef<EpubReaderHandle>(null);
  const pdfReaderRef = useRef<PdfReaderHandle>(null);
  const allowControlledCloseRef = useRef(false);
  const controlledCloseInFlightRef = useRef(false);
  const epubBackground = theme.name === 'dark' ? '#202020' : theme.name === 'sepia' ? '#f4ecd8' : '#ffffff';
  const epubText = theme.name === 'dark' ? '#e7e7e7' : theme.name === 'sepia' ? '#3b2f1e' : '#222222';
  const epubMuted = theme.name === 'dark' ? '#a2a2a2' : theme.name === 'sepia' ? '#796c52' : '#6f6f6f';
  const epubTopChrome = theme.name === 'dark' ? '#202020' : theme.name === 'sepia' ? '#f4ecd8' : '#ffffff';
  const epubContentVerticalInset = Math.max(insets.top, insets.bottom, 0) + EPUB_CONTENT_VERTICAL_OFFSET;
  const readerTopBarSideWidth = EPUB_TOP_BAR_SIDE_WIDTH;
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
  const pdfModalVisible = !isEpub && (
    bookmarksVisible
    || paginationSettingsVisible
    || pdfZoomVisible
    || brightnessVisible
    || notesVisible
    || detailVisible
    || editorVisible
    || noteToDelete !== null
    || previewNote !== null
  );
  const noteEditorPageNumber = editingNoteId && selectedNote?.pageNumber
    ? selectedNote.pageNumber
    : isEpub
      ? epubViewStatus?.currentPage
      : currentPage;

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

  const pdfBookmarks = usePdfBookmarks({
    bookId: book.id,
    enabled: !isEpub,
  });
  const readerBookmarks = isEpub ? epubPersistence.bookmarks : pdfBookmarks.bookmarks;
  const bookmarksHydrated = isEpub ? epubPersistence.hydrated : pdfBookmarks.hydrated;
  const bookmarkReadyToAdd = bookmarksHydrated && (isEpub
    ? !!epubPersistence.currentLocator
    : currentPage > 0);

  const readerNotes = useEpubNotes(book.id, isEpub ? 'epub' : 'pdf');

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

  const handleExternalLink = useCallback((url: string) => {
    void Linking.openURL(url).catch((caught: unknown) => {
      console.warn('[Krumer ReaderScreen] falha ao abrir link externo', caught);
    });
  }, []);

  useEffect(() => {
    if (!isEpub) {
      loadPdfProgress(book.id).then(setSavedPosition);
      return;
    }
    loadStoredReaderSettings().then(setReaderSettings);
  }, [book.id, isEpub]);

  useEffect(() => {
    if (isEpub) {
      setPdfPreferencesHydrated(true);
      return undefined;
    }

    const cachedPreferences = getCachedPdfPrefs();
    if (cachedPreferences) {
      setPdfDisplayMode(cachedPreferences.displayMode);
      setPdfOrientation(cachedPreferences.orientation);
      setPdfPreferencesHydrated(true);
      return undefined;
    }

    let active = true;
    setPdfPreferencesHydrated(false);
    void loadPdfPrefs()
      .then((preferences) => {
        if (active) {
          setPdfDisplayMode(preferences.displayMode);
          setPdfOrientation(preferences.orientation);
        }
      })
      .finally(() => {
        if (active) setPdfPreferencesHydrated(true);
      });
    return () => {
      active = false;
    };
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

  const handleAddBookmark = useCallback(() => {
    if (!bookmarkReadyToAdd || bookmarkBusy) return;
    setBookmarkBusy(true);
    const request = isEpub
      ? epubPersistence.addBookmark()
      : pdfBookmarks.addBookmark(currentPage);
    void request
      .catch((error) => console.warn('[Krumer ReaderScreen] falha ao criar marcador', error))
      .finally(() => setBookmarkBusy(false));
  }, [
    bookmarkBusy,
    bookmarkReadyToAdd,
    currentPage,
    epubPersistence.addBookmark,
    isEpub,
    pdfBookmarks.addBookmark,
  ]);

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
    setPreviewNote(note);
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
    if (editingNoteId) {
      await readerNotes.editNote(editingNoteId, content);
      setSelectedNote((current) => current && current.id === editingNoteId
        ? { ...current, content, updatedAt: new Date().toISOString() }
        : current);
    } else {
      const locator = isEpub ? epubPersistence.currentLocator : createPdfLocator(currentPage);
      if (!locator) return;
      const pageNumber = isEpub ? epubViewStatus?.currentPage ?? 1 : currentPage;
      await readerNotes.addNote(locator, content, pageNumber);
    }
    closeEditor();
  }, [
    closeEditor,
    currentPage,
    editingNoteId,
    epubPersistence.currentLocator,
    epubViewStatus?.currentPage,
    isEpub,
    noteDraft,
    readerNotes,
  ]);

  const requestDeleteNote = useCallback((note: ReaderNote) => {
    setNoteToDelete(note);
  }, []);

  const handleDeleteNote = useCallback(async () => {
    if (!noteToDelete) return;
    const id = noteToDelete.id;
    await readerNotes.removeNote(id);
    if (selectedNote?.id === id) {
      setDetailVisible(false);
      setSelectedNote(null);
    }
    setNoteToDelete(null);
  }, [noteToDelete, readerNotes, selectedNote?.id]);

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

  const saveProgress = useCallback(async (value: string, percent: number, page?: number, total?: number) => {
    setProgress(percent);
    if (page !== undefined) setCurrentPage(page);
    if (total !== undefined) setTotalPages(total);
    await savePdfProgress(book.id, value);
    await updateBookProgress(book.id, {
      progress: value,
      progressPct: Math.max(0, Math.min(100, percent * 100)),
      currentPage: page ?? book.currentPage ?? 0,
      totalPages: total ?? book.totalPages ?? null,
      cfi: book.format === 'epub' ? value : null,
      isRead: percent >= 1,
    });
  }, [book.currentPage, book.format, book.id, book.totalPages, updateBookProgress]);

  const handlePdfPageChange = useCallback((page: number, total: number) => {
    const nextProgress = total ? page / total : 0;
    setProgress(nextProgress);
    setCurrentPage(page);
    setTotalPages(total);
    pendingPdfProgressRef.current = { page, total };
    if (pdfProgressTimerRef.current) clearTimeout(pdfProgressTimerRef.current);
    pdfProgressTimerRef.current = setTimeout(() => {
      const pending = pendingPdfProgressRef.current;
      pendingPdfProgressRef.current = null;
      pdfProgressTimerRef.current = null;
      if (!pending) return;
      void saveProgress(
        String(pending.page),
        pending.total ? pending.page / pending.total : 0,
        pending.page,
        pending.total,
      );
    }, PDF_PROGRESS_SAVE_DELAY_MS);
  }, [saveProgress]);

  useEffect(() => () => {
    if (pdfProgressTimerRef.current) clearTimeout(pdfProgressTimerRef.current);
    const pending = pendingPdfProgressRef.current;
    pendingPdfProgressRef.current = null;
    if (pending) {
      void saveProgress(
        String(pending.page),
        pending.total ? pending.page / pending.total : 0,
        pending.page,
        pending.total,
      );
    }
  }, [saveProgress]);

  const updatePaginationPreferences = useCallback((patch: Partial<ReadingPreferences>) => {
    if (isEpub) {
      readingPreferences.updatePreferences(patch);
      return;
    }
    if (patch.displayMode) {
      setPdfDisplayMode(patch.displayMode);
      void savePdfDisplayMode(patch.displayMode);
    }
    if (patch.orientation) {
      setPdfOrientation(patch.orientation);
      void savePdfOrientation(patch.orientation);
    }
  }, [isEpub, readingPreferences.updatePreferences]);

  const updatePdfScale = useCallback((requestedScale: number) => {
    const nextScale = clampPdfScale(requestedScale);
    setPdfScale(nextScale);
    pdfReaderRef.current?.setScale(nextScale);
  }, []);

  const openPdfZoom = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPdfScale(pdfReaderRef.current?.getScale() ?? initialPdfPreferences.scale);
    setPdfZoomVisible(true);
  }, [initialPdfPreferences.scale]);

  const closePdfZoom = useCallback(() => {
    setPdfZoomVisible(false);
    scheduleHide();
  }, [scheduleHide]);

  const paginationPreferences: ReadingPreferences = isEpub
    ? readingPreferences.preferences
    : {
        ...readingPreferences.preferences,
        displayMode: pdfDisplayMode,
        doubleColumn: false,
        orientation: pdfOrientation,
      };

  function changeFontSize(delta: number) {
    setReaderSettings((prev) => {
      const next = { ...prev, fontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prev.fontSize + delta)) };
      saveStoredReaderSettings(next);
      return next;
    });
  }

  function changeLineHeight(delta: number) {
    setReaderSettings((prev) => {
      const raw = prev.lineHeight + delta;
      const clamped = Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, Math.round(raw * 10) / 10));
      const next = { ...prev, lineHeight: clamped };
      saveStoredReaderSettings(next);
      return next;
    });
  }

  // Brightness initialization (isAvailable + getBrightness)
  useEffect(() => {
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
        setBrightnessSupported(true);
        brightnessSupportedRef.current = true;
        if (Platform.OS === 'android') {
          originalBrightnessUsesSystemRef.current = await Brightness.isUsingSystemBrightnessAsync()
            .catch(() => null);
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
        if (mounted) {
          setBrightnessSupported(false);
          brightnessSupportedRef.current = false;
        }
      }
    })();
    return () => { mounted = false; };
  }, [brightnessAnim]);

  // Restore original brightness when leaving reader
  useEffect(() => {
    return () => {
      const original = originalBrightnessRef.current;
      if (original !== null && Number.isFinite(original)) {
        const restoreBrightness = Platform.OS === 'android' && originalBrightnessUsesSystemRef.current === true
          ? Brightness.restoreSystemBrightnessAsync()
          : Brightness.setBrightnessAsync(original);
        restoreBrightness.catch(() => {});
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

  const hasReadyPageCount = epubViewStatus?.paginationState === 'ready' && currentPage > 0 && totalPages > 0;

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <StatusBar hidden />

      {/* Reader content */}
      {book.format === 'pdf' ? (
        pdfPreferencesHydrated ? (
          <PdfReader
            displayMode={pdfDisplayMode}
            filePath={book.filePath}
            fileSize={book.fileSize}
            initialPage={savedPosition ? Number(savedPosition) : 1}
            interactionEnabled={!pdfModalVisible}
            onExternalLink={handleExternalLink}
            onPageChange={handlePdfPageChange}
            onCenterTap={toggleBars}
            ref={pdfReaderRef}
          />
        ) : (
          <View style={{ alignItems: 'center', backgroundColor: theme.bg, flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        )
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
              onExternalLink={handleExternalLink}
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
          backgroundColor: epubTopChrome,
          borderBottomColor: theme.border,
          borderBottomWidth: 0,
          elevation: 20,
          left: 0,
          opacity,
          paddingBottom: scaleEpubChrome(spacing.sm),
          paddingLeft: Math.max(insets.left, spacing.md),
          paddingRight: Math.max(insets.right, spacing.md),
          paddingTop: Math.max(insets.top, scaleEpubChrome(Platform.OS === 'ios' ? 44 : 24)) + scaleEpubChrome(spacing.xs),
          position: 'absolute',
          right: 0,
          top: 0,
          zIndex: 100,
        }}
      >
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
          <View style={{ flexDirection: 'row', width: 88 }}>
            <Pressable
              accessibilityLabel={t('reader.addBookmark')}
              disabled={!bookmarkReadyToAdd || bookmarkBusy}
              hitSlop={6}
              onPress={handleAddBookmark}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: scaleEpubChrome(40),
                justifyContent: 'center',
                opacity: !bookmarkReadyToAdd || bookmarkBusy ? 0.32 : pressed ? 0.55 : 1,
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
                fill={readerBookmarks.length ? epubText : 'transparent'}
                size={20}
                strokeWidth={1.7}
              />
            </Pressable>
          </View>

          <Text
            numberOfLines={1}
            style={{
              color: epubMuted,
              fontFamily: serifFont,
              fontSize: 12,
              height: scaleEpubChrome(40),
              includeFontPadding: false,
              left: readerTopBarSideWidth,
              position: 'absolute',
              right: readerTopBarSideWidth,
              textAlign: 'center',
              textAlignVertical: 'center',
            }}
          >
            {book.title}
          </Text>

          <View style={{ flexDirection: 'row', marginLeft: 'auto', width: readerTopBarSideWidth }}>
            {isEpub ? (
              <ReadingSettingsButton
                color={epubText}
                onPress={() => {
                  if (hideTimer.current) clearTimeout(hideTimer.current);
                  setSettingsVisible(true);
                }}
              />
            ) : null}
            {!isEpub ? <PdfZoomButton color={epubText} onPress={openPdfZoom} /> : null}
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
                height: 36,
                justifyContent: 'center',
                opacity: pressed ? 0.5 : 1,
                width: 44,
              })}
            >
              <X color={epubText} size={20} strokeWidth={1.7} />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* Bottom bar compartilhada pelos leitores. */}
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
            {isEpub ? (
              <Pressable
                accessibilityLabel={t('reader.topics')}
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
            ) : null}

            {isEpub ? (
              <LayoutSettingsButton
                color={epubText}
                onPress={() => {
                  if (hideTimer.current) clearTimeout(hideTimer.current);
                  setLayoutSettingsVisible(true);
                }}
              />
            ) : null}

            <Pressable
              accessibilityLabel={t('reader.notes')}
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
              accessibilityLabel={t('reader.brightness')}
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

      <ActionSheetModal backdropColor="rgba(0,0,0,0.53)" onClose={closeBookmarks} visible={bookmarksVisible}>
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

            {!bookmarksHydrated ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                <ActivityIndicator color={theme.accent} size="small" />
              </View>
            ) : readerBookmarks.length ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {readerBookmarks.map((bookmark, index) => {
                  const locator = bookmark.locator;
                  const createdAt = new Date(bookmark.createdAt).toLocaleString();
                  const pageLabel = locator.format === 'pdf'
                    ? t('reader.pageWithNumber').replace('{0}', String(locator.page))
                    : null;
                  const bookmarkLabel = bookmark.label?.trim();
                  const bookmarkTitle = locator.format === 'pdf'
                    ? bookmarkLabel || pageLabel
                    : (bookmark.label || locator.excerpt).replace(/\s+/g, ' ').trim()
                      || `${t('reader.bookmarks')} ${readerBookmarks.length - index}`;
                  const bookmarkDetails = locator.format === 'pdf'
                    ? `${bookmarkLabel ? `${pageLabel} · ` : ''}${createdAt}`
                    : `${locator.totalProgression === null ? '' : `${Math.round(locator.totalProgression * 100)}%  `}${createdAt}`;
                  return (
                    <Pressable
                      key={bookmark.id}
                      accessibilityRole="button"
                      onPress={() => {
                        if (locator.format === 'pdf') {
                          closeBookmarks();
                          pdfReaderRef.current?.goToPage(locator.page);
                          return;
                        }
                        epubReaderRef.current?.goToLocator(locator);
                        closeBookmarks();
                      }}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: pressed ? theme.card : 'transparent',
                        borderBottomColor: theme.border,
                        borderBottomWidth: index === readerBookmarks.length - 1 ? 0 : 1,
                        flexDirection: 'row',
                        gap: spacing.md,
                        minHeight: 68,
                        paddingVertical: spacing.sm,
                      })}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text numberOfLines={2} style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, lineHeight: 19 }}>
                          {bookmarkTitle}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11 }}>
                          {bookmarkDetails}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={t('reader.removeBookmark')}
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          const removeBookmark = locator.format === 'pdf'
                            ? pdfBookmarks.removeBookmark
                            : epubPersistence.removeBookmark;
                          void removeBookmark(bookmark.id)
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
                  {t('reader.topics')}
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
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13 }}>{t('reader.loadingTopics')}</Text>
              </View>
            ) : tocItems && tocItems.length ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {renderTocItems(tocItems)}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <ListTree color={theme.textMuted} size={26} />
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13, textAlign: 'center' }}>
                  {t('reader.noTopics')}
                </Text>
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, textAlign: 'center', opacity: 0.7 }}>
                  {t('reader.noToc')}
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
        visible={brightnessVisible}
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
                  {t('reader.brightness')}
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
                  {t('reader.brightnessUnavailable')}
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
          void saveStoredReaderSettings(defaults);
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
        onUpdatePreferences={updatePaginationPreferences}
        preferences={paginationPreferences}
        showColumnOptions={isEpub}
        visible={paginationSettingsVisible}
      />

      <PdfZoomModal
        onChange={updatePdfScale}
        onClose={closePdfZoom}
        onReset={() => updatePdfScale(PDF_DEFAULTS.scale)}
        scale={pdfScale}
        visible={pdfZoomVisible && !isEpub}
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
            void saveStoredReaderSettings(next);
            return next;
          });
        }}
        onUpdateSettings={readerLayout.updateSettings}
        settings={readerLayout.settings}
        visible={layoutSettingsVisible && isEpub}
      />

      {/* Notes List Modal */}
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={closeNotes}
        statusBarTranslucent
        transparent
        visible={notesVisible}
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
                minHeight: readerNotes.notes.length === 0 ? 300 : undefined,
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
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>{t('reader.notes')}</Text>
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>({readerNotes.notes.length})</Text>
                </View>
                <Pressable hitSlop={10} onPress={closeNotes} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}>
                  <X color={theme.textSecondary} size={20} />
                </Pressable>
              </View>

              {readerNotes.notes.length === 0 ? (
                <View style={{ alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.xl }}>
                  <StickyNote color={theme.textMuted} size={32} strokeWidth={1.5} />
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{t('reader.noNotes')}</Text>
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, lineHeight: 17, opacity: 0.8, textAlign: 'center' }}>{t('reader.noNotesHint')}</Text>
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
                    <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{t('reader.newNote')}</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                    {readerNotes.notes.map((note, index) => {
                      const preview = note.content.length > 80 ? note.content.slice(0, 80).trim() + '…' : note.content;
                      const pageLabel = note.pageNumber
                        ? t('reader.pageWithNumber').replace('{0}', String(note.pageNumber))
                        : t('reader.pageUnavailable');
                      const dateLabel = new Date(note.createdAt).toLocaleDateString();
                      return (
                        <Pressable
                          key={note.id}
                          accessibilityRole="button"
                          onPress={() => handleSelectNote(note)}
                          style={({ pressed }) => ({
                            backgroundColor: pressed ? theme.surface : 'transparent',
                            borderBottomColor: theme.border,
                            borderBottomWidth: index === readerNotes.notes.length - 1 ? 0 : 1,
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
                            onPress={(e) => { e.stopPropagation(); requestDeleteNote(note); }}
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
                    <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{t('reader.newNote')}</Text>
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
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, fontWeight: '700' }}>{t('reader.note')}</Text>
                  {selectedNote?.pageNumber ? (
                    <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11 }}>{t('reader.pageWithNumber').replace('{0}', String(selectedNote.pageNumber))}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <Pressable
                    accessibilityLabel={t('reader.goToNotePage')}
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
                    {new Date(selectedNote.createdAt).toLocaleString()} {selectedNote.pageNumber ? ` · ${t('reader.pageWithNumber').replace('{0}', String(selectedNote.pageNumber))}` : ''}
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
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>{t('reader.editNote')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => selectedNote && requestDeleteNote(selectedNote)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? '#991b1b' : '#dc2626',
                    borderRadius: radii.sm,
                    opacity: pressed ? 0.85 : 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{t('common.delete')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      {/* Delete Note Confirmation Modal */}
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={() => setNoteToDelete(null)}
        statusBarTranslucent
        transparent
        visible={!!noteToDelete}
      >
        <View style={{ backgroundColor: 'rgba(0, 0, 0, 0.48)', flex: 1 }}>
          <Pressable onPress={() => setNoteToDelete(null)} style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg }}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderRadius: radii.lg,
                borderWidth: 1,
                maxWidth: 480,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.xl,
                width: '94%',
              }}
            >
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
                {t('reader.deleteNote')}
              </Text>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14, lineHeight: 20, marginTop: spacing.sm }}>
                {t('reader.deleteNoteConfirm')}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }}>
                <Pressable
                  onPress={() => setNoteToDelete(null)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? theme.border : theme.surface,
                    borderColor: theme.border,
                    borderRadius: radii.sm,
                    borderWidth: 1,
                    opacity: pressed ? 0.8 : 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { void handleDeleteNote(); }}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? '#991b1b' : '#dc2626',
                    borderRadius: radii.sm,
                    opacity: pressed ? 0.85 : 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{t('common.delete')}</Text>
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
                    {editingNoteId ? t('reader.editNoteTitle') : t('reader.newNote')}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={closeEditor} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}>
                  <X color={theme.textSecondary} size={20} />
                </Pressable>
              </View>

              <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, marginBottom: spacing.sm }}>
                {noteEditorPageNumber
                  ? t('reader.pageWithNumber').replace('{0}', String(noteEditorPageNumber))
                  : t('reader.currentPage')}
                {' · '}{t('reader.noteWillBeSaved')}
              </Text>

              <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, height: 180, padding: spacing.sm }}>
                <TextInput
                  autoFocus
                  multiline
                  onChangeText={setNoteDraft}
                  placeholder={t('reader.writeNotePlaceholder')}
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
                  <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>{t('common.cancel')}</Text>
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
                  <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{editingNoteId ? t('reader.saveNote') : t('reader.createNote')}</Text>
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
        visible={!!previewNote}
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
                    {t('reader.notePageTitle')}
                  </Text>
                  <Text numberOfLines={1} style={{ color: epubMuted, fontFamily: serifFont, fontSize: 11 }}>
                    {previewNote?.pageNumber
                      ? t('reader.pageWithNumber').replace('{0}', String(previewNote.pageNumber))
                      : t('reader.savedPage')}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={closePreview} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: spacing.xs })}>
                  <X color={epubText} size={20} strokeWidth={1.7} />
                </Pressable>
              </View>

              {previewNote ? (
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
                      {previewNote.locator.format === 'epub' ? (
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
                      ) : (
                        <PdfReader
                          displayMode="paginated"
                          filePath={book.filePath}
                          fileSize={book.fileSize}
                          initialPage={previewNote.locator.page}
                          interactionEnabled={false}
                        />
                      )}
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
