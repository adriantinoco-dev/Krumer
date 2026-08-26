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
  const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  if (appConfig.expo.orientation !== 'portrait') {
    throw new Error('Non-reader screens must remain locked to portrait.');
  }
  if (!orientationSource.includes('unlockAsync()') || !orientationSource.includes('lockAsync(previousLock)')) {
    throw new Error('Reader-only orientation unlock/restore lifecycle is missing.');
  }

  console.log('Reading preferences, embedded font weights, and reader-only orientation lifecycle are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
