/* ==========================================================================
   Krumer Personal Library - PDF Reader Module (PDF.js Integration)
   ========================================================================== */

let pdfDoc = null;
let pdfCurrentPage = 1;
let pdfTotalPages = 0;
let pdfCurrentScale = 1.0;
let pdfCurrentItem = null;
let pdfCurrentFilePath = null;
let isRenderingPage = false;
let pageNumPending = null;

// Configurar o worker do PDF.js se o pdfjsLib estiver disponível
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Abre e inicializa a leitura de um arquivo PDF
 * @param {Object} item - Objeto do item/livro ou capítulo
 * @param {string} filePath - Caminho absoluto do arquivo PDF no disco
 */
async function openPdf(item, filePath) {
  pdfCurrentItem = item;
  pdfCurrentFilePath = filePath || item.path;
  pdfCurrentScale = 1.0;
  pageNumPending = null;

  showReaderView('pdf');

  // Atualizar título na barra de navegação
  const titleEl = document.getElementById('reader-title');
  const subtitleEl = document.getElementById('reader-subtitle');
  if (titleEl) titleEl.textContent = item.title || 'Visualizador de PDF';
  if (subtitleEl) subtitleEl.textContent = item.author ? `por ${item.author}` : '';

  // Exibir indicador de carregamento
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

    // Tentar obter o progresso salvo anteriormente
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
      console.warn('Progresso salvo não encontrado ou erro de API:', progErr);
    }

    if (savedPage < 1 || savedPage > pdfTotalPages) {
      savedPage = 1;
    }

    pdfCurrentPage = savedPage;

    // Configurar controles de UI
    setupPdfControls();

    // Renderizar a primeira/salva página
    showReaderLoading(false);
    await renderPdfPage(pdfCurrentPage);

    // Adicionar escutadores globais de teclado
    document.addEventListener('keydown', pdfKeyHandler);

  } catch (err) {
    console.error('Erro ao abrir arquivo PDF:', err);
    showReaderLoading(false);
    showReaderError(`Não foi possível abrir o arquivo PDF: ${err.message}`);
  }
}

/**
 * Renderiza uma página específica do PDF no elemento canvas
 * @param {number} num - Número da página (1-indexed)
 */
async function renderPdfPage(num) {
  if (!pdfDoc) return;

  if (isRenderingPage) {
    pageNumPending = num;
    return;
  }

  isRenderingPage = true;
  pdfCurrentPage = num;

  try {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: pdfCurrentScale });

    const canvas = document.getElementById('pdf-canvas') || createPdfCanvas();
    const ctx = canvas.getContext('2d');

    // Ajustar resolução para HiDPI / Retina se aplicável
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';

    const transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0]
      : null;

    const renderContext = {
      canvasContext: ctx,
      transform: transform,
      viewport: viewport
    };

    await page.render(renderContext).promise;

    isRenderingPage = false;

    if (pageNumPending !== null) {
      const nextNum = pageNumPending;
      pageNumPending = null;
      renderPdfPage(nextNum);
    }

    // Atualizar estado dos controles na UI
    updatePdfControlsState();

    // Salvar progresso de leitura no backend
    savePdfProgress();

  } catch (err) {
    console.error(`Erro ao renderizar página ${num}:`, err);
    isRenderingPage = false;
  }
}

/**
 * Cria a estrutura do Canvas dentro do contêiner do leitor se não existir
 */
function createPdfCanvas() {
  const container = document.getElementById('reader-container');
  container.innerHTML = `
    <div class="pdf-canvas-wrap">
      <canvas id="pdf-canvas"></canvas>
    </div>
  `;
  return document.getElementById('pdf-canvas');
}

/**
 * Configura a barra de ferramentas de controle do PDF
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
    if (pdfCurrentPage > 1) renderPdfPage(pdfCurrentPage - 1);
  });

  document.getElementById('pdf-btn-next')?.addEventListener('click', () => {
    if (pdfCurrentPage < pdfTotalPages) renderPdfPage(pdfCurrentPage + 1);
  });

  const pageInput = document.getElementById('pdf-page-input');
  if (pageInput) {
    pageInput.addEventListener('change', (e) => {
      const targetPage = parseInt(e.target.value, 10);
      if (targetPage >= 1 && targetPage <= pdfTotalPages) {
        renderPdfPage(targetPage);
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

  const zoomSelect = document.getElementById('pdf-zoom-select');
  if (zoomSelect) {
    zoomSelect.value = pdfCurrentScale.toString();
    zoomSelect.addEventListener('change', (e) => {
      pdfCurrentScale = parseFloat(e.target.value);
      renderPdfPage(pdfCurrentPage);
    });
  }
}

/**
 * Atualiza os valores e estados de habilitação dos botões
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
 * Salva o progresso atual de leitura via API
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
    console.warn('Erro ao salvar progresso de leitura do PDF:', err);
  }
}

/**
 * Tratador de atalhos de teclado para navegação no PDF
 */
function pdfKeyHandler(e) {
  // Evitar interceptar se o foco estiver num input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    return;
  }

  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    if (pdfCurrentPage > 1) {
      e.preventDefault();
      renderPdfPage(pdfCurrentPage - 1);
    }
  } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    if (pdfCurrentPage < pdfTotalPages) {
      e.preventDefault();
      renderPdfPage(pdfCurrentPage + 1);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (window.closeReader) {
      window.closeReader();
    }
  }
}

/**
 * Fecha a leitura do PDF e faz a limpeza de recursos
 */
function closePdf() {
  document.removeEventListener('keydown', pdfKeyHandler);

  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }

  pdfCurrentItem = null;
  pdfCurrentFilePath = null;
  pdfCurrentPage = 1;
  pdfTotalPages = 0;
  isRenderingPage = false;
  pageNumPending = null;

  const container = document.getElementById('reader-container');
  if (container) container.innerHTML = '';
}

/**
 * Exibe/oculta spinner de carregamento no leitor
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
 * Exibe mensagem de erro no leitor
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
