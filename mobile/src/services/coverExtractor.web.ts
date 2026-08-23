import JSZip from 'jszip';
import type { BookFormat } from '../models/item';

async function ensurePdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const pdfjs = (window as any).pdfjsLib;
      if (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      resolve(pdfjs);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function joinZipPath(dir: string, relative: string): string {
  const combined = dir ? `${dir.replace(/\/$/, '')}/${relative.replace(/^\//, '')}` : relative;
  const parts: string[] = [];
  for (const part of combined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function findImageSrcInXhtml(htmlText: string): string | null {
  const imgMatch = htmlText.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (imgMatch) return imgMatch[1];

  const svgMatch = htmlText.match(/<image\b[^>]*\b(?:xlink:href|href)=["']([^"']+)["']/i);
  if (svgMatch) return svgMatch[1];

  return null;
}

export async function extractEpubCoverFromBlob(fileBlob: Blob): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(fileBlob);
    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
    const allPaths = Object.keys(zip.files);

    function isImagePath(p: string) {
      const lower = p.toLowerCase();
      return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
    }

    function getMime(p: string) {
      const lower = p.toLowerCase();
      if (lower.endsWith('.png')) return 'image/png';
      if (lower.endsWith('.webp')) return 'image/webp';
      return 'image/jpeg';
    }

    async function readImageAsDataUrl(relativePath: string): Promise<string | null> {
      const cleanPath = joinZipPath('', relativePath);
      const zipFile = zip.file(cleanPath) || zip.file(decodeURIComponent(cleanPath));
      if (!zipFile) return null;
      const base64 = await zipFile.async('base64');
      return `data:${getMime(cleanPath)};base64,${base64}`;
    }

    async function resolveCoverCandidate(candidateHref: string, opfDir: string): Promise<string | null> {
      const fullPath = joinZipPath(opfDir, candidateHref);
      if (isImagePath(fullPath)) {
        return readImageAsDataUrl(fullPath);
      }

      // Se não for imagem direta, é uma página HTML/XHTML de capa
      const xhtmlFile = zip.file(fullPath) || zip.file(decodeURIComponent(fullPath));
      if (xhtmlFile) {
        const xhtmlText = await xhtmlFile.async('text');
        const imgSrc = findImageSrcInXhtml(xhtmlText);
        if (imgSrc) {
          const xhtmlDir = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/')) : '';
          const imgPath = joinZipPath(xhtmlDir, imgSrc);
          return readImageAsDataUrl(imgPath);
        }
      }
      return null;
    }

    // 1. Tentar localizar o arquivo .opf
    let opfPath: string | null = null;
    const containerFile = zip.file('META-INF/container.xml');
    if (containerFile) {
      const text = await containerFile.async('text');
      const match = text.match(/full-path="([^"]+)"/i);
      if (match) opfPath = match[1];
    }
    if (!opfPath) {
      opfPath = allPaths.find((p) => p.toLowerCase().endsWith('.opf')) ?? null;
    }

    if (opfPath) {
      const cleanOpfPath = joinZipPath('', opfPath);
      const opfFile = zip.file(cleanOpfPath);
      if (opfFile) {
        const opfText = await opfFile.async('text');
        const opfDir = cleanOpfPath.includes('/') ? cleanOpfPath.substring(0, cleanOpfPath.lastIndexOf('/')) : '';

        // Strategy A: EPUB 3 <item properties="... cover-image ..." href="...">
        const itemPropMatch = opfText.match(/<item\b[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*href=["']([^"']+)["']/i);
        if (itemPropMatch) {
          const cover = await resolveCoverCandidate(itemPropMatch[1], opfDir);
          if (cover) return cover;
        }

        // Strategy B: EPUB 2 <meta name="cover" content="id">
        const metaMatch = opfText.match(/<meta\b[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i);
        if (metaMatch) {
          const coverId = metaMatch[1];
          const itemMatch = new RegExp(`<item\\b[^>]*id=["']${coverId}["'][^>]*href=["']([^"']+)["']`, 'i').exec(opfText);
          if (itemMatch) {
            const cover = await resolveCoverCandidate(itemMatch[1], opfDir);
            if (cover) return cover;
          }
        }

        // Strategy C: OPF Guide <reference type="cover" href="...">
        const guideMatch = opfText.match(/<reference\b[^>]*type=["']cover["'][^>]*href=["']([^"']+)["']/i);
        if (guideMatch) {
          const cover = await resolveCoverCandidate(guideMatch[1], opfDir);
          if (cover) return cover;
        }

        // Strategy D: Manifest item com ID "cover"
        const coverItemMatch = opfText.match(/<item\b[^>]*id=["'](?:cover|cover-image|coverimage|cover_image)["'][^>]*href=["']([^"']+)["']/i);
        if (coverItemMatch) {
          const cover = await resolveCoverCandidate(coverItemMatch[1], opfDir);
          if (cover) return cover;
        }

        // Strategy E: Primeiro item do <spine> (página de capa do próprio livro)
        const spineMatch = opfText.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
        if (spineMatch) {
          const itemrefMatch = spineMatch[1].match(/<itemref\b[^>]*idref=["']([^"']+)["']/i);
          if (itemrefMatch) {
            const firstId = itemrefMatch[1];
            const itemMatch = new RegExp(`<item\\b[^>]*id=["']${firstId}["'][^>]*href=["']([^"']+)["']`, 'i').exec(opfText);
            if (itemMatch) {
              const cover = await resolveCoverCandidate(itemMatch[1], opfDir);
              if (cover) return cover;
            }
          }
        }
      }
    }

    // 2. Fallback: imagem cujo nome de arquivo (sem diretório) seja exatamente cover/capa
    for (const relativePath of allPaths) {
      if (!isImagePath(relativePath)) continue;
      const fileName = relativePath.split('/').pop()?.toLowerCase() ?? '';
      const stem = fileName.replace(/\.[^.]+$/, '');
      if (stem === 'cover' || stem === 'capa' || stem === 'cover_image' || stem === 'cover-image') {
        const result = await readImageAsDataUrl(relativePath);
        if (result) return result;
      }
    }

    // 3. Maior imagem encontrada no ZIP
    let bestPath: string | null = null;
    let bestSize = 0;
    for (const [relativePath, zipObj] of Object.entries(zip.files)) {
      if (!zipObj.dir && isImagePath(relativePath)) {
        const data = await zipObj.async('uint8array');
        if (data.length > bestSize) {
          bestSize = data.length;
          bestPath = relativePath;
        }
      }
    }
    if (bestPath) return readImageAsDataUrl(bestPath);

  } catch (error) {
    console.warn('[CoverExtractor Web] Erro ao extrair capa do EPUB:', error);
  }
  return null;
}

export async function extractPdfCoverFromBlob(fileBlob: Blob): Promise<string | null> {
  try {
    const pdfjs = await ensurePdfJs();
    if (!pdfjs) return null;

    const arrayBuffer = await fileBlob.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);

    const viewport = page.getViewport({ scale: 0.6 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (error) {
    console.warn('[CoverExtractor Web] Erro ao extrair capa do PDF:', error);
    return null;
  }
}

export async function extractCoverFromWebBlob(fileBlob: Blob, format: BookFormat): Promise<string | null> {
  if (format === 'epub') {
    return extractEpubCoverFromBlob(fileBlob);
  }
  if (format === 'pdf') {
    return extractPdfCoverFromBlob(fileBlob);
  }
  return null;
}

export async function getExistingCoverPath(_bookId: string): Promise<string | null> {
  return null;
}

export async function extractEpubCover(epubPath: string, _bookId: string): Promise<string | null> {
  if (epubPath.startsWith('blob:') || epubPath.startsWith('data:')) {
    try {
      const res = await fetch(epubPath);
      const blob = await res.blob();
      return extractEpubCoverFromBlob(blob);
    } catch {
      return null;
    }
  }
  return null;
}

export async function extractPdfCover(pdfPath: string, _bookId: string): Promise<string | null> {
  if (pdfPath.startsWith('blob:') || pdfPath.startsWith('data:')) {
    try {
      const res = await fetch(pdfPath);
      const blob = await res.blob();
      return extractPdfCoverFromBlob(blob);
    } catch {
      return null;
    }
  }
  return null;
}

export async function extractCover(filePath: string, _bookId: string, format: BookFormat): Promise<string | null> {
  if (filePath.startsWith('blob:') || filePath.startsWith('data:')) {
    try {
      const res = await fetch(filePath);
      const blob = await res.blob();
      return extractCoverFromWebBlob(blob, format);
    } catch {
      return null;
    }
  }
  return null;
}
