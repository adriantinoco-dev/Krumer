import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing, themes, type ThemeName } from '../theme';

const themeLabels: Record<ThemeName, 'theme.dark' | 'theme.light' | 'theme.sepia'> = {
  dark: 'theme.dark',
  light: 'theme.light',
  sepia: 'theme.sepia',
};

export function ThemeCard({
  value,
  selected,
  large = false,
  onPress,
}: {
  value: ThemeName;
  selected: boolean;
  large?: boolean;
  onPress: (value: ThemeName) => void;
}) {
  const { theme, t } = useApp();
  const preview = themes[value];

  return (
    <Pressable
      onPress={() => onPress(value)}
      style={{
        flex: 1,
        minHeight: large ? 112 : 82,
        borderColor: selected ? theme.accent : theme.border,
        borderRadius: radii.md,
        borderWidth: selected ? 2 : 1,
        padding: spacing.sm,
        backgroundColor: theme.card,
        gap: spacing.sm,
      }}
    >
      <View
        style={{
          flex: 1,
          minHeight: large ? 54 : 34,
          backgroundColor: preview.bg,
          borderColor: preview.border,
          borderRadius: radii.sm,
          borderWidth: 1,
          overflow: 'hidden',
        }}
      />
      <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: large ? 14 : 12, textAlign: 'center' }}>
        {t(themeLabels[value])}
      </Text>
    </Pressable>
  );
}
