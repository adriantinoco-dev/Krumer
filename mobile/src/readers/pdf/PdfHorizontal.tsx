import React, { useCallback } from 'react';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import type { PdfPageSize } from '../PdfReader.types';
import { useApp } from '../../context/AppContext';

type PdfHorizontalProps = {
  resolvedUri: string;
  currentPage: number;
  totalPages: number;
  pageSize: PdfPageSize | null;
  scale: number;
  loading: boolean;
  isSinglePageReady: boolean;
  onLoadComplete: (pages: number, path: string, size: PdfPageSize) => void;
  onPageChanged: (page: number, total: number) => void;
  onLoadProgress: (percent: number) => void;
  onError: (err: unknown) => void;
  onSingleTap: (page: number, x: number, y: number) => void;
};

/**
 * D4 — Modo horizontal página única (espelha reader-pdf.js:98 + reader.css:412).
 * Só a página atual é visível; demais páginas não existem no DOM.
 * No mobile, isso é `react-native-pdf` com `singlePage=true, page={current}`.
 *
 * D2/D3 (placeholders + render lazy HiDPI) no desktop criam divs para todas
 * as páginas; no mobile horizontal o placeholder é o próprio container com
 * altura calculada (fittedHeight) exibindo "1,5 páginas" nunca deve ocorrer
 * — ver PdfReader.tsx:233 cálculo original.
 */
export function PdfHorizontal({
  resolvedUri,
  currentPage,
  totalPages: _totalPages,
  pageSize,
  scale,
  loading,
  isSinglePageReady,
  onLoadComplete,
  onPageChanged,
  onLoadProgress,
  onError,
  onSingleTap,
}: PdfHorizontalProps) {
  const { width, height } = useWindowDimensions();
  const { theme } = useApp();

  void _totalPages; // totalPages é usado pelo pai para controles; não afeta render

  const Pdf = require('react-native-pdf').default ?? require('react-native-pdf');

  // D2/D3 — placeholder dimensionado como desktop criarPlaceholdersTodasPaginas():135
  // baseAspect * scale, mas no mobile usando aspect real da page1 + fittedHeight
  const pdfStyle = (() => {
    if (pageSize?.width && pageSize?.height) {
      const aspect = pageSize.height / pageSize.width;
      // escala aplica sobre a altura encaixada (igual desktop atualizarDimensoesPlaceholders:155)
      const fittedHeight = Math.min(height * 0.92, width * aspect * 0.98) * scale;
      return { backgroundColor: theme.bg, height: fittedHeight, width: width * scale } as const;
    }
    // fallback enquanto pageSize não chegou — ocupa tela sem corte
    return { backgroundColor: theme.bg, flex: 1, height, width } as const;
  })();

  // Guard de render — evita setCurrentPage concorrente (reader-pdf.js:395 renderingPages)
  // No horizontal nativo o guard é leve, mas mantém para paridade
  const handlePageChanged = useCallback(
    (page: number, numberOfPages: number) => {
      onPageChanged(page, numberOfPages);
    },
    [onPageChanged],
  );

  return (
    <View style={{ alignItems: 'center', backgroundColor: theme.bg, flex: 1, justifyContent: 'center' }}>
      {loading && (
        <View
          pointerEvents="none"
          style={{
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.15)',
            bottom: 0,
            justifyContent: 'center',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
            zIndex: 10,
          }}
        >
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      )}
      <Pdf
        source={{ uri: resolvedUri, cache: true }}
        page={currentPage}
        singlePage={isSinglePageReady}
        onLoadComplete={onLoadComplete}
        onPageChanged={handlePageChanged}
        onLoadProgress={onLoadProgress as any}
        onPageSingleTap={onSingleTap}
        onError={onError}
        style={pdfStyle}
        enablePaging={false}
        horizontal={false}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        enableDoubleTapZoom={false}
        enableAntialiasing
        fitPolicy={0}
        scale={scale}
        spacing={0}
      />
    </View>
  );
}
