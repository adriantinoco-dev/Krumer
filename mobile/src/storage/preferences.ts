import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Book } from '../models/item';
import type { LanguageCode } from '../i18n/translations';
import type { ThemeName } from '../theme';

export type MobilePreferences = {
  hasOnboarded: boolean;
  language: LanguageCode;
  theme: ThemeName;
  libraryFolder: string | null;
  geminiApiKey: string | null;
};

const KEYS = {
  books: 'krumer.books',
  preferences: 'krumer.preferences',
};

export const defaultPreferences: MobilePreferences = {
  hasOnboarded: false,
  language: 'en',
  theme: 'dark',
  libraryFolder: null,
  geminiApiKey: null,
};

export async function loadPreferences(): Promise<MobilePreferences> {
  const raw = await AsyncStorage.getItem(KEYS.preferences);
  if (!raw) return defaultPreferences;
  return { ...defaultPreferences, ...JSON.parse(raw) };
}

export async function savePreferences(nextPreferences: MobilePreferences) {
  await AsyncStorage.setItem(KEYS.preferences, JSON.stringify(nextPreferences));
}

export async function patchPreferences(nextPreferences: Partial<MobilePreferences>) {
  const current = await loadPreferences();
  const merged = { ...current, ...nextPreferences };
  await savePreferences(merged);
  return merged;
}

export async function loadBooks(): Promise<Book[]> {
  const raw = await AsyncStorage.getItem(KEYS.books);
  return raw ? JSON.parse(raw) : [];
}

export async function saveBooks(books: Book[]) {
  await AsyncStorage.setItem(KEYS.books, JSON.stringify(books));
}

