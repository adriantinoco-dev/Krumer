const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

const readText = (filePath) => fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

function loadTypeScriptModule(filePath, imports = {}) {
  const source = readText(filePath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function (require, module, exports) { ${compiled} })`);
  wrapper((name) => imports[name], module, module.exports);
  return module.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const types = loadTypeScriptModule('src/readers/PdfReader.types.ts');
  const state = loadTypeScriptModule('src/readers/pdf/pdfState.ts', {
    '../PdfReader.types': types,
  });
  const memory = new Map();
  const storage = {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
  };
  const preferences = loadTypeScriptModule('src/readers/pdf/usePdfPrefs.ts', {
    '@react-native-async-storage/async-storage': storage,
    '../PdfReader.types': types,
    './pdfState': state,
  });

  const defaults = await preferences.loadPdfPrefs(storage);
  assert(JSON.stringify(defaults) === JSON.stringify({ displayMode: 'paginated', orientation: 'portrait', scale: 1 }), 'Unexpected PDF defaults.');
  memory.set(types.PDF_PREF_KEYS.displayMode, 'vertical');
  memory.set(types.PDF_PREF_KEYS.orientation, 'landscape');
  memory.set(types.PDF_PREF_KEYS.zoom, '1.47');
  const migrated = await preferences.loadPdfPrefs(storage);
  assert(migrated.displayMode === 'scroll' && migrated.orientation === 'landscape' && migrated.scale === 1.45, 'Legacy PDF preferences were not normalized.');
  await preferences.savePdfDisplayMode('paginated', storage);
  await preferences.savePdfOrientation('free', storage);
  await preferences.savePdfScale(9, storage);
  assert(memory.get(types.PDF_PREF_KEYS.zoom) === '4', 'PDF scale was not clamped before persistence.');
  assert(state.clampPdfPage(0, 20) === 1 && state.clampPdfPage(99, 20) === 20, 'PDF page clamp is invalid.');
  assert(state.clampPdfScale(1.024, false) === 1.024, 'Pinch scale must preserve its actual value.');

  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  assert(!packageJson.dependencies['react-native-pdf'], 'The native PDF dependency must be removed.');
  assert(!packageJson.dependencies['react-native-blob-util'], 'The native PDF transport dependency must be removed.');
  assert(!packageLock.packages['node_modules/react-native-pdf'], 'The native PDF package must be absent from the lockfile.');
  assert(!packageLock.packages['node_modules/react-native-blob-util'], 'The native PDF transport package must be absent from the lockfile.');

  const readerSource = readText('src/readers/PdfReader.tsx');
  const readerTypesSource = readText('src/readers/PdfReader.types.ts');
  const webEngineSource = readText('src/readers/pdf/PdfWebEngine.tsx');
  const readerStartupSource = readText('src/readers/readerStartup.ts');
  const readerScreenSource = readText('src/screens/ReaderScreen.tsx');
  const settingsSource = readText('src/screens/SettingsScreen.tsx');
  const metroSource = readText('metro.config.js');
  const patchSource = readText('scripts/fix-netinfo-gradle9.cjs');

  assert(readerTypesSource.includes('export type PdfEngineHandle'), 'The WebView command contract is missing.');
  assert(!readerTypesSource.includes('PdfEngineKind') && !readerTypesSource.includes('DEFAULT_PDF_ENGINE'), 'Engine selection must not remain in the PDF contract.');
  assert(readerSource.includes('<PdfWebEngine'), 'PdfReader must mount PdfWebEngine.');
  assert(!readerSource.includes('NativePdfEngine') && !readerSource.includes('activeEngine'), 'PdfReader must not retain the native engine path.');
  assert(!readerSource.includes('fallback-native') && !readerSource.includes('engine?:'), 'PdfReader must not expose a native fallback or engine prop.');
  assert(readerSource.includes("pdfDevWarn('web:error'"), 'PDF errors must remain reported by the WebView path.');
  assert(readerSource.includes("engine: 'webview'"), 'PDF diagnostics must identify the WebView engine.');

  assert(webEngineSource.includes('export const PdfWebEngine'), 'The PDF WebView engine is missing.');
  assert(webEngineSource.includes('rangeUrl:'), 'The binary range transport must remain enabled for WebView PDFs.');
  assert(webEngineSource.includes('scrollByViewport'), 'WebView volume scrolling must remain available.');
  assert(webEngineSource.includes('cacheEnabled'), 'The PDF WebView cache must remain enabled.');
  assert(readerStartupSource.includes('preparePdfWebRuntime()'), 'PDF warmup must prepare the WebView runtime.');
  assert(!readerStartupSource.includes('loadPdfEnginePreference'), 'PDF warmup must not load an engine preference.');

  assert(!readerScreenSource.includes('usePdfEnginePreference') && !readerScreenSource.includes('engine={'), 'ReaderScreen must not select a PDF engine.');
  assert(!settingsSource.includes('pdfEngine') && !settingsSource.includes('sectionReading'), 'Settings must not expose the PDF engine section or card.');
  assert(!metroSource.includes('react-native-pdf'), 'Metro must not keep the native PDF stub.');
  assert(!patchSource.includes('react-native-pdf') && !patchSource.includes('RNPDF'), 'The Android patch script must not patch the removed native PDF package.');

  console.log('PDF reader uses the WebView engine exclusively; native engine selection, fallback, dependency, and settings card are removed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
