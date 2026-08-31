const shortcutsMap = [
  {
    context: 'shortcuts.context.general',
    shortcuts: [
      { action: 'shortcuts.action.close', keys: [['shortcuts.key.escape']] }
    ]
  },
  {
    context: 'shortcuts.context.library',
    shortcuts: [
      { action: 'shortcuts.action.open_details', keys: [['shortcuts.key.clickleft']] },
      { action: 'shortcuts.action.context_menu', keys: [['shortcuts.key.clickright']] }
    ]
  },
  {
    context: 'shortcuts.context.reading',
    shortcuts: [
      { action: 'shortcuts.action.prev_page', keys: [['shortcuts.key.arrowleft'], ['shortcuts.key.pageup']] },
      { action: 'shortcuts.action.next_page', keys: [['shortcuts.key.arrowright'], ['shortcuts.key.pagedown'], ['shortcuts.key.space']] },
      { action: 'shortcuts.action.zoom_in', keys: [['shortcuts.key.ctrl', '+'], ['shortcuts.key.ctrl', '=']] },
      { action: 'shortcuts.action.zoom_out', keys: [['shortcuts.key.ctrl', '-']] },
      { action: 'shortcuts.action.zoom_reset', keys: [['shortcuts.key.ctrl', '0']] },
      { action: 'shortcuts.action.fullscreen', keys: [['F']] },
      { action: 'shortcuts.action.toggle_pdf_mode', keys: [['M']] },
      { action: 'shortcuts.action.toggle_epub_theme', keys: [['M']] },
      { action: 'shortcuts.action.columns', keys: [['C']] },
      { action: 'shortcuts.action.highlight', keys: [['shortcuts.key.selection']] },
      { action: 'shortcuts.action.highlight_remove', keys: [['shortcuts.key.click_hl'], ['shortcuts.key.escape']] }
    ]
  }
];
window.shortcutsMap = shortcutsMap;

const STARTUP_PROGRESS_MS = 3000;
const STARTUP_EXIT_DELAY_MS = 1000;
const STARTUP_EXIT_MS = 1000;
const STARTUP_WAIT_PROGRESS = 94;

class AppController {
  constructor() {
    this.libraryManager = new LibraryManager();
    this.metadataManager = new MetadataManager(this);
    this.isOnboarding = false;
    this.coverRestoredInEdit = false;
    this.startupStartedAt = performance.now();
    this.startupAnimationFrame = null;
    this.startupFinishing = false;
  }

  setStartupProgress(value) {
    const progress = Math.max(0, Math.min(100, value));
    const displayedProgress = Math.round(progress);
    const overlay = document.getElementById('startup-loading');
    const label = document.getElementById('startup-progress-value');
    const fill = document.getElementById('startup-progress-fill');
    if (overlay) overlay.setAttribute('aria-valuenow', String(displayedProgress));
    if (label) label.textContent = `${displayedProgress}%`;
    if (fill) fill.style.width = `${progress.toFixed(2)}%`;
  }

  startStartupProgress() {
    this.setStartupProgress(0);
    const update = (now) => {
      const elapsed = now - this.startupStartedAt;
      const progress = Math.min(
        STARTUP_WAIT_PROGRESS,
        (elapsed / STARTUP_PROGRESS_MS) * STARTUP_WAIT_PROGRESS
      );
      this.setStartupProgress(progress);
      if (progress < STARTUP_WAIT_PROGRESS) {
        this.startupAnimationFrame = window.requestAnimationFrame(update);
      }
    };
    this.startupAnimationFrame = window.requestAnimationFrame(update);
  }

  fadeStartupOverlay(overlay) {
    overlay.style.pointerEvents = 'none';
    if (typeof overlay.animate !== 'function') {
      overlay.classList.add('is-complete');
      window.setTimeout(() => overlay.remove(), STARTUP_EXIT_MS + 20);
      return;
    }

    const fade = overlay.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      {
        duration: STARTUP_EXIT_MS,
        easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
        fill: 'forwards'
      }
    );
    const fallbackRemoval = window.setTimeout(() => overlay.remove(), STARTUP_EXIT_MS + 100);
    fade.finished.then(() => {
      window.clearTimeout(fallbackRemoval);
      overlay.remove();
    }).catch(() => {
      window.clearTimeout(fallbackRemoval);
      overlay.remove();
    });
  }

  finishStartup() {
    if (this.startupFinishing) return;
    this.startupFinishing = true;
    const overlay = document.getElementById('startup-loading');
    if (!overlay) return;
    const elapsed = performance.now() - this.startupStartedAt;
    const remainingProgressTime = Math.max(0, STARTUP_PROGRESS_MS - elapsed);
    window.setTimeout(() => {
      if (this.startupAnimationFrame !== null) {
        window.cancelAnimationFrame(this.startupAnimationFrame);
      }
      this.setStartupProgress(100);
      window.setTimeout(() => {
        this.fadeStartupOverlay(overlay);
      }, STARTUP_EXIT_DELAY_MS);
    }, remainingProgressTime);
  }

  async init() {
    this.startStartupProgress();
    if (typeof window.electronAPI?.waitForBackendReady === 'function') {
      await window.electronAPI.waitForBackendReady();
    }
    I18N.init();
    I18N.onLangChange = (lang) => this._syncLangPicker(lang);
    window.chapterViewMode = 'title';
    window.cardViewMode = '2d';
    // Carrega preferências salvas antes de renderizar a biblioteca
    // (o modo de card afeta o grid já no primeiro render).
    try {
      const settings = await LibraryAPI.getSettings();
      window.chapterViewMode = (settings.chapter_view_mode === 'title+cover') ? 'title+cover' : 'title';
      window.cardViewMode = (settings.card_view_mode === '3d') ? '3d' : '2d';
    } catch (err) {
      window.chapterViewMode = 'title';
      window.cardViewMode = '2d';
    }
    // Preferência local (persistida via localStorage) tem precedência
    const storedView = localStorage.getItem('krumer_chapter_view');
    if (storedView === 'title' || storedView === 'title+cover') {
      window.chapterViewMode = storedView;
    }
    const storedCardView = localStorage.getItem('krumer_card_view');
    if (storedCardView === '2d' || storedCardView === '3d') {
      window.cardViewMode = storedCardView;
    }
    this.loadSavedTheme();
    this.setupNavigation();
    this.setupSearchAndFilter();
    this.setupModals();
    this.setupSettingsModal();
    this.setupAuth();
    this.setupOnboarding();
    this.metadataManager.init();
    await this.libraryManager.init();
    await this.checkApiKeyStatus();
    await this.checkOnboarding();
    this.startRealtimeWatcher();
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

        // F4: Auto-rescan on category switch (silent, background)
        this.triggerAutoRescan();
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
                LibraryAPI.refreshCoverCache();
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


    // === Edit Metadata Modal (editar-metadados-livro.md) ===

    // Open modal from "Editar Metadados" button on details page
    const btnEditMetadata = document.getElementById('details-btn-edit');
    if (btnEditMetadata) {
      btnEditMetadata.addEventListener('click', () => {
        this.coverRestoredInEdit = false;
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
            const updatedCoverItem = await LibraryAPI.uploadCover(item.id, newCoverFile);
            LibraryAPI.refreshCoverCache();
            this.libraryManager.applyPersistedItem(updatedCoverItem);
          }

          const shouldBustCover = !!newCoverFile || this.coverRestoredInEdit;
          this.coverRestoredInEdit = false;
          this.libraryManager.closeEditMetadataModal();
          this.showToast(I18N.t('toast.metadata_saved'));

          // 3. Reload the details page to reflect all changes instantly
          //    (bust the cover after upload/restore so the new image appears)
          await this.libraryManager.openBookDetails(item.id, shouldBustCover);

        } catch (err) {
          console.error('Erro ao salvar metadados:', err);
          this.showToast(I18N.t('toast.save_error', err.message));
        } finally {
          if (submitBtn)  submitBtn.disabled = false;
          if (submitText) submitText.textContent = I18N.t('modal.edit.save');
        }
      });
    }

    // Restore Original Cover button
    const restoreOriginalCoverBtn = document.getElementById('btn-restore-original-cover');
    if (restoreOriginalCoverBtn) {
      restoreOriginalCoverBtn.addEventListener('click', async () => {
        const item = this.libraryManager.selectedItem;
        if (!item) return;

        restoreOriginalCoverBtn.disabled = true;
        try {
          const updated = await LibraryAPI.restoreOriginalCover(item.id);
          LibraryAPI.refreshCoverCache();
          this.libraryManager.applyPersistedItem(updated);
          this.coverRestoredInEdit = true;

          // Update the cover preview in the form
          const preview = document.getElementById('edit-cover-preview');
          if (preview) {
            preview.src = LibraryAPI.getCoverUrl(updated.id, true);
            preview.style.display = 'block';
          }

          // Garante que a grade da biblioteca exiba a capa original restaurada
          // Hide restore button (cover is now the original)
          restoreOriginalCoverBtn.style.display = 'none';

          this.showToast(I18N.t('toast.cover_restored'));
        } catch (err) {
          console.error('Erro ao restaurar capa:', err);
          const detail = err.message || '';
          if (detail.includes('no embedded') || detail.includes('n\u00e3o possui')) {
            this.showToast(I18N.t('toast.cover_no_original'));
          } else {
            this.showToast(I18N.t('toast.cover_restore_error', detail));
          }
        } finally {
          restoreOriginalCoverBtn.disabled = false;
        }
      });
    }
  }


  openScanModal() {
    const modal = document.getElementById('scan-modal');
    if (modal) modal.classList.add('active');
  }

  /**
   * F4 — Silently runs an incremental library scan and applies the diff to the
   * grid in real time. New books animate in; removed books animate out. The
   * page is never fully refreshed.
   */
  async triggerAutoRescan() {
    try {
      const result = await LibraryAPI.scanIncremental();
      if (result.status === 'success') {
        // Apply additions/removals directly to the DOM (no full re-render)
        await this.libraryManager.applyRealtimeChanges();
      }
      // 'no_change', 'locked', 'no_folder' — no action needed
    } catch (err) {
      // Auto-rescan failures are silent — don't toast the user
      console.warn('Auto-rescan error (silent):', err.message);
    }
  }

  /**
   * Real-time library monitor. Polls the incremental scan while the library
   * page is visible so new/removed files appear instantly on the main grid,
   * with a light entry/exit animation — without reloading the page.
   */
  startRealtimeWatcher() {
    if (this._realtimeTimer) return;
    this._realtimeBusy = false;
    const intervalMs = 1500;
    this._realtimeTimer = setInterval(() => {
      if (this._realtimeBusy) return;
      if (!this._isLibraryPageReady()) return;
      this._realtimeBusy = true;
      this.triggerAutoRescan()
        .catch(() => {})
        .finally(() => { this._realtimeBusy = false; });
    }, intervalMs);
  }

  /**
   * Indicates whether the main library grid is on screen (no reader, details
   * page or modal blocking the view).
   */
  _isLibraryPageReady() {
    const readerView = document.getElementById('reader-view');
    if (readerView && !readerView.classList.contains('hidden')) return false;

    const detailsView = document.getElementById('book-details-view');
    if (detailsView && detailsView.style.display !== 'none') return false;

    if (document.querySelector('.modal-backdrop.active')) return false;

    const appRoot = document.getElementById('app-root');
    if (appRoot && appRoot.style.display === 'none') return false;

    return true;
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
    this._setupDataPanel();

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

    // F6: Alterar modo de visualização dos capítulos
    document.querySelectorAll('.chapter-view-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.chapterView;
        if (mode !== 'title' && mode !== 'title+cover') return;
        window.chapterViewMode = mode;
        localStorage.setItem('krumer_chapter_view', mode);
        this._setChapterViewActive(mode);
        LibraryAPI.updateSettings({ chapter_view_mode: mode })
          .then(() => this.showToast(I18N.t('settings.chapter_view_toast', I18N.t(mode === 'title' ? 'settings.chapter_view_title' : 'settings.chapter_view_cover'))))
          .catch(() => {});
      });
    });

    // Visualização dos cards da biblioteca (2D / 3D)
    document.querySelectorAll('.card-style-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.cardStyle;
        if (mode !== '2d' && mode !== '3d') return;
        window.cardViewMode = mode;
        localStorage.setItem('krumer_card_view', mode);
        this._setCardStyleActive(mode);
        LibraryAPI.updateSettings({ card_view_mode: mode })
          .then(() => this.showToast(I18N.t('settings.card_style_toast', I18N.t(mode === '2d' ? 'settings.card_style_2d' : 'settings.card_style_3d'))))
          .catch(() => {});
        this.libraryManager.loadItems();
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
        const language = select ? select.value : 'en';
        const prevLanguage = localStorage.getItem('krumer_language') || 'en';
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

  setupAuth() {
    const api = window.electronAPI;
    const panel = document.querySelector('.settings-panel[data-panel="conta"]');
    if (!panel) return;

    const status = document.getElementById('auth-panel-status');
    const signedOut = document.getElementById('auth-signed-out');
    const signedIn = document.getElementById('auth-signed-in');
    const email = document.getElementById('auth-email');
    const password = document.getElementById('auth-password');
    const passwordConfirm = document.getElementById('auth-password-confirm');
    const newPassword = document.getElementById('auth-new-password');
    const newPasswordConfirm = document.getElementById('auth-new-password-confirm');
    const credentialsForm = document.getElementById('auth-credentials-form');
    const updatePasswordForm = document.getElementById('auth-update-password-form');
    const submitLabel = document.getElementById('auth-submit-label');
    const confirmGroup = document.getElementById('auth-confirm-group');
    const accountEmail = document.getElementById('auth-account-email');
    const emailConfirmed = document.getElementById('auth-email-confirmed');
    const recoveryNotice = document.getElementById('auth-recovery-notice');
    const betaNotice = document.getElementById('auth-beta-notice');
    let mode = 'signin';

    if (window.KRUMER_CLOUD_SYNC_ENABLED !== true) {
      if (betaNotice) betaNotice.style.display = '';
      if (signedOut) signedOut.style.display = 'none';
      if (signedIn) signedIn.style.display = 'none';
      return;
    }
    if (betaNotice) betaNotice.style.display = 'none';

    const setStatus = (message = '', isError = false) => {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('error', isError);
    };

    const setBusy = (busy) => {
      panel.querySelectorAll('button, input').forEach((element) => {
        element.disabled = busy;
      });
    };

    const renderState = (state) => {
      const authenticated = Boolean(state?.authenticated && state.user);
      if (signedOut) signedOut.style.display = authenticated ? 'none' : '';
      if (signedIn) signedIn.style.display = authenticated ? '' : 'none';
      if (accountEmail) accountEmail.textContent = state?.user?.email || '';
      if (emailConfirmed) {
        emailConfirmed.textContent = state?.user?.emailConfirmed
          ? I18N.t('auth.email_confirmed')
          : I18N.t('auth.email_not_confirmed');
      }
      if (recoveryNotice) recoveryNotice.style.display = state?.recovery ? '' : 'none';
    };

    const refreshState = async () => {
      const state = await api.authGetState();
      renderState(state);
      if (state?.error) setStatus(state.error, true);
      return state;
    };

    const run = async (action, successMessage) => {
      setBusy(true);
      setStatus(I18N.t('auth.working'));
      try {
        const result = await action();
        if (result?.state) renderState(result.state);
        else if (result?.authenticated !== undefined) renderState(result);
        else await refreshState();
        if (successMessage) {
          setStatus(typeof successMessage === 'function' ? successMessage(result) : successMessage);
        }
        return result;
      } catch (error) {
        console.error('[Auth] Falha na ação da conta:', error);
        setStatus(error?.message || I18N.t('auth.generic_error'), true);
        return null;
      } finally {
        setBusy(false);
      }
    };

    const setMode = (nextMode) => {
      mode = nextMode === 'signup' ? 'signup' : 'signin';
      document.querySelectorAll('.auth-mode-button').forEach((button) => {
        button.classList.toggle('active', button.dataset.authMode === mode);
      });
      if (confirmGroup) confirmGroup.style.display = mode === 'signup' ? '' : 'none';
      if (password) password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
      if (submitLabel) submitLabel.textContent = I18N.t(mode === 'signup' ? 'auth.sign_up' : 'auth.sign_in');
      setStatus('');
    };

    if (!api?.authGetState) {
      setStatus(I18N.t('auth.electron_required'), true);
      setBusy(true);
      return;
    }

    document.querySelectorAll('.auth-mode-button').forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.authMode));
    });

    document.getElementById('auth-google')?.addEventListener('click', () => {
      void run(() => api.authSignInWithGoogle(), I18N.t('auth.google_browser_opened'));
    });

    credentialsForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const nextEmail = email?.value.trim() || '';
      const nextPassword = password?.value || '';
      if (mode === 'signup' && nextPassword !== (passwordConfirm?.value || '')) {
        setStatus(I18N.t('auth.passwords_mismatch'), true);
        passwordConfirm?.focus();
        return;
      }

      void run(async () => {
        if (mode === 'signup') {
          const result = await api.authSignUp(nextEmail, nextPassword);
          password.value = '';
          if (passwordConfirm) passwordConfirm.value = '';
          return result;
        }
        const result = await api.authSignIn(nextEmail, nextPassword);
        password.value = '';
        return result;
      }, mode === 'signup'
        ? (result) => I18N.t(result?.confirmationRequired ? 'auth.check_email_confirmation' : 'auth.account_created')
        : I18N.t('auth.signed_in'));
    });

    document.getElementById('auth-magic-link')?.addEventListener('click', () => {
      void run(() => api.authSendMagicLink(email?.value.trim() || ''), I18N.t('auth.check_email_magic'));
    });

    document.getElementById('auth-forgot-password')?.addEventListener('click', () => {
      void run(() => api.authRequestPasswordReset(email?.value.trim() || ''), I18N.t('auth.check_email_recovery'));
    });

    updatePasswordForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const nextPassword = newPassword?.value || '';
      if (nextPassword !== (newPasswordConfirm?.value || '')) {
        setStatus(I18N.t('auth.passwords_mismatch'), true);
        newPasswordConfirm?.focus();
        return;
      }
      void run(async () => {
        const result = await api.authUpdatePassword(nextPassword);
        newPassword.value = '';
        if (newPasswordConfirm) newPasswordConfirm.value = '';
        return result;
      }, I18N.t('auth.password_updated'));
    });

    document.getElementById('auth-sign-out')?.addEventListener('click', () => {
      void run(() => api.authSignOut(), I18N.t('auth.signed_out'));
    });

    api.onAuthStateChanged?.((state) => {
      renderState(state);
      if (state?.error) setStatus(state.error, true);
    });

    void refreshState().catch((error) => {
      console.error('[Auth] Não foi possível carregar a sessão:', error);
      setStatus(error?.message || I18N.t('auth.generic_error'), true);
    });
  }

  switchSettingsPanel(panelName) {
    const targetMenuItem = document.querySelector(`.settings-menu-item[data-settings-panel="${panelName}"]`);
    const targetPanel = document.querySelector(`.settings-panel[data-panel="${panelName}"]`);

    if (targetMenuItem && targetPanel) {
      document.querySelectorAll('.settings-menu-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));

      targetMenuItem.classList.add('active');
      targetPanel.classList.add('active');

      if (panelName === 'atalhos') {
        this.renderShortcuts();
      }
      const syncBetaNotice = document.getElementById('sync-beta-notice');
      if (syncBetaNotice) {
        syncBetaNotice.style.display = window.KRUMER_CLOUD_SYNC_ENABLED === true ? 'none' : '';
      }
      if (panelName === 'dados' && window.KRUMER_CLOUD_SYNC_ENABLED === true) {
        this._loadSyncMetrics();
      }
    }
  }

  renderShortcuts() {
    const container = document.getElementById('settings-shortcuts-container');
    if (!container) return;

    let html = '';
    const orText = I18N.t('shortcuts.or');

    for (const group of shortcutsMap) {
      html += `
        <div class="shortcuts-group">
          <div class="shortcuts-group-title">${I18N.t(group.context)}</div>
          <div class="shortcuts-list">
      `;

      for (const shortcut of group.shortcuts) {
        const keysHtml = shortcut.keys.map(combination => {
          return combination.map(part => {
            const isTranslationKey = part.startsWith('shortcuts.key.');
            const label = isTranslationKey ? I18N.t(part) : part;
            return `<kbd>${label}</kbd>`;
          }).join(' + ');
        }).join(orText);

        html += `
          <div class="shortcut-row">
            <span class="shortcut-action">${I18N.t(shortcut.action)}</span>
            <span class="shortcut-keys">${keysHtml}</span>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
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
      window.chapterViewMode = (settings.chapter_view_mode === 'title+cover') ? 'title+cover' : 'title';
      window.cardViewMode = (settings.card_view_mode === '3d') ? '3d' : '2d';
    } catch (err) {
      console.warn('Erro ao carregar configurações de idioma:', err);
    }
    // Preferência local (persistida via localStorage) tem precedência
    const storedView = localStorage.getItem('krumer_chapter_view');
    if (storedView === 'title' || storedView === 'title+cover') {
      window.chapterViewMode = storedView;
    } else {
      localStorage.setItem('krumer_chapter_view', window.chapterViewMode || 'title');
    }
    const storedCardView = localStorage.getItem('krumer_card_view');
    if (storedCardView === '2d' || storedCardView === '3d') {
      window.cardViewMode = storedCardView;
    } else {
      localStorage.setItem('krumer_card_view', window.cardViewMode || '2d');
    }
    // Always sync picker from localStorage on open
    const saved = localStorage.getItem('krumer_language') || 'en';
    this._syncLangPicker(saved);
    this._setChapterViewActive(window.chapterViewMode || 'title');
    this._setCardStyleActive(window.cardViewMode || '2d');
  }

  _setCardStyleActive(mode) {
    const value = mode === '3d' ? '3d' : '2d';
    document.querySelectorAll('.card-style-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cardStyle === value);
    });
  }

  _setChapterViewActive(mode) {
    const value = mode === 'title+cover' ? 'title+cover' : 'title';
    document.querySelectorAll('.chapter-view-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.chapterView === value);
    });
  }

  _initLangPicker() {
    const wrap = document.getElementById('lang-picker-wrap');
    const trigger = document.getElementById('lang-picker-trigger');
    const dropdown = document.getElementById('lang-picker-dropdown');
    if (!wrap || !trigger || !dropdown) return;

    // Initialize to current language
    const saved = localStorage.getItem('krumer_language') || 'en';
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
    textEl.textContent = I18N.t('settings.status_checking');

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

  _setupDataPanel() {
    const exportJsonBtn = document.getElementById('btn-export-json');
    const exportCsvBtn = document.getElementById('btn-export-csv');
    const importJsonInput = document.getElementById('import-json-input');
    const importCsvInput = document.getElementById('import-csv-input');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', async () => {
        try {
          const data = await LibraryAPI.exportJson();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `krumer-export-${new Date().toISOString().slice(0,10)}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.showToast(I18N.t('toast.export_done'));
        } catch (err) {
          this.showToast(I18N.t('toast.import_error', err.message));
        }
      });
    }
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', async () => {
        try {
          const blob = await LibraryAPI.exportCsvBlob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `krumer-export-${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.showToast(I18N.t('toast.export_done'));
        } catch (err) {
          this.showToast(I18N.t('toast.import_error', err.message));
        }
      });
    }
    if (importJsonInput) {
      importJsonInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const payload = JSON.parse(text);
          const res = await LibraryAPI.importJson(payload);
          this.showToast(I18N.t('toast.import_done', res.imported_items ?? 0));
          this.libraryManager.loadItems();
          this.libraryManager.loadTags();
          this.libraryManager.loadLists();
        } catch (err) {
          this.showToast(I18N.t('toast.import_error', err.message));
        } finally {
          e.target.value = '';
        }
      });
    }
    if (importCsvInput) {
      importCsvInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const res = await LibraryAPI.importCsvFile(file);
          this.showToast(I18N.t('toast.import_done', res.imported_items ?? 0));
          this.libraryManager.loadItems();
          this.libraryManager.loadTags();
          this.libraryManager.loadLists();
        } catch (err) {
          this.showToast(I18N.t('toast.import_error', err.message));
        } finally {
          e.target.value = '';
        }
      });
    }
  }

  async _loadSyncMetrics() {
    const box = document.getElementById('sync-metrics-content');
    if (!box) return;
    box.textContent = I18N.t('settings.status_checking');
    try {
      const m = await LibraryAPI.getSyncMetrics();
      const fmt = (v) => v ?? '—';
      box.innerHTML = `
        <div>${I18N.t('settings.sync_metrics_pending')}: <strong>${fmt(m.pending)}</strong> · ${I18N.t('settings.sync_metrics_error')}: <strong>${fmt(m.error)}</strong> · ${I18N.t('settings.sync_metrics_orphans')}: <strong>${fmt(m.orphans)}</strong></div>
        <div>${I18N.t('settings.sync_metrics_conflicts')}: <strong>${fmt(m.conflicts)}</strong> · ${I18N.t('settings.sync_metrics_pull_count')}: <strong>${fmt(m.pull_count)}</strong> · ${I18N.t('settings.sync_metrics_push_count')}: <strong>${fmt(m.push_count)}</strong></div>
        <div>${I18N.t('settings.sync_metrics_last_sync')}: <strong>${fmt(m.last_sync_at || m.last_pull_at || m.last_push_at)}</strong></div>
        ${m.last_error ? `<div style="color:#ef4444; word-break:break-word;">${this.libraryManager.escapeHtml(m.last_error)}</div>` : ''}
      `;
    } catch (err) {
      box.textContent = I18N.t('toast.metrics_error', err.message);
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

        // F5: Passo 0 — começa pela seleção de idioma
        this._openOnboardingLanguage();

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
    // F5: Passo 0 — Seleção de idioma
    const langGrid = document.getElementById('onb-language-grid');
    const langContinueBtn = document.getElementById('onb-btn-language-continue');
    if (langGrid && langContinueBtn) {
      const defaultLang = 'en';
      let selectedLang = localStorage.getItem('krumer_language') || defaultLang;
      this._syncOnboardingLangSelection(selectedLang);

      langGrid.querySelectorAll('.onb-language-option').forEach(btn => {
        btn.addEventListener('click', async () => {
          const lang = btn.dataset.lang;
          if (!lang) return;
          selectedLang = lang;
          this._syncOnboardingLangSelection(lang);
          langContinueBtn.disabled = false;
          try {
            await LibraryAPI.updateSettings({ language: lang });
          } catch (err) {
            console.warn('Não foi possível salvar o idioma no backend:', err);
          }
          localStorage.setItem('krumer_language', lang);
          // Aplica o idioma imediatamente em toda a interface (inclui onboarding)
          I18N.setLang(lang);
        });
      });

      langContinueBtn.addEventListener('click', () => {
        if (selectedLang) {
          localStorage.setItem('krumer_language', selectedLang);
        }
        this._openOnboardingWelcome();
      });
    }

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

  _syncOnboardingLangSelection(lang) {
    const grid = document.getElementById('onb-language-grid');
    if (!grid) return;
    grid.querySelectorAll('.onb-language-option').forEach(b => {
      b.classList.toggle('selected', b.dataset.lang === lang);
    });
  }

  _openOnboardingLanguage() {
    const langScreen = document.getElementById('onboarding-language');
    const welcomeScreen = document.getElementById('onboarding-welcome');
    if (langScreen) langScreen.style.display = 'block';
    if (welcomeScreen) welcomeScreen.style.display = 'none';
  }

  _openOnboardingWelcome() {
    const langScreen = document.getElementById('onboarding-language');
    const welcomeScreen = document.getElementById('onboarding-welcome');
    if (langScreen) langScreen.style.display = 'none';
    if (welcomeScreen) welcomeScreen.style.display = 'block';
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

   // Recarregar biblioteca/detalhes para atualizar badges de progresso,
   // preservando a posição de scroll (sem recarregar as capas em cache).
   if (window.app && window.app.libraryManager) {
     window.app.libraryManager.loadItems(true, true);
     if (window.app.libraryManager.selectedItem) {
       window.app.libraryManager.openBookDetails(window.app.libraryManager.selectedItem.id);
     }
   }

  // F4: Trigger silent incremental scan after leaving reader
  if (window.app && typeof window.app.triggerAutoRescan === 'function') {
    window.app.triggerAutoRescan();
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
  window.app.init()
    .catch((error) => console.error('Falha ao inicializar o Krumer:', error))
    .finally(() => window.app.finishStartup());

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

let zoomToastTimer = null;

/**
 * Exibe um toast flutuante indicando a transição de zoom/fonte no leitor
 */
function showReaderZoomToast(pctVal, label = 'Zoom') {
  let toastEl = document.getElementById('reader-zoom-toast');
  const readerView = document.getElementById('reader-view');
  if (!readerView) return;

  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'reader-zoom-toast';
    toastEl.className = 'reader-zoom-toast';
    readerView.appendChild(toastEl);
  }

  toastEl.textContent = `${label}: ${pctVal}%`;

  toastEl.classList.remove('fade-out');

  if (zoomToastTimer) {
    clearTimeout(zoomToastTimer);
  }

  zoomToastTimer = setTimeout(() => {
    if (toastEl) {
      toastEl.classList.add('fade-out');
      setTimeout(() => {
        if (toastEl && toastEl.classList.contains('fade-out')) {
          toastEl.remove();
        }
      }, 250);
    }
  }, 1200);
}
