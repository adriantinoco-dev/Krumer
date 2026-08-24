/**
 * Tipos compartilhados do leitor PDF — paridade com frontend/js/reader-pdf.js:9
 * D1 (openPdf) e D4 (modo horizontal) são a base; vertical/zoom/colunas vêm em fases seguintes.
 */

export type PdfMode = 'horizontal' | 'vertical';
export type PdfColumn = 'single' | 'double';

export type PdfPageSize = { width: number; height: number };

export type PdfState = {
  mode: PdfMode;
  column: PdfColumn;
  scale: number; // 0.5 .. 2.0 — D9 (zoom). Para D1-D4 fica em 1.0 fixo, mas já tipado.
  currentPage: number;
  totalPages: number;
  pageSize: PdfPageSize | null; // de onLoadComplete — equivale a baseAspectWidth/Height em reader-pdf.js:17
  loading: boolean;
  resolving: boolean;
  error: string | null;
  errorDetail: string | null;
  resolvedUri: string | null;
};

export const PDF_DEFAULTS = {
  mode: 'horizontal' as PdfMode, // mobile default difere do desktop (horizontal é mais ergonômico) — ver planejamento §4.2
  column: 'single' as PdfColumn,
  scale: 1.0,
  minScale: 0.5,
  maxScale: 2.0,
} as const;

// Keys AsyncStorage — espelham localStorage do desktop (reader-pdf.js:34)
export const PDF_PREF_KEYS = {
  viewMode: 'krumer.pdf.view_mode',
  column: 'krumer.pdf.column',
  zoom: 'krumer.pdf.zoom',
} as const;

export type PdfReaderProps = {
  filePath: string;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
  onCenterTap?: () => void;
};
