import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { NativeModules, Platform } from 'react-native';
import type { BookFormat } from '../models/item';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'jpge', 'png', 'webp'];

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
  if (extension === 'jpge') return 'jpeg';
  return extension && IMAGE_EXTENSIONS.includes(extension) ? extension : 'jpg';
}

function isImagePath(path: string) {
  const lower = path.split('?')[0].split('#')[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(`.${extension}`));
}

function isNamedCoverStem(stem: string) {
  const normalizedStem = stem.trim().toLowerCase();
  return normalizedStem.startsWith('cover') || normalizedStem.startsWith('capa');
}

function isNamedCoverPath(path: string) {
  const fileName = decodeURIComponent(path.split('/').pop() ?? '').toLowerCase();
  const stem = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;

  // Accept any EPUB cover resource whose name starts with "cover" or "capa",
  // including numbered and descriptive variants.
  return isNamedCoverStem(stem);
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
    imageItems.find((item) => isNamedCoverStem(item.id) || isNamedCoverPath(item.href))?.href ??
    imageItems[0]?.href ??
    null
  );
}

async function ensureCoversDirectory() {
  const directory = `${FileSystem.documentDirectory}covers/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  return directory;
}

export async function getExistingCoverPath(bookId: string): Promise<string | null> {
  const directory = `${FileSystem.documentDirectory}covers/`;
  for (const extension of IMAGE_EXTENSIONS) {
    const candidate = `${directory}cover_${bookId}.${extension}`;
    const info = await FileSystem.getInfoAsync(candidate).catch(() => null);
    if (info?.exists && Number(info.size ?? 0) > 0) return candidate;
  }
  return null;
}

async function saveCoverData(base64Data: string, bookId: string, extension: string): Promise<string> {
  const coversDirectory = await ensureCoversDirectory();
  const destination = `${coversDirectory}cover_${bookId}.${extension}`;
  await deleteIfExists(destination);
  await FileSystem.writeAsStringAsync(destination, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return destination;
}

function findImageSrcInXhtml(htmlText: string): string | null {
  const imgMatch = htmlText.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (imgMatch) return imgMatch[1];

  const svgMatch = htmlText.match(/<image\b[^>]*\b(?:xlink:href|href)=["']([^"']+)["']/i);
  if (svgMatch) return svgMatch[1];

  return null;
}

export async function extractEpubCover(epubPath: string, bookId: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(epubPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const allPaths = Object.keys(zip.files);

    async function resolveCoverCandidate(candidateHref: string, opfDir: string): Promise<string | null> {
      const fullPath = joinZipPath(opfDir, candidateHref);
      const isImage = isImagePath(fullPath);

      if (isImage) {
        const data = await findZipFile(zip, fullPath)?.async('base64');
        if (data) return saveCoverData(data, bookId, getExtension(fullPath));
      } else {
        // Página XHTML de capa — extrair <img src> ou SVG <image href>
        const xhtmlContent = await findZipFile(zip, fullPath)?.async('string');
        if (xhtmlContent) {
          const imgSrc = findImageSrcInXhtml(xhtmlContent);
          if (imgSrc) {
            const xhtmlDir = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/')) : '';
            const imgPath = joinZipPath(xhtmlDir, imgSrc);
            const data = await findZipFile(zip, imgPath)?.async('base64');
            if (data) return saveCoverData(data, bookId, getExtension(imgPath));
          }
        }
      }
      return null;
    }

    // 1. Preferir um arquivo cujo nome começa com "cover" ou "capa"
    // dentro do ZIP. Alguns EPUBs
    // têm OPF inconsistente e apontam para a capa de outro volume; o nome
    // explícito do recurso é mais confiável nesses casos. O arquivo pode ser
    // uma imagem ou uma página HTML/XHTML que referencia a imagem real.
    const namedCoverPaths = allPaths
      .filter((path) => !zip.files[path]?.dir && isNamedCoverPath(path))
      .sort((left, right) => {
        const leftIsImage = isImagePath(left);
        const rightIsImage = isImagePath(right);
        if (leftIsImage !== rightIsImage) return leftIsImage ? -1 : 1;
        return left.localeCompare(right);
      });

    for (const relativePath of namedCoverPaths) {
      const result = await resolveCoverCandidate(relativePath, '');
      if (result) return result;
    }

    // 2. OPF — fonte declarativa de reserva
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    const opfPathFromContainer = containerXml
      ? (getAttribute(getXmlTags(containerXml, 'rootfile')[0] ?? '', 'full-path') ?? null)
      : null;
    const opfPath = opfPathFromContainer ?? allPaths.find((p) => p.toLowerCase().endsWith('.opf')) ?? null;

    if (opfPath) {
      const normalizedOpfPath = normalizeZipPath(opfPath);
      const opfContent = await findZipFile(zip, normalizedOpfPath)?.async('string');

      if (opfContent) {
        const opfDir = normalizedOpfPath.includes('/')
          ? normalizedOpfPath.substring(0, normalizedOpfPath.lastIndexOf('/'))
          : '';

        // Strategy A: EPUB 3 <item properties="... cover-image ..." href="...">
        const itemPropMatch = opfContent.match(/<item\b[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*href=["']([^"']+)["']/i);
        if (itemPropMatch) {
          const result = await resolveCoverCandidate(itemPropMatch[1], opfDir);
          if (result) return result;
        }

        // Strategy B: EPUB 2 <meta name="cover" content="id">
        const metaMatch = opfContent.match(/<meta\b[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i);
        if (metaMatch) {
          const coverId = metaMatch[1];
          const itemMatch = new RegExp(`<item\\b[^>]*id=["']${coverId}["'][^>]*href=["']([^"']+)["']`, 'i').exec(opfContent);
          if (itemMatch) {
            const result = await resolveCoverCandidate(itemMatch[1], opfDir);
            if (result) return result;
          }
        }

        // Strategy C: OPF Guide <reference type="cover" href="...">
        const guideMatch = opfContent.match(/<reference\b[^>]*type=["']cover["'][^>]*href=["']([^"']+)["']/i);
        if (guideMatch) {
          const result = await resolveCoverCandidate(guideMatch[1], opfDir);
          if (result) return result;
        }

        // Strategy D: Manifest item com ID iniciado por "cover" ou "capa"
        const coverItemMatch = getXmlTags(opfContent, 'item').find((item) => {
          const id = getAttribute(item, 'id');
          return Boolean(id && isNamedCoverStem(id));
        });
        const coverItemHref = coverItemMatch ? getAttribute(coverItemMatch, 'href') : null;
        if (coverItemHref) {
          const result = await resolveCoverCandidate(coverItemHref, opfDir);
          if (result) return result;
        }

      }
    }

    // Sem um arquivo explícito ou uma referência declarativa válida, não
    // escolher uma imagem arbitrária (ela pode ser de outro capítulo/volume).
    return null;
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
