const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

const read = (relativePath) => fs.readFileSync(relativePath, 'utf8').replace(/\r\n/g, '\n');

function loadTypeScriptModule(relativePath) {
  const compiled = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function (module, exports) { ${compiled} })`);
  wrapper(module, module.exports);
  return module.exports;
}

function loadRuntimeModule() {
  const source = read('src/readers/pdf/web/pdfWebRuntime.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function (require, module, exports) { ${compiled} })`);
  wrapper((name) => {
    if (name === './generated/pdfWebVendor') {
      return {
        PDF_WEB_ANNOTATION_LAYER_CSS_SOURCE: '',
        PDF_WEB_FOLIATE_FIXED_LAYOUT_SOURCE: '',
        PDF_WEB_FOLIATE_PDF_SOURCE: '',
        PDF_WEB_PDFJS_SOURCE: '',
        PDF_WEB_TEXT_LAYER_CSS_SOURCE: '',
        PDF_WEB_WORKER_SOURCE: '',
      };
    }
    if (name === './generated/pdfGestureController') {
      return {
        PDF_WEB_GESTURE_CONTROLLER_SOURCE: 'function createPdfGestureController(options) { return { attach() {}, resetFrames() {} }; }',
      };
    }
    throw new Error(`Unexpected import: ${name}`);
  }, module, module.exports);
  return module.exports;
}

async function loadFixedLayout() {
  global.HTMLElement = class HTMLElement {};
  global.ResizeObserver = class ResizeObserver {};
  global.customElements = { define() {} };
  const source = read('src/readers/pdf/web/vendor/foliate/fixed-layout.js');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function main() {
  const bridgeSource = read('src/readers/pdf/pdfWebBridge.ts');
  const engineSource = read('src/readers/pdf/PdfWebEngine.tsx');
  const runtimeSource = read('src/readers/pdf/web/pdfWebRuntime.ts');
  const fixedSource = read('src/readers/pdf/web/vendor/foliate/fixed-layout.js');
  const generatedVendorSource = read('src/readers/pdf/web/generated/pdfWebVendor.ts');
  const generatedGestureSource = read('src/readers/pdf/web/generated/pdfGestureController.ts');
  const readerScreenSource = read('src/screens/ReaderScreen.tsx');
  const benchmarkSource = read('scripts/benchmark-pdf-engines.cjs');

  assert(runtimeSource.includes('var rangeRequestTimeoutMs = 10000;'));
  assert(runtimeSource.includes('pendingRanges.size >= maxPendingRanges'));
  assert(runtimeSource.includes("pending.reject(new Error('PDF byte range read timed out.'))"));
  assert(runtimeSource.includes('clearTimeout(pending.timeout)'));
  assert(runtimeSource.includes('payload.bookId !== pending.bookId'));
  assert(runtimeSource.includes('function queueViewportScroll(fraction)'));
  assert(runtimeSource.includes('start + viewer.clientHeight * fraction'));
  assert(runtimeSource.includes('function startViewportScroll(direction)'));
  assert(runtimeSource.includes('function stopViewportScroll()'));
  assert(runtimeSource.includes('viewer.clientHeight * viewportScrollVelocity * frameMs / 1000'));
  assert(runtimeSource.includes('1 - Math.pow(0.68, frameMs / 16.667)'));
  assert(runtimeSource.includes("window.addEventListener('message', receiveMessage)"));
  assert(runtimeSource.includes("document.addEventListener('message', receiveMessage)"));
  assert(!runtimeSource.includes("viewer.scrollBy({ top: viewer.clientHeight * fraction, behavior: 'smooth' })"));
  // Run the existing 18% animation and verify release cancels every queued frame.
  const scrollFunctions = runtimeSource.slice(
    runtimeSource.indexOf('    function postVolumeScrollMetrics()'),
    runtimeSource.indexOf('    function bridgeFile(byteLength)'),
  );
  const frames = new Map();
  let nextFrame = 0;
  let now = 0;
  const scrollViewer = { scrolled: true, scrollTop: 1000, scrollHeight: 20000, clientHeight: 1000 };
  const scroll = vm.runInNewContext(`(function () {
    var viewportScrollFrame = null, viewportScrollTarget = null, viewportScrollDirection = 0;
    var viewportScrollVelocity = 0, viewportScrollLastAt = 0, volumeScrollStartedAt = 0;
    var volumeScrollFrames = 0, volumeScrollSlowFrames = 0, volumeScrollMaxFrameMs = 0;
    ${scrollFunctions}
    return { queueViewportScroll, stopViewportScroll };
  })()`, {
    viewer: scrollViewer,
    post() {},
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const tick = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    now += 16.667;
    callbacks.forEach(callback => callback(now));
  };
  scroll.queueViewportScroll(0.18);
  for (let i = 0; i < 60 && frames.size; i += 1) tick();
  assert.strictEqual(scrollViewer.scrollTop, 1180);
  scroll.queueViewportScroll(-0.18);
  scroll.queueViewportScroll(-0.18);
  for (let i = 0; i < 60 && frames.size; i += 1) tick();
  assert.strictEqual(scrollViewer.scrollTop, 820);
  scroll.queueViewportScroll(0.18);
  tick();
  scroll.stopViewportScroll();
  const stoppedTop = scrollViewer.scrollTop;
  for (let i = 0; i < 10; i += 1) tick();
  assert.strictEqual(frames.size, 0, 'Release left volume scrolling scheduled.');
  assert.strictEqual(scrollViewer.scrollTop, stoppedTop, 'Scroll drifted after release.');
  assert(runtimeSource.includes('var readyAttempts = 0;'));
  assert(runtimeSource.includes('setTimeout(announceReady, 50);'));
  assert(runtimeSource.includes("post('READY', { engine: 'pdf.js', engineVersion: '5.5.207' })"));
  assert(runtimeSource.includes('catch (_) {'));
  assert(runtimeSource.includes("RUNTIME_SCRIPT_ERROR"));
  assert(runtimeSource.includes('PDF_WEB_GESTURE_CONTROLLER_SOURCE'));
  assert(!runtimeSource.includes('createPdfGestureController.toString()'));
  assert(runtimeSource.includes('error && error.stack'));
  assert(runtimeSource.includes("openStage = 'make-pdf'"));
  assert(runtimeSource.includes("openStage + ': ' + safeMessage(error)"));

  assert(engineSource.includes('const MAX_PENDING_RANGES = 24;'));
  assert(engineSource.includes('request.generation !== openGenerationRef.current'));
  assert(engineSource.includes('message.payload.bookId !== resolvedUri'));
  assert(engineSource.includes('process.env.EXPO_PUBLIC_PDF_WEBVIEW_LAYER_TYPE'));
  assert(engineSource.includes('androidLayerType={PDF_WEB_ANDROID_LAYER_TYPE}'));
  assert(engineSource.includes('webviewRef.current?.postMessage(JSON.stringify(command))'));
  assert(engineSource.includes('handle: file.open(FileMode.ReadOnly)'));
  assert(engineSource.includes('cacheEnabled'));
  assert(!engineSource.includes('incognito'));
  assert(!engineSource.includes('injectJavaScript'));
  assert(engineSource.includes('message.payload.code'));

  assert(fixedSource.includes('#scrollMaxRetries = 3'));
  assert(fixedSource.includes("pageData.state = 'error'"));
  assert(fixedSource.includes('getScrollPageRetryDelay(pageData.retryAttempt)'));
  assert(fixedSource.includes("status.className = 'scroll-page-error-status'"));
  assert(fixedSource.includes('this.#retryScrollPage(pageData, true)'));
  assert(generatedVendorSource.includes('scroll-page-error-status'));
  assert(!generatedVendorSource.includes('outline unavailable'));
  assert(!generatedVendorSource.includes('outline parse failed'));
  assert(generatedGestureSource.includes('function createPdfGestureController(options)'));
  assert(!generatedGestureSource.includes('[bytecode]'));
  assert(!generatedVendorSource.includes('metadata unavailable'));

  assert(readerScreenSource.includes('hidden={false}'));
  assert(readerScreenSource.includes("barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'}"));
  assert(benchmarkSource.includes('--layer none'));
  assert(benchmarkSource.includes('--layer hardware'));
  assert(benchmarkSource.includes('configurationWarnings'));

  const bridge = loadTypeScriptModule('src/readers/pdf/pdfWebBridge.ts');
  const range = bridge.parsePdfWebBridgeEvent(JSON.stringify({
    version: 1,
    id: 'range-event',
    type: 'READ_RANGE',
    payload: { begin: 0, bookId: 'file:///book.pdf', end: 1024, requestId: 'range-1' },
  }));
  assert(range && range.payload.bookId === 'file:///book.pdf');
  assert.strictEqual(bridge.parsePdfWebBridgeEvent(JSON.stringify({
    version: 1,
    id: 'stale-range-event',
    type: 'READ_RANGE',
    payload: { begin: 0, end: 1024, requestId: 'range-2' },
  })), null);
  const volumeMetrics = bridge.parsePdfWebBridgeEvent(JSON.stringify({
    version: 1,
    id: 'volume-metrics',
    type: 'VOLUME_SCROLL_METRICS',
    payload: { durationMs: 1000, frames: 60, maxFrameMs: 20, slowFrames: 2 },
  }));
  assert(volumeMetrics && volumeMetrics.payload.slowFrames === 2);

  const runtime = loadRuntimeModule();
  const runtimeMarker = '<script type="module" nonce="krumer-pdf-runtime">';
  const runtimeStart = runtime.PDF_WEB_RUNTIME_HTML.lastIndexOf(runtimeMarker);
  const runtimeScriptEnd = runtime.PDF_WEB_RUNTIME_HTML.indexOf('</script>', runtimeStart);
  const runtimeScript = runtimeStart >= 0 && runtimeScriptEnd > runtimeStart
    ? runtime.PDF_WEB_RUNTIME_HTML.slice(runtimeStart + runtimeMarker.length, runtimeScriptEnd)
    : null;
  assert(runtimeScript, 'The bridge runtime script was not emitted into the WebView HTML.');
  assert.doesNotThrow(() => new Function(runtimeScript), 'The bridge runtime has invalid JavaScript.');
  const runtimeMessages = [];
  const runtimeViewer = {
    addEventListener() {},
    removeEventListener() {},
    clientHeight: 800,
    clientWidth: 480,
    scrolled: false,
  };
  const runtimeWindow = {
    addEventListener() {},
    ReactNativeWebView: {
      postMessage(value) { runtimeMessages.push(JSON.parse(value)); },
    },
  };
  const runtimeSandbox = {
    console,
    Date,
    Map,
    Math,
    Number,
    Promise,
    Set,
    document: { addEventListener() {}, getElementById: () => runtimeViewer },
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
    setTimeout,
    clearTimeout,
    window: runtimeWindow,
  };
  runtimeSandbox.globalThis = runtimeSandbox;
  runtimeWindow.globalThis = runtimeSandbox;
  assert.doesNotThrow(() => vm.runInNewContext(runtimeScript, runtimeSandbox));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert(runtimeMessages.some((message) => message.type === 'READY'), 'The runtime did not emit READY.');

  const delayedMessages = [];
  const delayedWindow = { addEventListener() {}, ReactNativeWebView: null };
  const delayedSandbox = { ...runtimeSandbox, window: delayedWindow };
  delayedSandbox.globalThis = delayedSandbox;
  vm.runInNewContext(runtimeScript, delayedSandbox);
  setTimeout(() => {
    delayedWindow.ReactNativeWebView = {
      postMessage(value) { delayedMessages.push(JSON.parse(value)); },
    };
  }, 5);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(delayedMessages.some((message) => message.type === 'READY'), 'READY was lost before the bridge became available.');

  const fixed = await loadFixedLayout();
  assert.deepStrictEqual(
    [1, 2, 3, 4, 5].map(fixed.getScrollPageRetryDelay),
    [500, 1000, 2000, 4000, 4000],
  );

  console.log('PDF range cancellation, retries, coalesced scrolling, layer A/B, and status bar are valid.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
