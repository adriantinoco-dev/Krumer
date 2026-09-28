const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const os = require('os');
const ts = require('typescript');
const { chromium } = require('playwright');
const screenshotPath = path.join(os.tmpdir(), 'krumer-epub-selection.png');

function load(file, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}})`)(name => imports[name], module, module.exports);
  return module.exports;
}

(async () => {
  const vendor = load('src/readers/epubVendorScript.ts');
  const models = load('src/models/reader.ts');
  const bridge = load('src/readers/epubBridge.ts', { '../models/reader': models });
  const runtime = load('src/readers/epubRuntime.ts', {
    './epubBridge': bridge, './epubVendorScript': vendor,
  });
  const html = runtime.EPUB_RUNTIME_HTML.replace('window.KrumerEpubBridge = { receive: receive };',
    'window.__testReader = { getRendition: function () { return rendition; } }; window.KrumerEpubBridge = { receive: receive };');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 820 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent(html);
    await page.evaluate(async version => {
      window.__events = [];
      window.ReactNativeWebView = { postMessage: raw => window.__events.push(JSON.parse(raw)) };
      const zip = new window.JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
      zip.file('OPS/book.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">selection-fixture</dc:identifier><dc:title>Seleção</dc:title><dc:language>pt</dc:language><meta property="dcterms:modified">2026-09-27T00:00:00Z</meta></metadata><manifest><item id="intro" href="intro.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="intro"/><itemref idref="chapter"/></spine></package>');
      const section = (title, count) => '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + title + '</title></head><body><h1>' + title + '</h1>' + Array.from({ length: count }, (_, i) => '<p>Parágrafo ' + i + ': o texto visível deve continuar selecionado. <em>Este trecho ocupa outro nó do documento.</em> Mais palavras formam linhas e páginas para conferir limites, alças e estabilidade do leitor durante a seleção.</p>').join('') + '</body></html>';
      zip.file('OPS/intro.xhtml', section('Apresentação', 4));
      zip.file('OPS/chapter.xhtml', section('Capítulo', 80));
      zip.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head><body><nav epub:type="toc"><ol><li><a href="intro.xhtml">Apresentação</a></li><li><a href="chapter.xhtml">Capítulo</a></li></ol></nav></body></html>');
      const data = await zip.generateAsync({ type: 'base64' });
      window.__appearance = { displayMode: 'paginated', doubleColumn: false, fontFamily: 'serif', fontWeight: 'regular', fontSize: 18, lineHeight: 1.5, useBookMargins: false, marginHorizontal: 20, visualTheme: { backgroundColor: '#ffffff', textColor: '#171717', linkColor: '#c2570a' } };
      window.__send = (type, payload = {}) => window.KrumerEpubBridge.receive({ version, id: 'browser-' + Date.now(), type, payload });
      window.__touch = (doc, type) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', { value: [{ clientX: 200, clientY: 400 }] });
        doc.dispatchEvent(event);
        return event.defaultPrevented;
      };
      window.__send('OPEN_BOOK', { bookId: 'selection-fixture', dataBase64: data, byteLength: atob(data).length, appearance: window.__appearance });
    }, bridge.EPUB_BRIDGE_VERSION);
    await page.waitForFunction(() => window.__events.some(e => e.type === 'BOOK_OPENED'));
    const pages = [];
    for (let step = 0; step < 11; step += 1) {
      await page.waitForTimeout(350);
      const before = await page.evaluate(() => {
        const r = window.__testReader.getRendition();
        const location = r.currentLocation();
        const content = r.getContents().find(c => c.sectionIndex === location.start.index);
        if (!content) throw new Error('Visible Contents missing');
        const doc = content.document;
        const start = content.range(location.start.cfi);
        const end = location.end.index === content.sectionIndex ? content.range(location.end.cfi) : null;
        window.__selectionCheck = { r, doc, start, end, left: r.manager.container.scrollLeft, cfi: location.start.cfi, moves: 0, resizes: 0 };
        const move = r.manager.moveTo.bind(r.manager);
        const resize = r.resize.bind(r);
        window.__selectionCheck.restore = () => { r.manager.moveTo = move; r.resize = resize; };
        r.manager.moveTo = (...args) => { window.__selectionCheck.moves++; return move(...args); };
        r.resize = (...args) => { window.__selectionCheck.resizes++; return resize(...args); };
        window.__touch(doc, 'touchstart');
        const range = doc.createRange();
        range.selectNodeContents(doc.body);
        const selection = doc.defaultView.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        doc.dispatchEvent(new Event('selectionchange'));
        for (let i = 0; i < 20; i++) doc.dispatchEvent(new Event('selectionchange'));
        return { cfi: location.start.cfi, section: content.sectionIndex };
      });
      await page.waitForTimeout(600);
      if (step === 0) {
        const guardedScroll = await page.evaluate(() => {
          const c = window.__selectionCheck;
          const container = c.r.manager.container;
          const maximum = container.scrollWidth - container.clientWidth;
          const drift = c.left + 73 <= maximum ? c.left + 73 : c.left - 73;
          if (drift < 0 || drift === c.left) throw new Error('No adjacent column available for the scroll regression');
          container.scrollLeft = drift;
          container.dispatchEvent(new Event('scroll'));
          return { after: container.scrollLeft, expected: c.left };
        });
        assert.equal(guardedScroll.after, guardedScroll.expected,
          'Native selection scroll must be corrected before the next paint');
      }
      const result = await page.evaluate(() => {
        const c = window.__selectionCheck;
        const s = c.doc.defaultView.getSelection();
        const range = s.rangeCount && s.getRangeAt(0);
        return { text: s.toString(), startWithin: !!range && range.compareBoundaryPoints(0, c.start) >= 0, endWithin: !!range && (!c.end || range.compareBoundaryPoints(2, c.end) <= 0), left: c.r.manager.container.scrollLeft, originalLeft: c.left, moves: c.moves, resizes: c.resizes, sameDocument: c.r.getContents().some(x => x.document === c.doc) };
      });
      assert(result.text.length > 0 && result.startWithin && result.endWithin, JSON.stringify(result));
      assert.equal(result.left, result.originalLeft);
      assert.equal(result.moves, 0);
      assert.equal(result.resizes, 0);
      assert(result.sameDocument);
      if (step === 0) await page.screenshot({ path: screenshotPath });
      const dismissed = await page.evaluate(() => {
        window.__touch(document, 'touchstart');
        const prevented = window.__touch(document, 'touchend');
        const c = window.__selectionCheck;
        const result = { prevented, text: c.doc.defaultView.getSelection().toString() };
        c.restore();
        return result;
      });
      assert.equal(dismissed.text, '');
      assert.equal(dismissed.prevented, false);
      pages.push(before);
      if (step < 10) {
        await page.evaluate(() => window.__send('NEXT'));
        await page.waitForFunction(cfi => window.__testReader.getRendition().currentLocation().start.cfi !== cfi, before.cfi);
      }
    }
    assert(new Set(pages.map(p => p.section)).size === 2, 'Both front matter and chapter must be exercised');
    assert.equal(new Set(pages.map(p => p.cfi)).size, 11);
    await page.evaluate(() => window.__send('SET_APPEARANCE', { appearance: { ...window.__appearance, displayMode: 'scroll' } }));
    await page.waitForTimeout(600);
    const scrollResult = await page.evaluate(() => {
      const r = window.__testReader.getRendition();
      const doc = r.getContents().find(c => c.sectionIndex === r.currentLocation().start.index).document;
      window.__touch(doc, 'touchstart');
      const range = doc.createRange();
      range.selectNodeContents(doc.body);
      const selection = doc.defaultView.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      const expected = selection.toString();
      doc.dispatchEvent(new Event('selectionchange'));
      const actual = selection.toString();
      window.__touch(doc, 'touchend');
      window.__touch(document, 'touchstart'); window.__touch(document, 'touchend');
      return { full: actual === expected, cleared: selection.toString() === '' };
    });
    assert(scrollResult.full && scrollResult.cleared, JSON.stringify(scrollResult));

    const highlightSelection = await page.evaluate(() => {
      const rendition = window.__testReader.getRendition();
      const content = rendition.getContents().find(item => item.sectionIndex === rendition.currentLocation().start.index);
      const doc = content.document;
      window.__touch(doc, 'touchstart');
      const frameRect = doc.defaultView.frameElement.getBoundingClientRect();
      const scaleY = frameRect.height / doc.defaultView.innerHeight;
      const paragraph = [...doc.querySelectorAll('p')].find(item => {
        const rects = Array.from(item.getClientRects());
        return rects.some(rect => {
          const top = frameRect.top + rect.top * scaleY;
          const bottom = frameRect.top + rect.bottom * scaleY;
          return bottom > 0 && top < window.innerHeight;
        });
      });
      if (!paragraph) throw new Error('The fixture needs a paragraph visible in the active EPUB viewport.');
      const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      if (textNodes.length < 3) throw new Error('The fixture paragraph must span multiple text nodes.');

      const originalRange = doc.createRange();
      originalRange.setStart(textNodes[0], 0);
      originalRange.setEnd(textNodes[textNodes.length - 1], textNodes[textNodes.length - 1].length);
      const originalCfi = content.cfiFromRange(originalRange);
      const restoredOriginalRange = content.range(originalCfi);
      window.__send('SET_HIGHLIGHTS', { highlights: [{ cfiRange: originalCfi, color: 'yellow' }] });

      const selectedRange = doc.createRange();
      selectedRange.setStart(textNodes[0], 4);
      selectedRange.setEnd(textNodes[textNodes.length - 1], Math.min(18, textNodes[textNodes.length - 1].length));
      const selection = doc.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(selectedRange);
      doc.dispatchEvent(new Event('selectionchange'));
      window.__highlightRegression = { content, doc, originalRange, originalCfi, selectedRange };
      return {
        originalCfi,
        selectedCfi: content.cfiFromRange(selectedRange),
        selectedText: selectedRange.toString(),
        originalText: originalRange.toString(),
        restoredOriginalText: restoredOriginalRange.toString(),
        nodeCount: textNodes.length,
      };
    });
    assert(highlightSelection.nodeCount >= 3, JSON.stringify(highlightSelection));
    await page.evaluate(() => window.__touch(window.__highlightRegression.doc, 'touchend'));
    await page.waitForTimeout(350);
    const liveSelection = await page.evaluate(() => ({
      event: window.__events.filter(event => event.type === 'SELECTION_READY').at(-1),
      activeText: window.__highlightRegression.doc.defaultView.getSelection().toString(),
      touchInProgress: window.__highlightRegression.doc.__krumerSelectionTouchInProgress,
      documentBound: window.__highlightRegression.doc.__krumerF1Bound,
      events: window.__events.slice(-5).map(event => event.type),
    }));
    assert.equal(liveSelection.event?.payload.cfiRange, highlightSelection.selectedCfi,
      `Selection handles must publish the complete live CFI range without depending on touchend: ${JSON.stringify({ highlightSelection, liveSelection })}`);
    assert.equal(liveSelection.event.payload.text, highlightSelection.selectedText);
    assert.equal(liveSelection.event.payload.hasHighlight, true,
      `The selected range must recognize the existing multi-node highlight: ${JSON.stringify({ highlightSelection, liveSelection })}`);
    assert(!('released' in liveSelection.event.payload), 'The selection protocol must not carry instant-action release state.');

    const recolorResult = await page.evaluate(() => {
      const state = window.__highlightRegression;
      window.__send('UPSERT_HIGHLIGHT', {
        cfiRange: state.content.cfiFromRange(state.selectedRange),
        color: 'purple',
        textExcerpt: state.selectedRange.toString(),
      });
      const patch = window.__events.filter(event => event.type === 'HIGHLIGHTS_CHANGED').at(-1);
      const ranges = patch.payload.highlights.map(item => ({
        item,
        range: state.content.range(item.cfiRange),
      }));
      const selected = state.selectedRange;
      const intersects = (first, second) => first.compareBoundaryPoints(3, second) < 0
        && first.compareBoundaryPoints(1, second) > 0;
      const selectedFragment = ranges.find(({ item }) => item.color === 'purple');
      const yellowFragments = ranges.filter(({ item }) => item.color === 'yellow');
      const rangesOverlap = ranges.some((first, index) => ranges.slice(index + 1).some(second =>
        intersects(first.range, second.range)));
      state.currentHighlights = patch.payload.highlights;
      return {
        removedCfiRanges: patch.payload.removedCfiRanges,
        fragments: ranges
          .sort((first, second) => first.range.compareBoundaryPoints(0, second.range))
          .map(({ item, range }) => ({ cfiRange: item.cfiRange, color: item.color, text: range.toString() })),
        originalText: state.originalRange.toString(),
        selectedText: selected.toString(),
        selectedExact: !!selectedFragment
          && selectedFragment.range.compareBoundaryPoints(0, selected) === 0
          && selectedFragment.range.compareBoundaryPoints(2, selected) === 0,
        yellowCount: yellowFragments.length,
        overlap: rangesOverlap,
      };
    });
    assert(recolorResult.removedCfiRanges.includes(highlightSelection.originalCfi), JSON.stringify(recolorResult));
    assert.equal(recolorResult.selectedExact, true, JSON.stringify(recolorResult));
    assert.equal(recolorResult.yellowCount, 2, JSON.stringify(recolorResult));
    assert.equal(recolorResult.overlap, false, JSON.stringify(recolorResult));
    assert.equal(recolorResult.fragments.map(fragment => fragment.text).join(''), recolorResult.originalText,
      'Changing color across text nodes must preserve only the old-color fragments outside the selection.');

    const removalResult = await page.evaluate(() => {
      const state = window.__highlightRegression;
      const selection = state.selectedRange;
      const range = state.doc.createRange();
      range.setStart(selection.startContainer, selection.startOffset + 1);
      range.setEnd(selection.endContainer, selection.endOffset - 1);
      const removalCfi = state.content.cfiFromRange(range);
      window.__send('REMOVE_SELECTION_HIGHLIGHT', { cfiRange: removalCfi });
      const patch = window.__events.filter(event => event.type === 'HIGHLIGHTS_CHANGED').at(-1);
      const remainingHighlights = state.currentHighlights
        .filter(item => !patch.payload.removedCfiRanges.includes(item.cfiRange))
        .concat(patch.payload.highlights);
      state.currentHighlights = remainingHighlights;
      const fragments = remainingHighlights.map(item => ({ item, range: state.content.range(item.cfiRange) }));
      const intersects = (first, second) => first.compareBoundaryPoints(3, second) < 0
        && first.compareBoundaryPoints(1, second) > 0;
      return {
        removedCfiRanges: patch.payload.removedCfiRanges,
        removedText: range.toString(),
        remaining: fragments.map(({ item, range: fragment }) => ({ color: item.color, text: fragment.toString() })),
        overlapsRemovedSelection: fragments.some(({ range: fragment }) => intersects(fragment, range)),
      };
    });
    assert.equal(removalResult.overlapsRemovedSelection, false, JSON.stringify(removalResult));
    assert(removalResult.removedCfiRanges.length >= 1, JSON.stringify(removalResult));
    assert(removalResult.remaining.some(fragment => fragment.color === 'yellow'), JSON.stringify(removalResult));
    assert(removalResult.remaining.some(fragment => fragment.color === 'purple'), JSON.stringify(removalResult));
    assert.deepEqual(errors, []);
    const bridgeErrors = await page.evaluate(() => window.__events.filter(e => e.type === 'ERROR'));
    assert.deepEqual(bridgeErrors, []);
    console.log(JSON.stringify({ verifiedPages: pages.length, sections: [...new Set(pages.map(p => p.section))], scrollSelection: scrollResult, screenshot: screenshotPath }));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
