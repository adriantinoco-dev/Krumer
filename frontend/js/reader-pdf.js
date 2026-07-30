/* ==========================================================================
   Krumer Personal Library - PDF Reader Module (Virtualized Dual Mode)
   ========================================================================== */

let pdfDoc = null;
let pdfCurrentPage = 1;
let pdfTotalPages = 0;
let pdfCurrentScale = 1.0;
let pdfMode = 'horizontal'; // 'horizontal' (página única) ou 'vertical' (rolagem contínua)
let pdfCurrentItem = null;
let pdfCurrentFilePath = null;
let pdfIsFullscreen = false;

let virtualObserver = null;
let renderingPages = new Set();
let baseAspectWidth = 600;
let baseAspectHeight = 850;

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Abre e inicializa a leitura de um arquivo PDF
 */
async function openPdf(item, filePath) {
  pdfCurrentItem = item;
  pdfCurrentFilePath = filePath || item.path;
  pdfCurrentScale = 1.0;
  
  // Restaurar o último modo de exibição definido pelo usuário (localStorage)
  const savedMode = localStorage.getItem('krumer_pdf_view_mode');
  pdfMode = (savedMode === 'vertical') ? 'vertical' : 'horizontal';
  renderingPages.clear();

  // Limpar estado de fullscreen ao abrir novo documento
  pdfIsFullscreen = false;
  document.body.classList.remove('reader-fullscreen');
  const fsBarInit = document.getElementById('reader-fullscreen-bar');
  if (fsBarInit) fsBarInit.style.display = 'none';

  showReaderView('pdf');

  const titleEl = document.getElementById('reader-title');
  const subtitleEl = document.getElementById('reader-subtitle');
  if (titleEl) titleEl.textContent = item.title || I18N.t('reader.pdf.loading');
  if (subtitleEl) subtitleEl.textContent = item.author ? `${I18N.t('details.author_prefix')} ${item.author}` : '';

  showReaderLoading(true);

  try {
    const fileUrl = LibraryAPI.getFileUrl(pdfCurrentFilePath);
    const loadingTask = pdfjsLib.getDocument({
      url: fileUrl,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
    });

    pdfDoc = await loadingTask.promise;
    pdfTotalPages = pdfDoc.numPages;

    // Calcular proporções reais da Página 1 para os placeholders
    try {
      const page1 = await pdfDoc.getPage(1);
      const vp1 = page1.getViewport({ scale: 1.0 });
      baseAspectWidth = Math.round(vp1.width);
      baseAspectHeight = Math.round(vp1.height);
    } catch (e) {
      console.warn('Erro ao obter viewport da página 1:', e);
    }

    // Progresso salvo
    let savedPage = 1;
    try {
      const progressList = await LibraryAPI.getProgress(item.id);
      if (Array.isArray(progressList) && progressList.length > 0) {
        const matchingProg = progressList.find(p => p.file_path === pdfCurrentFilePath) || progressList[0];
        if (matchingProg && matchingProg.current_page > 0) {
          savedPage = matchingProg.current_page;
        }
      }
    } catch (progErr) {
      console.warn('Progresso salvo não encontrado:', progErr);
    }

    if (savedPage < 1 || savedPage > pdfTotalPages) savedPage = 1;
    pdfCurrentPage = savedPage;

    // Inicializar container do leitor
    const viewer = document.getElementById('reader-container');
    if (viewer) {
      viewer.innerHTML = '';
      viewer.classList.remove('horizontal', 'vertical');
      viewer.classList.add(pdfMode);
    }

    // Criar placeholders de todas as páginas para permitir a rolagem nativa instantânea
    criarPlaceholdersTodasPaginas();

    if (pdfMode === 'vertical') {
      initVirtualScrollObserver();
    }

    setupPdfControls();
    showReaderLoading(false);

    // Ir para a página inicial
    await irParaPaginaPdf(pdfCurrentPage, { instant: true });

    document.addEventListener('keydown', pdfKeyHandler);


  } catch (err) {
    console.error('Erro ao abrir arquivo PDF:', err);
    showReaderLoading(false);
    showReaderError(I18N.t('reader.pdf.open_error', err.message));
  }
}

/**
 * Cria wrappers de placeholder com dimensões exatas para todas as páginas
 */
function criarPlaceholdersTodasPaginas() {
  const viewer = document.getElementById('reader-container');
  if (!viewer) return;

  viewer.innerHTML = '';

  const calcW = Math.round(baseAspectWidth * pdfCurrentScale);
  const calcH = Math.round(baseAspectHeight * pdfCurrentScale);

  const fragment = document.createDocumentFragment();

  for (let i = 1; i <= pdfTotalPages; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-canvas-wrap';
    wrap.dataset.page = i;
    wrap.style.width = `${calcW}px`;
    wrap.style.minHeight = `${calcH}px`;
    fragment.appendChild(wrap);
  }

  viewer.appendChild(fragment);
}

/**
 * Atualiza dimensões dos placeholders ao alterar o zoom
 */
function atualizarDimensoesPlaceholders() {
  const calcW = Math.round(baseAspectWidth * pdfCurrentScale);
  const calcH = Math.round(baseAspectHeight * pdfCurrentScale);

  const wraps = document.querySelectorAll('#reader-container .pdf-canvas-wrap');
  wraps.forEach(wrap => {
    wrap.style.width = `${calcW}px`;
    wrap.style.minHeight = `${calcH}px`;
    delete wrap.dataset.renderedScale;

    const canvas = wrap.querySelector('canvas');
    if (canvas) {
      canvas.style.width = `${calcW}px`;
      canvas.style.height = `${calcH}px`;
    }
  });
}

/**
 * Inicializa o IntersectionObserver para renderizar páginas sob demanda no modo vertical
 */
function initVirtualScrollObserver() {
  if (virtualObserver) {
    virtualObserver.disconnect();
  }

  const viewer = document.getElementById('reader-container');
  if (!viewer) return;

  const options = {
    root: viewer,
    rootMargin: '400px 0px 400px 0px',
    threshold: [0.1, 0.5]
  };

  virtualObserver = new IntersectionObserver((entries) => {
    let mostVisiblePage = pdfCurrentPage;
    let highestRatio = 0;

    entries.forEach(entry => {
      const pageNum = Number(entry.target.dataset.page);

      if (entry.isIntersecting) {
        renderizarPaginaPdf(pageNum);

        if (entry.intersectionRatio > highestRatio) {
          highestRatio = entry.intersectionRatio;
          mostVisiblePage = pageNum;
        }
      }
    });

    if (pdfMode === 'vertical' && highestRatio > 0.3 && mostVisiblePage !== pdfCurrentPage) {
      pdfCurrentPage = mostVisiblePage;
      updatePdfControlsState();
      savePdfProgress();
    }
  }, options);

  const wraps = viewer.querySelectorAll('.pdf-canvas-wrap');
  wraps.forEach(wrap => virtualObserver.observe(wrap));
}

/**
 * Desconecta o observer virtual
 */
function stopVirtualScrollObserver() {
  if (virtualObserver) {
    virtualObserver.disconnect();
    virtualObserver = null;
  }
}

/**
 * Ir para uma página específica
 */
async function irParaPaginaPdf(numPagina, { instant = false } = {}) {
  if (!pdfDoc || numPagina < 1 || numPagina > pdfTotalPages) return;

  pdfCurrentPage = numPagina;

  await renderizarPaginaPdf(numPagina);

  if (pdfMode === 'horizontal') {
    marcarPaginaAtual();
  } else {
    const wrap = document.querySelector(`#reader-container .pdf-canvas-wrap[data-page="${numPagina}"]`);
    if (wrap) {
      wrap.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
    }
  }

  updatePdfControlsState();
  savePdfProgress();
}

/**
 * Marca a página ativa no modo horizontal
 */
function marcarPaginaAtual() {
  const wraps = document.querySelectorAll('#reader-container .pdf-canvas-wrap');
  wraps.forEach(wrap => {
    const pageNum = Number(wrap.dataset.page);
    const isCurrent = (pageNum === pdfCurrentPage);
    wrap.classList.toggle('current-page', isCurrent);
  });
}

/**
 * Alterna entre modo horizontal e vertical
 */
async function trocarModoPdf(novoModo) {
  if (novoModo === pdfMode) return;
  pdfMode = novoModo;

  // Persistir preferência no localStorage
  try {
    localStorage.setItem('krumer_pdf_view_mode', pdfMode);
  } catch (e) {
    console.warn('Erro ao salvar preferência no localStorage:', e);
  }

  const viewer = document.getElementById('reader-container');
  if (!viewer) return;

  viewer.classList.remove('horizontal', 'vertical');
  viewer.classList.add(pdfMode);

  if (pdfMode === 'vertical') {
    initVirtualScrollObserver();
    await renderizarPaginaPdf(pdfCurrentPage);
  } else {
    stopVirtualScrollObserver();
    await renderizarPaginaPdf(pdfCurrentPage);
    marcarPaginaAtual();
  }

  updateModeToggleButton();
  irParaPaginaPdf(pdfCurrentPage, { instant: true });
}

/**
 * Renderiza uma página específica via PDF.js no seu wrapper correspondente
 */
async function renderizarPaginaPdf(num) {
  if (!pdfDoc || num < 1 || num > pdfTotalPages) return;

  const viewer = document.getElementById('reader-container');
  if (!viewer) return;

  const wrap = viewer.querySelector(`.pdf-canvas-wrap[data-page="${num}"]`);
  if (!wrap) return;

  if (wrap.dataset.renderedScale === pdfCurrentScale.toString() && wrap.querySelector('canvas')) {
    return; // Já renderizado
  }

  if (renderingPages.has(num)) return;
  renderingPages.add(num);

  try {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: pdfCurrentScale });

    let canvas = wrap.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      wrap.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';

    wrap.style.width = Math.floor(viewport.width) + 'px';
    wrap.style.minHeight = Math.floor(viewport.height) + 'px';

    const transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0]
      : null;

    await page.render({
      canvasContext: ctx,
      transform: transform,
      viewport: viewport
    }).promise;

    wrap.dataset.renderedScale = pdfCurrentScale.toString();
    wrap.classList.add('has-canvas');

    if (pdfMode === 'horizontal') {
      marcarPaginaAtual();
    }

  } catch (err) {
    console.error(`Erro ao renderizar página ${num}:`, err);
  } finally {
    renderingPages.delete(num);
  }
}

/**
 * Configura os controles da toolbar
 */
function setupPdfControls() {
  const controlsContainer = document.getElementById('reader-controls');
  if (!controlsContainer) return;

  controlsContainer.innerHTML = `
    <div class="reader-controls-group">
      <button id="pdf-btn-prev" class="btn-reader-ctrl" title="${I18N.t('reader.pdf.prev')}">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      
      <div class="reader-page-indicator">
        <input id="pdf-page-input" class="reader-page-input" type="number" min="1" max="${pdfTotalPages}" value="${pdfCurrentPage}">
        <span id="pdf-total-label">/ ${pdfTotalPages}</span>
      </div>

      <button id="pdf-btn-next" class="btn-reader-ctrl" title="${I18N.t('reader.pdf.next')}">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <button id="pdf-mode-toggle" class="btn-mode-toggle" title="${I18N.t('reader.pdf.mode_toggle')}">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      <span id="pdf-mode-label">${I18N.t('reader.pdf.scroll_continuous')}</span>
    </button>

    <!-- Botão Tela Cheia -->
    <button id="btn-fullscreen" class="btn-mode-toggle" title="${I18N.t('reader.fullscreen')}">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"></path>
      </svg>
      <span>${I18N.t('reader.fullscreen')}</span>
    </button>

    <div class="reader-settings-wrapper">
      <button id="pdf-settings-toggle" class="btn-mode-toggle" title="${I18N.t('reader.settings')}">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <div id="pdf-settings-popover" class="reader-settings-popover hidden">
        <div class="settings-popover-header">
          <span class="settings-popover-title">${I18N.t('reader.epub.settings_title')}</span>
        </div>
        <div class="settings-option-group">
          <div class="settings-option-label">
            <span>${I18N.t('reader.pdf.settings_zoom')}</span>
            <span id="pdf-zoom-val-badge" class="zoom-value-badge">${Math.round(pdfCurrentScale * 100)}%</span>
          </div>
          <div class="zoom-slider-container">
            <span class="zoom-min-label">50%</span>
            <input type="range" id="pdf-zoom-slider" min="50" max="200" step="5" value="${Math.round(pdfCurrentScale * 100)}" class="reader-zoom-slider">
            <span class="zoom-max-label">200%</span>
          </div>
          <div class="zoom-preset-buttons">
            <button type="button" class="btn-zoom-preset" data-zoom="50">50%</button>
            <button type="button" class="btn-zoom-preset" data-zoom="100">100%</button>
            <button type="button" class="btn-zoom-preset" data-zoom="150">150%</button>
            <button type="button" class="btn-zoom-preset" data-zoom="200">200%</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Event Handlers
  document.getElementById('pdf-btn-prev')?.addEventListener('click', () => {
    if (pdfCurrentPage > 1) irParaPaginaPdf(pdfCurrentPage - 1);
  });

  document.getElementById('pdf-btn-next')?.addEventListener('click', () => {
    if (pdfCurrentPage < pdfTotalPages) irParaPaginaPdf(pdfCurrentPage + 1);
  });

  const pageInput = document.getElementById('pdf-page-input');
  if (pageInput) {
    pageInput.addEventListener('change', (e) => {
      const targetPage = parseInt(e.target.value, 10);
      if (targetPage >= 1 && targetPage <= pdfTotalPages) {
        irParaPaginaPdf(targetPage);
      } else {
        e.target.value = pdfCurrentPage;
      }
    });

    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        pageInput.blur();
      }
    });
  }

  // Toggle de modo Horizontal / Vertical
  document.getElementById('pdf-mode-toggle')?.addEventListener('click', () => {
    const novoModo = (pdfMode === 'horizontal') ? 'vertical' : 'horizontal';
    trocarModoPdf(novoModo);
  });

  updateModeToggleButton();

  // Fullscreen toggle
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    pdfIsFullscreen = !pdfIsFullscreen;
    document.body.classList.toggle('reader-fullscreen', pdfIsFullscreen);
    const fsBar = document.getElementById('reader-fullscreen-bar');
    if (fsBar) fsBar.style.display = pdfIsFullscreen ? 'flex' : 'none';
    _syncPdfFullscreenProgressLabel();
  });

  // Fullscreen back button
  const fsBackBtn = document.getElementById('btn-back-fullscreen');
  if (fsBackBtn) {
    fsBackBtn.onclick = () => {
      if (typeof closeReader === 'function') closeReader();
    };
  }

  // Settings Popover Toggle
  const settingsBtn = document.getElementById('pdf-settings-toggle');
  const popover = document.getElementById('pdf-settings-popover');
  if (settingsBtn && popover) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('hidden');
      settingsBtn.classList.toggle('active', !popover.classList.contains('hidden'));
    });

    popover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Range Slider & Presets de Zoom
  const zoomSlider = document.getElementById('pdf-zoom-slider');
  if (zoomSlider) {
    // Ao arrastar o slider: redimensiona instantaneamente via CSS sem recarregar nem pular scroll
    zoomSlider.addEventListener('input', (e) => {
      const pctVal = parseInt(e.target.value, 10);
      const novaEscala = pctVal / 100.0;
      aplicarZoomPdf(novaEscala, { updateSlider: false, renderNow: false });
    });

    // Ao soltar o slider ou confirmar: renderiza PDF.js em alta qualidade
    zoomSlider.addEventListener('change', (e) => {
      const pctVal = parseInt(e.target.value, 10);
      const novaEscala = pctVal / 100.0;
      aplicarZoomPdf(novaEscala, { updateSlider: false, renderNow: true });
    });
  }

  // Presets de Zoom (50%, 100%, 150%, 200%)
  const presetButtons = document.querySelectorAll('.btn-zoom-preset');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pctVal = parseInt(e.currentTarget.dataset.zoom, 10);
      const novaEscala = pctVal / 100.0;
      aplicarZoomPdf(novaEscala, { updateSlider: true, renderNow: true });
    });
  });

  // Atualizar estado visual inicial dos presets
  atualizarPresetsZoomVisual(Math.round(pdfCurrentScale * 100));
}

/**
 * Atualiza botão de alternância de modo
 */
function updateModeToggleButton() {
  const labelEl = document.getElementById('pdf-mode-label');
  const btn = document.getElementById('pdf-mode-toggle');
  if (!labelEl || !btn) return;

  if (pdfMode === 'horizontal') {
    labelEl.textContent = I18N.t('reader.pdf.vertical');
    btn.title = I18N.t('reader.pdf.mode_toggle');
  } else {
    labelEl.textContent = I18N.t('reader.pdf.horizontal');
    btn.title = I18N.t('reader.pdf.mode_toggle');
  }
}

/**
 * Atualiza controles de UI
 */
function updatePdfControlsState() {
  const pageInput = document.getElementById('pdf-page-input');
  if (pageInput) pageInput.value = pdfCurrentPage;

  const btnPrev = document.getElementById('pdf-btn-prev');
  if (btnPrev) btnPrev.disabled = (pdfCurrentPage <= 1);

  const btnNext = document.getElementById('pdf-btn-next');
  if (btnNext) btnNext.disabled = (pdfCurrentPage >= pdfTotalPages);

  _syncPdfFullscreenProgressLabel();
}

/**
 * Sincroniza o label de progresso exibido no reader-fullscreen-bar (PDF)
 */
function _syncPdfFullscreenProgressLabel() {
  if (!pdfTotalPages) return;
  const pct = Math.round((pdfCurrentPage / pdfTotalPages) * 100);
  const fsLabel = document.getElementById('fullscreen-progress-label');
  if (fsLabel) fsLabel.textContent = I18N.t('reader.pdf.page_progress', pct, pdfCurrentPage, pdfTotalPages);
}

/**
 * Reseta o estado de fullscreen do leitor PDF
 */
function resetPdfFullscreen() {
  pdfIsFullscreen = false;
  document.body.classList.remove('reader-fullscreen');
  const fsBar = document.getElementById('reader-fullscreen-bar');
  if (fsBar) fsBar.style.display = 'none';
}

/**
 * Salva progresso de leitura
 */
async function savePdfProgress() {
  if (!pdfCurrentItem || pdfTotalPages <= 0) return;

  const pct = Math.min(100.0, Math.round(((pdfCurrentPage / pdfTotalPages) * 100) * 10) / 10);

  try {
    await LibraryAPI.saveProgress(pdfCurrentItem.id, {
      file_path: pdfCurrentFilePath,
      progress_pct: pct,
      current_page: pdfCurrentPage,
      total_pages: pdfTotalPages
    });
  } catch (err) {
    console.warn('Erro ao salvar progresso:', err);
  }
}

let zoomDebounceTimer = null;

/**
 * Aplica um novo nível de zoom ao PDF suavemente sem recarregar a página nem resetar a posição de rolagem
 */
function aplicarZoomPdf(novaEscala, { updateSlider = true, renderNow = false } = {}) {
  pdfCurrentScale = novaEscala;
  const pctVal = Math.round(pdfCurrentScale * 100);

  const badge = document.getElementById('pdf-zoom-val-badge');
  if (badge) badge.textContent = `${pctVal}%`;

  if (updateSlider) {
    const slider = document.getElementById('pdf-zoom-slider');
    if (slider && parseInt(slider.value, 10) !== pctVal) {
      slider.value = pctVal;
    }
  }

  atualizarPresetsZoomVisual(pctVal);
  atualizarDimensoesPlaceholders();

  if (zoomDebounceTimer) {
    clearTimeout(zoomDebounceTimer);
    zoomDebounceTimer = null;
  }

  if (renderNow) {
    renderizarPaginaPdf(pdfCurrentPage);
  } else {
    // Re-renderizar PDF.js em alta definição 150ms após o usuário parar de arrastar a barra
    zoomDebounceTimer = setTimeout(() => {
      renderizarPaginaPdf(pdfCurrentPage);
    }, 150);
  }
}

/**
 * Atualiza o destaque visual dos botões preset de zoom
 */
function atualizarPresetsZoomVisual(pctVal) {
  const presetButtons = document.querySelectorAll('.btn-zoom-preset');
  presetButtons.forEach(btn => {
    const btnPct = parseInt(btn.dataset.zoom, 10);
    btn.classList.toggle('active', btnPct === pctVal);
  });
}

// Fechar popover de configurações ao clicar em qualquer lugar fora dele
document.addEventListener('click', (e) => {
  const popover = document.getElementById('pdf-settings-popover');
  const btn = document.getElementById('pdf-settings-toggle');
  if (popover && !popover.classList.contains('hidden')) {
    if (!popover.contains(e.target) && !btn?.contains(e.target)) {
      popover.classList.add('hidden');
      btn?.classList.remove('active');
    }
  }
});

/**
 * Atalhos de teclado
 */
function pdfKeyHandler(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    return;
  }

  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    if (pdfCurrentPage > 1) {
      e.preventDefault();
      irParaPaginaPdf(pdfCurrentPage - 1);
    }
  } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    if (pdfCurrentPage < pdfTotalPages) {
      e.preventDefault();
      irParaPaginaPdf(pdfCurrentPage + 1);
    }
  } else if (e.key === 'Escape') {
    const popover = document.getElementById('pdf-settings-popover');
    if (popover && !popover.classList.contains('hidden')) {
      e.preventDefault();
      popover.classList.add('hidden');
      document.getElementById('pdf-settings-toggle')?.classList.remove('active');
      return;
    }
    e.preventDefault();
    if (window.closeReader) {
      window.closeReader();
    }
  }
}

/**
 * Fechar leitor PDF
 */
function closePdf() {
  document.removeEventListener('keydown', pdfKeyHandler);
  stopVirtualScrollObserver();

  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }

  pdfCurrentItem = null;
  pdfCurrentFilePath = null;
  pdfCurrentPage = 1;
  pdfTotalPages = 0;
  renderingPages.clear();

  const container = document.getElementById('reader-container');
  if (container) {
    container.innerHTML = '';
    container.classList.remove('horizontal', 'vertical');
  }
}

/**
 * Loading overlay
 */
function showReaderLoading(isLoading) {
  const container = document.getElementById('reader-container');
  if (!container) return;

  if (isLoading) {
    container.innerHTML = `
      <div class="reader-spinner-overlay">
        <div class="reader-spinner"></div>
        <span>${I18N.t('reader.pdf.loading')}</span>
      </div>
    `;
  }
}

/**
 * Error display
 */
function showReaderError(msg) {
  const container = document.getElementById('reader-container');
  if (!container) return;

  container.innerHTML = `
    <div class="reader-spinner-overlay" style="color: #ef4444;">
      <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>${msg}</span>
    </div>
  `;
}

// Expor funções globais
window.openPdf = openPdf;
window.closePdf = closePdf;
window.trocarModoPdf = trocarModoPdf;
window.irParaPaginaPdf = irParaPaginaPdf;
