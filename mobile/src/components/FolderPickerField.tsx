import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { FolderOpen } from 'lucide-react-native';
import { Directory } from 'expo-file-system';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

async function pickFolderUri(): Promise<string | null> {
  try {
    const directory = await Directory.pickDirectoryAsync();
    return directory.uri;
  } catch {
    return null;
  }
}

export function FolderPickerField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string) => void;
}) {
  const { theme, t } = useApp();

  async function handlePick() {
    const uri = await pickFolderUri();
    if (uri) onChange(uri);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: theme.textPrimary, fontSize: 13 }}>{t('general.booksFolder')}</Text>
      <Pressable
        accessibilityLabel={t('general.selectFolder')}
        accessibilityRole="button"
        onPress={handlePick}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: value ? '#2f8f46' : theme.card,
          borderColor: value ? '#2f8f46' : theme.border,
          borderRadius: radii.md,
          borderWidth: 1,
          flexDirection: 'row',
          gap: spacing.sm,
          justifyContent: 'center',
          minHeight: 46,
          opacity: pressed ? 0.82 : 1,
          paddingHorizontal: spacing.md,
        })}
      >
        <FolderOpen color={value ? '#ffffff' : theme.accent} size={18} />
        <Text style={{ color: value ? '#ffffff' : theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: '700' }}>
          {t('general.selectFolder')}
        </Text>
      </Pressable>
    </View>
  );
}
