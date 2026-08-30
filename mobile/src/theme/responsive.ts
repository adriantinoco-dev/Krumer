import { spacing } from './colors';

export const CONTENT_MAX_WIDTH = 960;
export const SETTINGS_MAX_WIDTH = 720;
export const BOOK_GRID_MAX_CARD_WIDTH = 220;
export const BOOK_GRID_MIN_CARD_WIDTH = 100;
export const LIST_GRID_MIN_CARD_WIDTH = 160;

export type BookGridLayout = {
  cardWidth: number;
  gridWidth: number;
  numColumns: number;
};

/**
 * Keeps the user's preferred column count where it fits, while preventing
 * narrow phones and wide tablets from producing unusable card sizes.
 */
export function getBookGridLayout(windowWidth: number, preferredColumns = 3): BookGridLayout {
  const availableWidth = Math.max(1, windowWidth - spacing.md * 2);
  const maxColumns = Math.max(1, Math.floor(availableWidth / BOOK_GRID_MIN_CARD_WIDTH));
  const requestedColumns = Number.isFinite(preferredColumns) ? Math.round(preferredColumns) : 3;
  const numColumns = Math.max(1, Math.min(requestedColumns, maxColumns));
  const cardWidth = Math.min(BOOK_GRID_MAX_CARD_WIDTH, availableWidth / numColumns);

  return {
    cardWidth,
    gridWidth: Math.min(availableWidth, cardWidth * numColumns),
    numColumns,
  };
}

export function getListGridColumns(windowWidth: number): number {
  const availableWidth = Math.max(1, windowWidth - spacing.md * 2);
  const columns = Math.floor((availableWidth + spacing.md) / (LIST_GRID_MIN_CARD_WIDTH + spacing.md));
  return Math.max(2, Math.min(4, columns));
}
