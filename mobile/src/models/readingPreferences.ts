export type DisplayMode = 'scroll' | 'paginated';
export type ReaderOrientation = 'free' | 'landscape' | 'portrait';
export type ReadingFontFamily = 'serif' | 'sans' | 'mono';
export type ReadingFontWeight = 'light' | 'regular' | 'medium' | 'bold';

export type ReadingPreferences = {
  displayMode: DisplayMode;
  doubleColumn: boolean;
  orientation: ReaderOrientation;
  fontFamily: ReadingFontFamily;
  fontWeight: ReadingFontWeight;
};

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  displayMode: 'paginated',
  doubleColumn: false,
  orientation: 'portrait',
  fontFamily: 'serif',
  fontWeight: 'regular',
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
  return {
    displayMode: candidate.displayMode,
    doubleColumn: candidate.doubleColumn,
    orientation: candidate.orientation ?? DEFAULT_READING_PREFERENCES.orientation,
    fontFamily: candidate.fontFamily,
    fontWeight: candidate.fontWeight,
  };
}
