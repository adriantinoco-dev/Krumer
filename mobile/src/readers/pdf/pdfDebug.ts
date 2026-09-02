type PdfDebugDetails = Record<string, unknown>;

const PDF_DEBUG_TAG = '[Krumer PDF]';

export function pdfDevLog(event: string, details?: PdfDebugDetails): void {
  if (!__DEV__) return;
  if (details) {
    console.info(PDF_DEBUG_TAG, event, details);
  } else {
    console.info(PDF_DEBUG_TAG, event);
  }
}

export function pdfDevWarn(event: string, details?: PdfDebugDetails): void {
  if (!__DEV__) return;
  if (details) {
    console.warn(PDF_DEBUG_TAG, event, details);
  } else {
    console.warn(PDF_DEBUG_TAG, event);
  }
}

/**
 * Emit a machine-readable sample for the PDF engine comparison harness.
 * Metrics stay development-only and deliberately contain no path or document
 * bytes, so a logcat capture is safe to attach to a local benchmark report.
 */
export function pdfDevMetric(event: string, details: PdfDebugDetails = {}): void {
  if (!__DEV__) return;
  console.info(PDF_DEBUG_TAG, 'metric', JSON.stringify({
    at: Date.now(),
    event,
    ...details,
  }));
}

export function describePdfSource(value: string | null): string {
  if (!value) return 'none';
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? 'path';
  const withoutQuery = value.split(/[?#]/, 1)[0];
  const name = withoutQuery.split(/[\\/]/).pop() || 'unknown';
  return `${scheme}:${name}`;
}
