import { useEffect, useState } from 'react';
import { describePdfSource, pdfDevLog, pdfDevWarn } from './pdfDebug';
import { getCachedPdfUri, resolvePdfUri } from './pdfUri';

export type PdfSourceState = {
  error: string | null;
  resolvedUri: string | null;
  resolving: boolean;
};

export function usePdfSource(filePath: string, fileSize?: number): PdfSourceState {
  const [state, setState] = useState<PdfSourceState & { filePath: string }>(() => {
    const resolvedUri = getCachedPdfUri(filePath, fileSize);
    return {
      error: null,
      filePath,
      resolvedUri,
      resolving: !resolvedUri,
    };
  });
  useEffect(() => {
    let cancelled = false;
    const cachedUri = getCachedPdfUri(filePath, fileSize);
    if (cachedUri) {
      pdfDevLog('source:resolve-cache-hit', { source: describePdfSource(cachedUri) });
      setState({ error: null, filePath, resolvedUri: cachedUri, resolving: false });
      return () => {
        cancelled = true;
      };
    }
    pdfDevLog('source:resolve-start', { source: describePdfSource(filePath) });
    setState({ error: null, filePath, resolvedUri: null, resolving: true });

    void resolvePdfUri(filePath, fileSize)
      .then((resolvedUri) => {
        if (cancelled) {
          pdfDevLog('source:resolve-cancelled', { resolved: describePdfSource(resolvedUri) });
          return;
        }
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
  }, [filePath, fileSize]);

  if (state.filePath !== filePath) {
    return { error: null, resolvedUri: null, resolving: true };
  }
  return state;
}
