const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const ts = require('typescript');

function loadTypeScriptModule(filePath, imports = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function (require, module, exports) { ${compiled} })`, {
    setTimeout,
    clearTimeout,
    Promise,
    console,
    AbortController,
    decodeURIComponent,
    JSON,
    Date,
    RegExp,
    Error,
  });
  wrapper((name) => imports[name] ?? require(name), module, module.exports);
  return module.exports;
}

async function main() {
  const memory = new Map();
  const storage = {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => memory.set(key, value),
  };
  const secure = loadTypeScriptModule('src/storage/secureCredentials.ts', {
    '@react-native-async-storage/async-storage': storage,
    'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': {
      getItemAsync: async (key) => memory.get(`secure:${key}`) ?? null,
      setItemAsync: async (key, value) => memory.set(`secure:${key}`, value),
      deleteItemAsync: async (key) => memory.delete(`secure:${key}`),
    },
  });
  const preferencesModule = loadTypeScriptModule('src/storage/preferences.ts', {
    '@react-native-async-storage/async-storage': storage,
    'react-native': { Platform: { OS: 'android' } },
    '../storage/secureCredentials': secure,
    './secureCredentials': secure,
  });
  const service = loadTypeScriptModule('src/services/metadataService.ts', {
    '@react-native-async-storage/async-storage': storage,
    '../storage/secureCredentials': secure,
  });

  assert.strictEqual(JSON.stringify(Array.from(service.METADATA_MODELS)), JSON.stringify(['gemini-3.6-flash', 'gemini-3.5-flash-lite']));
  assert.strictEqual(service.normalizeFilename('1984_george_orwell_pt-br_scan_v2.pdf'), '1984 george orwell');
  assert.strictEqual(service.normalizeFilename('O-Senhor-Dos-Aneis.epub'), 'o senhor dos aneis');
  assert.strictEqual(service.getMetadataQuery({
    id: 'series-1', title: 'Sandman', filePath: '/books/sandman/1.epub', fingerprint: 'series|sandman', children: [{ id: 'chapter-1' }],
  }), 'Sandman');
  assert.strictEqual(service.getMetadataQuery({
    id: 'book-query', title: 'Original', filePath: '/books/Dune Frank_Herbert.pdf', fingerprint: 'file|dune|1',
  }), 'dune frank herbert');
  assert.strictEqual(service.extractYear('publicado em 2020'), 2020);
  assert.strictEqual(service.extractYear('obra publicada por volta de 1320'), 1320);
  assert.strictEqual(service.extractYear(1949), 1949);
  assert.strictEqual(service.extractYear('desconhecido'), null);
  assert.strictEqual(service.isMetadataComplete({ author: 'Autor', year: 2020, description: 'Sinopse' }), true);
  // Older persisted data and API responses can represent the year as text;
  // completeness must not depend on the runtime representation.
  assert.strictEqual(service.isMetadataComplete({ author: 'Autor', year: '2020', description: 'Sinopse' }), true);
  assert.strictEqual(service.isMetadataComplete({ author: 'Autor', year: null, description: 'Sinopse' }), false);

  const legacy = { geminiApiKey: 'legacy-key' };
  assert.strictEqual(await secure.migrateLegacyGeminiApiKey(legacy), true);
  assert.strictEqual(await secure.getGeminiApiKey(), 'legacy-key');
  memory.set('krumer.preferences', JSON.stringify({
    hasOnboarded: true,
    language: 'pt-br',
    theme: 'dark',
    libraryFolder: null,
    geminiApiKey: 'legacy-key',
  }));
  const migratedPreferences = await preferencesModule.loadPreferences();
  assert.strictEqual(migratedPreferences.hasGeminiApiKey, true);
  assert.strictEqual(JSON.parse(memory.get('krumer.preferences')).geminiApiKey, undefined);

  let calls = 0;
  const requests = [];
  const fetchImpl = async (url, init) => {
    calls += 1;
    if (init?.body) requests.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        nome_da_obra: '1984',
        autor: 'George Orwell',
        data_de_lancamento: '1949',
        sinopse: 'Uma distopia clássica.',
      }) }] } }] }),
    };
  };
  const book = { id: 'book-1', fingerprint: 'file|1984|1', title: 'Arquivo', filePath: '/books/1984.pdf' };
  const first = await service.searchMetadataForBook(book, { apiKey: 'key', language: 'pt-br', fetchImpl, useCache: true });
  assert.strictEqual(requests[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
  assert.strictEqual(requests[0].body.tools, undefined);
  assert.strictEqual(requests[0].body.generationConfig.responseSchema.type, 'OBJECT');
  assert.deepStrictEqual(requests[0].body.generationConfig.responseSchema.required, ['nome_da_obra', 'autor', 'data_de_lancamento', 'sinopse']);
  assert.strictEqual(requests[0].body.generationConfig.responseMimeType, 'application/json');
  const second = await service.searchMetadataForBook(book, { apiKey: 'key', language: 'pt-br', fetchImpl, useCache: true });
  assert.strictEqual(first.candidate.nome_da_obra, '1984');
  assert.strictEqual(second.fromCache, true);
  assert.strictEqual(calls, 1);
  const otherLanguage = await service.searchMetadataForBook(book, { apiKey: 'key', language: 'en', fetchImpl, useCache: true });
  assert.strictEqual(otherLanguage.fromCache, false);
  assert.strictEqual(calls, 2);

  const numericYearFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      nome_da_obra: 'Livro com ano numérico',
      autor: 'Autor',
      data_de_lancamento: 2020,
      sinopse: 'Sinopse completa.',
    }) }] } }] }),
  });
  const numericYearResult = await service.searchMetadataForBook({ ...book, id: 'book-numeric-year', fingerprint: 'file|numeric-year|1' }, {
    apiKey: 'key',
    language: 'pt-br',
    fetchImpl: numericYearFetch,
    useCache: false,
  });
  assert.strictEqual(numericYearResult.candidate.data_de_lancamento, '2020');
  assert.strictEqual(service.isCandidateComplete(numericYearResult.candidate), true);

  const partialFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '{"nome_da_obra":"Livro","autor":null,"data_de_lancamento":null,"sinopse":null}' }] } }] }),
  });
  const partialBook = { ...book, id: 'book-2', fingerprint: 'file|partial|1' };
  await service.searchMetadataForBook(partialBook, { apiKey: 'key', language: 'pt-br', fetchImpl: partialFetch, useCache: true });
  const partialSecond = await service.searchMetadataForBook(partialBook, { apiKey: 'key', language: 'pt-br', fetchImpl: partialFetch, useCache: true });
  assert.strictEqual(partialSecond.fromCache, false);
  const partialUpdate = service.toBookMetadata({
    nome_da_obra: 'Título retornado',
    autor: null,
    data_de_lancamento: null,
    sinopse: null,
  });
  assert.strictEqual(partialUpdate.title, 'Título retornado');
  assert.strictEqual(Object.keys(partialUpdate).length, 1);
  const preservedSeriesTitle = service.toBookMetadata({
    nome_da_obra: 'Título de capítulo',
    autor: 'Autor',
    data_de_lancamento: '2020',
    sinopse: 'Sinopse',
  }, { preserveTitle: true });
  assert.strictEqual(preservedSeriesTitle.title, undefined);
  assert.strictEqual(preservedSeriesTitle.author, 'Autor');

  let invalidJsonThrown = false;
  try {
    await service.searchMetadataForBook({ ...book, id: 'book-3', fingerprint: 'file|invalid|1' }, {
      apiKey: 'key',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }) }),
      useCache: false,
    });
  } catch (error) {
    invalidJsonThrown = error.code === 'invalid_json';
  }
  assert.strictEqual(invalidJsonThrown, true);

  let invalidResponseJsonThrown = false;
  try {
    await service.searchMetadataForBook({ ...book, id: 'book-4', fingerprint: 'file|invalid-response|1' }, {
      apiKey: 'key',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad body'); } }),
      useCache: false,
    });
  } catch (error) {
    invalidResponseJsonThrown = error.code === 'invalid_json';
  }
  assert.strictEqual(invalidResponseJsonThrown, true);

  let offlineThrown = false;
  try {
    await service.searchMetadataForBook({ ...book, id: 'book-5', fingerprint: 'file|offline|1' }, {
      apiKey: 'key',
      fetchImpl: async () => { throw new TypeError('network unavailable'); },
      useCache: false,
    });
  } catch (error) {
    offlineThrown = error.code === 'offline';
  }
  assert.strictEqual(offlineThrown, true);

  let safetyThrown = false;
  try {
    await service.searchMetadataForBook({ ...book, id: 'book-7', fingerprint: 'file|safety|1' }, {
      apiKey: 'key',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'SAFETY' }] }) }),
      useCache: false,
    });
  } catch (error) {
    safetyThrown = error.code === 'safety_block';
  }
  assert.strictEqual(safetyThrown, true);

  let invalidKeyThrown = false;
  try {
    await service.searchMetadataForBook({ ...book, id: 'book-8', fingerprint: 'file|invalid-key|1' }, {
      apiKey: 'key',
      fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid' } }) }),
      useCache: false,
    });
  } catch (error) {
    invalidKeyThrown = error.code === 'invalid_key';
  }
  assert.strictEqual(invalidKeyThrown, true);

  let fallbackCalls = 0;
  const fallbackResult = await service.searchMetadataForBook({ ...book, id: 'book-6', fingerprint: 'file|fallback|1' }, {
    apiKey: 'key',
    fetchImpl: async () => {
      fallbackCalls += 1;
      if (fallbackCalls === 1) return { ok: false, status: 404, json: async () => ({ error: { message: 'NOT_FOUND' } }) };
      return fetchImpl();
    },
    useCache: false,
  });
  assert.strictEqual(fallbackResult.status, 'found');
  assert.strictEqual(fallbackCalls, 2);

  await secure.setGeminiApiKey('temporary-key');
  assert.strictEqual(await secure.getGeminiApiKey(), 'temporary-key');
  await secure.removeGeminiApiKey();
  assert.strictEqual(await secure.getGeminiApiKey(), null);

  let maxBatchThrown = false;
  try {
    await service.runMetadataBatch(Array.from({ length: 11 }, (_, index) => ({ ...book, id: `book-${index}`, fingerprint: `file|${index}|1` })), { delayMs: 0 });
  } catch (error) {
    maxBatchThrown = /10/.test(error.message);
  }
  assert.strictEqual(maxBatchThrown, true);
  console.log('Metadata normalization, secure migration, cache, JSON validation, and batch limits are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
