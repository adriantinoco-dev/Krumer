import AsyncStorage from '@react-native-async-storage/async-storage';
import { PDF_DEFAULTS, PDF_PREF_KEYS, type PdfColumn, type PdfMode } from '../PdfReader.types';

/**
 * Persistência de preferências do leitor PDF — paridade com
 * localStorage em reader-pdf.js:34 (krumer_pdf_view_mode) e :36 (krumer_pdf_column).
 *
 * Desktop usa localStorage; mobile usa AsyncStorage. Chaves com prefixo
 * krumer.pdf.* para não colidir com krumer_chapter_view etc.
 */

export type PdfPrefs = {
  mode: PdfMode;
  column: PdfColumn;
  scale: number;
};

export async function loadPdfPrefs(): Promise<PdfPrefs> {
  try {
    const [rawMode, rawColumn, rawZoom] = await Promise.all([
      AsyncStorage.getItem(PDF_PREF_KEYS.viewMode),
      AsyncStorage.getItem(PDF_PREF_KEYS.column),
      AsyncStorage.getItem(PDF_PREF_KEYS.zoom),
    ]);

    const mode: PdfMode = rawMode === 'vertical' ? 'vertical' : PDF_DEFAULTS.mode;
    const column: PdfColumn = rawColumn === 'double' ? 'double' : PDF_DEFAULTS.column;
    const scaleNum = rawZoom ? Number(rawZoom) : PDF_DEFAULTS.scale;
    const scale =
      Number.isFinite(scaleNum) && scaleNum >= PDF_DEFAULTS.minScale && scaleNum <= PDF_DEFAULTS.maxScale
        ? Math.round(scaleNum * 20) / 20 // arredonda para step 0.05
        : PDF_DEFAULTS.scale;

    return { mode, column, scale };
  } catch {
    return { mode: PDF_DEFAULTS.mode, column: PDF_DEFAULTS.column, scale: PDF_DEFAULTS.scale };
  }
}

export async function savePdfMode(mode: PdfMode): Promise<void> {
  try {
    await AsyncStorage.setItem(PDF_PREF_KEYS.viewMode, mode);
  } catch {}
}

export async function savePdfColumn(column: PdfColumn): Promise<void> {
  try {
    await AsyncStorage.setItem(PDF_PREF_KEYS.column, column);
  } catch {}
}

export async function savePdfScale(scale: number): Promise<void> {
  try {
    const clamped = Math.min(PDF_DEFAULTS.maxScale, Math.max(PDF_DEFAULTS.minScale, scale));
    await AsyncStorage.setItem(PDF_PREF_KEYS.zoom, String(clamped));
  } catch {}
}
