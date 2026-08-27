export type ReaderLayoutSettings = {
  marginHorizontal: number;
  useBookMargins: boolean;
};

export const DEFAULT_READER_LAYOUT_SETTINGS: ReaderLayoutSettings = {
  marginHorizontal: 20,
  useBookMargins: true,
};

export function parseReaderLayoutSettings(value: unknown): ReaderLayoutSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ReaderLayoutSettings>;
  if (typeof candidate.useBookMargins !== 'boolean') return null;
  if (
    typeof candidate.marginHorizontal !== 'number'
    || !Number.isFinite(candidate.marginHorizontal)
    || candidate.marginHorizontal < 0
    || candidate.marginHorizontal > 48
  ) return null;
  return {
    marginHorizontal: Math.round(candidate.marginHorizontal / 4) * 4,
    useBookMargins: candidate.useBookMargins,
  };
}
