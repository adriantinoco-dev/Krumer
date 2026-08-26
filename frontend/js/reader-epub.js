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
let epubColumnMode = 'single'; // 'single' | 'double' (Plano B — duas colunas)

// Highlights (Feature A)
let epubHighlights = []; // [{id, cfi_range, color, text_excerpt}]
let epubSelectedCfi = null;
let epubSelectedText = '';
let epubSelectedContents = null;
const EPUB_HIGHLIGHT_COLORS = {
  yellow: { fill: '#facc15', 'fill-opacity': '0.75', 'mix-blend-mode': 'normal' },
  green:  { fill: '#4ade80', 'fill-opacity': '0.75', 'mix-blend-mode': 'normal' },
  blue:   { fill: '#60a5fa', 'fill-opacity': '0.75', 'mix-blend-mode': 'normal' },
  pink:   { fill: '#f472b6', 'fill-opacity': '0.75', 'mix-blend-mode': 'normal' },
};
const EPUB_HIGHLIGHT_CSS_BY_COLOR = {
  yellow: 'rgba(250,204,21,0.35)',
  green:  'rgba(74,222,128,0.35)',
  blue:   'rgba(96,165,250,0.35)',
  pink:   'rgba(244,114,182,0.35)',
};

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
  epubColumnMode = localStorage.getItem('krumer_epub_column') === 'double' ? 'double' : 'single';
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

    _ensureHighlightPopoversDom();

    epubRendition = epubBook.renderTo('epub-render-area', {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: epubColumnMode === 'double' ? 'auto' : 'none',
    });

    // Aplicar tema e fonte salvos antes de exibir
    // (não usa mais rendition.themes — injetamos CSS diretamente nos contents)
    _applyEpubTheme(epubTheme, false);
    _applyEpubFontSize(epubFontSize, false);

    // Aplicar o tema a cada novo capítulo que for renderizado
    epubRendition.on('rendered', () => {
      _injectThemeToRendered();
      _renderHighlightsInCurrentView();
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
      _hideHighlightPopovers();
      epubCurrentCfi = location.start.cfi;
      const idx = epubBook.locations.locationFromCfi(location.start.cfi);
      epubCurrentLocationIndex = idx >= 0 ? idx : 0;
      updateEpubControlsState();
      saveEpubProgress();
    });

    epubRendition.on('keydown', epubKeyHandler);

    // Destaques: capturar seleção e cliques em highlights
    _setupHighlightListeners();
    document.addEventListener('mousedown', _onDocClickHideHl);
    // Carregar e renderizar highlights já salvos (não bloqueia display)
    _fetchAndRenderHighlights(item.id).catch(err => console.warn('Highlights load fail', err));

    // Exibir e navegar para a posição salva
    if (startCfi) {
      await epubRendition.display(startCfi);
    } else {
      await epubRendition.display();
    }

    showReaderLoading(false);
    setupEpubControls();
    updateEpubControlsState();
    // Destaques são re-aplicados também via 'rendered'
    setTimeout(() => _renderHighlightsInCurrentView(), 400);
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
  _hideHighlightPopovers();
  if (epubRendition) {
    await epubRendition.next();
  }
}

/** Volta para a página/seção anterior */
async function epubPrev() {
  _hideHighlightPopovers();
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

function _injectHighlightStylesToContent(content) {
  if (!content || !content.document) return;
  let style = content.document.getElementById('krumer-highlight');
  if (!style) {
    style = content.document.createElement('style');
    style.id = 'krumer-highlight';
    content.document.head.appendChild(style);
  }
  style.textContent = `
    .krumer-hl-yellow { background: rgba(250,204,21,0.75) !important; }
    .krumer-hl-green  { background: rgba(74,222,128,0.75) !important; }
    .krumer-hl-blue   { background: rgba(96,165,250,0.75) !important; }
    .krumer-hl-pink   { background: rgba(244,114,182,0.75) !important; }
    g.krumer-hl-yellow rect, g.krumer-hl-yellow polygon { fill: rgba(250,204,21,0.75) !important; fill-opacity: 1 !important; }
    g.krumer-hl-green  rect, g.krumer-hl-green  polygon { fill: rgba(74,222,128,0.75) !important; fill-opacity: 1 !important; }
    g.krumer-hl-blue   rect, g.krumer-hl-blue   polygon { fill: rgba(96,165,250,0.75) !important; fill-opacity: 1 !important; }
    g.krumer-hl-pink   rect, g.krumer-hl-pink   polygon { fill: rgba(244,114,182,0.75) !important; fill-opacity: 1 !important; }
  `;
}

function _injectThemeToRendered() {
  if (!epubRendition) return;
  const css = _buildThemeCss(epubTheme);
  const contents = epubRendition.getContents();
  for (const c of contents) {
    _injectThemeToContent(c, css);
    _injectHighlightStylesToContent(c);
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

function _cycleEpubTheme() {
  const order = ['dark', 'light', 'sepia'];
  const idx = order.indexOf(epubTheme);
  const next = order[(idx + 1) % order.length];
  _applyEpubTheme(next, true);
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

function _applyEpubColumns(mode, persist = true) {
  epubColumnMode = mode === 'double' ? 'double' : 'single';
  if (epubRendition) {
    try { epubRendition.spread(epubColumnMode === 'double' ? 'auto' : 'none'); } catch (_) {}
  }
  if (persist) {
    try { localStorage.setItem('krumer_epub_column', epubColumnMode); } catch (_) {}
  }
  const btn = document.getElementById('epub-column-toggle');
  if (btn) btn.classList.toggle('active', epubColumnMode === 'double');
  if (typeof showReaderZoomToast === 'function' && persist) {
    showReaderZoomToast(epubColumnMode === 'double' ? 2 : 1, 'Colunas');
  }
}

function _toggleEpubColumns() {
  _applyEpubColumns(epubColumnMode === 'double' ? 'single' : 'double', true);
  setTimeout(() => _renderHighlightsInCurrentView(), 300);
}
window._applyEpubColumns = _applyEpubColumns;
window._toggleEpubColumns = _toggleEpubColumns;

// ──────────────────────────────────────────────────────────────────────────────
// Highlights (Feature A — marcar frase/versos, apenas EPUB)
// ──────────────────────────────────────────────────────────────────────────────

function _highlightClassForColor(color) {
  return `krumer-hl-${color || 'yellow'}`;
}

function _findOverlappingHighlights(newCfiRange, contents) {
  if (!contents || !newCfiRange || !epubHighlights.length) return [];
  const overlapping = [];
  let newRange = null;
  try { newRange = contents.range(newCfiRange); } catch (_) { return []; }
  if (!newRange) return [];
  for (const hl of epubHighlights) {
    const hlCfi = hl.cfi_range || hl.cfiRange;
    if (!hlCfi || hlCfi === newCfiRange) continue;
    try {
      const hlRange = contents.range(hlCfi);
      if (!hlRange) continue;
      const startsBeforeEnd = newRange.compareBoundaryPoints(Range.END_TO_START, hlRange) < 0;
      const endsAfterStart = newRange.compareBoundaryPoints(Range.START_TO_END, hlRange) > 0;
      if (startsBeforeEnd && endsAfterStart) overlapping.push(hl);
    } catch (_) {}
  }
  return overlapping;
}

function _renderHighlightsInCurrentView() {
  if (!epubRendition || !epubHighlights.length) return;
  for (const hl of epubHighlights) {
    try {
      const c = hl.cfi_range || hl.cfiRange;
      const color = hl.color || 'yellow';
      const style = EPUB_HIGHLIGHT_COLORS[color] || EPUB_HIGHLIGHT_COLORS.yellow;
      const cls = _highlightClassForColor(color);
      try { epubRendition.annotations.remove(c, 'highlight'); } catch (_) {}
      epubRendition.annotations.highlight(c, hl, _onHighlightClick, cls, style);
      // Forçar visibilidade imediata (corrige blend-mode multiply em tema dark)
      try {
        const views = epubRendition.views();
        for (const v of views) {
          if (v && v.pane && v.pane.element) {
            v.pane.element.style.zIndex = '5';
            const g = v.pane.element.querySelector(`g.${cls}`);
            if (g) {
              g.querySelectorAll('rect').forEach(r => {
                r.style.fill = style.fill;
                r.style.fillOpacity = style['fill-opacity'];
                r.setAttribute('fill', style.fill);
                r.setAttribute('fill-opacity', style['fill-opacity']);
              });
              g.style.mixBlendMode = style['mix-blend-mode'] || 'normal';
            }
          }
        }
      } catch (_) {}
    } catch (e) {
      // CFI ainda não mapeado neste capítulo — será tentado no próximo 'rendered'
    }
  }
}

async function _fetchAndRenderHighlights(itemId) {
  if (!itemId) return;
  const list = await LibraryAPI.getHighlights(itemId);
  epubHighlights = Array.isArray(list) ? list : [];
  _renderHighlightsInCurrentView();
  _updateHighlightCountBadge();
}

function _updateHighlightCountBadge() {
  const badge = document.getElementById('epub-highlight-count');
  if (badge) badge.textContent = String(epubHighlights.length);
}

function _ensureHighlightPopoversDom() {
  const view = document.getElementById('reader-view');
  const container = document.getElementById('reader-container');
  if (!view || !container) return;
  // Popover criação (seleção -> escolher cor)
  let pop = document.getElementById('epub-highlight-popover');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'epub-highlight-popover';
    pop.className = 'epub-highlight-popover hidden';
    pop.innerHTML = `
      <div class="hl-pop-title">${I18N.t('reader.epub.highlight_title')}</div>
      <div class="hl-colors">
        <button data-hl-color="yellow" class="hl-color-btn hl-yellow" title="${I18N.t('reader.epub.highlight_yellow')}"></button>
        <button data-hl-color="green" class="hl-color-btn hl-green" title="${I18N.t('reader.epub.highlight_green')}"></button>
        <button data-hl-color="blue" class="hl-color-btn hl-blue" title="${I18N.t('reader.epub.highlight_blue')}"></button>
        <button data-hl-color="pink" class="hl-color-btn hl-pink" title="${I18N.t('reader.epub.highlight_pink')}"></button>
      </div>
      <button data-hl-close class="hl-close" aria-label="close">&times;</button>
    `;
    view.appendChild(pop);
  }
  // Popover ações em highlight existente
  let apop = document.getElementById('epub-highlight-actions');
  if (!apop) {
    apop = document.createElement('div');
    apop.id = 'epub-highlight-actions';
    apop.className = 'epub-highlight-popover hidden';
    apop.innerHTML = `
      <div class="hl-pop-title">${I18N.t('reader.epub.highlight_edit')}</div>
      <div class="hl-colors">
        <button data-hl-color="yellow" class="hl-color-btn hl-yellow" title="${I18N.t('reader.epub.highlight_yellow')}"></button>
        <button data-hl-color="green" class="hl-color-btn hl-green" title="${I18N.t('reader.epub.highlight_green')}"></button>
        <button data-hl-color="blue" class="hl-color-btn hl-blue" title="${I18N.t('reader.epub.highlight_blue')}"></button>
        <button data-hl-color="pink" class="hl-color-btn hl-pink" title="${I18N.t('reader.epub.highlight_pink')}"></button>
      </div>
      <button data-hl-remove class="hl-remove-btn">${I18N.t('reader.epub.highlight_remove')}</button>
      <button data-hl-close class="hl-close" aria-label="close">&times;</button>
    `;
    view.appendChild(apop);
  }
}

function _getGlobalRectForRange(range, contents) {
  if (!range) return null;
  let rect = null;
  try { rect = range.getBoundingClientRect(); } catch (_) { return null; }
  if (!rect || (rect.width === 0 && rect.height === 0)) return rect;
  // Converter coordenadas do iframe para viewport global
  try {
    const win = contents ? contents.window : null;
    const iframe = win ? win.frameElement : null;
    if (iframe) {
      const iframeRect = iframe.getBoundingClientRect();
      return {
        top: iframeRect.top + rect.top,
        left: iframeRect.left + rect.left,
        bottom: iframeRect.top + rect.bottom,
        right: iframeRect.left + rect.right,
        width: rect.width,
        height: rect.height,
        x: iframeRect.left + rect.left,
        y: iframeRect.top + rect.top,
      };
    }
  } catch (_) {}
  // Se não conseguimos iframe, assumir rect já é global (ex: epub.js paginated com um único viewport)
  return rect;
}

function _setupHighlightListeners() {
  if (!epubRendition) return;
  // Evento 'selected' do epub.js entrega cfiRange + contents com Range nativo
  try {
    epubRendition.on('selected', (cfiRange, contents) => {
      try {
        const range = contents && contents.range ? contents.range(cfiRange) : null;
        let text = '';
        if (range) text = (range.toString() || '').trim();
        if (!text && contents && contents.window) {
          const sel = contents.window.getSelection();
          if (sel) text = (sel.toString() || '').trim();
        }
        // Ignorar seleções muito curtas
        if (!cfiRange || text.length < 2) {
          _hideHighlightPopovers();
          return;
        }
        epubSelectedCfi = cfiRange;
        epubSelectedText = text.slice(0, 2000);
        epubSelectedContents = contents;
        // Calcular posição global do popover ancorado à seleção (acima do texto)
        let globalRect = null;
        try { if (range) globalRect = _getGlobalRectForRange(range, contents); } catch (_) {}
        if (!globalRect || (globalRect.width === 0 && globalRect.height === 0)) {
          // fallback: usar posição do iframe ou centro da área
          const area = document.getElementById('epub-render-area');
          if (area) {
            const r = area.getBoundingClientRect();
            globalRect = { top: r.top + r.height * 0.3, left: r.left + r.width / 2, width: 0, height: 0, bottom: r.top + r.height * 0.3, right: r.left + r.width / 2 };
          }
        }
        _showSelectionPopover(cfiRange, globalRect, text);
      } catch (e) {
        console.warn('selected handler', e);
      }
    });
  } catch (_) {}

  // Fallback / complemento: mouseup dentro dos iframes também abre popover caso 'selected' não dispare
  epubRendition.on('rendered', (section) => {
    try {
      const contents = epubRendition.getContents();
      for (const c of contents) {
        if (!c || !c.document) continue;
        _injectHighlightStylesToContent(c);
        if (c.document.__krumerHlBound) continue;
        c.document.__krumerHlBound = true;
        c.document.addEventListener('mouseup', (ev) => {
          // Guardar posição do mouse global para posicionar popover corretamente
          const lastMouse = { x: ev.clientX, y: ev.clientY };
          setTimeout(() => {
            try {
              const sel = c.window.getSelection();
              if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
              const text = (sel.toString() || '').trim();
              if (text.length < 2) return;
              const range = sel.getRangeAt(0);
              let cfi = null;
              try {
                if (c && typeof c.cfiFromRange === 'function') cfi = c.cfiFromRange(range);
                else if (contents && typeof contents.cfiFromRange === 'function') cfi = contents.cfiFromRange(range);
                // Tentativa alternativa via epub.js book
                if (!cfi && epubBook && epubBook.cfi && typeof epubBook.cfi.generate === 'function') {
                  // não usado
                }
              } catch (_) {}
              if (!cfi) return; // sem CFI não persistimos
              const exists = epubHighlights.some(h => (h.cfi_range || h.cfiRange) === cfi);
              if (exists) return;
              epubSelectedCfi = cfi;
              epubSelectedText = text.slice(0, 2000);
              epubSelectedContents = c;
              let globalRect = null;
              try { globalRect = _getGlobalRectForRange(range, c); } catch (_) {}
              // Se rect falhou, usar posição do mouse convertida para global
              if (!globalRect || globalRect.width === 0) {
                const iframe = c.window.frameElement;
                if (iframe) {
                  const iframeRect = iframe.getBoundingClientRect();
                  globalRect = { top: iframeRect.top + lastMouse.y - iframeRect.top, left: iframeRect.left + lastMouse.x - iframeRect.left, width: 0, height: 0, bottom: iframeRect.top + lastMouse.y - iframeRect.top, right: iframeRect.left + lastMouse.x - iframeRect.left };
                  // Na verdade lastMouse já é viewport global? ev.clientX dentro do iframe é relativo ao viewport do iframe, não global. Então precisamos somar iframeRect
                  // Mas ev.clientX em iframe's document mouseup é relativo ao iframe viewport, então converter
                  const iframeEl = c.window.frameElement;
                  if (iframeEl) {
                    const ir = iframeEl.getBoundingClientRect();
                    globalRect = { top: ir.top + ev.clientY, left: ir.left + ev.clientX, width: 0, height: 0, bottom: ir.top + ev.clientY, right: ir.left + ev.clientX };
                  }
                }
              }
              _showSelectionPopover(cfi, globalRect, text);
            } catch (_) {}
          }, 80);
        });
        // Também limpar popover ao tocar fora da seleção dentro do iframe
        c.document.addEventListener('mousedown', () => {
          _hideHighlightPopovers();
        });
      }
    } catch (_) {}
  });
}

function _onHighlightClick(e) {
  let cfi = null;
  let hl = null;
  // Tentativa 1: o data passado no highlight (epub.js pode passar annotation object)
  try {
    if (e && e.cfiRange) { cfi = e.cfiRange; }
    if (e && e.data && e.data.cfi_range) { hl = e.data; cfi = hl.cfi_range; }
    // Alguns builds passam (event, data)
    if (!cfi && e && e.target) {
      const t = e.target;
      // Tentar extrair do DOM: SVG <g> ou <rect> com data-cfi
      cfi = t.getAttribute && (t.getAttribute('data-epubcfi') || t.getAttribute('data-cfi') || t.getAttribute('epubcfi'));
      if (!cfi && t.parentElement && t.parentElement.getAttribute) {
        cfi = t.parentElement.getAttribute('data-epubcfi') || t.parentElement.getAttribute('data-cfi');
      }
      // Fallback por texto: comparar text_excerpt com texto clicado
      const clickedText = (t.textContent || '').trim().slice(0, 120);
      if (!cfi && clickedText) {
        // Encontrar highlight cujo excerto contém o texto clicado
        hl = epubHighlights.find(h => {
          const ex = (h.text_excerpt || '').trim().slice(0, 120);
          return ex && (ex.includes(clickedText) || clickedText.includes(ex.slice(0, 30)));
        });
        if (hl) cfi = hl.cfi_range || hl.cfiRange;
      }
    }
  } catch (_) {}
  if (!cfi && epubHighlights.length === 1) {
    hl = epubHighlights[0];
    cfi = hl.cfi_range || hl.cfiRange;
  }
  if (!hl && cfi) hl = epubHighlights.find(h => (h.cfi_range || h.cfiRange) === cfi);
  if (!hl) {
    const visible = epubHighlights[0];
    if (visible) { hl = visible; cfi = hl.cfi_range || hl.cfiRange; }
  }
  if (!hl || !cfi) { _hideHighlightPopovers(); return; }
  let rect = null;
  try {
    if (e && e.target) {
      const raw = e.target.getBoundingClientRect();
      // Converter para coordenadas globais se vier de dentro do iframe
      const ownerWin = e.target.ownerDocument ? e.target.ownerDocument.defaultView : null;
      const iframe = ownerWin ? ownerWin.frameElement : null;
      if (iframe && raw) {
        const iframeRect = iframe.getBoundingClientRect();
        rect = { top: iframeRect.top + raw.top, left: iframeRect.left + raw.left, bottom: iframeRect.top + raw.bottom, right: iframeRect.left + raw.right, width: raw.width, height: raw.height };
      } else {
        rect = raw;
      }
    }
  } catch (_) {}
  _showHighlightActionsPopover(cfi, hl, rect);
  try { if (e && e.stopPropagation) e.stopPropagation(); } catch (_) {}
}

function _showSelectionPopover(cfiRange, rect, text) {
  _hideHighlightPopovers();
  const pop = document.getElementById('epub-highlight-popover');
  if (!pop) return;
  pop.classList.remove('hidden');
  // posicionar perto da seleção (dentro de #reader-container)
  _positionPopover(pop, rect);
  // Atribuir handlers de cor
  pop.querySelectorAll('[data-hl-color]').forEach(btn => {
    btn.onclick = async () => {
      await _createHighlight(cfiRange, text, btn.dataset.hlColor);
      _hideHighlightPopovers();
      // limpar seleção nativa
      try {
        if (epubSelectedContents && epubSelectedContents.window) {
          epubSelectedContents.window.getSelection().removeAllRanges();
        }
        const contents = epubRendition ? epubRendition.getContents() : [];
        for (const c of contents) { try { c.window.getSelection().removeAllRanges(); } catch (_) {} }
      } catch (_) {}
    };
  });
  const btnClose = pop.querySelector('[data-hl-close]');
  if (btnClose) btnClose.onclick = () => _hideHighlightPopovers();
}

function _showHighlightActionsPopover(cfiRange, hl, rect) {
  _hideHighlightPopovers();
  const pop = document.getElementById('epub-highlight-actions');
  if (!pop) return;
  pop.dataset.cfi = cfiRange;
  pop.dataset.hlId = String(hl.id);
  pop.classList.remove('hidden');
  _positionPopover(pop, rect);
  pop.querySelectorAll('[data-hl-color]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.hlColor === hl.color);
    btn.onclick = async () => {
      await _changeHighlightColor(hl, btn.dataset.hlColor);
      _hideHighlightPopovers();
    };
  });
  const btnRemove = pop.querySelector('[data-hl-remove]');
  if (btnRemove) btnRemove.onclick = async () => {
    await _deleteHighlight(hl, cfiRange);
    _hideHighlightPopovers();
  };
  const btnClose = pop.querySelector('[data-hl-close]');
  if (btnClose) btnClose.onclick = () => _hideHighlightPopovers();
}

function _positionPopover(pop, rect) {
  const view = document.getElementById('reader-view');
  if (!view) return;
  // rect já é global (viewport) via _getGlobalRectForRange
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // garantir que pop foi renderizado para medir
  const popW = pop.offsetWidth || 220;
  const popH = pop.offsetHeight || 44;
  let top = 12, left = (vw - popW) / 2;
  if (rect) {
    const rTop = rect.top ?? 0;
    const rLeft = rect.left ?? 0;
    const rWidth = rect.width ?? 0;
    const rHeight = rect.height ?? 0;
    // Posicionar ACIMA da seleção, centralizado horizontalmente
    const centerX = rLeft + (rWidth > 0 ? rWidth / 2 : 0);
    top = rTop - popH - 12;
    left = centerX - popW / 2;
    // Se não há espaço acima (perto do topo), colocar ABAIXO da seleção
    if (top < 72) { // 60 header + 12 margem
      top = (rect.bottom ?? rTop + rHeight) + 10;
    }
    // Clampar dentro da viewport
    left = Math.max(8, Math.min(left, vw - popW - 8));
    top = Math.max(72, Math.min(top, vh - popH - 12));
  }
  // Ajustar para estar relativo ao #reader-view (que está em 0,0 viewport)
  // #reader-view é fixed 0,0 então coordenadas viewport = coordenadas dentro dele
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

function _hideHighlightPopovers() {
  const p1 = document.getElementById('epub-highlight-popover');
  const p2 = document.getElementById('epub-highlight-actions');
  if (p1) p1.classList.add('hidden');
  if (p2) p2.classList.add('hidden');
  epubSelectedCfi = null;
  epubSelectedText = '';
  epubSelectedContents = null;
}

async function _createHighlight(cfiRange, text, color) {
  if (!epubCurrentItem || !cfiRange) return;
  const colorStyle = EPUB_HIGHLIGHT_COLORS[color] || EPUB_HIGHLIGHT_COLORS.yellow;
  const className = _highlightClassForColor(color);
  // Detectar e remover destaques sobrepostos
  let replacedCount = 0;
  try {
    const contents = epubSelectedContents || (epubRendition && epubRendition.getContents()[0]);
    if (contents) {
      const overlapping = _findOverlappingHighlights(cfiRange, contents);
      for (const oldHl of overlapping) {
        const oldCfi = oldHl.cfi_range || oldHl.cfiRange;
        try { epubRendition.annotations.remove(oldCfi, 'highlight'); } catch (_) {}
        try {
          const itemId = oldHl.item_id || epubCurrentItem.id;
          if (oldHl.id && itemId) await LibraryAPI.deleteHighlight(itemId, oldHl.id);
          else if (itemId && oldCfi) await LibraryAPI.deleteHighlightByCfi(itemId, oldCfi);
        } catch (_) {}
        replacedCount++;
      }
      if (replacedCount > 0) {
        epubHighlights = epubHighlights.filter(h => !overlapping.includes(h));
      }
    }
  } catch (_) {}
  console.log('[Krumer] createHighlight', { cfiRange, text: text.slice(0,60), color, className, colorStyle, replacedCount });
  // Otimista: renderiza imediatamente
  let ann = null;
  try { ann = epubRendition.annotations.highlight(cfiRange, { cfi_range: cfiRange, color }, _onHighlightClick, className, colorStyle); console.log('[Krumer] optimistic highlight ann', ann); } catch (e) { console.warn('optimistic highlight fail', e); }
  // Forçar pane visível
  try {
    const views = epubRendition ? epubRendition.views() : [];
    for (const v of views) {
      if (v && v.pane && v.pane.element) {
        v.pane.element.style.zIndex = '10';
        v.pane.element.style.display = 'block';
        v.pane.element.style.pointerEvents = 'none';
        // Aplicar estilo diretamente nos rects do highlight recém-criado
        const mark = ann && ann.mark ? ann.mark : null;
        const g = mark && mark.element ? mark.element : v.pane.element.querySelector(`g.${className}:last-of-type`);
        if (g) {
          g.style.mixBlendMode = 'normal';
          g.querySelectorAll('rect').forEach(r => {
            r.style.fill = colorStyle.fill;
            r.style.fillOpacity = colorStyle['fill-opacity'];
            r.setAttribute('fill', colorStyle.fill);
            r.setAttribute('fill-opacity', colorStyle['fill-opacity']);
          });
          console.log('[Krumer] highlight rects', g.querySelectorAll('rect').length, 'for', cfiRange);
        } else {
          console.warn('[Krumer] no g found for highlight', className, v.pane.element.innerHTML.slice(0,500));
        }
      }
    }
  } catch (e) { console.warn('pane fix fail', e); }
  try {
    const saved = await LibraryAPI.createHighlight(epubCurrentItem.id, { cfi_range: cfiRange, text_excerpt: text, color });
    console.log('[Krumer] saved highlight', saved);
    const idx = epubHighlights.findIndex(h => (h.cfi_range || h.cfiRange) === cfiRange);
    if (idx >= 0) epubHighlights[idx] = saved;
    else epubHighlights.push(saved);
    try { epubRendition.annotations.remove(cfiRange, 'highlight'); } catch (_) {}
    const ann2 = epubRendition.annotations.highlight(cfiRange, saved, _onHighlightClick, className, colorStyle);
    console.log('[Krumer] persisted highlight ann2', ann2);
    try {
      const views2 = epubRendition ? epubRendition.views() : [];
      for (const v of views2) {
        if (v && v.pane && v.pane.element) {
          v.pane.element.style.zIndex = '10';
          const g2 = ann2 && ann2.mark ? ann2.mark.element : v.pane.element.querySelector(`g.${className}:last-of-type`);
          if (g2) {
            g2.querySelectorAll('rect').forEach(r => {
              r.style.fill = colorStyle.fill;
              r.style.fillOpacity = colorStyle['fill-opacity'];
              r.setAttribute('fill', colorStyle.fill);
              r.setAttribute('fill-opacity', colorStyle['fill-opacity']);
            });
          }
        }
      }
    } catch (_) {}
    _updateHighlightCountBadge();
    const toastKey = replacedCount > 0 ? 'toast.highlight_replaced' : 'toast.highlight_saved';
    if (window.app && typeof window.app.showToast === 'function') window.app.showToast(I18N.t(toastKey));
  } catch (err) {
    console.error('create highlight persist fail', err);
    if (window.app && typeof window.app.showToast === 'function') window.app.showToast(I18N.t('toast.highlight_error', err.message));
    if (!epubHighlights.some(h => (h.cfi_range || h.cfiRange) === cfiRange)) {
      epubHighlights.push({ id: Date.now(), item_id: epubCurrentItem.id, cfi_range: cfiRange, text_excerpt: text, color, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
  }
}

async function _changeHighlightColor(hl, newColor) {
  if (!hl || !newColor) return;
  const oldColor = hl.color;
  const cfi = hl.cfi_range || hl.cfiRange;
  if (oldColor === newColor) return;
  // Otimista: atualiza visual imediatamente
  const newStyle = EPUB_HIGHLIGHT_COLORS[newColor] || EPUB_HIGHLIGHT_COLORS.yellow;
  const newCls = _highlightClassForColor(newColor);
  try { epubRendition.annotations.remove(cfi, 'highlight'); } catch (_) {}
  try { epubRendition.annotations.highlight(cfi, hl, _onHighlightClick, newCls, newStyle); } catch (_) {}
  try {
    const views = epubRendition.views();
    for (const v of views) {
      if (v && v.pane && v.pane.element) {
        v.pane.element.style.zIndex = '5';
        const g = v.pane.element.querySelector(`g.${newCls}`);
        if (g) {
          g.querySelectorAll('rect').forEach(r => {
            r.style.fill = newStyle.fill;
            r.style.fillOpacity = newStyle['fill-opacity'];
            r.setAttribute('fill', newStyle.fill);
            r.setAttribute('fill-opacity', newStyle['fill-opacity']);
          });
        }
      }
    }
  } catch (_) {}
  try {
    const updated = await LibraryAPI.updateHighlight(hl.item_id || epubCurrentItem.id, hl.id, { color: newColor });
    hl.color = updated.color;
    _updateHighlightCountBadge();
  } catch (err) {
    console.error('change color', err);
    // Reverter visual se falhar?
    hl.color = newColor; // mantém otimista
  }
}

async function _deleteHighlight(hl, cfiRange) {
  const cfi = cfiRange || hl.cfi_range || hl.cfiRange;
  const id = hl.id;
  const itemId = hl.item_id || (epubCurrentItem && epubCurrentItem.id);
  try {
    if (id && itemId) await LibraryAPI.deleteHighlight(itemId, id);
    else if (itemId && cfi) await LibraryAPI.deleteHighlightByCfi(itemId, cfi);
  } catch (err) {
    console.warn('delete highlight api', err);
  }
  // remover do rendition e da lista local mesmo se API falhar (otimista)
  try { epubRendition.annotations.remove(cfi, 'highlight'); } catch (_) {}
  epubHighlights = epubHighlights.filter(h => h.id !== id && (h.cfi_range || h.cfiRange) !== cfi);
  _updateHighlightCountBadge();
  if (window.app && typeof window.app.showToast === 'function') window.app.showToast(I18N.t('toast.highlight_removed'));
}

// Fechar popovers ao clicar fora ou mudar de página
function _onDocClickHideHl(e) {
  const p1 = document.getElementById('epub-highlight-popover');
  const p2 = document.getElementById('epub-highlight-actions');
  const isInside = (p1 && p1.contains(e.target)) || (p2 && p2.contains(e.target));
  if (!isInside) _hideHighlightPopovers();
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
    <!-- Botão Tela Cheia -->
    <button id="btn-fullscreen" class="btn-mode-toggle" title="${I18N.t('reader.fullscreen')}">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"></path>
      </svg>
      <span>${I18N.t('reader.fullscreen')}</span>
    </button>

    <!-- Duas colunas (Plano B) -->
    <button id="epub-column-toggle" class="btn-mode-toggle ${epubColumnMode === 'double' ? 'active' : ''}" title="${I18N.t('reader.epub.two_columns')}">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="4" width="7" height="16" rx="1"></rect>
        <rect x="14" y="4" width="7" height="16" rx="1"></rect>
      </svg>
      <span>${I18N.t('reader.epub.two_columns')}</span>
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

  // Duas colunas toggle
  document.getElementById('epub-column-toggle')?.addEventListener('click', () => _toggleEpubColumns());

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

  // Highlights: fechar popovers ao clicar fora (no documento pai)
  const hlPop = document.getElementById('epub-highlight-popover');
  const hlAct = document.getElementById('epub-highlight-actions');
  const isHlInside = (hlPop && hlPop.contains(e.target)) || (hlAct && hlAct.contains(e.target));
  if (!isHlInside) {
    if (hlPop && !hlPop.classList.contains('hidden')) hlPop.classList.add('hidden');
    if (hlAct && !hlAct.classList.contains('hidden')) hlAct.classList.add('hidden');
    // Limpar seleção pendente se usuário clicou fora
    if (!isHlInside) {
      epubSelectedCfi = null;
      epubSelectedText = '';
      epubSelectedContents = null;
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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

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
    // Fechar popovers de highlight primeiro
    const hlPop = document.getElementById('epub-highlight-popover');
    const hlAct = document.getElementById('epub-highlight-actions');
    if (hlPop && !hlPop.classList.contains('hidden')) {
      e.preventDefault();
      _hideHighlightPopovers();
      // limpar seleção nativa
      try {
        const contents = epubRendition ? epubRendition.getContents() : [];
        for (const c of contents) { try { c.window.getSelection().removeAllRanges(); } catch (_) {} }
      } catch (_) {}
      return;
    }
    if (hlAct && !hlAct.classList.contains('hidden')) {
      e.preventDefault();
      _hideHighlightPopovers();
      return;
    }

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
  } else if (e.key === 'm' || e.key === 'M') {
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    _cycleEpubTheme();
  } else if (e.key === 'c' || e.key === 'C') {
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    _toggleEpubColumns();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Fechar
// ──────────────────────────────────────────────────────────────────────────────

function closeEpub() {
  document.removeEventListener('keydown', epubKeyHandler);
  document.removeEventListener('click', _onOutsideClickEpub);
  document.removeEventListener('mousedown', _onDocClickHideHl);
  _hideHighlightPopovers();

  epubIsFullscreen = false;
  document.body.classList.remove('reader-fullscreen');
  const fsBar = document.getElementById('reader-fullscreen-bar');
  if (fsBar) fsBar.style.display = 'none';

  if (epubRendition) {
    // remover todos highlights do rendition antes de destruir
    try {
      for (const hl of epubHighlights) {
        const c = hl.cfi_range || hl.cfiRange;
        try { epubRendition.annotations.remove(c, 'highlight'); } catch (_) {}
      }
    } catch (_) {}
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
  epubHighlights = [];
  epubSelectedCfi = null;
  epubSelectedText = '';
  epubSelectedContents = null;

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