/**
 * Fuzzy search utilities for flexible book matching.
 *
 * Handles:
 * - Accent/diacritic insensitivity  ("ladrão" matches "ladrao")
 * - Punctuation/hyphen removal      ("X-Men" matches "xmen")
 * - Case insensitivity
 * - Multiple whitespace collapsing
 */

/**
 * Normalizes a string for fuzzy comparison by:
 * 1. Converting to lowercase
 * 2. Decomposing Unicode and stripping combining diacritical marks (accents)
 * 3. Removing all non-alphanumeric characters (hyphens, dots, punctuation)
 * 4. Collapsing multiple spaces into one and trimming
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                        // decompose: "é" → "e" + combining accent
    .replace(/[\u0300-\u036f]/g, '')         // strip combining marks
    .replace(/[^a-z0-9\s]/g, '')            // remove punctuation, hyphens, dots, etc.
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim();
}

/**
 * Checks if `text` fuzzy-contains the `query`.
 * Both sides are normalized before comparison.
 */
export function fuzzyMatch(text: string, query: string): boolean {
  return normalize(text).includes(normalize(query));
}
