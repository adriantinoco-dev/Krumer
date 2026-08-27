import { useCallback, useEffect, useState } from 'react';
import type { ReaderLocator, ReaderNote } from '../models/reader';
import {
  createReaderNote,
  listReaderNotes,
  tombstoneReaderNote,
  updateReaderNote,
} from '../storage/readerDatabase';

export function useEpubNotes(bookId: string | null, format: 'epub' | 'pdf') {
  const [notes, setNotes] = useState<ReaderNote[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const list = await listReaderNotes(bookId, format);
      setNotes(list);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [bookId, format]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addNote = useCallback(async (locator: ReaderLocator, content: string, pageNumber: number) => {
    if (!bookId) return null;
    const note = await createReaderNote(bookId, locator, content, pageNumber);
    await refresh();
    return note;
  }, [bookId, refresh]);

  const editNote = useCallback(async (id: string, content: string) => {
    await updateReaderNote(id, content);
    await refresh();
  }, [refresh]);

  const removeNote = useCallback(async (id: string) => {
    await tombstoneReaderNote(id);
    await refresh();
  }, [refresh]);

  return { addNote, editNote, loading, notes, refresh, removeNote };
}
