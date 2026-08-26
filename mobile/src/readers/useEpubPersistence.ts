import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  locatorFingerprint,
  type EpubLocator,
  type ReaderBookmark,
} from '../models/reader';
import {
  createReaderBookmark,
  listReaderBookmarks,
  loadReaderProgress,
  saveReaderProgress,
  tombstoneReaderBookmark,
} from '../storage/readerDatabase';

const PROGRESS_DEBOUNCE_MS = 1000;

type Options = {
  bookId: string;
  enabled: boolean;
  legacyCfi?: string | null;
  onDurableProgress?: (locator: EpubLocator) => Promise<void> | void;
};

let relocationEvents = 0;

export function getEpubPersistenceMetrics() {
  return { relocationEvents };
}

export function useEpubPersistence({ bookId, enabled, legacyCfi, onDurableProgress }: Options) {
  const [hydrated, setHydrated] = useState(!enabled);
  const [initialLocator, setInitialLocator] = useState<EpubLocator | null>(null);
  const [currentLocator, setCurrentLocator] = useState<EpubLocator | null>(null);
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);
  const latestLocatorRef = useRef<EpubLocator | null>(null);
  const lastQueuedFingerprintRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const durableCallbackRef = useRef(onDurableProgress);

  useEffect(() => {
    durableCallbackRef.current = onDurableProgress;
  }, [onDurableProgress]);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setHydrated(true);
      setInitialLocator(null);
      setCurrentLocator(null);
      setBookmarks([]);
      latestLocatorRef.current = null;
      return () => {
        active = false;
      };
    }

    setHydrated(false);
    Promise.all([
      loadReaderProgress(bookId, 'epub'),
      listReaderBookmarks(bookId, 'epub'),
    ]).then(([storedProgress, storedBookmarks]) => {
      if (!active) return;
      const storedLocator = storedProgress?.locator.format === 'epub'
        ? storedProgress.locator
        : null;
      const compatibleLegacyLocator: EpubLocator | null = !storedLocator && legacyCfi
        ? {
            format: 'epub',
            cfi: legacyCfi,
            spineHref: '',
            progressionInSection: 0,
            excerpt: '',
            totalProgression: null,
          }
        : null;
      const locator = storedLocator ?? compatibleLegacyLocator;
      setInitialLocator(locator);
      setCurrentLocator(locator);
      latestLocatorRef.current = locator;
      lastQueuedFingerprintRef.current = storedLocator ? locatorFingerprint(storedLocator) : null;
      setBookmarks(storedBookmarks);
    }).catch((error) => {
      console.warn('[Krumer EPUB] falha ao carregar progresso duravel', error);
    }).finally(() => {
      if (active) setHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [bookId, enabled, legacyCfi]);

  const enqueueProgressWrite = useCallback((locator: EpubLocator) => {
    const fingerprint = locatorFingerprint(locator);
    if (fingerprint === lastQueuedFingerprintRef.current) return writeChainRef.current;
    lastQueuedFingerprintRef.current = fingerprint;

    const write = writeChainRef.current
      .catch(() => undefined)
      .then(async () => {
        await saveReaderProgress(bookId, locator);
        await durableCallbackRef.current?.(locator);
      })
      .catch((error) => {
        if (lastQueuedFingerprintRef.current === fingerprint) {
          lastQueuedFingerprintRef.current = null;
        }
        console.warn('[Krumer EPUB] falha ao persistir progresso', error);
        throw error;
      });
    writeChainRef.current = write.catch(() => undefined);
    return write;
  }, [bookId]);

  const flush = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const locator = latestLocatorRef.current;
    if (enabled && locator) await enqueueProgressWrite(locator);
    await writeChainRef.current;
  }, [enabled, enqueueProgressWrite]);

  const handleRelocate = useCallback((locator: EpubLocator) => {
    relocationEvents += 1;
    if (__DEV__ && relocationEvents % 10 === 0) {
      console.info('[Krumer EPUB] relocalizacoes recebidas', { relocationEvents });
    }
    latestLocatorRef.current = locator;
    setCurrentLocator(locator);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void enqueueProgressWrite(locator).catch(() => undefined);
    }, PROGRESS_DEBOUNCE_MS);
  }, [enqueueProgressWrite]);

  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') void flush().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [enabled, flush]);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const locator = latestLocatorRef.current;
    if (enabled && locator) void enqueueProgressWrite(locator).catch(() => undefined);
  }, [enabled, enqueueProgressWrite]);

  const addBookmark = useCallback(async () => {
    const locator = latestLocatorRef.current;
    if (!locator) return null;
    const bookmark = await createReaderBookmark(bookId, locator, locator.excerpt || null);
    setBookmarks((current) => [bookmark, ...current]);
    return bookmark;
  }, [bookId]);

  const removeBookmark = useCallback(async (id: string) => {
    await tombstoneReaderBookmark(id);
    setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id));
  }, []);

  return {
    addBookmark,
    bookmarks,
    currentLocator,
    flush,
    handleRelocate,
    hydrated,
    initialLocator,
    removeBookmark,
  };
}
