import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { runMobileSync, setMobileOffline } from './engine';

export function SyncCoordinator() {
  const { session } = useAuth();
  const {
    books,
    lists,
    ready,
    replaceBooksFromSync,
    replaceListsFromSync,
  } = useApp();
  const latest = useRef({ books, lists });
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = { books, lists };

  const trigger = useCallback(() => {
    if (!ready || !session) return;
    void runMobileSync({
      books: latest.current.books,
      lists: latest.current.lists,
      replaceBooks: replaceBooksFromSync,
      replaceLists: replaceListsFromSync,
    });
  }, [ready, replaceBooksFromSync, replaceListsFromSync, session]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) trigger();
      else setMobileOffline();
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void NetInfo.fetch().then((network) => {
          if (network.isConnected && network.isInternetReachable !== false) trigger();
        });
      }
    });
    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [trigger]);

  useEffect(() => {
    if (!session || !ready) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(trigger, 1500);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [books, lists, ready, session, trigger]);

  return null;
}
