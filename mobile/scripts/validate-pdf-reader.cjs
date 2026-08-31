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

  let volumeListener = null;
  const volumeEnabledStates = [];
  class FakeVolumeEventEmitter {
    addListener(_eventName, listener) {
      volumeListener = listener;
      return { remove: () => { volumeListener = null; } };
    }
  }
  const volumeNativeModule = {
    addListener() {},
    removeListeners() {},
    setEnabled(value) { volumeEnabledStates.push(value); },
  };
  const volumeKeys = loadTypeScriptModule('src/readers/readerVolumeKeys.ts', {
    'react-native': {
      NativeEventEmitter: FakeVolumeEventEmitter,
      NativeModules: { KrumerVolumeKeys: volumeNativeModule },
      Platform: { OS: 'android' },
    },
  });
  const paginatedVolumeEvents = [];
  const stopPaginatedVolume = volumeKeys.subscribeToReaderVolumeKeys((direction) => {
    paginatedVolumeEvents.push(direction);
  });
  volumeListener('next');
  volumeListener('next:repeat');
  stopPaginatedVolume();
  const scrollVolumeEvents = [];
  const stopScrollVolume = volumeKeys.subscribeToReaderVolumeKeys((direction) => {
    scrollVolumeEvents.push(direction);
  }, { allowRepeats: true });
  volumeListener('previous');
  volumeListener('previous:repeat');
  stopScrollVolume();
  if (
    JSON.stringify(paginatedVolumeEvents) !== JSON.stringify(['next'])
    || JSON.stringify(scrollVolumeEvents) !== JSON.stringify(['previous', 'previous'])
    || JSON.stringify(volumeEnabledStates) !== JSON.stringify([true, false, true, false])
  ) {
    throw new Error('Volume long-press events are not isolated to repeat-enabled reader modes.');
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
  const readerTypesSource = fs.readFileSync('src/readers/PdfReader.types.ts', 'utf8');
  const engineSource = fs.readFileSync('src/readers/pdf/NativePdfEngine.tsx', 'utf8');
  const debugSource = fs.readFileSync('src/readers/pdf/pdfDebug.ts', 'utf8');
  const nativePatchSource = fs.readFileSync('scripts/fix-netinfo-gradle9.cjs', 'utf8');
  const installedPdfIndexSource = fs.readFileSync('node_modules/react-native-pdf/index.js', 'utf8');
  const installedPdfTypesSource = fs.readFileSync('node_modules/react-native-pdf/index.d.ts', 'utf8');
  const installedPdfFabricSource = fs.readFileSync(
    'node_modules/react-native-pdf/fabric/RNPDFPdfNativeComponent.js',
    'utf8',
  );
  const installedPdfManagerSource = fs.readFileSync(
    'node_modules/react-native-pdf/android/src/main/java/org/wonday/pdf/PdfManager.java',
    'utf8',
  );
  const installedPdfViewSource = fs.readFileSync(
    'node_modules/react-native-pdf/android/src/main/java/org/wonday/pdf/PdfView.java',
    'utf8',
  );
  const volumeKeysSource = fs.readFileSync('src/readers/readerVolumeKeys.ts', 'utf8');
  const epubVolumeKeysSource = fs.readFileSync('src/readers/epubVolumeKeys.ts', 'utf8');
  const pdfBookmarksSource = fs.readFileSync('src/readers/usePdfBookmarks.ts', 'utf8');
  const readerNotesSource = fs.readFileSync('src/readers/useEpubNotes.ts', 'utf8');
  const readerScreenSource = fs.readFileSync('src/screens/ReaderScreen.tsx', 'utf8');
  const paginationModalSource = fs.readFileSync('src/components/PaginationSettingsModal.tsx', 'utf8');
  const mainActivitySource = fs.readFileSync(
    'android/app/src/main/java/com/adriantinoco/krumer/MainActivity.kt',
    'utf8',
  );
  if (
    !readerSource.includes('usePdfSource(filePath)')
    || !readerSource.includes('forwardRef<PdfReaderHandle, PdfReaderProps>')
    || !readerSource.includes('<NativePdfEngine')
    || !readerSource.includes('displayMode={displayMode}')
    || readerSource.includes('displayMode={PDF_DEFAULTS.displayMode}')
    || !readerSource.includes('onCenterTapRef.current = onCenterTap')
    || !readerSource.includes('onCenterTapRef.current?.();')
    || !readerSource.includes('const PDF_SIDE_TAP_RATIO = 0.25')
    || !readerSource.includes('const PDF_VOLUME_SCROLL_VIEWPORT_RATIO = 0.18')
    || !readerSource.includes("const tapX = Platform.OS === 'android' ? x / PixelRatio.get() : x")
    || !readerSource.includes("handleTapAtX(tapX, 'quick')")
    || !readerSource.includes('onQuickTap={handleQuickTap}')
    || !readerSource.includes("if (displayMode !== 'paginated') return false")
    || !readerSource.includes('goToPage(currentPageRef.current - 1)')
    || !readerSource.includes('goToPage(currentPageRef.current + 1)')
    || !readerSource.includes("pdfDevLog('controls:toggle-bars-tap')")
    || readerSource.includes('classifyPdfTap')
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
    || !engineSource.includes('initialPage: number')
    || !engineSource.includes('page={initialPage}')
    || engineSource.includes('page={currentPage}')
    || !engineSource.includes('spacing={isPaginated ? 0 : PDF_SCROLL_PAGE_SPACING}')
    || !engineSource.includes("singlePage={Platform.OS === 'android' && isPaginated}")
    || !engineSource.includes('enableAnnotationRendering')
    || !engineSource.includes('onPressLink={onExternalLink}')
    || !engineSource.includes('pdfRef.current?.setPage(page)')
  ) {
    throw new Error('NativePdfEngine can regress to thumbnail mode, unstable source, or incomplete callbacks.');
  }
  if ((engineSource.match(/<Pdf\b/g) ?? []).length !== 1) {
    throw new Error('Continuous PDF scrolling must keep a single native viewer instance.');
  }
  if (
    !engineSource.includes('const PDF_QUICK_TAP_MAX_DURATION_MS = 240')
    || !engineSource.includes('onTouchStart={handleTouchStart}')
    || !engineSource.includes('onTouchEnd={handleTouchEnd}')
    || !engineSource.includes('onTouchCancel={handleTouchCancel}')
    || !engineSource.includes('suppressNativeTapUntilRef.current')
    || !engineSource.includes('onPageSingleTap={handleNativeSingleTap}')
    || !engineSource.includes('scrollEnabled={isPaginated ? false : true}')
    || !engineSource.includes('minScale={PDF_DEFAULTS.minScale}')
    || !engineSource.includes('scale={scale}')
    || !engineSource.includes("singlePage={Platform.OS === 'android' && isPaginated}")
    || !engineSource.includes('scrollByViewport: (fraction: number) => void')
    || !engineSource.includes('pdfRef.current?.scrollByViewport(fraction)')
  ) {
    throw new Error('PDF paginated rendering can regress to multiple pages in the viewport.');
  }
  if (
    !nativePatchSource.includes('[react-native-pdf-navigation]')
    || !nativePatchSource.includes('Constants.PRELOAD_OFFSET = this.enablePaging ? 0 : 20;')
    || !nativePatchSource.includes('scrollByViewport')
    || !nativePatchSource.includes('consumeSkipNextDraw')
    || !nativePatchSource.includes('captureSinglePageViewport')
    || !nativePatchSource.includes('restoreSinglePageViewportAfterLoad')
    || !installedPdfIndexSource.includes('if (!!global?.nativeFabricUIManager )')
    || !installedPdfIndexSource.includes('scrollByViewport(fraction)')
    || !installedPdfIndexSource.includes("UIManager.dispatchViewManagerCommand(reactTag, 'scrollByViewport', [fraction])")
    || installedPdfIndexSource.includes("Platform.OS === 'android' || !!global?.nativeFabricUIManager")
    || !installedPdfTypesSource.includes('scrollByViewport: (fraction: number) => void;')
    || !installedPdfFabricSource.includes("supportedCommands: ['setNativePage', 'scrollByViewport']")
    || !installedPdfManagerSource.includes('view.jumpToPage(page);')
    || !installedPdfManagerSource.includes('scrollByViewport(root, (float) args.getDouble(0));')
    || !installedPdfManagerSource.includes('if (pdfView.consumeSkipNextDraw())')
    || !installedPdfViewSource.includes('public void jumpToPage(int page)')
    || !installedPdfViewSource.includes('jumpTo(targetPage - 1, false);')
    || !installedPdfViewSource.includes('public boolean consumeSkipNextDraw()')
    || !installedPdfViewSource.includes('public void scrollByViewport(float fraction)')
    || !installedPdfViewSource.includes('moveRelativeTo(0, -getHeight() * limitedFraction);')
    || !installedPdfViewSource.includes('setPositionOffset(getPositionOffset(), true);')
    || !installedPdfViewSource.includes('.pageSnap(this.pageSnap && this.scrollEnabled)')
    || !installedPdfViewSource.includes('.pageFling(this.pageFling && this.scrollEnabled)')
    || !installedPdfViewSource.includes('Constants.PRELOAD_OFFSET = this.enablePaging ? 0 : 20;')
    || !installedPdfViewSource.includes('private int documentPageCount = 0;')
    || !installedPdfViewSource.includes('private int countDocumentPages()')
    || !installedPdfViewSource.includes('int reportedPage = this.singlePage ? this.page : page + 1;')
    || !installedPdfViewSource.includes('int reportedPageCount = this.singlePage ? getDocumentPageCount(numberOfPages) : numberOfPages;')
    || !installedPdfViewSource.includes('configurator.pages(this.page - 1);')
    || !installedPdfViewSource.includes('if (this.singlePage && targetPage != this.page)')
    || !installedPdfViewSource.includes('private void captureSinglePageViewport()')
    || !installedPdfViewSource.includes('this.preservedSinglePageZoom = Math.max(this.minScale, Math.min(this.maxScale, this.getZoom()));')
    || !installedPdfViewSource.includes('this.preservedSinglePageXOffset = this.getCurrentXOffset();')
    || !installedPdfViewSource.includes('this.preservedSinglePageYOffset = this.getCurrentYOffset();')
    || !installedPdfViewSource.includes('this.restoreSinglePageViewportAfterLoad();')
    || !installedPdfViewSource.includes('this.zoomTo(targetZoom);\n        this.moveTo(targetXOffset, targetYOffset, true);')
    || !installedPdfViewSource.includes('this.post(() -> {\n            if (this.isRecycled()) return;')
    || installedPdfViewSource.includes('setTouchesEnabled(false);')
  ) {
    throw new Error('Paginated PDF can regress in page isolation, native navigation, or zoom/offset preservation.');
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
    !readerScreenSource.includes('loadPdfPrefs, savePdfDisplayMode')
    || !readerScreenSource.includes('const [pdfDisplayMode, setPdfDisplayMode]')
    || !readerScreenSource.includes('const [pdfOrientation, setPdfOrientation]')
    || !readerScreenSource.includes('displayMode={pdfDisplayMode}')
    || !readerScreenSource.includes('useOrientation(isEpub ? readingPreferences.preferences.orientation : pdfOrientation)')
    || !readerScreenSource.includes('setPdfOrientation(preferences.orientation)')
    || !readerScreenSource.includes('void savePdfOrientation(patch.orientation)')
    || !readerScreenSource.includes('orientation: pdfOrientation')
    || !readerScreenSource.includes('onUpdatePreferences={updatePaginationPreferences}')
    || !readerScreenSource.includes('preferences={paginationPreferences}')
    || !readerScreenSource.includes('showColumnOptions={isEpub}')
    || !readerSource.includes("pdfDevLog('reader:display-mode-changed'")
    || !readerSource.includes('const previousViewportRef = useRef({ height: viewportHeight, width: viewportWidth })')
    || !readerSource.includes("pdfDevLog('reader:viewport-changed'")
    || !readerScreenSource.includes('const PDF_PROGRESS_SAVE_DELAY_MS = 500')
    || !readerScreenSource.includes('pendingPdfProgressRef.current = { page, total }')
  ) {
    throw new Error('PDF mode/orientation can regress in persistence, application, or current-page restoration.');
  }

  if (
    !paginationModalSource.includes('showColumnOptions?: boolean;')
    || !paginationModalSource.includes('showColumnOptions = true')
    || !paginationModalSource.includes('{showColumnOptions ? (')
    || !paginationModalSource.includes('showColumnOptions && preferences.displayMode === \'paginated\'')
    || !paginationModalSource.includes("displayMode: 'paginated'")
    || !paginationModalSource.includes("orientation: 'portrait'")
  ) {
    throw new Error('PDF pagination modal can expose column controls or lose its paginated/portrait reset.');
  }

  if (
    !pdfBookmarksSource.includes("listReaderBookmarks(bookId, 'pdf')")
    || !pdfBookmarksSource.includes('createReaderBookmark(bookId, createPdfLocator(page))')
    || !pdfBookmarksSource.includes('tombstoneReaderBookmark(id)')
    || !readerScreenSource.includes('const pdfBookmarks = usePdfBookmarks({')
    || !readerScreenSource.includes('const readerBookmarks = isEpub ? epubPersistence.bookmarks : pdfBookmarks.bookmarks')
    || !readerScreenSource.includes('const pdfReaderRef = useRef<PdfReaderHandle>(null)')
    || !readerScreenSource.includes('ref={pdfReaderRef}')
    || !readerScreenSource.includes("t('reader.pageWithNumber').replace('{0}', String(locator.page))")
    || !readerScreenSource.includes('pdfReaderRef.current?.goToPage(locator.page)')
    || !readerScreenSource.includes('? pdfBookmarks.removeBookmark')
  ) {
    throw new Error('PDF bookmarks can regress in persistence, labeling, deletion, or page navigation.');
  }

  if (
    !readerTypesSource.includes('interactionEnabled?: boolean;')
    || !readerSource.includes('interactionEnabled = true')
    || !readerSource.includes('if (!interactionEnabled) return undefined;')
    || (readerSource.match(/if \(!interactionEnabled\) return;/g) ?? []).length < 2
    || !readerSource.includes("pointerEvents={interactionEnabled ? 'auto' : 'none'}")
    || !readerScreenSource.includes("const readerNotes = useEpubNotes(book.id, isEpub ? 'epub' : 'pdf')")
    || !readerNotesSource.includes('listReaderNotes(bookId, format)')
    || !readerNotesSource.includes('createReaderNote(bookId, locator, content, pageNumber)')
    || !readerNotesSource.includes('updateReaderNote(id, content)')
    || !readerNotesSource.includes('tombstoneReaderNote(id)')
    || !readerScreenSource.includes('createPdfLocator(currentPage)')
    || !readerScreenSource.includes('const pageNumber = isEpub ? epubViewStatus?.currentPage ?? 1 : currentPage')
    || !readerScreenSource.includes('interactionEnabled={!pdfModalVisible}')
    || !readerScreenSource.includes('visible={!!previewNote}')
    || !readerScreenSource.includes('displayMode="paginated"')
    || !readerScreenSource.includes('initialPage={previewNote.locator.page}')
    || !readerScreenSource.includes('interactionEnabled={false}')
    || (readerScreenSource.match(/<PdfReader\b/g) ?? []).length !== 2
  ) {
    throw new Error('PDF notes can regress in CRUD persistence, page binding, preview, or interaction isolation.');
  }

  if (
    !readerScreenSource.includes('Bottom bar compartilhada pelos leitores')
    || readerScreenSource.includes('Bottom bar PDF —')
    || readerScreenSource.includes('<PdfControls')
    || !readerScreenSource.includes('const readerTopBarSideWidth = isEpub ? EPUB_TOP_BAR_SIDE_WIDTH : 88')
    || !readerScreenSource.includes('<ReadingSettingsButton')
    || !readerScreenSource.includes('<PaginationSettingsButton')
    || !readerScreenSource.includes('<ListTree color={epubText}')
    || !readerScreenSource.includes('<LayoutSettingsButton')
    || !readerScreenSource.includes('<Feather color={epubText}')
    || !readerScreenSource.includes('<Sun color={epubText}')
    || !readerScreenSource.includes('{isEpub ? (\n              <ReadingSettingsButton')
    || !readerScreenSource.includes('{isEpub ? (\n              <Pressable\n                accessibilityLabel={t(\'reader.topics\')}')
    || !readerScreenSource.includes('{isEpub ? (\n              <LayoutSettingsButton')
    || !readerScreenSource.includes('visible={settingsVisible && isEpub}')
    || readerScreenSource.includes('visible={paginationSettingsVisible && isEpub}')
    || !readerScreenSource.includes('visible={layoutSettingsVisible && isEpub}')
    || readerScreenSource.includes('visible={bookmarksVisible && isEpub}')
    || !readerScreenSource.includes('visible={tocVisible && isEpub}')
    || readerScreenSource.includes('visible={brightnessVisible && isEpub}')
    || readerScreenSource.includes('visible={notesVisible && isEpub}')
    || readerScreenSource.includes('PDF settings modal')
  ) {
    throw new Error('PDF controls can regress to exposing EPUB-only typography, table of contents, or layout actions.');
  }

  if (
    !readerScreenSource.includes('const available = await Brightness.isAvailableAsync()')
    || !readerScreenSource.includes('const current = await Brightness.getBrightnessAsync()')
    || !readerScreenSource.includes('Brightness.setBrightnessAsync(value)')
    || !readerScreenSource.includes('originalBrightnessUsesSystemRef.current = await Brightness.isUsingSystemBrightnessAsync()')
    || !readerScreenSource.includes('? Brightness.restoreSystemBrightnessAsync()')
    || !readerScreenSource.includes(': Brightness.setBrightnessAsync(original)')
    || readerScreenSource.includes('if (!isEpub) return;\n    let mounted = true;')
  ) {
    throw new Error('PDF brightness must initialize, apply live changes, and restore the original device state on exit.');
  }

  if (
    !volumeKeysSource.includes("export type ReaderVolumeDirection = 'next' | 'previous'")
    || !volumeKeysSource.includes("const EVENT_NAME = 'KrumerVolumeKey'")
    || !volumeKeysSource.includes("value === 'next:repeat' || value === 'previous:repeat'")
    || !volumeKeysSource.includes('event.repeated && !allowRepeats')
    || !epubVolumeKeysSource.includes('subscribeToReaderVolumeKeys as subscribeToEpubVolumeKeys')
    || !readerSource.includes('subscribeToReaderVolumeKeys((direction)')
    || !readerSource.includes("}, { allowRepeats: displayMode === 'scroll' })")
    || !readerSource.includes("if (displayMode === 'scroll')")
    || !readerSource.includes('engineRef.current?.scrollByViewport(fraction)')
    || !readerSource.includes("pdfDevLog('controls:volume-scroll'")
    || !readerSource.includes("const delta = direction === 'next' ? 1 : -1")
    || !mainActivitySource.includes('if (event.action == KeyEvent.ACTION_DOWN)')
    || mainActivitySource.includes('event.repeatCount == 0')
    || !mainActivitySource.includes('if (event.repeatCount > 0) "$direction:repeat" else direction')
  ) {
    throw new Error('Volume Up/Down do not scroll continuously or preserve paginated PDF navigation.');
  }

  console.log('PDF reader controls, bookmarks, notes, preview isolation, scrolling, persistence, and adapter are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
