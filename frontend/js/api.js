/* ==========================================================================
   Krumer Personal Library - API Client (FastAPI Integration)
   ========================================================================== */

// O Electron pode escolher uma porta livre quando 8765 já está ocupada.
// Em execução fora do Electron, mantém o endpoint local padrão para desenvolvimento.
const API_BASE_URL = window.electronAPI?.backendBaseUrl || 'http://127.0.0.1:8765';

class LibraryAPI {
  /**
   * Fetches books and series items from backend with optional filters and sorting
   */
  static async getItems(params = {}) {
    const query = new URLSearchParams();
    if (params.parent_id !== undefined && params.parent_id !== null) query.append('parent_id', params.parent_id);
    if (params.type) query.append('type', params.type);
    if (params.search) query.append('search', params.search);
    if (params.tag) query.append('tag', params.tag);
    if (params.sort_by) query.append('sort_by', params.sort_by);
    if (params.order) query.append('order', params.order);
    if (params.exclude_language) query.append('exclude_language', params.exclude_language);

    const res = await fetch(`${API_BASE_URL}/items?${query.toString()}`);
    if (!res.ok) throw new Error(I18N.t('api.error_fetch_items', res.statusText));
    return await res.json();
  }

/**
   * Fetches single item details by ID
   */
  static async getItem(id) {
    const res = await fetch(`${API_BASE_URL}/items/${id}`);
    if (!res.ok) throw new Error(I18N.t('api.error_item_not_found', res.statusText));
    return await res.json();
  }

  /**
   * Fetches items in progress for the "Continuar Lendo" section.
   * Includes both root books and chapter children currently being read.
   */
  static async getContinueReadingItems() {
    const res = await fetch(`${API_BASE_URL}/items/continue-reading`);
    if (!res.ok) throw new Error(I18N.t('api.error_fetch_items', res.statusText));
    return await res.json();
  }

  /**
   * Updates metadata, rating (0=clear, 1-5) or tags for an item
   */
  static async updateItem(id, data) {
    const res = await fetch(`${API_BASE_URL}/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(I18N.t('api.error_update_item', res.statusText));
    return await res.json();
  }

  /**
   * Fetches reading progress records for a book or series
   */
  static async getProgress(id) {
    const res = await fetch(`${API_BASE_URL}/items/${id}/progress`);
    if (!res.ok) throw new Error(I18N.t('api.error_get_progress', res.statusText));
    return await res.json();
  }

  /**
   * Saves reading progress for a file
   */
  static async saveProgress(id, progressData) {
    const res = await fetch(`${API_BASE_URL}/items/${id}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progressData)
    });
    if (!res.ok) throw new Error(I18N.t('api.error_save_progress', res.statusText));
    return await res.json();
  }

  /**
   * Triggers folder scanner on backend
   */
  static async scanFolder(path) {
    const res = await fetch(`${API_BASE_URL}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_scan_failed'));
    return data;
  }

  /**
   * Escaneia uma pasta com progresso via SSE.
   * Callbacks: onProgress(current, total, message), onDone(message), onError(message)
   */
  static async scanFolderWithProgress(path, { onProgress, onDone, onError }) {
    const res = await fetch(`${API_BASE_URL}/scan/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || I18N.t('api.error_scan_status', res.statusText));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'progress' && onProgress) {
            onProgress(event.current, event.total, event.message);
          } else if (event.type === 'done' && onDone) {
            onDone(event.message);
          } else if (event.type === 'error' && onError) {
            onError(event.message);
          }
        } catch (parseErr) {
          console.warn('Evento SSE inválido:', line, parseErr);
        }
      }
    }
  }

  /**
   * Fetches all registered tags
   */
  static async getTags() {
    const res = await fetch(`${API_BASE_URL}/tags`);
    if (!res.ok) return [];
    return await res.json();
  }

  /**
   * Triggers rescan of the last saved folder without opening dialogs
   */
  static async rescanFolder() {
    const res = await fetch(`${API_BASE_URL}/rescan`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_rescan_failed'));
    return data;
  }

  /**
   * Remove um item da biblioteca sem apagar o arquivo do disco
   */
  static async deleteItem(id) {
    const res = await fetch(`${API_BASE_URL}/items/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_remove_item'));
    return data;
  }

  /**
   * Abre a janela nativa do Windows/OS via backend para seleção do diretório com caminho absoluto completo
   */
  static async browseFolder() {
    if (window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
      return await window.electronAPI.selectFolder();
    }
    const res = await fetch(`${API_BASE_URL}/browse-folder`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_browse_folder'));
    return data;
  }

  /**
   * Uploads a custom cover image file for an item
   */
  static async uploadCover(id, file) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/items/${id}/cover`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || I18N.t('api.error_upload_cover'));
    }
    return await res.json();
  }

  /**
   * Gets a cover URL with a per-session cache version. This prevents a cached
   * image from being reused when an item starts pointing at another cover.
   * Pass `bust=true` to force a fresh download after an individual edit.
   */
  static coverCacheVersion = Date.now();

  static refreshCoverCache() {
    this.coverCacheVersion = Date.now();
  }

  static getCoverUrl(id, bust = false) {
    const base = `${API_BASE_URL}/items/${id}/cover`;
    const cacheVersion = bust ? Date.now() : this.coverCacheVersion;
    return `${base}?t=${cacheVersion}`;
  }

  /**
   * Restores the original embedded cover for an item
   */
  static async restoreOriginalCover(id) {
    const res = await fetch(`${API_BASE_URL}/items/${id}/restore-cover`, {
      method: 'POST',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || I18N.t('toast.cover_restore_error', res.statusText));
    }
    return await res.json();
  }

  /**
   * Runs an incremental scan against the configured library folder
   */
  static async scanIncremental() {
    const res = await fetch(`${API_BASE_URL}/scan/incremental`, {
      method: 'POST',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Incremental scan failed');
    }
    return await res.json();
  }

  /**
   * Gets absolute file stream URL for EPUB/PDF
   */
  static getFileUrl(filePath) {
    return `${API_BASE_URL}/files?path=${encodeURIComponent(filePath)}`;
  }


  /**
   * Busca metadados via Gemini com streaming de progresso (SSE).
   */
  static async fetchMetadataStream(itemIds, { onProgress, onResult, onDone, onError }) {
    const res = await fetch(`${API_BASE_URL}/metadata/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: itemIds }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || I18N.t('api.error_fetch_metadata', res.statusText));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'progress' && onProgress) {
            onProgress(event.atual, event.total);
          } else if (event.type === 'result' && onResult) {
            onResult(event.data);
          } else if (event.type === 'done' && onDone) {
            onDone();
          } else if (event.type === 'error' && onError) {
            onError(event.message);
          }
        } catch (parseErr) {
          console.warn('Evento SSE inválido:', line, parseErr);
        }
      }
    }
  }

  /**
   * Aplica metadados encontrados ao banco interno do app.
   */
  static async applyMetadata(results) {
    const payload = {
      results: results
        .filter(r => r.metadados)
        .map(r => ({ item_id: r.item_id, metadados: r.metadados })),
    };

    const res = await fetch(`${API_BASE_URL}/metadata/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || I18N.t('api.error_apply_metadata'));
    }
    return await res.json();
  }

  /**
   * Verifica se a chave do Gemini está configurada no backend (sem expor o valor).
   */
  static async getApiKeyStatus() {
    const res = await fetch(`${API_BASE_URL}/settings/api-key`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_check_api_key'));
    return data;
  }

  /**
   * Salva e valida a chave do Gemini no backend (arquivo .env).
   */
  static async updateApiKey(apiKey) {
    const res = await fetch(`${API_BASE_URL}/settings/api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_save_api_key'));
    return data;
  }

  /**
   * Retorna o status de onboarding (primeiro uso, contagem de itens, etc.).
   */
  static async getOnboardingStatus() {
    const res = await fetch(`${API_BASE_URL}/onboarding/status`);
    return await res.json();
  }

  /**
   * Retorna a lista de chaves de cache (nomes de arquivo / títulos de série)
   * que já possuem metadados buscados com sucesso.
   */
  static async getCachedKeys() {
    const res = await fetch(`${API_BASE_URL}/metadata/cached-keys`);
    const data = await res.json();
    return data.keys || [];
  }

  /**
   * Atualiza o status de leitura manual de um item (lido/não lido)
   */
  static async updateItemReadStatus(id, isRead) {
    const res = await fetch(`${API_BASE_URL}/items/${id}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: isRead })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_read_status'));
    return data;
  }

  /**
   * Obtém as configurações globais do backend
   */
  static async getSettings() {
    const res = await fetch(`${API_BASE_URL}/settings`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_get_settings'));
    return data;
  }

  /**
   * Atualiza as configurações globais do backend
   */
  static async updateSettings(settings) {
    const res = await fetch(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_update_settings'));
    return data;
  }

  /**
   * Solicita a retradução de todas as descrições da biblioteca
   */
  static async retranslateDescriptions() {
    const res = await fetch(`${API_BASE_URL}/items/retranslate-descriptions`, {
      method: 'POST'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || I18N.t('api.error_retranslate'));
    return data;
  }

  // ─── Custom Lists ──────────────────────────────────────────────────────────

  static async getLists() {
    const res = await fetch(`${API_BASE_URL}/lists`);
    if (!res.ok) throw new Error('Failed to fetch lists');
    return await res.json();
  }

  static async createList(name) {
    const res = await fetch(`${API_BASE_URL}/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Failed to create list');
    return data;
  }

  static async updateList(id, data) {
    const res = await fetch(`${API_BASE_URL}/lists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const resp = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(resp.detail || 'Failed to update list');
    return resp;
  }

  static async deleteList(id) {
    const res = await fetch(`${API_BASE_URL}/lists/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete list');
    return await res.json();
  }

  static async getListItems(listId) {
    const res = await fetch(`${API_BASE_URL}/lists/${listId}/items`);
    if (!res.ok) throw new Error('Failed to fetch list items');
    return await res.json();
  }

  static async addItemsToList(listId, itemIds) {
    const res = await fetch(`${API_BASE_URL}/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: itemIds })
    });
    if (!res.ok) throw new Error('Failed to add items to list');
    return await res.json();
  }

  static async removeItemFromList(listId, itemId) {
    const res = await fetch(`${API_BASE_URL}/lists/${listId}/items/${itemId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to remove item from list');
    return await res.json();
  }

  static async getItemLists(itemId) {
    const res = await fetch(`${API_BASE_URL}/items/${itemId}/lists`);
    if (!res.ok) throw new Error('Failed to fetch item lists');
    return await res.json();
  }

  // ─── Highlights (marcações EPUB) ──────────────────────────────────────

  static async getHighlights(itemId) {
    const res = await fetch(`${API_BASE_URL}/items/${itemId}/highlights`);
    if (!res.ok) throw new Error(I18N.t('api.error_get_highlights', res.statusText));
    return await res.json();
  }

  static async createHighlight(itemId, data) {
    const res = await fetch(`${API_BASE_URL}/items/${itemId}/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || I18N.t('api.error_create_highlight', res.statusText));
    return body;
  }

  static async updateHighlight(itemId, highlightId, data) {
    const res = await fetch(`${API_BASE_URL}/items/${itemId}/highlights/${highlightId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || I18N.t('api.error_update_highlight', res.statusText));
    return body;
  }

  static async deleteHighlight(itemId, highlightId) {
    const res = await fetch(`${API_BASE_URL}/items/${itemId}/highlights/${highlightId}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || I18N.t('api.error_delete_highlight', res.statusText));
    return body;
  }

  static async deleteHighlightByCfi(itemId, cfiRange) {
    const res = await fetch(`${API_BASE_URL}/items/${itemId}/highlights?cfi_range=${encodeURIComponent(cfiRange)}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || I18N.t('api.error_delete_highlight', res.statusText));
    return body;
  }

  static async exportJson() {
    const res = await fetch(`${API_BASE_URL}/export/json`);
    if (!res.ok) throw new Error('Export failed');
    return await res.json();
  }

  static async exportCsvBlob() {
    const res = await fetch(`${API_BASE_URL}/export/csv`);
    if (!res.ok) throw new Error('Export failed');
    return await res.blob();
  }

  static async importJson(payload) {
    const res = await fetch(`${API_BASE_URL}/import/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || 'Import failed');
    return body;
  }

  static async importCsvFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE_URL}/import/csv`, { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || 'Import failed');
    return body;
  }

  static async getSyncMetrics() {
    // Via bridge: precisa passar pelo Electron main se disponível, senão tenta direto (dev)
    if (window.electronAPI?.syncGetMetrics) {
      return await window.electronAPI.syncGetMetrics();
    }
    const res = await fetch(`${API_BASE_URL}/sync/metrics`);
    if (!res.ok) throw new Error('Metrics failed');
    return await res.json();
  }
}

window.LibraryAPI = LibraryAPI;
