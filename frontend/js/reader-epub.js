/* ==========================================================================
   Krumer Personal Library - EPUB Reader Module (epub.js)
   Equivalente ao reader-pdf.js, mas para arquivos .epub
   ========================================================================== */

let epubBook = null;
let epubRendition = null;
let epubCurrentItem = null;
let epubCurrentFilePath = null;
let epubCurrentCfi = null;
let epubTotalLocations = 0;
let epubCurrentLocationIndex = 0;
let epubToc = [];
let epubTheme = 'dark';
let epubFontSize = 100; // percentual
let epubIsFullscreen = false;

// ──────────────────────────────────────────────────────────────────────────────
// Inicialização
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Abre e inicializa a leitura de um arquivo EPUB.
 * @param {Object} item   - Objeto do item da biblioteca
 * @param {string} filePath - Caminho/URL do arquivo .epub
 */
async function openEpub(item, filePath) {
  epubCurrentItem = item;
  epubCurrentFilePath = filePath || item.path;

  // Restaurar preferências salvas
  epubTheme = localStorage.getItem('krumer_epub_theme') || 'dark';
  epubFontSize = parseInt(localStorage.getItem('krumer_epub_font_size') || '100', 10);
  epubIsFullscreen = false;
  document.body.classList.remove('reader-fullscreen');
  const fsBar = document.getElementById('reader-fullscreen-bar');
  if (fsBar) fsBar.style.display = 'none';

  showReaderView('epub');

  const titleEl = document.getElementById('reader-title');
  const subtitleEl = document.getElementById('reader-subtitle');
  if (titleEl) titleEl.textContent = item.title || I18N.t('reader.epub.fallback_title');
  if (subtitleEl) subtitleEl.textContent = item.author ? `${I18N.t('details.author_prefix')} ${item.author}` : '';

  showReaderLoading(true);

  try {
    const fileUrl = LibraryAPI.getFileUrl(epubCurrentFilePath);

    // Destruir instância anterior se existir
    if (epubBook) {
      epubBook.destroy();
      epubBook = null;
    }

    // Carrega o EPUB como ArrayBuffer para que o epub.js resolva
    // os recursos internos via JSZip, sem depender de URLs externas
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(I18N.t('reader.epub.download_error', response.status));
    const arrayBuffer = await response.arrayBuffer();

    epubBook = ePub(arrayBuffer);

    // Limpar e preparar container
    const container = document.getElementById('reader-container');
    if (container) {
      container.innerHTML = '';
      container.className = 'epub-mode';
    }

    // Criar elemento de renderização do epub.js
    const epubArea = document.createElement('div');
    epubArea.id = 'epub-render-area';
    if (container) container.appendChild(epubArea);

    epubRendition = epubBook.renderTo('epub-render-area', {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
    });

    // Aplicar tema e fonte salvos antes de exibir
    // (não usa mais rendition.themes — injetamos CSS diretamente nos contents)
    _applyEpubTheme(epubTheme, false);
    _applyEpubFontSize(epubFontSize, false);

    // Aplicar o tema a cada novo capítulo que for renderizado
    epubRendition.on('rendered', () => {
      _injectThemeToRendered();
    });

    // Carregar TOC (sumário)
    epubBook.loaded.navigation.then((nav) => {
      epubToc = nav.toc || [];
    });

    // Gerar localizações em segundo plano, sem bloquear a abertura do livro
    epubBook.ready.then(async () => {
      try {
        await epubBook.locations.generate(1500);
        epubTotalLocations = epubBook.locations.total;
      } catch (locErr) {
        console.warn('Erro ao gerar localizações EPUB:', locErr);
      }
      // Recalcular a posição atual assim que as localizações estiverem prontas
      if (epubCurrentCfi) {
        const idx = epubBook.locations.locationFromCfi(epubCurrentCfi);
        epubCurrentLocationIndex = idx >= 0 ? idx : 0;
      }
      updateEpubControlsState();
    });

    // Buscar CFI salvo
    let startCfi = null;
    try {
      const progressList = await LibraryAPI.getProgress(item.id);
      if (Array.isArray(progressList) && progressList.length > 0) {
        const match = progressList.find(p => p.file_path === epubCurrentFilePath) || progressList[0];
        // Só restaura a posição se houver leitura de fato (progresso > 0).
        // Item marcado como não lido (progresso zerado) deve abrir na primeira página.
        if (match && match.cfi && (match.progress_pct || 0) > 0) {
          startCfi = match.cfi;
        }
      }
    } catch (progErr) {
      console.warn('Progresso EPUB não encontrado:', progErr);
    }

    // Configurar eventos do rendition ANTES de exibir,
    // para capturar a posição inicial restaurada
    epubRendition.on('relocated', (location) => {
      epubCurrentCfi = location.start.cfi;
      const idx = epubBook.locations.locationFromCfi(location.start.cfi);
      epubCurrentLocationIndex = idx >= 0 ? idx : 0;
      updateEpubControlsState();
      saveEpubProgress();
    });

    epubRendition.on('keydown', epubKeyHandler);

    // Exibir e navegar para a posição salva
    if (startCfi) {
      await epubRendition.display(startCfi);
    } else {
      await epubRendition.display();
    }

    showReaderLoading(false);
    setupEpubControls();
    updateEpubControlsState();
    document.addEventListener('keydown', epubKeyHandler);

  } catch (err) {
    console.error('Erro ao abrir arquivo EPUB:', err);
    showReaderLoading(false);
    showReaderError(I18N.t('reader.epub.open_error', err.message));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Navegação
// ──────────────────────────────────────────────────────────────────────────────

/** Avança para a próxima página/seção */
async function epubNext() {
  if (epubRendition) {
    await epubRendition.next();
  }
}

/** Volta para a página/seção anterior */
async function epubPrev() {
  if (epubRendition) {
    await epubRendition.prev();
  }
}

/**
 * Navega para um item de sumário (TOC) pelo href/src do capítulo.
 * @param {string} href - Endereço do capítulo no EPUB
 */
async function epubGoToChapter(href) {
  if (epubRendition) {
    await epubRendition.display(href);
    _closeTocPanel();
  }
}

const EPUB_THEMES = {
  dark: {
    body: {
      background: '#111111 !important',
      color: '#e8e8e8 !important',
      'font-family': 'Georgia, "Times New Roman", serif !important',
      'line-height': '1.8 !important',
    },
    a: { color: '#f97316 !important' },
  },
  light: {
    body: {
      background: '#fafafa !important',
      color: '#1a1a1a !important',
      'font-family': 'Georgia, "Times New Roman", serif !important',
      'line-height': '1.8 !important',
    },
    a: { color: '#ea6a0a !important' },
  },
  sepia: {
    body: {
      background: '#f4ede0 !important',
      color: '#3b2f1e !important',
      'font-family': 'Georgia, "Times New Roman", serif !important',
      'line-height': '1.8 !important',
    },
    a: { color: '#8b5e3c !important' },
  },
};

function _buildThemeCss(theme) {
  const rules = EPUB_THEMES[theme] || EPUB_THEMES.dark;
  const body = rules.body;
  const a = rules.a;
  return `body{background:${body.background};color:${body.color};font-family:${body['font-family']};line-height:${body['line-height']}}a{color:${a.color}}`;
}

function _injectThemeToContent(content, css) {
  if (!content || !content.document) return;
  let style = content.document.getElementById('krumer-theme');
  if (!style) {
    style = content.document.createElement('style');
    style.id = 'krumer-theme';
    content.document.head.appendChild(style);
  }
  style.textContent = css;
}

function _injectThemeToRendered() {
  if (!epubRendition) return;
  const css = _buildThemeCss(epubTheme);
  const contents = epubRendition.getContents();
  for (const c of contents) {
    _injectThemeToContent(c, css);
  }
}

/**
 * Aplica um tema aos contents do epub.js injetando CSS diretamente
 * nos documentos de cada iframe — muito mais rápido que rendition.themes
 * quando há muitos capítulos já renderizados.
 * @param {string} theme   - 'dark' | 'light' | 'sepia'
 * @param {boolean} persist - Se deve salvar no localStorage
 */
function _applyEpubTheme(theme, persist = true) {
  if (!epubRendition) return;

  epubTheme = theme;
  _injectThemeToRendered();

  if (persist) {
    try { localStorage.setItem('krumer_epub_theme', theme); } catch (_) {}
  }

  // Atualizar botões visuais do painel de configurações
  document.querySelectorAll('.epub-theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

/**
 * Aplica tamanho de fonte ao rendition do epub.js.
 * @param {number} size    - Percentual (60-200)
 * @param {boolean} persist
 */
function _applyEpubFontSize(size, persist = true) {
  if (!epubRendition) return;

  epubFontSize = Math.min(200, Math.max(60, size));
  epubRendition.themes.fontSize(`${epubFontSize}%`);

  if (persist) {
    try { localStorage.setItem('krumer_epub_font_size', String(epubFontSize)); } catch (_) {}
  }

  // Atualizar badge de tamanho de fonte
  const badge = document.getElementById('epub-font-size-badge');
  if (badge) badge.textContent = `${epubFontSize}%`;

  const slider = document.getElementById('epub-font-slider');
  if (slider && parseInt(slider.value, 10) !== epubFontSize) {
    slider.value = epubFontSize;
  }

  if (typeof showReaderZoomToast === 'function') {
    showReaderZoomToast(epubFontSize, 'Fonte');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// TOC Panel
// ──────────────────────────────────────────────────────────────────────────────

function _openTocPanel() {
  const panel = document.getElementById('epub-toc-panel');
  if (!panel) return;

  panel.innerHTML = '';

  if (!epubToc || epubToc.length === 0) {
    panel.innerHTML = `<p style="padding:16px; color:var(--text-muted); font-size:13px;">${I18N.t('reader.epub.toc_unavailable')}</p>`;
    panel.classList.add('active');
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'epub-toc-list';

  function renderItems(items, parentEl, depth = 0) {
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'epub-toc-item';
      li.style.paddingLeft = `${depth * 16 + 16}px`;

      const btn = document.createElement('button');
      btn.className = 'epub-toc-btn';
      btn.textContent = item.label;
      btn.addEventListener('click', () => epubGoToChapter(item.href));
      li.appendChild(btn);

      if (item.subitems && item.subitems.length > 0) {
        const subUl = document.createElement('ul');
        subUl.className = 'epub-toc-list';
        renderItems(item.subitems, subUl, depth + 1);
        li.appendChild(subUl);
      }

      parentEl.appendChild(li);
    });
  }

  renderItems(epubToc, ul);
  panel.appendChild(ul);
  panel.classList.add('active');
}

function _closeTocPanel() {
  const panel = document.getElementById('epub-toc-panel');
  if (panel) panel.classList.remove('active');
}

function _toggleTocPanel() {
  const panel = document.getElementById('epub-toc-panel');
  if (!panel) return;
  if (panel.classList.contains('active')) {
    _closeTocPanel();
  } else {
    _openTocPanel();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Controles da toolbar
// ──────────────────────────────────────────────────────────────────────────────

function setupEpubControls() {
  const controlsContainer = document.getElementById('reader-controls');
  if (!controlsContainer) return;

  controlsContainer.innerHTML = `
    <div class="reader-controls-group">
      <button id="epub-btn-prev" class="btn-reader-ctrl" title="${I18N.t('reader.epub.prev')}">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div class="reader-page-indicator">
        <span id="epub-progress-label" style="font-size:12px; color:var(--text-muted);"></span>
      </div>

      <button id="epub-btn-next" class="btn-reader-ctrl" title="${I18N.t('reader.epub.next')}">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Botão Tela Cheia -->
    <button id="btn-fullscreen" class="btn-mode-toggle" title="${I18N.t('reader.fullscreen')}">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"></path>
      </svg>
      <span>${I18N.t('reader.fullscreen')}</span>
    </button>

    <!-- Configurações (tema + fonte) -->
    <div class="reader-settings-wrapper">
      <button id="epub-settings-toggle" class="btn-mode-toggle" title="${I18N.t('reader.settings')}">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <div id="epub-settings-popover" class="reader-settings-popover hidden">
        <div class="settings-popover-header">
          <span class="settings-popover-title">${I18N.t('reader.epub.settings_title')}</span>
        </div>

        <!-- Tema -->
        <div class="settings-option-group">
          <div class="settings-option-label">
            <span>${I18N.t('reader.epub.settings_theme')}</span>
          </div>
          <div class="epub-theme-buttons">
            <button type="button" class="epub-theme-btn ${epubTheme === 'dark' ? 'active' : ''}" data-theme="dark">${I18N.t('reader.epub.settings_theme_dark')}</button>
            <button type="button" class="epub-theme-btn ${epubTheme === 'light' ? 'active' : ''}" data-theme="light">${I18N.t('reader.epub.settings_theme_light')}</button>
            <button type="button" class="epub-theme-btn ${epubTheme === 'sepia' ? 'active' : ''}" data-theme="sepia">${I18N.t('reader.epub.settings_theme_sepia')}</button>
          </div>
        </div>

        <!-- Tamanho de fonte -->
        <div class="settings-option-group" style="margin-top:14px;">
          <div class="settings-option-label">
            <span>${I18N.t('reader.epub.settings_font_size')}</span>
            <span id="epub-font-size-badge" class="zoom-value-badge">${epubFontSize}%</span>
          </div>
          <div class="zoom-slider-container">
            <span class="zoom-min-label">60%</span>
            <input type="range" id="epub-font-slider" min="60" max="200" step="5"
              value="${epubFontSize}" class="reader-zoom-slider">
            <span class="zoom-max-label">200%</span>
          </div>
          <div class="zoom-preset-buttons">
            <button type="button" class="btn-zoom-preset" data-size="80">80%</button>
            <button type="button" class="btn-zoom-preset" data-size="100">100%</button>
            <button type="button" class="btn-zoom-preset" data-size="120">120%</button>
            <button type="button" class="btn-zoom-preset" data-size="150">150%</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Navegação anterior / próxima
  document.getElementById('epub-btn-prev')?.addEventListener('click', () => epubPrev());
  document.getElementById('epub-btn-next')?.addEventListener('click', () => epubNext());

  // Fullscreen toggle logic
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    epubIsFullscreen = !epubIsFullscreen;
    document.body.classList.toggle('reader-fullscreen', epubIsFullscreen);
    const fsBar = document.getElementById('reader-fullscreen-bar');
    if (fsBar) {
      fsBar.style.display = epubIsFullscreen ? 'flex' : 'none';
    }
  });

  // Fullscreen back button
  const fsBackBtn = document.getElementById('btn-back-fullscreen');
  if (fsBackBtn) {
    fsBackBtn.onclick = () => {
      if (typeof closeReader === 'function') closeReader();
    };
  }

  // Exit fullscreen (stay in reader)
  const fsExitBtn = document.getElementById('btn-exit-fullscreen');
  if (fsExitBtn) {
    fsExitBtn.addEventListener('click', () => {
      epubIsFullscreen = false;
      document.body.classList.remove('reader-fullscreen');
      const fsBar = document.getElementById('reader-fullscreen-bar');
      if (fsBar) fsBar.style.display = 'none';
    });
  }

  // Settings popover
  const settingsBtn = document.getElementById('epub-settings-toggle');
  const popover = document.getElementById('epub-settings-popover');
  if (settingsBtn && popover) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('hidden');
      settingsBtn.classList.toggle('active', !popover.classList.contains('hidden'));
    });
    popover.addEventListener('click', (e) => e.stopPropagation());
  }

  // Botões de tema
  document.querySelectorAll('.epub-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => _applyEpubTheme(btn.dataset.theme));
  });

  // Slider de fonte
  const fontSlider = document.getElementById('epub-font-slider');
  if (fontSlider) {
    fontSlider.addEventListener('input', (e) => {
      _applyEpubFontSize(parseInt(e.target.value, 10));
    });
  }

  // Presets de fonte
  document.querySelectorAll('.btn-zoom-preset[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      _applyEpubFontSize(parseInt(btn.dataset.size, 10));
    });
  });

  // Fechar popover ao clicar fora
  document.addEventListener('click', _onOutsideClickEpub);
}

function _onOutsideClickEpub(e) {
  const popover = document.getElementById('epub-settings-popover');
  const btn = document.getElementById('epub-settings-toggle');
  if (popover && !popover.classList.contains('hidden')) {
    if (!popover.contains(e.target) && !btn?.contains(e.target)) {
      popover.classList.add('hidden');
      btn?.classList.remove('active');
    }
  }

  const tocPanel = document.getElementById('epub-toc-panel');
  if (tocPanel && tocPanel.classList.contains('active')) {
    if (!tocPanel.contains(e.target)) {
      _closeTocPanel();
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Estado dos controles
// ──────────────────────────────────────────────────────────────────────────────

function updateEpubControlsState() {
  if (!epubBook || !epubBook.locations || epubTotalLocations === 0) return;

  const pct = Math.round((epubCurrentLocationIndex / epubTotalLocations) * 100);
  const pageText = `Pág. ${epubCurrentLocationIndex + 1} / ${epubTotalLocations} · ${pct}%`;

  const label = document.getElementById('epub-progress-label');
  if (label) label.textContent = pageText;

  const fsLabel = document.getElementById('fullscreen-progress-label');
  if (fsLabel) fsLabel.textContent = pageText;
}

// ──────────────────────────────────────────────────────────────────────────────
// Progresso
// ──────────────────────────────────────────────────────────────────────────────

async function saveEpubProgress() {
  if (!epubCurrentItem || !epubCurrentCfi || epubTotalLocations === 0) return;

  const pct = epubTotalLocations > 0
    ? Math.min(100, Math.round((epubCurrentLocationIndex / epubTotalLocations) * 100 * 10) / 10)
    : 0;

  try {
    await LibraryAPI.saveProgress(epubCurrentItem.id, {
      file_path: epubCurrentFilePath,
      progress_pct: pct,
      current_page: epubCurrentLocationIndex,
      total_pages: epubTotalLocations,
      cfi: epubCurrentCfi,
    });
  } catch (err) {
    console.warn('Erro ao salvar progresso EPUB:', err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Teclado
// ──────────────────────────────────────────────────────────────────────────────

function epubKeyHandler(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Atalhos de Zoom / Tamanho de fonte (Ctrl+ / Ctrl- / Ctrl 0)
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault();
      _applyEpubFontSize(Math.min(200, epubFontSize + 10));
      return;
    }
    if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      _applyEpubFontSize(Math.max(60, epubFontSize - 10));
      return;
    }
    if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
      e.preventDefault();
      _applyEpubFontSize(100);
      return;
    }
  }

  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    epubPrev();
  } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault();
    epubNext();
  } else if (e.key === 'Escape') {
    // Fechar popover de configurações primeiro
    const popover = document.getElementById('epub-settings-popover');
    if (popover && !popover.classList.contains('hidden')) {
      e.preventDefault();
      popover.classList.add('hidden');
      document.getElementById('epub-settings-toggle')?.classList.remove('active');
      return;
    }

    // Fechar painel de TOC
    const tocPanel = document.getElementById('epub-toc-panel');
    if (tocPanel && tocPanel.classList.contains('active')) {
      e.preventDefault();
      _closeTocPanel();
      return;
    }

    e.preventDefault();
    if (window.closeReader) window.closeReader();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    epubIsFullscreen = !epubIsFullscreen;
    document.body.classList.toggle('reader-fullscreen', epubIsFullscreen);
    const fsBar = document.getElementById('reader-fullscreen-bar');
    if (fsBar) fsBar.style.display = epubIsFullscreen ? 'flex' : 'none';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Fechar
// ──────────────────────────────────────────────────────────────────────────────

function closeEpub() {
  document.removeEventListener('keydown', epubKeyHandler);
  document.removeEventListener('click', _onOutsideClickEpub);

  epubIsFullscreen = false;
  document.body.classList.remove('reader-fullscreen');
  const fsBar = document.getElementById('reader-fullscreen-bar');
  if (fsBar) fsBar.style.display = 'none';

  if (epubRendition) {
    epubRendition.destroy();
    epubRendition = null;
  }

  if (epubBook) {
    epubBook.destroy();
    epubBook = null;
  }

  epubCurrentItem = null;
  epubCurrentFilePath = null;
  epubCurrentCfi = null;
  epubCurrentLocationIndex = 0;
  epubTotalLocations = 0;
  epubToc = [];

  const container = document.getElementById('reader-container');
  if (container) {
    container.innerHTML = '';
    container.className = '';
  }

  const tocPanel = document.getElementById('epub-toc-panel');
  if (tocPanel) tocPanel.remove();
}

// ──────────────────────────────────────────────────────────────────────────────
// Expor globalmente
// ──────────────────────────────────────────────────────────────────────────────

window.openEpub = openEpub;
window.closeEpub = closeEpub;
window.epubNext = epubNext;
window.epubPrev = epubPrev;
window.epubGoToChapter = epubGoToChapter;