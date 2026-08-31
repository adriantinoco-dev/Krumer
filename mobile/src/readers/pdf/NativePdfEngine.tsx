import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Pdf from 'react-native-pdf';
import { useApp } from '../../context/AppContext';
import {
  PDF_DEFAULTS,
  type PdfDisplayMode,
  type PdfPageSize,
} from '../PdfReader.types';
import { describePdfSource, pdfDevLog } from './pdfDebug';

const PDF_SCROLL_PAGE_SPACING = 16;

export type NativePdfEngineHandle = {
  setPage: (page: number) => void;
};

type NativePdfEngineProps = {
  currentPage: number;
  displayMode: PdfDisplayMode;
  onError: (error: unknown) => void;
  onExternalLink?: (url: string) => void;
  onLoadComplete: (pages: number, path: string, size: PdfPageSize) => void;
  onLoadProgress?: (percent: number) => void;
  onPageChanged: (page: number, total: number) => void;
  onScaleChanged?: (scale: number) => void;
  onSingleTap: (page: number, x: number, y: number) => void;
  resolvedUri: string;
  scale: number;
};

/** Única fronteira entre o Krumer e o componente nativo react-native-pdf. */
export const NativePdfEngine = forwardRef<NativePdfEngineHandle, NativePdfEngineProps>(
  function NativePdfEngine(
    {
      currentPage,
      displayMode,
      onError,
      onExternalLink,
      onLoadComplete,
      onLoadProgress,
      onPageChanged,
      onScaleChanged,
      onSingleTap,
      resolvedUri,
      scale,
    },
    ref,
  ) {
    const { height, width } = useWindowDimensions();
    const { theme } = useApp();
    const pdfRef = useRef<NativePdfEngineHandle | null>(null);
    const source = useMemo(() => ({ cache: true, uri: resolvedUri }), [resolvedUri]);
    const isPaginated = displayMode === 'paginated';

    useEffect(() => {
      pdfDevLog('engine:mount', {
        displayMode,
        page: currentPage,
        scale,
        source: describePdfSource(resolvedUri),
      });
      return () => {
        pdfDevLog('engine:unmount', { source: describePdfSource(resolvedUri) });
      };
      // Este evento deve representar apenas a identidade da instância nativa.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedUri]);

    useImperativeHandle(ref, () => ({
      setPage: (page) => {
        pdfDevLog('engine:set-page', { page });
        pdfRef.current?.setPage(page);
      },
    }), []);

    return (
      <View style={{ backgroundColor: theme.bg, flex: 1 }}>
        <Pdf
          ref={(instance: NativePdfEngineHandle | null) => {
            pdfRef.current = instance;
          }}
          enableAnnotationRendering
          enableAntialiasing
          enableDoubleTapZoom={false}
          enablePaging={isPaginated}
          fitPolicy={0}
          horizontal={isPaginated}
          maxScale={PDF_DEFAULTS.maxScale}
          minScale={PDF_DEFAULTS.minScale}
          onError={onError}
          onLoadComplete={onLoadComplete}
          onLoadProgress={onLoadProgress}
          onPageChanged={onPageChanged}
          onPageSingleTap={onSingleTap}
          onPressLink={onExternalLink}
          onScaleChanged={onScaleChanged}
          page={currentPage}
          scale={scale}
          scrollEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          singlePage={false}
          source={source}
          spacing={isPaginated ? 0 : PDF_SCROLL_PAGE_SPACING}
          style={{ backgroundColor: theme.bg, flex: 1, height, width }}
        />
      </View>
    );
  },
);
