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
  static async scanFolder(path, useFilenameAsTitle = false) {
    const res = await fetch(`${API_BASE_URL}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, use_filename_as_title: useFilenameAsTitle })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Falha ao escanear diretório');
    return data;
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
   * Gets absolute cover image URL
   */
  static getCoverUrl(id) {
    return `${API_BASE_URL}/items/${id}/cover`;
  }
}

window.LibraryAPI = LibraryAPI;
