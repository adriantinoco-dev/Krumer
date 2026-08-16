import { Directory, File } from 'expo-file-system';
import type { Book, BookFormat } from '../models/item';
import { extractCover } from './coverExtractor';

export type ScanUpdate = {
  fileName: string;
  percent: number;
  done: boolean;
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

export async function scanDirectory(directoryUri: string): Promise<string[]> {
  const result: string[] = [];
  const entries = new Directory(directoryUri).list();

  for (const entry of entries) {
    if (entry instanceof Directory) {
      const nested = await scanDirectory(entry.uri);
      result.push(...nested);
      continue;
    }

    if (entry instanceof File && getBookFormat(entry.uri)) {
      result.push(entry.uri);
    }
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
    const filePath = files[index];
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
