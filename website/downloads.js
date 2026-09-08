/* Plain script so the page also works when index.html is opened directly. */
(function (root) {
  'use strict';

  const RELEASES_URL = 'https://github.com/adriantinoco-dev/Krumer/releases';
  const API_URL = 'https://api.github.com/repos/adriantinoco-dev/Krumer/releases/latest';
  const PLATFORMS = {
    windows: { extension: '.exe', label: 'Windows' },
    appimage: { extension: '.appimage', label: 'AppImage' },
    deb: { extension: '.deb', label: 'pacote .deb' },
    android: { extension: '.apk', label: 'APK beta' },
  };

  function safeAssetUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'github.com' &&
        !url.username && !url.password && !url.port &&
        url.pathname.startsWith('/adriantinoco-dev/Krumer/releases/download/')
        ? url.href : null;
    } catch { return null; }
  }

  function chooseAsset(assets, extension) {
    const candidates = assets.filter(asset => asset && typeof asset.name === 'string' &&
      asset.name.toLowerCase().endsWith(extension) &&
      !/(?:backend|debug|uninstall)/i.test(asset.name) &&
      safeAssetUrl(asset.browser_download_url));
    // Prefer universal packages, then x64 desktop builds. Show the actual filename
    // beneath the button so the visitor can check architecture before installing.
    const rank = asset => /universal/i.test(asset.name) ? 0 :
      /(?:x64|amd64|x86_64)/i.test(asset.name) ? 1 :
      /(?:arm64|aarch64|armeabi|armv7|ia32|i[3-6]86|x86)/i.test(asset.name) ? 3 : 2;
    candidates.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    if (!candidates.length) return null;
    return { name: candidates[0].name, url: safeAssetUrl(candidates[0].browser_download_url) };
  }

  function resolveRelease(release) {
    if (!release || typeof release !== 'object' || release.draft || release.prerelease ||
      !Array.isArray(release.assets) || typeof release.tag_name !== 'string' ||
      !release.tag_name.trim()) throw new Error('Invalid release');
    const date = typeof release.published_at === 'string' ? new Date(release.published_at) : null;
    return {
      version: release.tag_name.trim(),
      date: date && !Number.isNaN(date.getTime()) ?
        new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date) : null,
      assets: Object.fromEntries(Object.entries(PLATFORMS).map(([key, platform]) =>
        [key, chooseAsset(release.assets, platform.extension)])),
    };
  }

  async function fetchRelease(fetcher, timeoutMs = 8000) {
    const controller = new AbortController();
    let timer;
    try {
      // Race also bounds JSON parsing and fetch implementations that ignore abort.
      return await Promise.race([
        (async () => {
          const response = await fetcher(API_URL, {
            headers: { Accept: 'application/vnd.github+json' },
            signal: controller.signal,
            credentials: 'omit',
          });
          if (!response.ok) throw new Error('Release unavailable');
          return resolveRelease(await response.json());
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Release timeout')); }, timeoutMs);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  function renderDownloads(doc, release) {
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      const asset = release ? release.assets[key] : null;
      doc.querySelectorAll('[data-download="' + key + '"]').forEach(link => {
        link.href = asset ? asset.url : RELEASES_URL;
        const label = link.querySelector('[data-link-label]');
        const quickLink = Boolean(link.closest('.hero-downloads'));
        if (label) label.textContent = asset || quickLink ? link.dataset.label : 'Ver ' + platform.label + ' nas Releases';
        const description = asset ? 'Baixar ' + asset.name : platform.label + ': consultar arquivos nas Releases do GitHub';
        link.setAttribute('aria-label', description);
        link.title = description;
        link.dataset.downloadState = asset ? 'direct' : 'fallback';
      });
      const note = doc.querySelector('[data-asset-note="' + key + '"]');
      if (note) note.textContent = asset ? asset.name : release ?
        'Arquivo não incluído nesta release. Consulte outras versões no GitHub.' :
        'Confira o arquivo e os requisitos nas Releases do GitHub.';
    }
    const status = doc.getElementById('release-status');
    if (status) status.textContent = release ?
      'Última release: ' + release.version + (release.date ? ' · ' + release.date : '') :
      'Não foi possível consultar a última versão. Os downloads continuam nas Releases do GitHub.';
  }

  async function init(doc, fetcher) {
    const status = doc.getElementById('release-status');
    if (status) status.textContent = 'Consultando a última versão…';
    try { renderDownloads(doc, await fetchRelease(fetcher)); }
    catch { renderDownloads(doc, null); }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_URL, RELEASES_URL, resolveRelease, fetchRelease, renderDownloads };
  } else if (root.document) {
    init(root.document, root.fetch.bind(root));
  }
})(typeof window !== 'undefined' ? window : globalThis);
