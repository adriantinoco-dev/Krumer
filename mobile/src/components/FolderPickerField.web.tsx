import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { FolderOpen, Sparkles } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export function pickWebDirectory(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    // @ts-ignore
    input.webkitdirectory = true;
    // @ts-ignore
    input.directory = true;

    input.onchange = (event: any) => {
      const filesList: FileList = event.target.files;
      if (!filesList || filesList.length === 0) {
        resolve(null);
        return;
      }
      const files = Array.from(filesList);
      const folderName = files[0]?.webkitRelativePath?.split('/')[0] || 'Pasta Selecionada';
      (window as any).__krumerWebFiles = files;
      resolve(folderName);
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function FolderPickerField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string) => void;
}) {
  const { theme, t } = useApp();

  async function handlePickLocal() {
    const folderName = await pickWebDirectory();
    if (folderName) {
      onChange(folderName);
    }
  }

  function handlePickDemo() {
    (window as any).__krumerWebFiles = null;
    onChange('demo://KrumerDemoLibrary');
  }

  const isDemo = value === 'demo://KrumerDemoLibrary';
  const hasLocalFolder = Boolean(value && !isDemo);

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: theme.textPrimary, fontSize: 13 }}>{t('general.booksFolder')}</Text>
      <View style={{ gap: spacing.sm }}>
        <Pressable
          onPress={handlePickLocal}
          style={{
            alignItems: 'center',
            backgroundColor: hasLocalFolder ? '#2f8f46' : theme.card,
            borderColor: hasLocalFolder ? '#2f8f46' : theme.border,
            borderRadius: radii.md,
            borderWidth: 1,
            flexDirection: 'row',
            gap: spacing.sm,
            justifyContent: 'center',
            minHeight: 46,
            paddingHorizontal: spacing.md,
          }}
        >
          {hasLocalFolder ? <FolderOpen color="#ffffff" size={18} /> : <FolderOpen color={theme.accent} size={18} />}
          <Text
            numberOfLines={1}
            style={{
              color: hasLocalFolder ? '#ffffff' : theme.textPrimary,
              fontFamily: serifFont,
              fontSize: 14,
              fontWeight: '700',
            }}
          >
            {hasLocalFolder ? value : t('general.selectFolder')}
          </Text>
        </Pressable>

        <Pressable
          onPress={handlePickDemo}
          style={{
            alignItems: 'center',
            backgroundColor: isDemo ? theme.accent : theme.surface,
            borderColor: isDemo ? theme.accent : theme.border,
            borderRadius: radii.md,
            borderWidth: 1,
            flexDirection: 'row',
            gap: spacing.sm,
            justifyContent: 'center',
            minHeight: 42,
            paddingHorizontal: spacing.md,
          }}
        >
          <Sparkles color={isDemo ? theme.bg : theme.accent} size={16} />
          <Text
            style={{
              color: isDemo ? theme.bg : theme.textPrimary,
              fontFamily: serifFont,
              fontSize: 13,
              fontWeight: '600',
            }}
          >
            {isDemo ? 'Pasta de Demonstração Selecionada' : 'Usar pasta de demonstração (Navegador)'}
          </Text>
        </Pressable>
      </View>

      <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, lineHeight: 14 }}>
        Selecione uma pasta com arquivos PDF/EPUB no seu computador ou use a biblioteca de demonstração para testar o aplicativo na web.
      </Text>
    </View>
  );
}
