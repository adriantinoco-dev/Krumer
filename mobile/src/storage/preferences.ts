import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Book } from '../models/item';
import type { SyncList } from '../models/list';
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
  syncLists: 'krumer.sync.lists',
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
  const stored: Book[] = raw ? JSON.parse(raw) : [];
  return stored.map(normalizeBook);
}

export async function saveBooks(books: Book[]) {
  await AsyncStorage.setItem(KEYS.books, JSON.stringify(books));
}

function normalizeBook(book: Book): Book {
  let fileSize = Number(book.fileSize || 0);
  if (!fileSize && !book.children?.length && Platform.OS !== 'web') {
    try {
      // Import lazy para não quebrar web bundle (expo-file-system sem File na web).
      const { File } = require('expo-file-system');
      fileSize = new File(book.filePath).size || 0;
    } catch { /* URI indisponível */ }
  }
  const decodedPath = safeDecode(book.filePath);
  const fileName = decodedPath.split('/').pop() ?? book.title;
  const basename = fileName.replace(/\.(epub|pdf)$/i, '');
  const seriesName = book.children?.length
    ? (safeDecode(book.children[0].filePath).split('/').slice(-2)[0] || book.title)
    : book.title;
  return {
    ...book,
    fileSize,
    fingerprint: book.fingerprint
      ?? (book.children?.length ? `series|${seriesName}` : `file|${basename}|${Math.trunc(fileSize)}`),
    progressPct: book.progressPct ?? 0,
    children: book.children?.map(normalizeBook),
  };
}

function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export async function loadSyncLists(): Promise<SyncList[]> {
  const raw = await AsyncStorage.getItem(KEYS.syncLists);
  return raw ? JSON.parse(raw) : [];
}

export async function saveSyncLists(lists: SyncList[]) {
  await AsyncStorage.setItem(KEYS.syncLists, JSON.stringify(lists));
}

