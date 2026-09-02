const fs = require('fs');
const path = require('path');
const typescript = require('typescript');

const mobileRoot = path.resolve(__dirname, '..');
const packagePath = path.join(mobileRoot, 'node_modules', 'pdfjs-dist', 'package.json');
const vendorRoot = path.join(mobileRoot, 'src', 'readers', 'pdf', 'web', 'vendor');
const generatedRoot = path.join(mobileRoot, 'src', 'readers', 'pdf', 'web', 'generated');
const expectedVersion = '5.5.207';
const requiredFiles = [
  'build/pdf.min.mjs',
  'build/pdf.worker.min.mjs',
  'LICENSE',
];
const requiredVendorFiles = [
  'foliate/pdf.js',
  'foliate/fixed-layout.js',
  'foliate/view.js',
  'foliate/LICENSE',
  'pdfjs-LICENSE',
  'pdfjs-text-layer.css',
  'pdfjs-annotation-layer.css',
];

if (!fs.existsSync(packagePath)) {
  throw new Error(`pdfjs-dist is not installed. Run npm install in ${mobileRoot}.`);
}

const installed = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (installed.version !== expectedVersion) {
  throw new Error(`Expected pdfjs-dist ${expectedVersion}, found ${installed.version}.`);
}

const missing = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(mobileRoot, 'node_modules', 'pdfjs-dist', relativePath)));
if (missing.length) {
  throw new Error(`pdfjs-dist is incomplete; missing: ${missing.join(', ')}`);
}

const missingVendor = requiredVendorFiles.filter((relativePath) => !fs.existsSync(path.join(vendorRoot, relativePath)));
if (missingVendor.length) {
  throw new Error(`The foliate-js WebView vendor is incomplete; missing: ${missingVendor.join(', ')}`);
}

const sourceFiles = {
  pdfjs: path.join(mobileRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.mjs'),
  worker: path.join(mobileRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
  foliatePdf: path.join(vendorRoot, 'foliate', 'pdf.js'),
  foliateFixedLayout: path.join(vendorRoot, 'foliate', 'fixed-layout.js'),
  foliateView: path.join(vendorRoot, 'foliate', 'view.js'),
  textLayerCss: path.join(vendorRoot, 'pdfjs-text-layer.css'),
  annotationLayerCss: path.join(vendorRoot, 'pdfjs-annotation-layer.css'),
};
const generated = Object.entries(sourceFiles)
  .map(([name, filePath]) => `export const PDF_WEB_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_SOURCE = ${JSON.stringify(fs.readFileSync(filePath, 'utf8'))};`)
  .join('\n');
fs.mkdirSync(generatedRoot, { recursive: true });
fs.writeFileSync(path.join(generatedRoot, 'pdfWebVendor.ts'), `${generated}\n`, 'utf8');

// Hermes intentionally does not preserve JavaScript source in
// Function.prototype.toString(); it returns a placeholder such as
// `[bytecode]`. The WebView runtime needs the gesture controller as source,
// so extract its transpiled function once during preparation and bundle the
// resulting literal instead of stringifying the Hermes function at runtime.
const runtimeSourcePath = path.join(mobileRoot, 'src', 'readers', 'pdf', 'web', 'pdfWebRuntime.ts');
const transpiledRuntime = typescript.transpileModule(fs.readFileSync(runtimeSourcePath, 'utf8'), {
  compilerOptions: {
    module: typescript.ModuleKind.ESNext,
    target: typescript.ScriptTarget.ES2020,
  },
}).outputText;

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Could not find ${functionName} in ${runtimeSourcePath}.`);
  const bodyStart = source.indexOf('{', start);
  if (bodyStart < 0) throw new Error(`Could not find the body of ${functionName}.`);
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if ((char === '\'' || char === '"' || char === '`')) {
      quote = char;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not close ${functionName}.`);
}

const gestureControllerSource = extractFunction(transpiledRuntime, 'createPdfGestureController');
const gestureControllerPath = path.join(generatedRoot, 'pdfGestureController.ts');
fs.writeFileSync(
  gestureControllerPath,
  `export const PDF_WEB_GESTURE_CONTROLLER_SOURCE = ${JSON.stringify(gestureControllerSource)};\n`,
  'utf8',
);

console.log(JSON.stringify({
  pdfjsVersion: installed.version,
  requiredFiles,
  generatedVendor: 'src/readers/pdf/web/generated/pdfWebVendor.ts',
  generatedGestureController: 'src/readers/pdf/web/generated/pdfGestureController.ts',
  foliateRepository: 'https://github.com/readest/foliate-js',
  foliateCommit: 'ca3f118269f8d78811ef17a1b147363c321273d7',
  runtime: 'PDF.js + foliate-js fixed-layout + range bridge',
}, null, 2));
