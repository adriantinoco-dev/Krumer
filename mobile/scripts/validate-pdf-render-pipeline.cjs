const assert = require('assert');
const fs = require('fs');

const read = (relativePath) => fs.readFileSync(relativePath, 'utf8').replace(/\r\n/g, '\n');

async function loadFixedLayout() {
  global.HTMLElement = class HTMLElement {};
  global.ResizeObserver = class ResizeObserver {};
  global.customElements = { define() {} };
  const source = read('src/readers/pdf/web/vendor/foliate/fixed-layout.js');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function loadPdfAdapter() {
  Object.defineProperty(global, 'devicePixelRatio', { configurable: true, value: 3 });
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { maxTouchPoints: 5, userAgent: 'Android' },
  });
  const source = read('src/readers/pdf/web/vendor/foliate/pdf.js');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function main() {
  const pdf = read('src/readers/pdf/web/vendor/foliate/pdf.js');
  const fixed = read('src/readers/pdf/web/vendor/foliate/fixed-layout.js');
  const runtime = read('src/readers/pdf/web/pdfWebRuntime.ts');
  const webEngine = read('src/readers/pdf/PdfWebEngine.tsx');
  const reader = read('src/readers/PdfReader.tsx');
  const readerTypes = read('src/readers/PdfReader.types.ts');
  const readerScreen = read('src/screens/ReaderScreen.tsx');
  const zoomModal = read('src/components/PdfZoomModal.tsx');

  assert(pdf.includes('const MAX_CONCURRENT_PAGE_RENDERS = 2'));
  assert(pdf.includes('renderQueue.sort((a, b) => a.queuePriority - b.queuePriority'));
  assert(pdf.includes('activeRenderTasks.get(doc)?.cancel()'));
  assert(pdf.includes('MAX_VISIBLE_CANVAS_PIXELS'));
  assert(pdf.includes('MAX_BACKGROUND_CANVAS_PIXELS'));
  assert(pdf.includes("const stagedText = doc.createElement('div')"));
  assert(pdf.includes("const stagedAnnotations = doc.createElement('div')"));
  assert(pdf.includes(".filter(annotation => annotation?.subtype !== 'Link')"));
  assert(pdf.includes('disableFontFace: true'));
  assert(pdf.includes('useSystemFonts: true'));
  assert(pdf.indexOf('container.replaceChildren(...stagedText.childNodes)')
    > pdf.indexOf('await new pdfjsLib.AnnotationLayer'));
  assert(pdf.includes('const renderedStates = new WeakMap()'));
  assert(pdf.includes('const textContentCache = new WeakMap()'));
  assert(pdf.includes('const annotationsCache = new WeakMap()'));
  assert(pdf.includes("phase: priority === 0 ? 'final' : 'preview'"));
  assert(pdf.includes('A detached/nearby preload becomes the visible preview'));
  assert(pdf.includes('scheduleInteractionLayers(page, doc, zoom)'));
  assert(pdf.includes('scheduleRender(page, doc, scale, pageColors, priority)'));

  assert(fixed.includes('distance <= 2'));
  assert(fixed.includes('priority: 2'));
  assert(fixed.includes('#preloadPromises = new Map()'));
  assert(fixed.includes('const navigationGeneration = ++this.#navigationGeneration'));
  assert(fixed.includes('findScrollPageIndex('));
  assert(fixed.includes('#rebuildScrollMetrics()'));
  assert(fixed.includes('this.#scrollEventFrame = requestAnimationFrame'));
  assert(fixed.includes('renderComplete = Promise.resolve()'));
  assert(fixed.includes("this.dispatchEvent(new CustomEvent('render-complete'"));
  assert(fixed.includes('this.#layoutScrollFrame(page, scale)'));
  assert(fixed.includes('this.#paginatedAnchor = this.#capturePaginatedViewAnchor()'));
  assert(fixed.includes('const preserveModeAnchor = this.#preservePaginatedAnchorOnce'));
  assert(fixed.includes('pageTurn && !preserveModeAnchor'));
  assert(fixed.includes('? { x: 0.5, y: 0.5 }'));
  assert(fixed.includes('(elementHeight - containerHeight) / 2'));
  assert(fixed.includes('computePaginatedCenterMargins'));
  assert(fixed.includes('isCenteredPage = this.#center || (portrait && frame === target)'));
  assert(fixed.includes('touch-action: none'));
  assert(fixed.includes('this.#scrollViewAnchor = this.#captureScrollModeAnchor()'));
  assert(fixed.includes('const navigating = this.#destroyScrollMode()'));
  assert(fixed.includes('if (!navigating) this.#render()'));
  const paginatedModeFlip = fixed.indexOf('this.#scrollMode = false\n            // Restore paginated content');
  assert(paginatedModeFlip >= 0
    && paginatedModeFlip < fixed.indexOf('this.goToSpread(spread.index, spread.side'));

  assert(runtime.includes('Promise.resolve(viewer.renderComplete).then'));
  assert(runtime.includes("viewer.setAttribute('zoom', 'fit-page')"));
  assert(runtime.includes("viewer.setAttribute('zoom', 'fit-width')"));
  assert(!webEngine.includes('onScaleChanged?.(nextScale);'));
  assert(readerTypes.includes('onScaleChange?: (scale: number) => void;'));
  assert(reader.includes('onScaleChange?.(nextScale);'));
  assert((reader.match(/if \(activeEngineRef\.current === 'webview'\) return undefined;/g) || []).length === 2);
  assert(readerScreen.includes('onScaleChange={setPdfScale}'));
  assert(readerScreen.includes('displayMode={pdfDisplayMode}'));
  assert(zoomModal.includes("'reader.zoomFitWidthHint' : 'reader.zoomFitPageHint'"));

  const helpers = await loadFixedLayout();
  const longPages = Array.from({ length: 300 }, (_, index) => ({
    index,
    size: 1000 + index,
    start: index * 1200,
  }));
  assert.strictEqual(helpers.findScrollPageIndex(longPages, 0), 0);
  assert.strictEqual(helpers.findScrollPageIndex(longPages, 1200 * 157 + 500), 157);
  assert.strictEqual(helpers.findScrollPageIndex(longPages, 1200 * 299 + 900), 299);
  const captured = helpers.capturePaginatedAnchor({
    clientHeight: 500,
    clientWidth: 300,
    scrollHeight: 1500,
    scrollLeft: 350,
    scrollTop: 250,
    scrollWidth: 1000,
  });
  assert.deepStrictEqual(captured, { x: 0.5, y: 0.25 });
  const restored = helpers.restorePaginatedAnchor({
    anchor: captured,
    clientHeight: 700,
    clientWidth: 500,
    scrollHeight: 2300,
    scrollWidth: 1700,
  });
  assert.deepStrictEqual(restored, { scrollLeft: 600, scrollTop: 400 });
  assert.deepStrictEqual(helpers.computePaginatedScroll({
    elementWidth: 300,
    containerWidth: 360,
    elementHeight: 900,
    containerHeight: 800,
    scrollTop: 180,
    pageTurn: true,
  }), { scrollLeft: 0, scrollTop: 50 });
  assert.deepStrictEqual(helpers.computePaginatedScroll({
    elementWidth: 700,
    containerWidth: 360,
    elementHeight: 900,
    containerHeight: 800,
    scrollTop: 180,
    pageTurn: false,
  }), { scrollLeft: 170, scrollTop: 180 });
  assert.deepStrictEqual(helpers.computePaginatedCenterMargins({
    elementWidth: 300,
    containerWidth: 360,
    elementHeight: 700,
    containerHeight: 800,
  }), {
    marginInlineStart: '30px',
    marginInlineEnd: '30px',
    marginBlockStart: '50px',
    marginBlockEnd: '50px',
  });
  assert.deepStrictEqual(helpers.computePaginatedCenterMargins({
    elementWidth: 700,
    containerWidth: 360,
    elementHeight: 900,
    containerHeight: 800,
  }), {
    marginInlineStart: '0px',
    marginInlineEnd: '0px',
    marginBlockStart: '0px',
    marginBlockEnd: '0px',
  });

  const pdfAdapter = await loadPdfAdapter();
  const page = { getViewport: ({ scale }) => ({ height: 100 * scale, width: 100 * scale }) };
  assert(pdfAdapter.getRenderDpr(page, 1, 0) > pdfAdapter.getRenderDpr(page, 1, 2));
  const signature = { color: '{}', dpr: 2, scale: 1 };
  assert.deepStrictEqual(pdfAdapter.planProgressiveRender({
    color: '{}', desiredDpr: 2, previewDpr: 1.5, priority: 0, rendered: signature, scale: 1,
  }), { action: 'reuse', upgrade: false });
  assert.deepStrictEqual(pdfAdapter.planProgressiveRender({
    color: '{}', desiredDpr: 2.5, previewDpr: 2, priority: 0,
    scale: 1, work: { color: '{}', dpr: 2, zoom: 1 },
  }), { action: 'promote', upgrade: true });
  assert.deepStrictEqual(pdfAdapter.planProgressiveRender({
    color: '{}', desiredDpr: 2.5, previewDpr: 2, priority: 0, scale: 1,
  }), { action: 'preview', upgrade: true });
  assert.deepStrictEqual(pdfAdapter.planProgressiveRender({
    color: '{}', desiredDpr: 2.5, previewDpr: 2, priority: 0,
    rendered: signature, scale: 1.5,
  }), { action: 'preview', upgrade: true });

  console.log('PDF render queue, adaptive sharpness, committed scale, and viewport anchors are valid.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
