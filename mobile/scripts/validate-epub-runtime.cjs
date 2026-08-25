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
  const bridge = loadTypeScriptModule('src/readers/epubBridge.ts');
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
  let renderedHandler = null;
  const viewer = { className: '', replaceChildren() {} };
  const loading = { className: '' };
  const rendition = {
    destroy() {},
    display: () => Promise.resolve(),
    next: () => {
      turns.next += 1;
      return Promise.resolve();
    },
    on: (type, handler) => {
      if (type === 'rendered') renderedHandler = handler;
    },
    prev: () => {
      turns.previous += 1;
      return Promise.resolve();
    },
  };
  const book = {
    destroy() {},
    ready: Promise.resolve(),
    renderTo: () => rendition,
  };
  const outerDocument = {
    getElementById: (id) => (id === 'viewer' ? viewer : loading),
  };
  const runtimeWindow = {
    ReactNativeWebView: { postMessage() {} },
    addEventListener() {},
    atob,
    ePub: () => book,
    innerWidth: 1000,
    screen: { width: 1000 },
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
    version: 1,
    id: 'test-open',
    type: 'OPEN_BOOK',
    payload: { bookId: 'test-book', byteLength: 1, dataBase64: 'AA==' },
  }));
  await wait(0);
  if (!renderedHandler) throw new Error('The rendered document handler was not registered.');

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

  console.log('EPUB runtime syntax and one-turn-per-tap behavior are valid.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
