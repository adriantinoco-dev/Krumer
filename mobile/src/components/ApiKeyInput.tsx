import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { radii, spacing } from '../theme';

export function ApiKeyInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const { theme, t } = useApp();

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderRadius: radii.md,
        borderWidth: 1,
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
      }}
    >
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        placeholder={t('api.placeholder')}
        placeholderTextColor={theme.textSecondary}
        secureTextEntry={!visible}
        style={{
          color: theme.textPrimary,
          flex: 1,
          fontFamily: 'Courier',
          fontSize: 14,
          minHeight: 46,
        }}
        value={value}
      />
      <Pressable onPress={() => setVisible((next) => !next)} hitSlop={10}>
        {visible ? <EyeOff color={theme.textSecondary} size={18} /> : <Eye color={theme.textSecondary} size={18} />}
      </Pressable>
    </View>
  );
}
