import React from 'react';
import { Pressable, Text } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';
import type { LanguageCode } from '../i18n/translations';

export function AnimatedLanguageCard({
  lang,
  selected,
  onSelect,
}: {
  lang: { code: LanguageCode; label: string; name: string };
  selected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useApp();

  return (
    <Pressable
      onPress={onSelect}
      style={{
        alignItems: 'center',
        backgroundColor: selected ? theme.accentMuted : 'transparent',
        borderColor: selected ? theme.accent : theme.border,
        borderRadius: radii.sm,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15 }}>{lang.name}</Text>
    </Pressable>
  );
}
