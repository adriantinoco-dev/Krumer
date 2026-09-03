import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LanguageCode } from '../i18n/translations';
import type { Book } from '../models/item';
import { warmReaderDatabase } from '../storage/readerDatabase';
import { prepareEpubFile } from './epubFile';
import { loadEpubFontFaces } from './readerFonts';
import { loadStoredReaderSettings } from './readerSettings';
import { resolvePdfUri } from './pdf/pdfUri';
import { preparePdfWebRuntime } from './pdf/pdfWebRuntimeAsset';
import { loadPdfEnginePreference } from './pdf/usePdfEnginePreference';
import { loadPdfPrefs } from './pdf/usePdfPrefs';
import { loadStoredReadingPreferences } from './useReadingPreferences';
import { loadStoredReaderLayoutSettings } from './useReaderLayoutSettings';
import { ReaderLruCache } from './readerCache';

const PDF_PROGRESS_KEY_PREFIX = 'progress_';

type ReaderWarmup = {
  key: string;
  promise: Promise<void>;
};

const activeWarmups = new ReaderLruCache<ReaderWarmup>();
const pdfProgressCache = new Map<string, string | null>();
const pendingPdfProgress = new Map<string, Promise<string | null>>();

export function getCachedPdfProgress(bookId: string): string | null | undefined {
  return pdfProgressCache.get(bookId);
}

export function loadPdfProgress(bookId: string): Promise<string | null> {
  if (pdfProgressCache.has(bookId)) return Promise.resolve(pdfProgressCache.get(bookId) ?? null);
  const pending = pendingPdfProgress.get(bookId);
  if (pending) return pending;

  const request = AsyncStorage.getItem(`${PDF_PROGRESS_KEY_PREFIX}${bookId}`)
    .then((progress) => {
      pdfProgressCache.set(bookId, progress);
      return progress;
    })
    .finally(() => {
      pendingPdfProgress.delete(bookId);
    });
  pendingPdfProgress.set(bookId, request);
  return request;
}

export async function savePdfProgress(bookId: string, progress: string): Promise<void> {
  pdfProgressCache.set(bookId, progress);
  await AsyncStorage.setItem(`${PDF_PROGRESS_KEY_PREFIX}${bookId}`, progress);
}

export function preloadReaderBook(book: Book, language: LanguageCode): Promise<void> {
  const key = `${book.id}\u0000${book.filePath}\u0000${book.fileSize ?? 0}\u0000${language}`;
  const cachedWarmup = activeWarmups.get(key);
  if (cachedWarmup) return cachedWarmup.promise;

  const startedAt = Date.now();
  const tasks: Promise<unknown>[] = [warmReaderDatabase()];

  if (book.format === 'epub') {
    const preferences = loadStoredReadingPreferences();
    tasks.push(
      prepareEpubFile(book.filePath, book.fileSize, language),
      loadStoredReaderLayoutSettings(),
      loadStoredReaderSettings(),
      preferences,
      preferences.then(({ fontFamily }) => loadEpubFontFaces(fontFamily)),
    );
  } else {
    const engine = loadPdfEnginePreference();
    tasks.push(
      resolvePdfUri(book.filePath, book.fileSize),
      loadPdfPrefs(),
      loadPdfProgress(book.id),
      engine,
      engine.then((selectedEngine) => (
        selectedEngine === 'webview' ? preparePdfWebRuntime() : undefined
      )),
    );
  }

  const promise = Promise.allSettled(tasks).then((results) => {
    if (__DEV__) {
      console.info('[Krumer Reader] abertura pre-aquecida', {
        bookId: book.id,
        durationMs: Date.now() - startedAt,
        format: book.format,
        failures: results.filter(({ status }) => status === 'rejected').length,
      });
    }
  });
  activeWarmups.set(key, { key, promise });
  return promise;
}
