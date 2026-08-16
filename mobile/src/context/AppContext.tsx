import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Book } from '../models/item';
import { extractCoversInBackground } from '../services/libraryScanner';
import { DEFAULT_LANGUAGE, translate, type LanguageCode, type TranslationKey } from '../i18n/translations';
import {
  defaultPreferences,
  loadBooks,
  loadPreferences,
  saveBooks,
  savePreferences,
  type MobilePreferences,
} from '../storage/preferences';
import { themes, type ThemeName } from '../theme';

type AppContextValue = {
  books: Book[];
  preferences: MobilePreferences;
  ready: boolean;
  setBooks: (books: Book[]) => Promise<void>;
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
      const [storedPreferences, storedBooks] = await Promise.all([loadPreferences(), loadBooks()]);
      if (!mounted) return;
      setPreferenceState(storedPreferences);
      setBookState(storedBooks);
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
    const next = booksRef.current.map((book) =>
      book.id === bookId ? { ...book, coverPath } : book
    );
    booksRef.current = next;
    setBookState(next);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveBooks(booksRef.current);
    }, 400);
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
    booksRef.current = nextBooks;
    setBookState(nextBooks);
    await saveBooks(nextBooks);
    runCoversLoop();
  }, [runCoversLoop]);

  const value = useMemo<AppContextValue>(() => {
    const language = preferences.language ?? DEFAULT_LANGUAGE;
    return {
      books,
      preferences,
      ready,
      setBooks,
      updateBookCover,
      setGeminiApiKey: (geminiApiKey) => persistPreferences({ geminiApiKey }),
      setHasOnboarded: (hasOnboarded) => persistPreferences({ hasOnboarded }),
      setLanguage: (language) => persistPreferences({ language }),
      setLibraryFolder: (libraryFolder) => persistPreferences({ libraryFolder }),
      setThemeName: (theme) => persistPreferences({ theme }),
      t: (key) => translate(language, key),
      theme: themes[preferences.theme],
    };
  }, [books, persistPreferences, preferences, ready, setBooks, updateBookCover]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return context;
}
