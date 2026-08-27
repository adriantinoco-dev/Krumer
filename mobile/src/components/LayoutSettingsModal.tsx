import React from 'react';
import { Minus, Plus, X } from 'lucide-react-native';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { DEFAULT_READER_LAYOUT_SETTINGS, type ReaderLayoutSettings } from '../models/readerLayoutSettings';
import { radii, serifFont, spacing } from '../theme';

type Props = {
  lineHeight: number;
  lineHeightMax: number;
  lineHeightMin: number;
  onChangeLineHeight: (delta: number) => void;
  onClose: () => void;
  onReset: () => void;
  onUpdateSettings: (patch: Partial<ReaderLayoutSettings>) => void;
  settings: ReaderLayoutSettings;
  visible: boolean;
};

function StepControl({
  disabled,
  max,
  min,
  onChange,
  step,
  value,
}: {
  disabled?: boolean;
  max: number;
  min: number;
  onChange: (delta: number) => void;
  step: number;
  value: number;
}) {
  const { theme } = useApp();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm, opacity: disabled ? 0.35 : 1 }}>
      <Pressable
        disabled={disabled || value <= min}
        onPress={() => onChange(-step)}
        style={({ pressed }) => ({
          alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.sm,
          borderWidth: 1, height: 36, justifyContent: 'center', opacity: pressed ? 0.6 : value <= min ? 0.3 : 1, width: 36,
        })}
      >
        <Minus color={theme.textPrimary} size={16} />
      </Pressable>
      <View style={{ backgroundColor: theme.border, borderRadius: radii.sm, flex: 1, height: 6, overflow: 'hidden' }}>
        <View style={{ backgroundColor: theme.accent, borderRadius: radii.sm, height: '100%', width: `${((value - min) / (max - min)) * 100}%` }} />
      </View>
      <Pressable
        disabled={disabled || value >= max}
        onPress={() => onChange(step)}
        style={({ pressed }) => ({
          alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.sm,
          borderWidth: 1, height: 36, justifyContent: 'center', opacity: pressed ? 0.6 : value >= max ? 0.3 : 1, width: 36,
        })}
      >
        <Plus color={theme.textPrimary} size={16} />
      </Pressable>
    </View>
  );
}

export function LayoutSettingsModal({
  lineHeight,
  lineHeightMax,
  lineHeightMin,
  onChangeLineHeight,
  onClose,
  onReset,
  onUpdateSettings,
  settings,
  visible,
}: Props) {
  const { theme, t } = useApp();
  const insets = useSafeAreaInsets();
  const displayedMargin = settings.useBookMargins
    ? DEFAULT_READER_LAYOUT_SETTINGS.marginHorizontal
    : settings.marginHorizontal;
  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
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
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>{t('reader.layoutSettings')}</Text>
              <Pressable accessibilityLabel={t('common.cancel')} hitSlop={10} onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1, padding: spacing.xs })}>
                <X color={theme.textSecondary} size={20} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{t('reader.margins')}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {[
                  { label: t('reader.bookMargins'), value: true },
                  { label: t('reader.customMargins'), value: false },
                ].map((option) => {
                  const selected = settings.useBookMargins === option.value;
                  return (
                    <Pressable
                      key={String(option.value)}
                      onPress={() => onUpdateSettings({ useBookMargins: option.value })}
                      style={({ pressed }) => ({
                        alignItems: 'center', backgroundColor: selected ? theme.accent : theme.surface,
                        borderColor: selected ? theme.accent : theme.border, borderRadius: radii.md, borderWidth: 1,
                        flex: 1, opacity: pressed ? 0.7 : 1, paddingVertical: spacing.sm,
                      })}
                    >
                      <Text style={{ color: selected ? '#fff' : theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{t('reader.horizontalMargin')}</Text>
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>{displayedMargin}px</Text>
              </View>
              <StepControl
                disabled={settings.useBookMargins}
                max={48}
                min={0}
                onChange={(delta) => onUpdateSettings({ marginHorizontal: Math.min(48, Math.max(0, settings.marginHorizontal + delta)) })}
                step={4}
                value={displayedMargin}
              />
            </View>

            <View style={{ gap: spacing.sm }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{t('reader.spacing')}</Text>
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>{lineHeight.toFixed(1)}</Text>
              </View>
              <StepControl
                disabled={settings.useBookMargins}
                max={lineHeightMax}
                min={lineHeightMin}
                onChange={onChangeLineHeight}
                step={0.1}
                value={lineHeight}
              />
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
