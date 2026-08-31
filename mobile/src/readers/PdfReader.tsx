import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, PixelRatio, Platform, Text, useWindowDimensions, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';
import { PDF_DEFAULTS, type PdfReaderHandle, type PdfReaderProps } from './PdfReader.types';
import { NativePdfEngine, type NativePdfEngineHandle } from './pdf/NativePdfEngine';
import { describePdfSource, pdfDevLog, pdfDevWarn } from './pdf/pdfDebug';
import { clampPdfPage } from './pdf/pdfState';
import { loadPdfPrefs } from './pdf/usePdfPrefs';
import { usePdfSource } from './pdf/usePdfSource';
import { subscribeToReaderVolumeKeys } from './readerVolumeKeys';

const PDF_LOAD_TIMEOUT_MS = 12_000;
const PDF_SIDE_TAP_RATIO = 0.25;
const PDF_VOLUME_SCROLL_VIEWPORT_RATIO = 0.18;

export const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader(
  {
    displayMode = PDF_DEFAULTS.displayMode,
    filePath,
    initialPage = 1,
    onCenterTap,
    onExternalLink,
    onPageChange,
  },
  ref,
) {
  const { theme, t } = useApp();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const { error: sourceError, resolvedUri, resolving } = usePdfSource(filePath);
  const engineRef = useRef<NativePdfEngineHandle>(null);
  const initialPageRef = useRef(initialPage);
  const currentPageRef = useRef(clampPdfPage(initialPage, 0));
  const totalPagesRef = useRef(0);
  const documentLoadedRef = useRef(false);
  const previousDisplayModeRef = useRef(displayMode);
  const previousViewportRef = useRef({ height: viewportHeight, width: viewportWidth });
  const onCenterTapRef = useRef(onCenterTap);
  const lastReportedSnapshotRef = useRef<string | null>(null);
  const loadProgressBucketRef = useRef(-1);
  const [scale, setScale] = useState<number>(PDF_DEFAULTS.scale);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  onCenterTapRef.current = onCenterTap;

  useEffect(() => {
    let active = true;
    void loadPdfPrefs().then((preferences) => {
      if (active) setScale(preferences.scale);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    initialPageRef.current = initialPage;
    const target = clampPdfPage(initialPage, totalPagesRef.current);
    if (target === currentPageRef.current) return;
    currentPageRef.current = target;
    engineRef.current?.setPage(target);
  }, [initialPage]);

  useEffect(() => {
    const previousDisplayMode = previousDisplayModeRef.current;
    previousDisplayModeRef.current = displayMode;
    if (previousDisplayMode === displayMode || !documentLoadedRef.current) return undefined;

    const targetPage = currentPageRef.current;
    pdfDevLog('reader:display-mode-changed', {
      from: previousDisplayMode,
      page: targetPage,
      to: displayMode,
    });
    const frame = requestAnimationFrame(() => engineRef.current?.setPage(targetPage));
    return () => cancelAnimationFrame(frame);
  }, [displayMode]);

  useEffect(() => {
    const previousViewport = previousViewportRef.current;
    previousViewportRef.current = { height: viewportHeight, width: viewportWidth };
    if (
      (previousViewport.height === viewportHeight && previousViewport.width === viewportWidth)
      || !documentLoadedRef.current
    ) return undefined;

    const targetPage = currentPageRef.current;
    pdfDevLog('reader:viewport-changed', {
      from: previousViewport,
      page: targetPage,
      to: { height: viewportHeight, width: viewportWidth },
    });
    const frame = requestAnimationFrame(() => engineRef.current?.setPage(targetPage));
    return () => cancelAnimationFrame(frame);
  }, [viewportHeight, viewportWidth]);

  useEffect(() => {
    const target = clampPdfPage(initialPageRef.current, 0);
    currentPageRef.current = target;
    totalPagesRef.current = 0;
    documentLoadedRef.current = false;
    lastReportedSnapshotRef.current = null;
    loadProgressBucketRef.current = -1;
    pdfDevLog('reader:session-reset', {
      initialPage: target,
      source: describePdfSource(filePath),
    });
    setLoading(true);
    setError(null);
    setErrorDetail(null);
  }, [filePath]);

  useEffect(() => {
    if (!sourceError) return;
    console.warn('[Krumer PdfReader] falha ao resolver URI', filePath, sourceError);
    setLoading(false);
    setError(t('reader.pdfOpenFailed'));
    setErrorDetail(sourceError);
  }, [filePath, sourceError, t]);

  useEffect(() => {
    if (resolving || !resolvedUri || !loading || error) return;
    const timer = setTimeout(() => {
      pdfDevWarn('reader:load-timeout', {
        currentPage: currentPageRef.current,
        documentLoaded: documentLoadedRef.current,
        resolved: describePdfSource(resolvedUri),
        totalPages: totalPagesRef.current,
      });
      setLoading(false);
      setError(t('reader.pdfOpenFailed'));
      setErrorDetail(`PDF load timed out after ${PDF_LOAD_TIMEOUT_MS / 1000} seconds.`);
    }, PDF_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [error, loading, resolvedUri, resolving, t]);

  const publishPage = useCallback((page: number, total: number) => {
    if (!Number.isInteger(total) || total < 1) return;
    const nextPage = clampPdfPage(page, total);
    currentPageRef.current = nextPage;
    totalPagesRef.current = total;
    setLoading(false);
    setError(null);
    setErrorDetail(null);

    const snapshot = `${nextPage}/${total}`;
    if (snapshot === lastReportedSnapshotRef.current) return;
    lastReportedSnapshotRef.current = snapshot;
    onPageChange?.(nextPage, total);
  }, [onPageChange]);

  const handleLoadComplete = useCallback((numberOfPages: number) => {
    pdfDevLog('native:load-complete', {
      initialPage: initialPageRef.current,
      numberOfPages,
    });
    if (!Number.isInteger(numberOfPages) || numberOfPages < 1) {
      setLoading(false);
      setError(t('reader.pdfOpenFailed'));
      setErrorDetail(`Invalid PDF page count: ${String(numberOfPages)}`);
      return;
    }
    if (documentLoadedRef.current) {
      pdfDevLog('native:load-complete-after-ready', {
        currentPage: currentPageRef.current,
        numberOfPages,
      });
      publishPage(currentPageRef.current, numberOfPages);
      return;
    }
    const target = clampPdfPage(initialPageRef.current, numberOfPages);
    documentLoadedRef.current = true;
    publishPage(target, numberOfPages);
    requestAnimationFrame(() => engineRef.current?.setPage(target));
  }, [publishPage, t]);

  const handlePageChanged = useCallback((page: number, numberOfPages: number) => {
    if (!documentLoadedRef.current) {
      if (!Number.isInteger(numberOfPages) || numberOfPages < 1) {
        pdfDevWarn('native:page-changed-invalid', { numberOfPages, page });
        return;
      }
      const target = clampPdfPage(initialPageRef.current, numberOfPages);
      documentLoadedRef.current = true;
      pdfDevLog('native:page-changed-used-as-ready', {
        numberOfPages,
        reportedPage: page,
        targetPage: target,
      });
      publishPage(target, numberOfPages);
      if (page !== target) {
        requestAnimationFrame(() => engineRef.current?.setPage(target));
      }
      return;
    }
    pdfDevLog('native:page-changed', { numberOfPages, page });
    publishPage(page, numberOfPages);
  }, [publishPage]);

  const handleLoadProgress = useCallback((progress: number) => {
    const bucket = Math.max(0, Math.min(4, Math.floor(progress * 4)));
    if (bucket === loadProgressBucketRef.current) return;
    loadProgressBucketRef.current = bucket;
    pdfDevLog('native:load-progress', { progress: Number(progress.toFixed(2)) });
  }, []);

  const handleError = useCallback((caught: unknown) => {
    const detail = describePdfError(caught);
    pdfDevWarn('native:error', { detail, source: describePdfSource(filePath) });
    setLoading(false);
    setError(t('reader.pdfOpenFailed'));
    setErrorDetail(detail || null);
  }, [filePath, t]);

  const goToPage = useCallback((page: number) => {
    if (totalPagesRef.current < 1 || !documentLoadedRef.current) return;
    const target = clampPdfPage(page, totalPagesRef.current);
    if (target === currentPageRef.current) return;
    currentPageRef.current = target;
    engineRef.current?.setPage(target);
  }, []);

  useImperativeHandle(ref, () => ({ goToPage }), [goToPage]);

  useEffect(() => subscribeToReaderVolumeKeys((direction) => {
    if (!documentLoadedRef.current) return;
    if (displayMode === 'scroll') {
      const fraction = direction === 'next'
        ? PDF_VOLUME_SCROLL_VIEWPORT_RATIO
        : -PDF_VOLUME_SCROLL_VIEWPORT_RATIO;
      engineRef.current?.scrollByViewport(fraction);
      requestAnimationFrame(() => pdfDevLog('controls:volume-scroll', { direction, fraction }));
      return;
    }
    const delta = direction === 'next' ? 1 : -1;
    goToPage(currentPageRef.current + delta);
    const page = currentPageRef.current;
    requestAnimationFrame(() => pdfDevLog('controls:volume-key', { direction, page }));
  }), [displayMode, goToPage]);

  const handleTapAtX = useCallback((tapX: number, source: 'quick' | 'native') => {
    if (displayMode !== 'paginated') return false;
    if (tapX <= viewportWidth * PDF_SIDE_TAP_RATIO) {
      goToPage(currentPageRef.current - 1);
      requestAnimationFrame(() => {
        pdfDevLog('controls:side-tap', {
          direction: 'previous',
          source,
          tapX,
          viewportWidth,
        });
      });
      return true;
    }
    if (tapX >= viewportWidth * (1 - PDF_SIDE_TAP_RATIO)) {
      goToPage(currentPageRef.current + 1);
      requestAnimationFrame(() => {
        pdfDevLog('controls:side-tap', { direction: 'next', source, tapX, viewportWidth });
      });
      return true;
    }
    return false;
  }, [displayMode, goToPage, viewportWidth]);

  const handleQuickTap = useCallback((tapX: number, _tapY: number) => (
    handleTapAtX(tapX, 'quick')
  ), [handleTapAtX]);

  const handleSingleTap = useCallback((_page: number, x: number, _y: number) => {
    const tapX = Platform.OS === 'android' ? x / PixelRatio.get() : x;
    if (handleTapAtX(tapX, 'native')) return;
    pdfDevLog('controls:toggle-bars-tap');
    onCenterTapRef.current?.();
  }, [handleTapAtX]);

  const handleExternalLink = useCallback((url: string) => {
    if (/^(https?:|mailto:|tel:)/i.test(url)) {
      onExternalLink?.(url);
      return;
    }
    console.warn('[Krumer PdfReader] esquema de link externo bloqueado', url);
  }, [onExternalLink]);

  if (error) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.bg, flex: 1, justifyContent: 'center', padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderRadius: radii.lg,
            borderWidth: 1,
            gap: spacing.sm,
            maxWidth: 360,
            padding: spacing.lg,
            width: '100%',
          }}
        >
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            {error}
          </Text>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
            {errorDetail || t('reader.pdfWebUnavailableDescription')}
          </Text>
          <Text selectable style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 10, marginTop: spacing.xs, textAlign: 'center' }}>
            {filePath}
          </Text>
        </View>
      </View>
    );
  }

  if (resolving || !resolvedUri) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.bg, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, marginTop: spacing.sm }}>
          Preparando PDF...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <NativePdfEngine
        ref={engineRef}
        displayMode={displayMode}
        initialPage={initialPageRef.current}
        onError={handleError}
        onExternalLink={handleExternalLink}
        onLoadComplete={handleLoadComplete}
        onLoadProgress={handleLoadProgress}
        onPageChanged={handlePageChanged}
        onQuickTap={handleQuickTap}
        onSingleTap={handleSingleTap}
        resolvedUri={resolvedUri}
        scale={scale}
      />
      {loading ? (
        <View
          pointerEvents="none"
          style={{
            alignItems: 'center',
            backgroundColor: theme.bg,
            bottom: 0,
            gap: spacing.sm,
            justifyContent: 'center',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
            zIndex: 10,
          }}
        >
          <ActivityIndicator color={theme.accent} size="large" />
          <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
            Carregando documento...
          </Text>
        </View>
      ) : null}
    </View>
  );
});

function describePdfError(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === 'string') return caught;
  try {
    return JSON.stringify(caught ?? '');
  } catch {
    return String(caught ?? '');
  }
}
