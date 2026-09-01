import React, { forwardRef, useImperativeHandle } from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';
import type { PdfReaderHandle, PdfReaderProps } from './PdfReader.types';

export const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader({
  filePath,
  initialPage = 1,
  interactionEnabled = true,
  onPageChange: _onPageChange,
}, ref) {
  const { theme, t } = useApp();
  useImperativeHandle(ref, () => ({
    getScale: () => 1,
    goToPage: () => undefined,
    setScale: () => undefined,
  }), []);

  // filePath/initialPage são mantidos na assinatura para paridade com .native,
  // mas não são usados na web — leitor nativo não existe no browser.
  void filePath;
  void initialPage;

  return (
    <View
      pointerEvents={interactionEnabled ? 'auto' : 'none'}
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
});
