import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import type { DisplayMode } from '../models/readingPreferences';
import { radii, serifFont, spacing } from '../theme';

const options: Array<{ label: 'reader.scrollMode' | 'reader.paginatedMode'; value: DisplayMode }> = [
  { label: 'reader.scrollMode', value: 'scroll' },
  { label: 'reader.paginatedMode', value: 'paginated' },
];

export function DisplayModeToggle({ value, onChange }: { value: DisplayMode; onChange: (value: DisplayMode) => void }) {
  const { theme, t } = useApp();
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: radii.md, flexDirection: 'row', padding: 3 }}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: selected ? theme.accent : 'transparent',
              borderRadius: radii.sm,
              flex: 1,
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: spacing.sm,
              paddingVertical: 10,
            })}
          >
            <Text style={{ color: selected ? '#ffffff' : theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>
              {t(option.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
