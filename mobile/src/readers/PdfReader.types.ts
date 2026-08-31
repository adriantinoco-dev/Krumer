import type { DisplayMode, ReaderOrientation } from '../models/readingPreferences';

/** Contratos estáveis do leitor PDF. A engine nativa fica isolada atrás destes tipos. */

export type PdfDisplayMode = DisplayMode;

export type PdfPageSize = { width: number; height: number };

export type PdfPreferences = {
  displayMode: PdfDisplayMode;
  orientation: ReaderOrientation;
  scale: number;
};

export const PDF_DEFAULTS = {
  displayMode: 'paginated' as PdfDisplayMode,
  orientation: 'portrait' as ReaderOrientation,
  scale: 1.0,
  minScale: 0.5,
  maxScale: 2.0,
  scaleStep: 0.05,
} as const;

// Chaves mantidas estáveis para migrar as preferências já gravadas pelo leitor parcial.
export const PDF_PREF_KEYS = {
  displayMode: 'krumer.pdf.view_mode',
  orientation: 'krumer.pdf.orientation',
  zoom: 'krumer.pdf.zoom',
} as const;

export type PdfReaderProps = {
  displayMode?: PdfDisplayMode;
  filePath: string;
  fileSize?: number;
  initialPage?: number;
  interactionEnabled?: boolean;
  onCenterTap?: () => void;
  onExternalLink?: (url: string) => void;
  onPageChange?: (page: number, total: number) => void;
};

export type PdfReaderHandle = {
  goToPage: (page: number) => void;
};
