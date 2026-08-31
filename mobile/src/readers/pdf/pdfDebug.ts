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

export function describePdfSource(value: string | null): string {
  if (!value) return 'none';
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? 'path';
  const withoutQuery = value.split(/[?#]/, 1)[0];
  const name = withoutQuery.split(/[\\/]/).pop() || 'unknown';
  return `${scheme}:${name}`;
}
