import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import type { ReadingFontFamily } from '../models/readingPreferences';
import { readerNativeFontFamily } from '../readers/readerFonts';
import { radii, spacing } from '../theme';

const options: Array<{ label: 'reader.fontSerif' | 'reader.fontSans' | 'reader.fontMono'; value: ReadingFontFamily }> = [
  { label: 'reader.fontSerif', value: 'serif' },
  { label: 'reader.fontSans', value: 'sans' },
  { label: 'reader.fontMono', value: 'mono' },
];

export function FontFamilySelector({ value, onChange }: { value: ReadingFontFamily; onChange: (value: ReadingFontFamily) => void }) {
  const { theme, t } = useApp();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: selected ? theme.accentMuted : theme.surface,
              borderColor: selected ? theme.accent : theme.border,
              borderRadius: radii.md,
              borderWidth: selected ? 2 : 1,
              flex: 1,
              gap: spacing.xs,
              minHeight: 78,
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
              padding: spacing.sm,
            })}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: readerNativeFontFamily(option.value), fontSize: 22 }}>Aa</Text>
            <Text numberOfLines={1} style={{ color: theme.textSecondary, fontFamily: readerNativeFontFamily(option.value), fontSize: 11 }}>
              {t(option.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
