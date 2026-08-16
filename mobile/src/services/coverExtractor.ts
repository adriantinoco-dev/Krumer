import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { NativeModules, Platform } from 'react-native';
import type { BookFormat } from '../models/item';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

type PdfThumbnailResult = {
  height: number;
  uri: string;
  width: number;
};

type KrumerPdfThumbnailModule = {
  generate: (filePath: string, pageIndex: number) => Promise<PdfThumbnailResult>;
};

const KrumerPdfThumbnail = NativeModules.KrumerPdfThumbnail as KrumerPdfThumbnailModule | undefined;

type PreparedSource = {
  cleanup?: () => Promise<void>;
  uri: string;
};

function warnCoverExtraction(message: string, error?: unknown) {
  if (error) {
    console.warn(`[Krumer covers] ${message}`, error);
    return;
  }

  console.warn(`[Krumer covers] ${message}`);
}

function getBookExtension(path: string, format: BookFormat) {
  const cleanPath = path.split('?')[0].split('#')[0].toLowerCase();
  if (cleanPath.endsWith('.epub')) return 'epub';
  if (cleanPath.endsWith('.pdf')) return 'pdf';
  return format;
}

function withFileScheme(path: string) {
  return path.startsWith('/') ? `file://${path}` : path;
}

async function deleteIfExists(uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

async function ensureTempDirectory() {
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) return null;

  const directory = `${baseDirectory}cover-sources/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  return directory;
}

async function prepareSourceFile(filePath: string, bookId: string, format: BookFormat): Promise<PreparedSource> {
  if (filePath.startsWith('file://') || filePath.startsWith('/')) {
    return { uri: withFileScheme(filePath) };
  }

  const tempDirectory = await ensureTempDirectory();
  if (!tempDirectory) {
    warnCoverExtraction(`Temporary directory unavailable for ${bookId}; using original URI.`);
    return { uri: filePath };
  }

  const tempFile = `${tempDirectory}${bookId}.${getBookExtension(filePath, format)}`;
  try {
    await deleteIfExists(tempFile);
    await FileSystem.copyAsync({ from: filePath, to: tempFile });
  } catch (error) {
    warnCoverExtraction(`Could not copy source file for ${bookId} (${filePath}); using original URI.`, error);
    return { uri: filePath };
  }

  const info = await FileSystem.getInfoAsync(tempFile).catch(() => null);
  if (!info?.exists || Number(info.size ?? 0) <= 0) {
    warnCoverExtraction(`Copied source file is empty for ${bookId}; using original URI.`);
    await deleteIfExists(tempFile);
    return { uri: filePath };
  }

  return {
    cleanup: () => deleteIfExists(tempFile),
    uri: tempFile,
  };
}

function joinZipPath(base: string, relative: string) {
  if (!base) return relative;
  return normalizeZipPath(`${base.replace(/\/$/, '')}/${relative.replace(/^\//, '')}`);
}

function normalizeZipPath(path: string) {
  const parts: string[] = [];
  const cleanPath = decodeXmlEntities(path).replace(/\\/g, '/');

  for (const part of cleanPath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join('/');
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? decodeXmlEntities(match[1]) : null;
}

function getXmlTags(xml: string, tagName: string) {
  return xml.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? [];
}

function findZipFile(zip: JSZip, path: string) {
  const normalizedPath = normalizeZipPath(path);
  return (
    zip.file(normalizedPath) ??
    zip.file(normalizedPath.replace(/%20/g, ' ')) ??
    zip.file(normalizedPath.split('/').map(encodeURIComponent).join('/'))
  );
}

function getExtension(path: string) {
  const extension = path.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  return extension && IMAGE_EXTENSIONS.includes(extension) ? extension : 'jpg';
}

function findCoverHref(opfContent: string) {
  const manifestItems = getXmlTags(opfContent, 'item');
  const coverImage = manifestItems.find((item) => getAttribute(item, 'properties')?.split(/\s+/).includes('cover-image'));
  const coverImageHref = coverImage ? getAttribute(coverImage, 'href') : null;
  if (coverImageHref) return coverImageHref;

  const metaCover = getXmlTags(opfContent, 'meta').find((meta) => getAttribute(meta, 'name')?.toLowerCase() === 'cover');
  const coverId = metaCover ? getAttribute(metaCover, 'content') : null;

  if (coverId) {
    const manifestCover = manifestItems.find((item) => getAttribute(item, 'id') === coverId);
    const manifestCoverHref = manifestCover ? getAttribute(manifestCover, 'href') : null;
    if (manifestCoverHref) return manifestCoverHref;
  }

  const imageItems = manifestItems
    .map((item) => ({
      href: getAttribute(item, 'href'),
      id: getAttribute(item, 'id')?.toLowerCase() ?? '',
      mediaType: getAttribute(item, 'media-type')?.toLowerCase() ?? '',
    }))
    .filter((item): item is { href: string; id: string; mediaType: string } => Boolean(item.href))
    .filter((item) => item.mediaType.startsWith('image/') || IMAGE_EXTENSIONS.some((ext) => item.href.toLowerCase().endsWith(`.${ext}`)));

  return (
    imageItems.find((item) => /(^|[-_])(?:cover|capa)([-_.]|$)/i.test(item.id) || /(?:cover|capa)\.(?:jpe?g|png|webp)$/i.test(item.href))?.href ??
    imageItems[0]?.href ??
    null
  );
}

async function ensureCoversDirectory() {
  const directory = `${FileSystem.documentDirectory}covers/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  return directory;
}

export async function extractEpubCover(epubPath: string, bookId: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(epubPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) return null;

    const rootfileTag = getXmlTags(containerXml, 'rootfile')[0];
    const opfPath = rootfileTag ? getAttribute(rootfileTag, 'full-path') : null;
    if (!opfPath) return null;

    const normalizedOpfPath = normalizeZipPath(opfPath);
    const opfContent = await findZipFile(zip, normalizedOpfPath)?.async('string');
    if (!opfContent) return null;

    const coverHref = findCoverHref(opfContent);
    if (!coverHref) return null;

    const opfDir = normalizedOpfPath.includes('/') ? normalizedOpfPath.substring(0, normalizedOpfPath.lastIndexOf('/')) : '';
    const fullCoverPath = joinZipPath(opfDir, coverHref);
    const coverData = await findZipFile(zip, fullCoverPath)?.async('base64');
    if (!coverData) return null;

    const extension = getExtension(fullCoverPath);
    const coversDirectory = await ensureCoversDirectory();
    const destination = `${coversDirectory}cover_${bookId}.${extension}`;

    await deleteIfExists(destination);
    await FileSystem.writeAsStringAsync(destination, coverData, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return destination;
  } catch (error) {
    console.warn(`EPUB cover extraction failed for ${bookId}:`, error);
    return null;
  }
}

export async function extractPdfCover(pdfPath: string, bookId: string): Promise<string | null> {
  try {
    if (Platform.OS !== 'android') {
      warnCoverExtraction(`PDF cover extraction is only available on Android for ${bookId}.`);
      return null;
    }

    if (!KrumerPdfThumbnail) {
      warnCoverExtraction(`Native PDF thumbnail module is unavailable for ${bookId}. Rebuild the Android development app after native changes.`);
      return null;
    }

    const result = await KrumerPdfThumbnail.generate(withFileScheme(pdfPath), 0);
    if (!result.uri) {
      warnCoverExtraction(`Native PDF thumbnail module returned no URI for ${bookId}.`);
      return null;
    }

    const coversDirectory = await ensureCoversDirectory();
    const destination = `${coversDirectory}cover_${bookId}.jpg`;
    const thumbnailUri = withFileScheme(result.uri);

    await deleteIfExists(destination);

    try {
      await FileSystem.moveAsync({
        from: thumbnailUri,
        to: destination,
      });
    } catch (error) {
      warnCoverExtraction(`Could not move PDF thumbnail for ${bookId}; trying copy instead.`, error);
      try {
        await FileSystem.copyAsync({
          from: thumbnailUri,
          to: destination,
        });
      } catch (copyError) {
        warnCoverExtraction(`Could not copy PDF thumbnail for ${bookId}.`, copyError);
        return null;
      }
    }

    await deleteIfExists(thumbnailUri);

    const info = await FileSystem.getInfoAsync(destination).catch(() => null);
    if (!info?.exists || Number(info.size ?? 0) <= 0) {
      warnCoverExtraction(`PDF thumbnail file is missing after save for ${bookId}.`);
      return null;
    }

    return destination;
  } catch (error) {
    warnCoverExtraction(`PDF cover extraction failed for ${bookId}.`, error);
    return null;
  }
}

export async function extractCover(filePath: string, bookId: string, format: BookFormat): Promise<string | null> {
  let source: PreparedSource | null = null;

  try {
    source = await prepareSourceFile(filePath, bookId, format);
    if (format === 'epub') return await extractEpubCover(source.uri, bookId);
    if (format === 'pdf') return await extractPdfCover(source.uri, bookId);
    return null;
  } catch (error) {
    warnCoverExtraction(`Cover extraction failed for ${bookId}.`, error);
    return null;
  } finally {
    await source?.cleanup?.();
  }
}