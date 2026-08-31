const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

function loadTypeScriptModule(filePath, imports = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function (require, module, exports) { ${compiled} })`);
  wrapper((name) => imports[name], module, module.exports);
  return module.exports;
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
  const expectedDefaults = { displayMode: 'paginated', orientation: 'portrait', scale: 1 };
  if (JSON.stringify(defaults) !== JSON.stringify(expectedDefaults)) {
    throw new Error(`Unexpected PDF defaults: ${JSON.stringify(defaults)}`);
  }

  memory.set(types.PDF_PREF_KEYS.displayMode, 'vertical');
  memory.set(types.PDF_PREF_KEYS.orientation, 'landscape');
  memory.set(types.PDF_PREF_KEYS.zoom, '1.47');
  const migrated = await preferences.loadPdfPrefs(storage);
  await Promise.resolve();
  if (migrated.displayMode !== 'scroll' || migrated.orientation !== 'landscape' || migrated.scale !== 1.45) {
    throw new Error(`Legacy PDF preferences were not normalized: ${JSON.stringify(migrated)}`);
  }
  if (memory.get(types.PDF_PREF_KEYS.displayMode) !== 'scroll') {
    throw new Error('Legacy vertical display mode was not rewritten to scroll.');
  }

  await preferences.savePdfDisplayMode('paginated', storage);
  await preferences.savePdfOrientation('free', storage);
  await preferences.savePdfScale(9, storage);
  if (
    memory.get(types.PDF_PREF_KEYS.displayMode) !== 'paginated'
    || memory.get(types.PDF_PREF_KEYS.orientation) !== 'free'
    || memory.get(types.PDF_PREF_KEYS.zoom) !== '2'
  ) {
    throw new Error('PDF preferences were not persisted with normalized values.');
  }

  if (state.clampPdfPage(0, 20) !== 1 || state.clampPdfPage(99, 20) !== 20) {
    throw new Error('PDF page clamp is invalid.');
  }
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  if (
    packageJson.dependencies['react-native-pdf'] !== '6.7.7'
    || packageLock.packages['node_modules/react-native-pdf'].version !== '6.7.7'
  ) {
    throw new Error('react-native-pdf must remain pinned to the installed 6.7.7 contract.');
  }

  const readerSource = fs.readFileSync('src/readers/PdfReader.tsx', 'utf8');
  const engineSource = fs.readFileSync('src/readers/pdf/NativePdfEngine.tsx', 'utf8');
  const debugSource = fs.readFileSync('src/readers/pdf/pdfDebug.ts', 'utf8');
  const volumeKeysSource = fs.readFileSync('src/readers/readerVolumeKeys.ts', 'utf8');
  const epubVolumeKeysSource = fs.readFileSync('src/readers/epubVolumeKeys.ts', 'utf8');
  const readerScreenSource = fs.readFileSync('src/screens/ReaderScreen.tsx', 'utf8');
  if (
    !readerSource.includes('usePdfSource(filePath)')
    || !readerSource.includes('forwardRef<PdfReaderHandle, PdfReaderProps>')
    || !readerSource.includes('<NativePdfEngine')
    || !readerSource.includes("pdfDevLog('controls:toggle-bars-tap')")
    || readerSource.includes('classifyPdfTap')
    || !readerSource.includes('onCenterTap?.();')
    || readerSource.includes('isSinglePageReady')
    || readerSource.includes('numberOfPages === 1')
  ) {
    throw new Error('PdfReader is not using the stable Phase 2 adapter contract.');
  }
  if (
    !engineSource.includes('useMemo(() => ({ cache: true, uri: resolvedUri }), [resolvedUri])')
    || !engineSource.includes("const isPaginated = displayMode === 'paginated'")
    || !engineSource.includes('enablePaging={isPaginated}')
    || !engineSource.includes('horizontal={isPaginated}')
    || !engineSource.includes('singlePage={false}')
    || !engineSource.includes('enableAnnotationRendering')
    || !engineSource.includes('onPressLink={onExternalLink}')
    || !engineSource.includes('pdfRef.current?.setPage(page)')
  ) {
    throw new Error('NativePdfEngine can regress to thumbnail mode, unstable source, or incomplete callbacks.');
  }
  if (
    !debugSource.includes("const PDF_DEBUG_TAG = '[Krumer PDF]'")
    || !debugSource.includes('if (!__DEV__) return')
    || !readerSource.includes("pdfDevWarn('reader:load-timeout'")
    || !readerSource.includes("pdfDevLog('native:page-changed-used-as-ready'")
    || !readerSource.includes("pdfDevLog('native:load-complete-after-ready'")
    || readerSource.includes("pdfDevWarn('native:page-changed-before-load-complete'")
    || !readerSource.includes('onLoadProgress={handleLoadProgress}')
    || !engineSource.includes("pdfDevLog('engine:mount'")
  ) {
    throw new Error('Development-build PDF diagnostics are incomplete or can leak into production logs.');
  }
  if (
    !readerScreenSource.includes('const handleExternalLink = useCallback')
    || !readerScreenSource.includes('onExternalLink={handleExternalLink}')
  ) {
    throw new Error('The reader shell is not receiving PDF external links through a stable callback.');
  }

  if (
    !readerScreenSource.includes('Bottom bar compartilhada pelos leitores')
    || readerScreenSource.includes('Bottom bar PDF —')
    || readerScreenSource.includes('<PdfControls')
    || !readerScreenSource.includes('<ReadingSettingsButton')
    || !readerScreenSource.includes('<PaginationSettingsButton')
    || !readerScreenSource.includes('<ListTree color={epubText}')
    || !readerScreenSource.includes('<LayoutSettingsButton')
    || !readerScreenSource.includes('<Feather color={epubText}')
    || !readerScreenSource.includes('<Sun color={epubText}')
    || readerScreenSource.includes('visible={settingsVisible && isEpub}')
    || readerScreenSource.includes('visible={paginationSettingsVisible && isEpub}')
    || readerScreenSource.includes('visible={layoutSettingsVisible && isEpub}')
    || readerScreenSource.includes('visible={bookmarksVisible && isEpub}')
    || readerScreenSource.includes('visible={tocVisible && isEpub}')
    || readerScreenSource.includes('visible={brightnessVisible && isEpub}')
    || readerScreenSource.includes('visible={notesVisible && isEpub}')
    || readerScreenSource.includes('PDF settings modal')
  ) {
    throw new Error('PDF and EPUB are not rendering the exact same toolbars and modal entry points.');
  }

  if (
    !volumeKeysSource.includes("export type ReaderVolumeDirection = 'next' | 'previous'")
    || !volumeKeysSource.includes("const EVENT_NAME = 'KrumerVolumeKey'")
    || !epubVolumeKeysSource.includes('subscribeToReaderVolumeKeys as subscribeToEpubVolumeKeys')
    || !readerSource.includes('subscribeToReaderVolumeKeys((direction)')
    || !readerSource.includes("const delta = direction === 'next' ? 1 : -1")
  ) {
    throw new Error('Volume Up/Down do not share the EPUB next/previous contract with PDF.');
  }

  console.log('PDF Phase 3 shared EPUB toolbars, modal entry points, center tap, volume navigation, and adapter are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
