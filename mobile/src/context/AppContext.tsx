import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Book } from '../models/item';
import type { SyncList } from '../models/list';
import { extractCoversInBackground, scanLibrary } from '../services/libraryScanner';
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
import { removeGeminiApiKey, setGeminiApiKey as persistGeminiApiKey } from '../storage/secureCredentials';
import { enqueueBookProgress, enqueueListMembership, enqueueMetadata, enqueueSyncList, enqueueTag } from '../sync/outbox';
import { themes, type ThemeName } from '../theme';

type AppContextValue = {
  books: Book[];
  lists: SyncList[];
  preferences: MobilePreferences;
  ready: boolean;
  isScanning: boolean;
  setBooks: (books: Book[]) => Promise<void>;
  rescanLibrary: () => Promise<void>;
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
  setMetadataIntroSeen: (seen: boolean) => Promise<void>;
  setHasOnboarded: (hasOnboarded: boolean) => Promise<void>;
  setLanguage: (language: LanguageCode) => Promise<void>;
  setLibraryFolder: (libraryFolder: string | null) => Promise<void>;
  setThemeName: (theme: ThemeName) => Promise<void>;
  setBooksPerRow: (count: number) => Promise<void>;
  t: (key: TranslationKey) => string;
  theme: (typeof themes)[ThemeName];
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [books, setBookState] = useState<Book[]>([]);
  const [lists, setLists] = useState<SyncList[]>([]);
  const [preferences, setPreferenceState] = useState<MobilePreferences>(defaultPreferences);
  const [ready, setReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const booksRef = useRef<Book[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coversRunningRef = useRef(false);
  const coversRestartRef = useRef(false);
  const scanRunningRef = useRef(false);
  const startupScanStartedRef = useRef(false);

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

  const setGeminiApiKey = useCallback(async (geminiApiKey: string | null) => {
    if (geminiApiKey?.trim()) {
      await persistGeminiApiKey(geminiApiKey);
    } else {
      await removeGeminiApiKey();
    }
    await persistPreferences({ hasGeminiApiKey: Boolean(geminiApiKey?.trim()) });
  }, [persistPreferences]);

  const setMetadataIntroSeen = useCallback(async (seen: boolean) => {
    await persistPreferences({ metadataIntroSeen: seen });
  }, [persistPreferences]);

  const updateBookCover = useCallback((bookId: string, coverPath: string) => {
    const next = updateBookTreeCover(booksRef.current, bookId, coverPath);
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
    const { nextBooks, updatedBook } = updateBookTree(booksRef.current, bookId, (book) => {
      const coverOriginalPath = update.coverOriginalPath !== undefined
        ? update.coverOriginalPath
        : (book.coverOriginalPath ?? (update.coverPath !== undefined && update.coverPath !== book.coverPath ? book.coverPath : book.coverOriginalPath));

      return {
        ...book,
        ...update,
        coverOriginalPath,
        metadataUpdatedAt: new Date().toISOString(),
      };
    });

    booksRef.current = nextBooks;
    setBookState(nextBooks);
    await saveBooks(nextBooks);

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
        const all = flattenBooks(booksRef.current);
        const pending = all.filter((book) => !book.coverPath && Boolean(book.filePath));
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

  const rescanLibrary = useCallback(async () => {
    const folder = preferences.libraryFolder;
    if (!folder || scanRunningRef.current) return;

    scanRunningRef.current = true;
    setIsScanning(true);
    try {
      // Give the loading indicator a frame before traversing the folder.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const scannedBooks = await scanLibrary(folder);
      await setBooks(scannedBooks);
    } catch {
      // Keep the cached library visible when the folder is unavailable.
    } finally {
      scanRunningRef.current = false;
      setIsScanning(false);
    }
  }, [preferences.libraryFolder, setBooks]);

  useEffect(() => {
    if (!ready || startupScanStartedRef.current) return;
    startupScanStartedRef.current = true;
    if (!preferences.hasOnboarded || !preferences.libraryFolder) return;
    void rescanLibrary();
  }, [preferences.hasOnboarded, preferences.libraryFolder, ready, rescanLibrary]);

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
    const { nextBooks, updatedBook } = updateBookTree(booksRef.current, bookId, (book) => ({
      ...book,
      ...update,
    }));
    booksRef.current = nextBooks;
    setBookState(nextBooks);
    await saveBooks(nextBooks);
    if (updatedBook) await enqueueBookProgress(updatedBook);
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

  const language = preferences.language ?? DEFAULT_LANGUAGE;
  const t = useCallback((key: TranslationKey) => translate(language, key), [language]);

  const value = useMemo<AppContextValue>(() => {
    return {
      books,
      lists,
      preferences,
      ready,
      isScanning,
      setBooks,
      rescanLibrary,
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
      setGeminiApiKey,
      setMetadataIntroSeen,
      setHasOnboarded: (hasOnboarded) => persistPreferences({ hasOnboarded }),
      setLanguage: (language) => persistPreferences({ language }),
      setLibraryFolder: (libraryFolder) => persistPreferences({ libraryFolder }),
      setThemeName: (theme) => persistPreferences({ theme }),
      setBooksPerRow: (booksPerRow) => persistPreferences({ booksPerRow }),
      t,
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
    isScanning,
    renameList,
    replaceBooksFromSync,
    replaceListsFromSync,
    setBooks,
    rescanLibrary,
    toggleBookInList,
    toggleFavorite,
    updateBookCover,
    updateBookMetadata,
    updateBookProgress,
    setGeminiApiKey,
    setMetadataIntroSeen,
    t,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function flattenBooks(books: Book[]): Book[] {
  return books.flatMap((book) => [book, ...flattenBooks(book.children ?? [])]);
}

function mergeScannedBooks(books: Book[], previous: Map<string, Book>): Book[] {
  return books.map((book) => {
    const existing = previous.get(book.fingerprint);
    const mergedChildren = book.children ? mergeScannedBooks(book.children, previous) : book.children;
    const isSeries = Boolean(mergedChildren && mergedChildren.length > 0);

    let progressPct = existing?.progressPct ?? book.progressPct ?? 0;
    let isRead = existing?.isRead ?? book.isRead ?? false;
    let coverPath = existing?.coverPath ?? book.coverPath ?? null;

    if (isSeries && mergedChildren) {
      const totalPct = mergedChildren.reduce(
        (sum, child) => sum + (child.isRead ? 100 : (child.progressPct ?? 0)),
        0
      );
      progressPct = Math.round(totalPct / mergedChildren.length);
      isRead = mergedChildren.every((child) => child.isRead || (child.progressPct ?? 0) >= 100);
      if (!coverPath && mergedChildren[0]?.coverPath) {
        coverPath = mergedChildren[0].coverPath;
      }
    }

    return {
      ...book,
      ...(existing ? {
        addedAt: existing.addedAt,
        title: existing.title,
        author: existing.author,
        year: existing.year,
        description: existing.description,
        tags: existing.tags,
        coverOriginalPath: existing.coverOriginalPath,
        metadataUpdatedAt: existing.metadataUpdatedAt,
        rating: existing.rating,
        progress: existing.progress,
        currentPage: existing.currentPage,
        totalPages: existing.totalPages,
        cfi: existing.cfi,
      } : {}),
      coverPath,
      progressPct,
      isRead,
      childrenCount: isSeries && mergedChildren ? mergedChildren.length : (book.childrenCount ?? null),
      children: mergedChildren,
    };
  });
}

function updateBookTree(
  books: Book[],
  bookId: string,
  updater: (book: Book) => Book,
): { nextBooks: Book[]; updatedBook: Book | null } {
  let updatedBook: Book | null = null;

  function traverse(list: Book[]): Book[] {
    return list.map((book) => {
      if (book.id === bookId) {
        const updated = updater(book);
        updatedBook = updated;
        // If parent series has its isRead updated, cascade to all children
        if (updated.children?.length) {
          const cascadedChildren = updated.children.map((child) => {
            if (updated.isRead !== book.isRead) {
              return {
                ...child,
                isRead: updated.isRead,
                progressPct: updated.isRead ? 100 : (child.progressPct === 100 ? 0 : child.progressPct),
              };
            }
            return child;
          });
          const totalPct = cascadedChildren.reduce(
            (sum, child) => sum + (child.isRead ? 100 : (child.progressPct ?? 0)),
            0
          );
          return {
            ...updated,
            children: cascadedChildren,
            progressPct: Math.round(totalPct / cascadedChildren.length),
          };
        }
        return updated;
      }

      if (book.children?.length) {
        const nextChildren = traverse(book.children);
        if (nextChildren !== book.children) {
          // Recompute parent aggregates from updated children
          const totalPct = nextChildren.reduce(
            (sum, child) => sum + (child.isRead ? 100 : (child.progressPct ?? 0)),
            0
          );
          const aggProgress = Math.round(totalPct / nextChildren.length);
          const allRead = nextChildren.every((child) => child.isRead || (child.progressPct ?? 0) >= 100);
          let parentCover = book.coverPath;
          if (!parentCover && nextChildren[0]?.coverPath) {
            parentCover = nextChildren[0].coverPath;
          }
          return {
            ...book,
            children: nextChildren,
            progressPct: aggProgress,
            isRead: allRead,
            coverPath: parentCover,
          };
        }
      }

      return book;
    });
  }

  const nextBooks = traverse(books);
  return { nextBooks, updatedBook };
}

function updateBookTreeCover(books: Book[], bookId: string, coverPath: string): Book[] {
  return books.map((book) => {
    if (book.id === bookId) {
      return {
        ...book,
        coverPath,
        coverOriginalPath: book.coverOriginalPath ?? coverPath,
      };
    }
    if (book.children?.length) {
      const nextChildren = updateBookTreeCover(book.children, bookId, coverPath);
      const firstChild = nextChildren[0];
      const isFirstChild = firstChild && firstChild.id === bookId;
      const parentHasNoCustomCover = !book.coverPath || book.coverPath === book.coverOriginalPath;
      const shouldSyncParentCover = isFirstChild && parentHasNoCustomCover;

      return {
        ...book,
        children: nextChildren,
        coverPath: shouldSyncParentCover ? coverPath : (book.coverPath || firstChild?.coverPath || null),
        coverOriginalPath: shouldSyncParentCover ? (book.coverOriginalPath ?? coverPath) : book.coverOriginalPath,
      };
    }
    return book;
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
