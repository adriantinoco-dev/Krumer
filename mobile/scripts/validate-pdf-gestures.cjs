const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

function loadRuntimeModule() {
  const source = fs.readFileSync('src/readers/pdf/web/pdfWebRuntime.ts', 'utf8');
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

class FakeTarget {
  constructor({ frame = null, nodeType = 1 } = {}) {
    this.defaultView = frame ? { frameElement: frame } : null;
    this.listeners = new Map();
    this.nodeType = nodeType;
    this.selection = '';
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }

  dispatch(type, event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  getSelection() {
    return {
      removeAllRanges: () => { this.selection = ''; },
      toString: () => this.selection,
    };
  }
}

function pointerEvent(pointerId, clientX, clientY, target) {
  return {
    button: 0,
    cancelable: true,
    clientX,
    clientY,
    pointerId,
    target,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const { createPdfGestureController, PDF_WEB_RUNTIME_HTML } = loadRuntimeModule();
  assert(PDF_WEB_RUNTIME_HTML.includes('function createPdfGestureController(options)')
    && !PDF_WEB_RUNTIME_HTML.includes('function createPdfGestureController(options: any)'),
  'The injected gesture controller was not emitted as executable JavaScript.');
  let clock = 1_000;
  let scale = 1;
  let currentPage = 3;
  const frames = [];
  const posts = [];
  const pans = [];
  const pinchPreviews = [];
  const pinchEnds = [];
  const commits = [];
  const navigation = [];
  const viewer = new FakeTarget();
  viewer.clientHeight = 800;
  viewer.clientWidth = 400;
  viewer.rtl = false;
  viewer.scrolled = false;
  viewer.getBoundingClientRect = () => ({ left: 0, top: 0 });
  viewer.pan = (dx, dy) => pans.push({ dx, dy });
  viewer.pinchZoom = (ratio, focal) => pinchPreviews.push({ focal, ratio });
  viewer.pinchEnd = (focal) => pinchEnds.push(focal);
  viewer.next = () => navigation.push('next');
  viewer.prev = () => navigation.push('previous');

  const flushFrames = () => {
    while (frames.length) frames.shift()(clock);
  };
  const controller = createPdfGestureController({
    viewer,
    post: (type, payload) => posts.push({ payload, type }),
    clampScale: (value) => Math.max(0.5, Math.min(4, value)),
    getScale: () => scale,
    getCurrentPage: () => currentPage,
    commitScale: (value, gestureMs) => {
      scale = value;
      commits.push({ gestureMs, value });
    },
    now: () => clock,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame: () => {},
  });
  controller.attach(viewer, { root: true });

  const frame = { getBoundingClientRect: () => ({ left: 20, top: 30 }) };
  const doc = new FakeTarget({ frame, nodeType: 9 });
  controller.attach(doc, { doc, frame, index: 2 });
  const plainTarget = {
    closest: () => null,
    releasePointerCapture() {},
    setPointerCapture() {},
  };

  doc.dispatch('pointerdown', pointerEvent(1, 30, 40, plainTarget));
  clock += 40;
  doc.dispatch('pointerup', pointerEvent(1, 30, 40, plainTarget));
  assert(posts.length === 1 && posts[0].type === 'SINGLE_TAP', 'A simple tap was not emitted exactly once.');
  assert(posts[0].payload.page === 3 && posts[0].payload.x === 50 && posts[0].payload.y === 70,
    'Iframe tap coordinates were not normalized to the reader viewport.');

  clock += 500;
  scale = 2;
  doc.dispatch('pointerdown', pointerEvent(2, 100, 100, plainTarget));
  clock += 16;
  doc.dispatch('pointermove', pointerEvent(2, 135, 120, plainTarget));
  flushFrames();
  doc.dispatch('pointerup', pointerEvent(2, 135, 120, plainTarget));
  assert(pans.some((value) => value.dx === -35 && value.dy === -20),
    'One-finger pan did not move zoomed content through the shared viewer API.');
  assert(navigation.length === 0, 'A zoomed pan incorrectly turned the page.');

  clock += 500;
  scale = 1;
  const panCountBeforePinch = pans.length;
  doc.dispatch('pointerdown', pointerEvent(3, 80, 100, plainTarget));
  doc.dispatch('pointerdown', pointerEvent(4, 180, 100, plainTarget));
  clock += 16;
  doc.dispatch('pointermove', pointerEvent(4, 240, 100, plainTarget));
  flushFrames();
  doc.dispatch('pointerup', pointerEvent(4, 240, 100, plainTarget));
  doc.dispatch('pointerup', pointerEvent(3, 80, 100, plainTarget));
  const lastPreview = pinchPreviews.at(-1);
  assert(lastPreview?.ratio === 1.6, 'Pinch scale ratio did not follow the two pointers.');
  assert(lastPreview?.focal.x === 150 && lastPreview?.focal.deltaX === 30,
    'Pinch preview did not preserve the initial midpoint and two-finger translation.');
  assert(pans.length === panCountBeforePinch, 'Pan and pinch ran simultaneously.');
  assert(commits.at(-1)?.value === 1.6 && pinchEnds.at(-1)?.x === 180,
    'Pinch release did not commit scale around the final focal point.');

  clock += 500;
  scale = 1;
  doc.dispatch('pointerdown', pointerEvent(5, 330, 200, plainTarget));
  clock += 80;
  doc.dispatch('pointermove', pointerEvent(5, 100, 205, plainTarget));
  flushFrames();
  doc.dispatch('pointerup', pointerEvent(5, 100, 205, plainTarget));
  assert(navigation.at(-1) === 'next', 'A left swipe in paginated LTR mode did not advance one page.');

  clock += 500;
  scale = 2;
  const navigationCount = navigation.length;
  doc.dispatch('pointerdown', pointerEvent(6, 330, 200, plainTarget));
  clock += 80;
  doc.dispatch('pointermove', pointerEvent(6, 100, 205, plainTarget));
  flushFrames();
  doc.dispatch('pointerup', pointerEvent(6, 100, 205, plainTarget));
  assert(navigation.length === navigationCount, 'A swipe turned the page while zoomed content was pannable.');

  clock += 500;
  const linkTarget = {
    closest: () => ({ href: 'https://example.com' }),
    releasePointerCapture() {},
    setPointerCapture() {},
  };
  const postsBeforeLink = posts.length;
  doc.dispatch('pointerdown', pointerEvent(7, 40, 40, linkTarget));
  clock += 30;
  doc.dispatch('pointerup', pointerEvent(7, 40, 40, linkTarget));
  assert(posts.length === postsBeforeLink, 'A link press also emitted a reader tap.');

  clock += 500;
  doc.selection = 'selected text';
  const postsBeforeSelection = posts.length;
  doc.dispatch('pointerdown', pointerEvent(8, 60, 60, plainTarget));
  clock += 30;
  doc.dispatch('pointerup', pointerEvent(8, 60, 60, plainTarget));
  assert(posts.length === postsBeforeSelection, 'Text selection also emitted a reader tap.');
  doc.selection = '';

  clock += 500;
  controller.resetFrames();
  const frameA = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const frameB = { getBoundingClientRect: () => ({ left: 220, top: 0 }) };
  const docA = new FakeTarget({ frame: frameA, nodeType: 9 });
  const docB = new FakeTarget({ frame: frameB, nodeType: 9 });
  controller.attach(docA, { doc: docA, frame: frameA, index: 2 });
  controller.attach(docB, { doc: docB, frame: frameB, index: 3 });
  scale = 1;
  docA.dispatch('pointerdown', pointerEvent(9, 50, 120, plainTarget));
  docB.dispatch('pointerdown', pointerEvent(10, 10, 120, plainTarget));
  assert(pinchPreviews.at(-1)?.focal.x === 140,
    'A cross-frame pinch mixed iframe-local coordinate systems.');
  docB.dispatch('pointerup', pointerEvent(10, 10, 120, plainTarget));
  docA.dispatch('pointerup', pointerEvent(9, 50, 120, plainTarget));

  clock += 500;
  scale = 2;
  const postsBeforeCancel = posts.length;
  docA.dispatch('pointerdown', pointerEvent(11, 100, 100, plainTarget));
  clock += 16;
  docA.dispatch('pointermove', pointerEvent(11, 140, 100, plainTarget));
  flushFrames();
  docA.dispatch('pointercancel', pointerEvent(11, 140, 100, plainTarget));
  assert(posts.length === postsBeforeCancel, 'A cancelled pointer emitted a tap.');
  clock += 500;
  docA.dispatch('pointerdown', pointerEvent(12, 70, 70, plainTarget));
  clock += 30;
  docA.dispatch('pointerup', pointerEvent(12, 70, 70, plainTarget));
  assert(posts.length === postsBeforeCancel + 1, 'Pointer cancellation left the gesture controller stuck.');

  const fixedLayout = fs.readFileSync('src/readers/pdf/web/vendor/foliate/fixed-layout.js', 'utf8');
  const pdfAdapter = fs.readFileSync('src/readers/pdf/web/vendor/foliate/pdf.js', 'utf8');
  const runtimeSource = fs.readFileSync('src/readers/pdf/web/pdfWebRuntime.ts', 'utf8');
  assert(fixedLayout.includes('touch-action: none')
    && fixedLayout.includes(':host:not([flow="scrolled"]) iframe')
    && fixedLayout.includes('#capturePageRectAt(focal)')
    && fixedLayout.includes("if (frame.iframe) frame.iframe.style.pointerEvents = 'auto'")
    && !fixedLayout.includes('!this.#scrolling && !this.#pinching && frame.iframe'),
    'Fixed-layout does not reserve touch ownership or preserve the finger focal page.');
  assert(!pdfAdapter.includes('setupPanningEvents') && pdfAdapter.includes('overscroll-behavior: none'),
    'The competing foliate pan recognizer is still active.');
  assert(pdfAdapter.includes("annotation?.subtype !== 'Link'")
    && pdfAdapter.includes('disableFontFace: true')
    && pdfAdapter.includes('useSystemFonts: true'),
    'PDF link annotations or iframe font fallback remain active.');
  assert(!runtimeSource.includes("doc.addEventListener('click'"),
    'PDF page links still have a clickable document-level handler.');

  // The live preview transforms the iframe itself. Android reports the next
  // pointer event in that frame's local coordinates, even for stationary fingers.
  controller.resetFrames();
  scale = 1;
  let scaledRect = { left: 20, top: 30, width: 400, height: 800 };
  const scaledFrame = {
    clientWidth: 400,
    clientHeight: 800,
    getBoundingClientRect: () => scaledRect,
  };
  const scaledDoc = new FakeTarget({ frame: scaledFrame, nodeType: 9 });
  controller.attach(scaledDoc, { doc: scaledDoc, frame: scaledFrame, index: 2 });
  scaledDoc.dispatch('pointerdown', pointerEvent(20, 100, 200, plainTarget));
  scaledDoc.dispatch('pointerdown', pointerEvent(21, 200, 200, plainTarget));
  scaledDoc.dispatch('pointermove', pointerEvent(21, 300, 200, plainTarget));
  flushFrames();
  assert(pinchPreviews.at(-1).ratio === 2, 'Pinch did not reach the requested 200%.');
  scaledRect = { left: -80, top: -170, width: 800, height: 1600 };
  for (let tick = 0; tick < 5; tick += 1) {
    scaledDoc.dispatch('pointermove', pointerEvent(21, 200, 200, plainTarget));
    scaledDoc.dispatch('pointermove', pointerEvent(20, 100, 200, plainTarget));
    flushFrames();
    assert(pinchPreviews.at(-1).ratio === 2,
      'Stationary fingers changed the zoom after the iframe was transformed.');
    assert(pinchPreviews.at(-1).focal.deltaX === 50 && pinchPreviews.at(-1).focal.deltaY === 0,
      'The transformed iframe fed its own movement back into the pinch focal point.');
  }
  scaledDoc.dispatch('pointerup', pointerEvent(21, 200, 200, plainTarget));
  scaledDoc.dispatch('pointerup', pointerEvent(20, 100, 200, plainTarget));
  assert(commits.at(-1).value === 2, 'Pinch release lost the stable visual scale.');

  controller.destroy();
  console.log('PDF WebView unified tap, pan, pinch, swipe, selection, and link gestures are valid.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
