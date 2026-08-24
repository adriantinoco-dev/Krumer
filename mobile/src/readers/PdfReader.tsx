import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { radii, serifFont, spacing } from '../theme';
import { useApp } from '../context/AppContext';
import type { PdfPageSize } from './PdfReader.types';
import { PDF_DEFAULTS } from './PdfReader.types';
import { cleanupCachedPdfUri, resolvePdfUri } from './pdf/pdfUri';
import { loadPdfPrefs } from './pdf/usePdfPrefs';
import { PdfHorizontal } from './pdf/PdfHorizontal';

/**
 * PdfReader — orquestrador do leitor PDF (D1 + D4 + base D2/D3).
 *
 * Paridade com frontend/js/reader-pdf.js:28 openPdf() + :412 horizontal.
 * - D1: abertura robusta (resolve content://, mede baseAspect via onLoadComplete, clamp initialPage)
 * - D2: placeholder dimensionado (fittedHeight em PdfHorizontal)
 * - D3: render lazy + HiDPI guard (renderingPagesRef + enableAntialiasing)
 * - D4: modo horizontal página única (singlePage=true após capturar total real)
 *
 * Contrato externo mantido: {filePath, initialPage, onPageChange, onCenterTap}
 */

type PdfReaderProps = {
  filePath: string;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
  onCenterTap?: () => void;
};

export function PdfReader({ filePath, initialPage = 1, onPageChange, onCenterTap }: PdfReaderProps) {
  const { width } = useWindowDimensions();
  const { theme, t } = useApp();

  // D1 — estados de abertura
  const [resolving, setResolving] = useState(true);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  // D1/D4 — estado de documento
  const [currentPage, setCurrentPage] = useState<number>(() => clampPage(initialPage, 1));
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize, setPageSize] = useState<PdfPageSize | null>(null);
  const [scale, setScale] = useState<number>(PDF_DEFAULTS.scale);
  const [captured, setCaptured] = useState(false);

  // D4 — singlePage sempre true no mobile horizontal (D4). O hack de capturar com false causava flash de 2 páginas;
  // em react-native-pdf 6.7.5 o onPageChanged já entrega total correto (139) mesmo com singlePage=true, então mantemos true.
  const [isSinglePageReady, setIsSinglePageReady] = useState(true);

  // D3 — guard de renderização (reader-pdf.js:16 renderingPages + :395 has)
  const renderingPagesRef = useRef<Set<number>>(new Set());
  const hasCapturedTotalRef = useRef(false);
  const resolvedUriRef = useRef<string | null>(null);
  const initialPageRef = useRef(initialPage);

  // Manter refs sincronizadas
  useEffect(() => {
    initialPageRef.current = initialPage;
  }, [initialPage]);

  // D1 — carregar preferências (scale) — modo/coluna ficam para P3/P5, mas já lidos
  useEffect(() => {
    loadPdfPrefs().then((prefs) => {
      setScale(prefs.scale);
    });
  }, []);

  // Sincroniza currentPage quando initialPage muda externamente (ReaderScreen)
  useEffect(() => {
    setCurrentPage(clampPage(initialPage, totalPages || 9999));
  }, [initialPage, totalPages]);

  // Reset ao trocar de arquivo — espelha openPdf():38-40 + :56-70
  useEffect(() => {
    setIsSinglePageReady(true);
    setPageSize(null);
    setTotalPages(0);
    setCaptured(false);
    hasCapturedTotalRef.current = false;
    renderingPagesRef.current.clear();
    setError(null);
    setErrorDetail(null);
    setLoading(true);
  }, [filePath]);

  // D1 — resolução de URI + cleanup de cache anterior
  useEffect(() => {
    let cancelled = false;
    const prevUri = resolvedUriRef.current;

    setResolving(true);
    setError(null);
    setErrorDetail(null);
    setLoading(true);

    resolvePdfUri(filePath)
      .then((uri) => {
        if (cancelled) {
          // se cancelado, limpar cópia recém-criada se for content://
          cleanupCachedPdfUri(uri, filePath);
          return;
        }
        // limpar cache anterior se era content://
        if (prevUri && prevUri !== uri) {
          cleanupCachedPdfUri(prevUri, filePath);
        }
        resolvedUriRef.current = uri;
        setResolvedUri(uri);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[Krumer PdfReader:D1] falha ao resolver URI', filePath, msg);
        if (!cancelled) {
          setError(t('reader.pdfWebUnavailableTitle') ?? 'Falha ao abrir PDF');
          setErrorDetail(msg);
          setLoading(false);
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, t]);

  // Cleanup de arquivo temporário no unmount
  useEffect(() => {
    return () => {
      if (resolvedUriRef.current) {
        cleanupCachedPdfUri(resolvedUriRef.current, filePath);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback anti-infinito: se em 4s não capturou total, destrava loading para não travar em "Carregando documento"
  useEffect(() => {
    if (captured || resolving || !resolvedUri) return;
    const t = setTimeout(() => {
      console.warn('[Krumer PdfReader:D1] timeout sem onLoadComplete — destravando', { totalPages, isSinglePageReady });
      if (!hasCapturedTotalRef.current) {
        // tenta usar fallback: assume 1 página para destravar, onPageChanged pode corrigir depois
        setLoading(false);
        if (totalPages === 0) setTotalPages(1);
        hasCapturedTotalRef.current = true;
        setCaptured(true);
        setIsSinglePageReady(true);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [captured, resolving, resolvedUri, totalPages, isSinglePageReady]);

  // D1 — onLoadComplete: captura totalPages + pageSize (baseAspect) e ativa singlePage
  // Espelha reader-pdf.js:63-74 (mede viewport page1) + :88-111 (salva página)
  const handleLoadComplete = useCallback(
    (numberOfPages: number, _path: string, size: PdfPageSize) => {
      console.log('[Krumer PdfReader:D1] onLoadComplete pages=', numberOfPages, ' size=', size, ' singleReady=', isSinglePageReady, ' hasTotal=', hasCapturedTotalRef.current, ' totalPages=', totalPages);

      // D3 — singlePage=true reporta 1 página erroneamente (reader-pdf.js:391)
      if (isSinglePageReady && numberOfPages === 1 && totalPages > 1) {
        console.log('[Krumer PdfReader:D3] ignora 1 página em singlePage, mantém total', totalPages);
        setLoading(false);
        if (!hasCapturedTotalRef.current) {
          hasCapturedTotalRef.current = true;
          setCaptured(true);
        }
        return;
      }

      // Se já capturamos total e recebemos 1 de novo (bounce), ignorar
      if (hasCapturedTotalRef.current && numberOfPages === 1 && totalPages > 1) {
        console.log('[Krumer PdfReader:D1] bounce 1 ignorado, mantém', totalPages);
        setLoading(false);
        return;
      }

      console.log('[Krumer PdfReader:D1] capturando total', numberOfPages);
      setTotalPages(numberOfPages);
      if (size?.width && size?.height) setPageSize(size);
      setLoading(false);
      setError(null);
      hasCapturedTotalRef.current = true;
      setCaptured(true);

      // D1 — clamp initialPage como reader-pdf.js:90 if(savedPage <1 || >total) savedPage=1
      const targetPage = clampPage(initialPageRef.current, numberOfPages);
      setCurrentPage(targetPage);
      renderingPagesRef.current.clear();
      if (onPageChange) onPageChange(targetPage, numberOfPages);

      // D4 — singlePage já true, não precisa switch (mantido para compatibilidade)
      if (!isSinglePageReady) setIsSinglePageReady(true);
    },
    [isSinglePageReady, totalPages, onPageChange],
  );

  // Fallback se onLoadComplete não disparar (reader-pdf.js:114 handlePageChanged)
  const handlePageChanged = useCallback(
    (page: number, numberOfPages: number) => {
      console.log('[Krumer PdfReader:D1] onPageChanged', page, '/', numberOfPages, ' captured=', hasCapturedTotalRef.current, ' totalPages=', totalPages);
      // Só usa fallback se ainda não temos total
      if (!hasCapturedTotalRef.current) {
        if (numberOfPages === 1 && page === 1) {
          // pode ser 1 página real ou report fantasma 1/1 de singlePage — aguarda onLoadComplete se ainda não capturou 139
          // Se já recebemos 139 antes, este 1/1 será tratado no else
          console.log('[Krumer PdfReader:D1] primeiro onPageChanged, aguardando total real...');
        }
        setTotalPages(numberOfPages);
        setLoading(false);
        setCaptured(true);
        const target = clampPage(initialPageRef.current || page, numberOfPages);
        setCurrentPage(target);
        if (onPageChange) onPageChange(target, numberOfPages);
        hasCapturedTotalRef.current = true;
        setIsSinglePageReady(true);
      } else {
        // Pós-captura: corrige total se veio maior (ex: primeiro foi 1/1 fantasma, depois 1/139 correto)
        if (numberOfPages > totalPages) {
          console.log('[Krumer PdfReader:D1] corrige total', totalPages, '->', numberOfPages);
          setTotalPages(numberOfPages);
        }
        if (numberOfPages === 1 && totalPages > 1) {
          console.log('[Krumer PdfReader:D1] ignora onPageChanged 1/1 fantasma, mantém', totalPages);
          return;
        }
        if (page !== currentPage) {
          const effectiveTotal = numberOfPages > totalPages ? numberOfPages : totalPages;
          if (effectiveTotal > 0 && (page < 1 || page > effectiveTotal)) {
            console.log('[Krumer PdfReader:D1] ignora page fora do range', page);
            return;
          }
          setCurrentPage(page);
          if (onPageChange) onPageChange(page, effectiveTotal || numberOfPages);
        }
      }
    },
    [currentPage, onPageChange, totalPages],
  );

  const handleLoadProgress = useCallback((percent: number) => {
    if (percent >= 1) setTimeout(() => setLoading(false), 500);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? '');
      console.warn('[Krumer PdfReader:D1] onError', filePath, msg);
      setLoading(false);
      setError('Falha ao abrir PDF');
      setErrorDetail(msg || null);
    },
    [filePath],
  );

  // D4 — navegação com guard D3 (renderingPages)
  const goToPage = useCallback(
    (nextPage: number) => {
      const max = totalPages || 9999;
      const clamped = clampPage(nextPage, max);
      if (clamped === currentPage && totalPages > 0) return;
      if (renderingPagesRef.current.has(clamped)) return;
      renderingPagesRef.current.add(clamped);
      setCurrentPage(clamped);
      // Notifica pai (ReaderScreen.saveProgress) — pct calculado lá, mas mantemos round*10/10 se necessário
      if (onPageChange && totalPages) onPageChange(clamped, totalPages);
      setTimeout(() => renderingPagesRef.current.delete(clamped), 300);
    },
    [currentPage, totalPages, onPageChange],
  );

  // D4 — tap zonas 25/50/25 (reader-pdf.js handleSingleTap equivalente)
  const handleSingleTap = useCallback(
    (_page: number, x: number, _y: number) => {
      const zone = x / width;
      if (zone < 0.25) {
        goToPage(currentPage - 1);
      } else if (zone > 0.75) {
        goToPage(currentPage + 1);
      } else {
        onCenterTap?.();
      }
    },
    [width, currentPage, goToPage, onCenterTap],
  );

  // ---- Render ----

  if (error) {
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
            maxWidth: 360,
            padding: spacing.lg,
            width: '100%',
          }}
        >
          <Text
            style={{
              color: theme.accent,
              fontFamily: serifFont,
              fontSize: 16,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {error}
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
            {errorDetail ? errorDetail : t('reader.pdfWebUnavailableDescription')}
          </Text>
          <Text
            selectable
            style={{
              color: theme.textMuted,
              fontFamily: serifFont,
              fontSize: 10,
              marginTop: spacing.xs,
              textAlign: 'center',
            }}
          >
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

  // D2/D3 — evita flash de 2 páginas: enquanto !captured, PdfHorizontal renderiza em singlePage=false
  // (scroll contínuo) mas fica oculto atrás de overlay sólido theme.bg. Só quando captured=true
  // e isSinglePageReady=true mostramos paginado. Mantém ÚNICA instância de Pdf para evitar double-load.
  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <PdfHorizontal
        resolvedUri={resolvedUri}
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        scale={scale}
        loading={false}
        isSinglePageReady={isSinglePageReady}
        onLoadComplete={handleLoadComplete}
        onPageChanged={handlePageChanged}
        onLoadProgress={handleLoadProgress}
        onError={handleError}
        onSingleTap={handleSingleTap}
      />
      {(loading || !captured) && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.bg,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            gap: spacing.sm,
          }}
        >
          <ActivityIndicator color={theme.accent} size="large" />
          <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, marginTop: spacing.sm }}>
            Carregando documento...
          </Text>
        </View>
      )}
    </View>
  );
}

function clampPage(page: number, total: number): number {
  const n = Math.round(Number(page) || 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (total >= 1 && n > total) return total;
  return n;
}
