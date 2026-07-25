/* ==========================================================================
   Krumer Personal Library - Grid & State Manager (Phase 2 Spec)
   ========================================================================== */

class LibraryManager {
  constructor() {
    this.items = [];
    this.currentCategory = 'all';
    this.currentTag = null;
    this.searchQuery = '';
    this.sortBy = 'title';
    this.sortOrder = 'asc';

    this.gridElement = document.getElementById('book-grid');
    this.itemCountElement = document.getElementById('item-count');
    this.tagsContainer = document.getElementById('tags-container');

    this.selectedItem = null;
  }

  /**
   * Initializes library data loading
   */
  async init() {
    await this.loadTags();
    await this.loadItems();
  }

  /**
   * Loads items from backend with active filters
   */
  async loadItems(silent = false) {
    try {
      if (!silent) {
        this.renderLoadingState();
      }

      const params = {
        sort_by: this.sortBy === 'overall_progress' ? 'title' : this.sortBy,
        order: this.sortOrder
      };

      if (this.currentCategory === 'series') {
        params.type = 'series';
      }
      if (this.currentTag) {
        params.tag = this.currentTag;
      }
      if (this.searchQuery) {
        params.search = this.searchQuery;
      }

      let fetchedItems = await LibraryAPI.getItems(params);

      // In-memory filter for categories
      if (this.currentCategory === 'reading') {
        fetchedItems = fetchedItems.filter(item => (item.overall_progress || 0) > 0 && (item.overall_progress || 0) < 100);
      } else if (this.currentCategory === 'read') {
        fetchedItems = fetchedItems.filter(item => (item.overall_progress || 0) >= 100);
      } else if (this.currentCategory === 'unread') {
        fetchedItems = fetchedItems.filter(item => (item.overall_progress || 0) < 100);
      }

      // In-memory sort for progress or rating if selected
      if (this.sortBy === 'overall_progress') {
        fetchedItems.sort((a, b) => (b.overall_progress || 0) - (a.overall_progress || 0));
      } else if (this.sortBy === 'rating') {
        fetchedItems.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      }

      this.items = fetchedItems;
      this.renderGrid();
    } catch (err) {
      console.error(err);
      if (!silent) {
        this.renderErrorState(err.message);
      }
    }
  }

  /**
   * Loads tag pills for sidebar
   */
  async loadTags() {
    try {
      const tags = await LibraryAPI.getTags();
      if (!this.tagsContainer) return;

      if (tags.length === 0) {
        this.tagsContainer.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">Nenhuma tag</span>`;
        return;
      }

      this.tagsContainer.innerHTML = tags.map(tag => `
        <span class="tag-badge ${this.currentTag === tag.name ? 'active' : ''}" data-tag="${tag.name}">
          ${tag.name}
        </span>
      `).join('');

      this.tagsContainer.querySelectorAll('.tag-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
          const tagName = e.target.dataset.tag;
          if (this.currentTag === tagName) {
            this.currentTag = null;
          } else {
            this.currentTag = tagName;
          }
          this.loadTags();
          this.loadItems();
        });
      });
    } catch (err) {
      console.error('Erro ao carregar tags:', err);
    }
  }

  /**
   * Renders streaming book card grid according to Phase 2 Specs
   */
  /**
   * Renders streaming book card grid according to Phase 2 Specs
   */
  renderGrid() {
    if (!this.gridElement) return;

    // Renderizar seção "Continuar Lendo" (livros em andamento: progresso > 0% e < 100%)
    const continueContainer = document.getElementById('continue-reading-container');
    const continueGrid = document.getElementById('continue-reading-grid');
    const continueCount = document.getElementById('continue-reading-count');

    const inProgressItems = this.items
      .filter(item => {
        const prog = item.overall_progress || 0;
        if (prog <= 0 || prog >= 100) return false;
        // Se o item tem progresso próprio (livro/capítulo), ignorar se ainda está na 1ª página
        if (item.progress && item.progress.length > 0) {
          const currentPage = item.progress[0].current_page || 0;
          if (currentPage <= 1) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aDate = a.last_read ? new Date(a.last_read) : new Date(0);
        const bDate = b.last_read ? new Date(b.last_read) : new Date(0);
        return bDate - aDate;
      });

    if (continueContainer && continueGrid) {
      if (this.currentCategory === 'all' && inProgressItems.length > 0) {
        continueContainer.style.display = 'block';
        if (continueCount) {
          continueCount.textContent = `(${inProgressItems.length} ${inProgressItems.length === 1 ? 'item' : 'itens'})`;
        }
        continueGrid.innerHTML = inProgressItems.map(item => this.createBookCardHTML(item)).join('');
        this.attachCardEventListeners();
      } else {
        continueContainer.style.display = 'none';
        continueGrid.innerHTML = '';
      }
    }

    const mainTitleTextEl = document.getElementById('main-title-text');
    if (mainTitleTextEl) {
      let titleText = 'Minha Biblioteca';
      if (this.currentCategory === 'series') titleText = 'Séries & Mangás';
      else if (this.currentCategory === 'read') titleText = 'Lidos';
      else if (this.currentCategory === 'unread') titleText = 'Não Lidos';
      else if (this.currentCategory === 'reading') titleText = 'Em Andamento';
      mainTitleTextEl.textContent = titleText;
    }

    if (this.itemCountElement) {
      this.itemCountElement.textContent = `(${this.items.length} ${this.items.length === 1 ? 'item' : 'itens'})`;
    }

    if (this.items.length === 0) {
      this.gridElement.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
          </svg>
          <div class="empty-title">Nenhum livro encontrado</div>
          <div class="empty-desc">Escaneie uma pasta no seu computador para adicionar livros ou quadrinhos à sua biblioteca.</div>
          <button class="btn btn-primary" onclick="app.openScanModal()">Escanear Pasta</button>
        </div>
      `;
      return;
    }

    this.gridElement.innerHTML = this.items.map(item => this.createBookCardHTML(item)).join('');
    this.attachCardEventListeners();
  }

  /**
   * Creates HTML structure for single book or series card
   */
  createBookCardHTML(item) {
    const isSeries = item.type === 'series';
    const coverUrl = item.cover_path ? LibraryAPI.getCoverUrl(item.id) : '';
    const progressPct = item.overall_progress || 0;
    const rating = item.rating || 0;

    // Series badge text (e.g. "4 vols" or "12 caps")
    const badgeText = isSeries ? `${item.children_count || 0} ${item.children_count === 1 ? 'vol' : 'vols'}` : '';

    return `
      <div class="book-card" data-id="${item.id}" data-type="${item.type}">
        <div class="book-cover-wrap">
          ${coverUrl ? `
            <img class="book-cover" src="${coverUrl}" alt="${this.escapeHtml(item.title)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          ` : ''}
          
          <div class="cover-fallback" style="${coverUrl ? 'display:none;' : 'display:flex;'}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
            </svg>
            <span class="cover-fallback-title">${this.escapeHtml(item.title)}</span>
          </div>

          ${isSeries ? `
            <div class="series-badge">
              <div class="series-dot"></div>
              <div class="series-dot"></div>
              <div class="series-dot"></div>
              ${badgeText}
            </div>
          ` : ''}

          <div class="cover-gradient"></div>

          <div class="cover-progress">
            <div class="cover-progress-fill" style="width: ${progressPct}%"></div>
          </div>
        </div>

        <div class="book-title" title="${this.escapeHtml(item.title)}">${this.escapeHtml(item.title)}</div>
        <div class="book-meta">${this.escapeHtml(item.author || (isSeries ? 'Série' : 'Autor desconhecido'))}</div>

        <div class="book-stars" data-id="${item.id}">
          ${[1, 2, 3, 4, 5].map(starNum => `
            <span class="star ${starNum <= rating ? '' : 'empty'}" data-rating="${starNum}">★</span>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Attaches event listeners for card clicks, star ratings, and right-click context menu
   */
  attachCardEventListeners() {
    const libraryViewport = document.querySelector('.library-viewport');
    if (!libraryViewport) return;

    // Ensure context menu exists in DOM
    this._ensureContextMenu();

    // Card click event (suporta cards de continuar lendo e biblioteca geral)
    libraryViewport.querySelectorAll('.book-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent trigger if star was clicked
        if (e.target.classList.contains('star')) return;

        const itemId = parseInt(card.dataset.id, 10);
        this.openBookDetails(itemId);
      });

      // Right-click context menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const itemId = parseInt(card.dataset.id, 10);
        const item = this.items.find(i => i.id === itemId);
        if (item) this._showContextMenu(e, item);
      });
    });

    // Star rating click event on grid card
    libraryViewport.querySelectorAll('.book-stars .star').forEach(star => {
      star.addEventListener('click', async (e) => {
        e.stopPropagation();
        const starsContainer = star.closest('.book-stars');
        const itemId = parseInt(starsContainer.dataset.id, 10);
        const newRating = parseInt(star.dataset.rating, 10);

        try {
          await LibraryAPI.updateItem(itemId, { rating: newRating });
          // Update item state locally and re-render stars
          const item = this.items.find(i => i.id === itemId);
          if (item) item.rating = newRating;

          // Atualizar todas as ocorrências deste card na viewport (continuar lendo e biblioteca geral)
          document.querySelectorAll(`.book-stars[data-id="${itemId}"]`).forEach(container => {
            container.querySelectorAll('.star').forEach(s => {
              const r = parseInt(s.dataset.rating, 10);
              if (r <= newRating) s.classList.remove('empty');
              else s.classList.add('empty');
            });
          });

          if (window.app) window.app.showToast(`Avaliação atualizada para ${newRating} estrelas`);
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  /**
   * Opens dedicated Book Details page according to pagina-detalhes-livro.md specs
   */
  async openBookDetails(id) {
    try {
      const item = await LibraryAPI.getItem(id);
      this.selectedItem = item;

      const detailsView = document.getElementById('book-details-view');
      const libraryView = document.querySelector('.library-viewport');
      const appHeader = document.querySelector('.app-header');
      if (!detailsView) return;

      // 1. Capa, Hero Backdrop e Fallback
      const heroBackdrop = document.getElementById('details-hero-backdrop');
      const coverImg = document.getElementById('details-cover-img');
      const coverFallback = document.getElementById('details-cover-fallback');
      const fallbackTitle = document.getElementById('details-fallback-title');

      if (item.cover_path) {
        const coverUrl = LibraryAPI.getCoverUrl(item.id);
        coverImg.src = coverUrl;
        coverImg.style.display = 'block';
        if (coverFallback) coverFallback.style.display = 'none';
        if (heroBackdrop) heroBackdrop.style.backgroundImage = `url("${coverUrl}")`;
      } else {
        coverImg.style.display = 'none';
        if (coverFallback) {
          coverFallback.style.display = 'flex';
          if (fallbackTitle) fallbackTitle.textContent = item.title;
        }
        if (heroBackdrop) heroBackdrop.style.backgroundImage = 'none';
      }

      // 2. Título
      const titleEl = document.getElementById('details-title');
      if (titleEl) titleEl.textContent = item.title;

      // 3. Autor (omitido se ausente, não deixa espaço em branco)
      const authorWrap = document.getElementById('details-author-wrap');
      const authorEl = document.getElementById('details-author');
      if (item.author && item.author.trim() !== '') {
        if (authorEl) authorEl.textContent = item.author;
        if (authorWrap) authorWrap.style.display = 'flex';
      } else {
        if (authorWrap) authorWrap.style.display = 'none';
      }

      // 4. Metadados Secundários (Ano, Editora, Progresso)
      const yearEl = document.getElementById('details-meta-year');
      if (item.year) {
        yearEl.textContent = `Ano: ${item.year}`;
        yearEl.style.display = 'inline-block';
      } else {
        yearEl.style.display = 'none';
      }

      const publisherEl = document.getElementById('details-meta-publisher');
      if (item.publisher) {
        publisherEl.textContent = `Editora: ${item.publisher}`;
        publisherEl.style.display = 'inline-block';
      } else {
        publisherEl.style.display = 'none';
      }

      const progressEl = document.getElementById('details-meta-progress');
      if (progressEl) {
        progressEl.textContent = `${item.overall_progress || 0}% lido`;
      }

      // 5. Avaliação por Estrelas (1 a 5, editável e persistida)
      this.renderDetailsStars(item.rating || 0);

      // 6. Botão "Ler" principal
      const readBtn = document.getElementById('details-btn-read');
      if (readBtn) {
        readBtn.onclick = () => {
          if (typeof openReader === 'function') {
            openReader(item);
          } else {
            console.error('Função openReader não encontrada');
          }
        };
      }

      // 7. Botão "Remover da biblioteca"
      const removeBtn = document.getElementById('details-btn-remove');
      if (removeBtn) {
        removeBtn.onclick = () => {
          const confirmModal = document.getElementById('confirm-remove-modal');
          const confirmTitleEl = document.getElementById('confirm-remove-title');
          if (confirmTitleEl) confirmTitleEl.textContent = item.title;
          if (confirmModal) confirmModal.classList.add('active');
        };
      }

      // 8. Sinopse / Descrição (omitida se ausente)
      const synopsisWrap = document.getElementById('details-synopsis-wrap');
      const synopsisText = document.getElementById('details-synopsis');
      if (item.description && item.description.trim() !== '') {
        if (synopsisText) synopsisText.textContent = item.description;
        if (synopsisWrap) synopsisWrap.style.display = 'block';
      } else {
        if (synopsisWrap) synopsisWrap.style.display = 'none';
      }

      // 9. Seção Inferior — Capítulos (condicional)
      const lowerSection = document.getElementById('details-lower-section');
      const chaptersGrid = document.getElementById('details-chapters-grid');

      let chapters = [];
      if (item.type === 'series' || item.children_count > 0) {
        try {
          chapters = await LibraryAPI.getItems({ parent_id: item.id, sort_by: 'title' });
        } catch (e) {
          console.warn('Erro ao buscar capítulos do livro:', e);
        }
      }

      if (chapters && chapters.length > 0) {
        if (chaptersGrid) {
          chaptersGrid.innerHTML = chapters.map((chap, idx) => `
            <div class="details-chapter-card">
              <div class="details-chapter-info">
                <div class="details-chapter-title">${this.escapeHtml(chap.title)}</div>
                <div class="details-chapter-progress">${chap.overall_progress || 0}% lido</div>
              </div>
              <button class="btn btn-secondary btn-read-chapter" data-index="${idx}" style="padding:6px 14px; font-size:12px;">
                Ler
              </button>
            </div>
          `).join('');

          chaptersGrid.querySelectorAll('.btn-read-chapter').forEach((btn) => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.dataset.index, 10);
              if (chapters[idx] && typeof openReader === 'function') {
                openReader(chapters[idx]);
              }
            });
          });
        }
        if (lowerSection) lowerSection.style.display = 'block';
      } else {
        if (lowerSection) lowerSection.style.display = 'none';
      }


      // 10. Alternar views (oculta biblioteca e exibe página de detalhes)
      if (libraryView) libraryView.style.display = 'none';
      if (appHeader) appHeader.style.display = 'none';
      detailsView.style.display = 'flex';

      // Scroll para o topo
      const scrollContainer = detailsView.querySelector('.details-content-scroll');
      if (scrollContainer) scrollContainer.scrollTop = 0;

    } catch (err) {
      console.error('Erro ao abrir página de detalhes:', err);
      if (window.app) window.app.showToast(`Erro ao carregar detalhes: ${err.message}`);
    }
  }

  /**
   * Renders star rating in details upper section and attaches click handlers
   */
  renderDetailsStars(currentRating) {
    const starsContainer = document.getElementById('details-stars');
    const ratingTextEl = document.getElementById('details-rating-text');
    if (!starsContainer) return;

    starsContainer.querySelectorAll('.star').forEach(star => {
      const r = parseInt(star.dataset.rating, 10);
      if (r <= currentRating) star.classList.remove('empty');
      else star.classList.add('empty');

      star.onclick = async () => {
        if (!this.selectedItem) return;
        const newRating = r;

        try {
          await LibraryAPI.updateItem(this.selectedItem.id, { rating: newRating });
          this.selectedItem.rating = newRating;
          this.renderDetailsStars(newRating);
          if (window.app) window.app.showToast(`Avaliação salva: ${newRating} estrelas`);
        } catch (err) {
          console.error(err);
          if (window.app) window.app.showToast(`Erro ao salvar avaliação: ${err.message}`);
        }
      };
    });

    if (ratingTextEl) {
      ratingTextEl.textContent = currentRating > 0 ? `(${currentRating}/5 estrelas)` : '(sem nota)';
    }
  }

  /**
   * Closes Book Details view and returns to library
   */
  closeBookDetails() {
    const detailsView = document.getElementById('book-details-view');
    const libraryView = document.querySelector('.library-viewport');
    const appHeader = document.querySelector('.app-header');

    if (detailsView) detailsView.style.display = 'none';
    if (libraryView) libraryView.style.display = 'flex';
    if (appHeader) appHeader.style.display = 'flex';

    // Recarrega itens para refletir quaisquer atualizações de avaliação
    this.loadItems();
  }

  /**
   * Opens the Edit Metadata modal pre-filled with the current book's data
   */
  openEditMetadataModal() {
    const item = this.selectedItem;
    if (!item) return;

    const modal = document.getElementById('edit-metadata-modal');
    if (!modal) return;

    // Pre-fill all form fields
    const f = (id) => document.getElementById(id);
    if (f('edit-title-input')) f('edit-title-input').value = item.title || '';
    if (f('edit-author-input')) f('edit-author-input').value = item.author || '';
    if (f('edit-publisher-input')) f('edit-publisher-input').value = item.publisher || '';
    if (f('edit-year-input')) f('edit-year-input').value = item.year || '';
    if (f('edit-synopsis-input')) f('edit-synopsis-input').value = item.description || '';

    // Tags: join array of tag names
    const tagNames = (item.tags || []).map(t => t.name || t).join(', ');
    if (f('edit-tags-input')) f('edit-tags-input').value = tagNames;

    // Reset cover picker state
    const fileInput = f('edit-cover-file-input');
    const filenameLabel = f('edit-cover-filename');
    const preview = f('edit-cover-preview');
    if (fileInput) fileInput.value = '';
    if (filenameLabel) filenameLabel.textContent = 'Nenhuma nova imagem selecionada';
    if (preview) {
      if (item.cover_path) {
        preview.src = LibraryAPI.getCoverUrl(item.id);
        preview.style.display = 'block';
      } else {
        preview.src = '';
        preview.style.display = 'none';
      }
    }

    modal.classList.add('active');
  }

  /**
   * Closes the Edit Metadata modal without saving
   */
  closeEditMetadataModal() {
    const modal = document.getElementById('edit-metadata-modal');
    if (modal) modal.classList.remove('active');
  }


  renderLoadingState() {
    if (!this.gridElement) return;
    this.gridElement.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: var(--text-muted);">
        Carregando biblioteca...
      </div>
    `;
  }

  renderErrorState(message) {
    if (!this.gridElement) return;
    this.gridElement.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: #ef4444;">
        Erro ao carregar dados do servidor: ${this.escapeHtml(message)}
      </div>
    `;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  // ---------------------------------------------------------------------------
  // Context Menu (right-click on book card)
  // ---------------------------------------------------------------------------

  /**
   * Creates the context menu element once and appends it to <body>
   */
  _ensureContextMenu() {
    if (document.getElementById('book-context-menu')) return;
    const menu = document.createElement('div');
    menu.id = 'book-context-menu';
    menu.className = 'book-context-menu';
    menu.innerHTML = `
      <div class="ctx-menu-header">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13
               C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13
               C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13
               C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
        <span id="ctx-menu-title">Livro</span>
      </div>
      <div class="ctx-menu-divider"></div>
      <button class="ctx-menu-item" id="ctx-mark-read">
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        Marcar como lido
      </button>
      <button class="ctx-menu-item ctx-menu-item--muted" id="ctx-mark-unread">
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        Marcar como não lido
      </button>
    `;
    document.body.appendChild(menu);

    // Close on outside click
    document.addEventListener('click', () => this._hideContextMenu());
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.book-card')) this._hideContextMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._hideContextMenu();
    });
  }

  /**
   * Positions and shows the context menu for the given item
   */
  _showContextMenu(e, item) {
    const menu = document.getElementById('book-context-menu');
    if (!menu) return;

    // Update header title
    const titleEl = document.getElementById('ctx-menu-title');
    if (titleEl) titleEl.textContent = item.title;

    // Wire up buttons freshly each time
    const btnRead   = document.getElementById('ctx-mark-read');
    const btnUnread = document.getElementById('ctx-mark-unread');

    const isRead = (item.overall_progress || 0) >= 100;
    if (btnRead)   btnRead.style.display   = isRead ? 'none' : 'flex';
    if (btnUnread) btnUnread.style.display = (item.overall_progress || 0) > 0 ? 'flex' : 'none';

    const newBtnRead = btnRead.cloneNode(true);
    btnRead.parentNode.replaceChild(newBtnRead, btnRead);
    newBtnRead.addEventListener('click', () => { this._markAsRead(item); this._hideContextMenu(); });

    const newBtnUnread = btnUnread.cloneNode(true);
    btnUnread.parentNode.replaceChild(newBtnUnread, btnUnread);
    newBtnUnread.addEventListener('click', () => { this._markAsUnread(item); this._hideContextMenu(); });

    // Position menu near cursor, keeping it within viewport
    const { innerWidth: vw, innerHeight: vh } = window;
    const { offsetWidth: mw, offsetHeight: mh } = menu;
    let x = e.clientX + 6;
    let y = e.clientY + 6;
    if (x + mw > vw) x = vw - mw - 8;
    if (y + mh > vh) y = vh - mh - 8;
    menu.style.left = `${x}px`;
    menu.style.top  = `${y}px`;
    menu.classList.add('active');
  }

  _hideContextMenu() {
    const menu = document.getElementById('book-context-menu');
    if (menu) menu.classList.remove('active');
  }

  /**
   * Marks the item as fully read (progress 100%) in the backend with smooth, flicker-free UI updates
   */
  async _markAsRead(item) {
    try {
      const filePath = (item.progress && item.progress.length > 0)
        ? item.progress[0].file_path
        : item.path;
      const totalPages = (item.progress && item.progress.length > 0 && item.progress[0].total_pages)
        ? item.progress[0].total_pages
        : 9999;

      // Update local item state
      item.overall_progress = 100.0;
      if (item.progress && item.progress.length > 0) {
        item.progress[0].progress_pct = 100.0;
        item.progress[0].current_page = totalPages;
      }

      // Smooth in-place UI update
      const cardEl = document.querySelector(`.book-card[data-id="${item.id}"]`);
      const shouldBeRemoved = (this.currentCategory === 'unread' || this.currentCategory === 'reading');

      if (shouldBeRemoved && cardEl) {
        cardEl.classList.add('removing');
        this.items = this.items.filter(i => i.id !== item.id);
        if (this.itemCountElement) {
          this.itemCountElement.textContent = `(${this.items.length} ${this.items.length === 1 ? 'item' : 'itens'})`;
        }
        setTimeout(() => {
          cardEl.remove();
          if (this.items.length === 0) {
            this.renderGrid();
          }
        }, 250);
      } else if (cardEl) {
        const fill = cardEl.querySelector('.cover-progress-fill');
        if (fill) fill.style.width = '100%';
      }

      if (window.app) window.app.showToast(`"${item.title}" marcado como lido`);

      // Persist to backend in the background without refreshing/rebuilding the whole grid
      await LibraryAPI.saveProgress(item.id, {
        file_path: filePath,
        progress_pct: 100.0,
        current_page: totalPages,
        total_pages: totalPages
      });
    } catch (err) {
      console.error('Erro ao marcar como lido:', err);
      if (window.app) window.app.showToast('Erro ao salvar progresso');
    }
  }

  /**
   * Marks the item as unread (resets progress to 0) in the backend with smooth, flicker-free UI updates
   */
  async _markAsUnread(item) {
    try {
      const filePath = (item.progress && item.progress.length > 0)
        ? item.progress[0].file_path
        : item.path;

      // Update local item state
      item.overall_progress = 0.0;
      if (item.progress && item.progress.length > 0) {
        item.progress[0].progress_pct = 0.0;
        item.progress[0].current_page = 0;
      }

      // Smooth in-place UI update
      const cardEl = document.querySelector(`.book-card[data-id="${item.id}"]`);
      const shouldBeRemoved = (this.currentCategory === 'read' || this.currentCategory === 'reading');

      if (shouldBeRemoved && cardEl) {
        cardEl.classList.add('removing');
        this.items = this.items.filter(i => i.id !== item.id);
        if (this.itemCountElement) {
          this.itemCountElement.textContent = `(${this.items.length} ${this.items.length === 1 ? 'item' : 'itens'})`;
        }
        setTimeout(() => {
          cardEl.remove();
          if (this.items.length === 0) {
            this.renderGrid();
          }
        }, 250);
      } else if (cardEl) {
        const fill = cardEl.querySelector('.cover-progress-fill');
        if (fill) fill.style.width = '0%';
      }

      if (window.app) window.app.showToast(`"${item.title}" marcado como não lido`);

      // Persist to backend in the background without refreshing/rebuilding the whole grid
      await LibraryAPI.saveProgress(item.id, {
        file_path: filePath,
        progress_pct: 0.0,
        current_page: 0,
        total_pages: (item.progress && item.progress.length > 0) ? item.progress[0].total_pages : null
      });
    } catch (err) {
      console.error('Erro ao marcar como não lido:', err);
      if (window.app) window.app.showToast('Erro ao salvar progresso');
    }
  }
}

window.LibraryManager = LibraryManager;
