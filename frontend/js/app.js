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
    I18N.init();
    this.loadSavedTheme();
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
        document.querySelectorAll('.sidebar-item.active').forEach(el => el.classList.remove('active'));
        const navEl = e.currentTarget;
        navEl.classList.add('active');

        const category = navEl.dataset.category;
        this.libraryManager.currentCategory = category;
        this.libraryManager.currentListId = null; // Clear list filter
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
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(timeout);
          this.libraryManager.searchQuery = searchInput.value.trim();
          this.libraryManager.loadItems();
          searchInput.blur();
        }
      });
    }

    // Toggle do popup de ordenação
    const sortBtn = document.getElementById('btn-sort-popup');
    const sortPopup = document.getElementById('sort-popup');

    sortBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      sortPopup?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (sortPopup && !sortPopup.classList.contains('hidden')) {
        if (!sortPopup.contains(e.target) && !sortBtn?.contains(e.target)) {
          sortPopup.classList.add('hidden');
        }
      }
    });

    // Opções de ordenação do popup
    document.querySelectorAll('.sort-popup-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-popup-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sort = btn.dataset.sort;

        if (sort === 'added_desc') {
          this.libraryManager.sortBy = 'added_at';
          this.libraryManager.sortOrder = 'desc';
        } else if (sort === 'rating_desc') {
          this.libraryManager.sortBy = 'rating';
          this.libraryManager.sortOrder = 'desc';
        } else if (sort === 'progress_desc') {
          this.libraryManager.sortBy = 'overall_progress';
          this.libraryManager.sortOrder = 'desc';
        } else {
          this.libraryManager.sortBy = 'title';
          this.libraryManager.sortOrder = 'asc';
        }

        this.libraryManager.loadItems();
        sortPopup?.classList.add('hidden');
      });
    });
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
            this.showToast(I18N.t('toast.folder_selected', result.path));
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
              this.showToast(I18N.t('toast.folder_selected', pathInput.value));
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
          this.showToast(I18N.t('toast.invalid_path'));
          return;
        }

        try {
          this.closeScanModal();
          this._showScanProgress();

          await LibraryAPI.scanFolderWithProgress(path, {
            onProgress: (current, total, message) => {
              this._updateScanProgress(current, total, message);
            },
            onDone: () => {
              this._hideScanProgress();
              if (this.isOnboarding) {
                this.onbScanComplete();
              } else {
                this.showToast(I18N.t('toast.scan_complete'));
                this.libraryManager.loadTags();
                this.libraryManager.loadItems();
              }
            },
            onError: (errMsg) => {
              this._hideScanProgress();
              this.showToast(I18N.t('toast.scan_error_prefix', errMsg));
            },
          });
        } catch (err) {
          this._hideScanProgress();
          console.error(err);
          this.showToast(I18N.t('toast.scan_error', err.message));
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
    const confirmTextEl = document.getElementById('confirm-remove-text');

    if (btnRemoveItem) {
      btnRemoveItem.addEventListener('click', () => {
        const selectedItem = this.libraryManager.selectedItem;
        if (!selectedItem) return;
        
        if (confirmTextEl) {
          confirmTextEl.innerHTML = I18N.t('modal.remove.text', `<strong id="confirm-remove-title" style="color:var(--text-primary);">${selectedItem.title}</strong>`);
        } else if (confirmTitleEl) {
          confirmTitleEl.textContent = selectedItem.title;
        }
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
          this.showToast(I18N.t('toast.item_removed'));

          closeConfirmModalFn();

          // Fecha a página de detalhes se estiver aberta
          this.libraryManager.closeBookDetails();
        } catch (err) {
          console.error(err);
          this.showToast(I18N.t('toast.remove_error', err.message));
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
        this.showToast(I18N.t('toast.rescanning'));

        try {
          const result = await LibraryAPI.rescanFolder();
          const toastMsg = result.path ? I18N.t('toast.rescan_complete_path', result.path) : I18N.t('toast.rescan_complete');
          this.showToast(toastMsg);
          await this.libraryManager.loadTags();
          await this.libraryManager.loadItems();
        } catch (err) {
          console.error(err);
          // Se nenhuma pasta foi configurada, abre o modal de escanear
          if (err.message && err.message.includes('anteriormente')) {
            this.showToast(I18N.t('toast.rescan_none'));
            this.openScanModal();
          } else {
            this.showToast(I18N.t('toast.rescan_error', err.message));
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
          this.showToast(I18N.t('toast.title_required'));
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
        if (submitText) submitText.textContent = I18N.t('settings.api_key_saving');

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
          this.showToast(I18N.t('toast.metadata_saved'));

          // 3. Reload the details page to reflect all changes instantly
          await this.libraryManager.openBookDetails(item.id);

        } catch (err) {
          console.error('Erro ao salvar metadados:', err);
          this.showToast(I18N.t('toast.save_error', err.message));
        } finally {
          if (submitBtn)  submitBtn.disabled = false;
          if (submitText) submitText.textContent = I18N.t('modal.edit.save');
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
      bannerBtn.addEventListener('click', () => this.openSettingsModal('api-key'));
    }

    // === Custom Language Picker ===
    this._initLangPicker();

    // Alternar entre os menus do modal (Geral / Temas / Chave da API)
    document.querySelectorAll('.settings-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const panelName = item.dataset.settingsPanel;
        this.switchSettingsPanel(panelName);
      });
    });

    // Selecionar um tema
    document.querySelectorAll('.theme-option-card').forEach(card => {
      card.addEventListener('click', () => {
        this.applyTheme(card.dataset.themeValue);
      });
    });

    // Submit form
    const form = document.getElementById('settings-api-key-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('settings-api-key-input');
        const saveBtn = document.getElementById('btn-save-api-key');
        const saveText = document.getElementById('save-api-key-text');
        const value = input ? input.value.trim() : '';

        // Obter idioma selecionado e anterior
        const select = document.getElementById('settings-language-select');
        const language = select ? select.value : 'pt-br';
        const prevLanguage = localStorage.getItem('krumer_language') || 'pt-br';
        const isLangChanged = language !== prevLanguage;

        // Se o valor estiver vazio, verificar se a chave já está configurada
        let hasApiKey = false;
        try {
          const status = await LibraryAPI.getApiKeyStatus();
          hasApiKey = status.configured;
        } catch (err) {
          console.warn('Erro ao obter status da chave:', err);
        }

        if (!value && !hasApiKey) {
          this.showToast(I18N.t('settings.api_key_required'));
          if (input) {
            input.style.borderColor = '#ef4444';
            input.focus();
          }
          return;
        }
        if (input) input.style.borderColor = '';

        if (saveBtn) saveBtn.disabled = true;
        if (saveText) saveText.textContent = I18N.t('settings.api_key_saving');

        try {
          // 1. Salvar chave de API se fornecida
          if (value) {
            const result = await LibraryAPI.updateApiKey(value);
            this.showToast(result.message || I18N.t('toast.api_key_saved'));
            if (input) input.value = '';
            this._renderApiKeyStatus(true);
            await this.checkApiKeyStatus();
            if (this.isOnboarding) {
              this._updateOnbStepStatus(1, true);
            }
          }

          // 2. Salvar idioma se alterado
          if (isLangChanged) {
            await LibraryAPI.updateSettings({ language });
            localStorage.setItem('krumer_language', language);
            I18N.setLang(language);
            this.showToast(I18N.t('settings.lang_toast', select.options[select.selectedIndex].text));
          }

          this.closeSettingsModal();
        } catch (err) {
          console.error(err);
          this.showToast(I18N.t('toast.settings_error', err.message));
          this._renderApiKeyStatus(undefined, err.message);
        } finally {
          if (saveBtn) saveBtn.disabled = false;
          if (saveText) saveText.textContent = I18N.t('settings.api_key_save');
        }
      });
    }
  }

  switchSettingsPanel(panelName) {
    const targetMenuItem = document.querySelector(`.settings-menu-item[data-settings-panel="${panelName}"]`);
    const targetPanel = document.querySelector(`.settings-panel[data-panel="${panelName}"]`);

    if (targetMenuItem && targetPanel) {
      document.querySelectorAll('.settings-menu-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));

      targetMenuItem.classList.add('active');
      targetPanel.classList.add('active');
    }
  }

  async openSettingsModal(targetPanel = 'geral') {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.add('active');

    this.switchSettingsPanel(targetPanel);

    const input = document.getElementById('settings-api-key-input');
    if (input) input.value = '';

    await this._renderApiKeyStatus();
    await this._loadSettings();
    if (targetPanel === 'api-key') {
      setTimeout(() => input && input.focus(), 50);
    }
  }

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('active');
  }

  async _loadSettings() {
    try {
      const settings = await LibraryAPI.getSettings();
      if (settings.language) {
        const hidden = document.getElementById('settings-language-select');
        if (hidden) hidden.value = settings.language;
        localStorage.setItem('krumer_language', settings.language);
        this._syncLangPicker(settings.language);
      }
    } catch (err) {
      console.warn('Erro ao carregar configurações de idioma:', err);
    }
    // Always sync picker from localStorage on open
    const saved = localStorage.getItem('krumer_language') || 'pt-br';
    this._syncLangPicker(saved);
  }

  _initLangPicker() {
    const wrap = document.getElementById('lang-picker-wrap');
    const trigger = document.getElementById('lang-picker-trigger');
    const dropdown = document.getElementById('lang-picker-dropdown');
    if (!wrap || !trigger || !dropdown) return;

    // Initialize to current language
    const saved = localStorage.getItem('krumer_language') || 'pt-br';
    this._syncLangPicker(saved);

    // Toggle open/close
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrap.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(isOpen));
    });

    // Select a language option
    dropdown.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lang = btn.dataset.lang;
        const label = btn.dataset.label;

        // Update hidden input
        const hidden = document.getElementById('settings-language-select');
        if (hidden) hidden.value = lang;

        // Update trigger display
        const labelEl = document.getElementById('lang-picker-label');
        if (labelEl) labelEl.textContent = label;

        // Mark selected
        dropdown.querySelectorAll('.lang-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        // Close the dropdown
        wrap.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');

        // Apply the language immediately
        try {
          await LibraryAPI.updateSettings({ language: lang });
          localStorage.setItem('krumer_language', lang);
          I18N.setLang(lang);
          this.showToast(I18N.t('settings.lang_toast', label));
        } catch (err) {
          console.error(err);
          this.showToast(I18N.t('toast.lang_error', err.message));
        }
      });
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.classList.contains('open')) {
        wrap.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      }
    });
  }

  _syncLangPicker(lang) {
    const dropdown = document.getElementById('lang-picker-dropdown');
    const labelEl = document.getElementById('lang-picker-label');
    const hidden = document.getElementById('settings-language-select');
    if (!dropdown) return;

    const btn = dropdown.querySelector(`.lang-option[data-lang="${lang}"]`);
    if (btn) {
      dropdown.querySelectorAll('.lang-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (labelEl) labelEl.textContent = btn.dataset.label;
    }
    if (hidden) hidden.value = lang;
  }

  _showRetranslateProgress() {
    let toast = document.getElementById('retranslate-progress-toast');
    if (toast) return;

    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    toast = document.createElement('div');
    toast.id = 'retranslate-progress-toast';
    toast.className = 'metadata-progress-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.innerHTML = `
      <span class="metadata-progress-title">${I18N.t('progress.translating')}</span>
      <div class="metadata-progress-bar-wrap" style="position:relative; width: 100%; height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow:hidden; margin: 4px 0;">
        <div class="metadata-progress-bar-fill" style="width: 100%; height: 100%; background: var(--accent); border-radius: 4px; animation: translatePulse 1.5s infinite ease-in-out;"></div>
      </div>
      <span class="metadata-progress-detail">${I18N.t('progress.translating_detail')}</span>
      <style>
        @keyframes translatePulse {
          0% { opacity: 0.3; transform: scaleX(0.1); transform-origin: left; }
          50% { opacity: 1; transform: scaleX(1); transform-origin: left; }
          100% { opacity: 0.3; transform: scaleX(0.1); transform-origin: right; }
        }
      </style>
    `;
    container.appendChild(toast);
  }

  _hideRetranslateProgress() {
    const toast = document.getElementById('retranslate-progress-toast');
    if (toast) toast.remove();
  }

  async _renderApiKeyStatus(forceConfigured, errorMessage) {
    const statusEl = document.getElementById('settings-api-status');
    const textEl = statusEl ? statusEl.querySelector('.settings-status-text') : null;
    if (!statusEl || !textEl) return;

    statusEl.style.display = 'flex';
    statusEl.classList.remove('is-configured', 'is-missing', 'error');

    if (errorMessage) {
      statusEl.classList.add('error');
      textEl.textContent = I18N.t('settings.status_error', errorMessage);
      return;
    }

    let configured = forceConfigured;
    if (configured === undefined) {
      try {
        const data = await LibraryAPI.getApiKeyStatus();
        configured = data.configured;
      } catch (err) {
        statusEl.classList.add('error');
        textEl.textContent = I18N.t('settings.status_verify_error', err.message);
        return;
      }
    }

    if (configured) {
      statusEl.classList.add('is-configured');
      textEl.textContent = I18N.t('settings.status_configured');
    } else {
      statusEl.classList.add('is-missing');
      textEl.textContent = I18N.t('settings.status_missing');
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
      btnApiKey.addEventListener('click', () => this.openSettingsModal('api-key'));
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
        statusEl.innerHTML = `<svg class="check-icon" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg> ${I18N.t('onboarding.complete')}`;
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
      textEl.textContent = I18N.t('onboarding.scan_result', itemsCount);
      resultEl.style.display = 'flex';
    }
  }

  closeScanModal() {
    const modal = document.getElementById('scan-modal');
    if (modal) modal.classList.remove('active');
  }

  // ============================================================
  // Scan Progress Toast
  // ============================================================

  _showScanProgress() {
    let toast = document.getElementById('scan-progress-toast');
    if (toast) return;

    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    toast = document.createElement('div');
    toast.id = 'scan-progress-toast';
    toast.className = 'metadata-progress-toast';
    toast.innerHTML = `
      <span class="metadata-progress-title">${I18N.t('progress.scanning')}</span>
      <div class="metadata-progress-bar-wrap">
        <div class="metadata-progress-bar-fill" style="width: 0%"></div>
      </div>
      <span class="metadata-progress-pct">0%</span>
      <span class="metadata-progress-detail">${I18N.t('progress.preparing')}</span>
    `;
    container.appendChild(toast);
  }

  _updateScanProgress(current, total, message) {
    const toast = document.getElementById('scan-progress-toast');
    if (!toast) return;

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const fill = toast.querySelector('.metadata-progress-bar-fill');
    const pctEl = toast.querySelector('.metadata-progress-pct');
    const detailEl = toast.querySelector('.metadata-progress-detail');

    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (detailEl) detailEl.textContent = message || I18N.t('progress.files_processed', current, total);
  }

  _hideScanProgress() {
    const toast = document.getElementById('scan-progress-toast');
    if (toast) toast.remove();
  }

  // ============================================================
  // Theme Management
  // ============================================================

  applyTheme(themeName) {
    const VALID_THEMES = ['dark', 'light', 'sepia'];
    const THEME_STORAGE_KEY = 'krumer-theme';
    const theme = VALID_THEMES.includes(themeName) ? themeName : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);

    document.querySelectorAll('.theme-option-card').forEach(card => {
      card.classList.toggle('active', card.dataset.themeValue === theme);
    });
  }

  loadSavedTheme() {
    const THEME_STORAGE_KEY = 'krumer-theme';
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    this.applyTheme(saved || 'dark');
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
    }, 1500);
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

  // Garantir que fullscreen seja desligado ao fechar o leitor
  document.body.classList.remove('reader-fullscreen');
  const fsBar = document.getElementById('reader-fullscreen-bar');
  if (fsBar) fsBar.style.display = 'none';

  if (readerView) readerView.classList.add('hidden');
  if (appRoot) appRoot.style.display = 'flex';

  // Fechar instâncias ativas do leitor
  if (typeof closePdf === 'function') {
    closePdf();
  }
  if (typeof closeEpub === 'function') {
    closeEpub();
  }

  // Recarregar biblioteca/detalhes para atualizar badges de progresso
  if (window.app && window.app.libraryManager) {
    window.app.libraryManager.loadItems();
    if (window.app.libraryManager.selectedItem) {
      window.app.libraryManager.openBookDetails(window.app.libraryManager.selectedItem.id);
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
    if (typeof openEpub === 'function') {
      openEpub(item, pathToOpen);
    } else {
      alert('Leitor de EPUB não carregado adequadamente.');
    }
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
