export const READER_DATABASE_VERSION = 2;

export const READER_DATABASE_MIGRATION_V1 = `
  CREATE TABLE IF NOT EXISTS reader_progress (
    book_id TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('epub', 'pdf')),
    cfi TEXT,
    spine_href TEXT,
    progression_in_section REAL,
    excerpt TEXT,
    total_progression REAL,
    page INTEGER,
    progression_in_page REAL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (book_id, format),
    CHECK (
      (format = 'epub' AND page IS NULL AND progression_in_page IS NULL)
      OR
      (format = 'pdf' AND page >= 1 AND cfi IS NULL AND spine_href IS NULL
        AND progression_in_section IS NULL AND excerpt IS NULL AND total_progression IS NULL)
    ),
    CHECK (progression_in_section IS NULL OR progression_in_section BETWEEN 0 AND 1),
    CHECK (total_progression IS NULL OR total_progression BETWEEN 0 AND 1),
    CHECK (progression_in_page IS NULL OR progression_in_page BETWEEN 0 AND 1)
  );

  CREATE TABLE IF NOT EXISTS reader_bookmarks (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('epub', 'pdf')),
    cfi TEXT,
    spine_href TEXT,
    progression_in_section REAL,
    excerpt TEXT,
    total_progression REAL,
    page INTEGER,
    progression_in_page REAL,
    label TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    CHECK (
      (format = 'epub' AND page IS NULL AND progression_in_page IS NULL)
      OR
      (format = 'pdf' AND page >= 1 AND cfi IS NULL AND spine_href IS NULL
        AND progression_in_section IS NULL AND excerpt IS NULL AND total_progression IS NULL)
    ),
    CHECK (progression_in_section IS NULL OR progression_in_section BETWEEN 0 AND 1),
    CHECK (total_progression IS NULL OR total_progression BETWEEN 0 AND 1),
    CHECK (progression_in_page IS NULL OR progression_in_page BETWEEN 0 AND 1)
  );

  CREATE INDEX IF NOT EXISTS reader_bookmarks_book_format_updated
    ON reader_bookmarks (book_id, format, updated_at DESC);
  CREATE INDEX IF NOT EXISTS reader_bookmarks_tombstones
    ON reader_bookmarks (deleted_at) WHERE deleted_at IS NOT NULL;

  PRAGMA user_version = 1;
`;

export const READER_DATABASE_MIGRATION_V2 = `
  CREATE TABLE IF NOT EXISTS reader_notes (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('epub', 'pdf')),
    cfi TEXT,
    spine_href TEXT,
    progression_in_section REAL,
    excerpt TEXT,
    total_progression REAL,
    page INTEGER,
    progression_in_page REAL,
    page_number INTEGER NOT NULL CHECK (page_number >= 1),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (
      (format = 'epub' AND page IS NULL AND progression_in_page IS NULL)
      OR
      (format = 'pdf' AND page >= 1 AND cfi IS NULL AND spine_href IS NULL
        AND progression_in_section IS NULL AND excerpt IS NULL AND total_progression IS NULL)
    ),
    CHECK (progression_in_section IS NULL OR progression_in_section BETWEEN 0 AND 1),
    CHECK (total_progression IS NULL OR total_progression BETWEEN 0 AND 1),
    CHECK (progression_in_page IS NULL OR progression_in_page BETWEEN 0 AND 1)
  );

  CREATE INDEX IF NOT EXISTS reader_notes_book_format_page
    ON reader_notes (book_id, format, page_number, created_at DESC)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS reader_notes_tombstones
    ON reader_notes (deleted_at) WHERE deleted_at IS NOT NULL;

  PRAGMA user_version = 2;
`;
