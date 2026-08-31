import AsyncStorage from '@react-native-async-storage/async-storage';

const READER_SETTINGS_KEY = 'krumer.reader.settings';

export type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.5,
};

let cachedReaderSettings: ReaderSettings | null = null;
let pendingReaderSettings: Promise<ReaderSettings> | null = null;

export function getCachedReaderSettings(): ReaderSettings | null {
  return cachedReaderSettings;
}

export function loadStoredReaderSettings(): Promise<ReaderSettings> {
  if (cachedReaderSettings) return Promise.resolve(cachedReaderSettings);
  if (pendingReaderSettings) return pendingReaderSettings;

  pendingReaderSettings = AsyncStorage.getItem(READER_SETTINGS_KEY)
    .then((raw) => {
      if (!raw) return DEFAULT_READER_SETTINGS;
      const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
      return {
        fontSize: Number.isFinite(parsed.fontSize) ? Number(parsed.fontSize) : DEFAULT_READER_SETTINGS.fontSize,
        lineHeight: Number.isFinite(parsed.lineHeight) ? Number(parsed.lineHeight) : DEFAULT_READER_SETTINGS.lineHeight,
      };
    })
    .catch(() => DEFAULT_READER_SETTINGS)
    .then((settings) => {
      cachedReaderSettings = settings;
      return settings;
    })
    .finally(() => {
      pendingReaderSettings = null;
    });
  return pendingReaderSettings;
}

export async function saveStoredReaderSettings(settings: ReaderSettings): Promise<void> {
  cachedReaderSettings = settings;
  await AsyncStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
}
