/* ==========================================================================
   Krumer Personal Library - Grid & State Manager (Phase 2 Spec)
   ========================================================================== */

class LibraryManager {
  constructor() {
    this.items = [];
    this.currentCategory = 'all';
    this.currentListId = null;
    this.currentTag = null;
    this.searchQuery = '';
    this.sortBy = 'title';
    this.sortOrder = 'asc';

    this.gridElement = document.getElementById('book-grid');
    this.itemCountElement = document.getElementById('item-count');
    this.tagsContainer = document.getElementById('tags-container');
    this.lists = [];

    this.selectedItem = null;
  }

  /**
   * Initializes library data loading
   */
  async init() {
    this._setupSidebarLists();
    this._setupListModals();
    await this.loadLists();
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

      // In-memory filter for custom list
      if (this.currentListId) {
        try {
          const listItemIds = await LibraryAPI.getListItems(this.currentListId);
          const idSet = new Set(listItemIds.map(li => li.id));
          fetchedItems = fetchedItems.filter(item => idSet.has(item.id));
        } catch (e) {
          console.warn('Erro ao filtrar por lista:', e);
        }
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
        this.tagsContainer.innerHTML = `<span style="font-size:11px; color:var(--text-muted);">${I18N.t('sidebar.tags.empty')}</span>`;
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
          continueCount.textContent = I18N.t('continue.count', inProgressItems.length);
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
      let titleText = I18N.t('main.title.all');
      if (this.currentCategory === 'series') titleText = I18N.t('main.title.series');
      else if (this.currentCategory === 'read') titleText = I18N.t('main.title.read');
      else if (this.currentCategory === 'unread') titleText = I18N.t('main.title.unread');
      else if (this.currentCategory === 'reading') titleText = I18N.t('main.title.reading');
      else if (this.currentListId) {
        const list = this.lists.find(l => l.id === this.currentListId);
        if (list) titleText = list.name;
      }
      mainTitleTextEl.textContent = titleText;
    }

    if (this.itemCountElement) {
      this.itemCountElement.textContent = I18N.t('main.item_count_simple', this.items.length);
    }

    if (this.items.length === 0) {
      // Empty state customizado para listas
      const favList = this.currentListId && this.lists.find(l => l.id === this.currentListId && l.is_default);
      if (favList) {
        this.gridElement.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="48" height="48">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <div class="empty-title">${I18N.t('empty.favorites_title')}</div>
          <div class="empty-desc">${I18N.t('empty.favorites_desc')}</div>
        </div>
        `;
      } else {
        this.gridElement.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
          </svg>
          <div class="empty-title">${I18N.t('empty.title')}</div>
          <div class="empty-desc">${I18N.t('empty.desc')}</div>
          <button class="btn btn-primary" onclick="app.openScanModal()">${I18N.t('empty.scan')}</button>
        </div>
        `;
      }
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
    const badgeText = isSeries ? I18N.t('series.vol', item.children_count || 0) : '';
    const authorText = item.author || (isSeries ? I18N.t('series.author_fallback') : I18N.t('author.unknown'));

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
        <div class="book-meta">${this.escapeHtml(authorText)}</div>

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
        const clickedRating = parseInt(star.dataset.rating, 10);

        try {
          const item = this.items.find(i => i.id === itemId);
          const currentRating = item ? (item.rating || 0) : 0;
          const newRating = clickedRating === currentRating ? 0 : clickedRating;

          await LibraryAPI.updateItem(itemId, { rating: newRating });
          if (item) item.rating = newRating;

          document.querySelectorAll(`.book-stars[data-id="${itemId}"]`).forEach(container => {
            container.querySelectorAll('.star').forEach(s => {
              const r = parseInt(s.dataset.rating, 10);
              if (r <= newRating) s.classList.remove('empty');
              else s.classList.add('empty');
            });
          });

          if (window.app) window.app.showToast(
            newRating > 0 ? I18N.t('details.rating_updated', newRating) : I18N.t('details.rating_removed')
          );
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
        yearEl.textContent = I18N.t('details.year_prefix', item.year);
        yearEl.style.display = 'inline-block';
      } else {
        yearEl.style.display = 'none';
      }

      const publisherEl = document.getElementById('details-meta-publisher');
      if (item.publisher) {
        publisherEl.textContent = I18N.t('details.publisher_prefix', item.publisher);
        publisherEl.style.display = 'inline-block';
      } else {
        publisherEl.style.display = 'none';
      }

      const progressEl = document.getElementById('details-meta-progress');
      if (progressEl) {
        progressEl.textContent = I18N.t('details.progress', item.overall_progress || 0);
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
      // Ocultar temporariamente; será ajustado após verificar capítulos (seção 9)
      if (readBtn) readBtn.style.display = 'inline-flex';

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
        // Ocultar botão "Ler Agora" principal quando o livro tem capítulos
        if (readBtn) readBtn.style.display = 'none';

        if (chaptersGrid) {
          chaptersGrid.innerHTML = chapters.map((chap, idx) => `
            <div class="details-chapter-card" data-id="${chap.id}">
              <button class="btn-mark-read-chapter ${chap.is_read ? 'is-read' : ''}" data-id="${chap.id}" title="${chap.is_read ? I18N.t('details.mark_unread') : I18N.t('details.mark_read')}">
                ${chap.is_read 
                  ? `<svg class="icon-read" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                       <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
                     </svg>`
                  : `<svg class="icon-unread" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                       <circle cx="12" cy="12" r="10"></circle>
                     </svg>`
                }
              </button>
              <div class="details-chapter-info">
                <div class="details-chapter-title">${this.escapeHtml(chap.title)}</div>
                <div class="details-chapter-progress">${I18N.t('details.chapter_progress', chap.overall_progress || 0)}</div>
              </div>
              <button class="btn btn-primary btn-read-chapter" data-index="${idx}">
                ${I18N.t('details.read_chapter')}
              </button>
            </div>
          `).join('');

          chaptersGrid.querySelectorAll('.btn-mark-read-chapter').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const chapId = parseInt(btn.dataset.id, 10);
              const chap = chapters.find(c => c.id === chapId);
              if (!chap) return;

              const nextState = !chap.is_read;
              const chapterCard = btn.closest('.details-chapter-card');
              const progressEl = chapterCard ? chapterCard.querySelector('.details-chapter-progress') : null;
              
              // Otimistic local update
              chap.is_read = nextState;
              chap.overall_progress = nextState ? 100.0 : 0.0;
              btn.classList.toggle('is-read', nextState);
              btn.title = nextState ? I18N.t('details.mark_unread') : I18N.t('details.mark_read');
              btn.innerHTML = nextState
                ? `<svg class="icon-read" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                     <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
                   </svg>`
                : `<svg class="icon-unread" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                     <circle cx="12" cy="12" r="10"></circle>
                   </svg>`;
              if (progressEl) progressEl.textContent = I18N.t('details.chapter_progress', chap.overall_progress);

              // Recalcula progresso geral da série
              const totalPct = chapters.reduce((sum, c) => sum + (c.overall_progress || 0), 0);
              const seriesAvg = chapters.length > 0 ? Math.round(totalPct / chapters.length) : 0;
              const progressDetailEl = document.getElementById('details-meta-progress');
              if (progressDetailEl) progressDetailEl.textContent = I18N.t('details.progress', seriesAvg);
              if (this.selectedItem) this.selectedItem.overall_progress = seriesAvg;

              try {
                await LibraryAPI.updateItemReadStatus(chapId, nextState);
                if (window.app) window.app.showToast(nextState ? I18N.t('chapter.toast.read') : I18N.t('chapter.toast.unread'));
              } catch (err) {
                console.error(err);
                // Revert on error
                chap.is_read = !nextState;
                chap.overall_progress = nextState ? 0.0 : 100.0;
                btn.classList.toggle('is-read', !nextState);
                btn.title = !nextState ? I18N.t('details.mark_unread') : I18N.t('details.mark_read');
                btn.innerHTML = !nextState
                  ? `<svg class="icon-read" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                       <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
                     </svg>`
                  : `<svg class="icon-unread" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                       <circle cx="12" cy="12" r="10"></circle>
                     </svg>`;
                if (progressEl) progressEl.textContent = I18N.t('details.chapter_progress', chap.overall_progress);
                // Recalcula progresso geral da série novamente após reverter
                const totalPctRevert = chapters.reduce((sum, c) => sum + (c.overall_progress || 0), 0);
                const seriesAvgRevert = chapters.length > 0 ? Math.round(totalPctRevert / chapters.length) : 0;
                if (progressDetailEl) progressDetailEl.textContent = I18N.t('details.progress', seriesAvgRevert);
                if (this.selectedItem) this.selectedItem.overall_progress = seriesAvgRevert;
                if (window.app) window.app.showToast(I18N.t('toast.chapter_error'));
              }
            });
          });

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

      // Ocultar sidebar na página de detalhes
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.add('sidebar--hidden');

      // Scroll para o topo
      const scrollContainer = detailsView.querySelector('.details-content-scroll');
      if (scrollContainer) scrollContainer.scrollTop = 0;

    } catch (err) {
      console.error('Erro ao abrir página de detalhes:', err);
      if (window.app) window.app.showToast(I18N.t('toast.detail_error', err.message));
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
        const currentRating = this.selectedItem.rating || 0;
        const newRating = r === currentRating ? 0 : r;

        try {
          await LibraryAPI.updateItem(this.selectedItem.id, { rating: newRating });
          this.selectedItem.rating = newRating;
          this.renderDetailsStars(newRating);
          if (window.app) window.app.showToast(
            newRating > 0 ? I18N.t('details.rating_updated', newRating) : I18N.t('details.rating_removed')
          );
        } catch (err) {
          console.error(err);
          if (window.app) window.app.showToast(I18N.t('toast.rating_error', err.message));
        }
      };
    });

    if (ratingTextEl) {
      ratingTextEl.textContent = currentRating > 0 ? I18N.t('details.rating_stars', currentRating) : I18N.t('details.rating_none');
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

    // Restaurar sidebar ao voltar para a biblioteca
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('sidebar--hidden');

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
    if (filenameLabel) filenameLabel.textContent = I18N.t('modal.edit.cover_none');
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
        ${I18N.t('loading.library')}
      </div>
    `;
  }

  renderErrorState(message) {
    if (!this.gridElement) return;
    this.gridElement.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: #ef4444;">
        ${I18N.t('toast.load_error', this.escapeHtml(message))}
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
  // Custom Lists
  // ---------------------------------------------------------------------------

  async loadLists() {
    try {
      this.lists = await LibraryAPI.getLists();
      this._renderListsInSidebar();
    } catch (err) {
      console.error('Erro ao carregar listas:', err);
    }
  }

  _renderListsInSidebar() {
    const container = document.getElementById('sidebar-lists-container');
    if (!container) return;
    const section = document.getElementById('sidebar-lists-section');
    if (section) {
      section.style.display = '';
    }
    container.style.display = this.lists.length > 0 ? '' : 'none';
    container.innerHTML = this.lists.map(list => {
      const isFav = list.is_default;
      const displayName = isFav ? I18N.t('sidebar.favorites') : list.name;
      return `
      <a href="#" class="sidebar-item${this.currentListId === list.id ? ' active' : ''}" data-list-id="${list.id}">
        <div class="sidebar-icon-wrap">
          ${isFav ? `
          <svg fill="currentColor" viewBox="0 0 24 24" width="18" height="18">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          ` : `
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          `}
        </div>
        <span class="sidebar-label">${this.escapeHtml(displayName)}</span>
      </a>`;
    }).join('');
  }

  _setupSidebarLists() {
    const container = document.getElementById('sidebar-lists-container');
    if (!container) return;
    container.addEventListener('click', (e) => {
      const item = e.target.closest('[data-list-id]');
      if (!item) return;
      e.preventDefault();
      this._selectList(parseInt(item.dataset.listId, 10));
    });

    container.addEventListener('contextmenu', (e) => {
      const item = e.target.closest('[data-list-id]');
      if (!item) return;
      e.preventDefault();
      const listId = parseInt(item.dataset.listId, 10);
      const list = this.lists.find(l => l.id === listId);
      if (!list || list.is_default) return;
      this._openManageListModal(listId);
    });

    const btn = document.getElementById('btn-create-list');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this._openCreateListModal();
      });
    }
  }

  _selectList(listId) {
    const allSidebarItems = document.querySelectorAll('.sidebar-item[data-list-id], .sidebar-item[data-category]');
    allSidebarItems.forEach(el => el.classList.remove('active'));
    const target = document.querySelector(`.sidebar-item[data-list-id="${listId}"]`);
    if (target) target.classList.add('active');
    this.currentListId = listId;
    this.currentCategory = null;
    this.currentTag = null;
    this.loadTags();
    this.loadItems();
  }

  _openCreateListModal() {
    const modal = document.getElementById('create-list-modal');
    const input = document.getElementById('create-list-input');
    if (!modal || !input) return;
    input.value = '';
    modal.classList.add('active');
    setTimeout(() => input.focus(), 100);
  }

  _openManageListModal(listId) {
    const list = this.lists.find(l => l.id === listId);
    if (!list) return;
    const modal = document.getElementById('manage-list-modal');
    const input = document.getElementById('manage-list-input');
    const deleteBtn = document.getElementById('btn-delete-list');
    const renameBtn = document.getElementById('btn-confirm-rename-list');
    if (!modal || !input) return;

    input.value = list.name;
    input.dataset.listId = listId;
    input.disabled = list.is_default;

    if (list.is_default) {
      deleteBtn.style.display = 'none';
      renameBtn.style.display = 'none';
    } else {
      deleteBtn.style.display = '';
      renameBtn.style.display = '';
    }

    deleteBtn.onclick = async () => {
      try {
        await LibraryAPI.deleteList(listId);
        this.lists = this.lists.filter(l => l.id !== listId);
        if (this.currentListId === listId) {
          this.currentListId = null;
          this._selectLibraryCategory('all');
        }
        this._renderListsInSidebar();
        modal.classList.remove('active');
        if (window.app) window.app.showToast(I18N.t('toast.list_deleted', list.name));
      } catch (err) {
        console.error(err);
        if (window.app) window.app.showToast(I18N.t('api.error_lists'));
      }
    };

    renameBtn.onclick = async () => {
      const newName = input.value.trim();
      if (!newName) return;
      try {
        await LibraryAPI.updateList(listId, { name: newName });
        list.name = newName;
        if (this.currentListId === listId) this.loadItems();
        this._renderListsInSidebar();
        modal.classList.remove('active');
        if (window.app) window.app.showToast(I18N.t('toast.list_renamed', newName));
      } catch (err) {
        console.error(err);
        if (window.app) window.app.showToast(I18N.t('api.error_lists'));
      }
    };

    modal.classList.add('active');
    setTimeout(() => input.focus(), 100);
  }

  _setupListModals() {
    // Create list modal
    const createModal = document.getElementById('create-list-modal');
    const createInput = document.getElementById('create-list-input');
    const confirmCreate = document.getElementById('btn-confirm-create-list');
    const cancelCreate = document.getElementById('btn-cancel-create-list');
    const closeCreate = document.getElementById('close-create-list-modal');

    const closeCreateModal = () => { if (createModal) createModal.classList.remove('active'); };

    if (confirmCreate) {
      confirmCreate.addEventListener('click', async () => {
        const name = createInput ? createInput.value.trim() : '';
        if (!name) return;
        try {
          const newList = await LibraryAPI.createList(name);
          this.lists.push(newList);
          this._renderListsInSidebar();
          closeCreateModal();
          if (window.app) window.app.showToast(I18N.t('toast.list_created', name));
        } catch (err) {
          console.error(err);
          if (window.app) window.app.showToast(I18N.t('api.error_lists'));
        }
      });
    }
    if (cancelCreate) cancelCreate.addEventListener('click', closeCreateModal);
    if (closeCreate) closeCreate.addEventListener('click', closeCreateModal);

    // Manage list modal
    const manageModal = document.getElementById('manage-list-modal');
    const cancelManage = document.getElementById('btn-cancel-manage-list');
    const closeManage = document.getElementById('close-manage-list-modal');

    const closeManageModal = () => { if (manageModal) manageModal.classList.remove('active'); };

    if (cancelManage) cancelManage.addEventListener('click', closeManageModal);
    if (closeManage) closeManage.addEventListener('click', closeManageModal);

    // Close modals on backdrop click
    [createModal, manageModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.remove('active');
        });
      }
    });
  }

  async _addItemToList(itemId, listId) {
    try {
      await LibraryAPI.addItemsToList(listId, [itemId]);
      const list = this.lists.find(l => l.id === listId);
      if (window.app) window.app.showToast(I18N.t('toast.list_added', list ? list.name : ''));
    } catch (err) {
      console.error(err);
      if (window.app) window.app.showToast(I18N.t('api.error_lists'));
    }
  }

  async _removeItemFromList(itemId, listId) {
    try {
      await LibraryAPI.removeItemFromList(listId, itemId);
      const list = this.lists.find(l => l.id === listId);
      if (window.app) window.app.showToast(I18N.t('toast.list_removed', list ? list.name : ''));
      if (this.currentListId === listId) {
        this.items = this.items.filter(i => i.id !== itemId);
        this.renderGrid();
      }
    } catch (err) {
      console.error(err);
      if (window.app) window.app.showToast(I18N.t('api.error_lists'));
    }
  }

  _selectLibraryCategory(category) {
    const allSidebarItems = document.querySelectorAll('.sidebar-item[data-list-id], .sidebar-item[data-category]');
    allSidebarItems.forEach(el => el.classList.remove('active'));
    const target = document.querySelector(`.sidebar-item[data-category="${category}"]`);
    if (target) target.classList.add('active');
    this.currentCategory = category;
    this.currentListId = null;
    this.currentTag = null;
    this.loadTags();
    this.loadItems();
  }

  // ---------------------------------------------------------------------------
  // Context Menu (right-click on book card)
  // ---------------------------------------------------------------------------

  /**
   * Creates the context menu element once and appends it to <body>
   */
  _ensureContextMenu() {
    const existing = document.getElementById('book-context-menu');
    if (existing) {
      const readLabel = existing.querySelector('#ctx-mark-read .ctx-label');
      if (readLabel) readLabel.textContent = I18N.t('details.mark_read');
      const unreadLabel = existing.querySelector('#ctx-mark-unread .ctx-label');
      if (unreadLabel) unreadLabel.textContent = I18N.t('details.mark_unread');
      const favLabel = existing.querySelector('#ctx-fav-label');
      if (favLabel) favLabel.textContent = I18N.t('context.add_to_favorites');
      this._updateContextMenuLists(existing);
      return;
    }
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
        <span id="ctx-menu-title">${I18N.t('details.read')}</span>
      </div>
      <div class="ctx-menu-divider"></div>
      <button class="ctx-menu-item" id="ctx-mark-read">
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="ctx-label">${I18N.t('details.mark_read')}</span>
      </button>
      <button class="ctx-menu-item ctx-menu-item--muted" id="ctx-mark-unread">
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="ctx-label">${I18N.t('details.mark_unread')}</span>
      </button>
      <button class="ctx-menu-item ctx-menu-item--fav" id="ctx-fav">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span class="ctx-label" id="ctx-fav-label">${I18N.t('context.add_to_favorites')}</span>
      </button>
      <div class="ctx-menu-divider ctx-divider-lists"></div>
      <div id="ctx-lists-container"></div>
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

  _updateContextMenuLists(menu) {
    const container = menu.querySelector('#ctx-lists-container');
    if (!container) return;
    const divider = menu.querySelector('.ctx-divider-lists');
    const otherLists = this.lists.filter(l => !l.is_default);
    if (otherLists.length === 0) {
      container.innerHTML = '';
      if (divider) divider.style.display = 'none';
      return;
    }
    if (divider) divider.style.display = '';
    container.innerHTML = otherLists.map(list => {
      const displayName = list.is_default ? I18N.t('sidebar.favorites') : list.name;
      return `
      <button class="ctx-menu-item ctx-list-item" data-list-id="${list.id}">
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
        <span class="ctx-label">${I18N.t('context.add_to_list')}</span>
        <span class="ctx-list-name">${this.escapeHtml(displayName)}</span>
      </button>`;
    }).join('');
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

    // Wire up "Add to favorites" button
    const favBtn = document.getElementById('ctx-fav');
    const favLabel = document.getElementById('ctx-fav-label');
    const favList = this.lists.find(l => l.is_default);
    if (favBtn) {
      if (favList) {
        favBtn.style.display = '';
        const newFavBtn = favBtn.cloneNode(true);
        favBtn.parentNode.replaceChild(newFavBtn, favBtn);
        newFavBtn.addEventListener('click', () => {
          this._addItemToList(item.id, favList.id);
          this._hideContextMenu();
        });
      } else {
        favBtn.style.display = 'none';
      }
    }

    // Update and wire up list items
    this._updateContextMenuLists(menu);
    const listContainer = menu.querySelector('#ctx-lists-container');
    if (listContainer) {
      const listBtns = listContainer.querySelectorAll('.ctx-list-item');
      listBtns.forEach(btn => {
        const listId = parseInt(btn.dataset.listId, 10);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._addItemToList(item.id, listId);
          this._hideContextMenu();
        });
      });
    }

    // Right-click on a list item shows "Remove from list" if viewing that list
    if (this.currentListId) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'ctx-menu-item ctx-menu-item--danger';
      removeBtn.innerHTML = `
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        <span class="ctx-label">${I18N.t('context.remove_from_list')}</span>
      `;
      removeBtn.addEventListener('click', () => {
        this._removeItemFromList(item.id, this.currentListId);
        this._hideContextMenu();
      });
      if (!menu.querySelector('#ctx-remove-from-list')) {
        removeBtn.id = 'ctx-remove-from-list';
        const divider = document.createElement('div');
        divider.className = 'ctx-menu-divider';
        listContainer.parentNode.insertBefore(divider, listContainer.nextSibling);
        listContainer.parentNode.insertBefore(removeBtn, listContainer.nextSibling);
      } else {
        const existing = menu.querySelector('#ctx-remove-from-list');
        existing.parentNode.replaceChild(removeBtn, existing);
      }
    } else {
      const existing = menu.querySelector('#ctx-remove-from-list');
      if (existing) existing.remove();
      const prevDivider = menu.querySelector('.ctx-menu-divider:last-of-type');
      if (prevDivider && prevDivider.classList.contains('ctx-menu-divider') && !prevDivider.id) {
        // Remove the divider before the remove button if it exists
        const nextSib = prevDivider.nextElementSibling;
        if (nextSib && nextSib.id === 'ctx-remove-from-list') {
          prevDivider.remove();
        }
      }
    }

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
      const mainCardEl = document.querySelector(`#book-grid .book-card[data-id="${item.id}"]`);
      const crCardEl = document.querySelector(`#continue-reading-grid .book-card[data-id="${item.id}"]`);
      const shouldBeRemoved = (this.currentCategory === 'unread' || this.currentCategory === 'reading');

      if (shouldBeRemoved && mainCardEl) {
        mainCardEl.classList.add('removing');
        this.items = this.items.filter(i => i.id !== item.id);
        if (this.itemCountElement) {
          this.itemCountElement.textContent = I18N.t('main.item_count_simple', this.items.length);
        }
        setTimeout(() => {
          mainCardEl.remove();
          if (this.items.length === 0) {
            this.renderGrid();
          }
        }, 250);
      } else if (mainCardEl) {
        const fill = mainCardEl.querySelector('.cover-progress-fill');
        if (fill) fill.style.width = '100%';
      }

      // Remove from "Continue Reading" section with animation
      if (crCardEl) {
        crCardEl.classList.add('removing');
        setTimeout(() => {
          crCardEl.remove();
          this._updateContinueReadingSection();
        }, 250);
      }

      if (window.app) window.app.showToast(I18N.t('toast.read', item.title));

      // Persist to backend in the background without refreshing/rebuilding the whole grid
      await LibraryAPI.saveProgress(item.id, {
        file_path: filePath,
        progress_pct: 100.0,
        current_page: totalPages,
        total_pages: totalPages
      });
    } catch (err) {
      console.error('Erro ao marcar como lido:', err);
      if (window.app) window.app.showToast(I18N.t('toast.progress_error'));
    }
  }

  /**
   * Updates the "Continue Reading" section visibility after an item is removed
   */
  _updateContinueReadingSection() {
    const continueGrid = document.getElementById('continue-reading-grid');
    const continueContainer = document.getElementById('continue-reading-container');
    const continueCount = document.getElementById('continue-reading-count');
    if (!continueGrid || !continueContainer) return;

    const remaining = continueGrid.querySelectorAll('.book-card').length;
    if (remaining === 0) {
      continueContainer.style.display = 'none';
      continueGrid.innerHTML = '';
    } else if (continueCount) {
      continueCount.textContent = I18N.t('continue.count', remaining);
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
      const mainCardEl = document.querySelector(`#book-grid .book-card[data-id="${item.id}"]`);
      const crCardEl = document.querySelector(`#continue-reading-grid .book-card[data-id="${item.id}"]`);
      const shouldBeRemoved = (this.currentCategory === 'read' || this.currentCategory === 'reading');

      if (shouldBeRemoved && mainCardEl) {
        mainCardEl.classList.add('removing');
        this.items = this.items.filter(i => i.id !== item.id);
        if (this.itemCountElement) {
          this.itemCountElement.textContent = I18N.t('main.item_count_simple', this.items.length);
        }
        setTimeout(() => {
          mainCardEl.remove();
          if (this.items.length === 0) {
            this.renderGrid();
          }
        }, 250);
      } else if (mainCardEl) {
        const fill = mainCardEl.querySelector('.cover-progress-fill');
        if (fill) fill.style.width = '0%';
      }

      // Remove from "Continue Reading" section with animation
      if (crCardEl) {
        crCardEl.classList.add('removing');
        setTimeout(() => {
          crCardEl.remove();
          this._updateContinueReadingSection();
        }, 250);
      }

      if (window.app) window.app.showToast(I18N.t('toast.unread', item.title));

      // Persist to backend in the background without refreshing/rebuilding the whole grid
      await LibraryAPI.saveProgress(item.id, {
        file_path: filePath,
        progress_pct: 0.0,
        current_page: 0,
        total_pages: (item.progress && item.progress.length > 0) ? item.progress[0].total_pages : null
      });
    } catch (err) {
      console.error('Erro ao marcar como não lido:', err);
      if (window.app) window.app.showToast(I18N.t('toast.progress_error'));
    }
  }
}

window.LibraryManager = LibraryManager;