import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { FolderPickerField } from '../components/FolderPickerField';
import { KrumerLogo } from '../components/KrumerLogo';
import { LangPickerButton } from '../components/LangPicker';
import { ScanProgress, type ScanProgressState } from '../components/ScanProgress';
import { ThemeCard } from '../components/ThemeCard';
import { scanLibrary } from '../services/libraryScanner';
import { radii, serifFont, spacing, type ThemeName } from '../theme';

type Slide = 'setup' | 'library' | 'api';

const slides: Slide[] = ['setup', 'library', 'api'];

export function OnboardingScreen() {
  const { preferences, setBooks, setGeminiApiKey, setHasOnboarded, setLibraryFolder, setThemeName, t, theme } = useApp();
  const [activeIndex, setActiveIndex] = useState(0);
  const [folder, setFolder] = useState<string | null>(preferences.libraryFolder);
  const [apiKey, setApiKey] = useState('');
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null);
  const [scanning, setScanning] = useState(false);

  function goTo(index: number) {
    setActiveIndex(index);
  }

  async function updateFolder(nextFolder: string) {
    setFolder(nextFolder);
    setScanProgress(null);
    await setLibraryFolder(nextFolder);
  }

  async function runScan() {
    if (!folder || scanning) return;
    setScanning(true);
    const books = await scanLibrary(folder, setScanProgress);
    await setBooks(books);
    setScanProgress({ fileName: t('common.done'), percent: 100, done: true });
    setScanning(false);
  }

  async function finish(key?: string | null) {
    if (key) await setGeminiApiKey(key);
    await setHasOnboarded(true);
  }

  const currentSlide = slides[activeIndex];

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: spacing.lg, maxWidth: 420, width: '100%' }}>
            <KrumerLogo hideLabel size={104} />
            {currentSlide === 'setup' ? (
              <View style={{ gap: spacing.lg }}>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 24, textAlign: 'center' }}>
                  {t('onboarding.setup')}
                </Text>
                <View style={{ gap: spacing.sm }}>
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13 }}>{t('language.label')}</Text>
                  <LangPickerButton />
                </View>
                <View style={{ gap: spacing.sm }}>
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13 }}>{t('theme.label')}</Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    {(['dark', 'light', 'sepia'] as ThemeName[]).map((name) => (
                      <ThemeCard
                        key={name}
                        value={name}
                        selected={preferences.theme === name}
                        onPress={setThemeName}
                      />
                    ))}
                  </View>
                </View>
                <PrimaryButton label={t('common.continue')} onPress={() => goTo(1)} />
              </View>
            ) : null}
            {currentSlide === 'library' ? (
              <View style={{ gap: spacing.lg }}>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 24, textAlign: 'center' }}>
                  {t('library.title')}
                </Text>
                <FolderPickerField value={folder} onChange={updateFolder} />
                {scanProgress ? (
                  <>
                    <ScanProgress progress={scanProgress} />
                    {scanProgress.done ? (
                      <PrimaryButton label={t('common.continue')} onPress={() => goTo(2)} />
                    ) : null}
                  </>
                ) : (
                  <PrimaryButton disabled={!folder || scanning} label={t('scan.action')} onPress={runScan} />
                )}
              </View>
            ) : null}
            {currentSlide === 'api' ? (
              <View style={{ gap: spacing.md }}>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 24, textAlign: 'center' }}>
                  {t('api.metadataTitle')}
                </Text>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
                  {t('api.metadataSubtitle')}
                </Text>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13 }}>{t('api.key')}</Text>
                <ApiKeyInput value={apiKey} onChangeText={setApiKey} />
                <PrimaryButton disabled={!apiKey.trim()} label={t('common.save')} onPress={() => finish(apiKey.trim())} />
                <Pressable onPress={() => finish(null)} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
                  <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, textDecorationLine: 'underline' }}>
                    {t('common.setupLater')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.md }}>
          {slides.map((slide, index) => (
            <Pressable key={slide} hitSlop={8} onPress={() => goTo(index)}>
              <View
                style={{
                  backgroundColor: activeIndex === index ? theme.accent : theme.border,
                  borderRadius: 5,
                  height: 10,
                  width: 10,
                }}
              />
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

function PrimaryButton({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  const { theme } = useApp();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        alignSelf: 'center',
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
