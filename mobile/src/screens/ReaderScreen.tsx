import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, MoreVertical, Settings } from 'lucide-react-native';
import { EpubReader } from '../readers/EpubReader';
import { PdfReader } from '../readers/PdfReader';
import { ThemeCard } from '../components/ThemeCard';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import { radii, serifFont, spacing, type ThemeName } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

export function ReaderScreen({ navigation, route }: Props) {
  const { book } = route.params;
  const { preferences, setThemeName, theme, t } = useApp();
  const [progress, setProgress] = useState(0);
  const [savedPosition, setSavedPosition] = useState<string | null>(book.progress);
  const [barsVisible, setBarsVisible] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(`progress_${book.id}`).then(setSavedPosition);
  }, [book.id]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBars(false), 3000);
  }

  function setBars(visible: boolean) {
    setBarsVisible(visible);
    Animated.timing(opacity, {
      duration: 180,
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
    }).start();
    if (visible) scheduleHide();
  }

  async function saveProgress(value: string, percent: number) {
    setProgress(percent);
    await AsyncStorage.setItem(`progress_${book.id}`, value);
  }

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <Pressable onPress={() => setBars(!barsVisible)} style={{ flex: 1 }}>
        {book.format === 'pdf' ? (
          <PdfReader
            filePath={book.filePath}
            initialPage={savedPosition ? Number(savedPosition) : 1}
            onPageChange={(page, total) => saveProgress(String(page), total ? page / total : 0)}
          />
        ) : (
          <EpubReader
            filePath={book.filePath}
            savedCfi={savedPosition}
            themeName={preferences.theme}
            onLocationChange={(cfi, percentage) => saveProgress(cfi, percentage)}
          />
        )}
      </Pressable>
      <Animated.View
        pointerEvents={barsVisible ? 'auto' : 'none'}
        style={{
          backgroundColor: theme.surface,
          borderBottomColor: theme.border,
          borderBottomWidth: 1,
          left: 0,
          opacity,
          padding: spacing.md,
          paddingTop: spacing.xl,
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <ArrowLeft color={theme.textPrimary} size={22} />
          </Pressable>
          <Text numberOfLines={1} style={{ color: theme.textPrimary, flex: 1, fontFamily: serifFont, fontSize: 15, fontWeight: '600' }}>
            {book.title}
          </Text>
          <Pressable onPress={() => setSettingsVisible(true)} hitSlop={10}>
            <MoreVertical color={theme.textPrimary} size={22} />
          </Pressable>
        </View>
      </Animated.View>
      <Animated.View
        pointerEvents={barsVisible ? 'auto' : 'none'}
        style={{
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          bottom: 0,
          flexDirection: 'row',
          gap: spacing.md,
          left: 0,
          opacity,
          padding: spacing.md,
          position: 'absolute',
          right: 0,
        }}
      >
        <View style={{ backgroundColor: theme.border, borderRadius: radii.sm, flex: 1, height: 8, overflow: 'hidden' }}>
          <View style={{ backgroundColor: theme.accent, height: '100%', width: `${Math.round(progress * 100)}%` }} />
        </View>
        <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 12, fontWeight: '700' }}>{Math.round(progress * 100)}%</Text>
        <Pressable onPress={() => setSettingsVisible(true)} hitSlop={10}>
          <Settings color={theme.textSecondary} size={18} />
        </Pressable>
      </Animated.View>
      <Modal animationType="slide" transparent visible={settingsVisible} onRequestClose={() => setSettingsVisible(false)}>
        <Pressable onPress={() => setSettingsVisible(false)} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderTopLeftRadius: radii.lg,
              borderTopRightRadius: radii.lg,
              borderWidth: 1,
              gap: spacing.lg,
              padding: spacing.lg,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>{t('reader.readingSettings')}</Text>
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont }}>{t('reader.fontSize')}</Text>
            <View style={{ backgroundColor: theme.border, borderRadius: radii.sm, height: 6 }}>
              <View style={{ backgroundColor: theme.accent, borderRadius: radii.sm, height: 6, width: '55%' }} />
            </View>
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont }}>{t('reader.spacing')}</Text>
            <View style={{ backgroundColor: theme.border, borderRadius: radii.sm, height: 6 }}>
              <View style={{ backgroundColor: theme.accent, borderRadius: radii.sm, height: 6, width: '45%' }} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['dark', 'light', 'sepia'] as ThemeName[]).map((name) => (
                <ThemeCard key={name} value={name} selected={preferences.theme === name} onPress={setThemeName} />
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
