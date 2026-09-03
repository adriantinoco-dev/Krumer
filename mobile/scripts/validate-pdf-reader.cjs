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
    || memory.get(types.PDF_PREF_KEYS.zoom) !== '4'
  ) {
    throw new Error('PDF preferences were not persisted with normalized values.');
  }

  if (state.clampPdfPage(0, 20) !== 1 || state.clampPdfPage(99, 20) !== 20) {
    throw new Error('PDF page clamp is invalid.');
  }
  if (state.clampPdfScale(1.024, false) !== 1.024 || state.clampPdfScale(0.981, false) !== 0.981) {
    throw new Error('A pinch near 100% must keep its actual scale instead of snapping to 100%.');
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
  const lifecycleVolumeEvents = [];
  const stopLifecycleVolume = volumeKeys.subscribeToReaderVolumeKeyEvents((event) => {
    lifecycleVolumeEvents.push(`${event.direction}:${event.phase}:${event.repeatCount}`);
  });
  volumeListener({ direction: 'next', phase: 'press', repeatCount: 0, eventTime: 10 });
  volumeListener({ direction: 'next', phase: 'repeat', repeatCount: 1, eventTime: 20 });
  volumeListener({ direction: 'next', phase: 'release', repeatCount: 0, eventTime: 30 });
  stopLifecycleVolume();
  if (
    JSON.stringify(paginatedVolumeEvents) !== JSON.stringify(['next'])
    || JSON.stringify(scrollVolumeEvents) !== JSON.stringify(['previous', 'previous'])
    || JSON.stringify(lifecycleVolumeEvents) !== JSON.stringify([
      'next:press:0', 'next:repeat:1', 'next:release:0',
    ])
    || JSON.stringify(volumeEnabledStates) !== JSON.stringify([true, false, true, false, true, false])
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

  const readerSource = readText('src/readers/PdfReader.tsx');
  const readerTypesSource = readText('src/readers/PdfReader.types.ts');
  const engineSource = readText('src/readers/pdf/NativePdfEngine.tsx');
  const pdfUriSource = readText('src/readers/pdf/pdfUri.ts');
  const pdfSourceHookSource = readText('src/readers/pdf/usePdfSource.ts');
  const pdfPrefsSource = readText('src/readers/pdf/usePdfPrefs.ts');
  const readerStartupSource = readText('src/readers/readerStartup.ts');
  const bookDetailSource = readText('src/screens/BookDetailScreen.tsx');
  const debugSource = readText('src/readers/pdf/pdfDebug.ts');
  const nativePatchSource = readText('scripts/fix-netinfo-gradle9.cjs');
  const installedPdfIndexSource = readText('node_modules/react-native-pdf/index.js');
  const installedPdfTypesSource = readText('node_modules/react-native-pdf/index.d.ts');
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
  const volumeKeysSource = readText('src/readers/readerVolumeKeys.ts');
  const epubVolumeKeysSource = readText('src/readers/epubVolumeKeys.ts');
  const pdfBookmarksSource = readText('src/readers/usePdfBookmarks.ts');
  const readerNotesSource = readText('src/readers/useEpubNotes.ts');
  const readerScreenSource = readText('src/screens/ReaderScreen.tsx');
  const paginationModalSource = readText('src/components/PaginationSettingsModal.tsx');
  const zoomButtonSource = readText('src/components/PdfZoomButton.tsx');
  const zoomModalSource = readText('src/components/PdfZoomModal.tsx');
  const translationsSource = readText('src/i18n/translations.ts');
  const mainActivitySource = fs.readFileSync(
    'android/app/src/main/java/com/adriantinoco/krumer/MainActivity.kt',
    'utf8',
  );
  if (
    !readerTypesSource.includes('fileSize?: number;')
    || !readerSource.includes('usePdfSource(filePath, fileSize)')
    || !readerSource.includes('forwardRef<PdfReaderHandle, PdfReaderProps>')
    || !readerSource.includes('<NativePdfEngine')
    || !readerSource.includes('displayMode={displayMode}')
    || readerSource.includes('displayMode={PDF_DEFAULTS.displayMode}')
    || !readerSource.includes('onCenterTapRef.current = onCenterTap')
    || !readerSource.includes('onCenterTapRef.current?.();')
    || !readerSource.includes('const PDF_SIDE_TAP_RATIO = 0.25')
    || !readerSource.includes('const PDF_VOLUME_SCROLL_VIEWPORT_RATIO = 0.18')
    || !readerSource.includes('const handleNativeSingleTap')
    || !readerSource.includes('const handleWebSingleTap')
    || !readerSource.includes("const tapX = Platform.OS === 'android' ? x / PixelRatio.get() : x")
    || !readerSource.includes("handleTapAtX(tapX, 'quick')")
    || !readerSource.includes("handleTapAtX(x, 'webview')")
    || !readerSource.includes('onQuickTap={handleQuickTap}')
    || !readerSource.includes('if (currentScaleRef.current > PDF_DEFAULTS.scale + 0.001) return false')
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
    !pdfUriSource.includes('const cachedPdfResolutions = new ReaderLruCache<CachedPdfResolution>()')
    || !pdfUriSource.includes('const cached = cachedPdfResolutions.get(key)')
    || !pdfUriSource.includes('export function getCachedPdfUri')
    || !pdfUriSource.includes('stablePathHash(filePath)')
    || !pdfUriSource.includes('existing.size === expectedSize')
    || !pdfUriSource.includes('prunePdfCache(cacheDir, dest)')
    || pdfUriSource.includes('${Date.now()}-${safeName}')
    || !pdfSourceHookSource.includes('getCachedPdfUri(filePath, fileSize)')
    || !pdfSourceHookSource.includes('resolvePdfUri(filePath, fileSize)')
    || !pdfPrefsSource.includes('getCachedPdfPrefs')
    || !readerStartupSource.includes('resolvePdfUri(book.filePath, book.fileSize)')
    || !readerStartupSource.includes('loadPdfPrefs()')
    || !readerStartupSource.includes('export function getCachedPdfProgress')
    || !readerStartupSource.includes('export function loadPdfProgress')
    || !readerStartupSource.includes('export async function savePdfProgress')
    || !readerScreenSource.includes('await savePdfProgress(book.id, value)')
    || !bookDetailSource.includes('preloadReaderBook(defaultReaderBook, preferences.language)')
    || (readerScreenSource.match(/fileSize=\{book\.fileSize\}/g) ?? []).length < 2
  ) {
    throw new Error('PDF startup can regress to repeated copies or post-navigation preference loading.');
  }
  if (
    !engineSource.includes('useMemo(() => ({ cache: true, uri: resolvedUri }), [resolvedUri])')
    || !engineSource.includes("const isPaginated = displayMode === 'paginated'")
    || !engineSource.includes('const PDF_FIT_WIDTH = 0')
    || !engineSource.includes('const PDF_FIT_BOTH = 2')
    || !engineSource.includes('const fitPolicy = isPaginated ? PDF_FIT_BOTH : PDF_FIT_WIDTH')
    || !engineSource.includes('enablePaging={isPaginated}')
    || !engineSource.includes('fitPolicy={fitPolicy}')
    || engineSource.includes('fitPolicy={0}')
    || !engineSource.includes('horizontal={isPaginated}')
    || !engineSource.includes('initialPage: number')
    || !engineSource.includes('page={initialPage}')
    || engineSource.includes('page={currentPage}')
    || !engineSource.includes('spacing={isPaginated ? 0 : PDF_SCROLL_PAGE_SPACING}')
    || !engineSource.includes('singlePage={false}')
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
    || !engineSource.includes("scrollEnabled={Platform.OS === 'android' || !isPaginated}")
    || !engineSource.includes('minScale={PDF_DEFAULTS.minScale}')
    || !engineSource.includes('scale={scale}')
    || !engineSource.includes('singlePage={false}')
    || (!engineSource.includes('scrollByViewport: (fraction: number) => void')
      && !engineSource.includes('type PdfEngineHandle'))
    || !engineSource.includes('pdfRef.current?.scrollByViewport(fraction)')
    || (!engineSource.includes('setScale: (scale: number) => void')
      && !engineSource.includes('type PdfEngineHandle'))
    || !engineSource.includes('pdfRef.current?.setNativeScale(scale)')
  ) {
    throw new Error('PDF paginated rendering can regress in full-document navigation or zoom controls.');
  }
  const installedPageNavigationSource = installedPdfViewSource.match(
    /public void setPage\(int page\) \{[\s\S]*?public boolean consumeSkipNextDraw\(\)/,
  )?.[0] ?? '';
  if (
    !nativePatchSource.includes('[react-native-pdf-navigation]')
    || !nativePatchSource.includes('Constants.PRELOAD_OFFSET = this.enablePaging ? 0 : 20;')
    || !nativePatchSource.includes('scrollByViewport')
    || !nativePatchSource.includes('setNativeScale')
    || !nativePatchSource.includes('NATIVE_SCALE_SETTLE_DELAY_MS = 160L')
    || !nativePatchSource.includes('scheduleNativeScaleRender')
    || !nativePatchSource.includes('nativeScaleGeneration')
    || !nativePatchSource.includes('zoomCenteredTo(targetScale, new PointF(getWidth() / 2f, getHeight() / 2f));')
    || !nativePatchSource.includes('consumeSkipNextDraw')
    || !nativePatchSource.includes('captureSinglePageViewport')
    || !nativePatchSource.includes('restoreSinglePageViewportAfterLoad')
    || !nativePatchSource.includes('viewportRestoreGeneration')
    || !nativePatchSource.includes('stabilizeSinglePageViewportAfterResize')
    || !nativePatchSource.includes('"scaleChanged|"+reportedScale')
    || !installedPdfIndexSource.includes('if (!!global?.nativeFabricUIManager )')
    || !installedPdfIndexSource.includes('scrollByViewport(fraction)')
    || !installedPdfIndexSource.includes("UIManager.dispatchViewManagerCommand(reactTag, 'scrollByViewport', [fraction])")
    || installedPdfIndexSource.includes("Platform.OS === 'android' || !!global?.nativeFabricUIManager")
    || !installedPdfTypesSource.includes('scrollByViewport: (fraction: number) => void;')
    || !installedPdfIndexSource.includes('setNativeScale(scale)')
    || !installedPdfIndexSource.includes("UIManager.dispatchViewManagerCommand(reactTag, 'setNativeScale', [scale])")
    || !installedPdfTypesSource.includes('setNativeScale: (scale: number) => void;')
    || !installedPdfFabricSource.includes("supportedCommands: ['setNativePage', 'scrollByViewport', 'setNativeScale']")
    || !installedPdfManagerSource.includes('view.jumpToPage(page);')
    || !installedPdfManagerSource.includes('scrollByViewport(root, (float) args.getDouble(0));')
    || !installedPdfManagerSource.includes('setNativeScale(root, (float) args.getDouble(0));')
    || !installedPdfManagerSource.includes('if (pdfView.consumeSkipNextDraw())')
    || !installedPdfViewSource.includes('public void jumpToPage(int page)')
    || !installedPdfViewSource.includes('jumpTo(targetPage - 1, false);')
    || !installedPdfViewSource.includes('public boolean consumeSkipNextDraw()')
    || !installedPdfViewSource.includes('public void scrollByViewport(float fraction)')
    || !installedPdfViewSource.includes('public void setNativeScale(float requestedScale)')
    || !installedPdfViewSource.includes('private static final long NATIVE_SCALE_SETTLE_DELAY_MS = 160L;')
    || !installedPdfViewSource.includes('private float pendingNativeScale = Float.NaN;')
    || !installedPdfViewSource.includes('private int nativeScaleGeneration = 0;')
    || !installedPdfViewSource.includes('private int viewportRestoreGeneration = 0;')
    || !installedPdfViewSource.includes('private Runnable pendingViewportRestore = null;')
    || !installedPdfViewSource.includes('removeCallbacks(pendingNativeScaleRender);')
    || !installedPdfViewSource.includes('removeCallbacks(this.pendingViewportRestore);')
    || !installedPdfViewSource.includes('postDelayed(pendingNativeScaleRender, NATIVE_SCALE_SETTLE_DELAY_MS);')
    || !installedPdfViewSource.includes('scheduledGeneration != nativeScaleGeneration')
    || !installedPdfViewSource.includes('this.applyPendingNativeScaleIfReady();')
    || !installedPdfViewSource.includes('zoomCenteredTo(targetScale, new PointF(getWidth() / 2f, getHeight() / 2f));')
    || !installedPdfViewSource.includes('float targetScale = Math.max(this.minScale, Math.min(this.maxScale, requestedScale));')
    || !installedPdfViewSource.includes('stopFling();\n        zoomCenteredTo(targetScale')
    || !installedPdfViewSource.includes('zoomCenteredTo(targetScale, new PointF(getWidth() / 2f, getHeight() / 2f));\n        invalidate();\n        scheduleNativeScaleRender();')
    || !installedPdfViewSource.includes('cancelPendingNativeScaleRender();\n            cancelPendingViewportRestore();\n            jumpTo(targetPage - 1, false);')
    || !installedPdfViewSource.includes('cancelPendingNativeScaleRender();\n            cancelPendingViewportRestore();\n            pendingNativeScale = Float.NaN;\n            documentPageCount = 0;')
    || !installedPdfViewSource.includes('public void drawPdf() {\n        cancelPendingNativeScaleRender();')
    || !installedPdfViewSource.includes('cancelPendingNativeScaleRender();\n        cancelPendingViewportRestore();\n        showLog(format("drawPdf')
    || !installedPdfViewSource.includes('protected void onDetachedFromWindow() {\n        cancelPendingNativeScaleRender();')
    || !installedPdfViewSource.includes('cancelPendingNativeScaleRender();\n        cancelPendingViewportRestore();\n        pendingNativeScale = Float.NaN;')
    || !installedPdfViewSource.includes('moveRelativeTo(0, -getHeight() * limitedFraction);')
    || !installedPdfViewSource.includes('setPositionOffset(getPositionOffset(), true);')
    || !installedPdfViewSource.includes('case 0:\n                this.fitPolicy = FitPolicy.WIDTH;')
    || !installedPdfViewSource.includes('case 2:\n            default:\n            {\n                this.fitPolicy = FitPolicy.BOTH;')
    || !installedPdfViewSource.includes('.pageSnap(this.pageSnap && this.scrollEnabled && !this.singlePage)')
    || !installedPdfViewSource.includes('.pageFling(this.pageFling && this.scrollEnabled && !this.singlePage)')
    || !installedPdfViewSource.includes('.enableSwipe(this.scrollEnabled)')
    || installedPdfViewSource.includes('.enableSwipe(!this.singlePage && this.scrollEnabled)')
    || !installedPdfViewSource.includes('Constants.PRELOAD_OFFSET = this.enablePaging ? 0 : 20;')
    || !installedPdfViewSource.includes('private int documentPageCount = 0;')
    || !installedPdfViewSource.includes('preservedSinglePageZoom = 1;\n            preservedSinglePageXOffset = 0.5f;')
    || !installedPdfViewSource.includes('private int countDocumentPages()')
    || !installedPdfViewSource.includes('int reportedPage = this.singlePage ? this.page : page + 1;')
    || !installedPdfViewSource.includes('int reportedPageCount = this.singlePage ? getDocumentPageCount(numberOfPages) : numberOfPages;')
    || !installedPdfViewSource.includes('configurator.onTap(this);')
    || installedPdfViewSource.includes('configurator.pages(')
    || installedPdfViewSource.includes('setTouchesEnabled(false);')
    || !installedPageNavigationSource
    || installedPageNavigationSource.includes('if (this.singlePage)')
    || installedPageNavigationSource.includes('captureSinglePageViewport()')
    || installedPageNavigationSource.includes('drawPdf();')
    || !installedPageNavigationSource.includes('if (pageChanged && !isRecycled() && getPageCount() > 0)')
    || (installedPageNavigationSource.match(/jumpTo\(targetPage - 1, false\);/g) ?? []).length !== 2
    || !installedPageNavigationSource.includes('cancelPendingViewportRestore();')
    || !installedPdfViewSource.includes('private void captureSinglePageViewport()')
    || !installedPdfViewSource.includes('private static float clampUnit(float value)')
    || !installedPdfViewSource.includes('private void stabilizeSinglePageViewportAfterResize(float requestedZoom)')
    || !installedPdfViewSource.includes('this.preservedSinglePageZoom = Math.max(this.minScale, Math.min(this.maxScale, this.getZoom()));')
    || !installedPdfViewSource.includes('if (this.preservedSinglePageZoom <= 1.001f)')
    || !installedPdfViewSource.includes('this.preservedSinglePageXOffset = 0.5f;\n            this.preservedSinglePageYOffset = 0.5f;')
    || !installedPdfViewSource.includes('(-this.getCurrentXOffset() + this.getWidth() / 2f) / scaledWidth')
    || !installedPdfViewSource.includes('(-this.getCurrentYOffset() + this.getHeight() / 2f) / scaledHeight')
    || installedPdfViewSource.includes('this.preservedSinglePageXOffset = this.getCurrentXOffset();')
    || installedPdfViewSource.includes('this.preservedSinglePageYOffset = this.getCurrentYOffset();')
    || !installedPdfViewSource.includes('this.restoreSinglePageViewportAfterLoad();')
    || !installedPdfViewSource.includes('final float targetFocusX = this.preservedSinglePageXOffset;')
    || !installedPdfViewSource.includes('final int expectedGeneration = this.viewportRestoreGeneration;')
    || !installedPdfViewSource.includes('float targetXOffset = this.getWidth() / 2f - targetFocusX * targetPageSize.getWidth() * targetZoom;')
    || !installedPdfViewSource.includes('this.moveTo(targetXOffset, targetYOffset, true);')
    || !installedPdfViewSource.includes('this.pendingViewportRestore = () -> {\n            if (expectedGeneration != this.viewportRestoreGeneration) return;')
    || !installedPdfViewSource.includes('this.post(this.pendingViewportRestore);')
    || !installedPdfViewSource.includes('float reportedScale = Math.max(this.minScale, Math.min(this.maxScale, this.getZoom()));')
    || !installedPdfViewSource.includes('event.putString("message", "scaleChanged|"+reportedScale);')
    || installedPdfViewSource.includes('"scaleChanged|"+(pageWidth/originalWidth)')
    || installedPdfViewSource.includes('setTouchesEnabled(false);')
  ) {
    throw new Error('Paginated PDF can regress in native jumpTo navigation or zoom/offset preservation.');
  }
  const nativeResizeLifecycleSource = installedPdfViewSource.match(
    /protected void onSizeChanged\(int w, int h, int oldw, int oldh\) \{[\s\S]*?\n    \}\n\n    @Override\n    public void loadComplete/,
  )?.[0] ?? '';
  if (
    !nativeResizeLifecycleSource
    || !nativeResizeLifecycleSource.includes('cancelPendingViewportRestore();')
    || !nativeResizeLifecycleSource.includes('this.restoreSinglePageViewport = false;')
    || !nativeResizeLifecycleSource.includes('this.preservedSinglePageXOffset = 0.5f;')
    || !nativeResizeLifecycleSource.includes('expectedGeneration != this.viewportRestoreGeneration')
    || !nativeResizeLifecycleSource.includes('this.getWidth() != expectedWidth || this.getHeight() != expectedHeight')
    || !nativeResizeLifecycleSource.includes('stabilizeSinglePageViewportAfterResize(expectedZoom);')
  ) {
    throw new Error('Paginated PDF resize must invalidate stale restores and refit the settled native viewport.');
  }
  const nativeScaleMethodSource = installedPdfViewSource.match(
    /public void setNativeScale\(float requestedScale\) \{[\s\S]*?\n    \}/,
  )?.[0] ?? '';
  if (
    !nativeScaleMethodSource
    || nativeScaleMethodSource.includes('drawPdf(')
    || nativeScaleMethodSource.includes('loadPages(')
    || !nativeScaleMethodSource.includes('pendingNativeScale = targetScale;')
    || !nativeScaleMethodSource.includes('scheduleNativeScaleRender();')
  ) {
    throw new Error('Imperative PDF zoom must debounce rendering without drawing or reopening the document.');
  }
  if (
    !debugSource.includes("const PDF_DEBUG_TAG = '[Krumer PDF]'")
    || !debugSource.includes('if (!__DEV__) return')
    || !readerSource.includes("pdfDevWarn('reader:load-timeout'")
    || !readerSource.includes('loadActivityAtRef.current = Date.now()')
    || !readerSource.includes('PDF_LOAD_MAX_WAIT_MS')
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
    || (!readerScreenSource.includes('useOrientation(isEpub ? readingPreferences.preferences.orientation : pdfOrientation)')
      && !readerScreenSource.includes('useOrientation(isEpub ? readingPreferences.preferences.orientation : pdfOrientation, active)'))
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
    || !readerSource.includes('const interactionEnabledRef = useRef(interactionEnabled)')
    || !readerSource.includes('interactionEnabledRef.current = interactionEnabled')
    || (readerSource.match(/if \(!interactionEnabledRef\.current\)/g) ?? []).length < 3
    || readerSource.includes("<View pointerEvents={interactionEnabled ? 'auto' : 'none'} style={{ backgroundColor: theme.bg, flex: 1 }}>")
    || !readerSource.includes("pointerEvents={interactionEnabled ? 'none' : 'auto'}")
    || !readerSource.includes('collapsable={false}')
    || !readerSource.includes('style={styles.interactionBlocker}')
    || readerSource.includes('[displayMode, goToPage, interactionEnabled, viewportWidth]')
    || readerSource.includes('[handleTapAtX, interactionEnabled]')
    || readerSource.includes('[interactionEnabled, onExternalLink]')
    || !engineSource.includes('memo(forwardRef<NativePdfEngineHandle, NativePdfEngineProps>')
    || !readerScreenSource.includes("const readerNotes = useEpubNotes(book.id, isEpub ? 'epub' : 'pdf')")
    || !readerNotesSource.includes('listReaderNotes(bookId, format)')
    || !readerNotesSource.includes('createReaderNote(bookId, locator, content, pageNumber)')
    || !readerNotesSource.includes('updateReaderNote(id, content)')
    || !readerNotesSource.includes('tombstoneReaderNote(id)')
    || !readerScreenSource.includes('createPdfLocator(currentPage)')
    || !readerScreenSource.includes('const pageNumber = isEpub ? epubViewStatus?.currentPage ?? 1 : currentPage')
    || (!readerScreenSource.includes('interactionEnabled={!pdfModalVisible}')
      && !readerScreenSource.includes('interactionEnabled={active && !pdfModalVisible}'))
    || !readerScreenSource.includes('visible={!!previewNote}')
    || !readerScreenSource.includes('displayMode="paginated"')
    || !readerScreenSource.includes('initialPage={previewNote.locator.page}')
    || !readerScreenSource.includes('interactionEnabled={false}')
    || (readerScreenSource.match(/<PdfReader\b/g) ?? []).length !== 2
  ) {
    throw new Error('PDF notes can regress in CRUD persistence, page binding, preview, interaction isolation, or native-view stability.');
  }

  if (
    !readerScreenSource.includes('Bottom bar compartilhada pelos leitores')
    || readerScreenSource.includes('Bottom bar PDF —')
    || readerScreenSource.includes('<PdfControls')
    || !readerScreenSource.includes('const readerTopBarSideWidth = EPUB_TOP_BAR_SIDE_WIDTH')
    || !readerScreenSource.includes('<ReadingSettingsButton')
    || !readerScreenSource.includes('<PaginationSettingsButton')
    || !readerScreenSource.includes('<ListTree color={epubText}')
    || !readerScreenSource.includes('<LayoutSettingsButton')
    || !readerScreenSource.includes('<Feather color={epubText}')
    || !readerScreenSource.includes('<Sun color={epubText}')
    || !/\{isEpub \? \(\s*<ReadingSettingsButton/.test(readerScreenSource)
    || !/\{isEpub \? \(\s*<Pressable\s*accessibilityLabel=\{t\('reader\.topics'\)\}/.test(readerScreenSource)
    || !/\{isEpub \? \(\s*<LayoutSettingsButton/.test(readerScreenSource)
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
    !readerTypesSource.includes('getScale: () => number;')
    || !readerTypesSource.includes('setScale: (scale: number) => void;')
    || !readerSource.includes('const initialScaleRef = useRef<number>(PDF_DEFAULTS.scale)')
    || !readerSource.includes('const currentScaleRef = useRef<number>(initialScaleRef.current)')
    || !readerSource.includes('void savePdfScale(PDF_DEFAULTS.scale)')
    || !readerSource.includes('currentScaleRef.current = PDF_DEFAULTS.scale')
    || !readerSource.includes('engineRef.current?.setScale(nextScale)')
    || !readerSource.includes('onScaleChanged={handleScaleChanged}')
    || !readerSource.includes('scale={initialScaleRef.current}')
    || readerSource.includes('setScale(preferences.scale)')
    || !readerScreenSource.includes('const [pdfZoomVisible, setPdfZoomVisible]')
    || !readerScreenSource.includes('|| pdfZoomVisible')
    || !readerScreenSource.includes('<PdfZoomButton')
    || !readerScreenSource.includes('<PdfZoomModal')
    || !readerScreenSource.includes('pdfReaderRef.current?.getScale()')
    || !readerScreenSource.includes('pdfReaderRef.current?.setScale(nextScale)')
    || !readerTypesSource.includes('onScaleChange?: (scale: number) => void;')
    || !readerSource.includes('onScaleChange?.(nextScale)')
    || !readerScreenSource.includes('onScaleChange={setPdfScale}')
    || !readerScreenSource.includes('displayMode={pdfDisplayMode}')
    || !zoomModalSource.includes("'reader.zoomFitWidthHint' : 'reader.zoomFitPageHint'")
    || readerScreenSource.indexOf('<PdfZoomButton') > readerScreenSource.indexOf('<PaginationSettingsButton')
    || !zoomButtonSource.includes("t('reader.zoomSettings')")
    || !zoomModalSource.includes('PDF_DEFAULTS.scaleStep')
    || !zoomModalSource.includes('PDF_DEFAULTS.minScale')
    || !zoomModalSource.includes('PDF_DEFAULTS.maxScale')
    || !zoomModalSource.includes("BackHandler.addEventListener('hardwareBackPress'")
    || !zoomModalSource.includes('onPress={onClose}')
    || zoomModalSource.includes('<Modal')
    || !translationsSource.includes("'reader.zoomIn': 'Aumentar zoom'")
    || !translationsSource.includes("'reader.zoomOut': 'Reducir zoom'")
    || !translationsSource.includes("'reader.zoomReset': 'Reset to 100%'")
  ) {
    throw new Error('PDF zoom can regress in controls, limits, persistence, centering, or native-view stability.');
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
    || !volumeKeysSource.includes("export type ReaderVolumeKeyPhase = 'press' | 'repeat' | 'release'")
    || !volumeKeysSource.includes("const EVENT_NAME = 'KrumerVolumeKey'")
    || !volumeKeysSource.includes("value === 'next:repeat' || value === 'previous:repeat'")
    || !volumeKeysSource.includes('subscribeToReaderVolumeKeyEvents')
    || !volumeKeysSource.includes("event.phase === 'release' || (event.phase === 'repeat' && !allowRepeats)")
    || !epubVolumeKeysSource.includes('subscribeToReaderVolumeKeys as subscribeToEpubVolumeKeys')
    || !readerSource.includes('subscribeToReaderVolumeKeyEvents((event)')
    || !readerSource.includes("if (displayMode === 'scroll')")
    || !readerSource.includes('engineRef.current?.scrollByViewport(fraction)')
    || !readerSource.includes('engineRef.current?.stopViewportScroll()')
    || !readerSource.includes("pdfDevLog('controls:volume-scroll'")
    || !readerSource.includes("const delta = event.direction === 'next' ? 1 : -1")
    || !mainActivitySource.includes('event.action == KeyEvent.ACTION_DOWN || event.action == KeyEvent.ACTION_UP')
    || !mainActivitySource.includes('"release"')
    || !mainActivitySource.includes('"repeat"')
    || !mainActivitySource.includes('"press"')
    || readerSource.includes('startViewportScroll')
  ) {
    throw new Error('Volume Up/Down do not scroll continuously or preserve paginated PDF navigation.');
  }

  const volumeEffectStart = readerSource.indexOf('    let webviewScrollHeld = false;');
  const volumeEffectEnd = readerSource.indexOf('  }, [displayMode, goToPage, interactionEnabled]);', volumeEffectStart);
  const volumeEffect = readerSource.slice(volumeEffectStart, volumeEffectEnd);
  const assert = require('assert');
  const scaleCallbacks = readerSource.slice(
    readerSource.indexOf('  const getScale = useCallback('),
    readerSource.indexOf('  useImperativeHandle(ref, () => ({ getScale, goToPage, setScale })'),
  );
  const scaleRequests = [];
  const scaleControls = vm.runInNewContext(ts.transpileModule(`
    (function () {
      ${scaleCallbacks}
      return { getScale, handleScaleChanged, setScale };
    })()
  `, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, {
    useCallback: (callback) => callback,
    currentScaleRef: { current: 1 },
    pendingScaleMetricRef: { current: null },
    documentLoadedRef: { current: true },
    activeEngineRef: { current: 'webview' },
    engineRef: { current: { setScale: (scale) => scaleRequests.push(scale) } },
    clampPdfScale: state.clampPdfScale,
    PDF_DEFAULTS: types.PDF_DEFAULTS,
    onScaleChange() {},
    pdfDevMetric() {},
  });
  scaleControls.handleScaleChanged(1.024);
  assert.strictEqual(scaleControls.getScale(), 1.024);
  scaleControls.setScale(1);
  assert.deepStrictEqual(scaleRequests, [1], 'Restore was skipped after a pinch close to 100%.');
  scaleControls.handleScaleChanged(1);
  scaleControls.setScale(1);
  assert.deepStrictEqual(scaleRequests, [1, 1], 'Restore must reapply the fit even at 100%.');
  assert(!zoomModalSource.includes('disabled={Math.abs(requestedScale - PDF_DEFAULTS.scale)'),
    'The reset action must remain available to restore the page fit.');

  for (const displayMode of ['scroll', 'paginated']) {
    const steps = [];
    const pageRef = { current: 3 };
    const loadedRef = { current: true };
    let now = 1000000;
    let listener;
    let stops = 0;
    let unsubscribed = false;
    const cleanup = vm.runInNewContext(ts.transpileModule(`(function () { ${volumeEffect} })()`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, {
      displayMode,
      documentLoadedRef: loadedRef,
      activeEngineRef: { current: 'webview' },
      currentPageRef: pageRef,
      PDF_VOLUME_SCROLL_VIEWPORT_RATIO: 0.18,
      PDF_VOLUME_REPEAT_MAX_AGE_MS: 100,
      Date: { now: () => now },
      engineRef: { current: {
        scrollByViewport: (fraction, repeat = false) => steps.push({ fraction, repeat }),
        stopViewportScroll: () => { stops += 1; },
      } },
      subscribeToReaderVolumeKeyEvents: (callback) => {
        listener = callback;
        return () => { unsubscribed = true; };
      },
      goToPage: (target) => { pageRef.current = target; },
      requestAnimationFrame: (callback) => callback(),
      pdfDevLog() {},
    });
    listener({ direction: 'next', phase: 'press' });
    listener({ direction: 'next', phase: 'release' });
    assert.strictEqual(stops, 0, 'A short click must finish its existing 18% step.');
    listener({ direction: 'previous', phase: 'press', eventTime: 1000 });
    for (let repeat = 1; repeat <= 1000; repeat += 1) {
      now += 50;
      listener({ direction: 'previous', phase: 'repeat', eventTime: 1000 + repeat * 50 });
    }
    loadedRef.current = false;
    listener({ direction: 'previous', phase: 'release' });
    loadedRef.current = true;
    if (displayMode === 'scroll') {
      assert.strictEqual(steps.length, 1002, 'Hold must repeat the existing viewport step.');
      assert.deepStrictEqual(steps.slice(0, 2), [
        { fraction: 0.18, repeat: false }, { fraction: -0.18, repeat: false },
      ]);
      assert(steps.slice(2).every(step => step.fraction === -0.18 && step.repeat),
        'Each native repeat must reuse the existing 18% step.');
      assert.strictEqual(stops, 1, 'Release must stop a hold even while the document is unloading.');
      listener({ direction: 'next', phase: 'repeat' });
      listener({ direction: 'previous', phase: 'repeat' });
      assert.strictEqual(steps.length, 1002, 'A repeat after release restarted volume scrolling.');
      listener({ direction: 'next', phase: 'press', eventTime: 60000 });
      now += 500;
      listener({ direction: 'next', phase: 'repeat', eventTime: 60050 });
      assert.strictEqual(steps.length, 1003, 'A stale repeat was replayed after a stall.');
      listener({ direction: 'next', phase: 'repeat', eventTime: 60500 });
      assert.deepStrictEqual(steps.at(-1), { fraction: 0.18, repeat: true });
      listener({ direction: 'next', phase: 'repeat', eventTime: 60500 });
      assert.strictEqual(steps.length, 1004, 'A duplicate repeat crossed the bridge twice.');
      // A new press changes direction; release of the previous key cannot stop it.
      listener({ direction: 'previous', phase: 'press' });
      assert.strictEqual(stops, 2, 'A new press left the previous hold running.');
      now += 50;
      listener({ direction: 'previous', phase: 'repeat' });
      assert.deepStrictEqual(steps.at(-1), { fraction: -0.18, repeat: true },
        'Legacy repeat events must also use the existing 18% step.');
      listener({ direction: 'next', phase: 'release' });
      assert.strictEqual(stops, 2, 'Release of the previous key cancelled the new hold.');
      cleanup();
      assert.strictEqual(stops, 3, 'Reader cleanup must stop a held scroll.');
    } else {
      assert.strictEqual(pageRef.current, 3, 'Hold must not repeat paginated page turns.');
      assert.deepStrictEqual(steps, []);
      cleanup();
    }
    assert(unsubscribed);
  }

  console.log('PDF reader controls, responsive 100% fitting, native jumpTo navigation, debounced zoom, bookmarks, notes, scrolling, persistence, and adapter are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
