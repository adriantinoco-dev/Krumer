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
  const models = loadTypeScriptModule('src/models/readingPreferences.ts');
  const memory = new Map();
  const storage = {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
  };
  const hooks = loadTypeScriptModule('src/readers/useReadingPreferences.ts', {
    '@react-native-async-storage/async-storage': storage,
    react: { useCallback() {}, useEffect() {}, useRef() {}, useState() {} },
    '../models/readingPreferences': models,
  });

  const defaults = await hooks.loadStoredReadingPreferences(storage);
  if (JSON.stringify(defaults) !== JSON.stringify(models.DEFAULT_READING_PREFERENCES)) {
    throw new Error('Missing preferences did not resolve to defaults.');
  }

  const expected = {
    displayMode: 'scroll',
    doubleColumn: true,
    orientation: 'landscape',
    fontFamily: 'mono',
    fontWeight: 'bold',
  };
  await hooks.saveStoredReadingPreferences(expected, storage);
  const restored = await hooks.loadStoredReadingPreferences(storage);
  if (JSON.stringify(restored) !== JSON.stringify(expected)) {
    throw new Error('Reading preferences were not restored exactly.');
  }

  memory.set('krumer.reading.preferences.v1', JSON.stringify({ ...expected, displayMode: 'invalid' }));
  const invalid = await hooks.loadStoredReadingPreferences(storage);
  if (JSON.stringify(invalid) !== JSON.stringify(models.DEFAULT_READING_PREFERENCES)) {
    throw new Error('Invalid stored preferences were not rejected.');
  }

  const legacy = { ...expected };
  delete legacy.orientation;
  memory.set('krumer.reading.preferences.v1', JSON.stringify(legacy));
  const migrated = await hooks.loadStoredReadingPreferences(storage);
  if (migrated.orientation !== 'portrait') {
    throw new Error('Legacy reading preferences did not migrate to portrait orientation.');
  }

  const fontPackages = [
    ['@expo-google-fonts/noto-serif', 'NotoSerif'],
    ['@expo-google-fonts/noto-sans', 'NotoSans'],
    ['@expo-google-fonts/noto-sans-mono', 'NotoSansMono'],
  ];
  for (const [packageName, family] of fontPackages) {
    const packageDirectory = require.resolve(`${packageName}/package.json`);
    const directory = packageDirectory.slice(0, packageDirectory.lastIndexOf('package.json'));
    for (const [folder, suffix] of [['300Light', '300Light'], ['400Regular', '400Regular'], ['500Medium', '500Medium'], ['700Bold', '700Bold']]) {
      const fontPath = `${directory}${folder}/${family}_${suffix}.ttf`;
      if (!fs.existsSync(fontPath) || fs.statSync(fontPath).size === 0) {
        throw new Error(`Missing embedded font asset: ${fontPath}`);
      }
    }
  }

  const orientationSource = fs.readFileSync('src/readers/useOrientation.ts', 'utf8');
  const readerScreenSource = fs.readFileSync('src/screens/ReaderScreen.tsx', 'utf8');
  const settingsModalSource = fs.readFileSync('src/components/ReadingSettingsModal.tsx', 'utf8');
  const settingsButtonSource = fs.readFileSync('src/components/ReadingSettingsButton.tsx', 'utf8');
  const paginationModalSource = fs.readFileSync('src/components/PaginationSettingsModal.tsx', 'utf8');
  const paginationButtonSource = fs.readFileSync('src/components/PaginationSettingsButton.tsx', 'utf8');
  const epubReaderSource = fs.readFileSync('src/readers/EpubReader.tsx', 'utf8');
  const appContextSource = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
  const appSource = fs.readFileSync('App.tsx', 'utf8');
  const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  const androidManifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  const mainActivitySource = fs.readFileSync('android/app/src/main/java/com/adriantinoco/krumer/MainActivity.kt', 'utf8');
  if (appConfig.expo.orientation !== 'portrait' || !androidManifest.includes('android:screenOrientation="unspecified"')) {
    throw new Error('The app config must default to portrait while native keeps reader orientation choices available.');
  }
  if (
    !mainActivitySource.includes('ROTATION_ANIMATION_SEAMLESS')
    || !mainActivitySource.includes('ROTATION_ANIMATION_JUMPCUT')
  ) {
    throw new Error('The Android activity must avoid crossfade frames while rotating the reader.');
  }
  if (
    !orientationSource.includes('OrientationLock.ALL')
    || !orientationSource.includes('OrientationLock.LANDSCAPE')
    || !orientationSource.includes('OrientationLock.PORTRAIT')
    || !orientationSource.includes('lockAsync(previousLock)')
    || !appSource.includes('usePortraitOrientation()')
  ) {
    throw new Error('Reader-only orientation unlock/restore lifecycle is missing.');
  }
  const hasStableReaderStatusBar = readerScreenSource.includes('<StatusBar hidden />')
    || (
      readerScreenSource.includes('hidden={isEpub || !barsVisible}')
      && readerScreenSource.includes('animated={!isEpub}')
    );
  if (
    !hasStableReaderStatusBar
    || !readerScreenSource.includes('EPUB_CHROME_VERTICAL_SCALE = ')
    || !settingsModalSource.includes('statusBarTranslucent')
    || !settingsModalSource.includes('navigationBarTranslucent')
    || !settingsButtonSource.includes('height: 36')
    || !paginationModalSource.includes('StyleSheet.absoluteFill')
    || paginationModalSource.includes('<Modal')
    || !paginationModalSource.includes('reader.orientationLandscape')
    || !paginationButtonSource.includes('height: 36')
    || !epubReaderSource.includes('androidLayerType="none"')
    || epubReaderSource.includes('renderToHardwareTextureAndroid')
    || !epubReaderSource.includes("backgroundColor: '#00000000'")
  ) {
    throw new Error('EPUB chrome or settings modal can still resize the underlying reader viewport.');
  }
  if (
    !/const EPUB_CONTENT_VERTICAL_OFFSET = \d+;/.test(readerScreenSource)
    || !readerScreenSource.includes('const epubContentVerticalInset = Math.max(insets.top, insets.bottom, 0) + EPUB_CONTENT_VERTICAL_OFFSET;')
    || !readerScreenSource.includes('windowDimensions.height - epubContentVerticalInset * 2')
    || !readerScreenSource.includes('paddingBottom: epubContentVerticalInset')
    || !readerScreenSource.includes('paddingTop: epubContentVerticalInset')
  ) {
    throw new Error('EPUB content must keep equal top and bottom safe-area spacing.');
  }
  if (
    !appContextSource.includes('const t = useCallback((key: TranslationKey) => translate(language, key), [language]);')
    || appContextSource.includes('t: (key) => translate(language, key)')
  ) {
    throw new Error('The translation callback must stay stable while book progress updates the app context.');
  }
  if (
    !appContextSource.includes('setPreferenceState(storedPreferences);\n      setPreferencesReady(true);')
    || !appSource.includes('if (!preferencesReady) return null;')
  ) {
    throw new Error('The startup loading screen must wait for the persisted theme before its first render.');
  }

  console.log('Reading preferences, startup theme hydration, stable reader context, embedded fonts, reader-only orientation, and viewport-stable chrome are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
