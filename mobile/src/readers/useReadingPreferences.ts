import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_READING_PREFERENCES,
  parseReadingPreferences,
  type ReadingPreferences,
} from '../models/readingPreferences';

const READING_PREFERENCES_KEY = 'krumer.reading.preferences.v1';

type ReadingPreferencesStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let cachedReadingPreferences: ReadingPreferences | null = null;
let pendingReadingPreferences: Promise<ReadingPreferences> | null = null;

export function getCachedReadingPreferences(): ReadingPreferences | null {
  return cachedReadingPreferences;
}

async function readStoredReadingPreferences(
  storage: ReadingPreferencesStorage,
): Promise<ReadingPreferences> {
  const raw = await storage.getItem(READING_PREFERENCES_KEY);
  if (!raw) return DEFAULT_READING_PREFERENCES;
  try {
    return parseReadingPreferences(JSON.parse(raw)) ?? DEFAULT_READING_PREFERENCES;
  } catch {
    return DEFAULT_READING_PREFERENCES;
  }
}

export function loadStoredReadingPreferences(
  storage?: ReadingPreferencesStorage,
): Promise<ReadingPreferences> {
  if (storage) return readStoredReadingPreferences(storage);
  if (cachedReadingPreferences) return Promise.resolve(cachedReadingPreferences);
  if (pendingReadingPreferences) return pendingReadingPreferences;

  pendingReadingPreferences = readStoredReadingPreferences(AsyncStorage)
    .then((preferences) => {
      cachedReadingPreferences = preferences;
      return preferences;
    })
    .finally(() => {
      pendingReadingPreferences = null;
    });
  return pendingReadingPreferences;
}

export async function saveStoredReadingPreferences(
  preferences: ReadingPreferences,
  storage?: ReadingPreferencesStorage,
) {
  if (!storage) cachedReadingPreferences = preferences;
  await (storage ?? AsyncStorage).setItem(READING_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function useReadingPreferences(enabled = true) {
  const cachedPreferences = getCachedReadingPreferences();
  const [preferences, setPreferencesState] = useState<ReadingPreferences>(
    cachedPreferences ?? DEFAULT_READING_PREFERENCES,
  );
  const [hydrated, setHydrated] = useState(!enabled || cachedPreferences !== null);
  const preferencesRef = useRef(preferences);
  const writeQueueRef = useRef(Promise.resolve());
  preferencesRef.current = preferences;

  useEffect(() => {
    if (!enabled) {
      setHydrated(true);
      return;
    }
    const cached = getCachedReadingPreferences();
    if (cached) {
      preferencesRef.current = cached;
      setPreferencesState(cached);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    setHydrated(false);
    loadStoredReadingPreferences()
      .then((storedPreferences) => {
        if (cancelled) return;
        preferencesRef.current = storedPreferences;
        setPreferencesState(storedPreferences);
      })
      .catch((error) => console.warn('[Krumer reading preferences] falha ao carregar', error))
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const persist = useCallback((next: ReadingPreferences) => {
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => saveStoredReadingPreferences(next))
      .catch((error) => console.warn('[Krumer reading preferences] falha ao salvar', error));
  }, []);

  const updatePreferences = useCallback((patch: Partial<ReadingPreferences>) => {
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    setPreferencesState(next);
    persist(next);
  }, [persist]);

  const resetPreferences = useCallback(() => {
    preferencesRef.current = DEFAULT_READING_PREFERENCES;
    setPreferencesState(DEFAULT_READING_PREFERENCES);
    persist(DEFAULT_READING_PREFERENCES);
  }, [persist]);

  return { hydrated, preferences, resetPreferences, updatePreferences };
}
