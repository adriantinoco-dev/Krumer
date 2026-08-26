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
  let renderedHandler = null;
  let relocatedHandler = null;
  const viewer = { className: '', replaceChildren() {}, style: {} };
  const loading = { className: '', style: {} };

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
    destroy() {},
    display: (target) => {
      displayTargets.push(target || 'BOOK_START');
      return String(target || '').includes('invalid-cfi')
        ? Promise.reject(new Error('Invalid CFI fixture'))
        : Promise.resolve();
    },
    getContents: () => activeReaderDocuments.map((document) => ({ document })),
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
  };
  const book = {
    destroy() {},
    load() {},
    navigation: {
      toc: [{ href: progressionSection.href, label: 'Chapter Two', subitems: [] }],
    },
    ready: Promise.resolve(),
    renderTo: () => rendition,
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
    getElementById: (id) => (id === 'viewer' ? viewer : loading),
  };
  const runtimeWindow = {
    ReactNativeWebView: {
      postMessage: (raw) => postedEvents.push(JSON.parse(raw)),
    },
    addEventListener() {},
    atob,
    ePub: () => book,
    innerWidth: 1000,
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

  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-open',
    type: 'OPEN_BOOK',
    payload: {
      bookId: 'test-book',
      byteLength: 1,
      dataBase64: 'AA==',
      appearance: {
        fontSize: 18,
        lineHeight: 1.5,
        visualTheme: { backgroundColor: '#202020', linkColor: '#f59a5a', textColor: '#e7e7e7' },
      },
    },
  }));
  await wait(0);
  if (!renderedHandler) throw new Error('The rendered document handler was not registered.');
  if (!relocatedHandler) throw new Error('The relocated handler was not registered.');
  if (outerDocument.body.style.backgroundColor !== '#202020') {
    throw new Error('The visual theme was not applied without changing the rendition flow.');
  }

  relocatedHandler({
    start: {
      cfi: 'epubcfi(/relocated)',
      displayed: { page: 2, total: 4 },
      href: progressionSection.href,
      index: 0,
    },
  });
  const relocateEnvelope = postedEvents.find((event) => event.type === 'RELOCATE');
  if (!relocateEnvelope || !bridge.parseEpubBridgeEvent(JSON.stringify(relocateEnvelope))) {
    throw new Error('RELOCATE did not emit a valid EPUB locator envelope.');
  }
  const viewStatusEnvelope = postedEvents.find((event) => event.type === 'VIEW_STATUS');
  if (
    !viewStatusEnvelope
    || viewStatusEnvelope.payload.chapterTitle !== 'Chapter Two'
    || !bridge.parseEpubBridgeEvent(JSON.stringify(viewStatusEnvelope))
  ) {
    throw new Error('VIEW_STATUS did not emit a valid chapter label and estimated page count.');
  }

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
    return {
      listeners,
      document: {
        addEventListener: (type, handler) => {
          listeners[type] = handler;
        },
        createElement: () => ({ style: {}, textContent: '' }),
        defaultView: { innerWidth: contentWidth },
        documentElement: { clientWidth: contentWidth },
        head: { appendChild() {} },
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

  runtimeWindow.KrumerEpubBridge.receive(JSON.stringify({
    version: bridge.EPUB_BRIDGE_VERSION,
    id: 'test-appearance',
    type: 'SET_APPEARANCE',
    payload: {
      appearance: {
        fontSize: 24,
        lineHeight: 1.8,
        visualTheme: { backgroundColor: '#f4ecd8', linkColor: '#a94f12', textColor: '#3b2f1e' },
      },
    },
  }));
  if (
    !chapter.document.__krumerVisualStyle
    || !chapter.document.__krumerVisualStyle.textContent.includes('font-size: 24px')
    || !chapter.document.__krumerVisualStyle.textContent.includes('line-height: 1.8')
    || outerDocument.body.style.backgroundColor !== '#f4ecd8'
  ) {
    throw new Error('Live EPUB appearance updates were not applied to the rendered chapter.');
  }

  console.log('EPUB runtime navigation, locators, visual status, live appearance, and center tap are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
