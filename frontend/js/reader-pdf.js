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

  showReaderView('pdf');

  const titleEl = document.getElementById('reader-title');
  const subtitleEl = document.getElementById('reader-subtitle');
  if (titleEl) titleEl.textContent = item.title || 'Visualizador de PDF';
  if (subtitleEl) subtitleEl.textContent = item.author ? `por ${item.author}` : '';

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
    showReaderError(`Não foi possível abrir o arquivo PDF: ${err.message}`);
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
      <button id="pdf-btn-prev" class="btn-reader-ctrl" title="Página Anterior (Seta Esquerda)">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      
      <div class="reader-page-indicator">
        <input id="pdf-page-input" class="reader-page-input" type="number" min="1" max="${pdfTotalPages}" value="${pdfCurrentPage}">
        <span id="pdf-total-label">/ ${pdfTotalPages}</span>
      </div>

      <button id="pdf-btn-next" class="btn-reader-ctrl" title="Próxima Página (Seta Direita)">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <button id="pdf-mode-toggle" class="btn-mode-toggle" title="Alternar Modo de Exibição">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      <span id="pdf-mode-label">Rolagem Contínua</span>
    </button>

    <select id="pdf-zoom-select" class="reader-select" title="Nível de Zoom">
      <option value="0.5">50%</option>
      <option value="0.75">75%</option>
      <option value="1.0" selected>100%</option>
      <option value="1.25">125%</option>
      <option value="1.5">150%</option>
      <option value="2.0">200%</option>
    </select>
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

  // Zoom Handler
  const zoomSelect = document.getElementById('pdf-zoom-select');
  if (zoomSelect) {
    zoomSelect.value = pdfCurrentScale.toString();
    zoomSelect.addEventListener('change', async (e) => {
      pdfCurrentScale = parseFloat(e.target.value);

      atualizarDimensoesPlaceholders();

      await renderizarPaginaPdf(pdfCurrentPage);

      if (pdfMode === 'vertical' && virtualObserver) {
        // Observer cuidará de re-renderizar as páginas visíveis na nova escala
      }
      irParaPaginaPdf(pdfCurrentPage, { instant: true });
    });
  }
}

/**
 * Atualiza botão de alternância de modo
 */
function updateModeToggleButton() {
  const labelEl = document.getElementById('pdf-mode-label');
  const btn = document.getElementById('pdf-mode-toggle');
  if (!labelEl || !btn) return;

  if (pdfMode === 'horizontal') {
    labelEl.textContent = 'Modo Vertical';
    btn.title = 'Mudar para Rolagem Contínua (Vertical)';
  } else {
    labelEl.textContent = 'Modo Horizontal';
    btn.title = 'Mudar para Página Única (Horizontal)';
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
        <span>Carregando documento...</span>
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
