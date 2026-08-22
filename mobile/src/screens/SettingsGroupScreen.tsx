import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { AuthSettings } from '../components/AuthSettings';
import { FolderPickerField } from '../components/FolderPickerField';
import { KrumerLogo } from '../components/KrumerLogo';
import { LangPickerButton } from '../components/LangPicker';
import { ScanProgress, type ScanProgressState } from '../components/ScanProgress';
import { ThemeCard } from '../components/ThemeCard';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import { scanLibrary } from '../services/libraryScanner';
import { radii, serifFont, spacing, type ThemeName } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsGroup'>;

export function SettingsGroupScreen({ route }: Props) {
  const { group } = route.params;
  const { preferences, setBooks, setGeminiApiKey, setLibraryFolder, setThemeName, theme, t } = useApp();
  const [folder, setFolder] = useState(preferences.libraryFolder);
  const [apiKey, setApiKey] = useState(preferences.geminiApiKey ?? '');
  const [status, setStatus] = useState(preferences.geminiApiKey ? t('settings.keySaved') : t('api.noKey'));
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
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xl }}>
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26 }}>{titles[group]}</Text>
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
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
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
            <Text style={{ color: preferences.geminiApiKey ? theme.accent : theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>
              {status}
            </Text>
          </View>
        ) : null}
        {group === 'about' ? (
          <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl }}>
            <KrumerLogo />
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>Krumer Mobile v0.1.0</Text>
            <Pressable onPress={() => Linking.openURL('https://github.com/adriantinoco-dev/Krumer')}>
              <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 15 }}>{t('about.github')}</Text>
            </Pressable>
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
              {t('about.credits')}
            </Text>
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12 }}>{t('about.licenses')}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  const { theme } = useApp();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: disabled ? theme.accentMuted : theme.accent,
        borderRadius: radii.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: theme.bg, fontFamily: serifFont, fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
