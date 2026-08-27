import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_READER_LAYOUT_SETTINGS,
  parseReaderLayoutSettings,
  type ReaderLayoutSettings,
} from '../models/readerLayoutSettings';

const READER_LAYOUT_SETTINGS_KEY = '@krumer:reader-layout-settings';

export function useReaderLayoutSettings(enabled = true) {
  const [settings, setSettingsState] = useState<ReaderLayoutSettings>(DEFAULT_READER_LAYOUT_SETTINGS);
  const [hydrated, setHydrated] = useState(!enabled);
  const settingsRef = useRef(settings);
  const writeQueueRef = useRef(Promise.resolve());
  settingsRef.current = settings;

  useEffect(() => {
    if (!enabled) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    setHydrated(false);
    AsyncStorage.getItem(READER_LAYOUT_SETTINGS_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const stored = parseReaderLayoutSettings(JSON.parse(raw));
        if (!stored) return;
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
    setSettingsState(next);
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(READER_LAYOUT_SETTINGS_KEY, JSON.stringify(next)))
      .catch((error) => console.warn('[Krumer reader layout] falha ao salvar', error));
  }, []);

  const resetSettings = useCallback(() => {
    updateSettings(DEFAULT_READER_LAYOUT_SETTINGS);
  }, [updateSettings]);

  return { hydrated, resetSettings, settings, updateSettings };
}
