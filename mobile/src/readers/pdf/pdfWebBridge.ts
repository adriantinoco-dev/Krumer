export const PDF_WEB_BRIDGE_VERSION = 1 as const;
export const PDF_WEB_BRIDGE_QUEUE_LIMIT = 8;

export type PdfWebBridgeCommand =
  | BridgeEnvelope<'OPEN_BOOK', {
      bookId: string;
      byteLength: number;
      displayMode: 'paginated' | 'scroll';
      initialPage: number;
      rangeUrl?: string;
      scale: number;
    }>
  | BridgeEnvelope<'SET_PAGE', { page: number }>
  | BridgeEnvelope<'SET_SCALE', { scale: number }>
  | BridgeEnvelope<'SET_DISPLAY_MODE', { displayMode: 'paginated' | 'scroll' }>
  | BridgeEnvelope<'SCROLL_BY_VIEWPORT', { fraction: number; repeat?: boolean }>
  | BridgeEnvelope<'STOP_VIEWPORT_SCROLL', Record<string, never>>
  | BridgeEnvelope<'READ_RANGE_RESULT', {
      bookId: string;
      dataBase64?: string;
      error?: string;
      requestId: string;
    }>
  | BridgeEnvelope<'CLOSE_BOOK', Record<string, never>>;

export type PdfWebBridgeEvent =
  | BridgeEnvelope<'READY', { engine: 'pdf.js'; engineVersion: '5.5.207' }>
  | BridgeEnvelope<'BOOK_OPENED', {
      bookId: string;
      height: number;
      page: number;
      totalPages: number;
      width: number;
    }>
  | BridgeEnvelope<'PAGE_CHANGED', {
      page: number;
      reason: 'page' | 'scroll' | 'restore' | 'unknown';
      totalPages: number;
    }>
  | BridgeEnvelope<'LOAD_PROGRESS', { progress: number }>
  | BridgeEnvelope<'SCALE_CHANGED', { gestureMs?: number; scale: number }>
  | BridgeEnvelope<'RUNTIME_METRICS', {
      openMs: number;
      pagesLoaded: number;
      rangeBytes: number;
      rangeBinaryRequests: number;
      rangeBridgeRequests: number;
      rangeRejected: number;
      rangeRequests: number;
      rangeTimeouts: number;
      scale: number;
    }>
  | BridgeEnvelope<'VOLUME_SCROLL_METRICS', {
      durationMs: number;
      frames: number;
      maxFrameMs: number;
      slowFrames: number;
    }>
  | BridgeEnvelope<'PERFORMANCE_METRIC', {
      elapsedMs: number;
      navigationMs?: number;
      page: number;
      preloadHit?: boolean;
      stage: 'document-opened' | 'preview-visible' | 'final-ready' | 'layers-ready';
    }>
  | BridgeEnvelope<'SINGLE_TAP', { page: number; x: number; y: number }>
  | BridgeEnvelope<'LINK_PRESSED', { url: string }>
  | BridgeEnvelope<'READ_RANGE', {
      begin: number;
      bookId: string;
      end: number;
      requestId: string;
    }>
  | BridgeEnvelope<'CENTER_TAP', Record<string, never>>
  | BridgeEnvelope<'ERROR', { code: string; message: string }>;

export type PdfWebRuntimeMetrics = Extract<PdfWebBridgeEvent, {
  type: 'RUNTIME_METRICS';
}>['payload'];

type BridgeEnvelope<Type extends string, Payload> = {
  version: typeof PDF_WEB_BRIDGE_VERSION;
  id: string;
  type: Type;
  payload: Payload;
};

let nextBridgeId = 0;

export function createPdfWebBridgeCommand<Type extends PdfWebBridgeCommand['type']>(
  type: Type,
  payload: Extract<PdfWebBridgeCommand, { type: Type }>['payload'],
): Extract<PdfWebBridgeCommand, { type: Type }> {
  nextBridgeId = (nextBridgeId + 1) % Number.MAX_SAFE_INTEGER;
  return {
    version: PDF_WEB_BRIDGE_VERSION,
    id: `rn-pdf-${Date.now()}-${nextBridgeId}`,
    type,
    payload,
  } as Extract<PdfWebBridgeCommand, { type: Type }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}

function isFiniteNumber(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

export function parsePdfWebBridgeEvent(raw: string): PdfWebBridgeEvent | null {
  if (raw.length > 8192) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !isRecord(value)
    || value.version !== PDF_WEB_BRIDGE_VERSION
    || typeof value.id !== 'string'
    || !isRecord(value.payload)
  ) return null;

  const payload = value.payload;
  if (value.type === 'READY') {
    return payload.engine === 'pdf.js' && payload.engineVersion === '5.5.207'
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'BOOK_OPENED') {
    return typeof payload.bookId === 'string'
      && isFiniteNumber(payload.height, 1)
      && isFiniteInteger(payload.page, 1)
      && isFiniteInteger(payload.totalPages, 1)
      && payload.page <= payload.totalPages
      && isFiniteNumber(payload.width, 1)
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'PAGE_CHANGED') {
    const validReason = payload.reason === 'page'
      || payload.reason === 'scroll'
      || payload.reason === 'restore'
      || payload.reason === 'unknown';
    return isFiniteInteger(payload.page, 1)
      && isFiniteInteger(payload.totalPages, 1)
      && payload.page <= payload.totalPages
      && validReason
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'LOAD_PROGRESS') {
    return isFiniteNumber(payload.progress, 0) && payload.progress <= 1
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'SCALE_CHANGED') {
    return isFiniteNumber(payload.scale, 0.5) && payload.scale <= 4
      && (payload.gestureMs === undefined || isFiniteInteger(payload.gestureMs, 0))
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'RUNTIME_METRICS') {
    return isFiniteInteger(payload.openMs, 0)
      && isFiniteInteger(payload.pagesLoaded, 0)
      && isFiniteInteger(payload.rangeBytes, 0)
      && isFiniteInteger(payload.rangeBinaryRequests, 0)
      && isFiniteInteger(payload.rangeBridgeRequests, 0)
      && isFiniteInteger(payload.rangeRejected, 0)
      && isFiniteInteger(payload.rangeRequests, 0)
      && isFiniteInteger(payload.rangeTimeouts, 0)
      && isFiniteNumber(payload.scale, 0.5)
      && payload.scale <= 4
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'VOLUME_SCROLL_METRICS') {
    return isFiniteInteger(payload.durationMs, 0)
      && isFiniteInteger(payload.frames, 0)
      && isFiniteNumber(payload.maxFrameMs, 0)
      && isFiniteInteger(payload.slowFrames, 0)
      && payload.slowFrames <= payload.frames
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'PERFORMANCE_METRIC') {
    const validStage = payload.stage === 'document-opened'
      || payload.stage === 'preview-visible'
      || payload.stage === 'final-ready'
      || payload.stage === 'layers-ready';
    return validStage
      && isFiniteInteger(payload.elapsedMs, 0)
      && isFiniteInteger(payload.page, 1)
      && (payload.navigationMs === undefined || isFiniteInteger(payload.navigationMs, 0))
      && (payload.preloadHit === undefined || typeof payload.preloadHit === 'boolean')
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'SINGLE_TAP') {
    return isFiniteInteger(payload.page, 1)
      && isFiniteNumber(payload.x, 0)
      && isFiniteNumber(payload.y, 0)
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'LINK_PRESSED') {
    return typeof payload.url === 'string' ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'READ_RANGE') {
    return typeof payload.bookId === 'string'
      && typeof payload.requestId === 'string'
      && isFiniteInteger(payload.begin, 0)
      && isFiniteInteger(payload.end, 1)
      && payload.end > payload.begin
      ? value as PdfWebBridgeEvent : null;
  }
  if (value.type === 'CENTER_TAP') return value as PdfWebBridgeEvent;
  if (value.type === 'ERROR') {
    return typeof payload.code === 'string' && typeof payload.message === 'string'
      ? value as PdfWebBridgeEvent : null;
  }
  return null;
}
