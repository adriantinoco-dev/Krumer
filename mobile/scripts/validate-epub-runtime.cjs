const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

function loadTypeScriptModule(filePath, imports = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function (require, module, exports) { ${compiled} })`);
  wrapper((name) => imports[name], module, module.exports);
  return module.exports;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const vendor = loadTypeScriptModule('src/readers/epubVendorScript.ts');
  const readerModels = loadTypeScriptModule('src/models/reader.ts');
  const bridge = loadTypeScriptModule('src/readers/epubBridge.ts', {
    '../models/reader': readerModels,
  });
  const runtime = loadTypeScriptModule('src/readers/epubRuntime.ts', {
    './epubBridge': bridge,
    './epubVendorScript': vendor,
  });
  const scripts = [...runtime.EPUB_RUNTIME_HTML.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);

  if (scripts.length !== 2) throw new Error(`Expected 2 runtime scripts, found ${scripts.length}.`);
  scripts.forEach((script) => new Function(script));
  new Function(runtime.EPUB_RUNTIME_HANDSHAKE_SCRIPT);

  const turns = { next: 0, previous: 0 };
  const displayTargets = [];
  const postedEvents = [];
  const activeReaderDocuments = [];
  const renditionConfigs = [];
  const generatedLocationChunks = [];
  const columnAlignmentCalls = [];
  const inPlaceMoveCalls = [];
  const resizeCalls = [];
  const spreadCalls = [];
  let renditionDestroyCount = 0;
  let viewerReplaceCount = 0;
  let renderedHandler = null;
  let relocatedHandler = null;
  let contentHook = null;
  let currentRenditionLocation = null;
  let shiftOnNextResize = false;
  const viewer = {
    className: '',
    replaceChildren() {
      viewerReplaceCount += 1;
    },
    style: {},
  };
  const loading = { className: '', style: {} };
  const loadedFontFaces = [];
  const registeredDocumentFonts = [];
  const windowListeners = {};

  function createSectionDocument(text) {
    const root = { nodeType: 1 };
    const textNode = { nodeType: 3, textContent: text };
    return {
      body: root,
      createRange: () => ({
        collapse() {},
        setStart() {},
      }),
      createTreeWalker: () => {
        let delivered = false;
        return {
          nextNode: () => {
            if (delivered || !text) return null;
            delivered = true;
            return textNode;
          },
        };
      },
    };
  }

  const progressionSection = {
    cfiFromRange: () => 'epubcfi(/spine-progression)',
    find: () => [],
    href: 'chapter-progression.xhtml',
    load: () => Promise.resolve(createSectionDocument('A sufficiently long chapter used for progression fallback testing.')),
    unload() {},
  };
  const excerptSection = {
    cfiFromRange: () => null,
    find: () => [{ cfi: 'epubcfi(/excerpt-match)' }],
    href: 'chapter-excerpt.xhtml',
    load: () => Promise.resolve(createSectionDocument('')),
    unload() {},
  };
  const rendition = {
    currentLocation: () => currentRenditionLocation,
    destroy() {
      renditionDestroyCount += 1;
    },
    display: (target) => {
      displayTargets.push(target || 'BOOK_START');
      if (String(target || '').includes('invalid-cfi')) {
        return Promise.reject(new Error('Invalid CFI fixture'));
      }
      currentRenditionLocation = {
        start: {
          cfi: target || 'epubcfi(/book-start)',
          displayed: { page: 1, total: 4 },
          href: progressionSection.href,
          index: 0,
        },
      };
      return Promise.resolve();
    },
    getContents: () => activeReaderDocuments.map((document) => ({ document })),
    hooks: {
      content: {
        register: (handler) => {
          contentHook = handler;
        },
      },
    },
    manager: {
      layout: {
        divisor: 2,
        pageWidth: 600,
      },
      moveTo: (point, width) => {
        inPlaceMoveCalls.push({ point, width });
      },
      scrollBy: (left, top, silent) => {
        columnAlignmentCalls.push({ left, silent, top });
      },
      settings: { direction: 'ltr' },
      views: {
        find: () => ({
          locationOf: () => ({ left: 600, top: 0 }),
          width: () => 12000,
        }),
      },
    },
    next: () => {
      turns.next += 1;
      return Promise.resolve();
    },
    on: (type, handler) => {
      if (type === 'rendered') renderedHandler = handler;
      if (type === 'relocated') relocatedHandler = handler;
    },
    prev: () => {
      turns.previous += 1;
      return Promise.resolve();
    },
    resize: (width, height) => {
      resizeCalls.push([width, height]);
      if (shiftOnNextResize) {
        shiftOnNextResize = false;
        currentRenditionLocation = {
          start: {
            cfi: 'epubcfi(/shifted-after-resize)',
            displayed: { page: 3, total: 4 },
            href: progressionSection.href,
            index: 0,
          },
        };
      }
      return Promise.resolve();
    },
    spread: (value) => {
      spreadCalls.push(value);
    },
  };
  const book = {
    destroy() {},
    load() {},
    locations: {
      generate: (characters) => {
        generatedLocationChunks.push(characters);
        return Promise.resolve();
      },
      length: () => 182,
      locationFromCfi: (cfi) => {
        const value = String(cfi || '');
        if (value.includes('book-end')) return 181;
        if (value.includes('excerpt')) return 135;
        if (value.includes('spine-progression')) return 45;
        if (value.includes('shifted')) return 57;
        if (value.includes('relocated')) return 56;
        return 0;
      },
      percentageFromCfi: (cfi) => book.locations.locationFromCfi(cfi) / 181,
    },
    navigation: {
      toc: [{ href: progressionSection.href, label: 'Chapter Two', subitems: [] }],
    },
    ready: Promise.resolve(),
    renderTo: (_target, config) => {
      renditionConfigs.push(config);
      return rendition;
    },
    spine: {
      get: (href) => {
        if (href === progressionSection.href) return progressionSection;
        if (href === excerptSection.href) return excerptSection;
        return null;
      },
      length: 2,
      spineItems: [progressionSection, excerptSection],
    },
  };
  const outerDocument = {
    body: { style: {} },
    documentElement: { style: {} },
    fonts: { add: (fontFace) => registeredDocumentFonts.push(fontFace) },
    getElementById: (id) => (id === 'viewer' ? viewer : loading),
  };
  const runtimeWindow = {
    FontFace: class FontFace {
      constructor(family, source, descriptors) {
        this.descriptors = descriptors;
        this.family = family;
        this.source = source;
      }
      load() {
        loadedFontFaces.push(this);
        return Promise.resolve(this);
      }
    },
    ReactNativeWebView: {
      postMessage: (raw) => postedEvents.push(JSON.parse(raw)),
    },
    addEventListener: (type, handler) => {
      windowListeners[type] = handler;
    },
    atob,
    cancelAnimationFrame: clearTimeout,
    ePub: () => book,
    innerHeight: 600,
    innerWidth: 1000,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    screen: { height: 1000, width: 1000 },
  };

  vm.runInNewContext(scripts[1], {
    ArrayBuffer,
    Date,
    JSON,
    Math,
    Promise,
    String,
    Uint8Array,
    clearTimeout,
    document: outerDocument,
    setTimeout,
    window: runtimeWindow,
  });

  let userRelocationId = 0;
  async function emitUserRelocation(location) {
    userRelocationId += 1;
    runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
      version: bridge.EPUB_BRIDGE_VERSION,
      id: `test-user-relocation-${userRelocationId}`,
      type: 'NEXT',
      payload: {},
    }));
    if (turns.next !== 1) throw new Error('The validator could not arm a user relocation.');
    currentRenditionLocation = location;
    relocatedHandler(location);
    await wait(120);
    turns.next = 0;
  }

  function registerFontFamily(family, fontFamily) {
    runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
      version: bridge.EPUB_BRIDGE_VERSION,
      id: `register-${family}`,
      type: 'REGISTER_FONT_FACES',
      payload: {
        family,
        faces: [300, 400, 500, 700].map((weight) => ({
          dataBase64: 'AA==',
          family,
          fontFamily,
          mimeType: 'font/ttf',
          weight,
        })),
      },
    }));
  }

  registerFontFamily('serif', 'Krumer Noto Serif');
  registerFontFamily('sans', 'Krumer Noto Sans');
  registerFontFamily('mono', 'Krumer Noto Sans Mono');
  await wait(0);
  const fontReadyEvents = postedEvents.filter((event) => event.type === 'FONT_FACES_READY');
  if (
    fontReadyEvents.length !== 3
    || loadedFontFaces.length !== 12
    || registeredDocumentFonts.length !== 12
    || fontReadyEvents.some((event) => !bridge.parseEpubBridgeEvent(JSON.stringify(event)))
  ) {
    throw new Error('The three embedded font families were not acknowledged by the runtime bridge.');
  }

  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-open',
    type: 'OPEN_BOOK',
    payload: {
      bookId: 'test-book',
      byteLength: 1,
      dataBase64: 'AA==',
      initialLocator: {
        format: 'epub',
        cfi: 'epubcfi(/relocated)',
        spineHref: progressionSection.href,
        progressionInSection: 0.25,
        excerpt: '',
        totalProgression: 0.25,
      },
      appearance: {
        displayMode: 'paginated',
        doubleColumn: true,
        fontSize: 18,
        fontFamily: 'serif',
        fontWeight: 'regular',
        lineHeight: 1.5,
        marginHorizontal: 16,
        useBookMargins: true,
        visualTheme: { backgroundColor: '#202020', linkColor: '#f59a5a', textColor: '#e7e7e7' },
      },
    },
  }));
  await wait(0);
  if (!renderedHandler) throw new Error('The rendered document handler was not registered.');
  if (!relocatedHandler) throw new Error('The relocated handler was not registered.');
  if (!contentHook) throw new Error('The pre-layout content hook was not registered.');
  if (outerDocument.body.style.backgroundColor !== '#202020') {
    throw new Error('The visual theme was not applied without changing the rendition flow.');
  }
  if (viewer.style.left !== '20px' || viewer.style.right !== '20px') {
    throw new Error('The default EPUB reader frame did not apply the 20px book margin.');
  }
  if (
    renditionConfigs.length !== 1
    || renditionConfigs[0].spread !== 'always'
    || renditionConfigs[0].resizeOnOrientationChange !== false
    || columnAlignmentCalls.length !== 1
    || columnAlignmentCalls[0].left !== 600
  ) {
    throw new Error('An EPUB opened at a saved CFI in landscape did not align it in the leading column.');
  }
  if (generatedLocationChunks.length !== 1 || generatedLocationChunks[0] !== 1600) {
    throw new Error('Stable EPUB locations were not generated with fixed 1,600-character blocks.');
  }

  currentRenditionLocation = {
    start: {
      cfi: 'epubcfi(/relocated)',
      displayed: { page: 2, total: 4 },
      href: progressionSection.href,
      index: 0,
    },
  };
  await emitUserRelocation(currentRenditionLocation);
  const relocateEnvelope = postedEvents.filter((event) => event.type === 'RELOCATE').at(-1);
  if (
    !relocateEnvelope
    || relocateEnvelope.payload.source !== 'user'
    || !bridge.parseEpubBridgeEvent(JSON.stringify(relocateEnvelope))
  ) {
    throw new Error(`RELOCATE did not emit a valid EPUB locator envelope: ${JSON.stringify({ relocateEnvelope, turns })}`);
  }
  const restoredEnvelope = postedEvents.find((event) => event.type === 'POSITION_STABILIZED');
  if (
    !restoredEnvelope
    || restoredEnvelope.payload.source !== 'restore'
    || !bridge.parseEpubBridgeEvent(JSON.stringify(restoredEnvelope))
  ) {
    throw new Error('Opening the EPUB did not emit a stabilized restore position.');
  }

  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-current-locator',
    type: 'GET_CURRENT_LOCATOR',
    payload: {},
  }));
  await wait(0);
  const currentLocatorEnvelope = postedEvents.find((event) => event.type === 'CURRENT_LOCATOR');
  if (
    !currentLocatorEnvelope
    || currentLocatorEnvelope.payload.requestId !== 'test-current-locator'
    || currentLocatorEnvelope.payload.locator.cfi !== 'epubcfi(/relocated)'
    || !bridge.parseEpubBridgeEvent(JSON.stringify(currentLocatorEnvelope))
  ) {
    throw new Error('GET_CURRENT_LOCATOR did not return the live rendition position.');
  }
  const viewStatusEnvelope = postedEvents.filter((event) => event.type === 'VIEW_STATUS').at(-1);
  if (
    !viewStatusEnvelope
    || viewStatusEnvelope.payload.chapterTitle !== 'Chapter Two'
    || viewStatusEnvelope.payload.paginationState !== 'ready'
    || viewStatusEnvelope.payload.currentPage !== 57
    || viewStatusEnvelope.payload.totalPages !== 182
    || !bridge.parseEpubBridgeEvent(JSON.stringify(viewStatusEnvelope))
  ) {
    throw new Error('VIEW_STATUS did not emit the stable current page and fixed total from the relocated CFI.');
  }

  const boundaryLocations = [
    {
      expectedPage: 1,
      location: {
        atStart: true,
        start: {
          cfi: 'epubcfi(/book-start)',
          displayed: { page: 1, total: 4 },
          href: progressionSection.href,
          index: 0,
        },
      },
    },
    {
      expectedPage: 182,
      location: {
        atEnd: true,
        start: {
          cfi: 'epubcfi(/book-end)',
          displayed: { page: 4, total: 4 },
          href: progressionSection.href,
          index: 0,
        },
      },
    },
  ];
  for (const boundary of boundaryLocations) {
    await emitUserRelocation(boundary.location);
    const status = postedEvents.filter((event) => event.type === 'VIEW_STATUS').at(-1);
    if (status.payload.currentPage !== boundary.expectedPage || status.payload.totalPages !== 182) {
      throw new Error(`Stable EPUB page boundary did not resolve to ${boundary.expectedPage} / 182.`);
    }
  }
  currentRenditionLocation = {
    start: {
      cfi: 'epubcfi(/relocated)',
      displayed: { page: 2, total: 4 },
      href: progressionSection.href,
      index: 0,
    },
  };
  await emitUserRelocation(currentRenditionLocation);

  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-spine-fallback',
    type: 'GO_TO_LOCATOR',
    payload: {
      locator: {
        format: 'epub',
        cfi: 'epubcfi(/invalid-cfi-progression)',
        spineHref: progressionSection.href,
        progressionInSection: 0.5,
        excerpt: 'A sufficiently long excerpt for the final fallback.',
        totalProgression: 0.25,
      },
    },
  }));
  await wait(0);
  if (displayTargets.at(-2) !== 'epubcfi(/invalid-cfi-progression)' || displayTargets.at(-1) !== 'epubcfi(/spine-progression)') {
    throw new Error('Invalid CFI did not fall back to spineHref + progressionInSection.');
  }

  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-excerpt-fallback',
    type: 'GO_TO_LOCATOR',
    payload: {
      locator: {
        format: 'epub',
        cfi: 'epubcfi(/invalid-cfi-excerpt)',
        spineHref: excerptSection.href,
        progressionInSection: 0.5,
        excerpt: 'A sufficiently long excerpt for the final fallback.',
        totalProgression: 0.75,
      },
    },
  }));
  await wait(0);
  if (displayTargets.at(-2) !== 'epubcfi(/invalid-cfi-excerpt)' || displayTargets.at(-1) !== 'epubcfi(/excerpt-match)') {
    throw new Error('Invalid CFI and spine progression did not fall back to excerpt.');
  }

  function createReaderDocument(contentWidth) {
    const listeners = {};
    const appliedTypography = {};
    const typographyStyle = {
      setProperty: (name, value, priority) => {
        appliedTypography[name] = { priority, value };
      },
    };
    return {
      appliedTypography,
      listeners,
      document: {
        addEventListener: (type, handler) => {
          listeners[type] = handler;
        },
        body: { style: typographyStyle },
        createElement: () => ({ style: {}, textContent: '' }),
        defaultView: { innerWidth: contentWidth },
        documentElement: { clientWidth: contentWidth },
        fonts: { load: () => Promise.resolve([]) },
        head: { appendChild() {} },
        querySelectorAll: () => [{ style: typographyStyle }],
      },
    };
  }

  const presentation = createReaderDocument(1000);
  activeReaderDocuments.push(presentation.document);
  renderedHandler(null, { document: presentation.document });

  const target = { nodeType: 1, parentElement: null, tagName: 'P' };
  const touch = (x) => ({ clientX: x, clientY: 400, screenX: x, screenY: 400 });
  const touchEvent = (x, phase) => ({
    changedTouches: phase === 'end' ? [touch(x)] : undefined,
    preventDefault() {},
    stopImmediatePropagation() {},
    target,
    touches: phase === 'start' ? [touch(x)] : undefined,
  });

  presentation.listeners.touchstart(touchEvent(900, 'start'));
  presentation.listeners.touchend(touchEvent(900, 'end'));

  const chapter = createReaderDocument(12000);
  activeReaderDocuments.splice(0, activeReaderDocuments.length, chapter.document);
  renderedHandler(null, { document: chapter.document });
  chapter.listeners.click({ clientX: 0, screenX: 0, preventDefault() {}, stopImmediatePropagation() {}, target });
  if (turns.next !== 1) throw new Error(`One right tap produced ${turns.next} next turns.`);
  if (turns.previous !== 0) throw new Error('A synthetic click in the next chapter went back a page.');

  await wait(120);
  chapter.listeners.touchstart(touchEvent(900, 'start'));
  chapter.listeners.touchend(touchEvent(900, 'end'));
  if (turns.next !== 2) throw new Error('A second right tap did not advance exactly once.');

  await wait(120);
  chapter.listeners.touchstart(touchEvent(100, 'start'));
  chapter.listeners.touchend(touchEvent(100, 'end'));
  if (turns.previous !== 1) throw new Error('One left tap did not go back exactly once.');

  await wait(120);
  chapter.listeners.touchstart(touchEvent(500, 'start'));
  chapter.listeners.touchend(touchEvent(500, 'end'));
  const centerTapEnvelope = postedEvents.find((event) => event.type === 'CENTER_TAP');
  if (!centerTapEnvelope || !bridge.parseEpubBridgeEvent(JSON.stringify(centerTapEnvelope))) {
    throw new Error('A center tap did not emit a valid visual chrome toggle event.');
  }
  if (turns.next !== 2 || turns.previous !== 1) {
    throw new Error('A center tap changed the EPUB navigation state.');
  }

  const anchorBeforeReflow = 'epubcfi(/relocated)';
  currentRenditionLocation = {
    start: {
      cfi: anchorBeforeReflow,
      displayed: { page: 2, total: 4 },
      href: progressionSection.href,
      index: 0,
    },
  };
  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-appearance',
    type: 'SET_APPEARANCE',
    payload: {
      appearance: {
        displayMode: 'scroll',
        doubleColumn: true,
        fontSize: 24,
        fontFamily: 'sans',
        fontWeight: 'bold',
        lineHeight: 1.8,
        marginHorizontal: 24,
        useBookMargins: false,
        visualTheme: { backgroundColor: '#f4ecd8', linkColor: '#a94f12', textColor: '#3b2f1e' },
      },
    },
  }));
  await wait(0);
  if (
    !chapter.document.__krumerVisualStyle
    || !chapter.document.__krumerVisualStyle.textContent.includes('font-size: 24px')
    || !chapter.document.__krumerVisualStyle.textContent.includes('font-family: "Krumer Noto Sans"')
    || !chapter.document.__krumerVisualStyle.textContent.includes('font-weight: 700')
    || !chapter.document.__krumerFontFaceStyle.textContent.includes('@font-face')
    || !chapter.document.__krumerFontFaceStyle.textContent.includes('font-display: swap')
    || chapter.document.__krumerFontFaceStyle.textContent.includes('font-display: block')
    || !chapter.document.__krumerVisualStyle.textContent.includes('body, p, div, span')
    || chapter.appliedTypography['font-family'].value !== '"Krumer Noto Sans", sans-serif'
    || chapter.appliedTypography['font-family'].priority !== 'important'
    || chapter.appliedTypography['font-weight'].value !== '700'
    || !chapter.document.__krumerVisualStyle.textContent.includes('line-height: 1.8')
    || outerDocument.body.style.backgroundColor !== '#f4ecd8'
    || renditionConfigs.at(-1).flow !== 'scrolled-doc'
    || renditionConfigs.at(-1).manager !== 'continuous'
    || renditionConfigs.at(-1).spread !== 'none'
    || viewer.style.left !== '24px'
    || viewer.style.right !== '24px'
  ) {
    throw new Error('Live EPUB appearance updates were not applied to the rendered chapter.');
  }
  chapter.listeners.touchstart(touchEvent(900, 'start'));
  chapter.listeners.touchend(touchEvent(100, 'end'));
  if (turns.next !== 2 || turns.previous !== 1) {
    throw new Error('Horizontal gestures still changed pages while scroll mode was active.');
  }

  runtimeWindow.innerWidth = 700;
  runtimeWindow.innerHeight = 1200;
  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-double-column',
    type: 'SET_APPEARANCE',
    payload: {
      appearance: {
        displayMode: 'paginated',
        doubleColumn: true,
        fontSize: 24,
        fontFamily: 'mono',
        fontWeight: 'medium',
        lineHeight: 1.8,
        marginHorizontal: 16,
        useBookMargins: true,
        visualTheme: { backgroundColor: '#202020', linkColor: '#f59a5a', textColor: '#e7e7e7' },
      },
    },
  }));
  await wait(0);
  if (renditionConfigs.at(-1).flow !== 'paginated' || renditionConfigs.at(-1).spread !== 'none') {
    throw new Error('Portrait mode did not recreate the paginated manager with a single-column spread.');
  }
  if (chapter.document.__krumerVisualStyle.textContent.includes('line-height:')) {
    throw new Error('Book layout did not remove the custom line-height override.');
  }
  const renderCountBeforeRotation = renditionConfigs.length;
  const destroyCountBeforeRotation = renditionDestroyCount;
  const replaceCountBeforeRotation = viewerReplaceCount;
  const displayCountBeforeRotation = displayTargets.length;

  runtimeWindow.innerWidth = 1200;
  runtimeWindow.innerHeight = 700;
  shiftOnNextResize = true;
  windowListeners.resize();
  await wait(10);
  if (
    spreadCalls.at(-1) !== 'always'
    || resizeCalls.at(-1)[0] !== 1160
    || resizeCalls.at(-1)[1] !== 700
    || columnAlignmentCalls.length !== 2
    || columnAlignmentCalls.at(-1).left !== 600
    || columnAlignmentCalls.at(-1).top !== 0
    || columnAlignmentCalls.at(-1).silent !== true
  ) {
    throw new Error('Landscape rotation did not keep the saved CFI in the leading column of the active rendition.');
  }
  if (
    renditionConfigs.length !== renderCountBeforeRotation
    || renditionDestroyCount !== destroyCountBeforeRotation
    || viewerReplaceCount !== replaceCountBeforeRotation
    || displayTargets.length !== displayCountBeforeRotation
    || inPlaceMoveCalls.length !== 1
  ) {
    throw new Error('Rotation did not recover the exact CFI in place without redisplaying or clearing the active rendition.');
  }
  const displayCountAfterRecovery = displayTargets.length;

  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-in-place-typography',
    type: 'SET_APPEARANCE',
    payload: {
      appearance: {
        displayMode: 'paginated',
        doubleColumn: true,
        fontSize: 28,
        fontFamily: 'serif',
        fontWeight: 'bold',
        lineHeight: 2,
        marginHorizontal: 16,
        useBookMargins: true,
        visualTheme: { backgroundColor: '#202020', linkColor: '#f59a5a', textColor: '#e7e7e7' },
      },
    },
  }));
  await wait(10);
  if (
    renditionConfigs.length !== renderCountBeforeRotation
    || renditionDestroyCount !== destroyCountBeforeRotation
    || viewerReplaceCount !== replaceCountBeforeRotation
    || displayTargets.length !== displayCountAfterRecovery
    || inPlaceMoveCalls.length !== 2
    || columnAlignmentCalls.length !== 3
  ) {
    throw new Error('Typography reflow did not preserve the exact CFI in place in the leading EPUB column.');
  }
  const displayCountAfterTypography = displayTargets.length;

  runtimeWindow.innerWidth = 700;
  runtimeWindow.innerHeight = 1200;
  windowListeners.resize();
  await wait(10);
  if (
    spreadCalls.at(-1) !== 'none'
    || resizeCalls.at(-1)[0] !== 660
    || resizeCalls.at(-1)[1] !== 1200
  ) {
    throw new Error('Portrait rotation did not return the active rendition to one column.');
  }
  if (
    renditionConfigs.length !== renderCountBeforeRotation
    || renditionDestroyCount !== destroyCountBeforeRotation
    || viewerReplaceCount !== replaceCountBeforeRotation
    || displayTargets.length !== displayCountAfterTypography
    || columnAlignmentCalls.length !== 3
  ) {
    throw new Error('Repeated rotation recreated, cleared, or redisplayed the EPUB rendition.');
  }

  const reflowEnvelope = postedEvents.filter((event) => event.type === 'POSITION_STABILIZED').at(-1);
  if (
    !reflowEnvelope
    || reflowEnvelope.payload.source !== 'reflow'
    || reflowEnvelope.payload.locator.cfi !== anchorBeforeReflow
  ) {
    throw new Error('Appearance reflow did not preserve and stabilize the current text anchor.');
  }

  const stablePageStatuses = postedEvents
    .filter((event) => event.type === 'VIEW_STATUS' && event.payload.paginationState === 'ready');
  if (
    stablePageStatuses.length < 3
    || stablePageStatuses.some((event) => event.payload.totalPages !== 182)
    || stablePageStatuses.at(-1).payload.currentPage !== 57
  ) {
    throw new Error('Stable page totals changed after typography or viewport reflow.');
  }

  const unavailableStatus = bridge.parseEpubBridgeEvent(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-unavailable-status',
    type: 'VIEW_STATUS',
    payload: {
      chapterTitle: 'Fallback chapter',
      currentPage: null,
      paginationState: 'unavailable',
      totalPages: null,
    },
  }));
  if (!unavailableStatus) {
    throw new Error('VIEW_STATUS did not accept the non-fatal pagination fallback state.');
  }

  console.log('EPUB runtime stable pagination, in-place rotation, first-frame spreads, typography, and navigation are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
