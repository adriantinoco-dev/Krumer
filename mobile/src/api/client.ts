export const DEFAULT_API_BASE_URL = 'http://localhost:8765';

export type ApiClientOptions = {
  baseUrl?: string;
};

export class ApiClient {
  private baseUrl: string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_API_BASE_URL;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = data?.detail || response.statusText || 'Erro na API do Krumer';
      throw new Error(message);
    }

    return data as T;
  }
}

export const apiClient = new ApiClient();

