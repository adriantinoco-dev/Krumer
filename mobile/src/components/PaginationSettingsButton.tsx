import React from 'react';
import { Pressable } from 'react-native';
import { PanelsTopLeft } from 'lucide-react-native';
import { useApp } from '../context/AppContext';

export function PaginationSettingsButton({ color, onPress }: { color: string; onPress: () => void }) {
  const { t } = useApp();
  return (
    <Pressable
      accessibilityLabel={t('reader.paginationSettings')}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        height: 36,
        justifyContent: 'center',
        opacity: pressed ? 0.55 : 1,
        width: 44,
      })}
    >
      <PanelsTopLeft color={color} size={20} strokeWidth={1.7} />
    </Pressable>
  );
}
