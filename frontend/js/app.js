/* ==========================================================================
   Krumer Personal Library - App Controller & Entry Point
   ========================================================================== */

class AppController {
  constructor() {
    this.libraryManager = new LibraryManager();
    this.metadataManager = new MetadataManager(this);
    this.isOnboarding = false;
  }

  async init() {
    this.setupNavigation();
    this.setupSearchAndFilter();
    this.setupModals();
    this.setupSettingsModal();
    this.setupOnboarding();
    this.metadataManager.init();
    await this.libraryManager.init();
    await this.checkApiKeyStatus();
    await this.checkOnboarding();
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.sidebar-item[data-category], .nav-item[data-category]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(el => el.classList.remove('active'));
        const navEl = e.currentTarget;
        navEl.classList.add('active');

        const category = navEl.dataset.category;
        this.libraryManager.currentCategory = category;
        this.libraryManager.currentTag = null; // Clear tag filter on nav switch
        this.libraryManager.loadTags();
        this.libraryManager.loadItems();
      });
    });
  }

  setupSearchAndFilter() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let timeout = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          this.libraryManager.searchQuery = e.target.value.trim();
          this.libraryManager.loadItems();
        }, 300);
      });
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'added_desc') {
          this.libraryManager.sortBy = 'added_at';
          this.libraryManager.sortOrder = 'desc';
        } else if (val === 'rating_desc') {
          this.libraryManager.sortBy = 'rating';
          this.libraryManager.sortOrder = 'desc';
        } else if (val === 'progress_desc') {
          this.libraryManager.sortBy = 'overall_progress';
          this.libraryManager.sortOrder = 'desc';
        } else {
          this.libraryManager.sortBy = 'title';
          this.libraryManager.sortOrder = 'asc';
        }
        this.libraryManager.loadItems();
      });
    }
  }

  setupModals() {
    // Scan Modal
    const scanBtn = document.getElementById('btn-open-scan');
    if (scanBtn) scanBtn.addEventListener('click', () => this.openScanModal());

    const closeScanBtn = document.getElementById('close-scan-modal');
    if (closeScanBtn) closeScanBtn.addEventListener('click', () => this.closeScanModal());

    // Botão "Selecionar pasta" com seletor nativo via backend OS (popup_escanear.md §1)
    const browseBtn = document.getElementById('btn-browse-folder');
    const folderInput = document.getElementById('folder-picker-input');
    const pathInput = document.getElementById('scan-path-input');

    if (browseBtn) {
      browseBtn.addEventListener('click', async () => {
        try {
          // Chama a API do backend para abrir a janela nativa do Windows/OS
          const result = await LibraryAPI.browseFolder();
          if (result && result.status === 'success' && result.path) {
            pathInput.value = result.path;
            this.showToast(`Pasta selecionada: ${result.path}`);
            return;
          }
        } catch (err) {
          console.warn('Backend nativo não respondeu, tentando fallback local...', err);
        }

        // Fallback local se o backend não estiver respondendo
        if (folderInput) folderInput.click();
      });
    }

    if (folderInput) {
      folderInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0 && pathInput) {
          const firstFile = files[0];
          if (firstFile.path) {
            const fullPath = firstFile.path;
            const lastSlash = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
            if (lastSlash > 0) {
              pathInput.value = fullPath.substring(0, lastSlash);
              this.showToast(`Pasta selecionada: ${pathInput.value}`);
            }
          }
        }
      });
    }

    // Scan Form Submit — lê caminho e usa nome do arquivo como título
    const scanForm = document.getElementById('scan-form');
    if (scanForm) {
      scanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const path = pathInput ? pathInput.value.trim() : '';

        if (!path) {
          this.showToast('Por favor informe um caminho válido de pasta.');
          return;
        }

        try {
          this.showToast('Iniciando escaneamento da pasta...');
          this.closeScanModal();

          await LibraryAPI.scanFolder(path);

          if (this.isOnboarding) {
            // Onboarding: mostrar tela de sucesso em vez do fluxo normal
            await this.onbScanComplete();
          } else {
            this.showToast('Escaneamento concluído com sucesso!');
            this.libraryManager.loadTags();
            this.libraryManager.loadItems();
          }
        } catch (err) {
          console.error(err);
          this.showToast(`Erro ao escanear: ${err.message}`);
        }
      });
    }


    // Botão Voltar para Biblioteca na Página de Detalhes
    const backBtn = document.getElementById('btn-back-to-library');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.libraryManager.closeBookDetails();
      });
    }

    // Detail Modal close (fallback)
    const closeDetailBtn = document.getElementById('close-detail-modal');
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener('click', () => {
        const modal = document.getElementById('detail-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Drawer close (fallback)
    const closeDrawerBtn = document.getElementById('close-drawer');
    if (closeDrawerBtn) {
      closeDrawerBtn.addEventListener('click', () => {
        const drawer = document.getElementById('series-drawer');
        if (drawer) drawer.classList.remove('active');
      });
    }

    // Botão e Modal de Remoção da Biblioteca (Sem apagar do disco)
    const btnRemoveItem = document.getElementById('btn-remove-item');
    const confirmModal = document.getElementById('confirm-remove-modal');
    const closeConfirmModal = document.getElementById('close-confirm-modal');
    const btnCancelRemove = document.getElementById('btn-cancel-remove');
    const btnConfirmRemove = document.getElementById('btn-confirm-remove');
    const confirmTitleEl = document.getElementById('confirm-remove-title');

    if (btnRemoveItem) {
      btnRemoveItem.addEventListener('click', () => {
        const selectedItem = this.libraryManager.selectedItem;
        if (!selectedItem) return;
        
        if (confirmTitleEl) confirmTitleEl.textContent = selectedItem.title;
        if (confirmModal) confirmModal.classList.add('active');
      });
    }

    const closeConfirmModalFn = () => {
      if (confirmModal) confirmModal.classList.remove('active');
    };

    if (closeConfirmModal) closeConfirmModal.addEventListener('click', closeConfirmModalFn);
    if (btnCancelRemove) btnCancelRemove.addEventListener('click', closeConfirmModalFn);

    if (btnConfirmRemove) {
      btnConfirmRemove.addEventListener('click', async () => {
        const selectedItem = this.libraryManager.selectedItem;
        if (!selectedItem) return;

        try {
          btnConfirmRemove.disabled = true;
          const result = await LibraryAPI.deleteItem(selectedItem.id);
          this.showToast(result.message || 'Item removido da biblioteca.');
          
          closeConfirmModalFn();
          
          // Fecha a página de detalhes se estiver aberta
          this.libraryManager.closeBookDetails();
        } catch (err) {
          console.error(err);
          this.showToast(`Erro ao remover item: ${err.message}`);
        } finally {
          btnConfirmRemove.disabled = false;
        }
      });
    }


    // Botão circular de Reescanear (implementacoes.md §1)
    const rescanBtn = document.getElementById('btn-rescan');
    const rescanIcon = document.getElementById('rescan-icon');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', async () => {
        // Inicia animação de rotação
        rescanBtn.disabled = true;
        if (rescanIcon) rescanIcon.classList.add('spin');
        this.showToast('Reescaneando biblioteca...');

        try {
          const result = await LibraryAPI.rescanFolder();
          this.showToast(result.message || 'Reescaneamento concluído com sucesso!');
          await this.libraryManager.loadTags();
          await this.libraryManager.loadItems();
        } catch (err) {
          console.error(err);
          // Se nenhuma pasta foi configurada, abre o modal de escanear
          if (err.message && err.message.includes('anteriormente')) {
            this.showToast('Nenhuma pasta configurada. Escaneie uma pasta primeiro.');
            this.openScanModal();
          } else {
            this.showToast(`Erro ao reescanear: ${err.message}`);
          }
        } finally {
          // Para animação de rotação
          rescanBtn.disabled = false;
          if (rescanIcon) rescanIcon.classList.remove('spin');
        }
      });
    }

    // === Edit Metadata Modal (editar-metadados-livro.md) ===

    // Open modal from "Editar Metadados" button on details page
    const btnEditMetadata = document.getElementById('details-btn-edit');
    if (btnEditMetadata) {
      btnEditMetadata.addEventListener('click', () => {
        this.libraryManager.openEditMetadataModal();
      });
    }

    // Close via × button
    const closeEditModal = document.getElementById('close-edit-modal');
    if (closeEditModal) {
      closeEditModal.addEventListener('click', () => {
        this.libraryManager.closeEditMetadataModal();
      });
    }

    // Close via "Cancelar" button
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    if (btnCancelEdit) {
      btnCancelEdit.addEventListener('click', () => {
        this.libraryManager.closeEditMetadataModal();
      });
    }

    // Close when clicking outside the modal card
    const editModal = document.getElementById('edit-metadata-modal');
    if (editModal) {
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) this.libraryManager.closeEditMetadataModal();
      });
    }

    // Cover file picker — live preview
    const coverFileInput = document.getElementById('edit-cover-file-input');
    const pickCoverBtn   = document.getElementById('btn-pick-cover-file');
    const coverPreview   = document.getElementById('edit-cover-preview');
    const coverFilename  = document.getElementById('edit-cover-filename');

    if (pickCoverBtn && coverFileInput) {
      pickCoverBtn.addEventListener('click', () => coverFileInput.click());
    }

    if (coverFileInput) {
      coverFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (coverFilename) coverFilename.textContent = file.name;
        if (coverPreview) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            coverPreview.src = ev.target.result;
            coverPreview.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Edit metadata form submission
    const editMetadataForm = document.getElementById('edit-metadata-form');
    if (editMetadataForm) {
      editMetadataForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const item = this.libraryManager.selectedItem;
        if (!item) return;

        const titleInput = document.getElementById('edit-title-input');
        const title = titleInput ? titleInput.value.trim() : '';

        // Validate required title field
        if (!title) {
          if (titleInput) {
            titleInput.style.borderColor = '#ef4444';
            titleInput.focus();
          }
          this.showToast('O campo Título é obrigatório.');
          return;
        }
        if (titleInput) titleInput.style.borderColor = '';

        const getVal = (id) => {
          const el = document.getElementById(id);
          return el ? el.value.trim() : '';
        };

        const author    = getVal('edit-author-input');
        const publisher = getVal('edit-publisher-input');
        const year      = getVal('edit-year-input');
        const synopsis  = getVal('edit-synopsis-input');
        const tagsRaw   = getVal('edit-tags-input');
        const tags      = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

        // Show loading state
        const submitBtn  = document.getElementById('btn-submit-edit');
        const submitText = document.getElementById('edit-submit-text');
        if (submitBtn)  submitBtn.disabled = true;
        if (submitText) submitText.textContent = 'Salvando...';

        try {
          // 1. Save text metadata
          // Always send every field so the backend can distinguish
          // "user cleared the field" (empty string) from "field not touched" (absent key).
          // Since this is a "full-screen" edit modal, all fields are always present.
          await LibraryAPI.updateItem(item.id, {
            title,
            author:      author,
            publisher:   publisher,
            year:        year ? parseInt(year, 10) : 0,
            description: synopsis,
            tags,
          });

          // 2. Upload cover if a new file was selected
          const newCoverFile = coverFileInput && coverFileInput.files[0];
          if (newCoverFile) {
            await LibraryAPI.uploadCover(item.id, newCoverFile);
          }

          this.libraryManager.closeEditMetadataModal();
          this.showToast('Metadados salvos com sucesso!');

          // 3. Reload the details page to reflect all changes instantly
          await this.libraryManager.openBookDetails(item.id);

        } catch (err) {
          console.error('Erro ao salvar metadados:', err);
          this.showToast(`Erro ao salvar: ${err.message}`);
        } finally {
          if (submitBtn)  submitBtn.disabled = false;
          if (submitText) submitText.textContent = 'Salvar Alterações';
        }
      });
    }
  }


  openScanModal() {
    const modal = document.getElementById('scan-modal');
    if (modal) modal.classList.add('active');
  }

  // ============================================================
  // Settings Modal (Fase 1 — Chave de API Gemini)
  // ============================================================

  async checkApiKeyStatus() {
    const banner = document.getElementById('api-key-warning');
    if (!banner) return;

    try {
      const { configured } = await LibraryAPI.getApiKeyStatus();
      banner.style.display = configured ? 'none' : 'flex';
    } catch (err) {
      console.warn('Não foi possível verificar o status da chave da API:', err);
      // Em caso de erro (backend offline), não mostremos o banner para
      // não assustar o usuário indevidamente.
      banner.style.display = 'none';
    }
  }

  setupSettingsModal() {
    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => this.openSettingsModal());
    }

    const closeBtn = document.getElementById('close-settings-modal');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeSettingsModal());

    const cancelBtn = document.getElementById('btn-cancel-settings');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeSettingsModal());

    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeSettingsModal();
      });
    }

    // Toggle visibility of the API key
    const toggleBtn = document.getElementById('btn-toggle-api-key-visibility');
    const keyInput = document.getElementById('settings-api-key-input');
    if (toggleBtn && keyInput) {
      toggleBtn.addEventListener('click', () => {
        keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
        keyInput.focus();
      });
    }

    // Banner "Configurar agora"
    const bannerBtn = document.getElementById('api-key-banner-action');
    if (bannerBtn) {
      bannerBtn.addEventListener('click', () => this.openSettingsModal());
    }

    // Submit form
    const form = document.getElementById('settings-api-key-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('settings-api-key-input');
        const saveBtn = document.getElementById('btn-save-api-key');
        const saveText = document.getElementById('save-api-key-text');
        const value = input ? input.value.trim() : '';

        if (!value) {
          this.showToast('Informe a chave da API do Gemini.');
          if (input) {
            input.style.borderColor = '#ef4444';
            input.focus();
          }
          return;
        }
        if (input) input.style.borderColor = '';

        if (saveBtn) saveBtn.disabled = true;
        if (saveText) saveText.textContent = 'Validando...';

        try {
          const result = await LibraryAPI.updateApiKey(value);
          this.showToast(result.message || 'Chave salva e validada com sucesso!');

          // Limpa o campo por segurança (não guardamos no cliente)
          if (input) input.value = '';

          this._renderApiKeyStatus(true);
          this.closeSettingsModal();
          await this.checkApiKeyStatus();

          // Se estiver no onboarding, atualiza o passo 1
          if (this.isOnboarding) {
            this._updateOnbStepStatus(1, true);
          }
        } catch (err) {
          console.error(err);
          this.showToast(`Erro ao salvar chave: ${err.message}`);
          this._renderApiKeyStatus(undefined, err.message);
        } finally {
          if (saveBtn) saveBtn.disabled = false;
          if (saveText) saveText.textContent = 'Salvar e Validar';
        }
      });
    }
  }

  async openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.add('active');

    const input = document.getElementById('settings-api-key-input');
    if (input) input.value = '';

    await this._renderApiKeyStatus();
    setTimeout(() => input && input.focus(), 50);
  }

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('active');
  }

  async _renderApiKeyStatus(forceConfigured, errorMessage) {
    const statusEl = document.getElementById('settings-api-status');
    const textEl = statusEl ? statusEl.querySelector('.settings-status-text') : null;
    if (!statusEl || !textEl) return;

    statusEl.style.display = 'flex';
    statusEl.classList.remove('is-configured', 'is-missing', 'error');

    if (errorMessage) {
      statusEl.classList.add('error');
      textEl.textContent = `Erro: ${errorMessage}`;
      return;
    }

    let configured = forceConfigured;
    if (configured === undefined) {
      try {
        const data = await LibraryAPI.getApiKeyStatus();
        configured = data.configured;
      } catch (err) {
        statusEl.classList.add('error');
        textEl.textContent = `Não foi possível verificar o status: ${err.message}`;
        return;
      }
    }

    if (configured) {
      statusEl.classList.add('is-configured');
      textEl.textContent = 'Chave do Gemini configurada e ativa.';
    } else {
      statusEl.classList.add('is-missing');
      textEl.textContent = 'Nenhuma chave do Gemini configurada ainda.';
    }
  }

  // ============================================================
  // Onboarding (Fase 5 — Primeiro Uso)
  // ============================================================

  async checkOnboarding() {
    try {
      const status = await LibraryAPI.getApiKeyStatus();
      const hasApiKey = status.configured;

      const onboardingStatus = await LibraryAPI.getOnboardingStatus();

      if (onboardingStatus.is_first_use) {
        this.isOnboarding = true;
        // Desfoca o app root ao fundo e mostra onboarding por cima
        const appRoot = document.getElementById('app-root');
        if (appRoot) appRoot.classList.add('app-root--blurred');
        const overlay = document.getElementById('onboarding-overlay');
        if (overlay) overlay.style.display = 'flex';

        // Se já tem chave configurada, marca passo 1 como feito
        if (hasApiKey) {
          this._updateOnbStepStatus(1, true);
        }
      }
    } catch (err) {
      console.warn('Não foi possível verificar status de onboarding:', err);
    }
  }

  setupOnboarding() {
    // Passo 1: Configurar chave
    const btnApiKey = document.getElementById('onb-btn-apikey');
    if (btnApiKey) {
      btnApiKey.addEventListener('click', () => this.openSettingsModal());
    }

    // Passo 2: Selecionar pasta (abre o modal de scan)
    const btnScan = document.getElementById('onb-btn-scan');
    if (btnScan) {
      btnScan.addEventListener('click', () => this.openScanModal());
    }

    // "Começar" — encerra onboarding
    const btnStart = document.getElementById('onb-btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => this.hideOnboarding());
    }

    // "Pular" — encerra onboarding sem configurar nada
    const btnSkip = document.getElementById('onb-btn-skip');
    if (btnSkip) {
      btnSkip.addEventListener('click', () => this.hideOnboarding());
    }
  }

  hideOnboarding() {
    this.isOnboarding = false;
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.style.display = 'none';

    const appRoot = document.getElementById('app-root');
    if (appRoot) appRoot.classList.remove('app-root--blurred');

    // Recarrega biblioteca agora que o app está visível
    this.libraryManager.loadTags();
    this.libraryManager.loadItems();
    this.checkApiKeyStatus();
  }

  _updateOnbStepStatus(step, done) {
    const stepEl = document.getElementById(`onb-step-${step}`);
    if (!stepEl) return;
    if (done) {
      stepEl.classList.add('is-done');
    } else {
      stepEl.classList.remove('is-done');
    }

    // Atualiza o texto de status do passo
    const statusEl = document.getElementById(`onb-status-${step === 1 ? 'apikey' : 'scan'}`);
    if (statusEl) {
      if (done) {
        statusEl.innerHTML = '<svg class="check-icon" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg> Concluído';
        statusEl.classList.add('is-visible');
      } else {
        statusEl.innerHTML = '';
        statusEl.classList.remove('is-visible');
      }
    }

    // Habilita "Começar" se passo 2 estiver concluído
    if (step === 2 && done) {
      const btnStart = document.getElementById('onb-btn-start');
      if (btnStart) btnStart.disabled = false;
    }
  }

  async onbScanComplete() {
    // Busca contagem atualizada de itens
    let itemsCount = 0;
    try {
      const data = await LibraryAPI.getOnboardingStatus();
      itemsCount = data.items_count || 0;
    } catch (_) {}

    // Marca passo 2 como concluído
    this._updateOnbStepStatus(2, true);

    // Mostra status inline igual ao da chave de API
    const resultEl = document.getElementById('onb-scan-result');
    const textEl = document.getElementById('onb-scan-result-text');
    if (resultEl && textEl) {
      textEl.textContent = `${itemsCount} ${itemsCount === 1 ? 'livro encontrado' : 'livros encontrados'}!`;
      resultEl.style.display = 'flex';
    }
  }

  closeScanModal() {
    const modal = document.getElementById('scan-modal');
    if (modal) modal.classList.remove('active');
  }

  showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Global Reader Controller Helper Functions
function showReaderView(type) {
  const appRoot = document.getElementById('app-root');
  const readerView = document.getElementById('reader-view');
  if (appRoot) appRoot.style.display = 'none';
  if (readerView) readerView.classList.remove('hidden');
}

function closeReader() {
  const appRoot = document.getElementById('app-root');
  const readerView = document.getElementById('reader-view');
  
  if (readerView) readerView.classList.add('hidden');
  if (appRoot) appRoot.style.display = 'flex';

  // Fechar instâncias ativas do leitor
  if (typeof closePdf === 'function') {
    closePdf();
  }

  // Recarregar biblioteca/detalhes para atualizar badges de progresso
  if (window.app && window.app.libraryManager) {
    window.app.libraryManager.loadItems();
    if (window.app.libraryManager.currentItem) {
      window.app.libraryManager.openBookDetails(window.app.libraryManager.currentItem.id);
    }
  }
}

function openReader(item, filePath) {
  if (!item) return;
  const pathToOpen = filePath || item.path;
  if (!pathToOpen) return;

  const ext = pathToOpen.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    if (typeof openPdf === 'function') {
      openPdf(item, pathToOpen);
    } else {
      alert('Leitor de PDF não carregado adequadamente.');
    }
  } else if (ext === 'epub') {
    alert(`Leitor de EPUB selecionado para "${item.title}". (EPUB.js será integrado no próximo módulo)`);
  } else {
    // Fallback padrão para PDF
    if (typeof openPdf === 'function') {
      openPdf(item, pathToOpen);
    }
  }
}

window.showReaderView = showReaderView;
window.closeReader = closeReader;
window.openReader = openReader;

// Global instance initialization on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
  window.app.init();

  const backBtn = document.getElementById('btn-back-library');
  if (backBtn) {
    backBtn.addEventListener('click', () => closeReader());
  }
});

// ============================================================
// Tecla ESC — fecha a camada interativa mais externa ativa
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  // 1. Leitor de PDF/EPUB aberto?
  const readerView = document.getElementById('reader-view');
  if (readerView && !readerView.classList.contains('hidden')) {
    if (typeof closeReader === 'function') closeReader();
    return;
  }

  // 2. Modal de confirmação de remoção?
  const confirmModal = document.getElementById('confirm-remove-modal');
  if (confirmModal && confirmModal.classList.contains('active')) {
    confirmModal.classList.remove('active');
    return;
  }

  // 3. Modal de edição de metadados?
  const editModal = document.getElementById('edit-metadata-modal');
  if (editModal && editModal.classList.contains('active')) {
    if (window.app) window.app.libraryManager.closeEditMetadataModal();
    return;
  }

  // 4. Modal de seleção de obras (metadados Gemini)?
  const metaSelectModal = document.getElementById('metadata-select-modal');
  if (metaSelectModal && metaSelectModal.classList.contains('active')) {
    metaSelectModal.classList.remove('active');
    return;
  }

  // 5. Modal de resultados de metadados?
  const metaResultsModal = document.getElementById('metadata-results-modal');
  if (metaResultsModal && metaResultsModal.classList.contains('active')) {
    metaResultsModal.classList.remove('active');
    return;
  }

  // 6. Modal de escanear pasta?
  const scanModal = document.getElementById('scan-modal');
  if (scanModal && scanModal.classList.contains('active')) {
    if (window.app) window.app.closeScanModal();
    return;
  }

  // 6b. Modal de configurações?
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal && settingsModal.classList.contains('active')) {
    if (window.app) window.app.closeSettingsModal();
    return;
  }

  // 7. Menu de contexto (clique direito no card)?
  const contextMenu = document.getElementById('book-context-menu');
  if (contextMenu && contextMenu.classList.contains('active')) {
    contextMenu.classList.remove('active');
    return;
  }

  // 8. Página de detalhes do livro?
  const detailsView = document.getElementById('book-details-view');
  if (detailsView && detailsView.style.display !== 'none') {
    if (window.app) window.app.libraryManager.closeBookDetails();
    return;
  }

  // 9. Onboarding overlay?
  const onboardingOverlay = document.getElementById('onboarding-overlay');
  if (onboardingOverlay && onboardingOverlay.style.display !== 'none'
      && !document.querySelector('.modal-backdrop.active')) {
    return;
  }
});
