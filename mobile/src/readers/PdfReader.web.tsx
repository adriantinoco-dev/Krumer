import React from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export function PdfReader({
  filePath,
  initialPage = 1,
  onPageChange: _onPageChange,
}: {
  filePath: string;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
}) {
  const { theme, t } = useApp();

  // filePath/initialPage são mantidos na assinatura para paridade com .native,
  // mas não são usados na web — leitor nativo não existe no browser.
  void filePath;
  void initialPage;

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.bg,
        flex: 1,
        justifyContent: 'center',
        padding: spacing.lg,
      }}
    >
      <View
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderRadius: radii.lg,
          borderWidth: 1,
          gap: spacing.sm,
          maxWidth: 420,
          padding: spacing.lg,
          width: '100%',
        }}
      >
        <Text
          style={{
            color: theme.textPrimary,
            fontFamily: serifFont,
            fontSize: 16,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {t('reader.pdfWebUnavailableTitle')}
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            fontFamily: serifFont,
            fontSize: 13,
            lineHeight: 18,
            textAlign: 'center',
          }}
        >
          {t('reader.pdfWebUnavailableDescription')}
        </Text>
      </View>
    </View>
  );
}
