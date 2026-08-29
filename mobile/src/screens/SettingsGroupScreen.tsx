import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { AuthSettings } from '../components/AuthSettings';
import { FolderPickerField } from '../components/FolderPickerField';
import { KrumerLogo } from '../components/KrumerLogo';
import { LangPickerButton } from '../components/LangPicker';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScanProgress, type ScanProgressState } from '../components/ScanProgress';
import { ThemeCard } from '../components/ThemeCard';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import { scanLibrary } from '../services/libraryScanner';
import { radii, serifFont, spacing, type ThemeName } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsGroup'>;

export function SettingsGroupScreen({ route }: Props) {
  const { group } = route.params;
  const { height } = useWindowDimensions();
  const { preferences, setBooks, setGeminiApiKey, setLibraryFolder, setThemeName, theme, t } = useApp();
  const [folder, setFolder] = useState(preferences.libraryFolder);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState(preferences.hasGeminiApiKey ? t('settings.keySaved') : t('api.noKey'));
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null);

  const titles = {
    general: t('settings.general'),
    account: t('auth.account'),
    theme: t('settings.theme'),
    api: t('settings.apiKey'),
    about: t('settings.about'),
  };

  async function updateFolder(nextFolder: string) {
    setFolder(nextFolder);
    await setLibraryFolder(nextFolder);
  }

  async function runScan() {
    if (!folder) return;
    const books = await scanLibrary(folder, setScanProgress);
    await setBooks(books);
    setScanProgress({ fileName: t('common.done'), percent: 100, done: true });
  }

  async function saveKey() {
    await setGeminiApiKey(apiKey.trim());
    setStatus(t('settings.keySaved'));
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      {/* Title at top */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs }}>
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26 }}>
          {titles[group]}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          flexGrow: 1,
          justifyContent: (group === 'account' || group === 'about') ? 'center' : 'flex-start',
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: (group === 'account' || group === 'about') ? Math.round(height * 0.2) : Math.round(height * 0.18),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: spacing.lg, maxWidth: 460, width: '100%' }}>

          {group === 'general' ? (
            <>
              <FolderPickerField value={folder} onChange={updateFolder} />
              <PrimaryButton disabled={!folder} label={t('scan.action')} onPress={runScan} />
              {scanProgress ? <ScanProgress progress={scanProgress} /> : null}
              <View style={{ gap: spacing.sm }}>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13 }}>{t('language.label')}</Text>
                <LangPickerButton />
              </View>
            </>
          ) : null}

          {group === 'theme' ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-start' }} >
              {(['dark', 'light', 'sepia'] as ThemeName[]).map((name) => (
                <ThemeCard key={name} large value={name} selected={preferences.theme === name} onPress={setThemeName} />
              ))}
            </View>
          ) : null}

          {group === 'account' ? <AuthSettings /> : null}

          {group === 'api' ? (
            <View style={{ gap: spacing.md }}>
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13 }}>{t('api.key')}</Text>
              <ApiKeyInput value={apiKey} onChangeText={setApiKey} />
              <PrimaryButton disabled={!apiKey.trim()} label={t('common.save')} onPress={saveKey} />
              <Text
                style={{
                  color: preferences.hasGeminiApiKey ? theme.accent : theme.textSecondary,
                  fontFamily: serifFont,
                  fontSize: 13,
                }}
              >
                {status}
              </Text>
            </View>
          ) : null}

          {group === 'about' ? (
            <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}>
              <KrumerLogo />
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>Krumer Mobile v0.1.0</Text>
              <Pressable onPress={() => Linking.openURL('https://github.com/adriantinoco-dev/Krumer')}>
                <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 15 }}>{t('about.github')}</Text>
              </Pressable>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontFamily: serifFont,
                  fontSize: 13,
                  lineHeight: 18,
                  textAlign: 'center',
                }}
              >
                {t('about.credits')}
              </Text>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12 }}>{t('about.licenses')}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
