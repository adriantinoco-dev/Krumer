/* ==========================================================================
   Krumer - Metadata Scraper Flow Manager
   ========================================================================== */

function paraTitleCase(texto) {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .split(' ')
    .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

class MetadataManager {
  constructor(app) {
    this.app = app;
    this.limite = 10;
    this.livros = [];
    this.selecionados = [];
    this.resultados = [];
    this.resultadoSelecionado = null;
    this.processando = false;
  }

  init() {
    const btn = document.getElementById('btn-obter-metadados');
    if (btn) btn.addEventListener('click', () => this.abrirSelecaoLivros());

    document.getElementById('close-metadata-select-modal')?.addEventListener('click', () => this.fecharModal('metadata-select-modal'));
    document.getElementById('btn-metadata-select-cancel')?.addEventListener('click', () => this.fecharModal('metadata-select-modal'));
    document.getElementById('btn-metadata-fetch')?.addEventListener('click', () => this.iniciarBusca());

    document.getElementById('close-metadata-results-modal')?.addEventListener('click', () => this.fecharResultados());
    document.getElementById('btn-metadata-results-close')?.addEventListener('click', () => this.fecharResultados());
    document.getElementById('btn-metadata-apply')?.addEventListener('click', () => this.aplicarMetadados());

    // Diálogo "chave necessária" — abre settings
    this._setupApiKeyRequiredDialog();
    this._setupRateLimitDialog();
  }

  _setupApiKeyRequiredDialog() {
    const modal = document.getElementById('api-key-required-modal');
    if (!modal) return;

    const close = (e) => { if (e.target === modal) this.fecharModal('api-key-required-modal'); };
    modal.addEventListener('click', close);

    document.getElementById('close-apikeyreq-modal')?.addEventListener('click', () => this.fecharModal('api-key-required-modal'));
    document.getElementById('btn-close-apikeyreq')?.addEventListener('click', () => this.fecharModal('api-key-required-modal'));

    document.getElementById('btn-go-settings-apikey')?.addEventListener('click', () => {
      this.fecharModal('api-key-required-modal');
      if (window.app && window.app.openSettingsModal) {
        window.app.openSettingsModal('api-key');
      }
    });
  }

  _setupRateLimitDialog() {
    const modal = document.getElementById('rate-limit-modal');
    if (!modal) return;
    const close = (e) => { if (e.target === modal) this.fecharModal('rate-limit-modal'); };
    modal.addEventListener('click', close);
    document.getElementById('close-ratelimit-modal')?.addEventListener('click', () => this.fecharModal('rate-limit-modal'));
    document.getElementById('btn-close-ratelimit')?.addEventListener('click', () => this.fecharModal('rate-limit-modal'));
  }

  _mostrarRateLimit(msg) {
    const el = document.getElementById('rate-limit-message');
    if (el) el.textContent = msg;
    this.abrirModal('rate-limit-modal');
  }

  setProcessando(ativo) {
    this.processando = ativo;
    const btn = document.getElementById('btn-obter-metadados');
    if (btn) btn.disabled = ativo;
  }

  abrirModal(id) {
    document.getElementById(id)?.classList.add('active');
  }

  fecharModal(id) {
    document.getElementById(id)?.classList.remove('active');
  }

  async abrirSelecaoLivros() {
    if (this.processando) return;

    // Verifica se há chave de API configurada antes de prosseguir
    try {
      const status = await LibraryAPI.getApiKeyStatus();
      if (!status.configured) {
        this.abrirModal('api-key-required-modal');
        return;
      }
    } catch (_) {
      // Se a requisição falhar (backend offline), exibe o diálogo também
      this.abrirModal('api-key-required-modal');
      return;
    }

    try {
      // Busca todos os itens raiz (sem parent_id)
      const currentLang = I18N.getLang();
      const allItems = await LibraryAPI.getItems({ limit: 500, exclude_language: currentLang });

      this.livros = allItems;
      this.selecionados = [];

      const titleEl = document.getElementById('metadata-select-title');
      if (titleEl) {
        titleEl.textContent = I18N.t('metadata.select_title');
      }

      this.renderGradeSelecao();
      this.atualizarContadorSelecao();
      this.abrirModal('metadata-select-modal');
    } catch (err) {
      this.app.showToast(I18N.t('toast.metadata_load_error', err.message));
    }
  }

  renderGradeSelecao() {
    const grid = document.getElementById('metadata-select-grid');
    if (!grid) return;

    if (this.livros.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-title">${I18N.t('metadata.empty_title')}</div>
        <div class="empty-desc">${I18N.t('metadata.empty_desc')}</div>
      </div>`;
      return;
    }

    grid.innerHTML = this.livros.map(livro => {
      const ativo = this.selecionados.some(l => l.id === livro.id);
      const desabilitado = !ativo && this.selecionados.length >= this.limite;
      const coverUrl = livro.cover_path ? LibraryAPI.getCoverUrl(livro.id) : '';
      const isSeries = livro.type === 'series';
      const badgeText = isSeries
        ? `${I18N.t('series.vol', livro.children_count || 0)}`
        : '';

      return `
        <div class="book-card metadata-select-card ${ativo ? 'selecionado' : ''} ${desabilitado ? 'desabilitado' : ''}"
             data-id="${livro.id}">
          <div class="book-cover-wrap">
            ${coverUrl ? `
              <img class="book-cover" src="${coverUrl}" alt="${escapeHtml(livro.title)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            ` : ''}
            <div class="cover-fallback" style="${coverUrl ? 'display:none;' : 'display:flex;'}">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
              </svg>
              <span class="cover-fallback-title">${escapeHtml(livro.title)}</span>
            </div>
            ${isSeries ? `
              <div class="series-badge">
                <div class="series-dot"></div>
                <div class="series-dot"></div>
                <div class="series-dot"></div>
                ${badgeText}
              </div>
            ` : ''}
            <span class="marca-selecao">✓</span>
          </div>
          <div class="book-title" title="${escapeHtml(livro.title)}">${escapeHtml(livro.title)}</div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.metadata-select-card').forEach(card => {
      card.addEventListener('click', () => {
        if (card.classList.contains('desabilitado')) return;
        const id = parseInt(card.dataset.id, 10);
        const livro = this.livros.find(l => l.id === id);
        if (livro) this.alternarSelecao(livro);
      });
    });
  }

  alternarSelecao(livro) {
    const idx = this.selecionados.findIndex(l => l.id === livro.id);
    if (idx >= 0) {
      this.selecionados.splice(idx, 1);
    } else if (this.selecionados.length < this.limite) {
      this.selecionados.push(livro);
    }
    this.atualizarSelecaoDOM();
    this.atualizarContadorSelecao();
  }

  atualizarSelecaoDOM() {
    const grid = document.getElementById('metadata-select-grid');
    if (!grid) return;

    grid.querySelectorAll('.metadata-select-card').forEach(card => {
      const id = parseInt(card.dataset.id, 10);
      const ativo = this.selecionados.some(l => l.id === id);
      const desabilitado = !ativo && this.selecionados.length >= this.limite;

      card.classList.toggle('selecionado', ativo);
      card.classList.toggle('desabilitado', desabilitado);
    });
  }

  atualizarContadorSelecao() {
    const counter = document.getElementById('metadata-select-counter');
    const fill = document.getElementById('selecao-progress-fill');
    const btn = document.getElementById('btn-metadata-fetch');
    const n = this.selecionados.length;
    const lim = this.limite;

    if (counter) {
      counter.textContent = I18N.t('modal.metadata.counter', n, lim);
    }
    if (fill) {
      fill.style.width = `${(n / lim) * 100}%`;
    }
    if (btn) btn.disabled = n === 0;
  }

  async iniciarBusca() {
    if (this.selecionados.length === 0) return;

    const itemIds = this.selecionados.map(l => l.id);
    this.fecharModal('metadata-select-modal');
    this.resultados = [];
    this.setProcessando(true);
    this.mostrarProgresso(0, itemIds.length);

    try {
      await LibraryAPI.fetchMetadataStream(itemIds, {
        onProgress: (atual, total) => this.mostrarProgresso(atual, total),
        onResult: (data) => this.resultados.push(data),
        onDone: () => {
          this.esconderProgresso();
          this.setProcessando(false);
          this.abrirResultados();
        },
        onError: (msg) => {
          this.esconderProgresso();
          this.setProcessando(false);
          this._mostrarRateLimit(msg);
        },
      });
    } catch (err) {
      this.esconderProgresso();
      this.setProcessando(false);
      this.app.showToast(err.message);
    }
  }

  mostrarProgresso(atual, total) {
    let toast = document.getElementById('metadata-progress-toast');
    if (!toast) {
      let container = document.querySelector('.toast-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      toast = document.createElement('div');
      toast.id = 'metadata-progress-toast';
      toast.className = 'metadata-progress-toast';
      container.appendChild(toast);
    }

    const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
    toast.innerHTML = `
      <span class="metadata-progress-title">${I18N.t('progress.fetching_metadata')}</span>
      <div class="metadata-progress-bar-wrap">
        <div class="metadata-progress-bar-fill" style="width: ${pct}%"></div>
      </div>
      <span class="metadata-progress-pct">${pct}%</span>
      <span class="metadata-progress-detail">${I18N.t('progress.items_processed', atual, total)}</span>
    `;
  }

  esconderProgresso() {
    document.getElementById('metadata-progress-toast')?.remove();
  }

  abrirResultados() {
    const primeiroEncontrado = this.resultados.find(r => r.metadados) || this.resultados[0] || null;
    this.resultadoSelecionado = primeiroEncontrado;
    this.renderListaResultados();
    this.renderPreviaResultado();
    this.abrirModal('metadata-results-modal');
  }

  renderListaResultados() {
    const lista = document.getElementById('metadata-results-list');
    const contadores = document.getElementById('metadata-results-counters');
    if (!lista) return;

    const encontrados = this.resultados.filter(r => r.metadados).length;
    const naoEncontrados = this.resultados.length - encontrados;

    lista.innerHTML = this.resultados.map(r => {
      const ativo = this.resultadoSelecionado === r;
      const ok = !!r.metadados;
      const label = r.titulo_limpo || r.arquivo_original;
      return `
        <li class="metadata-result-item ${ativo ? 'ativo' : ''}" data-arquivo="${escapeHtml(r.arquivo_original)}">
          <span class="${ok ? 'icone-ok' : 'icone-erro'}">${ok ? '✓' : '✗'}</span>
          ${escapeHtml(label)}
        </li>
      `;
    }).join('');

    if (contadores) {
      contadores.innerHTML = `
        <span class="contador-ok">${I18N.t('metadata.found_label')} ${encontrados}</span>
        <span class="contador-erro">${I18N.t('metadata.not_found_label')} ${naoEncontrados}</span>
      `;
    }

    lista.querySelectorAll('.metadata-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const arquivo = item.dataset.arquivo;
        this.resultadoSelecionado = this.resultados.find(r => r.arquivo_original === arquivo) || null;
        this.renderListaResultados();
        this.renderPreviaResultado();
      });
    });
  }

  renderPreviaResultado() {
    const previa = document.getElementById('metadata-results-preview');
    if (!previa) return;

    const item = this.resultadoSelecionado;
    if (!item || !item.metadados) {
      previa.innerHTML = `<div class="coluna-previa vazio">${I18N.t('metadata.preview_empty')}</div>`;
      return;
    }

    const { nome_da_obra, autor, data_de_lancamento, sinopse } = item.metadados;
    const livroOriginal = this.selecionados.find(l => l.id === item.item_id)
      || this.livros.find(l => l.id === item.item_id);
    const coverUrl = livroOriginal?.cover_path ? LibraryAPI.getCoverUrl(livroOriginal.id) : '';

    previa.innerHTML = `
      <div class="coluna-previa">
        ${coverUrl ? `
          <div class="metadata-preview-cover-wrap">
            <img class="metadata-preview-cover" src="${coverUrl}" alt="${escapeHtml(nome_da_obra || '')}">
          </div>
        ` : ''}
        <h2>${escapeHtml(paraTitleCase(nome_da_obra))}</h2>
        <p><strong>${I18N.t('metadata.preview_author')}</strong> ${escapeHtml(autor || I18N.t('metadata.preview_not_identified'))}</p>
        <p><strong>${I18N.t('metadata.preview_launch')}</strong> ${escapeHtml(data_de_lancamento || I18N.t('metadata.preview_not_identified'))}</p>
        <div class="sinopse">
          <strong>${I18N.t('metadata.preview_synopsis')}</strong>
          <p>${escapeHtml(sinopse || I18N.t('metadata.preview_synopsis_unavailable'))}</p>
        </div>
      </div>
    `;
  }

  fecharResultados() {
    this.fecharModal('metadata-results-modal');
    this.resultados = [];
    this.resultadoSelecionado = null;
  }

  async aplicarMetadados() {
    const comMetadados = this.resultados.filter(r => r.metadados);
    if (comMetadados.length === 0) {
      this.app.showToast(I18N.t('toast.metadata_no_results'));
      return;
    }

    const btn = document.getElementById('btn-metadata-apply');
    if (btn) {
      btn.disabled = true;
      btn.textContent = I18N.t('metadata.applying');
    }

    try {
      await LibraryAPI.applyMetadata(this.resultados);
      this.fecharResultados();
      await this.app.libraryManager.loadItems();
      this.app.showToast(I18N.t('toast.saved', comMetadados.length));
    } catch (err) {
      this.app.showToast(I18N.t('toast.metadata_apply_error', err.message));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = I18N.t('modal.metadata.apply');
      }
    }
  }
}

window.MetadataManager = MetadataManager;
