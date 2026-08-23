import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Book } from '../models/item';
import type { SyncList } from '../models/list';
import { extractCoversInBackground } from '../services/libraryScanner';
import { DEFAULT_LANGUAGE, translate, type LanguageCode, type TranslationKey } from '../i18n/translations';
import {
  defaultPreferences,
  loadBooks,
  loadPreferences,
  loadSyncLists,
  saveBooks,
  savePreferences,
  saveSyncLists,
  type MobilePreferences,
} from '../storage/preferences';
import { enqueueBookProgress, enqueueListMembership, enqueueMetadata, enqueueSyncList, enqueueTag } from '../sync/outbox';
import { themes, type ThemeName } from '../theme';

type AppContextValue = {
  books: Book[];
  lists: SyncList[];
  preferences: MobilePreferences;
  ready: boolean;
  setBooks: (books: Book[]) => Promise<void>;
  replaceBooksFromSync: (books: Book[]) => Promise<void>;
  replaceListsFromSync: (lists: SyncList[]) => Promise<void>;
  updateBookProgress: (
    bookId: string,
    update: Partial<Pick<Book, 'progress' | 'progressPct' | 'currentPage' | 'totalPages' | 'cfi' | 'isRead'>>,
  ) => Promise<void>;
  updateBookMetadata: (
    bookId: string,
    update: Partial<Pick<Book, 'title' | 'author' | 'year' | 'description' | 'rating' | 'tags' | 'coverPath' | 'coverOriginalPath' | 'isRead' | 'totalPages'>>,
  ) => Promise<void>;
  toggleFavorite: (book: Book) => Promise<void>;
  createList: (name: string) => Promise<void>;
  renameList: (listId: string, newName: string) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  toggleBookInList: (listId: string, bookFingerprint: string) => Promise<void>;
  updateBookCover: (bookId: string, coverPath: string) => void;
  setGeminiApiKey: (geminiApiKey: string | null) => Promise<void>;
  setHasOnboarded: (hasOnboarded: boolean) => Promise<void>;
  setLanguage: (language: LanguageCode) => Promise<void>;
  setLibraryFolder: (libraryFolder: string | null) => Promise<void>;
  setThemeName: (theme: ThemeName) => Promise<void>;
  t: (key: TranslationKey) => string;
  theme: (typeof themes)[ThemeName];
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [books, setBookState] = useState<Book[]>([]);
  const [lists, setLists] = useState<SyncList[]>([]);
  const [preferences, setPreferenceState] = useState<MobilePreferences>(defaultPreferences);
  const [ready, setReady] = useState(false);
  const booksRef = useRef<Book[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coversRunningRef = useRef(false);
  const coversRestartRef = useRef(false);

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      const [storedPreferences, storedBooks, storedLists] = await Promise.all([
        loadPreferences(),
        loadBooks(),
        loadSyncLists(),
      ]);
      if (!mounted) return;
      setPreferenceState(storedPreferences);
      setBookState(storedBooks);
      setLists(storedLists);
      booksRef.current = storedBooks;
      setReady(true);
      if (storedBooks.some((book) => !book.coverPath)) {
        runCoversLoop();
      }
    }

    hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  const persistPreferences = useCallback(async (next: Partial<MobilePreferences>) => {
    const merged = { ...preferences, ...next };
    setPreferenceState(merged);
    await savePreferences(merged);
  }, [preferences]);

  const updateBookCover = useCallback((bookId: string, coverPath: string) => {
    const next = updateBookTree(booksRef.current, bookId, (book) => ({
      ...book,
      coverPath,
      coverOriginalPath: book.coverOriginalPath ?? coverPath,
    }));
    booksRef.current = next;
    setBookState(next);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveBooks(booksRef.current);
    }, 400);
  }, []);

  const updateBookMetadata = useCallback(async (
    bookId: string,
    update: Partial<Pick<Book, 'title' | 'author' | 'year' | 'description' | 'rating' | 'tags' | 'coverPath' | 'coverOriginalPath' | 'isRead'>>,
  ) => {
    let updatedBook: Book | null = null;
    const next = updateBookTree(booksRef.current, bookId, (book) => {
      const coverOriginalPath = update.coverOriginalPath !== undefined
        ? update.coverOriginalPath
        : (book.coverOriginalPath ?? (update.coverPath !== undefined && update.coverPath !== book.coverPath ? book.coverPath : book.coverOriginalPath));

      updatedBook = {
        ...book,
        ...update,
        coverOriginalPath,
        metadataUpdatedAt: new Date().toISOString(),
      };
      return updatedBook;
    });
    booksRef.current = next;
    setBookState(next);
    await saveBooks(next);

    if (updatedBook) {
      await enqueueMetadata(updatedBook);
      if (update.rating !== undefined) {
        await enqueueBookProgress(updatedBook, true);
      }
      if (update.tags !== undefined) {
        for (const tag of update.tags) {
          await enqueueTag(updatedBook, tag);
        }
      }
    }
  }, []);

  const runCoversLoop = useCallback(async () => {
    if (coversRunningRef.current) {
      coversRestartRef.current = true;
      return;
    }
    coversRunningRef.current = true;
    try {
      do {
        coversRestartRef.current = false;
        const pending = booksRef.current.filter((book) => !book.coverPath);
        if (!pending.length) break;
        await extractCoversInBackground(pending, (bookId, coverPath) => {
          updateBookCover(bookId, coverPath);
        });
      } while (coversRestartRef.current);
    } finally {
      coversRunningRef.current = false;
    }
  }, [updateBookCover]);

  const setBooks = useCallback(async (nextBooks: Book[]) => {
    const previous = new Map(flattenBooks(booksRef.current).map((book) => [book.fingerprint, book]));
    const merged = mergeScannedBooks(nextBooks, previous);
    booksRef.current = merged;
    setBookState(merged);
    await saveBooks(merged);
    runCoversLoop();
  }, [runCoversLoop]);

  const replaceBooksFromSync = useCallback(async (nextBooks: Book[]) => {
    booksRef.current = nextBooks;
    setBookState(nextBooks);
    await saveBooks(nextBooks);
  }, []);

  const replaceListsFromSync = useCallback(async (nextLists: SyncList[]) => {
    setLists(nextLists);
    await saveSyncLists(nextLists);
  }, []);

  const updateBookProgress = useCallback(async (
    bookId: string,
    update: Partial<Pick<Book, 'progress' | 'progressPct' | 'currentPage' | 'totalPages' | 'cfi' | 'isRead'>>,
  ) => {
    let changed: Book | null = null;
    const next = updateBookTree(booksRef.current, bookId, (book) => {
      changed = { ...book, ...update };
      return changed;
    });
    booksRef.current = next;
    setBookState(next);
    await saveBooks(next);
    if (changed) await enqueueBookProgress(changed);
  }, []);

  const toggleFavorite = useCallback(async (book: Book) => {
    let favorite = lists.find((list) => list.isDefault || list.name === 'Favoritos');
    let nextLists = [...lists];
    if (!favorite) {
      favorite = {
        id: createUuid(),
        name: 'Favoritos',
        isDefault: true,
        sortOrder: -1,
        createdAt: new Date().toISOString(),
        bookFingerprints: [],
      };
      nextLists.push(favorite);
      await enqueueSyncList(favorite);
    }
    const contains = favorite.bookFingerprints.includes(book.fingerprint);
    const updated = {
      ...favorite,
      bookFingerprints: contains
        ? favorite.bookFingerprints.filter((value) => value !== book.fingerprint)
        : [...favorite.bookFingerprints, book.fingerprint],
    };
    nextLists = nextLists.map((list) => list.id === updated.id ? updated : list);
    setLists(nextLists);
    await saveSyncLists(nextLists);
    await enqueueListMembership(updated, book.fingerprint, contains ? 'delete' : 'upsert');
  }, [lists]);

  const createList = useCallback(async (name: string) => {
    const normalized = name.trim();
    if (!normalized || lists.some((list) => list.name.toLowerCase() === normalized.toLowerCase())) return;
    const next: SyncList = {
      id: createUuid(),
      name: normalized,
      isDefault: false,
      sortOrder: lists.length,
      createdAt: new Date().toISOString(),
      bookFingerprints: [],
    };
    const nextLists = [...lists, next];
    setLists(nextLists);
    await saveSyncLists(nextLists);
    await enqueueSyncList(next);
  }, [lists]);

  const renameList = useCallback(async (listId: string, newName: string) => {
    const normalized = newName.trim();
    if (!normalized) return;
    const target = lists.find((l) => l.id === listId);
    if (!target || target.isDefault) return;
    if (lists.some((l) => l.id !== listId && l.name.toLowerCase() === normalized.toLowerCase())) return;

    const updated: SyncList = { ...target, name: normalized };
    const nextLists = lists.map((l) => (l.id === listId ? updated : l));
    setLists(nextLists);
    await saveSyncLists(nextLists);
    await enqueueSyncList(updated, 'upsert');
  }, [lists]);

  const deleteList = useCallback(async (listId: string) => {
    const target = lists.find((l) => l.id === listId);
    if (!target || target.isDefault) return;

    const nextLists = lists.filter((l) => l.id !== listId);
    setLists(nextLists);
    await saveSyncLists(nextLists);
    await enqueueSyncList(target, 'delete');
  }, [lists]);

  const toggleBookInList = useCallback(async (listId: string, bookFingerprint: string) => {
    let target = lists.find((l) => l.id === listId);
    let nextLists = [...lists];

    if (!target && listId === 'favorites') {
      target = lists.find((l) => l.isDefault || l.name === 'Favoritos');
      if (!target) {
        target = {
          id: createUuid(),
          name: 'Favoritos',
          isDefault: true,
          sortOrder: -1,
          createdAt: new Date().toISOString(),
          bookFingerprints: [],
        };
        nextLists.push(target);
        await enqueueSyncList(target, 'upsert');
      }
    }

    if (!target) return;

    const contains = target.bookFingerprints.includes(bookFingerprint);
    const updated: SyncList = {
      ...target,
      bookFingerprints: contains
        ? target.bookFingerprints.filter((fp) => fp !== bookFingerprint)
        : [...target.bookFingerprints, bookFingerprint],
    };

    nextLists = nextLists.map((l) => (l.id === updated.id ? updated : l));
    setLists(nextLists);
    await saveSyncLists(nextLists);
    await enqueueListMembership(updated, bookFingerprint, contains ? 'delete' : 'upsert');
  }, [lists]);

  const value = useMemo<AppContextValue>(() => {
    const language = preferences.language ?? DEFAULT_LANGUAGE;
    return {
      books,
      lists,
      preferences,
      ready,
      setBooks,
      replaceBooksFromSync,
      replaceListsFromSync,
      updateBookProgress,
      updateBookMetadata,
      toggleFavorite,
      createList,
      renameList,
      deleteList,
      toggleBookInList,
      updateBookCover,
      setGeminiApiKey: (geminiApiKey) => persistPreferences({ geminiApiKey }),
      setHasOnboarded: (hasOnboarded) => persistPreferences({ hasOnboarded }),
      setLanguage: (language) => persistPreferences({ language }),
      setLibraryFolder: (libraryFolder) => persistPreferences({ libraryFolder }),
      setThemeName: (theme) => persistPreferences({ theme }),
      t: (key) => translate(language, key),
      theme: themes[preferences.theme],
    };
  }, [
    books,
    createList,
    deleteList,
    lists,
    persistPreferences,
    preferences,
    ready,
    renameList,
    replaceBooksFromSync,
    replaceListsFromSync,
    setBooks,
    toggleBookInList,
    toggleFavorite,
    updateBookCover,
    updateBookMetadata,
    updateBookProgress,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function flattenBooks(books: Book[]): Book[] {
  return books.flatMap((book) => [book, ...flattenBooks(book.children ?? [])]);
}

function mergeScannedBooks(books: Book[], previous: Map<string, Book>): Book[] {
  return books.map((book) => {
    const existing = previous.get(book.fingerprint);
    return {
      ...book,
      ...(existing ? {
        title: existing.title,
        author: existing.author,
        year: existing.year,
        description: existing.description,
        tags: existing.tags,
        coverPath: existing.coverPath,
        coverOriginalPath: existing.coverOriginalPath,
        rating: existing.rating,
        progress: existing.progress,
        progressPct: existing.progressPct,
        currentPage: existing.currentPage,
        totalPages: existing.totalPages,
        cfi: existing.cfi,
        isRead: existing.isRead,
      } : {}),
      children: book.children ? mergeScannedBooks(book.children, previous) : book.children,
    };
  });
}

function updateBookTree(
  books: Book[],
  bookId: string,
  updater: (book: Book) => Book,
): Book[] {
  return books.map((book) => {
    if (book.id === bookId) return updater(book);
    return book.children ? { ...book, children: updateBookTree(book.children, bookId, updater) } : book;
  });
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return context;
}
