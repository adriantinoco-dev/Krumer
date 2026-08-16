import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { SettingsRow } from '../components/SettingsRow';
import { languages } from '../i18n/translations';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useApp } from '../context/AppContext';
import { serifFont, spacing } from '../theme';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function SettingsScreen({ navigation }: Props) {
  const { preferences, theme, t } = useApp();
  const language = languages.find((item) => item.code === preferences.language)?.name ?? 'English';
  const themeLabel =
    preferences.theme === 'dark' ? t('theme.dark') : preferences.theme === 'light' ? t('theme.light') : t('theme.sepia');

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      <View style={{ padding: spacing.md }}>
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26 }}>{t('settings.title')}</Text>
      </View>
      <SettingsRow
        title={t('settings.general')}
        subtitle={`${preferences.libraryFolder ? t('general.folder') : t('general.noFolder')} · ${language}`}
        onPress={() => navigation.navigate('SettingsGroup', { group: 'general' })}
      />
      <SettingsRow
        title={t('settings.theme')}
        subtitle={themeLabel}
        onPress={() => navigation.navigate('SettingsGroup', { group: 'theme' })}
      />
      <SettingsRow
        title={t('settings.apiKey')}
        subtitle={preferences.geminiApiKey ? t('api.configured') : t('api.noKey')}
        onPress={() => navigation.navigate('SettingsGroup', { group: 'api' })}
      />
      <SettingsRow
        title={t('settings.about')}
        subtitle="Krumer Mobile v0.1.0"
        onPress={() => navigation.navigate('SettingsGroup', { group: 'about' })}
      />
    </SafeAreaView>
  );
}
