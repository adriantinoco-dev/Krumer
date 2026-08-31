import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_READER_LAYOUT_SETTINGS,
  parseReaderLayoutSettings,
  type ReaderLayoutSettings,
} from '../models/readerLayoutSettings';

const READER_LAYOUT_SETTINGS_KEY = '@krumer:reader-layout-settings';

let cachedReaderLayoutSettings: ReaderLayoutSettings | null = null;
let pendingReaderLayoutSettings: Promise<ReaderLayoutSettings> | null = null;

export function getCachedReaderLayoutSettings(): ReaderLayoutSettings | null {
  return cachedReaderLayoutSettings;
}

export function loadStoredReaderLayoutSettings(): Promise<ReaderLayoutSettings> {
  if (cachedReaderLayoutSettings) return Promise.resolve(cachedReaderLayoutSettings);
  if (pendingReaderLayoutSettings) return pendingReaderLayoutSettings;

  pendingReaderLayoutSettings = AsyncStorage.getItem(READER_LAYOUT_SETTINGS_KEY)
    .then((raw) => {
      if (!raw) return DEFAULT_READER_LAYOUT_SETTINGS;
      return parseReaderLayoutSettings(JSON.parse(raw)) ?? DEFAULT_READER_LAYOUT_SETTINGS;
    })
    .catch(() => DEFAULT_READER_LAYOUT_SETTINGS)
    .then((settings) => {
      cachedReaderLayoutSettings = settings;
      return settings;
    })
    .finally(() => {
      pendingReaderLayoutSettings = null;
    });
  return pendingReaderLayoutSettings;
}

async function saveStoredReaderLayoutSettings(settings: ReaderLayoutSettings) {
  cachedReaderLayoutSettings = settings;
  await AsyncStorage.setItem(READER_LAYOUT_SETTINGS_KEY, JSON.stringify(settings));
}

export function useReaderLayoutSettings(enabled = true) {
  const cachedSettings = getCachedReaderLayoutSettings();
  const [settings, setSettingsState] = useState<ReaderLayoutSettings>(
    cachedSettings ?? DEFAULT_READER_LAYOUT_SETTINGS,
  );
  const [hydrated, setHydrated] = useState(!enabled || cachedSettings !== null);
  const settingsRef = useRef(settings);
  const writeQueueRef = useRef(Promise.resolve());
  settingsRef.current = settings;

  useEffect(() => {
    if (!enabled) {
      setHydrated(true);
      return;
    }
    const cached = getCachedReaderLayoutSettings();
    if (cached) {
      settingsRef.current = cached;
      setSettingsState(cached);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    setHydrated(false);
    loadStoredReaderLayoutSettings()
      .then((stored) => {
        if (cancelled) return;
        settingsRef.current = stored;
        setSettingsState(stored);
      })
      .catch((error) => console.warn('[Krumer reader layout] falha ao carregar', error))
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  const updateSettings = useCallback((patch: Partial<ReaderLayoutSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    cachedReaderLayoutSettings = next;
    setSettingsState(next);
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => saveStoredReaderLayoutSettings(next))
      .catch((error) => console.warn('[Krumer reader layout] falha ao salvar', error));
  }, []);

  const resetSettings = useCallback(() => {
    updateSettings(DEFAULT_READER_LAYOUT_SETTINGS);
  }, [updateSettings]);

  return { hydrated, resetSettings, settings, updateSettings };
}
