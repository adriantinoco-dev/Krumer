import * as FileSystem from 'expo-file-system/legacy';

/**
 * D1 — Abertura de documento (equivalente a LibraryAPI.getFileUrl + cMap em openPdf:56).
 * No mobile o arquivo já é local; precisa normalizar para file:// e
 * copiar content:// (SAF Android 13+) para cache, pois react-native-pdf
 * só lê file://.
 *
 * Extraído de PdfReader para que aquecimento, sessão e prévias compartilhem
 * a mesma URI normalizada e a cópia validada pelo tamanho do arquivo.
 */

export function withFileScheme(path: string): string {
  return path.startsWith('/') ? `file://${path}` : path;
}

type CachedPdfResolution = {
  key: string;
  promise: Promise<string>;
  resolvedUri: string | null;
};

let cachedPdfResolution: CachedPdfResolution | null = null;

function stablePathHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function pdfResolutionKey(filePath: string, knownByteLength?: number) {
  return `${filePath}\u0000${knownByteLength ?? 0}`;
}

function prunePdfCache(cacheDir: string, activeUri: string) {
  void FileSystem.readDirectoryAsync(cacheDir)
    .then((names) => Promise.all(names.map((name) => `${cacheDir}${name}`)
      .filter((uri) => uri !== activeUri)
      .map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined))))
    .catch(() => undefined);
}

export function getCachedPdfUri(filePath: string, knownByteLength?: number): string | null {
  if (filePath.startsWith('file://') || filePath.startsWith('/')) return withFileScheme(filePath);
  const key = pdfResolutionKey(filePath, knownByteLength);
  return cachedPdfResolution?.key === key ? cachedPdfResolution.resolvedUri : null;
}

export function resolvePdfUri(filePath: string, knownByteLength?: number): Promise<string> {
  const key = pdfResolutionKey(filePath, knownByteLength);
  if (cachedPdfResolution?.key === key) return cachedPdfResolution.promise;

  const promise = resolvePdfUriUncached(filePath, knownByteLength);
  cachedPdfResolution = { key, promise, resolvedUri: null };
  void promise.then((resolvedUri) => {
    if (cachedPdfResolution?.promise === promise) cachedPdfResolution.resolvedUri = resolvedUri;
  }, () => undefined);
  void promise.catch(() => {
    if (cachedPdfResolution?.promise === promise) cachedPdfResolution = null;
  });
  return promise;
}

async function resolvePdfUriUncached(filePath: string, knownByteLength?: number): Promise<string> {
  if (filePath.startsWith('file://') || filePath.startsWith('/')) {
    return withFileScheme(filePath);
  }
  if (filePath.startsWith('content://')) {
    const cacheDir = `${FileSystem.cacheDirectory}pdf-reader/`;
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true }).catch(() => undefined);
    const safeName =
      filePath.split('/').pop()?.split('?')[0]?.replace(/[^a-zA-Z0-9._-]/g, '_') ?? 'book.pdf';
    const dest = `${cacheDir}${stablePathHash(filePath)}-${safeName}`;
    const existing = await FileSystem.getInfoAsync(dest);
    const expectedSize = Math.max(0, Math.trunc(knownByteLength ?? 0));
    if (existing.exists && (expectedSize === 0 || existing.size === expectedSize)) {
      prunePdfCache(cacheDir, dest);
      return dest;
    }
    if (existing.exists) {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    }
    await FileSystem.copyAsync({ from: filePath, to: dest });
    prunePdfCache(cacheDir, dest);
    return dest;
  }
  return filePath;
}
