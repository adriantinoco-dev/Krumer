import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PDF_ENGINE,
  type PdfEngineKind,
} from '../PdfReader.types';

export const PDF_ENGINE_PREFERENCE_KEY = 'krumer.pdf.engine.v1';

type PdfEnginePreferenceStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let cachedPdfEngine: PdfEngineKind | null = null;
let pendingPdfEngine: Promise<PdfEngineKind> | null = null;

export function parsePdfEngine(value: unknown): PdfEngineKind | null {
  return value === 'native' || value === 'webview' ? value : null;
}

export function getCachedPdfEngine(): PdfEngineKind | null {
  return cachedPdfEngine;
}

async function readStoredPdfEngine(
  storage: PdfEnginePreferenceStorage,
): Promise<PdfEngineKind> {
  const raw = await storage.getItem(PDF_ENGINE_PREFERENCE_KEY);
  if (!raw) return DEFAULT_PDF_ENGINE;
  try {
    return parsePdfEngine(JSON.parse(raw)) ?? parsePdfEngine(raw) ?? DEFAULT_PDF_ENGINE;
  } catch {
    return parsePdfEngine(raw) ?? DEFAULT_PDF_ENGINE;
  }
}

export function loadPdfEnginePreference(
  storage?: PdfEnginePreferenceStorage,
): Promise<PdfEngineKind> {
  if (storage) return readStoredPdfEngine(storage);
  if (cachedPdfEngine) return Promise.resolve(cachedPdfEngine);
  if (pendingPdfEngine) return pendingPdfEngine;

  pendingPdfEngine = readStoredPdfEngine(AsyncStorage)
    .then((engine) => {
      cachedPdfEngine = engine;
      return engine;
    })
    .finally(() => {
      pendingPdfEngine = null;
    });
  return pendingPdfEngine;
}

export async function savePdfEnginePreference(
  engine: PdfEngineKind,
  storage?: PdfEnginePreferenceStorage,
): Promise<void> {
  if (!storage) cachedPdfEngine = engine;
  await (storage ?? AsyncStorage).setItem(PDF_ENGINE_PREFERENCE_KEY, JSON.stringify(engine));
}

export function usePdfEnginePreference(enabled = true) {
  const cached = getCachedPdfEngine();
  const [engine, setEngineState] = useState<PdfEngineKind>(cached ?? DEFAULT_PDF_ENGINE);
  const [hydrated, setHydrated] = useState(!enabled || cached !== null);
  const engineRef = useRef(engine);
  const writeQueueRef = useRef(Promise.resolve());
  engineRef.current = engine;

  useEffect(() => {
    if (!enabled) {
      setHydrated(true);
      return;
    }
    const current = getCachedPdfEngine();
    if (current) {
      engineRef.current = current;
      setEngineState(current);
      setHydrated(true);
      return;
    }

    let cancelled = false;
    setHydrated(false);
    loadPdfEnginePreference()
      .then((stored) => {
        if (cancelled) return;
        engineRef.current = stored;
        setEngineState(stored);
      })
      .catch((error) => console.warn('[Krumer PDF engine] falha ao carregar', error))
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const persist = useCallback((next: PdfEngineKind) => {
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => savePdfEnginePreference(next))
      .catch((error) => console.warn('[Krumer PDF engine] falha ao salvar', error));
  }, []);

  const updateEngine = useCallback((next: PdfEngineKind) => {
    engineRef.current = next;
    setEngineState(next);
    persist(next);
  }, [persist]);

  const resetEngine = useCallback(() => {
    engineRef.current = DEFAULT_PDF_ENGINE;
    setEngineState(DEFAULT_PDF_ENGINE);
    persist(DEFAULT_PDF_ENGINE);
  }, [persist]);

  return { engine, hydrated, resetEngine, updateEngine };
}
