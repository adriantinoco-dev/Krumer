const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8');
}

const types = read('src/readers/PdfReader.types.ts');
const preference = read('src/readers/pdf/usePdfEnginePreference.ts');
const reader = read('src/readers/PdfReader.tsx');
const webEngine = read('src/readers/pdf/PdfWebEngine.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const manifest = read('src/readers/pdf/pdfWebRuntimeManifest.ts');
const bridge = read('src/readers/pdf/pdfWebBridge.ts');
const runtime = read('src/readers/pdf/web/pdfWebRuntime.ts');
const vendor = read('src/readers/pdf/web/generated/pdfWebVendor.ts');
const rangePatch = read('scripts/fix-pdf-webview-range.cjs');
const debug = read('src/readers/pdf/pdfDebug.ts');
const benchmark = read('scripts/benchmark-pdf-engines.cjs');
const packageJson = JSON.parse(read('package.json'));
const nativeRangeClientPath = path.join(
  'node_modules',
  'react-native-webview',
  'android',
  'src',
  'main',
  'java',
  'com',
  'reactnativecommunity',
  'webview',
  'RNCWebViewClient.java',
);

if (!types.includes("export type PdfEngineKind = 'native' | 'webview'")) {
  throw new Error('PdfEngineKind must keep native and webview values.');
}
if (!types.includes("export const DEFAULT_PDF_ENGINE: PdfEngineKind = 'native'")) {
  throw new Error('The native engine must remain the default.');
}
if (!preference.includes("krumer.pdf.engine.v1")) {
  throw new Error('The PDF engine preference key is missing.');
}
if (!preference.includes("value === 'native' || value === 'webview'")) {
  throw new Error('Unknown PDF engine preference values must be rejected.');
}
if (!preference.includes('JSON.stringify(engine)')) {
  throw new Error('The PDF engine preference must persist as a valid JSON value.');
}
if (!preference.includes('cachedPdfEngine')) {
  throw new Error('The PDF engine preference needs the same cache contract as other reader preferences.');
}
if (!reader.includes('engine = DEFAULT_PDF_ENGINE')) {
  throw new Error('PdfReader must default to the native engine.');
}
if (!reader.includes("activeEngine === 'webview'")) {
  throw new Error('PdfReader must mount the WebView engine when requested.');
}
if (!reader.includes("activeEngine === 'webview'") || !reader.includes("web:fallback-native")) {
  throw new Error('WebView failures must fall back to the native engine for the active session.');
}
if (!settings.includes("usePdfEnginePreference()")) {
  throw new Error('SettingsScreen must expose the PDF engine preference.');
}
if (!settings.includes("enabled: true") || !settings.includes("kind: 'webview'")) {
  throw new Error('The WebView engine must be selectable after Phase 2.');
}
if (packageJson.dependencies['pdfjs-dist'] !== '5.5.207') {
  throw new Error('pdfjs-dist must remain pinned to the reviewed 5.5.207 runtime.');
}
if (!manifest.includes("foliateCommit: 'ca3f118269f8d78811ef17a1b147363c321273d7'")) {
  throw new Error('The foliate-js source must remain pinned to the reviewed commit.');
}
if (!bridge.includes("PDF_WEB_BRIDGE_VERSION = 1")) {
  throw new Error('The PDF WebView bridge version is missing.');
}
if (!webEngine.includes('READ_RANGE_RESULT') || !webEngine.includes('FileMode.ReadOnly')) {
  throw new Error('The WebView engine must serve PDF.js byte ranges from the local file.');
}
if (!webEngine.includes('PDF_WEB_BINARY_RANGE_ENABLED')
  || !webEngine.includes('!binaryRangeDisabled')
  || !webEngine.includes('createPdfRangeUrl(resolvedUri)')
  || !webEngine.includes('allowFileAccessFromFileURLs={PDF_WEB_BINARY_RANGE_ENABLED}')
  || !webEngine.includes("web:binary-range-retry-bridge")
  || !webEngine.includes("message.payload.code === 'OPEN_FAILED'")) {
  throw new Error('The WebView engine must advertise the binary local range route with a bridge fallback.');
}
if (!runtime.includes('requestBinaryRange') || !runtime.includes('binaryRangeAvailable')
  || !runtime.includes('requestBridgeRange') || !runtime.includes("cache: 'no-store'")
  || !runtime.includes('Uint8Array.prototype.toHex')
  || !runtime.includes('binaryRangeTimeoutMs')
  || !runtime.includes('Promise.race([fetchPromise, timeoutPromise])')) {
  throw new Error('The PDF runtime must prefer binary range fetches and retain the bridge fallback.');
}
if (!rangePatch.includes('KRUMER_PDF_RANGE_ROUTE_START')
  || !rangePatch.includes('shouldInterceptRequest')
  || !rangePatch.includes('Content-Length')) {
  throw new Error('The Android WebView range interception patch is missing.');
}
if (fs.existsSync(nativeRangeClientPath)
  && !read(nativeRangeClientPath).includes('KRUMER_PDF_RANGE_ROUTE_START')) {
  throw new Error('The installed Android WebView client has not received the binary range patch.');
}
if (!packageJson.scripts.postinstall.includes('fix-pdf-webview-range.cjs')
  || !packageJson.scripts.android.includes('fix-pdf-webview-range.cjs')) {
  throw new Error('The Android WebView range patch must run after dependency installation.');
}
if (!bridge.includes("'SCALE_CHANGED'") || !webEngine.includes("message.type === 'SCALE_CHANGED'")) {
  throw new Error('The WebView bridge must report committed pinch scale changes.');
}
if (!bridge.includes("'RUNTIME_METRICS'") || !webEngine.includes("message.type === 'RUNTIME_METRICS'")) {
  throw new Error('The WebView bridge must expose local runtime metrics for rollout validation.');
}
if (!debug.includes('export function pdfDevMetric') || !debug.includes("JSON.stringify({")) {
  throw new Error('PDF development metrics must be emitted in a machine-readable format.');
}
if (!reader.includes("pdfDevMetric('reader:first-page-ready'")
  || !reader.includes("pdfDevMetric('reader:page-ready'")
  || !reader.includes("pdfDevMetric('reader:scale-ready'")
  || !webEngine.includes("pdfDevMetric('web:runtime-open'")) {
  throw new Error('Both PDF engines must emit comparable readiness and interaction metrics.');
}
if (!benchmark.includes('pssKb') || !benchmark.includes('pageLatencyMs')
  || !benchmark.includes('maxWebviewRatio') || !benchmark.includes('keep-webview-experimental')
  || !benchmark.includes('sampleGate') || !benchmark.includes('cpuPercent')
  || !benchmark.includes('rangeBinaryRequests') || !benchmark.includes('rangeBridgeRequests')) {
  throw new Error('The PDF engine benchmark must cover latency, PSS and the reversible decision gate.');
}
if (packageJson.scripts['benchmark:pdf-engines'] !== 'node scripts/benchmark-pdf-engines.cjs') {
  throw new Error('The PDF engine benchmark must be exposed through the mobile npm scripts.');
}
if (!runtime.includes('__KRUMER_MAKE_PDF__') || !runtime.includes('foliate-fxl')
  || !runtime.includes('__KRUMER_PDF_GO_TO__')
  || !runtime.includes('Promise.withResolvers')
  || !runtime.includes('getOrInsertComputed')
  || !runtime.includes('pinchZoom')
  || !runtime.includes('pinchEnd')
  || !runtime.includes('createPdfGestureController')
  || !runtime.includes('gestureController.attach')
  || !runtime.includes('postRuntimeMetrics')
  || !runtime.includes('runtimeRangeBytes')) {
  throw new Error('The WebView runtime must use PDF.js range loading, fixed-layout, links, and compatibility guards.');
}
if (!runtime.includes('PDF_WEB_GESTURE_CONTROLLER_SOURCE')
  || runtime.includes('createPdfGestureController.toString()')) {
  throw new Error('The WebView must inject a prebuilt gesture-controller source, not Hermes Function.toString().');
}
if (!vendor.includes('pdfjsVersion = 5.5.207')
  || !vendor.includes('PDFDataRangeTransport')
  || !vendor.includes('globalThis.__KRUMER_PDF_WORKER_URL__')
  || !vendor.includes("spread: 'none'")
  || !vendor.includes('this.#observer.observe(this)')
  || !vendor.includes('this.#scrollMode = false')
  || !vendor.includes('planScrollModePages')
  || !vendor.includes('#scrollMaxLoaded')
  || !vendor.includes('#scrollMaxConcurrent')
  || !vendor.includes('#scrollObserver')
  || !vendor.includes('MAX_CONCURRENT_PAGE_RENDERS = 2')
  || !vendor.includes('MAX_VISIBLE_CANVAS_PIXELS')
  || !vendor.includes('rangeChunkSize: 1024 * 1024')
  || !vendor.includes('renderComplete = Promise.resolve()')) {
  throw new Error('The generated WebView vendor must contain the pinned PDF.js worker/runtime.');
}

console.log('PDF engine preference and WebView runtime validation passed.');
