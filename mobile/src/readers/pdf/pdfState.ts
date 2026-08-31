import type { ReaderOrientation } from '../../models/readingPreferences';
import { PDF_DEFAULTS, type PdfDisplayMode } from '../PdfReader.types';

export function clampPdfPage(page: number, total: number): number {
  const normalized = Math.round(Number(page) || 1);
  if (!Number.isFinite(normalized) || normalized < 1) return 1;
  if (total >= 1 && normalized > total) return total;
  return normalized;
}

export function clampPdfScale(value: number): number {
  if (!Number.isFinite(value)) return PDF_DEFAULTS.scale;
  const clamped = Math.min(PDF_DEFAULTS.maxScale, Math.max(PDF_DEFAULTS.minScale, value));
  const snapped = Math.round(clamped / PDF_DEFAULTS.scaleStep) * PDF_DEFAULTS.scaleStep;
  return Math.round(snapped * 100) / 100;
}

export function parseStoredPdfScale(value: string | null): number {
  if (value === null || value.trim() === '') return PDF_DEFAULTS.scale;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < PDF_DEFAULTS.minScale || parsed > PDF_DEFAULTS.maxScale) {
    return PDF_DEFAULTS.scale;
  }
  return clampPdfScale(parsed);
}

export function parsePdfDisplayMode(value: string | null): PdfDisplayMode {
  if (value === 'scroll' || value === 'vertical') return 'scroll';
  if (value === 'paginated' || value === 'horizontal') return 'paginated';
  return PDF_DEFAULTS.displayMode;
}

export function parsePdfOrientation(value: string | null): ReaderOrientation {
  if (value === 'free' || value === 'landscape' || value === 'portrait') return value;
  return PDF_DEFAULTS.orientation;
}
