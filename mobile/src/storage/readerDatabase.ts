import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import {
  parseReaderLocator,
  type ReaderBookmark,
  type ReaderLocator,
  type ReaderNote,
  type ReaderProgress,
} from '../models/reader';
import {
  READER_DATABASE_MIGRATION_V1,
  READER_DATABASE_MIGRATION_V2,
  READER_DATABASE_VERSION,
} from './readerMigrations';

const DATABASE_NAME = 'krumer-reader.db';

type LocatorRow = {
  format: string;
  cfi: string | null;
  spine_href: string | null;
  progression_in_section: number | null;
  excerpt: string | null;
  total_progression: number | null;
  page: number | null;
  progression_in_page: number | null;
};

type ProgressRow = LocatorRow & {
  book_id: string;
  updated_at: number;
};

type BookmarkRow = LocatorRow & {
  id: string;
  book_id: string;
  label: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

type NoteRow = LocatorRow & {
  id: string;
  book_id: string;
  page_number: number;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const metrics = {
  bookmarkWrites: 0,
  noteWrites: 0,
  progressWrites: 0,
};

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function migrate(database: SQLiteDatabase) {
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const current = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((current?.user_version ?? 0) >= READER_DATABASE_VERSION) return;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const insideTransaction = await transaction.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const version = insideTransaction?.user_version ?? 0;
    if (version < 1) await transaction.execAsync(READER_DATABASE_MIGRATION_V1);
    if (version < 2) await transaction.execAsync(READER_DATABASE_MIGRATION_V2);
  });
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await migrate(database);
      return database;
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function rowToLocator(row: LocatorRow): ReaderLocator | null {
  if (row.format === 'epub') {
    return parseReaderLocator({
      format: 'epub',
      cfi: row.cfi,
      spineHref: row.spine_href ?? '',
      progressionInSection: row.progression_in_section ?? 0,
      excerpt: row.excerpt ?? '',
      totalProgression: row.total_progression,
    });
  }

  if (row.format === 'pdf') {
    return parseReaderLocator({
      format: 'pdf',
      page: row.page,
      progressionInPage: row.progression_in_page,
    });
  }

  return null;
}

function locatorColumns(locator: ReaderLocator) {
  return locator.format === 'epub'
    ? {
        cfi: locator.cfi,
        spineHref: locator.spineHref,
        progressionInSection: locator.progressionInSection,
        excerpt: locator.excerpt,
        totalProgression: locator.totalProgression,
        page: null,
        progressionInPage: null,
      }
    : {
        cfi: null,
        spineHref: null,
        progressionInSection: null,
        excerpt: null,
        totalProgression: null,
        page: locator.page,
        progressionInPage: locator.progressionInPage,
      };
}

export async function loadReaderProgress(bookId: string, format: ReaderLocator['format']): Promise<ReaderProgress | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<ProgressRow>(
    'SELECT * FROM reader_progress WHERE book_id = ? AND format = ?',
    bookId,
    format,
  );
  if (!row) return null;
  const locator = rowToLocator(row);
  return locator ? { bookId: row.book_id, locator, updatedAt: row.updated_at } : null;
}

export async function saveReaderProgress(bookId: string, locator: ReaderLocator): Promise<ReaderProgress> {
  const database = await getDatabase();
  const columns = locatorColumns(locator);
  const updatedAt = Date.now();
  await database.runAsync(
    `INSERT INTO reader_progress (
      book_id, format, cfi, spine_href, progression_in_section, excerpt,
      total_progression, page, progression_in_page, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(book_id, format) DO UPDATE SET
      cfi = excluded.cfi,
      spine_href = excluded.spine_href,
      progression_in_section = excluded.progression_in_section,
      excerpt = excluded.excerpt,
      total_progression = excluded.total_progression,
      page = excluded.page,
      progression_in_page = excluded.progression_in_page,
      updated_at = excluded.updated_at`,
    bookId,
    locator.format,
    columns.cfi,
    columns.spineHref,
    columns.progressionInSection,
    columns.excerpt,
    columns.totalProgression,
    columns.page,
    columns.progressionInPage,
    updatedAt,
  );
  metrics.progressWrites += 1;
  if (__DEV__) {
    console.info('[Krumer Reader DB] progresso persistido', {
      bookId,
      progressWrites: metrics.progressWrites,
    });
  }
  return { bookId, locator, updatedAt };
}

export async function listReaderBookmarks(
  bookId: string,
  format: ReaderLocator['format'],
): Promise<ReaderBookmark[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<BookmarkRow>(
    `SELECT * FROM reader_bookmarks
      WHERE book_id = ? AND format = ? AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    bookId,
    format,
  );
  return rows.flatMap((row) => {
    const locator = rowToLocator(row);
    return locator ? [{
      id: row.id,
      bookId: row.book_id,
      locator,
      label: row.label,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    }] : [];
  });
}

export async function createReaderBookmark(
  bookId: string,
  locator: ReaderLocator,
  label: string | null = null,
): Promise<ReaderBookmark> {
  const database = await getDatabase();
  const columns = locatorColumns(locator);
  const now = Date.now();
  const id = `bookmark-${now}-${Math.random().toString(36).slice(2, 12)}`;
  await database.runAsync(
    `INSERT INTO reader_bookmarks (
      id, book_id, format, cfi, spine_href, progression_in_section, excerpt,
      total_progression, page, progression_in_page, label, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    id,
    bookId,
    locator.format,
    columns.cfi,
    columns.spineHref,
    columns.progressionInSection,
    columns.excerpt,
    columns.totalProgression,
    columns.page,
    columns.progressionInPage,
    label,
    now,
    now,
  );
  metrics.bookmarkWrites += 1;
  return { id, bookId, locator, label, createdAt: now, updatedAt: now, deletedAt: null };
}

export async function tombstoneReaderBookmark(id: string) {
  const database = await getDatabase();
  const deletedAt = Date.now();
  await database.runAsync(
    `UPDATE reader_bookmarks
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    deletedAt,
    deletedAt,
    id,
  );
  metrics.bookmarkWrites += 1;
}

export async function listReaderNotes(
  bookId: string,
  format: ReaderLocator['format'],
): Promise<ReaderNote[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<NoteRow>(
    `SELECT * FROM reader_notes
      WHERE book_id = ? AND format = ? AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    bookId,
    format,
  );
  return rows.flatMap((row) => {
    const locator = rowToLocator(row);
    return locator ? [{
      id: row.id,
      bookId: row.book_id,
      locator,
      pageNumber: row.page_number,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    }] : [];
  });
}

export async function createReaderNote(
  bookId: string,
  locator: ReaderLocator,
  content: string,
  pageNumber: number,
): Promise<ReaderNote> {
  const database = await getDatabase();
  const columns = locatorColumns(locator);
  const now = new Date().toISOString();
  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  await database.runAsync(
    `INSERT INTO reader_notes (
      id, book_id, format, cfi, spine_href, progression_in_section, excerpt,
      total_progression, page, progression_in_page, page_number, content,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    id,
    bookId,
    locator.format,
    columns.cfi,
    columns.spineHref,
    columns.progressionInSection,
    columns.excerpt,
    columns.totalProgression,
    columns.page,
    columns.progressionInPage,
    Math.max(1, Math.floor(pageNumber)),
    content,
    now,
    now,
  );
  metrics.noteWrites += 1;
  return {
    id,
    bookId,
    locator,
    pageNumber: Math.max(1, Math.floor(pageNumber)),
    content,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function updateReaderNote(id: string, content: string) {
  const database = await getDatabase();
  const updatedAt = new Date().toISOString();
  await database.runAsync(
    `UPDATE reader_notes
      SET content = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    content,
    updatedAt,
    id,
  );
  metrics.noteWrites += 1;
}

export async function tombstoneReaderNote(id: string) {
  const database = await getDatabase();
  const deletedAt = new Date().toISOString();
  await database.runAsync(
    `UPDATE reader_notes
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    deletedAt,
    deletedAt,
    id,
  );
  metrics.noteWrites += 1;
}

export function getReaderPersistenceMetrics() {
  return { ...metrics };
}
