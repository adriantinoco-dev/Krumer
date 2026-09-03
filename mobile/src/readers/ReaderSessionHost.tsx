import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ReaderScreen } from '../screens/ReaderScreen';
import type { Book } from '../models/item';
import type { RootStackParamList } from '../navigation/types';
import { READER_CACHE_LIMIT } from './readerCache';

export const READER_SESSION_CACHE_LIMIT = READER_CACHE_LIMIT;

type ReaderSessionContextValue = {
  activeReaderId: string | null;
  closeReader: (bookId: string) => void;
  sessions: Book[];
  openReader: (book: Book) => void;
};

const ReaderSessionContext = createContext<ReaderSessionContextValue | null>(null);

type ReaderSessionProviderProps = {
  children: React.ReactNode;
};

export function ReaderSessionProvider({ children }: ReaderSessionProviderProps) {
  const [sessions, setSessions] = useState<Book[]>([]);
  const [activeReaderId, setActiveReaderId] = useState<string | null>(null);

  const openReader = useCallback((book: Book) => {
    setSessions((current) => {
      const previous = current.find((session) => session.id === book.id);
      // Keep the mounted component when the file did not change. Its WebView
      // already owns the parsed document and can become visible immediately.
      const session = previous && previous.filePath === book.filePath && previous.format === book.format
        ? { ...previous, title: book.title }
        : book;
      return [session, ...current.filter((item) => item.id !== book.id)]
        .slice(0, READER_SESSION_CACHE_LIMIT);
    });
    setActiveReaderId(book.id);
  }, []);

  const closeReader = useCallback((bookId: string) => {
    setActiveReaderId((current) => current === bookId ? null : current);
  }, []);

  const value = useMemo(
    () => ({ activeReaderId, closeReader, openReader, sessions }),
    [activeReaderId, closeReader, openReader, sessions],
  );

  return <ReaderSessionContext.Provider value={value}>{children}</ReaderSessionContext.Provider>;
}

export function useReaderSessions() {
  const context = useContext(ReaderSessionContext);
  if (!context) throw new Error('useReaderSessions must be used inside ReaderSessionProvider');
  return context;
}

type ManagedReaderNavigation = Pick<NativeStackNavigationProp<RootStackParamList, 'Reader'>, 'addListener' | 'dispatch' | 'goBack'>;

function createManagedNavigation(): ManagedReaderNavigation {
  return {
    addListener: () => () => undefined,
    dispatch: () => undefined,
    goBack: () => undefined,
  } as ManagedReaderNavigation;
}

export function ReaderSessionHost() {
  const { activeReaderId, closeReader, sessions } = useReaderSessions();
  const managedNavigation = useMemo(createManagedNavigation, []);

  return (
    <View
      collapsable={false}
      pointerEvents={activeReaderId ? 'auto' : 'none'}
      style={styles.host}
    >
      {sessions.map((book) => {
        const active = book.id === activeReaderId;
        const route = {
          key: `cached-reader-${book.id}`,
          name: 'Reader' as const,
          params: { book },
        };
        return (
          <View
            accessibilityElementsHidden={!active}
            collapsable={false}
            key={book.id}
            pointerEvents={active ? 'auto' : 'none'}
            style={[styles.session, { elevation: active ? 2 : 0, opacity: active ? 1 : 0.001, zIndex: active ? 2 : 0 }]}
          >
            <ReaderScreen
              active={active}
              navigation={managedNavigation as NativeStackNavigationProp<RootStackParamList, 'Reader'>}
              onRequestClose={() => closeReader(book.id)}
              route={route}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
  },
  session: {
    ...StyleSheet.absoluteFill,
  },
});
