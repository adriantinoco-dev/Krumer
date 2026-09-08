const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveRelease, fetchRelease, API_URL } = require('../downloads.js');

const asset = name => ({ name, browser_download_url: 'https://github.com/adriantinoco-dev/Krumer/releases/download/v1.3.2/' + name });
const fixture = () => ({
  tag_name: 'v1.3.2', published_at: '2026-08-16T23:46:20Z', draft: false, prerelease: false,
  assets: ['Krumer-win-v1.3.2.exe', 'Krumer-linux-v1.3.2.AppImage', 'Krumer-linux-v1.3.2.deb', 'Krumer-android.apk', 'latest.yml', 'Krumer-win-v1.3.2.exe.blockmap'].map(asset),
});

test('resolves all four installers and release metadata, excluding updater files', () => {
  const result = resolveRelease(fixture());
  assert.equal(result.version, 'v1.3.2');
  assert.match(result.date, /16.*ago.*2026/);
  assert.match(result.assets.windows.url, /Krumer-win-v1\.3\.2\.exe$/);
  assert.match(result.assets.appimage.url, /\.AppImage$/);
  assert.match(result.assets.deb.url, /\.deb$/);
  assert.match(result.assets.android.url, /\.apk$/);
});

test('missing APK preserves the desktop downloads', () => {
  const release = fixture();
  release.assets = release.assets.filter(item => !item.name.endsWith('.apk'));
  const result = resolveRelease(release);
  assert.equal(result.assets.android, null);
  assert.ok(result.assets.windows);
  assert.ok(result.assets.appimage);
  assert.ok(result.assets.deb);
});

test('empty assets are a valid release with no direct downloads', () => {
  assert.deepEqual(resolveRelease({ ...fixture(), assets: [] }).assets,
    { windows: null, appimage: null, deb: null, android: null });
});

test('rejects malformed, draft and pre-release payloads', () => {
  for (const payload of [null, [], {}, { ...fixture(), assets: null },
    { ...fixture(), tag_name: '' }, { ...fixture(), draft: true }, { ...fixture(), prerelease: true }]) {
    assert.throws(() => resolveRelease(payload));
  }
});

test('unknown publication date is omitted instead of invented', () => {
  for (const date of [undefined, null, '', 'invalid']) {
    assert.equal(resolveRelease({ ...fixture(), published_at: date }).date, null);
  }
});

test('ignores malformed assets, untrusted URLs and backend/debug executables', () => {
  const unsafe = ['javascript:alert(1)', 'https://example.com/setup.exe',
    'https://github.com/another/project/releases/download/v1/a.exe',
    'http://github.com/adriantinoco-dev/Krumer/releases/download/v1/a.exe'];
  const release = { ...fixture(), assets: [null, {}, asset('krumer-backend.exe'), asset('app-debug.apk'),
    ...unsafe.map(browser_download_url => ({ name: 'setup.exe', browser_download_url }))] };
  assert.equal(resolveRelease(release).assets.windows, null);
  assert.equal(resolveRelease(release).assets.android, null);
});

test('multiple architectures choose universal APK and x64 desktop deterministically', () => {
  const release = { ...fixture(), assets: ['Krumer-arm64.exe', 'Krumer-x64.exe', 'Krumer-arm64.apk', 'Krumer-universal.apk'].map(asset) };
  const result = resolveRelease(release);
  assert.equal(result.assets.windows.name, 'Krumer-x64.exe');
  assert.equal(result.assets.android.name, 'Krumer-universal.apk');
});

test('fetch uses the public API without credentials', async () => {
  const result = await fetchRelease(async (url, options) => {
    assert.equal(url, API_URL);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, undefined);
    return { ok: true, json: async () => fixture() };
  });
  assert.equal(result.version, 'v1.3.2');
});

test('HTTP errors, invalid JSON and network failures reject for UI fallback', async () => {
  await assert.rejects(fetchRelease(async () => ({ ok: false })));
  await assert.rejects(fetchRelease(async () => ({ ok: true, json: async () => { throw new Error('JSON'); } })));
  await assert.rejects(fetchRelease(async () => { throw new Error('Network'); }));
});

test('timeout bounds both connection and body parsing', async () => {
  await assert.rejects(fetchRelease(() => new Promise(() => {}), 20), /timeout/);
  await assert.rejects(fetchRelease(async () => ({ ok: true, json: () => new Promise(() => {}) }), 20), /timeout/);
});

module.exports = { fixture };
