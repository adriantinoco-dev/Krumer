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
  const skipDrawFieldAnchor = '    private boolean scrollEnabled = true;';
  const skipDrawField = `${skipDrawFieldAnchor}\n    private boolean skipNextDraw = false;`;
  if (!pdfViewSource.includes(skipDrawField)) {
    if (!pdfViewSource.includes(skipDrawFieldAnchor)) {
      throw new Error('[react-native-pdf-navigation] Could not locate Android viewer state.');
    }
    pdfViewSource = pdfViewSource.replace(skipDrawFieldAnchor, skipDrawField);
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
  if (!pdfViewSource.includes(androidPageSetterWithoutReload)) {
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
  fs.writeFileSync(reactNativePdfViewPath, pdfViewSource, 'utf8');

  console.log(`[react-native-pdf-navigation] Patched react-native-pdf ${reactNativePdfVersion} page jumps.`);
} else {
  console.warn('[react-native-pdf-navigation] react-native-pdf not found, skipping navigation patch.');
}
