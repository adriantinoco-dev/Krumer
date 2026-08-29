import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Book } from '../models/item';
import type {
  MetadataBatchProgress,
  MetadataBookInput,
  MetadataCacheEntry,
  MetadataCandidate,
  MetadataErrorCode,
  MetadataSearchOptions,
  MetadataSearchResult,
} from '../models/metadata';
import { getGeminiApiKey } from '../storage/secureCredentials';

export const MAX_METADATA_BATCH = 10;
export const METADATA_RATE_LIMIT_DELAY_MS = 2500;
export const METADATA_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

const CACHE_KEY = 'krumer.metadata.cache.v1';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const SYSTEM_INSTRUCTION = 'Você é um assistente especializado em metadados de livros e graphic novels. Suas respostas devem conter apenas a estrutura JSON solicitada.';
const SYNOPSIS_LANGUAGES: Record<string, string> = {
  'pt-br': 'português do Brasil',
  en: 'English',
  es: 'español',
  fr: 'français',
  de: 'Deutsch',
  it: 'italiano',
  ja: 'japonês',
  zh: 'chinês simplificado',
  ko: 'coreano',
  ru: 'russo',
};
const TOKENS_TO_REMOVE = [
  'pt-br', 'ptbr', 'scan', 'hq', 'cbr', 'v1', 'v2', 'v3',
  'ed', 'edicao', 'ebook', 'digital', 'completo', 'revisado',
];
const TOKENS_TO_REMOVE_SET = new Set(TOKENS_TO_REMOVE);

export class MetadataServiceError extends Error {
  readonly code: MetadataErrorCode;
  readonly retryable: boolean;

  constructor(code: MetadataErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'MetadataServiceError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function normalizeFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.(epub|pdf)$/i, '');
  const normalized = withoutExtension.toLowerCase().replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.split(' ').filter((token) => !TOKENS_TO_REMOVE_SET.has(token)).join(' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractYear(value: string | number | null | undefined): number | null {
  if (!value) return null;
  // Include historical publication years (for example, Dante's Inferno,
  // commonly dated to 1320), not only modern 19xx/20xx releases.
  const match = String(value).match(/\b(1\d{3}|20\d{2})\b/);
  return match ? Number(match[0]) : null;
}

export function isMetadataComplete(book: Pick<Book, 'author' | 'year' | 'description'>): boolean {
  // Persisted libraries can contain values written by older versions (for
  // example, a year serialized as a string). Normalize at the boundary so a
  // book does not reappear in the batch just because its representation
  // differs from the current TypeScript type.
  const author = typeof book.author === 'string' ? book.author.trim() : '';
  const description = typeof book.description === 'string' ? book.description.trim() : '';
  const rawYear: unknown = book.year;
  const year = typeof rawYear === 'string' || typeof rawYear === 'number' ? extractYear(rawYear) : null;
  return Boolean(author) && year !== null && Boolean(description);
}

export function isCandidateComplete(candidate: MetadataCandidate | null): boolean {
  return Boolean(candidate && candidate.nome_da_obra?.trim() && candidate.autor?.trim() && extractYear(candidate.data_de_lancamento) && candidate.sinopse?.trim());
}

export function getMetadataQuery(book: MetadataBookInput): string {
  if (book.children && book.children.length > 0) return book.title.trim();
  const decoded = safeDecode(book.filePath);
  const basename = decoded.split(/[\\/]/).pop() || book.title;
  return normalizeFilename(basename);
}

export function toBookMetadata(
  candidate: MetadataCandidate,
  options: { preserveTitle?: boolean } = {},
): Partial<Pick<Book, 'title' | 'author' | 'year' | 'description'>> {
  const update: Partial<Pick<Book, 'title' | 'author' | 'year' | 'description'>> = {};
  const title = candidate.nome_da_obra?.trim();
  const author = candidate.autor?.trim();
  const year = extractYear(candidate.data_de_lancamento);
  const description = candidate.sinopse?.trim();

  if (title && !options.preserveTitle) update.title = title;
  if (author) update.author = author;
  if (year !== null) update.year = year;
  if (description) update.description = description;
  return update;
}

export function buildMetadataPrompt(query: string, language = 'en'): string {
  const languageName = SYNOPSIS_LANGUAGES[language] || 'English';
  return `Com base no título "${query}", busque e retorne as seguintes informações em JSON:\n\n{\n  "nome_da_obra": "",\n  "autor": "",\n  "data_de_lancamento": "",\n  "sinopse": ""\n}\n\nRegras:\n- Retorne apenas o JSON, sem texto adicional de introdução ou formatação externa.\n- Se houver mais de um autor, liste ambos no campo "autor".\n- Se não encontrar algum campo, deixe como null.\n- A sinopse deve ser completa, em ${languageName}.`;
}

export async function searchMetadataForBook(
  book: MetadataBookInput,
  options: MetadataSearchOptions = {},
): Promise<MetadataSearchResult> {
  const language = options.language || 'en';
  const query = getMetadataQuery(book);
  const cacheKey = `${book.fingerprint}|${language}`;
  const useCache = options.useCache !== false;

  if (useCache) {
    const cached = await readCacheEntry(cacheKey);
    if (cached && isCandidateComplete(cached.candidate)) {
      return {
        bookId: book.id,
        fingerprint: book.fingerprint,
        query,
        candidate: cached.candidate,
        status: 'found',
        fromCache: true,
      };
    }
  }

  const apiKey = (options.apiKey === undefined ? await getGeminiApiKey() : options.apiKey)?.trim();
  if (!apiKey) {
    throw new MetadataServiceError('missing_key', 'Configure uma chave da API Gemini antes de buscar metadados.', false);
  }

  const candidate = await requestGemini(query, apiKey, language, options);
  if (!candidate) {
    return {
      bookId: book.id,
      fingerprint: book.fingerprint,
      query,
      candidate: null,
      status: 'not_found',
      fromCache: false,
    };
  }

  if (useCache && isCandidateComplete(candidate)) {
    await writeCacheEntry(cacheKey, { candidate, savedAt: new Date().toISOString() });
  }

  return {
    bookId: book.id,
    fingerprint: book.fingerprint,
    query,
    candidate,
    status: 'found',
    fromCache: false,
  };
}

export async function runMetadataBatch(
  books: MetadataBookInput[],
  options: MetadataSearchOptions & {
    onProgress?: (progress: MetadataBatchProgress) => void;
    onResult?: (result: MetadataSearchResult) => void;
    delayMs?: number;
  } = {},
): Promise<MetadataSearchResult[]> {
  if (books.length === 0) return [];
  if (books.length > MAX_METADATA_BATCH) {
    throw new MetadataServiceError('unknown', `Selecione no máximo ${MAX_METADATA_BATCH} obras por lote.`, false);
  }

  const results: MetadataSearchResult[] = [];
  for (let index = 0; index < books.length; index += 1) {
    const book = books[index];
    options.onProgress?.({ current: index + 1, total: books.length, bookId: book.id });
    let result: MetadataSearchResult;
    try {
      result = await searchMetadataForBook(book, options);
    } catch (error) {
      const serviceError = asMetadataError(error);
      result = {
        bookId: book.id,
        fingerprint: book.fingerprint,
        query: getMetadataQuery(book),
        candidate: null,
        status: 'error',
        fromCache: false,
        errorCode: serviceError.code,
        errorMessage: serviceError.message,
      };
    }
    results.push(result);
    options.onResult?.(result);

    if (index < books.length - 1) {
      await wait(options.delayMs ?? METADATA_RATE_LIMIT_DELAY_MS);
    }
  }
  return results;
}

async function requestGemini(
  query: string,
  apiKey: string,
  language: string,
  options: MetadataSearchOptions,
): Promise<MetadataCandidate | null> {
  const fetchImpl = options.fetchImpl || fetch;
  let lastModelError: MetadataServiceError | null = null;

  for (const model of METADATA_MODELS) {
    try {
      const response = await fetchWithTimeout(
        `${GEMINI_ENDPOINT}/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: [{ role: 'user', parts: [{ text: buildMetadataPrompt(query, language) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  nome_da_obra: { type: 'STRING', nullable: true },
                  autor: { type: 'STRING', nullable: true },
                  data_de_lancamento: { type: 'STRING', nullable: true },
                  sinopse: { type: 'STRING', nullable: true },
                },
                required: ['nome_da_obra', 'autor', 'data_de_lancamento', 'sinopse'],
              },
            },
          }),
        },
        fetchImpl,
        options.timeoutMs ?? 45000,
      );

      let payload: GeminiResponse | null;
      try {
        payload = await response.json() as GeminiResponse;
      } catch {
        if (response.ok) {
          throw new MetadataServiceError('invalid_json', 'A resposta da API Gemini não veio em JSON válido.', true);
        }
        payload = null;
      }
      if (!response.ok) throw classifyHttpError(response.status, payload);
      const finishReason = payload?.candidates?.[0]?.finishReason;
      if (payload?.promptFeedback?.blockReason || finishReason === 'SAFETY' || finishReason === 'BLOCKLIST' || finishReason === 'PROHIBITED_CONTENT') {
        throw new MetadataServiceError('safety_block', 'O Gemini bloqueou esta consulta por motivos de segurança.', false);
      }

      const text = payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
      if (!text) return null;
      return parseCandidate(text);
    } catch (error) {
      const serviceError = asMetadataError(error);
      if (serviceError.code === 'model_unavailable' || serviceError.code === 'rate_limit') {
        lastModelError = serviceError;
        continue;
      }
      throw serviceError;
    }
  }

  if (lastModelError) throw lastModelError;
  return null;
}

function parseCandidate(rawText: string): MetadataCandidate | null {
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new MetadataServiceError('invalid_json', 'A resposta do Gemini não veio em um JSON válido.', true);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new MetadataServiceError('invalid_json', 'A resposta do Gemini não contém metadados válidos.', true);
  }

  const value = parsed as Record<string, unknown>;
  const candidate: MetadataCandidate = {
    nome_da_obra: asOptionalString(value.nome_da_obra),
    autor: asOptionalString(value.autor),
    data_de_lancamento: asOptionalString(value.data_de_lancamento, true),
    sinopse: asOptionalString(value.sinopse),
  };
  return candidate.nome_da_obra ? candidate : null;
}

function classifyHttpError(status: number, payload: GeminiResponse | null): MetadataServiceError {
  const message = payload?.error?.message || `A API Gemini respondeu HTTP ${status}.`;
  const lower = message.toLowerCase();
  if (status === 401 || status === 403) return new MetadataServiceError('invalid_key', 'A chave Gemini é inválida ou não tem permissão.', false);
  if (status === 400 && /(api\s*key|chave|credential|permission|unauthori)/i.test(lower)) {
    return new MetadataServiceError('invalid_key', 'A chave Gemini é inválida ou não tem permissão.', false);
  }
  if (status === 404) return new MetadataServiceError('model_unavailable', 'O modelo Gemini não está disponível.', true);
  if (status === 429) return new MetadataServiceError('rate_limit', 'O limite de requisições do Gemini foi atingido. Aguarde e tente novamente.', true);
  if (lower.includes('safety') || lower.includes('blocked')) return new MetadataServiceError('safety_block', 'O Gemini bloqueou esta consulta por motivos de segurança.', false);
  if (status >= 500) return new MetadataServiceError('network', 'O serviço Gemini está temporariamente indisponível.', true);
  return new MetadataServiceError('unknown', message, false);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    return await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new MetadataServiceError('timeout', 'A consulta ao Gemini demorou demais.', true);
    }
    throw new MetadataServiceError('offline', 'Não foi possível conectar à API Gemini. Verifique sua conexão.', true);
  } finally {
    clearTimeout(timeout);
  }
}

async function readCacheEntry(key: string): Promise<MetadataCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, MetadataCacheEntry>;
    const entry = cache[key];
    return entry?.candidate ? entry : null;
  } catch {
    return null;
  }
}

async function writeCacheEntry(key: string, entry: MetadataCacheEntry): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const cache = raw ? JSON.parse(raw) as Record<string, MetadataCacheEntry> : {};
    cache[key] = entry;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    // Cache failure must never prevent the user from applying a valid result.
    console.warn('[Krumer] Metadata cache write failed:', error);
  }
}

function asMetadataError(error: unknown): MetadataServiceError {
  if (error instanceof MetadataServiceError) return error;
  return new MetadataServiceError('unknown', error instanceof Error ? error.message : 'Erro ao buscar metadados.', false);
}

function asOptionalString(value: unknown, allowNumber = false): string | null {
  // Gemini occasionally returns a numeric release year despite the response
  // schema requesting a string. Coerce only primitive text/number values;
  // objects and arrays remain invalid instead of being stringified into
  // misleading metadata.
  if (typeof value !== 'string' && (!allowNumber || typeof value !== 'number')) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};
