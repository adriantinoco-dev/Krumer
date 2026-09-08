const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

function loadTypeScriptModule(filePath, imports = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function (require, module, exports) { ${compiled} })`, {
    clearTimeout,
    console,
    Number,
    Promise,
    setTimeout,
  });
  wrapper((name) => imports[name] ?? require(name), module, module.exports);
  return module.exports;
}

function createFakeTimers() {
  let nextId = 1;
  const scheduled = [];

  return {
    clearTimeout(timer) {
      const entry = scheduled.find((candidate) => candidate.id === timer);
      if (entry) entry.cleared = true;
    },
    fireNext() {
      const index = scheduled.findIndex((entry) => !entry.cleared);
      assert.notStrictEqual(index, -1, 'Expected a scheduled cover retry.');
      const [entry] = scheduled.splice(index, 1);
      entry.callback();
      return entry.delayMs;
    },
    nextDelay() {
      return scheduled.find((entry) => !entry.cleared)?.delayMs ?? null;
    },
    pendingCount() {
      return scheduled.filter((entry) => !entry.cleared).length;
    },
    setTimeout(callback, delayMs) {
      const id = nextId;
      nextId += 1;
      scheduled.push({ callback, cleared: false, delayMs, id });
      return id;
    },
  };
}

function makeBook(id) {
  return {
    author: '',
    coverPath: null,
    filePath: `content://books/${id}.epub`,
    fingerprint: `file|${id}|1`,
    format: 'epub',
    id,
    progress: null,
    title: id,
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function validateBackoffAndEventualSuccess(CoverRetryCoordinator) {
  const timers = createFakeTimers();
  const pending = [makeBook('eventual')];
  let attempts = 0;
  let applied = 0;
  const coordinator = new CoverRetryCoordinator({
    canApplyCover: () => pending.length > 0,
    extractCovers: async (_books, onCoverReady) => {
      attempts += 1;
      if (attempts === 3) onCoverReady('eventual', 'file://cover.jpg');
    },
    getPendingBooks: () => [...pending],
    onCoverReady: () => {
      applied += 1;
      pending.length = 0;
    },
  }, true, timers);

  coordinator.requestImmediate(true);
  await settle();
  assert.strictEqual(attempts, 1);
  assert.strictEqual(timers.nextDelay(), 5_000);

  assert.strictEqual(timers.fireNext(), 5_000);
  await settle();
  assert.strictEqual(attempts, 2);
  assert.strictEqual(timers.nextDelay(), 15_000);

  assert.strictEqual(timers.fireNext(), 15_000);
  await settle();
  assert.strictEqual(attempts, 3);
  assert.strictEqual(applied, 1);
  assert.strictEqual(timers.pendingCount(), 0);
  coordinator.dispose();
}

async function validatePermanentFailureCap(CoverRetryCoordinator) {
  const timers = createFakeTimers();
  const pending = [makeBook('permanent')];
  const coordinator = new CoverRetryCoordinator({
    canApplyCover: () => true,
    extractCovers: async () => undefined,
    getPendingBooks: () => pending,
    onCoverReady: () => undefined,
  }, true, timers);

  coordinator.requestImmediate(true);
  await settle();
  const delays = [];
  for (let index = 0; index < 7; index += 1) {
    delays.push(timers.fireNext());
    await settle();
  }
  assert.deepStrictEqual(delays, [5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 300_000]);
  assert.strictEqual(timers.nextDelay(), 300_000);
  coordinator.dispose();
}

async function validatePauseAndResume(CoverRetryCoordinator) {
  const timers = createFakeTimers();
  const pending = [makeBook('one'), makeBook('two'), makeBook('three')];
  const attempted = [];
  let coordinator;
  coordinator = new CoverRetryCoordinator({
    canApplyCover: (bookId) => pending.some((book) => book.id === bookId),
    extractCovers: async (books, onCoverReady, shouldContinue) => {
      for (const book of [...books]) {
        if (!shouldContinue()) break;
        attempted.push(book.id);
        onCoverReady(book.id, `file://${book.id}.jpg`);
        if (book.id === 'one') coordinator.setActive(false);
      }
    },
    getPendingBooks: () => pending,
    onCoverReady: (bookId) => {
      const index = pending.findIndex((book) => book.id === bookId);
      if (index >= 0) pending.splice(index, 1);
    },
  }, true, timers);

  coordinator.requestImmediate(true);
  await settle();
  assert.deepStrictEqual(attempted, ['one']);
  assert.strictEqual(timers.pendingCount(), 0);

  coordinator.setActive(true);
  await settle();
  assert.deepStrictEqual(attempted, ['one', 'two', 'three']);
  assert.strictEqual(pending.length, 0);
  coordinator.dispose();
}

async function validateSingleRunAndRestart(CoverRetryCoordinator) {
  const timers = createFakeTimers();
  const first = makeBook('first');
  const second = makeBook('second');
  let pending = [first];
  let activeRuns = 0;
  let maxActiveRuns = 0;
  let releaseFirst;
  let runs = 0;
  const firstRun = new Promise((resolve) => { releaseFirst = resolve; });
  const coordinator = new CoverRetryCoordinator({
    canApplyCover: () => true,
    extractCovers: async (books, onCoverReady) => {
      runs += 1;
      activeRuns += 1;
      maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
      if (runs === 1) await firstRun;
      for (const book of books) onCoverReady(book.id, `file://${book.id}.jpg`);
      activeRuns -= 1;
    },
    getPendingBooks: () => [...pending],
    onCoverReady: (bookId) => {
      pending = pending.filter((book) => book.id !== bookId);
    },
  }, true, timers);

  coordinator.requestImmediate(true);
  await settle();
  pending.push(second);
  coordinator.requestImmediate(true);
  coordinator.requestImmediate(true);
  assert.strictEqual(runs, 1);
  releaseFirst();
  await settle();
  await settle();
  assert.strictEqual(runs, 2);
  assert.strictEqual(maxActiveRuns, 1);
  assert.strictEqual(pending.length, 0);
  coordinator.dispose();
}

async function validateManualCoverProtection(CoverRetryCoordinator) {
  const timers = createFakeTimers();
  let manualCover = false;
  let applied = 0;
  const book = makeBook('manual');
  const coordinator = new CoverRetryCoordinator({
    canApplyCover: () => !manualCover,
    extractCovers: async (_books, onCoverReady) => {
      manualCover = true;
      onCoverReady(book.id, 'file://automatic.jpg');
    },
    getPendingBooks: () => (manualCover ? [] : [book]),
    onCoverReady: () => { applied += 1; },
  }, true, timers);

  coordinator.requestImmediate(true);
  await settle();
  assert.strictEqual(applied, 0);
  assert.strictEqual(timers.pendingCount(), 0);
  coordinator.dispose();
}

async function validateExtractionBatch() {
  let activeExtractions = 0;
  let maxActiveExtractions = 0;
  const extracted = [];
  const existingChecks = [];
  const ready = [];
  const scanner = loadTypeScriptModule('src/services/libraryScanner.ts', {
    'expo-file-system': { Directory: class Directory {}, File: class File {} },
    './coverExtractor': {
      extractCover: async (_filePath, bookId) => {
        extracted.push(bookId);
        activeExtractions += 1;
        maxActiveExtractions = Math.max(maxActiveExtractions, activeExtractions);
        await new Promise((resolve) => setTimeout(resolve, 2));
        activeExtractions -= 1;
        return `file://${bookId}.jpg`;
      },
      getExistingCoverPath: async (bookId) => {
        existingChecks.push(bookId);
        return bookId === 'cached' ? 'file://cached.jpg' : null;
      },
    },
  });
  const books = ['cached', 'a', 'b', 'c', 'd', 'e'].map(makeBook);
  books.push({ ...makeBook('covered'), coverPath: 'file://already.jpg' });

  await scanner.extractCoversInBackground(books, (bookId, coverPath) => ready.push([bookId, coverPath]));
  assert.strictEqual(maxActiveExtractions, 3);
  assert.strictEqual(extracted.includes('cached'), false);
  assert.strictEqual(existingChecks.includes('covered'), false);
  assert.strictEqual(ready.length, 6);

  let continueWork = true;
  const pausedReady = [];
  await scanner.extractCoversInBackground(
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(makeBook),
    (bookId) => {
      pausedReady.push(bookId);
      continueWork = false;
    },
    () => continueWork,
  );
  assert(pausedReady.length >= 1 && pausedReady.length <= 3, 'Pause must stop workers from claiming another book.');
}

async function main() {
  const retry = loadTypeScriptModule('src/services/coverRetry.ts');
  assert.deepStrictEqual(
    Array.from(retry.COVER_RETRY_DELAYS_MS),
    [5_000, 15_000, 30_000, 60_000, 120_000, 300_000],
  );
  assert.strictEqual(retry.getCoverRetryDelay(99), 300_000);

  await validateBackoffAndEventualSuccess(retry.CoverRetryCoordinator);
  await validatePermanentFailureCap(retry.CoverRetryCoordinator);
  await validatePauseAndResume(retry.CoverRetryCoordinator);
  await validateSingleRunAndRestart(retry.CoverRetryCoordinator);
  await validateManualCoverProtection(retry.CoverRetryCoordinator);
  await validateExtractionBatch();

  const appContext = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
  assert(appContext.includes("AppState.addEventListener('change'"));
  assert(appContext.includes("coordinator.setActive(nextState === 'active')"));
  assert(appContext.includes('appStateSubscription.remove()'));
  assert(appContext.includes('!book.children?.length'));
  assert(appContext.includes('Boolean(target && !target.coverPath)'));
  assert(!fs.readFileSync('src/services/coverRetry.ts', 'utf8').includes('scanLibrary'));

  console.log('Continuous cover retries, backoff, lifecycle pause, concurrency, cache reuse, and manual-cover protection are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
