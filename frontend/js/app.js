/* ==========================================================================
   Krumer Personal Library - App Controller & Entry Point
   ========================================================================== */

class AppController {
  constructor() {
    this.libraryManager = new LibraryManager();
  }

  async init() {
    this.setupNavigation();
    this.setupSearchAndFilter();
    this.setupModals();
    await this.libraryManager.init();
  }

  setupNavigation() {
    document.querySelectorAll('.nav-item[data-category]').forEach(item => {
      item.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-item[data-category]').forEach(el => el.classList.remove('active'));
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

    // Botão "Selecionar pasta" com seletor nativo (popup_escanear.md §1)
    const browseBtn = document.getElementById('btn-browse-folder');
    const folderInput = document.getElementById('folder-picker-input');
    const pathInput = document.getElementById('scan-path-input');

    if (browseBtn) {
      browseBtn.addEventListener('click', async () => {
        // Tenta showDirectoryPicker (Chrome/Edge modernos)
        if ('showDirectoryPicker' in window) {
          try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (dirHandle && pathInput) {
              // Browsers ocultam o caminho absoluto por segurança;
              // usamos o nome para feedback visual — o usuário confirma/edita se necessário
              pathInput.value = dirHandle.name;
              pathInput.dataset.dirHandle = dirHandle.name;
              this.showToast(`Pasta "${dirHandle.name}" selecionada. Confirme ou edite o caminho completo.`);
            }
            return;
          } catch (err) {
            if (err.name === 'AbortError') return; // usuário cancelou
            // Fallback para input[webkitdirectory]
          }
        }
        // Fallback: input[type=file webkitdirectory]
        if (folderInput) folderInput.click();
      });
    }

    if (folderInput) {
      folderInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0 && pathInput) {
          // webkitRelativePath = "NomePasta/arquivo.pdf" — pega só o primeiro segmento
          const rel = files[0].webkitRelativePath || '';
          const folderName = rel.split('/')[0] || '';
          if (folderName) {
            pathInput.value = folderName;
            this.showToast(`Pasta "${folderName}" selecionada. Confirme ou edite o caminho completo.`);
          }
        }
      });
    }

    // Scan Form Submit — lê caminho + preferência de título (popup_escanear.md §2)
    const scanForm = document.getElementById('scan-form');
    if (scanForm) {
      scanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const path = pathInput ? pathInput.value.trim() : '';

        if (!path) {
          this.showToast('Por favor informe um caminho válido de pasta.');
          return;
        }

        // Lê preferência de fonte do título (metadados ou nome do arquivo)
        const selectedRadio = document.querySelector('input[name="title_source"]:checked');
        const useFilenameAsTitle = selectedRadio ? selectedRadio.value === 'filename' : false;

        try {
          this.showToast('Iniciando escaneamento da pasta...');
          this.closeScanModal();

          await LibraryAPI.scanFolder(path, useFilenameAsTitle);
          this.showToast('Escaneamento concluído com sucesso!');
          this.libraryManager.loadTags();
          this.libraryManager.loadItems();
        } catch (err) {
          console.error(err);
          this.showToast(`Erro ao escanear: ${err.message}`);
        }
      });
    }


    // Detail Modal close
    const closeDetailBtn = document.getElementById('close-detail-modal');
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener('click', () => {
        const modal = document.getElementById('detail-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Drawer close
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
          
          // Fecha o modal de detalhes
          const detailModal = document.getElementById('detail-modal');
          if (detailModal) detailModal.classList.remove('active');
          
          // Recarrega a biblioteca
          await this.libraryManager.loadTags();
          await this.libraryManager.loadItems();
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
  }


  openScanModal() {
    const modal = document.getElementById('scan-modal');
    if (modal) modal.classList.add('active');
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

// Global instance initialization on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
  window.app.init();
});
