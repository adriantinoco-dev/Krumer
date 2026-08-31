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

let cachedPdfPreferences: PdfPreferences | null = null;
let pendingPdfPreferences: Promise<PdfPreferences> | null = null;

export function getCachedPdfPrefs(): PdfPreferences | null {
  return cachedPdfPreferences;
}

async function readPdfPrefs(storage: PdfPreferencesStorage): Promise<PdfPreferences> {
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

export function loadPdfPrefs(
  storage?: PdfPreferencesStorage,
): Promise<PdfPreferences> {
  if (storage) return readPdfPrefs(storage);
  if (cachedPdfPreferences) return Promise.resolve(cachedPdfPreferences);
  if (pendingPdfPreferences) return pendingPdfPreferences;

  pendingPdfPreferences = readPdfPrefs(AsyncStorage)
    .then((preferences) => {
      cachedPdfPreferences = preferences;
      return preferences;
    })
    .finally(() => {
      pendingPdfPreferences = null;
    });
  return pendingPdfPreferences;
}

function updateCachedPdfPreferences(patch: Partial<PdfPreferences>) {
  if (!cachedPdfPreferences) return;
  cachedPdfPreferences = { ...cachedPdfPreferences, ...patch };
}

export async function savePdfDisplayMode(
  displayMode: PdfDisplayMode,
  storage?: PdfPreferencesStorage,
): Promise<void> {
  try {
    if (!storage) updateCachedPdfPreferences({ displayMode });
    await (storage ?? AsyncStorage).setItem(PDF_PREF_KEYS.displayMode, displayMode);
  } catch {}
}

export async function savePdfOrientation(
  orientation: ReaderOrientation,
  storage?: PdfPreferencesStorage,
): Promise<void> {
  try {
    if (!storage) updateCachedPdfPreferences({ orientation });
    await (storage ?? AsyncStorage).setItem(PDF_PREF_KEYS.orientation, orientation);
  } catch {}
}

export async function savePdfScale(
  scale: number,
  storage?: PdfPreferencesStorage,
): Promise<void> {
  try {
    const normalizedScale = clampPdfScale(scale);
    if (!storage) updateCachedPdfPreferences({ scale: normalizedScale });
    await (storage ?? AsyncStorage).setItem(PDF_PREF_KEYS.zoom, String(normalizedScale));
  } catch {}
}
