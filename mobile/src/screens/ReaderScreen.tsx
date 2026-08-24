import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StatusBar, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Minus, Plus, Settings, Type } from 'lucide-react-native';
import { EpubReader } from '../readers/EpubReader';
import { PdfReader } from '../readers/PdfReader';
import { ThemeCard } from '../components/ThemeCard';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import { radii, serifFont, spacing, type ThemeName } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_DEFAULT = 18;
const LINE_HEIGHT_MIN = 1.0;
const LINE_HEIGHT_MAX = 2.4;
const LINE_HEIGHT_STEP = 0.2;
const LINE_HEIGHT_DEFAULT = 1.5;
const HIDE_DELAY = 4000;
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
  const { preferences, setThemeName, theme, t, updateBookProgress } = useApp();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState((book.progressPct ?? 0) / 100);
  const [savedPosition, setSavedPosition] = useState<string | null>(book.progress);
  const [barsVisible, setBarsVisible] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(book.currentPage ?? 1);
  const [totalPages, setTotalPages] = useState(book.totalPages ?? 0);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>({
    fontSize: FONT_SIZE_DEFAULT,
    lineHeight: LINE_HEIGHT_DEFAULT,
  });
  const opacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(`progress_${book.id}`).then(setSavedPosition);
    loadReaderSettings().then(setReaderSettings);
  }, [book.id]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBars(false), HIDE_DELAY);
  }, []);

  function setBars(visible: boolean) {
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

  const isEpub = book.format === 'epub';
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
        <View style={{ flex: 1 }}>
          <EpubReader
            filePath={book.filePath}
            savedCfi={savedPosition}
            themeName={preferences.theme}
            fontSize={readerSettings.fontSize}
            lineHeight={readerSettings.lineHeight}
            onLocationChange={(cfi, percentage, locIndex, totalLocs) => {
              const page = locIndex !== undefined ? locIndex + 1 : undefined;
              saveProgress(cfi, percentage, page, totalLocs);
            }}
            onLocationsReady={(totalLocs) => {
              setTotalPages(totalLocs);
            }}
            onCenterTap={toggleBars}
          />
        </View>
      )}

      {/* Top bar */}
      <Animated.View
        pointerEvents={barsVisible ? 'auto' : 'none'}
        style={{
          backgroundColor: theme.surface + 'ee',
          borderBottomColor: theme.border,
          borderBottomWidth: 1,
          left: 0,
          opacity,
          paddingBottom: spacing.sm,
          paddingLeft: Math.max(insets.left, spacing.md),
          paddingRight: Math.max(insets.right, spacing.md),
          paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24) + spacing.xs,
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      >
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
            <ArrowLeft color={theme.textPrimary} size={22} />
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
      </Animated.View>

      {/* Bottom bar */}
      <Animated.View
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
            {!isEpub && totalPages
              ? `${t('reader.page')} ${currentPage} / ${totalPages}`
              : isEpub && totalPages && currentPage
              ? `${t('reader.page')} ${currentPage} / ${totalPages} · ${progressPercent}%`
              : `${progressPercent}%`}
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
      </Animated.View>

      {/* Settings Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={settingsVisible}
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
          style={{ flex: 1, justifyContent: 'flex-end' }}
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

            {/* Font size controls — only for EPUB */}
            {isEpub ? (
              <View style={{ gap: spacing.md }}>
                {/* Font size */}
                <View style={{ gap: spacing.sm }}>
                  <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.xs }}>
                      <Type color={theme.textSecondary} size={14} />
                      <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>
                        {t('reader.fontSize')}
                      </Text>
                    </View>
                    <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
                      {readerSettings.fontSize}px
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                    <Pressable
                      onPress={() => changeFontSize(-FONT_SIZE_STEP)}
                      disabled={readerSettings.fontSize <= FONT_SIZE_MIN}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        borderRadius: radii.sm,
                        borderWidth: 1,
                        height: 36,
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : readerSettings.fontSize <= FONT_SIZE_MIN ? 0.3 : 1,
                        width: 36,
                      })}
                    >
                      <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, fontWeight: '700' }}>A</Text>
                    </Pressable>
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
                          width: `${((readerSettings.fontSize - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)) * 100}%`,
                        }}
                      />
                    </View>
                    <Pressable
                      onPress={() => changeFontSize(FONT_SIZE_STEP)}
                      disabled={readerSettings.fontSize >= FONT_SIZE_MAX}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        borderRadius: radii.sm,
                        borderWidth: 1,
                        height: 36,
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : readerSettings.fontSize >= FONT_SIZE_MAX ? 0.3 : 1,
                        width: 36,
                      })}
                    >
                      <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 20, fontWeight: '700' }}>A</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Line spacing */}
                <View style={{ gap: spacing.sm }}>
                  <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>
                      {t('reader.spacing')}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
                      {readerSettings.lineHeight.toFixed(1)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                    <Pressable
                      onPress={() => changeLineHeight(-LINE_HEIGHT_STEP)}
                      disabled={readerSettings.lineHeight <= LINE_HEIGHT_MIN}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        borderRadius: radii.sm,
                        borderWidth: 1,
                        height: 36,
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : readerSettings.lineHeight <= LINE_HEIGHT_MIN ? 0.3 : 1,
                        width: 36,
                      })}
                    >
                      <Minus color={theme.textPrimary} size={16} />
                    </Pressable>
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
                          width: `${((readerSettings.lineHeight - LINE_HEIGHT_MIN) / (LINE_HEIGHT_MAX - LINE_HEIGHT_MIN)) * 100}%`,
                        }}
                      />
                    </View>
                    <Pressable
                      onPress={() => changeLineHeight(LINE_HEIGHT_STEP)}
                      disabled={readerSettings.lineHeight >= LINE_HEIGHT_MAX}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        borderRadius: radii.sm,
                        borderWidth: 1,
                        height: 36,
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : readerSettings.lineHeight >= LINE_HEIGHT_MAX ? 0.3 : 1,
                        width: 36,
                      })}
                    >
                      <Plus color={theme.textPrimary} size={16} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

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

            {/* Reset button for EPUB */}
            {isEpub ? (
              <Pressable
                onPress={() => {
                  const defaults = { fontSize: FONT_SIZE_DEFAULT, lineHeight: LINE_HEIGHT_DEFAULT };
                  setReaderSettings(defaults);
                  saveReaderSettings(defaults);
                }}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  opacity: pressed ? 0.6 : 1,
                  paddingVertical: spacing.sm,
                })}
              >
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>
                  {t('reader.resetDefaults')}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
