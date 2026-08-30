import React from 'react';
import { Pressable, Text } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export function PrimaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useApp();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: disabled ? theme.accentMuted : theme.accent,
        borderRadius: radii.md,
        justifyContent: 'center',
        minHeight: 44,
        opacity: pressed && !disabled ? 0.85 : 1,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
      })}
    >
      <Text style={{ color: theme.bg, fontFamily: serifFont, fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
