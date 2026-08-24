import * as FileSystem from 'expo-file-system/legacy';

/**
 * D1 — Abertura de documento (equivalente a LibraryAPI.getFileUrl + cMap em openPdf:56).
 * No mobile o arquivo já é local; precisa normalizar para file:// e
 * copiar content:// (SAF Android 13+) para cache, pois react-native-pdf
 * só lê file://.
 *
 * Extraído de mobile/src/readers/PdfReader.tsx:7 para uso compartilhado
 * entre PdfHorizontal e futuro PdfVertical.
 */

export function withFileScheme(path: string): string {
  return path.startsWith('/') ? `file://${path}` : path;
}

export async function resolvePdfUri(filePath: string): Promise<string> {
  if (filePath.startsWith('file://') || filePath.startsWith('/')) {
    return withFileScheme(filePath);
  }
  if (filePath.startsWith('content://')) {
    const cacheDir = `${FileSystem.cacheDirectory}pdf-reader/`;
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true }).catch(() => undefined);
    const safeName =
      filePath.split('/').pop()?.split('?')[0]?.replace(/[^a-zA-Z0-9._-]/g, '_') ?? `book-${Date.now()}.pdf`;
    const dest = `${cacheDir}${Date.now()}-${safeName}`;
    await FileSystem.copyAsync({ from: filePath, to: dest });
    return dest;
  }
  return filePath;
}

/**
 * Limpeza do cache copiado — chamar no unmount quando filePath era content://
 * para evitar vazamento (planejamento §7 P7).
 */
export async function cleanupCachedPdfUri(resolvedUri: string | null, originalFilePath: string): Promise<void> {
  if (!resolvedUri || !originalFilePath.startsWith('content://')) return;
  if (!resolvedUri.startsWith(FileSystem.cacheDirectory ?? '')) return;
  try {
    const info = await FileSystem.getInfoAsync(resolvedUri);
    if (info.exists) await FileSystem.deleteAsync(resolvedUri, { idempotent: true });
  } catch {
    // silencioso — falha de limpeza não deve quebrar leitor
  }
}
