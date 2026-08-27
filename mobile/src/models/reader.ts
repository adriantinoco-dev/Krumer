export const READER_EXCERPT_MAX_LENGTH = 240;

export type EpubLocator = {
  format: 'epub';
  cfi: string | null;
  spineHref: string;
  progressionInSection: number;
  excerpt: string;
  totalProgression: number | null;
};

export type PdfLocator = {
  format: 'pdf';
  page: number;
  progressionInPage: number | null;
};

export type ReaderLocator = EpubLocator | PdfLocator;

export type ReaderProgress = {
  bookId: string;
  locator: ReaderLocator;
  updatedAt: number;
};

export type ReaderBookmark = {
  id: string;
  bookId: string;
  locator: ReaderLocator;
  label: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProgression(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function parseReaderLocator(value: unknown): ReaderLocator | null {
  if (!isRecord(value)) return null;

  if (value.format === 'epub') {
    const validCfi = value.cfi === null
      || (typeof value.cfi === 'string' && value.cfi.length <= 2048);
    const validTotalProgression = value.totalProgression === null
      || isProgression(value.totalProgression);
    if (
      !validCfi
      || typeof value.spineHref !== 'string'
      || value.spineHref.length > 1024
      || !isProgression(value.progressionInSection)
      || typeof value.excerpt !== 'string'
      || value.excerpt.length > READER_EXCERPT_MAX_LENGTH
      || !validTotalProgression
    ) {
      return null;
    }

    return {
      format: 'epub',
      cfi: value.cfi as string | null,
      spineHref: value.spineHref,
      progressionInSection: value.progressionInSection,
      excerpt: value.excerpt,
      totalProgression: value.totalProgression as number | null,
    };
  }

  if (value.format === 'pdf') {
    const validPageProgression = value.progressionInPage === null
      || isProgression(value.progressionInPage);
    if (
      typeof value.page !== 'number'
      || !Number.isInteger(value.page)
      || value.page < 1
      || !validPageProgression
    ) {
      return null;
    }

    return {
      format: 'pdf',
      page: value.page,
      progressionInPage: value.progressionInPage as number | null,
    };
  }

  return null;
}

export function locatorFingerprint(locator: ReaderLocator) {
  return JSON.stringify(locator);
}

export type ReaderNote = {
  id: string;
  bookId: string;
  locator: ReaderLocator;
  pageNumber: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
