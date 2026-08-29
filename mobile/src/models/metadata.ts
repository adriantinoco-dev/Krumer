import type { Book } from './item';

export type MetadataCandidate = {
  nome_da_obra: string | null;
  autor: string | null;
  data_de_lancamento: string | null;
  sinopse: string | null;
};

export type MetadataErrorCode =
  | 'missing_key'
  | 'invalid_key'
  | 'offline'
  | 'timeout'
  | 'invalid_json'
  | 'safety_block'
  | 'rate_limit'
  | 'model_unavailable'
  | 'not_found'
  | 'network'
  | 'unknown';

export type MetadataError = {
  code: MetadataErrorCode;
  message: string;
  retryable: boolean;
};

export type MetadataSearchResult = {
  bookId: string;
  fingerprint: string;
  query: string;
  candidate: MetadataCandidate | null;
  status: 'found' | 'not_found' | 'error';
  fromCache: boolean;
  errorCode?: MetadataErrorCode;
  errorMessage?: string;
};

export type MetadataBatchProgress = {
  current: number;
  total: number;
  bookId: string;
};

export type MetadataFlowState = 'intro' | 'selection' | 'loading' | 'results' | 'preview' | 'error' | 'closed';

export type MetadataSearchOptions = {
  apiKey?: string | null;
  language?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  useCache?: boolean;
};

export type MetadataBookInput = Pick<Book, 'id' | 'title' | 'filePath' | 'fingerprint' | 'children'>;

export type MetadataCacheEntry = {
  candidate: MetadataCandidate;
  savedAt: string;
};
