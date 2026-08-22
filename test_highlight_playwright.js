const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:8002/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  // Get item 35 and open epub
  await page.evaluate(async () => {
    console.log('evaluating open');
    const item = await LibraryAPI.getItem(35);
    console.log('item', JSON.stringify(item).slice(0,200));
    openEpub(item, item.path);
  });
  await page.waitForTimeout(4000);
  // Check if reader is open
  const readerVisible = await page.evaluate(() => {
    const rv = document.getElementById('reader-view');
    return rv && !rv.classList.contains('hidden');
  });
  console.log('reader visible', readerVisible);
  // Try to select text and create highlight
  await page.evaluate(async () => {
    console.log('trying to select and highlight');
    const contents = epubRendition ? epubRendition.getContents()[0] : null;
    if (!contents) { console.log('no contents'); return; }
    const doc = contents.document;
    const p = doc.querySelector('p');
    if (!p) { console.log('no p'); return; }
    const range = doc.createRange();
    const textNode = p.firstChild;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 10);
    const cfi = contents.cfiFromRange(range);
    console.log('cfi for test highlight', cfi);
    if (cfi) {
      const style = { fill: '#facc15', 'fill-opacity': '0.45', 'mix-blend-mode': 'normal' };
      console.log('creating highlight via annotations');
      const ann = epubRendition.annotations.highlight(cfi, { test: 1 }, (e)=>console.log('clicked', e), 'krumer-hl-yellow', style);
      console.log('ann', ann);
      setTimeout(() => {
        const views = epubRendition.views();
        console.log('views', views.length);
        if (views[0] && views[0].pane) {
          console.log('pane marks', views[0].pane.marks.length);
          console.log('pane html', views[0].pane.element.innerHTML.slice(0,1000));
          const rects = views[0].pane.element.querySelectorAll('rect');
          console.log('rects count', rects.length);
          rects.forEach((r,i)=> console.log(`rect ${i} fill=${r.getAttribute('fill')} opacity=${r.getAttribute('fill-opacity')} style=${r.getAttribute('style')}`));
        } else {
          console.log('no pane in view');
          // Check global
          const allRects = document.querySelectorAll('g.krumer-hl-yellow rect');
          console.log('global rects', allRects.length);
        }
      }, 500);
    }
  });
  await page.waitForTimeout(2000);
  // Now test via our _createHighlight path (selection)
  await page.evaluate(async () => {
    console.log('testing _createHighlight via selection popover');
    // Simulate selection via dispatching selected event? Or directly call _createHighlight
    const cfi = epubHighlights.length ? epubHighlights[0].cfi_range : null;
    console.log('existing highlights', epubHighlights.length);
    // Try to create a new highlight at a different range
    const contents = epubRendition.getContents()[0];
    const doc = contents.document;
    const p2 = doc.querySelectorAll('p')[1];
    if (p2) {
      const range2 = doc.createRange();
      range2.setStart(p2.firstChild, 0);
      range2.setEnd(p2.firstChild, 8);
      const cfi2 = contents.cfiFromRange(range2);
      console.log('cfi2', cfi2);
      if (cfi2) {
        await _createHighlight(cfi2, p2.textContent.slice(0,8), 'green');
        console.log('after _createHighlight, highlights count', epubHighlights.length);
        setTimeout(() => {
          const views = epubRendition.views();
          if (views[0] && views[0].pane) {
            console.log('after create pane marks', views[0].pane.marks.length);
            console.log('pane html after', views[0].pane.element.innerHTML.slice(0,1200));
          }
        }, 600);
      }
    }
  });
  await page.waitForTimeout(3000);
  await browser.close();
  process.exit(0);
})();
