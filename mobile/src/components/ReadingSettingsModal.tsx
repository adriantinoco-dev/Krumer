import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Minus, Plus, Type, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import type { ReadingPreferences } from '../models/readingPreferences';
import { useReaderFonts } from '../readers/readerFonts';
import { radii, serifFont, spacing, type ThemeName } from '../theme';
import { FontFamilySelector } from './FontFamilySelector';
import { FontWeightSlider } from './FontWeightSlider';
import { ThemeCard } from './ThemeCard';

type Props = {
  fontSize: number;
  fontSizeMax: number;
  fontSizeMin: number;
  lineHeight: number;
  lineHeightMax: number;
  lineHeightMin: number;
  preferences: ReadingPreferences;
  visible: boolean;
  onChangeFontSize: (delta: number) => void;
  onChangeLineHeight: (delta: number) => void;
  onClose: () => void;
  onReset: () => void;
  onUpdatePreferences: (patch: Partial<ReadingPreferences>) => void;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { theme } = useApp();
  return (
    <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>
      {children}
    </Text>
  );
}

export function ReadingSettingsModal({
  fontSize,
  fontSizeMax,
  fontSizeMin,
  lineHeight,
  lineHeightMax,
  lineHeightMin,
  preferences: readingPreferences,
  visible,
  onChangeFontSize,
  onChangeLineHeight,
  onClose,
  onReset,
  onUpdatePreferences,
}: Props) {
  const { preferences, setThemeName, theme, t } = useApp();
  useReaderFonts();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={{ backgroundColor: '#00000066', flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            borderWidth: 1,
            maxHeight: '88%',
            overflow: 'hidden',
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? spacing.md : spacing.sm),
          }}
        >
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <View style={{ alignSelf: 'center', backgroundColor: theme.border, borderRadius: 2, height: 4, marginBottom: spacing.sm, width: 36 }} />
            <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
                {t('reader.fontSettings')}
              </Text>
              <Pressable accessibilityLabel={t('common.cancel')} hitSlop={10} onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1, padding: spacing.xs })}>
                <X color={theme.textSecondary} size={20} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: spacing.sm }}>
              <SectionTitle>{t('reader.fontFamily')}</SectionTitle>
              <FontFamilySelector
                onChange={(fontFamily) => onUpdatePreferences({ fontFamily })}
                value={readingPreferences.fontFamily}
              />
            </View>

            <View style={{ gap: spacing.sm }}>
              <SectionTitle>{t('reader.fontWeight')}</SectionTitle>
              <FontWeightSlider
                family={readingPreferences.fontFamily}
                onChange={(fontWeight) => onUpdatePreferences({ fontWeight })}
                value={readingPreferences.fontWeight}
              />
            </View>

            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.sm }}>
                <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.xs }}>
                    <Type color={theme.textSecondary} size={14} />
                    <SectionTitle>{t('reader.fontSize')}</SectionTitle>
                  </View>
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>{fontSize}px</Text>
                </View>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <Pressable
                    disabled={fontSize <= fontSizeMin}
                    onPress={() => onChangeFontSize(-2)}
                    style={({ pressed }) => ({
                      alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.sm,
                      borderWidth: 1, height: 36, justifyContent: 'center', opacity: pressed ? 0.6 : fontSize <= fontSizeMin ? 0.3 : 1, width: 36,
                    })}
                  >
                    <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, fontWeight: '700' }}>A</Text>
                  </Pressable>
                  <View style={{ backgroundColor: theme.border, borderRadius: radii.sm, flex: 1, height: 6, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: theme.accent, borderRadius: radii.sm, height: '100%', width: `${((fontSize - fontSizeMin) / (fontSizeMax - fontSizeMin)) * 100}%` }} />
                  </View>
                  <Pressable
                    disabled={fontSize >= fontSizeMax}
                    onPress={() => onChangeFontSize(2)}
                    style={({ pressed }) => ({
                      alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.sm,
                      borderWidth: 1, height: 36, justifyContent: 'center', opacity: pressed ? 0.6 : fontSize >= fontSizeMax ? 0.3 : 1, width: 36,
                    })}
                  >
                    <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 20, fontWeight: '700' }}>A</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: spacing.sm }}>
                <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <SectionTitle>{t('reader.spacing')}</SectionTitle>
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>{lineHeight.toFixed(1)}</Text>
                </View>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <Pressable
                    disabled={lineHeight <= lineHeightMin}
                    onPress={() => onChangeLineHeight(-0.2)}
                    style={({ pressed }) => ({
                      alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.sm,
                      borderWidth: 1, height: 36, justifyContent: 'center', opacity: pressed ? 0.6 : lineHeight <= lineHeightMin ? 0.3 : 1, width: 36,
                    })}
                  >
                    <Minus color={theme.textPrimary} size={16} />
                  </Pressable>
                  <View style={{ backgroundColor: theme.border, borderRadius: radii.sm, flex: 1, height: 6, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: theme.accent, borderRadius: radii.sm, height: '100%', width: `${((lineHeight - lineHeightMin) / (lineHeightMax - lineHeightMin)) * 100}%` }} />
                  </View>
                  <Pressable
                    disabled={lineHeight >= lineHeightMax}
                    onPress={() => onChangeLineHeight(0.2)}
                    style={({ pressed }) => ({
                      alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.sm,
                      borderWidth: 1, height: 36, justifyContent: 'center', opacity: pressed ? 0.6 : lineHeight >= lineHeightMax ? 0.3 : 1, width: 36,
                    })}
                  >
                    <Plus color={theme.textPrimary} size={16} />
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <SectionTitle>{t('theme.label')}</SectionTitle>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['dark', 'light', 'sepia'] as ThemeName[]).map((name) => (
                  <ThemeCard key={name} onPress={setThemeName} selected={preferences.theme === name} value={name} />
                ))}
              </View>
            </View>

            <Pressable
              onPress={onReset}
              style={({ pressed }) => ({
                alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md,
                borderWidth: 1, opacity: pressed ? 0.6 : 1, paddingVertical: spacing.sm,
              })}
            >
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>{t('reader.resetDefaults')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
