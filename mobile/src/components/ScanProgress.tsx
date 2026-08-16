import React from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export type ScanProgressState = {
  fileName: string;
  percent: number;
  done: boolean;
};

export function ScanProgress({ progress }: { progress: ScanProgressState }) {
  const { theme, t } = useApp();
  const percent = Math.min(100, Math.max(0, progress.percent));

  return (
    <View style={{ gap: spacing.sm, width: '100%' }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderRadius: radii.sm,
          height: 9,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            backgroundColor: theme.accent,
            borderRadius: radii.sm,
            height: '100%',
            width: `${percent}%`,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' }}>
        <Text numberOfLines={1} style={{ color: theme.textSecondary, flex: 1, fontFamily: 'Courier', fontSize: 12 }}>
          {progress.done ? t('common.done') : progress.fileName}
        </Text>
        <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 12, fontWeight: '700' }}>{Math.round(percent)}%</Text>
      </View>
    </View>
  );
}
