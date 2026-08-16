import { Directory, File } from 'expo-file-system';
import type { Book, BookFormat } from '../models/item';
import { extractCover } from './coverExtractor';

export type ScanUpdate = {
  fileName: string;
  percent: number;
  done: boolean;
};

type ScannedFile = {
  uri: string;
  childrenCount: number | null;
};

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

export async function scanDirectory(directoryUri: string): Promise<ScannedFile[]> {
  const result: ScannedFile[] = [];
  const entries = new Directory(directoryUri).list();
  const localBookFiles: File[] = [];

  for (const entry of entries) {
    if (entry instanceof Directory) {
      const nested = await scanDirectory(entry.uri);
      result.push(...nested);
      continue;
    }

    if (entry instanceof File && getBookFormat(entry.uri)) {
      localBookFiles.push(entry);
    }
  }

  const childrenCount = localBookFiles.length > 1 ? localBookFiles.length : null;
  for (const file of localBookFiles) {
    result.push({ uri: file.uri, childrenCount });
  }

  return result;
}

export async function scanLibrary(
  directoryUri: string,
  onUpdate?: (update: ScanUpdate) => void
): Promise<Book[]> {
  const files = await scanDirectory(directoryUri);
  const books: Book[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const { uri: filePath, childrenCount } = files[index];
    const format = getBookFormat(filePath);
    if (!format) continue;

    const id = createBookId(filePath);
    const fileName = getFileName(filePath);
    onUpdate?.({
      fileName,
      percent: files.length ? (index / files.length) * 100 : 0,
      done: false,
    });

    const coverPath = await extractCover(filePath, id, format);
    books.push({
      id,
      title: getTitle(filePath),
      author: '',
      format,
      filePath,
      coverPath,
      progress: null,
      childrenCount,
      addedAt: Date.now(),
    });

    onUpdate?.({
      fileName,
      percent: files.length ? ((index + 1) / files.length) * 100 : 100,
      done: index + 1 === files.length,
    });
  }

  if (!files.length) {
    onUpdate?.({ fileName: '', percent: 100, done: true });
  }

  return books;
}
