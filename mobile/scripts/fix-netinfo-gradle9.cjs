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

// Keep react-native-pdf page navigation inside the already loaded Android viewer.
// Version 6.7.7 feeds setPage through a prop update, whose update transaction calls
// drawPdf() and flashes while the whole document is loaded again.
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
  fs.writeFileSync(reactNativePdfIndexPath, pdfIndexSource, 'utf8');

  let pdfTypesSource = fs.readFileSync(reactNativePdfTypesPath, 'utf8').replace(/\r\n/g, '\n');
  const setPageType = '    setPage: (pageNumber: number) => void;';
  const scrollType = `${setPageType}\n    scrollByViewport: (fraction: number) => void;`;
  if (!pdfTypesSource.includes('scrollByViewport: (fraction: number) => void;')) {
    if (!pdfTypesSource.includes(setPageType)) {
      throw new Error('[react-native-pdf-navigation] Could not locate PDF ref types.');
    }
    pdfTypesSource = pdfTypesSource.replace(setPageType, scrollType);
    fs.writeFileSync(reactNativePdfTypesPath, pdfTypesSource, 'utf8');
  }

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
    fs.writeFileSync(reactNativePdfFabricComponentPath, pdfFabricSource, 'utf8');
  }

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
    ['.pageSnap(this.pageSnap)', '.pageSnap(this.pageSnap && this.scrollEnabled)'],
    ['.pageFling(this.pageFling)', '.pageFling(this.pageFling && this.scrollEnabled)'],
  ];
  for (const [originalOption, patchedOption] of pagingGestureOptions) {
    if (pdfViewSource.includes(patchedOption)) continue;
    if (!pdfViewSource.includes(originalOption)) {
      throw new Error(`[react-native-pdf-navigation] Could not locate Android paging option ${originalOption}.`);
    }
    pdfViewSource = pdfViewSource.replace(originalOption, patchedOption);
  }
  const preloadOffsetAnchor = '            Configurator configurator;';
  const paginatedPreloadOffset = [
    '            // Render only the visible page in paginated mode. The scroll mode keeps',
    '            // the library default so continuous reading remains smooth.',
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
  if (!pdfViewSource.includes('configurator.pages(this.page - 1);')) {
    if (!pdfViewSource.includes(thumbnailSinglePageBlock)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android single-page configuration.');
    }
    pdfViewSource = pdfViewSource.replace(thumbnailSinglePageBlock, isolatedSinglePageBlock);
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
  if (!pdfViewSource.includes('if (this.singlePage && targetPage != this.page)')) {
    if (!pdfViewSource.includes(androidPageSetterWithoutReload)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android navigation for isolated pages.');
    }
    pdfViewSource = pdfViewSource.replace(
      androidPageSetterWithoutReload,
      isolatedAndroidPageNavigation,
    );
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
  const originalPathSetter = `    public void setPath(String path) {
        this.path = path;
    }`;
  const resettingPathSetter = `    public void setPath(String path) {
        if (this.path == null || !this.path.equals(path)) {
            documentPageCount = 0;
        }
        this.path = path;
    }`;
  if (!pdfViewSource.includes('documentPageCount = 0;\n        }\n        this.path = path;')) {
    if (!pdfViewSource.includes(originalPathSetter)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android path setter.');
    }
    pdfViewSource = pdfViewSource.replace(originalPathSetter, resettingPathSetter);
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

  console.log(`[react-native-pdf-navigation] Patched react-native-pdf ${reactNativePdfVersion} page isolation, jumps, and viewport scrolling.`);
} else {
  console.warn('[react-native-pdf-navigation] react-native-pdf not found, skipping navigation patch.');
}
