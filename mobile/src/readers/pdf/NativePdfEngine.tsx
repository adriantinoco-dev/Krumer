import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { type GestureResponderEvent, Platform, View, useWindowDimensions } from 'react-native';
import Pdf from 'react-native-pdf';
import { useApp } from '../../context/AppContext';
import {
  PDF_DEFAULTS,
  type PdfDisplayMode,
  type PdfPageSize,
} from '../PdfReader.types';
import { describePdfSource, pdfDevLog } from './pdfDebug';

const PDF_SCROLL_PAGE_SPACING = 16;
const PDF_QUICK_TAP_MAX_DURATION_MS = 240;
const PDF_QUICK_TAP_MAX_MOVEMENT_DP = 12;
const PDF_NATIVE_TAP_SUPPRESSION_MS = 650;
const PDF_FIT_WIDTH = 0;
const PDF_FIT_BOTH = 2;

export type NativePdfEngineHandle = {
  scrollByViewport: (fraction: number) => void;
  setPage: (page: number) => void;
  setScale: (scale: number) => void;
};

type ReactNativePdfHandle = {
  scrollByViewport: (fraction: number) => void;
  setPage: (page: number) => void;
  setNativeScale: (scale: number) => void;
};

type NativePdfEngineProps = {
  displayMode: PdfDisplayMode;
  initialPage: number;
  onError: (error: unknown) => void;
  onExternalLink?: (url: string) => void;
  onLoadComplete: (pages: number, path: string, size: PdfPageSize) => void;
  onLoadProgress?: (percent: number) => void;
  onPageChanged: (page: number, total: number) => void;
  onQuickTap?: (x: number, y: number) => boolean;
  onScaleChanged?: (scale: number) => void;
  onSingleTap: (page: number, x: number, y: number) => void;
  resolvedUri: string;
  scale: number;
};

/** Única fronteira entre o Krumer e o componente nativo react-native-pdf. */
export const NativePdfEngine = memo(forwardRef<NativePdfEngineHandle, NativePdfEngineProps>(
  function NativePdfEngine(
    {
      displayMode,
      initialPage,
      onError,
      onExternalLink,
      onLoadComplete,
      onLoadProgress,
      onPageChanged,
      onQuickTap,
      onScaleChanged,
      onSingleTap,
      resolvedUri,
      scale,
    },
    ref,
  ) {
    const { height, width } = useWindowDimensions();
    const { theme } = useApp();
    const pdfRef = useRef<ReactNativePdfHandle | null>(null);
    const suppressNativeTapCountRef = useRef(0);
    const suppressNativeTapUntilRef = useRef(0);
    const touchStartRef = useRef<{ pageX: number; pageY: number; startedAt: number } | null>(null);
    const source = useMemo(() => ({ cache: true, uri: resolvedUri }), [resolvedUri]);
    const isPaginated = displayMode === 'paginated';
    const fitPolicy = isPaginated ? PDF_FIT_BOTH : PDF_FIT_WIDTH;

    useEffect(() => {
      pdfDevLog('engine:mount', {
        displayMode,
        page: initialPage,
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
      scrollByViewport: (fraction) => {
        pdfRef.current?.scrollByViewport(fraction);
        requestAnimationFrame(() => pdfDevLog('engine:scroll-by-viewport', { fraction }));
      },
      setPage: (page) => {
        pdfRef.current?.setPage(page);
        requestAnimationFrame(() => pdfDevLog('engine:set-page', { page }));
      },
      setScale: (scale) => {
        pdfRef.current?.setNativeScale(scale);
        requestAnimationFrame(() => pdfDevLog('engine:set-scale', { scale }));
      },
    }), []);

    const handleTouchStart = useCallback((event: GestureResponderEvent) => {
      const { pageX, pageY, touches } = event.nativeEvent;
      if (touches.length !== 1) {
        touchStartRef.current = null;
        return;
      }
      touchStartRef.current = { pageX, pageY, startedAt: Date.now() };
    }, []);

    const handleTouchEnd = useCallback((event: GestureResponderEvent) => {
      const touchStart = touchStartRef.current;
      touchStartRef.current = null;
      if (!touchStart) return;

      const { locationX, locationY, pageX, pageY } = event.nativeEvent;
      const elapsed = Date.now() - touchStart.startedAt;
      const movement = Math.hypot(pageX - touchStart.pageX, pageY - touchStart.pageY);
      if (
        elapsed > PDF_QUICK_TAP_MAX_DURATION_MS
        || movement > PDF_QUICK_TAP_MAX_MOVEMENT_DP
      ) return;

      if (onQuickTap?.(locationX, locationY)) {
        suppressNativeTapCountRef.current += 1;
        suppressNativeTapUntilRef.current = Date.now() + PDF_NATIVE_TAP_SUPPRESSION_MS;
      }
    }, [onQuickTap]);

    const handleTouchCancel = useCallback(() => {
      touchStartRef.current = null;
    }, []);

    const handleNativeSingleTap = useCallback((page: number, x: number, y: number) => {
      if (
        suppressNativeTapCountRef.current > 0
        && Date.now() <= suppressNativeTapUntilRef.current
      ) {
        suppressNativeTapCountRef.current -= 1;
        return;
      }
      suppressNativeTapCountRef.current = 0;
      onSingleTap(page, x, y);
    }, [onSingleTap]);

    return (
      <View
        onTouchCancel={handleTouchCancel}
        onTouchEnd={handleTouchEnd}
        onTouchStart={handleTouchStart}
        style={{ backgroundColor: theme.bg, flex: 1 }}
      >
        <Pdf
          ref={(instance: ReactNativePdfHandle | null) => {
            pdfRef.current = instance;
          }}
          enableAnnotationRendering
          enableAntialiasing
          enableDoubleTapZoom={false}
          enablePaging={isPaginated}
          fitPolicy={fitPolicy}
          horizontal={isPaginated}
          maxScale={PDF_DEFAULTS.maxScale}
          minScale={PDF_DEFAULTS.minScale}
          onError={onError}
          onLoadComplete={onLoadComplete}
          onLoadProgress={onLoadProgress}
          onPageChanged={onPageChanged}
          onPageSingleTap={handleNativeSingleTap}
          onPressLink={onExternalLink}
          onScaleChanged={onScaleChanged}
          page={initialPage}
          scale={scale}
          scrollEnabled={Platform.OS === 'android' || !isPaginated}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          singlePage={Platform.OS === 'android' && isPaginated}
          source={source}
          spacing={isPaginated ? 0 : PDF_SCROLL_PAGE_SPACING}
          style={{ backgroundColor: theme.bg, flex: 1, height, width }}
        />
      </View>
    );
  },
));
