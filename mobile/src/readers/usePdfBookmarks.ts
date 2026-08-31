import { useCallback, useEffect, useState } from 'react';
import { createPdfLocator, type ReaderBookmark } from '../models/reader';
import {
  createReaderBookmark,
  listReaderBookmarks,
  tombstoneReaderBookmark,
} from '../storage/readerDatabase';

type Options = {
  bookId: string;
  enabled: boolean;
};

export function usePdfBookmarks({ bookId, enabled }: Options) {
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);
  const [hydrated, setHydrated] = useState(!enabled);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setBookmarks([]);
      setHydrated(true);
      return () => {
        active = false;
      };
    }

    setBookmarks([]);
    setHydrated(false);
    void listReaderBookmarks(bookId, 'pdf')
      .then((storedBookmarks) => {
        if (active) setBookmarks(storedBookmarks);
      })
      .catch((error) => {
        if (active) console.warn('[Krumer PDF] falha ao carregar marcadores', error);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [bookId, enabled]);

  const addBookmark = useCallback(async (page: number) => {
    if (!enabled) return null;
    const bookmark = await createReaderBookmark(bookId, createPdfLocator(page));
    setBookmarks((current) => [bookmark, ...current]);
    return bookmark;
  }, [bookId, enabled]);

  const removeBookmark = useCallback(async (id: string) => {
    await tombstoneReaderBookmark(id);
    setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id));
  }, []);

  return {
    addBookmark,
    bookmarks,
    hydrated,
    removeBookmark,
  };
}
