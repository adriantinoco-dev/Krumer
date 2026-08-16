import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Book } from '../models/item';
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

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      const [storedPreferences, storedBooks] = await Promise.all([loadPreferences(), loadBooks()]);
      if (!mounted) return;
      setPreferenceState(storedPreferences);
      setBookState(storedBooks);
      setReady(true);
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

  const setBooks = useCallback(async (nextBooks: Book[]) => {
    setBookState(nextBooks);
    await saveBooks(nextBooks);
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const language = preferences.language ?? DEFAULT_LANGUAGE;
    return {
      books,
      preferences,
      ready,
      setBooks,
      setGeminiApiKey: (geminiApiKey) => persistPreferences({ geminiApiKey }),
      setHasOnboarded: (hasOnboarded) => persistPreferences({ hasOnboarded }),
      setLanguage: (language) => persistPreferences({ language }),
      setLibraryFolder: (libraryFolder) => persistPreferences({ libraryFolder }),
      setThemeName: (theme) => persistPreferences({ theme }),
      t: (key) => translate(language, key),
      theme: themes[preferences.theme],
    };
  }, [books, persistPreferences, preferences, ready, setBooks]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return context;
}
