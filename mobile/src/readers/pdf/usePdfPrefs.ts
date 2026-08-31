import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReaderOrientation } from '../../models/readingPreferences';
import {
  PDF_DEFAULTS,
  PDF_PREF_KEYS,
  type PdfDisplayMode,
  type PdfPreferences,
} from '../PdfReader.types';
import {
  clampPdfScale,
  parsePdfDisplayMode,
  parsePdfOrientation,
  parseStoredPdfScale,
} from './pdfState';

export type PdfPreferencesStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export async function loadPdfPrefs(
  storage: PdfPreferencesStorage = AsyncStorage,
): Promise<PdfPreferences> {
  try {
    const [rawDisplayMode, rawOrientation, rawZoom] = await Promise.all([
      storage.getItem(PDF_PREF_KEYS.displayMode),
      storage.getItem(PDF_PREF_KEYS.orientation),
      storage.getItem(PDF_PREF_KEYS.zoom),
    ]);
    const displayMode = parsePdfDisplayMode(rawDisplayMode);
    const preferences: PdfPreferences = {
      displayMode,
      orientation: parsePdfOrientation(rawOrientation),
      scale: parseStoredPdfScale(rawZoom),
    };

    // A implementação parcial gravava horizontal/vertical. Normaliza sem bloquear a leitura.
    if (rawDisplayMode === 'horizontal' || rawDisplayMode === 'vertical') {
      void storage.setItem(PDF_PREF_KEYS.displayMode, displayMode).catch(() => undefined);
    }

    return preferences;
  } catch {
    return {
      displayMode: PDF_DEFAULTS.displayMode,
      orientation: PDF_DEFAULTS.orientation,
      scale: PDF_DEFAULTS.scale,
    };
  }
}

export async function savePdfDisplayMode(
  displayMode: PdfDisplayMode,
  storage: PdfPreferencesStorage = AsyncStorage,
): Promise<void> {
  try {
    await storage.setItem(PDF_PREF_KEYS.displayMode, displayMode);
  } catch {}
}

export async function savePdfOrientation(
  orientation: ReaderOrientation,
  storage: PdfPreferencesStorage = AsyncStorage,
): Promise<void> {
  try {
    await storage.setItem(PDF_PREF_KEYS.orientation, orientation);
  } catch {}
}

export async function savePdfScale(
  scale: number,
  storage: PdfPreferencesStorage = AsyncStorage,
): Promise<void> {
  try {
    await storage.setItem(PDF_PREF_KEYS.zoom, String(clampPdfScale(scale)));
  } catch {}
}
