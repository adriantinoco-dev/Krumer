const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const ts = require('typescript');

function loadExtractor(fileSystem, nativeModules) {
  const source = ts.transpileModule(fs.readFileSync('src/services/coverExtractor.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const imports = {
    'expo-file-system/legacy': fileSystem,
    'react-native': { NativeModules: nativeModules, Platform: { OS: 'android' } },
  };
  vm.runInNewContext(`(function(require, module, exports) { ${source} })`, { console })(
    (name) => imports[name] ?? require(name), module, module.exports,
  );
  return module.exports;
}

async function validateExtraction() {
  const files = new Map();
  const generated = [];
  const fileSystem = {
    documentDirectory: 'file:///documents/',
    cacheDirectory: 'file:///cache/',
    EncodingType: { Base64: 'base64' },
    makeDirectoryAsync: async () => {},
    deleteAsync: async (uri) => { files.delete(uri); },
    writeAsStringAsync: async (uri, data) => { files.set(uri, data); },
    getInfoAsync: async (uri) => ({ exists: files.has(uri), size: files.get(uri)?.length ?? 0 }),
    copyAsync: async ({ from, to }) => { files.set(to, files.get(from) ?? 'source'); },
    moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
  };
  const extractor = loadExtractor(fileSystem, {
    KrumerPdfThumbnail: {
      generate: async (uri, page) => {
        generated.push([uri, page]);
        files.set('file:///cache/thumbnail.jpg', 'pdf-thumbnail');
        return { uri: 'file:///cache/thumbnail.jpg', width: 900, height: 1200 };
      },
    },
  });
  const cover = await extractor.extractCover('content://books/book.pdf', 'pdf', 'pdf');
  assert.equal(cover, 'file:///documents/covers/cover_pdf.jpg');
  assert.equal(files.get(cover), 'pdf-thumbnail');
  assert.equal(generated[0][0], 'file:///cache/cover-sources/pdf.pdf');
  assert.equal(generated[0][1], 0);
  assert(!files.has('file:///cache/cover-sources/pdf.pdf'));
  assert(!files.has('file:///cache/thumbnail.jpg'));
}

async function validateNativePlugin() {
  const config = require('../app.json').expo;
  assert(config.plugins.includes('./plugins/withPdfThumbnail'));
  const registration = 'add(com.adriantinoco.krumer.pdf.KrumerPdfThumbnailPackage())';
  const sourceRoot = 'android/app/src/main/java/com/adriantinoco/krumer';
  const current = fs.readFileSync(`${sourceRoot}/MainApplication.kt`, 'utf8');
  assert(current.includes(registration), 'Checked-in Android app must register the thumbnail module');
  for (const file of ['KrumerPdfThumbnailModule.kt', 'KrumerPdfThumbnailPackage.kt']) {
    assert.equal(fs.readFileSync(`${sourceRoot}/pdf/${file}`, 'utf8'), fs.readFileSync(`plugins/pdf-thumbnail/${file}`, 'utf8'));
  }

  let mainMod;
  let copyMod;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, __dirname) { ${fs.readFileSync('plugins/withPdfThumbnail.js', 'utf8')} })`)(
    (name) => name === '@expo/config-plugins' ? {
      withMainApplication: (value, action) => { mainMod = action; return value; },
      withDangerousMod: (value, [, action]) => { copyMod = action; return value; },
    } : require(name), module, path.resolve('plugins'),
  );
  module.exports(config);
  const generated = { modResults: { contents: current.replace(registration, '') } };
  mainMod(generated);
  mainMod(generated);
  assert.equal(generated.modResults.contents.split(registration).length - 1, 1);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'krumer-cover-plugin-'));
  try {
    await copyMod({ modRequest: { platformProjectRoot: temp } });
    for (const file of ['KrumerPdfThumbnailModule.kt', 'KrumerPdfThumbnailPackage.kt']) {
      assert.equal(fs.readFileSync(path.join(temp, 'app/src/main/java/com/adriantinoco/krumer/pdf', file), 'utf8'), fs.readFileSync(`plugins/pdf-thumbnail/${file}`, 'utf8'));
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

(async () => {
  await validateExtraction();
  await validateNativePlugin();
  console.log('PDF extraction bridge and prebuild thumbnail restoration are valid.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
