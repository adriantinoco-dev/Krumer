import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Folder, Globe, Info, KeyRound, Moon } from 'lucide-react-native';
import { AnimatedLanguageCard } from '../components/AnimatedLanguageCard';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { FolderPickerField } from '../components/FolderPickerField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScanProgress, type ScanProgressState } from '../components/ScanProgress';
import { SettingsModal } from '../components/SettingsModal';
import { SettingsRow } from '../components/SettingsRow';
import { ThemeCard } from '../components/ThemeCard';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { languages } from '../i18n/translations';
import { scanLibrary } from '../services/libraryScanner';
import { radii, serifFont, spacing, type ThemeName } from '../theme';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

function SectionHeader({ label }: { label: string }) {
  const { theme } = useApp();
  return (
    <Text
      style={{
        color: theme.textMuted,
        fontFamily: serifFont,
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: spacing.sm,
        marginTop: spacing.lg,
        paddingHorizontal: spacing.xs,
      }}
    >
      {label}
    </Text>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const { preferences, setBooks, setGeminiApiKey, setLanguage, setLibraryFolder, setThemeName, theme, t } = useApp();
  const { user } = useAuth();

  const [langVisible, setLangVisible] = useState(false);
  const [folderVisible, setFolderVisible] = useState(false);
  const [themeVisible, setThemeVisible] = useState(false);
  const [apiVisible, setApiVisible] = useState(false);

  const [folder, setFolder] = useState(preferences.libraryFolder);
  const [apiKey, setApiKey] = useState(preferences.geminiApiKey ?? '');
  const [apiKeyStatus, setApiKeyStatus] = useState(
    preferences.geminiApiKey ? t('settings.keySaved') : t('api.noKey'),
  );
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null);

  const language = languages.find((item) => item.code === preferences.language)?.name ?? 'English';
  const themeLabel =
    preferences.theme === 'dark' ? t('theme.dark') : preferences.theme === 'light' ? t('theme.light') : t('theme.sepia');

  function folderName(path: string | null): string {
    if (!path) return '';
    const decoded = decodeURIComponent(path);
    const segments = decoded.split(/[/\\]/).filter(Boolean);
    let last = segments[segments.length - 1] || decoded;
    last = last.replace(/^primary[:/]/i, '');
    return last.endsWith('/') ? last : last + '/';
  }

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

  async function saveApiKey() {
    await setGeminiApiKey(apiKey.trim());
    setApiKey('');
    setApiKeyStatus(t('settings.keySaved'));
  }

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      <View style={{ padding: spacing.md, paddingBottom: spacing.xs }}>
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26 }}>{t('settings.title')}</Text>
      </View>

      {/* Account banner */}
      {!user ? (
        <Pressable
          onPress={() => navigation.navigate('SettingsGroup', { group: 'account' })}
          style={({ pressed }) => ({
            backgroundColor: pressed ? theme.accentMuted : theme.accentMuted,
            borderColor: theme.accent,
            borderRadius: radii.md,
            borderWidth: 1,
            marginHorizontal: spacing.md,
            marginTop: spacing.sm,
            padding: spacing.md,
          })}
        >
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
            {t('settings.syncTitle') || 'Sync across devices'}
          </Text>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12, marginBottom: spacing.sm }}>
            {t('settings.syncDesc') || 'Sign in to keep your library and reading progress in sync.'}
          </Text>
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: theme.accent,
              borderRadius: radii.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs + 2,
            }}
          >
            <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>
              {t('auth.signIn') || 'Sign in'}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
        {/* APPEARANCE */}
        <SectionHeader label={t('settings.sectionAppearance') || 'APPEARANCE'} />
        <SettingsRow
          title={t('settings.theme')}
          subtitle={themeLabel}
          icon={Moon}
          onPress={() => setThemeVisible(true)}
        />

        {/* LIBRARY */}
        <SectionHeader label={t('settings.sectionLibrary') || 'LIBRARY'} />
        <SettingsRow
          title={t('settings.language')}
          subtitle={language}
          icon={Globe}
          onPress={() => setLangVisible(true)}
        />
        <SettingsRow
          title={t('general.folder') || 'Books folder'}
          subtitle={folderName(preferences.libraryFolder) || t('general.noFolder') || 'Not configured'}
          icon={Folder}
          onPress={() => setFolderVisible(true)}
        />

        {/* INTEGRATIONS */}
        <SectionHeader label={t('settings.sectionIntegrations') || 'INTEGRATIONS'} />
        <SettingsRow
          title={t('settings.apiKey')}
          subtitle={preferences.geminiApiKey ? t('api.configured') : t('api.noKey')}
          icon={KeyRound}
          onPress={() => setApiVisible(true)}
        />

        {/* ABOUT */}
        <SectionHeader label={t('settings.sectionAbout') || 'ABOUT'} />
        <SettingsRow
          title="Krumer Mobile"
          subtitle="v0.1.0"
          icon={Info}
          onPress={() => navigation.navigate('SettingsGroup', { group: 'about' })}
        />
      </View>

      {/* Language Modal */}
      <SettingsModal visible={langVisible} onClose={() => setLangVisible(false)} title={t('settings.language')}>
        <View style={{ gap: spacing.xs }}>
          {languages.map((lang) => (
            <AnimatedLanguageCard
              key={lang.code}
              lang={lang}
              selected={preferences.language === lang.code}
              onSelect={async () => {
                await setLanguage(lang.code);
                setLangVisible(false);
              }}
            />
          ))}
        </View>
      </SettingsModal>

      {/* Folder Modal */}
      <SettingsModal visible={folderVisible} onClose={() => setFolderVisible(false)} title={t('general.folder') || 'Books folder'}>
        <View style={{ gap: spacing.md }}>
          <FolderPickerField value={folder} onChange={updateFolder} />
          <PrimaryButton disabled={!folder} label={t('scan.action')} onPress={runScan} />
          {scanProgress ? <ScanProgress progress={scanProgress} /> : null}
        </View>
      </SettingsModal>

      {/* Theme Modal */}
      <SettingsModal visible={themeVisible} onClose={() => setThemeVisible(false)} title={t('settings.theme')}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-start' }}>
          {(['dark', 'light', 'sepia'] as ThemeName[]).map((name) => (
            <ThemeCard key={name} large value={name} selected={preferences.theme === name} onPress={(value) => {
              setThemeName(value);
              setThemeVisible(false);
            }} />
          ))}
        </View>
      </SettingsModal>

      {/* API Key Modal */}
      <SettingsModal visible={apiVisible} onClose={() => setApiVisible(false)} title={t('settings.apiKey')}>
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>
            {t('api.yourKey')}
          </Text>
          <ApiKeyInput value={apiKey} onChangeText={setApiKey} />
          <Pressable
            disabled={!apiKey.trim()}
            onPress={saveApiKey}
            style={{
              alignItems: 'center',
              backgroundColor: 'transparent',
              borderColor: theme.border,
              borderRadius: radii.md,
              borderWidth: 1,
              opacity: apiKey.trim() ? 1 : 0.5,
              paddingVertical: spacing.sm + 2,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: '700' }}>
              {t('common.save')}
            </Text>
          </Pressable>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
            <View
              style={{
                backgroundColor: preferences.geminiApiKey ? '#22c55e' : theme.textMuted,
                borderRadius: 99,
                height: 8,
                width: 8,
              }}
            />
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>
              {apiKeyStatus}
            </Text>
          </View>
          <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, lineHeight: 18 }}>
            {t('api.help').split('aistudio.google.com')[0]}
            <Text
              onPress={() => Linking.openURL('https://aistudio.google.com')}
              style={{ color: theme.accent, textDecorationLine: 'underline' }}
            >
              aistudio.google.com
            </Text>
            {t('api.help').split('aistudio.google.com')[1]}
          </Text>
        </View>
      </SettingsModal>
    </SafeAreaView>
  );
}
