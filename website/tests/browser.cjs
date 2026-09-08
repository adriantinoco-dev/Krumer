// Uses the repository's existing Playwright; does not install a site dependency.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { API_URL, RELEASES_URL } = require('../downloads.js');

const base = process.env.KRUMER_SITE_URL || 'http://127.0.0.1:4173';
const output = path.resolve(__dirname, '../test-results');
const files = { windows: 'Krumer-win-v1.3.2.exe', appimage: 'Krumer-linux-v1.3.2.AppImage', deb: 'Krumer-linux-v1.3.2.deb', android: 'Krumer-android.apk' };
const fixture = { tag_name: 'v1.3.2', published_at: '2026-08-16T23:46:20Z', draft: false, prerelease: false,
  assets: Object.values(files).map(name => ({ name, browser_download_url: RELEASES_URL + '/download/v1.3.2/' + name })) };

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.KRUMER_BROWSER_CHANNEL ? { channel: process.env.KRUMER_BROWSER_CHANNEL } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(API_URL, route => route.fulfill({ json: fixture }));
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('[data-download-state="direct"]'));
    assert.match(await page.locator('#release-status').innerText(), /v1\.3\.2.*16.*ago.*2026/);
    for (const [key, filename] of Object.entries(files)) {
      for (const link of await page.locator('[data-download="' + key + '"]').all()) {
        assert.equal(await link.getAttribute('href'), RELEASES_URL + '/download/v1.3.2/' + filename);
      }
    }
    // The href assertions above cover activation without navigating to or downloading
    // large external installer files during the browser test.
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('[data-download-state="direct"]'));
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow at ' + width);
      assert.ok(await page.locator('h1').isVisible());
      if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(output, width + '.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const windowsBox = await page.locator('.hero-downloads [data-download="windows"]').boundingBox();
    assert.ok(windowsBox.y + windowsBox.height < 844, 'Primary mobile download must appear in first viewport');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    await page.goto(base);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), 'Pular para o conteúdo');
    const summary = page.locator('summary').first();
    await summary.focus();
    assert.equal(await summary.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('details').first().getAttribute('open'), '');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('details').first().getAttribute('open'), null);
    // Text enlargement must keep actual page controls readable and within the viewport.
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow with 200% text');
    await page.screenshot({ path: path.join(output, 'text-200.png'), fullPage: true });
    await page.unroute(API_URL);
    await page.route(API_URL, route => route.fulfill({ json: { ...fixture, assets: fixture.assets.filter(asset => !asset.name.endsWith('.apk')) } }));
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('[data-download-state]'));
    assert.equal(await page.locator('[data-download="android"]').first().getAttribute('href'), RELEASES_URL);
    assert.match(await page.locator('[data-asset-note="android"]').innerText(), /não incluído/);
    assert.equal(await page.locator('[data-download="windows"]').first().getAttribute('data-download-state'), 'direct');
    for (const response of [{ status: 403, body: 'Rate limited' }, { status: 200, body: 'invalid JSON' }, { json: {} }]) {
      await page.unroute(API_URL);
      await page.route(API_URL, route => route.fulfill(response));
      await page.goto(base);
      await page.waitForFunction(() => document.querySelector('[data-download-state="fallback"]'));
      for (const link of await page.locator('[data-download]').all()) assert.equal(await link.getAttribute('href'), RELEASES_URL);
      assert.match(await page.locator('#release-status').innerText(), /Não foi possível/);
    }
    const noJS = await browser.newPage({ javaScriptEnabled: false });
    await noJS.goto(base);
    for (const link of await noJS.locator('[data-download]').all()) assert.equal(await link.getAttribute('href'), RELEASES_URL);
    assert.ok(await noJS.locator('noscript').isVisible());
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: 6 viewport sizes, direct-link hrefs, missing APK, API/JSON failures, no JavaScript, keyboard, 200% text, reduced motion.');
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
