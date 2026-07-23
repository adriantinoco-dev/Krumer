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
  async loadItems() {
    try {
      this.renderLoadingState();
      
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

      // In-memory filter for 'reading' category (progress > 0 && progress < 100)
      if (this.currentCategory === 'reading') {
        fetchedItems = fetchedItems.filter(item => item.overall_progress > 0 && item.overall_progress < 100);
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
      this.renderErrorState(err.message);
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
  renderGrid() {
    if (!this.gridElement) return;

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
   * Attaches event listeners for card clicks and star ratings
   */
  attachCardEventListeners() {
    // Card click event
    this.gridElement.querySelectorAll('.book-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent trigger if star was clicked
        if (e.target.classList.contains('star')) return;

        const itemId = parseInt(card.dataset.id, 10);
        const itemType = card.dataset.type;

        if (itemType === 'series') {
          this.openSeriesDrawer(itemId);
        } else {
          this.openDetailModal(itemId);
        }
      });
    });

    // Star rating click event
    this.gridElement.querySelectorAll('.book-stars .star').forEach(star => {
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
          
          starsContainer.querySelectorAll('.star').forEach(s => {
            const r = parseInt(s.dataset.rating, 10);
            if (r <= newRating) s.classList.remove('empty');
            else s.classList.add('empty');
          });

          if (window.app) window.app.showToast(`Avaliação atualizada para ${newRating} estrelas`);
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  /**
   * Opens details modal for a single book
   */
  async openDetailModal(id) {
    try {
      const item = await LibraryAPI.getItem(id);
      this.selectedItem = item;
      
      const modal = document.getElementById('detail-modal');
      if (!modal) return;

      document.getElementById('detail-title').textContent = item.title;
      document.getElementById('detail-author').textContent = item.author || 'Autor desconhecido';
      document.getElementById('detail-desc').textContent = item.description || 'Sem descrição cadastrada.';
      
      const coverImg = document.getElementById('detail-cover-img');
      coverImg.src = LibraryAPI.getCoverUrl(item.id);

      modal.classList.add('active');
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
    }
  }

  /**
   * Opens slide-over drawer panel for a series
   */
  async openSeriesDrawer(seriesId) {
    try {
      const seriesItem = await LibraryAPI.getItem(seriesId);
      const chapters = await LibraryAPI.getItems({ parent_id: seriesId, sort_by: 'title' });

      const drawer = document.getElementById('series-drawer');
      if (!drawer) return;

      document.getElementById('drawer-series-title').textContent = seriesItem.title;
      document.getElementById('drawer-series-count').textContent = `${chapters.length} capítulos/volumes`;

      const listContainer = document.getElementById('drawer-chapter-list');
      listContainer.innerHTML = chapters.map(chap => `
        <div class="chapter-item">
          <div>
            <div class="chapter-title">${this.escapeHtml(chap.title)}</div>
            <div class="chapter-progress">${chap.overall_progress || 0}% lido</div>
          </div>
          <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="alert('Leitor de arquivo será ativado na Fase 3/4!')">Ler</button>
        </div>
      `).join('');

      drawer.classList.add('active');
    } catch (err) {
      console.error('Erro ao carregar capítulos da série:', err);
    }
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
    return str.replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
}

window.LibraryManager = LibraryManager;
