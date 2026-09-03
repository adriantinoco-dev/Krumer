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
  assert(pdf.includes('MAX_SCROLL_CANVAS_PIXELS'));
  assert(pdf.includes('MAX_BACKGROUND_CANVAS_PIXELS'));
  assert(pdf.includes('scrolling = false'));
  assert(pdf.includes('request.scrolling'));
  assert(pdf.includes('getRenderDpr(page, zoom, priority, scrolling)'));
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
  assert(pdf.includes('scheduleRender(page, doc, scale, pageColors, priority, deferQuality)'));
  assert(pdf.includes('if (priority === 0 && !deferQuality)'));
  assert(pdf.includes('export const scheduleRender = (page, doc, zoom, pageColors, priority = 0, deferQuality = false)'));

  assert(fixed.includes('distance <= 2'));
  assert(fixed.includes('priority: 2'));
  assert(fixed.includes('#preloadPromises = new Map()'));
  assert(fixed.includes('const navigationGeneration = ++this.#navigationGeneration'));
  assert(fixed.includes('findScrollPageIndex('));
  assert(fixed.includes('#rebuildScrollMetrics()'));
  assert(fixed.includes('this.#scrollEventFrame = requestAnimationFrame'));
  assert(fixed.includes('this.#finalizeVisibleScrollRenders()'));
  assert(fixed.includes('#finalizeVisibleScrollRenders()'));
  assert(fixed.includes('forceFinalize = false'));
  assert(fixed.includes('deferQuality: pageData.deferredQuality'));
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
  const vm = require('vm');
  const commitScaleSource = runtime.slice(
    runtime.indexOf('    function commitScale(nextScale, gestureMs)'),
    runtime.indexOf('    var gestureController ='),
  );
  const zoomActions = [];
  const commitScale = vm.runInNewContext(`(function () {
    var currentScale = 2, scaleCommitId = 0, book = {};
    ${commitScaleSource}
    return commitScale;
  })()`, {
    clampScale: value => value,
    post() {},
    viewer: {
      renderComplete: Promise.resolve(),
      resetZoom: () => zoomActions.push('fit'),
      setAttribute: (name, value) => zoomActions.push([name, value]),
    },
  });
  commitScale(1);
  assert.deepStrictEqual(zoomActions, ['fit'], 'Restoring 100% must restore the viewport fit.');
  commitScale(1, 120);
  commitScale(2);
  assert.deepStrictEqual(zoomActions.slice(1), [['scale-factor', '100'], ['scale-factor', '200']],
    'Only an explicit reset should discard the pinch focal point.');
  assert(fixed.includes("this.#zoom = this.#scrollMode ? 'fit-width' : 'fit-page'"));
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
  assert(pdfAdapter.getRenderDpr(page, 1, 0, true) <= 2,
    'Scroll previews must use the capped mobile raster budget.');
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

  // A visible page discovered while the host is scrolling may render only its
  // preview. The higher-DPR upgrade must wait for the idle callback instead of
  // starting on the same turn as the scroll.
  const deferredStyle = () => ({
    setProperty(name, value) { this[name] = value; },
    removeProperty(name) { delete this[name]; },
  });
  let deferredRenderCount = 0;
  let finishDeferredRender;
  let deferredLiveCanvas = null;
  const deferredTextLayer = { style: deferredStyle() };
  const deferredAnnotationLayer = { style: deferredStyle() };
  const deferredCanvasContainer = {
    querySelector: () => deferredLiveCanvas,
    replaceChildren: (canvas) => { deferredLiveCanvas = canvas; },
  };
  const deferredDoc = {
    defaultView: { frameElement: { isConnected: true, dataset: { sectionIndex: '0' } } },
    body: { style: deferredStyle() },
    documentElement: { style: deferredStyle() },
    createElement: () => ({ style: deferredStyle(), getContext: () => ({}) }),
    querySelector: (selector) => ({
      '#canvas': deferredCanvasContainer,
      '.textLayer': deferredTextLayer,
      '.annotationLayer': deferredAnnotationLayer,
    })[selector],
  };
  const deferredPage = {
    ...page,
    render() {
      deferredRenderCount += 1;
      return {
        promise: new Promise(resolve => { finishDeferredRender = resolve; }),
        cancel() {},
      };
    },
  };
  const deferredPreview = pdfAdapter.scheduleRender(deferredPage, deferredDoc, 1, null, 0, true);
  assert.strictEqual(deferredRenderCount, 1);
  finishDeferredRender();
  await deferredPreview;
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.strictEqual(deferredRenderCount, 1,
    'A scrolling preview scheduled its final raster before scroll idle.');
  assert(deferredLiveCanvas && deferredLiveCanvas.width <= 200,
    'A scrolling preview must use the temporary mobile bitmap budget.');

  // Exercise the actual render queue: zoom must retain the canvas and its
  // dimensions, also when a second zoom arrives before the first raster is ready.
  Object.defineProperty(global, 'devicePixelRatio', { configurable: true, value: 1 });
  const style = () => ({
    setProperty(name, value) { this[name] = value; },
    removeProperty(name) { delete this[name]; },
  });
  let liveCanvas = null;
  const textLayer = { style: style() };
  const annotationLayer = { style: style() };
  const canvasContainer = {
    querySelector: () => liveCanvas,
    replaceChildren: (canvas) => { liveCanvas = canvas; },
  };
  const doc = {
    defaultView: { frameElement: { isConnected: true, dataset: { sectionIndex: '0' } } },
    body: { style: style() },
    documentElement: { style: style() },
    createElement: () => ({ style: style(), getContext: () => ({}) }),
    querySelector: (selector) => ({
      '#canvas': canvasContainer, '.textLayer': textLayer, '.annotationLayer': annotationLayer,
    })[selector],
  };
  let renderCount = 0;
  let completeRaster;
  const rasterPage = {
    ...page,
    render() {
      renderCount += 1;
      return { promise: new Promise(resolve => { completeRaster = resolve; }), cancel() {} };
    },
  };
  const initialRender = pdfAdapter.scheduleRender(rasterPage, doc, 1, null, 1);
  const pendingZoom = pdfAdapter.scheduleRender(rasterPage, doc, 2, null, 1);
  assert.strictEqual(renderCount, 1, 'Zoom restarted the raster still being loaded.');
  completeRaster();
  await Promise.all([initialRender, pendingZoom]);
  assert.strictEqual(doc.body.style.transform, 'scale(2)', 'The first raster overwrote the pending zoom.');
  const initialCanvas = liveCanvas;
  for (const zoom of [4, 0.5, 1.6, 1]) {
    await pdfAdapter.scheduleRender(rasterPage, doc, zoom, null, 0);
    assert.strictEqual(renderCount, 1, 'Zoom rasterized the page again.');
    assert.strictEqual(liveCanvas, initialCanvas, 'Zoom replaced the existing canvas.');
    assert.strictEqual(liveCanvas.width, 100, 'Zoom resized or cleared the original bitmap.');
    assert.strictEqual(doc.body.style.transform, `scale(${zoom})`);
  }
  // Real fitted scales are usually fractional PDF-point-to-viewport ratios.
  // Reset must fit those dimensions without treating the raster as 100%.
  const fittedScale = 0.63;
  await pdfAdapter.scheduleRender(rasterPage, doc, fittedScale * 2, null, 0);
  await pdfAdapter.scheduleRender(rasterPage, doc, fittedScale, null, 0);
  assert.strictEqual(liveCanvas, initialCanvas, 'Restoring fit replaced the original canvas.');
  const cssRatio = Number(doc.body.style.transform.match(/scale\(([^)]+)\)/)[1]);
  assert.strictEqual(parseFloat(liveCanvas.style.width) * cssRatio, 63,
    '100% did not restore the fitted page width independently of the raster scale.');

  console.log('PDF render queue, canvas-preserving visual zoom, and viewport anchors are valid.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
