export type DisplayMode = 'scroll' | 'paginated';
export type ReaderOrientation = 'free' | 'landscape' | 'portrait';
export type ReadingFontFamily = 'serif' | 'sans' | 'mono';
export type ReadingFontWeight = 'light' | 'regular' | 'medium' | 'bold';
export type SelectionQuickAction = 'off' | 'copy' | 'highlight';
export type ReaderHighlightColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple';

export const READER_HIGHLIGHT_PALETTE: ReadonlyArray<{
  color: ReaderHighlightColor;
  fill: string;
}> = [
  { color: 'red', fill: '#f87171' },
  { color: 'yellow', fill: '#f8d95e' },
  { color: 'green', fill: '#4ade80' },
  { color: 'blue', fill: '#60a5fa' },
  { color: 'purple', fill: '#a78bfa' },
];

export type ReadingPreferences = {
  displayMode: DisplayMode;
  doubleColumn: boolean;
  orientation: ReaderOrientation;
  fontFamily: ReadingFontFamily;
  fontWeight: ReadingFontWeight;
  selectionQuickAction: SelectionQuickAction;
  highlightColor: ReaderHighlightColor;
};

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  displayMode: 'paginated',
  doubleColumn: false,
  orientation: 'portrait',
  fontFamily: 'serif',
  fontWeight: 'regular',
  selectionQuickAction: 'off',
  highlightColor: 'yellow',
};

export function parseReadingPreferences(value: unknown): ReadingPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ReadingPreferences>;
  if (candidate.displayMode !== 'scroll' && candidate.displayMode !== 'paginated') return null;
  if (typeof candidate.doubleColumn !== 'boolean') return null;
  if (
    candidate.orientation !== undefined
    && candidate.orientation !== 'free'
    && candidate.orientation !== 'landscape'
    && candidate.orientation !== 'portrait'
  ) return null;
  if (candidate.fontFamily !== 'serif' && candidate.fontFamily !== 'sans' && candidate.fontFamily !== 'mono') return null;
  if (
    candidate.fontWeight !== 'light'
    && candidate.fontWeight !== 'regular'
    && candidate.fontWeight !== 'medium'
    && candidate.fontWeight !== 'bold'
  ) return null;
  if (candidate.selectionQuickAction !== undefined
    && candidate.selectionQuickAction !== 'off'
    && candidate.selectionQuickAction !== 'copy'
    && candidate.selectionQuickAction !== 'highlight') return null;
  if (candidate.highlightColor !== undefined
    && candidate.highlightColor !== 'red'
    && candidate.highlightColor !== 'yellow'
    && candidate.highlightColor !== 'green'
    && candidate.highlightColor !== 'blue'
    && candidate.highlightColor !== 'purple') return null;
  return {
    displayMode: candidate.displayMode,
    doubleColumn: candidate.doubleColumn,
    orientation: candidate.orientation ?? DEFAULT_READING_PREFERENCES.orientation,
    fontFamily: candidate.fontFamily,
    fontWeight: candidate.fontWeight,
    selectionQuickAction: candidate.selectionQuickAction ?? 'off',
    highlightColor: candidate.highlightColor ?? 'yellow',
  };
}
