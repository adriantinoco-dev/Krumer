import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, PixelRatio, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';
import { DEFAULT_PDF_ENGINE, PDF_DEFAULTS, type PdfEngineHandle, type PdfEngineKind, type PdfReaderHandle, type PdfReaderProps } from './PdfReader.types';
import { NativePdfEngine } from './pdf/NativePdfEngine';
import { PdfWebEngine } from './pdf/PdfWebEngine';
import { describePdfSource, pdfDevLog, pdfDevMetric, pdfDevWarn } from './pdf/pdfDebug';
import { clampPdfPage, clampPdfScale } from './pdf/pdfState';
import { savePdfScale } from './pdf/usePdfPrefs';
import { usePdfSource } from './pdf/usePdfSource';
import { subscribeToReaderVolumeKeyEvents, type ReaderVolumeDirection } from './readerVolumeKeys';

const PDF_LOAD_STALL_TIMEOUT_MS = 15_000;
const PDF_LOAD_MAX_WAIT_MS = 90_000;
const PDF_SIDE_TAP_RATIO = 0.25;
const PDF_VOLUME_SCROLL_VIEWPORT_RATIO = 0.18;
const PDF_VOLUME_REPEAT_MAX_AGE_MS = 100;
const styles = StyleSheet.create({
  interactionBlocker: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
});

export const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader(
  {
    displayMode = PDF_DEFAULTS.displayMode,
    engine = DEFAULT_PDF_ENGINE,
    filePath,
    fileSize,
    initialPage = 1,
    interactionEnabled = true,
    onCenterTap,
    onExternalLink,
    onPageChange,
    onScaleChange,
  },
  ref,
) {
  const { theme, t } = useApp();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const { error: sourceError, resolvedUri, resolving } = usePdfSource(filePath, fileSize);
  const engineRef = useRef<PdfEngineHandle>(null);
  const [activeEngine, setActiveEngine] = useState<PdfEngineKind>(engine);
  const activeEngineRef = useRef<PdfEngineKind>(engine);
  const fallbackAttemptedRef = useRef(false);
  const initialPageRef = useRef(initialPage);
  const currentPageRef = useRef(clampPdfPage(initialPage, 0));
  const totalPagesRef = useRef(0);
  const documentLoadedRef = useRef(false);
  const previousDisplayModeRef = useRef(displayMode);
  const previousViewportRef = useRef({ height: viewportHeight, width: viewportWidth });
  const onCenterTapRef = useRef(onCenterTap);
  const interactionEnabledRef = useRef(interactionEnabled);
  const lastReportedSnapshotRef = useRef<string | null>(null);
  const loadProgressBucketRef = useRef(-1);
  const sessionStartedAtRef = useRef(Date.now());
  const loadStartedAtRef = useRef(Date.now());
  const loadActivityAtRef = useRef(Date.now());
  const loadProgressRef = useRef(0);
  const firstPageReadyRef = useRef(false);
  const pendingPageMetricRef = useRef<{ page: number; startedAt: number } | null>(null);
  const pendingScaleMetricRef = useRef<{ scale: number; startedAt: number } | null>(null);
  // Cada sessão de leitura começa no ajuste natural da página. O zoom escolhido
  // pelo usuário permanece válido somente enquanto este livro está aberto.
  const initialScaleRef = useRef<number>(PDF_DEFAULTS.scale);
  const currentScaleRef = useRef<number>(initialScaleRef.current);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  onCenterTapRef.current = onCenterTap;
  interactionEnabledRef.current = interactionEnabled;

  useEffect(() => {
    pdfDevLog('reader:engine-selected', { engine });
  }, [engine]);

  useEffect(() => {
    activeEngineRef.current = engine;
    fallbackAttemptedRef.current = false;
    setActiveEngine(engine);
  }, [engine, filePath]);

  useEffect(() => {
    // Limpa preferências antigas da implementação anterior para que nenhum
    // zoom persistido volte a ser aplicado em uma nova abertura.
    void savePdfScale(PDF_DEFAULTS.scale);
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
      engine: activeEngineRef.current,
      from: previousDisplayMode,
      page: targetPage,
      to: displayMode,
    });
    // The WebView converts its current page/fraction anchor while changing
    // flow. A follow-up SET_PAGE would erase that offset; only the native
    // adapter still needs the historical page nudge.
    if (activeEngineRef.current === 'webview') return undefined;
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
      engine: activeEngineRef.current,
      from: previousViewport,
      page: targetPage,
      to: { height: viewportHeight, width: viewportWidth },
    });
    // FixedLayout owns a normalized anchor across its ResizeObserver relayout.
    // Re-sending SET_PAGE here would turn the same page into a page navigation
    // and reset that preserved offset. The native engine still needs its
    // historical page nudge after Android has delivered the new viewport.
    if (activeEngineRef.current === 'webview') return undefined;
    const frame = requestAnimationFrame(() => engineRef.current?.setPage(targetPage));
    return () => cancelAnimationFrame(frame);
  }, [viewportHeight, viewportWidth]);

  useEffect(() => {
    const target = clampPdfPage(initialPageRef.current, 0);
    currentPageRef.current = target;
    totalPagesRef.current = 0;
    documentLoadedRef.current = false;
    currentScaleRef.current = PDF_DEFAULTS.scale;
    onScaleChange?.(PDF_DEFAULTS.scale);
    lastReportedSnapshotRef.current = null;
    loadProgressBucketRef.current = -1;
    sessionStartedAtRef.current = Date.now();
    loadStartedAtRef.current = Date.now();
    loadActivityAtRef.current = loadStartedAtRef.current;
    loadProgressRef.current = 0;
    firstPageReadyRef.current = false;
    pendingPageMetricRef.current = null;
    pendingScaleMetricRef.current = null;
    pdfDevLog('reader:session-reset', {
      initialPage: target,
      source: describePdfSource(filePath),
    });
    setLoading(true);
    setError(null);
    setErrorDetail(null);
  }, [filePath, onScaleChange]);

  useEffect(() => {
    if (!sourceError) return;
    console.warn('[Krumer PdfReader] falha ao resolver URI', filePath, sourceError);
    setLoading(false);
    setError(t('reader.pdfOpenFailed'));
    setErrorDetail(sourceError);
  }, [filePath, sourceError, t]);

  useEffect(() => {
    if (resolving || !resolvedUri || !loading || error) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const checkLoadHealth = () => {
      if (!loading || error || documentLoadedRef.current) return;
      const now = Date.now();
      const elapsedMs = now - loadStartedAtRef.current;
      const idleMs = now - loadActivityAtRef.current;
      if (elapsedMs < PDF_LOAD_MAX_WAIT_MS && idleMs < PDF_LOAD_STALL_TIMEOUT_MS) {
        timer = setTimeout(checkLoadHealth, Math.min(
          PDF_LOAD_MAX_WAIT_MS - elapsedMs,
          PDF_LOAD_STALL_TIMEOUT_MS - idleMs,
        ));
        return;
      }
      pdfDevWarn('reader:load-timeout', {
        currentPage: currentPageRef.current,
        documentLoaded: documentLoadedRef.current,
        elapsedMs,
        idleMs,
        progress: loadProgressRef.current,
        resolved: describePdfSource(resolvedUri),
        totalPages: totalPagesRef.current,
      });
      setLoading(false);
      setError(t('reader.pdfOpenFailed'));
      setErrorDetail(`PDF load timed out after ${Math.round(PDF_LOAD_MAX_WAIT_MS / 1000)} seconds or ${Math.round(PDF_LOAD_STALL_TIMEOUT_MS / 1000)} seconds without progress.`);
    };
    timer = setTimeout(checkLoadHealth, PDF_LOAD_STALL_TIMEOUT_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [error, loading, resolvedUri, resolving, t]);

  const publishPage = useCallback((page: number, total: number) => {
    if (!Number.isInteger(total) || total < 1) return;
    const nextPage = clampPdfPage(page, total);
    currentPageRef.current = nextPage;
    totalPagesRef.current = total;
    const pendingPage = pendingPageMetricRef.current;
    if (pendingPage && pendingPage.page === nextPage) {
      pdfDevMetric('reader:page-ready', {
        engine: activeEngineRef.current,
        latencyMs: Math.max(0, Date.now() - pendingPage.startedAt),
        page: nextPage,
      });
      pendingPageMetricRef.current = null;
    }
    setLoading(false);
    setError(null);
    setErrorDetail(null);

    const snapshot = `${nextPage}/${total}`;
    if (snapshot === lastReportedSnapshotRef.current) return;
    lastReportedSnapshotRef.current = snapshot;
    onPageChange?.(nextPage, total);
  }, [onPageChange]);

  const markFirstPageReady = useCallback((page: number, total: number) => {
    if (firstPageReadyRef.current) return;
    firstPageReadyRef.current = true;
    pdfDevMetric('reader:first-page-ready', {
      elapsedMs: Math.max(0, Date.now() - sessionStartedAtRef.current),
      engine: activeEngineRef.current,
      page,
      totalPages: total,
    });
  }, []);

  const handleLoadComplete = useCallback((numberOfPages: number) => {
    pdfDevLog('native:load-complete', {
      engine: activeEngineRef.current,
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
        engine: activeEngineRef.current,
        numberOfPages,
      });
      publishPage(currentPageRef.current, numberOfPages);
      return;
    }
    const target = clampPdfPage(initialPageRef.current, numberOfPages);
    documentLoadedRef.current = true;
    publishPage(target, numberOfPages);
    markFirstPageReady(target, numberOfPages);
    requestAnimationFrame(() => {
      engineRef.current?.setPage(target);
      if (Math.abs(currentScaleRef.current - initialScaleRef.current) >= 0.001) {
        engineRef.current?.setScale(currentScaleRef.current);
      }
    });
  }, [markFirstPageReady, publishPage, t]);

  const handlePageChanged = useCallback((page: number, numberOfPages: number) => {
    if (!documentLoadedRef.current) {
      if (!Number.isInteger(numberOfPages) || numberOfPages < 1) {
        pdfDevWarn('native:page-changed-invalid', { engine: activeEngineRef.current, numberOfPages, page });
        return;
      }
      const target = clampPdfPage(initialPageRef.current, numberOfPages);
      documentLoadedRef.current = true;
      pdfDevLog('native:page-changed-used-as-ready', {
        engine: activeEngineRef.current,
        numberOfPages,
        reportedPage: page,
        targetPage: target,
      });
      publishPage(target, numberOfPages);
      markFirstPageReady(target, numberOfPages);
      if (page !== target) {
        requestAnimationFrame(() => engineRef.current?.setPage(target));
      }
      return;
    }
    pdfDevLog('native:page-changed', { engine: activeEngineRef.current, numberOfPages, page });
    publishPage(page, numberOfPages);
  }, [markFirstPageReady, publishPage]);

  const handleLoadProgress = useCallback((progress: number) => {
    const nextProgress = Math.max(0, Math.min(1, progress));
    if (nextProgress > loadProgressRef.current + 0.0001) {
      loadProgressRef.current = nextProgress;
      loadActivityAtRef.current = Date.now();
    }
    const bucket = Math.max(0, Math.min(4, Math.floor(nextProgress * 4)));
    if (bucket === loadProgressBucketRef.current) return;
    loadProgressBucketRef.current = bucket;
    pdfDevLog('native:load-progress', {
      engine: activeEngineRef.current,
      progress: Number(nextProgress.toFixed(2)),
    });
  }, []);

  const handleError = useCallback((caught: unknown) => {
    const detail = describePdfError(caught);
    pdfDevWarn('native:error', {
      detail,
      engine: activeEngineRef.current,
      source: describePdfSource(filePath),
    });
    setLoading(false);
    setError(t('reader.pdfOpenFailed'));
    setErrorDetail(detail || null);
  }, [filePath, t]);

  const handleEngineError = useCallback((caught: unknown, failedEngine: PdfEngineKind) => {
    // A native error can arrive just after its view was replaced by the
    // fallback WebView. Do not let that stale callback hide the recovery.
    if (failedEngine !== activeEngineRef.current) return;
    if (
      failedEngine === 'webview'
      && activeEngineRef.current === 'webview'
      && !fallbackAttemptedRef.current
    ) {
      fallbackAttemptedRef.current = true;
      activeEngineRef.current = DEFAULT_PDF_ENGINE;
      if (totalPagesRef.current > 0) {
        initialPageRef.current = clampPdfPage(currentPageRef.current, totalPagesRef.current);
      }
      documentLoadedRef.current = false;
      totalPagesRef.current = 0;
      currentPageRef.current = clampPdfPage(initialPageRef.current, 0);
      currentScaleRef.current = PDF_DEFAULTS.scale;
      pendingScaleMetricRef.current = null;
      onScaleChange?.(PDF_DEFAULTS.scale);
      lastReportedSnapshotRef.current = null;
      loadProgressBucketRef.current = -1;
      pdfDevWarn('web:fallback-native', {
        detail: describePdfError(caught),
        source: describePdfSource(filePath),
      });
      setActiveEngine(DEFAULT_PDF_ENGINE);
      setLoading(true);
      setError(null);
      setErrorDetail(null);
      return;
    }
    handleError(caught);
  }, [filePath, handleError, onScaleChange]);

  const handleNativeError = useCallback((caught: unknown) => {
    handleEngineError(caught, 'native');
  }, [handleEngineError]);

  const handleWebError = useCallback((caught: unknown) => {
    handleEngineError(caught, 'webview');
  }, [handleEngineError]);

  const goToPage = useCallback((page: number) => {
    if (totalPagesRef.current < 1 || !documentLoadedRef.current) return;
    const target = clampPdfPage(page, totalPagesRef.current);
    if (target === currentPageRef.current) return;
    currentPageRef.current = target;
    pendingPageMetricRef.current = { page: target, startedAt: Date.now() };
    pdfDevMetric('reader:page-request', { engine: activeEngineRef.current, page: target });
    engineRef.current?.setPage(target);
  }, []);

  const getScale = useCallback(() => currentScaleRef.current, []);

  const setScale = useCallback((requestedScale: number) => {
    const nextScale = clampPdfScale(requestedScale);
    const pendingScale = pendingScaleMetricRef.current?.scale;
    if (pendingScale !== undefined && Math.abs(pendingScale - nextScale) < 0.001) return;
    // Restoring 100% must reapply the fit even if the displayed scale is already
    // 100% (for example after a pan or a very small pinch).
    if (nextScale !== PDF_DEFAULTS.scale && pendingScale === undefined
      && Math.abs(currentScaleRef.current - nextScale) < 0.001) return;
    if (documentLoadedRef.current) {
      pendingScaleMetricRef.current = { scale: nextScale, startedAt: Date.now() };
      pdfDevMetric('reader:scale-request', { engine: activeEngineRef.current, scale: nextScale });
      engineRef.current?.setScale(nextScale);
    }
  }, []);

  const handleScaleChanged = useCallback((reportedScale: number) => {
    const nextScale = clampPdfScale(reportedScale, false);
    const pendingScale = pendingScaleMetricRef.current;
    if (pendingScale && Math.abs(nextScale - pendingScale.scale) < 0.01) {
      pdfDevMetric('reader:scale-ready', {
        engine: activeEngineRef.current,
        latencyMs: Math.max(0, Date.now() - pendingScale.startedAt),
        scale: nextScale,
      });
      pendingScaleMetricRef.current = null;
    }
    const changed = Math.abs(nextScale - currentScaleRef.current) >= 0.001;
    currentScaleRef.current = nextScale;
    onScaleChange?.(nextScale);
    if (changed) {
      pdfDevMetric('reader:scale-changed', { engine: activeEngineRef.current, scale: nextScale });
    }
  }, [onScaleChange]);

  useImperativeHandle(ref, () => ({ getScale, goToPage, setScale }), [getScale, goToPage, setScale]);

  useEffect(() => {
    if (!interactionEnabled) return undefined;
    let webviewScrollHeld = false;
    let pressedDirection: ReaderVolumeDirection | null = null;
    let nativeClockOffset: number | null = null;
    let lastHoldEventAt = 0;
    const stopWebviewHold = () => {
      if (webviewScrollHeld) engineRef.current?.stopViewportScroll();
      webviewScrollHeld = false;
    };
    const stop = subscribeToReaderVolumeKeyEvents((event) => {
      // Release must still stop an active hold while a document is unloading.
      if (event.phase === 'release') {
        if (pressedDirection === event.direction) {
          stopWebviewHold();
          pressedDirection = null;
          nativeClockOffset = null;
        }
        return;
      }
      if (!documentLoadedRef.current) return;
      if (displayMode === 'scroll') {
        const fraction = event.direction === 'next'
          ? PDF_VOLUME_SCROLL_VIEWPORT_RATIO
          : -PDF_VOLUME_SCROLL_VIEWPORT_RATIO;
        if (activeEngineRef.current === 'webview') {
          if (event.phase === 'press') {
            stopWebviewHold();
            pressedDirection = event.direction;
            nativeClockOffset = event.eventTime === undefined ? null : Date.now() - event.eventTime;
            lastHoldEventAt = 0;
            engineRef.current?.scrollByViewport(fraction);
          } else if (pressedDirection === event.direction) {
            // Keep the original 18% step for each native repeat. Discard old
            // or duplicated events instead of replaying a backlog after a stall.
            const eventAt = nativeClockOffset !== null && event.eventTime !== undefined
              ? nativeClockOffset + event.eventTime
              : Date.now();
            if (Date.now() - eventAt >= PDF_VOLUME_REPEAT_MAX_AGE_MS || eventAt <= lastHoldEventAt) return;
            lastHoldEventAt = eventAt;
            webviewScrollHeld = true;
            engineRef.current?.scrollByViewport(fraction, true);
          }
          return;
        }
        engineRef.current?.scrollByViewport(fraction);
        requestAnimationFrame(() => pdfDevLog('controls:volume-scroll', {
          direction: event.direction,
          fraction,
          phase: event.phase,
        }));
        return;
      }
      if (event.phase !== 'press') return;
      const delta = event.direction === 'next' ? 1 : -1;
      goToPage(currentPageRef.current + delta);
      const page = currentPageRef.current;
      requestAnimationFrame(() => pdfDevLog('controls:volume-key', { direction: event.direction, page }));
    });
    return () => {
      stopWebviewHold();
      stop();
    };
  }, [displayMode, goToPage, interactionEnabled]);

  const handleTapAtX = useCallback((tapX: number, source: 'quick' | 'native' | 'webview') => {
    if (!interactionEnabledRef.current) return false;
    if (displayMode !== 'paginated') return false;
    // An enlarged page owns lateral taps for panning; never turn a page while
    // there is zoomed content that the reader may still want to inspect.
    if (currentScaleRef.current > PDF_DEFAULTS.scale + 0.001) return false;
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

  const handleNativeSingleTap = useCallback((_page: number, x: number, _y: number) => {
    if (!interactionEnabledRef.current) return;
    const tapX = Platform.OS === 'android' ? x / PixelRatio.get() : x;
    if (handleTapAtX(tapX, 'native')) return;
    pdfDevLog('controls:toggle-bars-tap');
    onCenterTapRef.current?.();
  }, [handleTapAtX]);

  const handleWebSingleTap = useCallback((_page: number, x: number, _y: number) => {
    if (!interactionEnabledRef.current) return;
    if (handleTapAtX(x, 'webview')) return;
    pdfDevLog('controls:toggle-bars-tap');
    onCenterTapRef.current?.();
  }, [handleTapAtX]);

  const handleExternalLink = useCallback((url: string) => {
    if (!interactionEnabledRef.current) return;
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

  if (activeEngine !== 'webview' && (resolving || !resolvedUri)) {
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
      {activeEngine === 'webview' ? (
        <PdfWebEngine
          ref={engineRef}
          displayMode={displayMode}
          fileSize={fileSize}
          initialPage={initialPageRef.current}
          onError={handleWebError}
          onExternalLink={handleExternalLink}
          onLoadComplete={handleLoadComplete}
          onLoadProgress={handleLoadProgress}
          onPageChanged={handlePageChanged}
          onScaleChanged={handleScaleChanged}
          onSingleTap={handleWebSingleTap}
          resolvedUri={resolvedUri}
          scale={initialScaleRef.current}
        />
      ) : resolvedUri ? (
        <NativePdfEngine
        ref={engineRef}
        displayMode={displayMode}
        initialPage={initialPageRef.current}
        onError={handleNativeError}
        onExternalLink={handleExternalLink}
        onLoadComplete={handleLoadComplete}
        onLoadProgress={handleLoadProgress}
        onPageChanged={handlePageChanged}
        onQuickTap={handleQuickTap}
        onScaleChanged={handleScaleChanged}
        onSingleTap={handleNativeSingleTap}
        resolvedUri={resolvedUri}
        scale={initialScaleRef.current}
        />
      ) : null}
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
            {resolving || !resolvedUri ? 'Preparando PDF...' : 'Carregando documento...'}
          </Text>
        </View>
      ) : null}
      <View
        collapsable={false}
        pointerEvents={interactionEnabled ? 'none' : 'auto'}
        style={styles.interactionBlocker}
      />
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
