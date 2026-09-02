import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { BookOpen, Folder, Globe, Grid3x3, Info, KeyRound, Moon, Sparkles } from 'lucide-react-native';
import { AnimatedLanguageCard } from '../components/AnimatedLanguageCard';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { FolderPickerField } from '../components/FolderPickerField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScanProgress, type ScanProgressState } from '../components/ScanProgress';
import { SettingsModal } from '../components/SettingsModal';
import { SettingsRow } from '../components/SettingsRow';
import { ThemeCard } from '../components/ThemeCard';
import { MetadataBatchModal } from '../components/MetadataBatchModal';
import { MetadataIntroModal } from '../components/MetadataIntroModal';
import { MetadataDialog, type MetadataDialogConfig } from '../components/MetadataDialog';
import { useApp } from '../context/AppContext';
import { languages } from '../i18n/translations';
import { DEFAULT_PDF_ENGINE, type PdfEngineKind } from '../readers/PdfReader.types';
import { usePdfEnginePreference } from '../readers/pdf/usePdfEnginePreference';
import { scanLibrary } from '../services/libraryScanner';
import { radii, serifFont, SETTINGS_MAX_WIDTH, spacing, type ThemeName } from '../theme';
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
  const { books, preferences, setBooks, setBooksPerRow, setGeminiApiKey, setLanguage, setLibraryFolder, setMetadataIntroSeen, setThemeName, theme, t } = useApp();

  const [cloudSyncVisible, setCloudSyncVisible] = useState(false);
  const [langVisible, setLangVisible] = useState(false);
  const [folderVisible, setFolderVisible] = useState(false);
  const [themeVisible, setThemeVisible] = useState(false);
  const [apiVisible, setApiVisible] = useState(false);
  const [booksPerRowVisible, setBooksPerRowVisible] = useState(false);
  const [pdfEngineVisible, setPdfEngineVisible] = useState(false);
  const [metadataIntroVisible, setMetadataIntroVisible] = useState(false);
  const [metadataBatchVisible, setMetadataBatchVisible] = useState(false);
  const [metadataDialog, setMetadataDialog] = useState<MetadataDialogConfig | null>(null);
  const pdfEnginePreference = usePdfEnginePreference();

  const [folder, setFolder] = useState(preferences.libraryFolder);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState(
    preferences.hasGeminiApiKey ? t('settings.keySaved') : t('api.noKey'),
  );
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null);

  const language = languages.find((item) => item.code === preferences.language)?.name ?? 'English';
  const themeLabel =
    preferences.theme === 'dark' ? t('theme.dark') : preferences.theme === 'light' ? t('theme.light') : t('theme.sepia');
  const pdfEngineLabel = pdfEnginePreference.engine === DEFAULT_PDF_ENGINE
    ? t('settings.pdfEngineNative')
    : t('settings.pdfEngineWebView');

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

  function showMetadataKeyDialog() {
    setMetadataDialog({
      message: t('metadata.keyRequiredMessage'),
      primaryAction: { label: t('metadata.configureKey'), onPress: () => setApiVisible(true) },
      secondaryAction: { kind: 'secondary', label: t('common.cancel'), onPress: () => undefined },
      title: t('metadata.keyRequiredTitle'),
      variant: 'warning',
    });
  }

  function openMetadataSearch() {
    if (!preferences.metadataIntroSeen) {
      setMetadataIntroVisible(true);
      return;
    }
    if (!preferences.hasGeminiApiKey) {
      showMetadataKeyDialog();
      return;
    }
    setMetadataBatchVisible(true);
  }

  async function continueMetadataIntro() {
    await setMetadataIntroSeen(true);
    setMetadataIntroVisible(false);
    if (!preferences.hasGeminiApiKey) {
      showMetadataKeyDialog();
      return;
    }
    setMetadataBatchVisible(true);
  }

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      <View style={{ alignSelf: 'center', maxWidth: SETTINGS_MAX_WIDTH, padding: spacing.md, paddingBottom: spacing.xs, width: '100%' }}>
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26 }}>{t('settings.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing.xl * 2, paddingHorizontal: spacing.md, paddingTop: spacing.xs }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={{ maxWidth: SETTINGS_MAX_WIDTH, width: '100%' }}>
        {/* Account banner scrolls away with the settings content instead of
            remaining fixed and covering rows on smaller screens. */}
        <Pressable
          onPress={() => setCloudSyncVisible(true)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? theme.accentMuted : theme.accentMuted,
            borderColor: theme.accent,
            borderRadius: radii.md,
            borderWidth: 1,
            marginBottom: spacing.sm,
            marginTop: spacing.sm,
            padding: spacing.md,
          })}
        >
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
            {t('settings.syncTitle')}
          </Text>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12, marginBottom: spacing.sm }}>
            {t('settings.syncDesc')}
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
              {t('auth.signIn')}
            </Text>
          </View>
        </Pressable>

        {/* APPEARANCE */}
        <SectionHeader label={t('settings.sectionAppearance')} />
        <SettingsRow
          title={t('settings.theme')}
          subtitle={themeLabel}
          icon={Moon}
          onPress={() => setThemeVisible(true)}
        />
        <SettingsRow
          title={t('settings.booksPerRow')}
          subtitle={t('settings.booksPerRowValue').replace('{0}', String(preferences.booksPerRow ?? 3))}
          icon={Grid3x3}
          onPress={() => {
            setBooksPerRowVisible(true);
          }}
        />

        {/* READING */}
        <SectionHeader label={t('settings.sectionReading')} />
        <SettingsRow
          title={t('settings.pdfEngine')}
          subtitle={pdfEngineLabel}
          icon={BookOpen}
          onPress={() => setPdfEngineVisible(true)}
        />

        {/* LIBRARY */}
        <SectionHeader label={t('settings.sectionLibrary')} />
        <SettingsRow
          title={t('settings.language')}
          subtitle={language}
          icon={Globe}
          onPress={() => setLangVisible(true)}
        />
        <SettingsRow
          title={t('general.folder')}
          subtitle={folderName(preferences.libraryFolder) || t('general.noFolder')}
          icon={Folder}
          onPress={() => setFolderVisible(true)}
        />
        <SettingsRow
          title={t('settings.metadataSearch')}
          subtitle={t('settings.metadataSearchSubtitle')}
          icon={Sparkles}
          onPress={openMetadataSearch}
        />

        {/* INTEGRATIONS */}
        <SectionHeader label={t('settings.sectionIntegrations')} />
        <SettingsRow
          title={t('settings.apiKey')}
          subtitle={preferences.hasGeminiApiKey ? t('api.configured') : t('api.noKey')}
          icon={KeyRound}
          onPress={() => setApiVisible(true)}
        />

        {/* ABOUT */}
        <SectionHeader label={t('settings.sectionAbout')} />
        <SettingsRow
          title="Krumer Mobile"
          subtitle="v0.1.0"
          icon={Info}
          onPress={() => navigation.navigate('SettingsGroup', { group: 'about' })}
        />
        </View>
      </ScrollView>

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
      <SettingsModal visible={folderVisible} onClose={() => setFolderVisible(false)} title={t('general.folder')}>
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
                backgroundColor: preferences.hasGeminiApiKey ? '#22c55e' : theme.textMuted,
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

      {/* Books per row Modal */}
      <SettingsModal visible={booksPerRowVisible} onClose={() => setBooksPerRowVisible(false)} title={t('settings.booksPerRow')}>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {[3, 4, 5, 6].map((value) => (
              <Pressable
                key={value}
                onPress={() => {
                  void setBooksPerRow(value);
                  setBooksPerRowVisible(false);
                }}
                style={{
                  alignItems: 'center',
                  backgroundColor: preferences.booksPerRow === value ? theme.accent : 'transparent',
                  borderColor: preferences.booksPerRow === value ? theme.accent : theme.border,
                  borderRadius: radii.sm,
                  borderWidth: 1,
                  flex: 1,
                  paddingVertical: spacing.md,
                }}
              >
                <Text
                  style={{
                    color: preferences.booksPerRow === value ? '#fff' : theme.textPrimary,
                    fontFamily: serifFont,
                    fontSize: 16,
                    fontWeight: '700',
                  }}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </SettingsModal>

      {/* PDF engine modal. Both engines share the PdfReader contract; only the
          selected engine is mounted for a reading session. */}
      <SettingsModal visible={pdfEngineVisible} onClose={() => setPdfEngineVisible(false)} title={t('settings.pdfEngine')}>
        <View style={{ gap: spacing.sm }}>
          {([
            {
              description: t('settings.pdfEngineNativeDescription'),
              enabled: true,
              kind: 'native' as PdfEngineKind,
              label: t('settings.pdfEngineNative'),
            },
            {
              description: t('settings.pdfEngineWebViewDescription'),
              enabled: true,
              kind: 'webview' as PdfEngineKind,
              label: t('settings.pdfEngineWebView'),
            },
          ]).map((option) => {
            const selected = pdfEnginePreference.engine === option.kind;
            return (
              <Pressable
                accessibilityLabel={`${option.label}: ${option.description}`}
                accessibilityRole="button"
                disabled={!option.enabled}
                key={option.kind}
                onPress={() => {
                  pdfEnginePreference.updateEngine(option.kind);
                  setPdfEngineVisible(false);
                }}
                style={({ pressed }) => ({
                  backgroundColor: selected ? theme.accentMuted : theme.card,
                  borderColor: selected ? theme.accent : theme.border,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  opacity: option.enabled ? (pressed ? 0.75 : 1) : 0.5,
                  padding: spacing.md,
                })}
              >
                <Text style={{ color: selected ? theme.accent : theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: '600' }}>
                  {option.label}
                </Text>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12, marginTop: spacing.xs }}>
                  {option.description}
                </Text>
                {!option.enabled ? (
                  <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, marginTop: spacing.xs }}>
                    {t('settings.pdfEngineWebViewPending')}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </SettingsModal>

      <SettingsModal
        centerTitle
        visible={cloudSyncVisible}
        onClose={() => setCloudSyncVisible(false)}
        title={t('sync.betaTitle')}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
            {t('sync.betaMessage')}
          </Text>
          <PrimaryButton label={t('sync.betaAction')} onPress={() => setCloudSyncVisible(false)} />
        </View>
      </SettingsModal>

      <MetadataIntroModal
        visible={metadataIntroVisible}
        onClose={() => setMetadataIntroVisible(false)}
        onContinue={() => { void continueMetadataIntro(); }}
      />
      <MetadataBatchModal
        books={books}
        visible={metadataBatchVisible}
        onClose={() => setMetadataBatchVisible(false)}
        onApplied={(count) => setMetadataDialog({
          message: t('metadata.appliedMessage').replace('{0}', String(count)),
          primaryAction: { label: t('metadata.close'), onPress: () => undefined },
          title: t('metadata.appliedTitle'),
          variant: 'success',
        })}
      />
      <MetadataDialog
        visible={Boolean(metadataDialog)}
        message={metadataDialog?.message ?? ''}
        onClose={() => setMetadataDialog(null)}
        primaryAction={metadataDialog?.primaryAction}
        secondaryAction={metadataDialog?.secondaryAction}
        title={metadataDialog?.title ?? ''}
        variant={metadataDialog?.variant ?? 'success'}
      />
    </SafeAreaView>
  );
}
