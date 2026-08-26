import React from 'react';
import { Switch, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { serifFont, spacing } from '../theme';

export function DoubleColumnToggle({
  disabled,
  isLandscape,
  value,
  onChange,
}: {
  disabled: boolean;
  isLandscape: boolean;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { theme, t } = useApp();
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' }}>
        <Text style={{ color: disabled ? theme.textMuted : theme.textSecondary, flex: 1, fontFamily: serifFont, fontSize: 13 }}>
          {t('reader.doubleColumn')}
        </Text>
        <Switch
          accessibilityLabel={t('reader.doubleColumn')}
          disabled={disabled}
          onValueChange={onChange}
          thumbColor={value && !disabled ? theme.accent : undefined}
          trackColor={{ false: theme.border, true: theme.accentMuted }}
          value={value}
        />
      </View>
      {!disabled && value && !isLandscape ? (
        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, lineHeight: 16 }}>
          {t('reader.doubleColumnPortraitHint')}
        </Text>
      ) : null}
    </View>
  );
}
