import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Book } from '../models/item';
import type { SyncList } from '../models/list';
import type { LanguageCode } from '../i18n/translations';
import type { ThemeName } from '../theme';
import { migrateLegacyGeminiApiKey, removeLegacyGeminiApiKey } from './secureCredentials';

export type MobilePreferences = {
  hasOnboarded: boolean;
  language: LanguageCode;
  theme: ThemeName;
  libraryFolder: string | null;
  hasGeminiApiKey: boolean;
  metadataIntroSeen: boolean;
  cardViewMode?: '2d' | '3d';
  booksPerRow?: number;
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
  hasGeminiApiKey: false,
  metadataIntroSeen: false,
  cardViewMode: '3d',
  booksPerRow: 3,
};

export async function loadPreferences(): Promise<MobilePreferences> {
  const raw = await AsyncStorage.getItem(KEYS.preferences);
  const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  const hasGeminiApiKey = await migrateLegacyGeminiApiKey(parsed);
  if (!raw) return { ...defaultPreferences, hasGeminiApiKey };
  const hasLegacyKey = Object.prototype.hasOwnProperty.call(parsed, 'geminiApiKey');
  const legacyValue = typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : '';
  const next = {
    ...defaultPreferences,
    ...parsed,
    // SecureStore is the source of truth; the AsyncStorage flag is only a
    // non-sensitive UI hint and must not keep a deleted key looking active.
    hasGeminiApiKey,
    metadataIntroSeen: Boolean(parsed.metadataIntroSeen),
  } as MobilePreferences & { geminiApiKey?: unknown };

  // Legacy keys are removed only after SecureStore confirms the migration.
  if (hasLegacyKey && (hasGeminiApiKey || !legacyValue)) {
    delete next.geminiApiKey;
    await AsyncStorage.setItem(KEYS.preferences, JSON.stringify(next));
    if (hasGeminiApiKey) await removeLegacyGeminiApiKey();
  }
  delete next.geminiApiKey;
  return next;
}

export async function savePreferences(nextPreferences: MobilePreferences) {
  const sanitized = { ...nextPreferences } as MobilePreferences & { geminiApiKey?: unknown };
  delete sanitized.geminiApiKey;
  await AsyncStorage.setItem(KEYS.preferences, JSON.stringify(sanitized));
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

  const normalizedChildren = book.children?.map(normalizeBook);
  const isSeries = Boolean(normalizedChildren && normalizedChildren.length > 0);

  let progressPct = book.progressPct ?? 0;
  let isRead = Boolean(book.isRead);
  let coverPath = book.coverPath ?? null;

  if (isSeries && normalizedChildren) {
    const totalPct = normalizedChildren.reduce(
      (sum, child) => sum + (child.isRead ? 100 : (child.progressPct ?? 0)),
      0
    );
    progressPct = Math.round(totalPct / normalizedChildren.length);
    isRead = normalizedChildren.every((child) => child.isRead || (child.progressPct ?? 0) >= 100);
    if (!coverPath && normalizedChildren[0]?.coverPath) {
      coverPath = normalizedChildren[0].coverPath;
    }
  }

  return {
    ...book,
    fileSize,
    fingerprint: book.fingerprint
      ?? (isSeries ? `series|${seriesName}` : `file|${basename}|${Math.trunc(fileSize)}`),
    progressPct,
    isRead,
    coverPath,
    childrenCount: isSeries && normalizedChildren ? normalizedChildren.length : (book.childrenCount ?? null),
    children: normalizedChildren,
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

