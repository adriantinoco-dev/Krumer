import { spacing, TABLET_BREAKPOINT } from './colors';

export const CONTENT_MAX_WIDTH = 960;
export const SETTINGS_MAX_WIDTH = 720;
export const BOOK_GRID_MAX_CARD_WIDTH = 220;
export const BOOK_GRID_MIN_CARD_WIDTH = 100;
export const LIST_GRID_MIN_CARD_WIDTH = 160;
export const BOOK_GRID_FIVE_COLUMN_BREAKPOINT = 900;

export type BookGridLayout = {
  cardWidth: number;
  gridWidth: number;
  numColumns: number;
};

/**
 * Picks a comfortable default density for the available device class.
 * Phones keep three columns; tablets use four in portrait/smaller windows
 * and five once there is enough width for the larger grid.
 */
export function getDefaultBooksPerRow(windowWidth: number): number {
  const normalizedWidth = Number.isFinite(windowWidth) ? windowWidth : 0;
  if (normalizedWidth < TABLET_BREAKPOINT) return 3;
  return normalizedWidth >= BOOK_GRID_FIVE_COLUMN_BREAKPOINT ? 5 : 4;
}

/**
 * Keeps the user's preferred column count where it fits, while preventing
 * narrow phones and wide tablets from producing unusable card sizes.
 */
export function getBookGridLayout(windowWidth: number, preferredColumns?: number): BookGridLayout {
  const availableWidth = Math.max(1, windowWidth - spacing.md * 2);
  const maxColumns = Math.max(1, Math.floor(availableWidth / BOOK_GRID_MIN_CARD_WIDTH));
  const requestedColumns = Number.isFinite(preferredColumns)
    ? Math.round(preferredColumns as number)
    : getDefaultBooksPerRow(windowWidth);
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
