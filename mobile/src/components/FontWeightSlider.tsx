import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import type { ReadingFontFamily, ReadingFontWeight } from '../models/readingPreferences';
import { readerNativeFontFamily } from '../readers/readerFonts';
import { radii, spacing } from '../theme';

const options: Array<{
  label: 'reader.fontLight' | 'reader.fontRegular' | 'reader.fontMedium' | 'reader.fontBold';
  value: ReadingFontWeight;
}> = [
  { label: 'reader.fontLight', value: 'light' },
  { label: 'reader.fontRegular', value: 'regular' },
  { label: 'reader.fontMedium', value: 'medium' },
  { label: 'reader.fontBold', value: 'bold' },
];

export function FontWeightSlider({
  family,
  value,
  onChange,
}: {
  family: ReadingFontFamily;
  value: ReadingFontWeight;
  onChange: (value: ReadingFontWeight) => void;
}) {
  const { theme, t } = useApp();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
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
              backgroundColor: selected ? theme.accent : theme.surface,
              borderColor: selected ? theme.accent : theme.border,
              borderRadius: radii.sm,
              borderWidth: 1,
              flex: 1,
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: 2,
              paddingVertical: 9,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                color: selected ? '#ffffff' : theme.textSecondary,
                fontFamily: readerNativeFontFamily(family, option.value),
                fontSize: 10,
              }}
            >
              {t(option.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
