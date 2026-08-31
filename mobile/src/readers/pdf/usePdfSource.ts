import { useEffect, useRef, useState } from 'react';
import { describePdfSource, pdfDevLog, pdfDevWarn } from './pdfDebug';
import { cleanupCachedPdfUri, resolvePdfUri } from './pdfUri';

type ActivePdfSource = {
  originalFilePath: string;
  resolvedUri: string;
};

export type PdfSourceState = {
  error: string | null;
  resolvedUri: string | null;
  resolving: boolean;
};

export function usePdfSource(filePath: string): PdfSourceState {
  const [state, setState] = useState<PdfSourceState & { filePath: string }>({
    error: null,
    filePath,
    resolvedUri: null,
    resolving: true,
  });
  const activeSourceRef = useRef<ActivePdfSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    const previous = activeSourceRef.current;
    activeSourceRef.current = null;
    if (previous) {
      pdfDevLog('source:cleanup-previous', {
        original: describePdfSource(previous.originalFilePath),
        resolved: describePdfSource(previous.resolvedUri),
      });
      void cleanupCachedPdfUri(previous.resolvedUri, previous.originalFilePath);
    }
    pdfDevLog('source:resolve-start', { source: describePdfSource(filePath) });
    setState({ error: null, filePath, resolvedUri: null, resolving: true });

    void resolvePdfUri(filePath)
      .then((resolvedUri) => {
        if (cancelled) {
          pdfDevLog('source:resolve-cancelled', { resolved: describePdfSource(resolvedUri) });
          void cleanupCachedPdfUri(resolvedUri, filePath);
          return;
        }
        activeSourceRef.current = { originalFilePath: filePath, resolvedUri };
        pdfDevLog('source:resolve-success', {
          original: describePdfSource(filePath),
          resolved: describePdfSource(resolvedUri),
        });
        setState({ error: null, filePath, resolvedUri, resolving: false });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const error = caught instanceof Error ? caught.message : String(caught);
        pdfDevWarn('source:resolve-error', { error, source: describePdfSource(filePath) });
        setState({ error, filePath, resolvedUri: null, resolving: false });
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  useEffect(() => () => {
    const active = activeSourceRef.current;
    activeSourceRef.current = null;
    if (active) {
      pdfDevLog('source:cleanup-unmount', {
        original: describePdfSource(active.originalFilePath),
        resolved: describePdfSource(active.resolvedUri),
      });
      void cleanupCachedPdfUri(active.resolvedUri, active.originalFilePath);
    }
  }, []);

  if (state.filePath !== filePath) {
    return { error: null, resolvedUri: null, resolving: true };
  }
  return state;
}
