import { Directory, File, Paths } from 'expo-file-system';

export const MAX_IN_MEMORY_EPUB_BYTES = 16 * 1024 * 1024;

export type PreparedEpub = {
  base64: string;
  byteLength: number;
  durableUri: string;
  estimatedPeakBytes: number;
};

export class EpubFileError extends Error {
  constructor(
    readonly code: 'FILE_NOT_FOUND' | 'FILE_SIZE_UNKNOWN' | 'FILE_TOO_LARGE' | 'FILE_READ_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'EpubFileError';
  }
}

function normalizeFileUri(filePath: string) {
  return filePath.startsWith('/') ? `file://${filePath}` : filePath;
}

function stablePathHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function decodedBase64Length(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function formatMiB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export async function prepareEpubFile(filePath: string, knownByteLength?: number): Promise<PreparedEpub> {
  try {
    const source = new File(normalizeFileUri(filePath));
    const readerDirectory = new Directory(Paths.document, 'reader-books');
    readerDirectory.create({ idempotent: true, intermediates: true });
    const durableFile = new File(readerDirectory, `${stablePathHash(source.uri)}.epub`);
    const readableFile = source.exists ? source : durableFile;

    if (!readableFile.exists) {
      throw new EpubFileError('FILE_NOT_FOUND', 'O arquivo EPUB nao esta mais disponivel.');
    }

    const byteLength = readableFile.size || knownByteLength || 0;
    if (byteLength <= 0) {
      throw new EpubFileError('FILE_SIZE_UNKNOWN', 'Nao foi possivel verificar o tamanho do EPUB com seguranca.');
    }
    if (byteLength > MAX_IN_MEMORY_EPUB_BYTES) {
      throw new EpubFileError(
        'FILE_TOO_LARGE',
        `Este EPUB tem ${formatMiB(byteLength)} MiB. O leitor atual aceita ate ${formatMiB(MAX_IN_MEMORY_EPUB_BYTES)} MiB.`,
      );
    }

    if (source.exists) {
      await source.copy(durableFile, { overwrite: true });
    }

    const persistedFile = durableFile.exists ? durableFile : readableFile;
    const base64 = await persistedFile.base64();
    const decodedLength = decodedBase64Length(base64);
    if (decodedLength > MAX_IN_MEMORY_EPUB_BYTES) {
      throw new EpubFileError(
        'FILE_TOO_LARGE',
        `Este EPUB ultrapassa o limite de ${formatMiB(MAX_IN_MEMORY_EPUB_BYTES)} MiB do leitor atual.`,
      );
    }

    // RN string + injected JSON + WebView string + ArrayBuffer. This is an upper-bound estimate,
    // logged so the temporary whole-file strategy remains measurable until F7 replaces it.
    const estimatedPeakBytes = decodedLength + base64.length * 6;
    console.info('[Krumer EpubReader] in-memory EPUB metrics', {
      byteLength: decodedLength,
      base64Characters: base64.length,
      estimatedPeakBytes,
      limitBytes: MAX_IN_MEMORY_EPUB_BYTES,
    });

    return {
      base64,
      byteLength: decodedLength,
      durableUri: persistedFile.uri,
      estimatedPeakBytes,
    };
  } catch (error) {
    if (error instanceof EpubFileError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new EpubFileError('FILE_READ_FAILED', `Falha ao preparar o EPUB: ${message}`);
  }
}
