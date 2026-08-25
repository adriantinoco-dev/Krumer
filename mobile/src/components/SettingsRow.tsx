import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export function SettingsRow({
  title,
  subtitle,
  icon: Icon,
  iconBg,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  iconBg?: string;
  onPress: () => void;
}) {
  const { theme } = useApp();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? theme.cardHover : theme.card,
        borderColor: theme.border,
        borderRadius: radii.md,
        borderWidth: 1,
        flexDirection: 'row',
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md + 2,
        marginBottom: spacing.sm,
      })}
    >
      {Icon ? (
        <View
          style={{
            alignItems: 'center',
            backgroundColor: iconBg ?? theme.accentMuted,
            borderRadius: radii.sm,
            height: 36,
            justifyContent: 'center',
            width: 36,
          }}
        >
          <Icon color={theme.accent} size={18} />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15 }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
          {subtitle}
        </Text>
      </View>

      <ChevronRight color={theme.textMuted} size={18} />
    </Pressable>
  );
}
