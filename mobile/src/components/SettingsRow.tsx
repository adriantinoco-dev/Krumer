import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { serifFont, spacing } from '../theme';

export function SettingsRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { theme } = useApp();

  return (
    <Pressable
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: theme.card,
        borderBottomColor: theme.border,
        borderBottomWidth: 1,
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15 }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12 }}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight color={theme.textSecondary} size={20} />
    </Pressable>
  );
}
