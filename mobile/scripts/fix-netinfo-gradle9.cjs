const fs = require('node:fs');
const path = require('node:path');

// --- NDK 27 fix (RN 0.86.x requires std::format from NDK 27+) ---
const NDK_VERSION = '27.1.12297006';
const androidBuildGradlePaths = [
  path.join(__dirname, '..', 'android', 'build.gradle'),
  path.join(__dirname, '..', 'android', 'app', 'build.gradle'),
];

for (const gradleFilePath of androidBuildGradlePaths) {
  if (!fs.existsSync(gradleFilePath)) continue;
  let content = fs.readFileSync(gradleFilePath, 'utf8');
  const original = content;
  content = content.replace(/26\.1\.10909125/g, NDK_VERSION);
  if (!content.includes(`ndkVersion "${NDK_VERSION}"`) && !content.includes(`ndkVersion = "${NDK_VERSION}"`)) {
    if (content.includes('ndkVersion')) {
      content = content.replace(/ndkVersion\s+["'].*?["']/, `ndkVersion "${NDK_VERSION}"`);
    }
  }
  content = content.replace(/cppFlags\s+"-std=c\+\+17"/g, 'cppFlags "-std=c++20"');
  content = content.replace(/cppFlags\s+"-std=c\+\+14"/g, 'cppFlags "-std=c++20"');
  if (
    gradleFilePath.endsWith('build.gradle') &&
    gradleFilePath.includes(`${path.sep}android${path.sep}build.gradle`)
  ) {
    if (!content.includes(`rootProject.ext.ndkVersion = "${NDK_VERSION}"`)) {
      content = content.replace(
        /rootProject\.ext\.ndkVersion\s*=\s*["'].*?["']/,
        `rootProject.ext.ndkVersion = "${NDK_VERSION}"`,
      );
    }
  }
  if (content !== original) {
    fs.writeFileSync(gradleFilePath, content, 'utf8');
    console.log(`[ndk-fix] Patched ${path.relative(path.join(__dirname, '..'), gradleFilePath)} -> NDK ${NDK_VERSION} / C++20`);
  }
}

const netInfoRoot = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-community',
  'netinfo',
);
const packagePath = path.join(netInfoRoot, 'package.json');
const gradlePath = path.join(netInfoRoot, 'android', 'build.gradle');

let netInfoAvailable = fs.existsSync(packagePath) && fs.existsSync(gradlePath);
if (!netInfoAvailable) {
  console.warn('[netinfo-gradle9] @react-native-community/netinfo not found, skipping netinfo patch (NDK fix already applied).');
} else {
  const netInfoVersion = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
  let gradleSource = fs.readFileSync(gradlePath, 'utf8');

  // Ensure isNewArchitectureEnabled() returns true so NetInfo generates its TurboModule codegen specs
  gradleSource = gradleSource.replace(
    /def isNewArchitectureEnabled\(\) \{[\s\S]*?\}/,
    'def isNewArchitectureEnabled() {\n  return true\n}',
  );

  // Ensure com.facebook.react plugin is applied
  if (gradleSource.includes("apply plugin: 'com.android.library'") && !gradleSource.includes("apply plugin: 'com.facebook.react'")) {
    gradleSource = gradleSource.replace(
      "apply plugin: 'com.android.library'",
      "apply plugin: 'com.android.library'\napply plugin: 'com.facebook.react'",
    );
  }

  // Add task ordering guard so generateCodegenArtifactsFromSchema runs before compile*JavaWithJavac
  const codegenTaskGuard = [
    "",
    "afterEvaluate {",
    "  if (tasks.findByName('generateCodegenArtifactsFromSchema')) {",
    "    tasks.matching { it.name.endsWith('JavaWithJavac') }.configureEach {",
    "      dependsOn('generateCodegenArtifactsFromSchema')",
    "    }",
    "  }",
    "}"
  ].join('\n');

  if (!gradleSource.includes("dependsOn('generateCodegenArtifactsFromSchema')")) {
    gradleSource += codegenTaskGuard;
  }

  fs.writeFileSync(gradlePath, gradleSource, 'utf8');
  console.log(`[netinfo-gradle9] Configured NetInfo ${netInfoVersion} codegen task ordering.`);
}

// Patch React Native 0.86.2 graphicsConversions.h C++ formatting bug (fallback if NDK 26 is still used)
const graphicsConversionsPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'ReactCommon',
  'react',
  'renderer',
  'core',
  'graphicsConversions.h',
);

if (fs.existsSync(graphicsConversionsPath)) {
  let headerContent = fs.readFileSync(graphicsConversionsPath, 'utf8');
  if (headerContent.includes('return std::format("{}%", dimension.value);')) {
    headerContent = headerContent.replace(
      'return std::format("{}%", dimension.value);',
      'return std::to_string(dimension.value) + "%";'
    );
    fs.writeFileSync(graphicsConversionsPath, headerContent, 'utf8');
    console.log('[netinfo-gradle9] Patched React Native graphicsConversions.h C++ fallback (std::format -> to_string).');
  }
}

// Keep react-native-pdf page navigation and programmatic zoom inside the already loaded
// Android viewer. Version 6.7.7 feeds prop updates through an update transaction whose
// drawPdf() call can flash or race against the Pdfium rendering thread.
const reactNativePdfRoot = path.join(__dirname, '..', 'node_modules', 'react-native-pdf');
const reactNativePdfPackagePath = path.join(reactNativePdfRoot, 'package.json');
const reactNativePdfIndexPath = path.join(reactNativePdfRoot, 'index.js');
const reactNativePdfTypesPath = path.join(reactNativePdfRoot, 'index.d.ts');
const reactNativePdfFabricComponentPath = path.join(
  reactNativePdfRoot,
  'fabric',
  'RNPDFPdfNativeComponent.js',
);
const reactNativePdfManagerPath = path.join(
  reactNativePdfRoot,
  'android',
  'src',
  'main',
  'java',
  'org',
  'wonday',
  'pdf',
  'PdfManager.java',
);
const reactNativePdfViewPath = path.join(
  reactNativePdfRoot,
  'android',
  'src',
  'main',
  'java',
  'org',
  'wonday',
  'pdf',
  'PdfView.java',
);

if (
  fs.existsSync(reactNativePdfPackagePath)
  && fs.existsSync(reactNativePdfIndexPath)
  && fs.existsSync(reactNativePdfTypesPath)
  && fs.existsSync(reactNativePdfFabricComponentPath)
  && fs.existsSync(reactNativePdfManagerPath)
  && fs.existsSync(reactNativePdfViewPath)
) {
  const reactNativePdfVersion = JSON.parse(
    fs.readFileSync(reactNativePdfPackagePath, 'utf8'),
  ).version;
  if (reactNativePdfVersion !== '6.7.7') {
    throw new Error(
      `[react-native-pdf-navigation] Unsupported react-native-pdf ${reactNativePdfVersion}; expected 6.7.7.`,
    );
  }

  let pdfIndexSource = fs.readFileSync(reactNativePdfIndexPath, 'utf8').replace(/\r\n/g, '\n');
  const paperAndFabricSetPageDispatch = `        if (!!global?.nativeFabricUIManager ) {
            if (this._root) {
                PdfViewCommands.setNativePage(
                    this._root,
                    pageNumber,
                );
            }
          } else {
            this.setNativeProps({
                page: pageNumber
            });
          }`;
  const androidCommandSetPageDispatch = `        if (this._root && (Platform.OS === 'android' || !!global?.nativeFabricUIManager)) {
            PdfViewCommands.setNativePage(
                this._root,
                pageNumber,
            );
        } else {
            this.setNativeProps({
                page: pageNumber
            });
        }`;
  if (!pdfIndexSource.includes(paperAndFabricSetPageDispatch)) {
    if (!pdfIndexSource.includes(androidCommandSetPageDispatch)) {
      throw new Error('[react-native-pdf-navigation] Could not locate setPage dispatch.');
    }
    pdfIndexSource = pdfIndexSource.replace(
      androidCommandSetPageDispatch,
      paperAndFabricSetPageDispatch,
    );
    fs.writeFileSync(reactNativePdfIndexPath, pdfIndexSource, 'utf8');
  }

  const reactNativeImportAnchor = `    requireNativeComponent
} from 'react-native';`;
  const scrollCommandImports = `    requireNativeComponent,
    UIManager,
    findNodeHandle
} from 'react-native';`;
  if (!pdfIndexSource.includes('UIManager,\n    findNodeHandle')) {
    if (!pdfIndexSource.includes(reactNativeImportAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate React Native imports.');
    }
    pdfIndexSource = pdfIndexSource.replace(reactNativeImportAnchor, scrollCommandImports);
  }
  const changeHandlerAnchor = '    _onChange = (event) => {';
  const scrollByViewportMethod = `    scrollByViewport(fraction) {
        if ((typeof fraction !== 'number') || !Number.isFinite(fraction) || fraction === 0) {
            throw new Error('Specified viewport fraction is not a finite non-zero number');
        }
        if (!this._root) return;
        if (!!global?.nativeFabricUIManager) {
            PdfViewCommands.scrollByViewport(this._root, fraction);
            return;
        }
        const reactTag = findNodeHandle(this._root);
        if (reactTag != null) {
            UIManager.dispatchViewManagerCommand(reactTag, 'scrollByViewport', [fraction]);
        }
    }

${changeHandlerAnchor}`;
  if (!pdfIndexSource.includes('    scrollByViewport(fraction) {')) {
    if (!pdfIndexSource.includes(changeHandlerAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate change handler.');
    }
    pdfIndexSource = pdfIndexSource.replace(changeHandlerAnchor, scrollByViewportMethod);
  }
  const nativeScaleMethod = `    setNativeScale(scale) {
        if ((typeof scale !== 'number') || !Number.isFinite(scale) || scale <= 0) {
            throw new Error('Specified scale is not a finite positive number');
        }
        if (!this._root) return;
        if (!!global?.nativeFabricUIManager) {
            PdfViewCommands.setNativeScale(this._root, scale);
            return;
        }
        const reactTag = findNodeHandle(this._root);
        if (reactTag != null) {
            UIManager.dispatchViewManagerCommand(reactTag, 'setNativeScale', [scale]);
        }
    }

${changeHandlerAnchor}`;
  if (!pdfIndexSource.includes('    setNativeScale(scale) {')) {
    if (!pdfIndexSource.includes(changeHandlerAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate scale command anchor.');
    }
    pdfIndexSource = pdfIndexSource.replace(changeHandlerAnchor, nativeScaleMethod);
  }
  fs.writeFileSync(reactNativePdfIndexPath, pdfIndexSource, 'utf8');

  let pdfTypesSource = fs.readFileSync(reactNativePdfTypesPath, 'utf8').replace(/\r\n/g, '\n');
  const setPageType = '    setPage: (pageNumber: number) => void;';
  const scrollType = `${setPageType}\n    scrollByViewport: (fraction: number) => void;`;
  if (!pdfTypesSource.includes('scrollByViewport: (fraction: number) => void;')) {
    if (!pdfTypesSource.includes(setPageType)) {
      throw new Error('[react-native-pdf-navigation] Could not locate PDF ref types.');
    }
    pdfTypesSource = pdfTypesSource.replace(setPageType, scrollType);
  }
  const nativeScaleTypeAnchor = '    scrollByViewport: (fraction: number) => void;';
  const nativeScaleType = `${nativeScaleTypeAnchor}\n    setNativeScale: (scale: number) => void;`;
  if (!pdfTypesSource.includes('setNativeScale: (scale: number) => void;')) {
    if (!pdfTypesSource.includes(nativeScaleTypeAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate scale ref type anchor.');
    }
    pdfTypesSource = pdfTypesSource.replace(nativeScaleTypeAnchor, nativeScaleType);
  }
  fs.writeFileSync(reactNativePdfTypesPath, pdfTypesSource, 'utf8');

  let pdfFabricSource = fs.readFileSync(reactNativePdfFabricComponentPath, 'utf8').replace(/\r\n/g, '\n');
  const nativePageCommandType = `  +setNativePage: (
    viewRef: React.ElementRef<ComponentType>,
    page: Int32,
  ) => void;`;
  const viewportScrollCommandType = `${nativePageCommandType}
  +scrollByViewport: (
    viewRef: React.ElementRef<ComponentType>,
    fraction: Float,
  ) => void;`;
  if (!pdfFabricSource.includes('+scrollByViewport: (')) {
    if (!pdfFabricSource.includes(nativePageCommandType)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Fabric PDF commands.');
    }
    pdfFabricSource = pdfFabricSource
      .replace(nativePageCommandType, viewportScrollCommandType)
      .replace("supportedCommands: ['setNativePage']", "supportedCommands: ['setNativePage', 'scrollByViewport']");
  }
  const viewportScrollCommandTypeAnchor = `  +scrollByViewport: (
    viewRef: React.ElementRef<ComponentType>,
    fraction: Float,
  ) => void;`;
  const nativeScaleCommandType = `${viewportScrollCommandTypeAnchor}
  +setNativeScale: (
    viewRef: React.ElementRef<ComponentType>,
    scale: Float,
  ) => void;`;
  if (!pdfFabricSource.includes('+setNativeScale: (')) {
    if (!pdfFabricSource.includes(viewportScrollCommandTypeAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Fabric scale command anchor.');
    }
    pdfFabricSource = pdfFabricSource
      .replace(viewportScrollCommandTypeAnchor, nativeScaleCommandType)
      .replace(
        "supportedCommands: ['setNativePage', 'scrollByViewport']",
        "supportedCommands: ['setNativePage', 'scrollByViewport', 'setNativeScale']",
      );
  }
  fs.writeFileSync(reactNativePdfFabricComponentPath, pdfFabricSource, 'utf8');

  let pdfManagerSource = fs.readFileSync(reactNativePdfManagerPath, 'utf8').replace(/\r\n/g, '\n');
  const originalNativePageCommand = `    public void setNativePage(PdfView view, int page) {
        pdfView.setPage(page);
    }`;
  const previousNativePageCommand = `    public void setNativePage(PdfView view, int page) {
        pdfView.jumpToPage(page);
    }`;
  const nativePageCommand = `    public void setNativePage(PdfView view, int page) {
        view.jumpToPage(page);
    }`;
  if (!pdfManagerSource.includes(nativePageCommand)) {
    if (pdfManagerSource.includes(previousNativePageCommand)) {
      pdfManagerSource = pdfManagerSource.replace(previousNativePageCommand, nativePageCommand);
    } else if (pdfManagerSource.includes(originalNativePageCommand)) {
      pdfManagerSource = pdfManagerSource.replace(originalNativePageCommand, nativePageCommand);
    } else {
      throw new Error('[react-native-pdf-navigation] Could not locate Android page command.');
    }
  }
  const nativeScrollCommand = `    public void scrollByViewport(PdfView view, float fraction) {
        view.scrollByViewport(fraction);
    }

`;
  if (!pdfManagerSource.includes('public void scrollByViewport(PdfView view, float fraction)')) {
    if (!pdfManagerSource.includes(nativePageCommand)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android page command anchor.');
    }
    pdfManagerSource = pdfManagerSource.replace(
      nativePageCommand,
      `${nativePageCommand}\n\n${nativeScrollCommand.trimEnd()}`,
    );
  }
  const nativeScaleCommand = `    public void setNativeScale(PdfView view, float scale) {
        view.setNativeScale(scale);
    }

`;
  if (!pdfManagerSource.includes('public void setNativeScale(PdfView view, float scale)')) {
    if (!pdfManagerSource.includes(nativeScrollCommand.trimEnd())) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android scale command anchor.');
    }
    pdfManagerSource = pdfManagerSource.replace(
      nativeScrollCommand.trimEnd(),
      `${nativeScrollCommand.trimEnd()}\n\n${nativeScaleCommand.trimEnd()}`,
    );
  }
  const nativePageReceiveCommand = `        if ("setNativePage".equals(commandId)) {
            Assertions.assertNotNull(args);
            assert args != null;
            setNativePage(root, args.getInt(0));
        }`;
  const nativePageAndScrollReceiveCommands = `${nativePageReceiveCommand} else if ("scrollByViewport".equals(commandId)) {
            Assertions.assertNotNull(args);
            assert args != null;
            scrollByViewport(root, (float) args.getDouble(0));
        }`;
  if (!pdfManagerSource.includes('"scrollByViewport".equals(commandId)')) {
    if (!pdfManagerSource.includes(nativePageReceiveCommand)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android command receiver.');
    }
    pdfManagerSource = pdfManagerSource.replace(
      nativePageReceiveCommand,
      nativePageAndScrollReceiveCommands,
    );
  }
  const nativeScrollReceiveCommand = `        } else if ("scrollByViewport".equals(commandId)) {
            Assertions.assertNotNull(args);
            assert args != null;
            scrollByViewport(root, (float) args.getDouble(0));
        }`;
  const nativeScrollAndScaleReceiveCommands = `${nativeScrollReceiveCommand} else if ("setNativeScale".equals(commandId)) {
            Assertions.assertNotNull(args);
            assert args != null;
            setNativeScale(root, (float) args.getDouble(0));
        }`;
  if (!pdfManagerSource.includes('"setNativeScale".equals(commandId)')) {
    if (!pdfManagerSource.includes(nativeScrollReceiveCommand)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android scale command receiver anchor.');
    }
    pdfManagerSource = pdfManagerSource.replace(
      nativeScrollReceiveCommand,
      nativeScrollAndScaleReceiveCommands,
    );
  }
  const originalAfterUpdate = `    public void onAfterUpdateTransaction(PdfView pdfView) {
        super.onAfterUpdateTransaction(pdfView);
        pdfView.drawPdf();
    }`;
  const guardedAfterUpdate = `    public void onAfterUpdateTransaction(PdfView pdfView) {
        super.onAfterUpdateTransaction(pdfView);
        if (pdfView.consumeSkipNextDraw()) return;
        pdfView.drawPdf();
    }`;
  if (!pdfManagerSource.includes(guardedAfterUpdate)) {
    if (!pdfManagerSource.includes(originalAfterUpdate)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android update transaction.');
    }
    pdfManagerSource = pdfManagerSource.replace(originalAfterUpdate, guardedAfterUpdate);
  }
  fs.writeFileSync(reactNativePdfManagerPath, pdfManagerSource, 'utf8');

  let pdfViewSource = fs.readFileSync(reactNativePdfViewPath, 'utf8').replace(/\r\n/g, '\n');
  const canvasImport = 'import android.graphics.Canvas;';
  const singlePageImports = `${canvasImport}
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;`;
  if (!pdfViewSource.includes('import android.graphics.pdf.PdfRenderer;')) {
    if (!pdfViewSource.includes(canvasImport)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android graphics imports.');
    }
    pdfViewSource = pdfViewSource.replace(canvasImport, singlePageImports);
  }
  const pointFImport = 'import android.graphics.PointF;';
  if (!pdfViewSource.includes(pointFImport)) {
    if (!pdfViewSource.includes(canvasImport)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android zoom import anchor.');
    }
    pdfViewSource = pdfViewSource.replace(canvasImport, `${canvasImport}\n${pointFImport}`);
  }
  const originalPageChangeReport = `        // pdf lib page start from 0, convert it to our page (start from 1)
        page = page+1;
        this.page = page;
        showLog(format("%s %s / %s", path, page, numberOfPages));

        WritableMap event = Arguments.createMap();
        event.putString("message", "pageChanged|"+page+"|"+numberOfPages);`;
  const isolatedPageChangeReport = `        int reportedPage = this.singlePage ? this.page : page + 1;
        int reportedPageCount = this.singlePage ? getDocumentPageCount(numberOfPages) : numberOfPages;
        if (!this.singlePage) {
            this.page = reportedPage;
        }
        showLog(format("%s %s / %s", path, reportedPage, reportedPageCount));

        WritableMap event = Arguments.createMap();
        event.putString("message", "pageChanged|"+reportedPage+"|"+reportedPageCount);`;
  if (!pdfViewSource.includes('int reportedPage = this.singlePage ? this.page : page + 1;')) {
    if (!pdfViewSource.includes(originalPageChangeReport)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android page-change report.');
    }
    pdfViewSource = pdfViewSource.replace(originalPageChangeReport, isolatedPageChangeReport);
  }
  const loadCompleteAnchor = `    public void loadComplete(int numberOfPages) {
        SizeF pageSize = getPageSize(0);`;
  const isolatedLoadComplete = `    public void loadComplete(int numberOfPages) {
        int reportedPageCount = this.singlePage ? getDocumentPageCount(numberOfPages) : numberOfPages;
        SizeF pageSize = getPageSize(0);`;
  if (!pdfViewSource.includes('int reportedPageCount = this.singlePage ? getDocumentPageCount(numberOfPages) : numberOfPages;\n        SizeF pageSize')) {
    if (!pdfViewSource.includes(loadCompleteAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android load report.');
    }
    pdfViewSource = pdfViewSource
      .replace(loadCompleteAnchor, isolatedLoadComplete)
      .replace('"loadComplete|"+numberOfPages+"|"+width', '"loadComplete|"+reportedPageCount+"|"+width');
  }
  const pagingGestureOptions = [
    [
      ['.pageSnap(this.pageSnap)', '.pageSnap(this.pageSnap && this.scrollEnabled)'],
      '.pageSnap(this.pageSnap && this.scrollEnabled && !this.singlePage)',
    ],
    [
      ['.pageFling(this.pageFling)', '.pageFling(this.pageFling && this.scrollEnabled)'],
      '.pageFling(this.pageFling && this.scrollEnabled && !this.singlePage)',
    ],
  ];
  for (const [originalOptions, patchedOption] of pagingGestureOptions) {
    if (pdfViewSource.includes(patchedOption)) continue;
    const originalOption = originalOptions.find((option) => pdfViewSource.includes(option));
    if (!originalOption) {
      throw new Error(`[react-native-pdf-navigation] Could not locate Android paging option ${patchedOption}.`);
    }
    pdfViewSource = pdfViewSource.replace(originalOption, patchedOption);
  }
  const disabledSinglePageSwipe = '.enableSwipe(!this.singlePage && this.scrollEnabled)';
  const enabledSinglePagePan = '.enableSwipe(this.scrollEnabled)';
  if (!pdfViewSource.includes(enabledSinglePagePan)) {
    if (!pdfViewSource.includes(disabledSinglePageSwipe)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android swipe option.');
    }
    pdfViewSource = pdfViewSource.replace(disabledSinglePageSwipe, enabledSinglePagePan);
  }
  const preloadOffsetAnchor = '            Configurator configurator;';
  const paginatedPreloadOffset = [
    '            // Keep the isolated paginated viewer tight; page changes reload only the selected page.',
    '            // Scroll mode keeps the library default so continuous reading remains smooth.',
    '            Constants.PRELOAD_OFFSET = this.enablePaging ? 0 : 20;',
    '',
    preloadOffsetAnchor,
  ].join('\n');
  if (!pdfViewSource.includes('Constants.PRELOAD_OFFSET = this.enablePaging ? 0 : 20;')) {
    if (!pdfViewSource.includes(preloadOffsetAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android viewer configurator.');
    }
    pdfViewSource = pdfViewSource.replace(preloadOffsetAnchor, paginatedPreloadOffset);
  }
  const skipDrawFieldAnchor = '    private boolean scrollEnabled = true;';
  const skipDrawField = `${skipDrawFieldAnchor}\n    private boolean skipNextDraw = false;`;
  if (!pdfViewSource.includes(skipDrawField)) {
    if (!pdfViewSource.includes(skipDrawFieldAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android viewer state.');
    }
    pdfViewSource = pdfViewSource.replace(skipDrawFieldAnchor, skipDrawField);
  }
  const skipDrawFieldWithPageCount = `${skipDrawField}
    private int documentPageCount = 0;`;
  if (!pdfViewSource.includes('private int documentPageCount = 0;')) {
    if (!pdfViewSource.includes(skipDrawField)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android isolated-page state.');
    }
    pdfViewSource = pdfViewSource.replace(skipDrawField, skipDrawFieldWithPageCount);
  }
  const viewportStateAnchor = '    private int documentPageCount = 0;';
  const legacyPreservedViewportState = `${viewportStateAnchor}
    private boolean restoreSinglePageViewport = false;
    private float preservedSinglePageZoom = 1;
    private float preservedSinglePageXOffset = 0;
    private float preservedSinglePageYOffset = 0;`;
  const preservedViewportState = `${viewportStateAnchor}
    private boolean restoreSinglePageViewport = false;
    private float preservedSinglePageZoom = 1;
    private float preservedSinglePageXOffset = 0.5f;
    private float preservedSinglePageYOffset = 0.5f;`;
  if (pdfViewSource.includes(legacyPreservedViewportState)) {
    pdfViewSource = pdfViewSource.replace(legacyPreservedViewportState, preservedViewportState);
  } else if (!pdfViewSource.includes('private boolean restoreSinglePageViewport = false;')) {
    if (!pdfViewSource.includes(viewportStateAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android viewport state.');
    }
    pdfViewSource = pdfViewSource.replace(viewportStateAnchor, preservedViewportState);
  }
  const nativeScaleStateAnchor = '    private float preservedSinglePageYOffset = 0.5f;';
  const nativeScaleState = `${nativeScaleStateAnchor}
    private static final long NATIVE_SCALE_SETTLE_DELAY_MS = 160L;
    private float pendingNativeScale = Float.NaN;
    private int nativeScaleGeneration = 0;
    private Runnable pendingNativeScaleRender = null;`;
  if (!pdfViewSource.includes('private static final long NATIVE_SCALE_SETTLE_DELAY_MS = 160L;')) {
    if (!pdfViewSource.includes(nativeScaleStateAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android zoom scheduler state.');
    }
    pdfViewSource = pdfViewSource.replace(nativeScaleStateAnchor, nativeScaleState);
  }
  const drawPdfAnchor = `    public void drawPdf() {
        showLog(format("drawPdf path:%s %s", this.path, this.page));`;
  const drawPdfWithZoomCancellation = `    public void drawPdf() {
        cancelPendingNativeScaleRender();
        showLog(format("drawPdf path:%s %s", this.path, this.page));`;
  if (!pdfViewSource.includes(drawPdfWithZoomCancellation)) {
    if (!pdfViewSource.includes(drawPdfAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android PDF opening lifecycle.');
    }
    pdfViewSource = pdfViewSource.replace(drawPdfAnchor, drawPdfWithZoomCancellation);
  }
  const attachedLifecycle = `    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (this.isRecycled())
            this.drawPdf();
    }`;
  const zoomAwareLifecycle = `${attachedLifecycle}

    @Override
    protected void onDetachedFromWindow() {
        cancelPendingNativeScaleRender();
        pendingNativeScale = Float.NaN;
        super.onDetachedFromWindow();
    }`;
  if (!pdfViewSource.includes('protected void onDetachedFromWindow()')) {
    if (!pdfViewSource.includes(attachedLifecycle)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android PDF view lifecycle.');
    }
    pdfViewSource = pdfViewSource.replace(attachedLifecycle, zoomAwareLifecycle);
  }
  const thumbnailSinglePageBlock = `            if (this.singlePage) {
                configurator.pages(this.page-1);
                setTouchesEnabled(false);
            } else {
                configurator.onTap(this);
            }`;
  const isolatedSinglePageBlock = `            if (this.singlePage) {
                configurator.pages(this.page - 1);
            }
            configurator.onTap(this);`;
  const noReloadSinglePageBlock = `            configurator.onTap(this);`;
  if (pdfViewSource.includes(isolatedSinglePageBlock)) {
    // Already isolated.
  } else if (pdfViewSource.includes(thumbnailSinglePageBlock)) {
    pdfViewSource = pdfViewSource.replace(thumbnailSinglePageBlock, isolatedSinglePageBlock);
  } else if (pdfViewSource.includes(noReloadSinglePageBlock)) {
    pdfViewSource = pdfViewSource.replace(noReloadSinglePageBlock, isolatedSinglePageBlock);
  } else if (!pdfViewSource.includes(isolatedSinglePageBlock)) {
    throw new Error('[react-native-pdf-navigation] Could not normalize Android single-page configuration.');
  }
  const originalAndroidPageSetter = `    public void setPage(int page) {
        this.page = page>1?page:1;
    }`;
  const previousAndroidPageSetter = `    public void setPage(int page) {
        this.page = page>1?page:1;
    }

    public void jumpToPage(int page) {
        int targetPage = page > 1 ? page : 1;
        this.page = targetPage;
        if (!isRecycled() && getPageCount() > 0) {
            jumpTo(targetPage - 1, false);
        }
    }`;
  const androidPageSetterWithoutReload = `    public void setPage(int page) {
        int targetPage = page > 1 ? page : 1;
        this.page = targetPage;
        if (!isRecycled() && getPageCount() > 0) {
            jumpTo(targetPage - 1, false);
            skipNextDraw = true;
        }
    }

    public void jumpToPage(int page) {
        int targetPage = page > 1 ? page : 1;
        this.page = targetPage;
        if (!isRecycled() && getPageCount() > 0) {
            jumpTo(targetPage - 1, false);
        }
    }

    public boolean consumeSkipNextDraw() {
        boolean skip = skipNextDraw;
        skipNextDraw = false;
        return skip;
    }`;
  if (
    !pdfViewSource.includes(androidPageSetterWithoutReload)
    && !pdfViewSource.includes('if (pageChanged && !isRecycled() && getPageCount() > 0)')
    && !pdfViewSource.includes('if (this.singlePage && targetPage != this.page)')
  ) {
    if (pdfViewSource.includes(previousAndroidPageSetter)) {
      pdfViewSource = pdfViewSource.replace(
        previousAndroidPageSetter,
        androidPageSetterWithoutReload,
      );
    } else if (pdfViewSource.includes(originalAndroidPageSetter)) {
      pdfViewSource = pdfViewSource.replace(
        originalAndroidPageSetter,
        androidPageSetterWithoutReload,
      );
    } else {
      throw new Error('[react-native-pdf-navigation] Could not locate Android page setter.');
    }
  }
  const isolatedAndroidPageNavigation = `    public void setPage(int page) {
        int targetPage = clampDocumentPage(page);
        boolean pageChanged = targetPage != this.page;
        this.page = targetPage;
        if (this.singlePage) {
            if (pageChanged && !isRecycled()) {
                drawPdf();
                skipNextDraw = true;
            }
            return;
        }
        if (!isRecycled() && getPageCount() > 0) {
            jumpTo(targetPage - 1, false);
            skipNextDraw = true;
        }
    }

    public void jumpToPage(int page) {
        int targetPage = clampDocumentPage(page);
        if (this.singlePage && targetPage != this.page) {
            this.page = targetPage;
            if (!isRecycled()) {
                drawPdf();
            }
            return;
        }
        this.page = targetPage;
        if (!this.singlePage && !isRecycled() && getPageCount() > 0) {
            jumpTo(targetPage - 1, false);
        }
    }

    public boolean consumeSkipNextDraw() {
        boolean skip = skipNextDraw;
        skipNextDraw = false;
        return skip;
    }`;
  const hasFinalPageNavigation = pdfViewSource.includes(
    'if (pageChanged && !isRecycled() && getPageCount() > 0)',
  );
  if (!hasFinalPageNavigation && !pdfViewSource.includes('if (this.singlePage && targetPage != this.page)')) {
    if (!pdfViewSource.includes(androidPageSetterWithoutReload)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android navigation for isolated pages.');
    }
    pdfViewSource = pdfViewSource.replace(
      androidPageSetterWithoutReload,
      isolatedAndroidPageNavigation,
    );
  }
  const isolatedSetPageReload = `            if (pageChanged && !isRecycled()) {
                drawPdf();`;
  const preservingSetPageReload = `            if (pageChanged && !isRecycled()) {
                captureSinglePageViewport();
                drawPdf();`;
  if (!hasFinalPageNavigation && !pdfViewSource.includes(preservingSetPageReload)) {
    if (!pdfViewSource.includes(isolatedSetPageReload)) {
      throw new Error('[react-native-pdf-navigation] Could not locate isolated setPage reload.');
    }
    pdfViewSource = pdfViewSource.replace(isolatedSetPageReload, preservingSetPageReload);
  }
  const isolatedJumpPageReload = `        if (this.singlePage && targetPage != this.page) {
            this.page = targetPage;`;
  const preservingJumpPageReload = `        if (this.singlePage && targetPage != this.page) {
            captureSinglePageViewport();
            this.page = targetPage;`;
  if (!hasFinalPageNavigation && !pdfViewSource.includes(preservingJumpPageReload)) {
    if (!pdfViewSource.includes(isolatedJumpPageReload)) {
      throw new Error('[react-native-pdf-navigation] Could not locate isolated jumpToPage reload.');
    }
    pdfViewSource = pdfViewSource.replace(isolatedJumpPageReload, preservingJumpPageReload);
  }
  const finalAndroidPageNavigation = `    public void setPage(int page) {
        int targetPage = clampDocumentPage(page);
        boolean pageChanged = targetPage != this.page;
        if (this.singlePage) {
            if (pageChanged && !isRecycled()) {
                cancelPendingNativeScaleRender();
                captureSinglePageViewport();
                this.page = targetPage;
                drawPdf();
                skipNextDraw = true;
            } else {
                this.page = targetPage;
            }
            return;
        }
        this.page = targetPage;
        if (pageChanged && !isRecycled() && getPageCount() > 0) {
            cancelPendingNativeScaleRender();
            jumpTo(targetPage - 1, false);
            skipNextDraw = true;
        }
    }

    public void jumpToPage(int page) {
        int targetPage = clampDocumentPage(page);
        boolean pageChanged = targetPage != this.page;
        if (this.singlePage) {
            if (pageChanged && !isRecycled()) {
                cancelPendingNativeScaleRender();
                captureSinglePageViewport();
                this.page = targetPage;
                drawPdf();
            } else {
                this.page = targetPage;
            }
            return;
        }
        this.page = targetPage;
        if (pageChanged && !isRecycled() && getPageCount() > 0) {
            cancelPendingNativeScaleRender();
            jumpTo(targetPage - 1, false);
        }
    }`;
  if (!pdfViewSource.includes(finalAndroidPageNavigation)) {
    const pageNavigationPattern = /    public void setPage\(int page\) \{[\s\S]*?    public boolean consumeSkipNextDraw\(\) \{/;
    if (!pageNavigationPattern.test(pdfViewSource)) {
      throw new Error('[react-native-pdf-navigation] Could not normalize Android page navigation.');
    }
    pdfViewSource = pdfViewSource.replace(
      pageNavigationPattern,
      `${finalAndroidPageNavigation}\n\n    public boolean consumeSkipNextDraw() {`,
    );
  }
  const pageSetterAnchor = `    // page start from 1
    public void setPage(int page) {`;
  const preservedViewportHelpers = `    private static float clampUnit(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

    private void captureSinglePageViewport() {
        if (!this.singlePage || this.isRecycled() || this.getPageCount() <= 0) return;
        this.preservedSinglePageZoom = Math.max(this.minScale, Math.min(this.maxScale, this.getZoom()));
        SizeF currentPageSize = this.getPageSize(0);
        float scaledWidth = Math.max(1f, currentPageSize.getWidth() * this.preservedSinglePageZoom);
        float scaledHeight = Math.max(1f, currentPageSize.getHeight() * this.preservedSinglePageZoom);
        this.preservedSinglePageXOffset = clampUnit(
            (-this.getCurrentXOffset() + this.getWidth() / 2f) / scaledWidth
        );
        this.preservedSinglePageYOffset = clampUnit(
            (-this.getCurrentYOffset() + this.getHeight() / 2f) / scaledHeight
        );
        this.scale = this.preservedSinglePageZoom;
        this.restoreSinglePageViewport = true;
    }

    private void restoreSinglePageViewportAfterLoad() {
        if (!this.restoreSinglePageViewport) {
            this.zoomTo(this.scale);
            return;
        }
        final float targetZoom = this.preservedSinglePageZoom;
        final float targetFocusX = this.preservedSinglePageXOffset;
        final float targetFocusY = this.preservedSinglePageYOffset;
        this.scale = targetZoom;
        this.zoomTo(targetZoom);
        SizeF targetPageSize = this.getPageSize(0);
        float targetXOffset = this.getWidth() / 2f - targetFocusX * targetPageSize.getWidth() * targetZoom;
        float targetYOffset = this.getHeight() / 2f - targetFocusY * targetPageSize.getHeight() * targetZoom;
        this.moveTo(targetXOffset, targetYOffset, true);
        this.restoreSinglePageViewport = false;
        this.post(() -> {
            if (this.isRecycled()) return;
            this.zoomTo(targetZoom);
            SizeF restoredPageSize = this.getPageSize(0);
            float restoredXOffset = this.getWidth() / 2f - targetFocusX * restoredPageSize.getWidth() * targetZoom;
            float restoredYOffset = this.getHeight() / 2f - targetFocusY * restoredPageSize.getHeight() * targetZoom;
            this.moveTo(restoredXOffset, restoredYOffset, true);
        });
    }

${pageSetterAnchor}`;
  if (!pdfViewSource.includes('private static float clampUnit(float value)')) {
    const existingViewportHelpersPattern = /    private void captureSinglePageViewport\(\) \{[\s\S]*?    \/\/ page start from 1\n    public void setPage\(int page\) \{/;
    if (existingViewportHelpersPattern.test(pdfViewSource)) {
      pdfViewSource = pdfViewSource.replace(existingViewportHelpersPattern, preservedViewportHelpers);
    } else if (!pdfViewSource.includes('private void captureSinglePageViewport()')) {
      if (!pdfViewSource.includes(pageSetterAnchor)) {
        throw new Error('[react-native-pdf-navigation] Could not locate Android page setter helpers anchor.');
      }
      pdfViewSource = pdfViewSource.replace(pageSetterAnchor, preservedViewportHelpers);
    } else {
      throw new Error('[react-native-pdf-navigation] Could not normalize Android viewport helpers.');
    }
  } else if (!pdfViewSource.includes('final float targetFocusX = this.preservedSinglePageXOffset;')) {
    throw new Error('[react-native-pdf-navigation] Android viewport helpers are only partially normalized.');
  }
  const initialZoomRestore = '        this.zoomTo(this.scale);';
  const preservedZoomRestore = '        this.restoreSinglePageViewportAfterLoad();';
  const preservedZoomRestoreWithPendingScale = `${preservedZoomRestore}
        this.applyPendingNativeScaleIfReady();`;
  if (!pdfViewSource.includes(preservedZoomRestore)) {
    if (!pdfViewSource.includes(initialZoomRestore)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android load zoom restore.');
    }
    pdfViewSource = pdfViewSource.replace(initialZoomRestore, preservedZoomRestore);
  }
  if (!pdfViewSource.includes(preservedZoomRestoreWithPendingScale)) {
    if (!pdfViewSource.includes(preservedZoomRestore)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android pending zoom restore.');
    }
    pdfViewSource = pdfViewSource.replace(preservedZoomRestore, preservedZoomRestoreWithPendingScale);
  }
  const consumeSkipDrawAnchor = `    public boolean consumeSkipNextDraw() {
        boolean skip = skipNextDraw;
        skipNextDraw = false;
        return skip;
    }`;
  const nativeViewportScroll = `${consumeSkipDrawAnchor}

    public void scrollByViewport(float fraction) {
        if (isRecycled() || getPageCount() <= 0 || !scrollEnabled || horizontal) return;
        if (Float.isNaN(fraction) || Float.isInfinite(fraction)) return;
        float limitedFraction = Math.max(-0.35f, Math.min(0.35f, fraction));
        if (limitedFraction == 0) return;
        stopFling();
        moveRelativeTo(0, -getHeight() * limitedFraction);
        setPositionOffset(getPositionOffset(), true);
    }`;
  if (!pdfViewSource.includes('public void scrollByViewport(float fraction)')) {
    if (!pdfViewSource.includes(consumeSkipDrawAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android scroll command anchor.');
    }
    pdfViewSource = pdfViewSource.replace(consumeSkipDrawAnchor, nativeViewportScroll);
  }
  const scaleSetterAnchor = `    public void setScale(float scale) {
        this.scale = scale;
    }`;
  const isolatedPageHelpers = `    private int getDocumentPageCount(int fallback) {
        if (documentPageCount > 0) return documentPageCount;
        int countedPages = countDocumentPages();
        documentPageCount = countedPages > 0 ? countedPages : fallback;
        return documentPageCount;
    }

    private int countDocumentPages() {
        try {
            ParcelFileDescriptor openedDescriptor = openDocumentDescriptor();
            if (openedDescriptor == null) return 0;
            try (ParcelFileDescriptor descriptor = openedDescriptor;
                 PdfRenderer renderer = new PdfRenderer(descriptor)) {
                return renderer.getPageCount();
            }
        } catch (Exception error) {
            Log.w("PdfView", "Could not count PDF pages for isolated rendering", error);
            return 0;
        }
    }

    private ParcelFileDescriptor openDocumentDescriptor() throws FileNotFoundException {
        if (this.path == null) return null;
        Uri uri = getURI(this.path);
        if (ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) {
            return getContext().getContentResolver().openFileDescriptor(uri, "r");
        }
        String filePath = uri.getPath();
        if (filePath == null) return null;
        return ParcelFileDescriptor.open(new File(filePath), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    private int clampDocumentPage(int requestedPage) {
        int targetPage = requestedPage > 1 ? requestedPage : 1;
        return documentPageCount > 0 ? Math.min(targetPage, documentPageCount) : targetPage;
    }

${scaleSetterAnchor}`;
  if (!pdfViewSource.includes('private int countDocumentPages()')) {
    if (!pdfViewSource.includes(scaleSetterAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android scale setter.');
    }
    pdfViewSource = pdfViewSource.replace(scaleSetterAnchor, isolatedPageHelpers);
  }
  const pageClampAnchor = `    private int clampDocumentPage(int requestedPage) {
        int targetPage = requestedPage > 1 ? requestedPage : 1;
        return documentPageCount > 0 ? Math.min(targetPage, documentPageCount) : targetPage;
    }`;
  const nativeScaleHelpers = `${pageClampAnchor}

    private void cancelPendingNativeScaleRender() {
        nativeScaleGeneration += 1;
        if (pendingNativeScaleRender == null) return;
        removeCallbacks(pendingNativeScaleRender);
        pendingNativeScaleRender = null;
    }

    private void scheduleNativeScaleRender() {
        cancelPendingNativeScaleRender();
        final int scheduledGeneration = nativeScaleGeneration;
        pendingNativeScaleRender = () -> {
            if (scheduledGeneration != nativeScaleGeneration) return;
            pendingNativeScaleRender = null;
            if (isRecycled() || getPageCount() <= 0) return;
            loadPages();
            invalidate();
        };
        postDelayed(pendingNativeScaleRender, NATIVE_SCALE_SETTLE_DELAY_MS);
    }

    private void applyPendingNativeScaleIfReady() {
        if (Float.isNaN(pendingNativeScale) || isRecycled() || getPageCount() <= 0) return;
        float targetScale = pendingNativeScale;
        pendingNativeScale = Float.NaN;
        if (Math.abs(getZoom() - targetScale) >= 0.001f) {
            stopFling();
            zoomCenteredTo(targetScale, new PointF(getWidth() / 2f, getHeight() / 2f));
            invalidate();
        }
        scheduleNativeScaleRender();
    }`;
  if (!pdfViewSource.includes('private void scheduleNativeScaleRender()')) {
    if (!pdfViewSource.includes(pageClampAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android zoom scheduler helpers anchor.');
    }
    pdfViewSource = pdfViewSource.replace(pageClampAnchor, nativeScaleHelpers);
  }
  const previousLiveScaleSetter = `    public void setScale(float scale) {
        float targetScale = scale;
        this.scale = targetScale;
        if (isRecycled()) return;
        // A live scale prop must not reload/close the document while render tasks are active.
        skipNextDraw = true;
        if (getPageCount() <= 0 || Math.abs(getZoom() - targetScale) < 0.001f) return;
        zoomCenteredTo(targetScale, new PointF(getWidth() / 2f, getHeight() / 2f));
        loadPages();
        invalidate();
    }`;
  const nativeCenteredScaleSetter = `${scaleSetterAnchor}

    public void setNativeScale(float requestedScale) {
        if (Float.isNaN(requestedScale) || Float.isInfinite(requestedScale)) return;
        float targetScale = Math.max(this.minScale, Math.min(this.maxScale, requestedScale));
        this.scale = targetScale;
        if (isRecycled() || getPageCount() <= 0) {
            pendingNativeScale = targetScale;
            return;
        }
        pendingNativeScale = Float.NaN;
        if (Math.abs(getZoom() - targetScale) < 0.001f) return;
        stopFling();
        zoomCenteredTo(targetScale, new PointF(getWidth() / 2f, getHeight() / 2f));
        invalidate();
        scheduleNativeScaleRender();
    }`;
  const immediateNativeScaleSetter = `${scaleSetterAnchor}

    public void setNativeScale(float requestedScale) {
        if (Float.isNaN(requestedScale) || Float.isInfinite(requestedScale) || isRecycled()) return;
        float targetScale = Math.max(this.minScale, Math.min(this.maxScale, requestedScale));
        this.scale = targetScale;
        if (getPageCount() <= 0 || Math.abs(getZoom() - targetScale) < 0.001f) return;
        stopFling();
        zoomCenteredTo(targetScale, new PointF(getWidth() / 2f, getHeight() / 2f));
        loadPages();
        invalidate();
    }`;
  if (pdfViewSource.includes(immediateNativeScaleSetter)) {
    pdfViewSource = pdfViewSource.replace(immediateNativeScaleSetter, nativeCenteredScaleSetter);
  } else if (!pdfViewSource.includes('public void setNativeScale(float requestedScale)')) {
    if (pdfViewSource.includes(previousLiveScaleSetter)) {
      pdfViewSource = pdfViewSource.replace(previousLiveScaleSetter, nativeCenteredScaleSetter);
    } else if (pdfViewSource.includes(scaleSetterAnchor)) {
      pdfViewSource = pdfViewSource.replace(scaleSetterAnchor, nativeCenteredScaleSetter);
    } else {
      throw new Error('[react-native-pdf-navigation] Could not locate Android native scale setter anchor.');
    }
  }
  const resettingPathSetter = `    public void setPath(String path) {
        if (this.path == null || !this.path.equals(path)) {
            cancelPendingNativeScaleRender();
            pendingNativeScale = Float.NaN;
            documentPageCount = 0;
            restoreSinglePageViewport = false;
            preservedSinglePageZoom = 1;
            preservedSinglePageXOffset = 0.5f;
            preservedSinglePageYOffset = 0.5f;
        }
        this.path = path;
    }`;
  if (!pdfViewSource.includes(resettingPathSetter)) {
    const pathSetterPattern = /    public void setPath\(String path\) \{[\s\S]*?\n    \}\n\n    private (?:static float clampUnit|void captureSinglePageViewport)/;
    const existingPathSetter = pdfViewSource.match(pathSetterPattern)?.[0];
    if (!existingPathSetter) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android path setter.');
    }
    const nextHelper = existingPathSetter.includes('private static float clampUnit')
      ? '    private static float clampUnit'
      : '    private void captureSinglePageViewport';
    pdfViewSource = pdfViewSource.replace(
      existingPathSetter,
      `${resettingPathSetter}\n\n${nextHelper}`,
    );
  }
  const originalLinkPageHandler = `    private void handlePage(int page) {
        this.jumpTo(page);
    }`;
  const isolatedLinkPageHandler = `    private void handlePage(int page) {
        if (this.singlePage) {
            this.jumpToPage(page + 1);
        } else {
            this.jumpTo(page);
        }
    }`;
  if (!pdfViewSource.includes('this.jumpToPage(page + 1);')) {
    if (!pdfViewSource.includes(originalLinkPageHandler)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android link page handler.');
    }
    pdfViewSource = pdfViewSource.replace(originalLinkPageHandler, isolatedLinkPageHandler);
  }
  fs.writeFileSync(reactNativePdfViewPath, pdfViewSource, 'utf8');

  console.log(`[react-native-pdf-navigation] Patched react-native-pdf ${reactNativePdfVersion} isolated-page panning, debounced centered zoom, and viewport scrolling.`);
} else {
  console.warn('[react-native-pdf-navigation] react-native-pdf not found, skipping navigation patch.');
}
