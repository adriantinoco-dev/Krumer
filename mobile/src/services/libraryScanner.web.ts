import type { Book, BookFormat } from '../models/item';
import type { ScanUpdate } from './libraryScanner';
import { extractCoverFromWebBlob } from './coverExtractor.web';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function createSvgCover(title: string, author: string, color1: string, color2: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color1}" />
        <stop offset="100%" stop-color="${color2}" />
      </linearGradient>
    </defs>
    <rect width="300" height="450" fill="url(#g)" />
    <rect x="20" y="20" width="260" height="410" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" rx="8" />
    <text x="150" y="200" fill="#ffffff" font-family="Georgia, serif" font-size="22" font-weight="bold" text-anchor="middle">${title}</text>
    <text x="150" y="240" fill="rgba(255,255,255,0.8)" font-family="Georgia, serif" font-size="14" text-anchor="middle">${author}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getDemoBooks(): Book[] {
  const chainsawChapters: Book[] = [
    {
      id: 'demo-cs-1',
      title: 'Chainsaw Man - Vol. 01',
      author: 'Tatsuki Fujimoto',
      format: 'pdf',
      filePath: 'demo://chainsaw-1.pdf',
      fileSize: 15400000,
      fingerprint: 'file|chainsaw-1|15400000',
      coverPath: createSvgCover('Chainsaw Man Vol. 1', 'Tatsuki Fujimoto', '#990000', '#ff4d4d'),
      progress: '14',
      progressPct: 75,
      currentPage: 14,
      totalPages: 18,
      parentId: 'demo-cs-series',
      addedAt: Date.now() - 3600000,
    },
    {
      id: 'demo-cs-2',
      title: 'Chainsaw Man - Vol. 02',
      author: 'Tatsuki Fujimoto',
      format: 'pdf',
      filePath: 'demo://chainsaw-2.pdf',
      fileSize: 16200000,
      fingerprint: 'file|chainsaw-2|16200000',
      coverPath: createSvgCover('Chainsaw Man Vol. 2', 'Tatsuki Fujimoto', '#cc6600', '#ff9933'),
      progress: null,
      progressPct: 0,
      parentId: 'demo-cs-series',
      addedAt: Date.now() - 3500000,
    },
  ];

  return [
    {
      id: 'demo-1',
      title: 'O Senhor dos Anéis: A Sociedade do Anel',
      author: 'J.R.R. Tolkien',
      format: 'epub',
      filePath: 'demo://lotr.epub',
      fileSize: 2400000,
      fingerprint: 'file|lotr|2400000',
      coverPath: createSvgCover('A Sociedade do Anel', 'J.R.R. Tolkien', '#1a365d', '#2b6cb0'),
      progress: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      progressPct: 42,
      currentPage: 120,
      totalPages: 420,
      addedAt: Date.now() - 86400000,
    },
    {
      id: 'demo-2',
      title: 'Duna',
      author: 'Frank Herbert',
      format: 'epub',
      filePath: 'demo://dune.epub',
      fileSize: 3100000,
      fingerprint: 'file|dune|3100000',
      coverPath: createSvgCover('Duna', 'Frank Herbert', '#744210', '#d69e2e'),
      progress: 'epubcfi(/6/12[end]!/4/2)',
      progressPct: 100,
      isRead: true,
      addedAt: Date.now() - 172800000,
    },
    {
      id: 'demo-cs-series',
      title: 'Chainsaw Man (Série)',
      author: 'Tatsuki Fujimoto',
      format: 'pdf',
      filePath: 'demo://chainsaw-1.pdf',
      fileSize: 0,
      fingerprint: 'series|chainsaw-man',
      coverPath: chainsawChapters[0].coverPath,
      progress: null,
      childrenCount: chainsawChapters.length,
      children: chainsawChapters,
      addedAt: Date.now() - 3600000,
    },
    {
      id: 'demo-3',
      title: 'Neuromancer',
      author: 'William Gibson',
      format: 'pdf',
      filePath: 'demo://neuromancer.pdf',
      fileSize: 1800000,
      fingerprint: 'file|neuromancer|1800000',
      coverPath: createSvgCover('Neuromancer', 'William Gibson', '#234e52', '#319795'),
      progress: null,
      progressPct: 0,
      addedAt: Date.now() - 43200000,
    },
    {
      id: 'demo-4',
      title: 'Fundação',
      author: 'Isaac Asimov',
      format: 'epub',
      filePath: 'demo://foundation.epub',
      fileSize: 1900000,
      fingerprint: 'file|foundation|1900000',
      coverPath: createSvgCover('Fundação', 'Isaac Asimov', '#4a5568', '#a0aec0'),
      progress: null,
      progressPct: 0,
      addedAt: Date.now() - 21600000,
    },
  ];
}

export async function scanLibrary(
  directoryUri: string,
  onUpdate?: (update: ScanUpdate) => void
): Promise<Book[]> {
  const webFiles: File[] | undefined = (window as any).__krumerWebFiles;

  if (webFiles && webFiles.length > 0) {
    const validFiles = webFiles.filter((file) => {
      const name = file.name.toLowerCase();
      return name.endsWith('.epub') || name.endsWith('.pdf');
    });

    const books: Book[] = [];
    const total = validFiles.length || 1;

    for (let index = 0; index < validFiles.length; index += 1) {
      const file = validFiles[index];
      const name = file.name;
      const format: BookFormat = name.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf';
      const title = name.replace(/\.(epub|pdf)$/i, '').replace(/[_-]+/g, ' ').trim();
      const objectUrl = URL.createObjectURL(file);

      let coverPath: string | null = null;
      try {
        coverPath = await extractCoverFromWebBlob(file, format);
      } catch {
        coverPath = null;
      }
      if (!coverPath) {
        coverPath = createSvgCover(title, 'Livro Local', '#1a202c', '#4a5568');
      }

      onUpdate?.({
        fileName: name,
        percent: Math.round(((index + 1) / total) * 100),
        done: index + 1 === total,
      });

      books.push({
        id: `web-file-${index}-${Date.now()}`,
        title,
        author: '',
        format,
        filePath: objectUrl,
        fileSize: file.size,
        fingerprint: `file|${title}|${file.size}`,
        coverPath,
        progress: null,
        progressPct: 0,
        addedAt: Date.now(),
      });

      await delay(80);
    }

    if (!books.length) {
      onUpdate?.({ fileName: 'Nenhum livro PDF/EPUB encontrado na pasta.', percent: 100, done: true });
      return getDemoBooks();
    }

    return books;
  }

  // Fallback demo library
  const demoBooks = getDemoBooks();
  for (let index = 0; index < demoBooks.length; index += 1) {
    const book = demoBooks[index];
    onUpdate?.({
      fileName: book.title,
      percent: Math.round(((index + 1) / demoBooks.length) * 100),
      done: index + 1 === demoBooks.length,
    });
    await delay(200);
  }

  return demoBooks;
}

export async function extractCoversInBackground(
  _books: Book[],
  _onCoverReady: (bookId: string, coverPath: string) => void
): Promise<void> {
  // Capas SVG/Blob geradas automaticamente no scanner web
}
