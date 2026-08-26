import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, Modal, Platform, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Bookmark, BookmarkPlus, ChevronLeft, ChevronRight, Settings, Trash2, X } from 'lucide-react-native';
import { ReadingSettingsButton } from '../components/ReadingSettingsButton';
import { ReadingSettingsModal } from '../components/ReadingSettingsModal';
import { EpubReader, type EpubReaderHandle } from '../readers/EpubReader';
import type { EpubRelocationSource, EpubViewStatus } from '../readers/epubBridge';
import { PdfReader } from '../readers/PdfReader';
import { useEpubPersistence } from '../readers/useEpubPersistence';
import { useOrientation } from '../readers/useOrientation';
import { useReadingPreferences } from '../readers/useReadingPreferences';
import { ThemeCard } from '../components/ThemeCard';
import { useApp } from '../context/AppContext';
import type { EpubLocator } from '../models/reader';
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
const EPUB_CONTENT_TOP_OFFSET = 72;
const READER_SETTINGS_KEY = 'krumer.reader.settings';

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
  const { isLandscape } = useOrientation();
  const readingPreferences = useReadingPreferences(isEpub);
  const [progress, setProgress] = useState((book.progressPct ?? 0) / 100);
  const [savedPosition, setSavedPosition] = useState<string | null>(book.progress);
  const [barsVisible, setBarsVisible] = useState(book.format !== 'epub');
  const [bookmarksVisible, setBookmarksVisible] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(book.currentPage ?? 1);
  const [totalPages, setTotalPages] = useState(book.totalPages ?? 0);
  const [epubViewStatus, setEpubViewStatus] = useState<EpubViewStatus | null>(null);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>({
    fontSize: FONT_SIZE_DEFAULT,
    lineHeight: LINE_HEIGHT_DEFAULT,
  });
  const opacity = useRef(new Animated.Value(book.format === 'epub' ? 0 : 1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epubReaderRef = useRef<EpubReaderHandle>(null);
  const allowControlledCloseRef = useRef(false);
  const controlledCloseInFlightRef = useRef(false);
  const epubBackground = theme.name === 'dark' ? '#202020' : theme.name === 'sepia' ? '#f4ecd8' : '#ffffff';
  const epubText = theme.name === 'dark' ? '#e7e7e7' : theme.name === 'sepia' ? '#3b2f1e' : '#222222';
  const epubMuted = theme.name === 'dark' ? '#a2a2a2' : theme.name === 'sepia' ? '#796c52' : '#6f6f6f';
  const epubTopChrome = theme.name === 'dark' ? '#202020' : theme.name === 'sepia' ? '#f4ecd8' : '#ffffff';
  const epubBottomChrome = theme.name === 'dark' ? '#2a2a2af5' : theme.name === 'sepia' ? '#e6dab8f5' : '#f4f4f4f5';

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

  const progressPercent = Math.round(progress * 100);

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <StatusBar hidden={!barsVisible} animated />

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
            paddingBottom: Math.max(insets.bottom, 0) + 48,
            paddingHorizontal: 24,
            paddingTop: Math.max(insets.top, 0) + EPUB_CONTENT_TOP_OFFSET,
          }}
        >
          {epubPersistence.hydrated && readingPreferences.hydrated ? (
            <EpubReader
              ref={epubReaderRef}
              bookId={book.id}
              filePath={book.filePath}
              fileSize={book.fileSize}
              fontSize={readerSettings.fontSize}
              initialLocator={epubPersistence.initialLocator}
              isLandscape={isLandscape}
              lineHeight={readerSettings.lineHeight}
              onCenterTap={toggleBars}
              onPositionStabilized={handleEpubPositionStabilized}
              onRelocate={handleEpubRelocate}
              onViewStatus={handleEpubViewStatus}
              readingPreferences={readingPreferences.preferences}
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
        <View pointerEvents="none" style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: epubMuted,
              fontFamily: serifFont,
              fontSize: 11,
              left: Math.max(insets.left, 0) + 24,
              maxWidth: '72%',
              opacity: 0.68,
              position: 'absolute',
              textTransform: 'uppercase',
              top: Math.max(insets.top, 0) + 16,
            }}
          >
            {epubViewStatus?.chapterTitle || book.title}
          </Text>
          {epubViewStatus ? (
            <Text
              style={{
                bottom: Math.max(insets.bottom, 0) + 16,
                color: epubMuted,
                fontFamily: serifFont,
                fontSize: 11,
                opacity: 0.62,
                position: 'absolute',
                right: Math.max(insets.right, 0) + 24,
              }}
            >
              {readingPreferences.preferences.displayMode === 'scroll'
                ? `${progressPercent}%`
                : `${epubViewStatus.currentPage} / ${epubViewStatus.totalPages}`}
            </Text>
          ) : null}
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
          paddingBottom: spacing.sm,
          paddingLeft: Math.max(insets.left, spacing.md),
          paddingRight: Math.max(insets.right, spacing.md),
          paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24) + spacing.xs,
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
              minHeight: 44,
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
                height: 40,
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
                height: 40,
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
            <Pressable
              accessibilityLabel={t('common.cancel')}
              hitSlop={8}
              onPress={() => navigation.goBack()}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: 40,
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

      {/* Bottom bar */}
      <Animated.View
        onTouchStart={scheduleHide}
        pointerEvents={barsVisible ? 'auto' : 'none'}
        style={{
          backgroundColor: isEpub ? epubBottomChrome : theme.surface + 'ee',
          borderTopColor: theme.border,
          borderTopWidth: isEpub ? 0 : 1,
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
        {isEpub ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 48 }}>
            {readingPreferences.preferences.displayMode === 'paginated' ? (
              <Pressable
                accessibilityLabel={t('reader.previousPage')}
                hitSlop={8}
                onPress={() => epubReaderRef.current?.previous()}
                style={({ pressed }) => ({
                  alignItems: 'center', height: 44, justifyContent: 'center', opacity: pressed ? 0.5 : 1, width: 48,
                })}
              >
                <ChevronLeft color={epubText} size={24} strokeWidth={1.8} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ backgroundColor: epubMuted + '55', borderRadius: 2, height: 3, overflow: 'hidden' }}>
                <View style={{ backgroundColor: theme.accent, height: '100%', width: `${progressPercent}%` }} />
              </View>
              <Text style={{ color: epubMuted, fontFamily: serifFont, fontSize: 10, textAlign: 'center' }}>
                {readingPreferences.preferences.displayMode === 'scroll'
                  ? `${progressPercent}%`
                  : epubViewStatus
                  ? `${epubViewStatus.currentPage} / ${epubViewStatus.totalPages}`
                  : `${progressPercent}%`}
              </Text>
            </View>
            {readingPreferences.preferences.displayMode === 'paginated' ? (
              <Pressable
                accessibilityLabel={t('reader.nextPage')}
                hitSlop={8}
                onPress={() => epubReaderRef.current?.next()}
                style={({ pressed }) => ({
                  alignItems: 'center', height: 44, justifyContent: 'center', opacity: pressed ? 0.5 : 1, width: 48,
                })}
              >
                <ChevronRight color={epubText} size={24} strokeWidth={1.8} />
              </Pressable>
            ) : null}
          </View>
        ) : (
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
        )}
      </Animated.View>

      <Modal
        animationType="slide"
        transparent
        visible={bookmarksVisible && isEpub}
        onRequestClose={closeBookmarks}
      >
        <Pressable
          onPress={closeBookmarks}
          style={{ backgroundColor: '#00000088', flex: 1, justifyContent: 'flex-end' }}
        >
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
        </Pressable>
      </Modal>

      <ReadingSettingsModal
        fontSize={readerSettings.fontSize}
        fontSizeMax={FONT_SIZE_MAX}
        fontSizeMin={FONT_SIZE_MIN}
        isLandscape={isLandscape}
        lineHeight={readerSettings.lineHeight}
        lineHeightMax={LINE_HEIGHT_MAX}
        lineHeightMin={LINE_HEIGHT_MIN}
        onChangeFontSize={changeFontSize}
        onChangeLineHeight={changeLineHeight}
        onClose={() => {
          setSettingsVisible(false);
          scheduleHide();
        }}
        onReset={() => {
          const defaults = { fontSize: FONT_SIZE_DEFAULT, lineHeight: LINE_HEIGHT_DEFAULT };
          setReaderSettings(defaults);
          void saveReaderSettings(defaults);
          readingPreferences.resetPreferences();
        }}
        onUpdatePreferences={readingPreferences.updatePreferences}
        preferences={readingPreferences.preferences}
        visible={settingsVisible && isEpub}
      />

      {/* PDF settings modal */}
      <Modal
        animationType="slide"
        transparent
        visible={settingsVisible && !isEpub}
        onRequestClose={() => {
          setSettingsVisible(false);
          scheduleHide();
        }}
      >
        <Pressable
          onPress={() => {
            setSettingsVisible(false);
            scheduleHide();
          }}
          style={{ backgroundColor: '#00000088', flex: 1, justifyContent: 'flex-end' }}
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
        </Pressable>
      </Modal>
    </View>
  );
}
