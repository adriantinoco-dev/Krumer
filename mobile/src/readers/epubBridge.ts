import { parseReaderLocator, type EpubLocator } from '../models/reader';
import type { ReadingPreferences } from '../models/readingPreferences';

export const EPUB_BRIDGE_VERSION = 7 as const;
export const EPUB_BRIDGE_QUEUE_LIMIT = 8;

export type EpubFontWeight = 300 | 400 | 500 | 700;

export type EpubFontFace = {
  dataBase64: string;
  family: ReadingPreferences['fontFamily'];
  fontFamily: string;
  mimeType: 'font/ttf';
  weight: EpubFontWeight;
};

export type EpubRelocationSource = 'user' | 'restore' | 'reflow';
export type EpubLocatorResolution = 'cfi' | 'spine-progression' | 'spine-start' | 'excerpt' | 'start';

export type EpubVisualTheme = {
  backgroundColor: string;
  linkColor: string;
  textColor: string;
};

export type EpubAppearance = Omit<ReadingPreferences, 'highlightColor'> & {
  fontSize: number;
  lineHeight: number;
  marginHorizontal: number;
  useBookMargins: boolean;
  visualTheme: EpubVisualTheme;
};

export type EpubTocItem = {
  label: string;
  href: string;
  subitems: EpubTocItem[];
};

export type EpubViewStatus = {
  chapterTitle: string;
  currentPage: number | null;
  paginationState: 'loading' | 'ready' | 'unavailable';
  totalPages: number | null;
};

export type EpubSelectionBoundsStatus = {
  endPage: number | null;
  phase: 'selectionchange' | 'selected';
  result: 'applied' | 'unchanged' | 'unavailable';
  startPage: number | null;
  viewportRestored: boolean;
};

export type EpubSelectionGeometry = {
  bottom: number;
  left: number;
  right: number;
  top: number;
  viewportHeight: number;
  viewportWidth: number;
};

type BridgeEnvelope<Type extends string, Payload> = {
  version: typeof EPUB_BRIDGE_VERSION;
  id: string;
  type: Type;
  payload: Payload;
};

export type EpubBridgeCommand =
  | BridgeEnvelope<'OPEN_BOOK', {
      bookId: string;
      dataBase64: string;
      byteLength: number;
      initialLocator?: EpubLocator | null;
      appearance: EpubAppearance;
    }>
  | BridgeEnvelope<'NEXT', Record<string, never>>
  | BridgeEnvelope<'PREVIOUS', Record<string, never>>
  | BridgeEnvelope<'REGISTER_FONT_FACES', {
      family: ReadingPreferences['fontFamily'];
      faces: EpubFontFace[];
    }>
  | BridgeEnvelope<'SET_APPEARANCE', { appearance: EpubAppearance }>
  | BridgeEnvelope<'SET_HIGHLIGHTS', { highlights: { cfiRange: string; color: string }[] }>
  | BridgeEnvelope<'UPSERT_HIGHLIGHT', { cfiRange: string; color: string; textExcerpt: string }>
  | BridgeEnvelope<'REMOVE_SELECTION_HIGHLIGHT', { cfiRange: string }>
  | BridgeEnvelope<'SELECT_VISIBLE_PAGE_TEXT', Record<string, never>>
  | BridgeEnvelope<'GO_TO_LOCATOR', { locator: EpubLocator }>
  | BridgeEnvelope<'GO_TO_PROGRESS', { progress: number }>
  | BridgeEnvelope<'GET_CURRENT_LOCATOR', Record<string, never>>
  | BridgeEnvelope<'GET_TOC', Record<string, never>>
  | BridgeEnvelope<'GO_TO_HREF', { href: string }>
  | BridgeEnvelope<'CLEAR_SELECTION', Record<string, never>>
  | BridgeEnvelope<'CLOSE_BOOK', Record<string, never>>;

export type EpubBridgeEvent =
  | BridgeEnvelope<'READY', { engine: 'epub.js'; engineVersion: '0.3.93' }>
  | BridgeEnvelope<'BOOK_OPENED', { bookId: string }>
  | BridgeEnvelope<'FONT_FACES_READY', { family: ReadingPreferences['fontFamily']; requestId: string }>
  | BridgeEnvelope<'CENTER_TAP', Record<string, never>>
  | BridgeEnvelope<'RELOCATE', { locator: EpubLocator; source: EpubRelocationSource }>
  | BridgeEnvelope<'POSITION_STABILIZED', {
      locator: EpubLocator;
      resolution: EpubLocatorResolution;
      source: 'restore' | 'reflow';
    }>
  | BridgeEnvelope<'CURRENT_LOCATOR', { locator: EpubLocator | null; requestId: string }>
  | BridgeEnvelope<'TOC', { toc: EpubTocItem[]; requestId: string }>
  | BridgeEnvelope<'VIEW_STATUS', EpubViewStatus>
  | BridgeEnvelope<'SELECTION_BOUNDS_STATUS', EpubSelectionBoundsStatus>
  | BridgeEnvelope<'SELECTION_READY', {
      text: string;
      cfiRange: string | null;
      gestureId: number;
      geometry: EpubSelectionGeometry;
      hasHighlight: boolean;
    }>
  | BridgeEnvelope<'SELECTION_CLEARED', { requestId?: string }>
  | BridgeEnvelope<'HIGHLIGHTS_CHANGED', {
      bookId: string;
      selectionCfiRange: string;
      hasHighlight: boolean;
      removedCfiRanges: string[];
      highlights: { cfiRange: string; textExcerpt: string; color: string }[];
    }>
  | BridgeEnvelope<'LINK_PRESSED', { url: string }>
  | BridgeEnvelope<'ERROR', { code: string; message: string; requestId?: string }>;

let nextBridgeId = 0;

export function createEpubBridgeCommand<Type extends EpubBridgeCommand['type']>(
  type: Type,
  payload: Extract<EpubBridgeCommand, { type: Type }>['payload'],
): Extract<EpubBridgeCommand, { type: Type }> {
  nextBridgeId = (nextBridgeId + 1) % Number.MAX_SAFE_INTEGER;
  return {
    version: EPUB_BRIDGE_VERSION,
    id: `rn-${Date.now()}-${nextBridgeId}`,
    type,
    payload,
  } as Extract<EpubBridgeCommand, { type: Type }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEpubSelectionGeometry(value: unknown): value is EpubSelectionGeometry {
  if (!isRecord(value)) return false;
  const { left, top, right, bottom, viewportWidth, viewportHeight } = value;
  const validCoordinate = (coordinate: unknown): coordinate is number =>
    typeof coordinate === 'number' && Number.isFinite(coordinate);
  if (
    !validCoordinate(left)
    || !validCoordinate(top)
    || !validCoordinate(right)
    || !validCoordinate(bottom)
    || !validCoordinate(viewportWidth)
    || !validCoordinate(viewportHeight)
  ) return false;
  return left >= 0
    && top >= 0
    && right > left
    && bottom > top
    && viewportWidth > 0
    && viewportHeight > 0
    && right <= viewportWidth + 1
    && bottom <= viewportHeight + 1;
}

export function parseEpubBridgeEvent(raw: string): EpubBridgeEvent | null {
  if (raw.length > 2_097_152) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (isRecord(value) && value.type !== 'HIGHLIGHTS_CHANGED' && raw.length > 131072) return null;

  if (
    !isRecord(value)
    || value.version !== EPUB_BRIDGE_VERSION
    || typeof value.id !== 'string'
    || !isRecord(value.payload)
  ) {
    return null;
  }

  if (value.type === 'READY') {
    return value.payload.engine === 'epub.js' && value.payload.engineVersion === '0.3.93'
      ? value as EpubBridgeEvent
      : null;
  }

  if (value.type === 'BOOK_OPENED') {
    return typeof value.payload.bookId === 'string' ? value as EpubBridgeEvent : null;
  }

  if (value.type === 'FONT_FACES_READY') {
    const validFamily = value.payload.family === 'serif'
      || value.payload.family === 'sans'
      || value.payload.family === 'mono';
    return validFamily && typeof value.payload.requestId === 'string'
      ? value as EpubBridgeEvent
      : null;
  }

  if (value.type === 'CENTER_TAP') return value as EpubBridgeEvent;
  if (value.type === 'SELECTION_CLEARED') {
    return value.payload.requestId === undefined
      || (typeof value.payload.requestId === 'string' && value.payload.requestId.length <= 128)
      ? value as EpubBridgeEvent
      : null;
  }
  if (value.type === 'SELECTION_READY') {
    return typeof value.payload.text === 'string'
      && value.payload.text.length > 0
      && value.payload.text.length <= 100000
      && typeof value.payload.hasHighlight === 'boolean'
      && isEpubSelectionGeometry(value.payload.geometry)
      && (value.payload.cfiRange === null
        || (typeof value.payload.cfiRange === 'string' && value.payload.cfiRange.length <= 4096))
      && Number.isSafeInteger(value.payload.gestureId)
      && (value.payload.gestureId as number) >= 0
      ? value as EpubBridgeEvent : null;
  }

  if (value.type === 'HIGHLIGHTS_CHANGED') {
    const removedCfiRanges = value.payload.removedCfiRanges;
    const highlights = value.payload.highlights;
    const validCfiList = Array.isArray(removedCfiRanges)
      && removedCfiRanges.length <= 5000
      && removedCfiRanges.every((cfiRange) => typeof cfiRange === 'string' && cfiRange.length > 0 && cfiRange.length <= 4096);
    const validHighlights = Array.isArray(highlights)
      && highlights.length <= 5000
      && highlights.every((highlight) => isRecord(highlight)
        && typeof highlight.cfiRange === 'string'
        && highlight.cfiRange.length > 0
        && highlight.cfiRange.length <= 4096
        && typeof highlight.textExcerpt === 'string'
        && highlight.textExcerpt.length <= 100000
        && typeof highlight.color === 'string'
        && highlight.color.length <= 32);
    return typeof value.payload.bookId === 'string'
      && value.payload.bookId.length <= 256
      && typeof value.payload.selectionCfiRange === 'string'
      && value.payload.selectionCfiRange.length > 0
      && value.payload.selectionCfiRange.length <= 4096
      && typeof value.payload.hasHighlight === 'boolean'
      && validCfiList
      && validHighlights
      ? value as EpubBridgeEvent
      : null;
  }

  if (value.type === 'RELOCATE') {
    const locator = parseReaderLocator(value.payload.locator);
    const validSource = value.payload.source === 'user'
      || value.payload.source === 'restore'
      || value.payload.source === 'reflow';
    return locator?.format === 'epub' && validSource ? value as EpubBridgeEvent : null;
  }

  if (value.type === 'POSITION_STABILIZED') {
    const locator = parseReaderLocator(value.payload.locator);
    const validSource = value.payload.source === 'restore' || value.payload.source === 'reflow';
    const validResolution = value.payload.resolution === 'cfi'
      || value.payload.resolution === 'spine-progression'
      || value.payload.resolution === 'spine-start'
      || value.payload.resolution === 'excerpt'
      || value.payload.resolution === 'start';
    return locator?.format === 'epub' && validSource && validResolution
      ? value as EpubBridgeEvent
      : null;
  }

  if (value.type === 'CURRENT_LOCATOR') {
    const explicitNull = value.payload.locator === null;
    const locator = explicitNull ? null : parseReaderLocator(value.payload.locator);
    return (explicitNull || locator?.format === 'epub') && typeof value.payload.requestId === 'string'
      ? value as EpubBridgeEvent
      : null;
  }

  if (value.type === 'VIEW_STATUS') {
    const currentPage = value.payload.currentPage;
    const totalPages = value.payload.totalPages;
    const paginationState = value.payload.paginationState;
    const validReadyPage = typeof currentPage === 'number'
      && Number.isInteger(currentPage)
      && currentPage >= 1;
    const validReadyTotal = typeof totalPages === 'number'
      && Number.isInteger(totalPages)
      && typeof currentPage === 'number'
      && validReadyPage
      && totalPages >= currentPage;
    const validPendingPages = currentPage === null && totalPages === null;
    const validPagination = paginationState === 'ready'
      ? validReadyPage && validReadyTotal
      : (paginationState === 'loading' || paginationState === 'unavailable') && validPendingPages;
    return typeof value.payload.chapterTitle === 'string'
      && value.payload.chapterTitle.length <= 200
      && validPagination
      ? value as EpubBridgeEvent
      : null;
  }

  if (value.type === 'SELECTION_BOUNDS_STATUS') {
    const validPage = (page: unknown) => page === null
      || (typeof page === 'number' && Number.isInteger(page) && page >= 1);
    const validPhase = value.payload.phase === 'selectionchange' || value.payload.phase === 'selected';
    const validResult = value.payload.result === 'applied'
      || value.payload.result === 'unchanged'
      || value.payload.result === 'unavailable';
    return validPage(value.payload.startPage)
      && validPage(value.payload.endPage)
      && validPhase
      && validResult
      && typeof value.payload.viewportRestored === 'boolean'
      ? value as EpubBridgeEvent
      : null;
  }

  if (value.type === 'TOC') {
    return Array.isArray(value.payload.toc) && typeof value.payload.requestId === 'string'
      ? value as EpubBridgeEvent
      : null;
  }

  if (value.type === 'LINK_PRESSED') {
    return typeof value.payload.url === 'string' ? value as EpubBridgeEvent : null;
  }

  if (value.type === 'ERROR') {
    const validRequestId = value.payload.requestId === undefined || typeof value.payload.requestId === 'string';
    return typeof value.payload.code === 'string'
      && typeof value.payload.message === 'string'
      && validRequestId
      ? value as EpubBridgeEvent
      : null;
  }

  return null;
}
