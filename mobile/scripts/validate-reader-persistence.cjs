const fs = require('fs');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function (require, module, exports) { ${compiled} })`);
  wrapper(require, module, module.exports);
  return module.exports;
}

function main() {
  const migrations = loadTypeScriptModule('src/storage/readerMigrations.ts');
  const models = loadTypeScriptModule('src/models/reader.ts');
  const database = new DatabaseSync(':memory:');

  database.exec('BEGIN EXCLUSIVE');
  database.exec(migrations.READER_DATABASE_MIGRATION_V1);
  database.exec(migrations.READER_DATABASE_MIGRATION_V2);
  database.exec('COMMIT');

  const version = database.prepare('PRAGMA user_version').get().user_version;
  if (version !== migrations.READER_DATABASE_VERSION) {
    throw new Error(`Expected reader database version ${migrations.READER_DATABASE_VERSION}, got ${version}.`);
  }

  const epubLocator = {
    format: 'epub',
    cfi: 'epubcfi(/6/4!/4/2:0)',
    spineHref: 'chapter-1.xhtml',
    progressionInSection: 0.35,
    excerpt: 'A durable excerpt around the stabilized reading position.',
    totalProgression: 0.2,
  };
  if (!models.parseReaderLocator(epubLocator)) throw new Error('A valid EPUB locator was rejected.');
  if (models.parseReaderLocator({ ...epubLocator, progressionInSection: 2 })) {
    throw new Error('An invalid EPUB progression was accepted.');
  }

  const pdfLocator = models.createPdfLocator(18.9);
  if (
    JSON.stringify(pdfLocator) !== JSON.stringify({
      format: 'pdf',
      page: 18,
      progressionInPage: null,
    })
    || !models.parseReaderLocator(pdfLocator)
    || models.parseReaderLocator({ ...pdfLocator, page: 0 })
  ) {
    throw new Error('PDF bookmark locators are not normalized to a valid current page.');
  }

  database.prepare(`INSERT INTO reader_progress (
    book_id, format, cfi, spine_href, progression_in_section, excerpt, total_progression, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'book-1',
    'epub',
    epubLocator.cfi,
    epubLocator.spineHref,
    epubLocator.progressionInSection,
    epubLocator.excerpt,
    epubLocator.totalProgression,
    Date.now(),
  );

  const now = Date.now();
  database.prepare(`INSERT INTO reader_bookmarks (
    id, book_id, format, cfi, spine_href, progression_in_section, excerpt,
    total_progression, label, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'bookmark-1',
    'book-1',
    'epub',
    epubLocator.cfi,
    epubLocator.spineHref,
    epubLocator.progressionInSection,
    epubLocator.excerpt,
    epubLocator.totalProgression,
    null,
    now,
    now,
  );
  database.prepare('UPDATE reader_bookmarks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now + 1, now + 1, 'bookmark-1');
  const liveBookmarkCount = database.prepare(
    'SELECT COUNT(*) AS count FROM reader_bookmarks WHERE book_id = ? AND deleted_at IS NULL',
  ).get('book-1').count;
  const tombstoneCount = database.prepare(
    'SELECT COUNT(*) AS count FROM reader_bookmarks WHERE book_id = ? AND deleted_at IS NOT NULL',
  ).get('book-1').count;
  if (liveBookmarkCount !== 0 || tombstoneCount !== 1) {
    throw new Error('Bookmark tombstones are not filtered as expected.');
  }

  const insertPdfBookmark = database.prepare(`INSERT INTO reader_bookmarks (
    id, book_id, format, page, progression_in_page, label, created_at, updated_at
  ) VALUES (?, ?, 'pdf', ?, ?, ?, ?, ?)`);
  insertPdfBookmark.run('pdf-bookmark-1', 'book-1', pdfLocator.page, null, null, now + 2, now + 2);
  insertPdfBookmark.run('pdf-bookmark-2', 'book-1', pdfLocator.page, null, 'Retomar daqui', now + 3, now + 3);
  insertPdfBookmark.run('pdf-bookmark-other-book', 'book-2', pdfLocator.page, null, null, now + 4, now + 4);
  const pdfBookmarks = database.prepare(
    `SELECT page, progression_in_page, label FROM reader_bookmarks
      WHERE book_id = ? AND format = ? AND deleted_at IS NULL
      ORDER BY created_at DESC`,
  ).all('book-1', 'pdf');
  if (
    pdfBookmarks.length !== 2
    || pdfBookmarks.some((bookmark) => bookmark.page !== 18 || bookmark.progression_in_page !== null)
    || pdfBookmarks[0].label !== 'Retomar daqui'
  ) {
    throw new Error('PDF bookmarks are not repeated, labeled, or isolated by book and format.');
  }

  const isoNow = new Date().toISOString();
  database.prepare(`INSERT INTO reader_notes (
    id, book_id, format, cfi, spine_href, progression_in_section, excerpt,
    total_progression, page_number, content, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'note-1',
    'book-1',
    'epub',
    epubLocator.cfi,
    epubLocator.spineHref,
    epubLocator.progressionInSection,
    epubLocator.excerpt,
    epubLocator.totalProgression,
    12,
    'A note tied to the current page.',
    isoNow,
    isoNow,
  );
  const liveNoteCount = database.prepare(
    'SELECT COUNT(*) AS count FROM reader_notes WHERE book_id = ? AND page_number = ? AND deleted_at IS NULL',
  ).get('book-1', 12).count;
  if (liveNoteCount !== 1) {
    throw new Error('Reader notes are not stored with their source page.');
  }

  const pdfNoteCreatedAt = new Date(Date.now() + 10).toISOString();
  const insertPdfNote = database.prepare(`INSERT INTO reader_notes (
    id, book_id, format, page, progression_in_page, page_number, content,
    created_at, updated_at
  ) VALUES (?, ?, 'pdf', ?, ?, ?, ?, ?, ?)`);
  insertPdfNote.run(
    'pdf-note-1',
    'book-1',
    pdfLocator.page,
    null,
    pdfLocator.page,
    'Nota vinculada à página atual do PDF.',
    pdfNoteCreatedAt,
    pdfNoteCreatedAt,
  );
  insertPdfNote.run(
    'pdf-note-other-book',
    'book-2',
    pdfLocator.page,
    null,
    pdfLocator.page,
    'Nota de outro livro.',
    pdfNoteCreatedAt,
    pdfNoteCreatedAt,
  );
  const storedPdfNote = database.prepare(
    `SELECT * FROM reader_notes
      WHERE book_id = ? AND format = ? AND deleted_at IS NULL`,
  ).get('book-1', 'pdf');
  if (
    !storedPdfNote
    || storedPdfNote.page !== pdfLocator.page
    || storedPdfNote.page_number !== pdfLocator.page
    || storedPdfNote.progression_in_page !== null
  ) {
    throw new Error('PDF notes are not isolated by book/format or linked to their current page.');
  }

  const pdfNoteUpdatedAt = new Date(Date.now() + 20).toISOString();
  database.prepare(
    'UPDATE reader_notes SET content = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
  ).run('Nota PDF editada.', pdfNoteUpdatedAt, 'pdf-note-1');
  const editedPdfNote = database.prepare(
    'SELECT content, updated_at FROM reader_notes WHERE id = ? AND deleted_at IS NULL',
  ).get('pdf-note-1');
  if (editedPdfNote?.content !== 'Nota PDF editada.' || editedPdfNote.updated_at !== pdfNoteUpdatedAt) {
    throw new Error('PDF note edits are not persisted.');
  }

  const pdfNoteDeletedAt = new Date(Date.now() + 30).toISOString();
  database.prepare(
    'UPDATE reader_notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
  ).run(pdfNoteDeletedAt, pdfNoteDeletedAt, 'pdf-note-1');
  const livePdfNotes = database.prepare(
    'SELECT COUNT(*) AS count FROM reader_notes WHERE book_id = ? AND format = ? AND deleted_at IS NULL',
  ).get('book-1', 'pdf').count;
  const deletedPdfNotes = database.prepare(
    'SELECT COUNT(*) AS count FROM reader_notes WHERE book_id = ? AND format = ? AND deleted_at IS NOT NULL',
  ).get('book-1', 'pdf').count;
  const untouchedOtherBookNotes = database.prepare(
    'SELECT COUNT(*) AS count FROM reader_notes WHERE book_id = ? AND format = ? AND deleted_at IS NULL',
  ).get('book-2', 'pdf').count;
  if (livePdfNotes !== 0 || deletedPdfNotes !== 1 || untouchedOtherBookNotes !== 1) {
    throw new Error('PDF note deletion does not preserve book isolation or tombstones.');
  }

  database.close();
  console.log('Reader database migration, PDF/EPUB locators, bookmarks, and PDF note CRUD are valid.');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
