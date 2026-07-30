/* ==========================================================================
   Krumer Personal Library - API Client (FastAPI Integration)
   ========================================================================== */

const API_BASE_URL = 'http://localhost:8765';

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

    const res = await fetch(`${API_BASE_URL}/items?${query.toString()}`);
    if (!res.ok) throw new Error(`Falha ao buscar itens da biblioteca: ${res.statusText}`);
    return await res.json();
  }

  /**
   * Retrieves single item details by ID
   */
  static async getItem(id) {
    const res = await fetch(`${API_BASE_URL}/items/${id}`);
    if (!res.ok) throw new Error(`Item não encontrado: ${res.statusText}`);
    return await res.json();
  }

  /**
   * Updates metadata, rating (1-5) or tags for an item
   */
  static async updateItem(id, data) {
    const res = await fetch(`${API_BASE_URL}/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Erro ao atualizar item: ${res.statusText}`);
    return await res.json();
  }

  /**
   * Fetches reading progress records for a book or series
   */
  static async getProgress(id) {
    const res = await fetch(`${API_BASE_URL}/items/${id}/progress`);
    if (!res.ok) throw new Error(`Erro ao obter progresso: ${res.statusText}`);
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
    if (!res.ok) throw new Error(`Erro ao salvar progresso: ${res.statusText}`);
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
    if (!res.ok) throw new Error(data.detail || 'Falha ao escanear diretório');
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
      throw new Error(errData.detail || `Falha ao escanear: ${res.statusText}`);
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
    if (!res.ok) throw new Error(data.detail || 'Falha ao reescanear diretório');
    return data;
  }

  /**
   * Remove um item da biblioteca sem apagar o arquivo do disco
   */
  static async deleteItem(id) {
    const res = await fetch(`${API_BASE_URL}/items/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erro ao remover item');
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
    if (!res.ok) throw new Error(data.detail || 'Erro ao abrir janela de arquivos');
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
      throw new Error(errData.detail || 'Erro ao fazer upload da capa');
    }
    return await res.json();
  }

  /**
   * Gets absolute cover image URL
   */
  static getCoverUrl(id) {
    return `${API_BASE_URL}/items/${id}/cover?t=${Date.now()}`;
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
      throw new Error(errData.detail || `Falha ao buscar metadados: ${res.statusText}`);
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
      throw new Error(errData.detail || 'Erro ao aplicar metadados');
    }
    return await res.json();
  }

  /**
   * Verifica se a chave do Gemini está configurada no backend (sem expor o valor).
   */
  static async getApiKeyStatus() {
    const res = await fetch(`${API_BASE_URL}/settings/api-key`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Erro ao verificar chave da API');
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
    if (!res.ok) throw new Error(data.detail || 'Erro ao salvar chave da API');
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
}

window.LibraryAPI = LibraryAPI;
