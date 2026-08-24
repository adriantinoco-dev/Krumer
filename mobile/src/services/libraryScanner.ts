import { Directory, File } from 'expo-file-system';
import type { Book, BookFormat } from '../models/item';
import { extractCover, getExistingCoverPath } from './coverExtractor';

const COVER_CONCURRENCY = 3;
const SCAN_TOTAL_MIN_MS = 2000;
const SCAN_STEP_MIN_MS = 15;
const SCAN_STEP_MAX_MS = 250;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type ScanUpdate = {
  fileName: string;
  percent: number;
  done: boolean;
};

type ScannedFile = {
  uri: string;
  size: number;
};

type ScannedEntry =
  | { kind: 'book'; uri: string; size: number }
  | { kind: 'collection'; uri: string; files: ScannedFile[] };

function createBookId(filePath: string) {
  let hash = 0;
  for (let index = 0; index < filePath.length; index += 1) {
    hash = (hash << 5) - hash + filePath.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getFileName(filePath: string) {
  const decoded = safeDecodeUri(filePath);
  return decoded.split('/').pop() ?? filePath;
}

function getBookFormat(filePath: string): BookFormat | null {
  const lower = safeDecodeUri(filePath).split('?')[0].split('#')[0].toLowerCase();
  if (lower.endsWith('.epub')) return 'epub';
  if (lower.endsWith('.pdf')) return 'pdf';
  return null;
}

function safeDecodeUri(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getTitle(filePath: string) {
  return getFileName(filePath).replace(/\.(epub|pdf)$/i, '').replace(/[_-]+/g, ' ').trim();
}

function getFingerprint(filePath: string, size: number) {
  const basename = getFileName(filePath).replace(/\.(epub|pdf)$/i, '');
  return `file|${basename}|${Math.trunc(size || 0)}`;
}

function getFolderTitle(directoryUri: string) {
  const name = safeDecodeUri(directoryUri).replace(/\/$/, '').split('/').pop() ?? directoryUri;
  return name.replace(/[_-]+/g, ' ').trim();
}

async function collectFolderFiles(directoryUri: string): Promise<ScannedFile[]> {
  const result: ScannedFile[] = [];
  const entries = new Directory(directoryUri).list();

  for (const entry of entries) {
    if (entry instanceof Directory) {
      const nested = await collectFolderFiles(entry.uri);
      result.push(...nested);
      continue;
    }

    if (entry instanceof File && getBookFormat(entry.uri)) {
      result.push({ uri: entry.uri, size: entry.size || 0 });
    }
  }

  return result.sort((a, b) =>
    getFileName(a.uri).localeCompare(getFileName(b.uri), undefined, { numeric: true, sensitivity: 'base' }),
  );
}

async function scanDirectory(directoryUri: string): Promise<ScannedEntry[]> {
  const result: ScannedEntry[] = [];
  const entries = new Directory(directoryUri).list();

  for (const entry of entries) {
    if (entry instanceof Directory) {
      const files = await collectFolderFiles(entry.uri);
      if (files.length) {
        result.push({ kind: 'collection', uri: entry.uri, files });
      }
      continue;
    }

    if (entry instanceof File && getBookFormat(entry.uri)) {
      result.push({ kind: 'book', uri: entry.uri, size: entry.size || 0 });
    }
  }

  return result;
}

export async function scanLibrary(
  directoryUri: string,
  onUpdate?: (update: ScanUpdate) => void
): Promise<Book[]> {
  const scanned = await scanDirectory(directoryUri);
  const books: Book[] = [];
  const stepDelay = scanned.length
    ? Math.min(SCAN_STEP_MAX_MS, Math.max(SCAN_STEP_MIN_MS, SCAN_TOTAL_MIN_MS / scanned.length))
    : 0;

  for (let index = 0; index < scanned.length; index += 1) {
    const entry = scanned[index];
    const fileName = getFileName(entry.uri);

    if (index > 0) await delay(stepDelay);

    onUpdate?.({
      fileName,
      percent: scanned.length ? (index / scanned.length) * 100 : 0,
      done: false,
    });

    if (entry.kind === 'collection') {
      const parentId = createBookId(entry.uri);
      const children: Book[] = entry.files.map((file) => ({
        id: createBookId(file.uri),
        title: getTitle(file.uri),
        author: '',
        format: getBookFormat(file.uri) as BookFormat,
        filePath: file.uri,
        fileSize: file.size,
        fingerprint: getFingerprint(file.uri, file.size),
        coverPath: null,
        progress: null,
        parentId,
        addedAt: Date.now(),
      }));
      const firstChild = children[0];

      books.push({
        id: parentId,
        title: getFolderTitle(entry.uri),
        author: '',
        format: firstChild.format,
        filePath: firstChild.filePath,
        fileSize: 0,
        fingerprint: `series|${safeDecodeUri(entry.uri).replace(/\/$/, '').split('/').pop() ?? entry.uri}`,
        coverPath: null,
        progress: null,
        childrenCount: children.length,
        children,
        addedAt: Date.now(),
      });
    } else {
      books.push({
        id: createBookId(entry.uri),
        title: getTitle(entry.uri),
        author: '',
        format: getBookFormat(entry.uri) as BookFormat,
        filePath: entry.uri,
        fileSize: entry.size,
        fingerprint: getFingerprint(entry.uri, entry.size),
        coverPath: null,
        progress: null,
        parentId: null,
        addedAt: Date.now(),
      });
    }

    onUpdate?.({
      fileName,
      percent: scanned.length ? ((index + 1) / scanned.length) * 100 : 100,
      done: index + 1 === scanned.length,
    });
  }

  if (!scanned.length) {
    onUpdate?.({ fileName: '', percent: 100, done: true });
  }

  return books;
}

export async function extractCoversInBackground(
  books: Book[],
  onCoverReady: (bookId: string, coverPath: string) => void
): Promise<void> {
  const queue = books.filter((book) => !book.coverPath);
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const book = queue[cursor];
      cursor += 1;

      try {
        const existingCover = await getExistingCoverPath(book.id);
        const coverPath = existingCover ?? (await extractCover(book.filePath, book.id, book.format));
        if (coverPath) onCoverReady(book.id, coverPath);
      } catch {
        // livro fica sem capa; nao quebra o fluxo
      }
    }
  }

  const workers = Array.from({ length: Math.min(COVER_CONCURRENCY, queue.length) }, worker);
  await Promise.all(workers);
}
