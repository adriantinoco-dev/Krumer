/**
 * Limite comum dos recursos de leitura mantidos somente durante o processo do app.
 * O Map é reinicializado quando o processo é encerrado, portanto nada é salvo no
 * AsyncStorage nem carregado como cache de livros no próximo lançamento.
 */
export const READER_CACHE_LIMIT = 8;

export class ReaderLruCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly limit = READER_CACHE_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Reader cache limit must be a positive integer.');
    }
  }

  get(key: string): T | undefined {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key) as T;
    // Touch the entry so repeated opens keep it hot in the LRU.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      this.entries.delete(oldestKey);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  forEach(callback: (value: T) => void): void {
    this.entries.forEach(callback);
  }

  get size(): number {
    return this.entries.size;
  }
}
