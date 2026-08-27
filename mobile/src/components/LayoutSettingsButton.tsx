import React from 'react';
import { Pressable } from 'react-native';
import { AlignJustify } from 'lucide-react-native';
import { useApp } from '../context/AppContext';

export function LayoutSettingsButton({ color, onPress }: { color: string; onPress: () => void }) {
  const { t } = useApp();
  return (
    <Pressable
      accessibilityLabel={t('reader.layoutSettings')}
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.5 : 1,
        padding: 12,
      })}
    >
      <AlignJustify color={color} size={24} strokeWidth={1.9} />
    </Pressable>
  );
}
