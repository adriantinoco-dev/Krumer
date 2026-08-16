export type ThemeName = 'dark' | 'light' | 'sepia';

export type ThemeTokens = {
  name: ThemeName;
  bg: string;
  surface: string;
  card: string;
  cardHover: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
};

export const themes: Record<ThemeName, ThemeTokens> = {
  dark: {
    name: 'dark',
    bg: '#111111',
    surface: '#161616',
    card: '#202020',
    cardHover: '#262626',
    border: '#2e2e2e',
    textPrimary: '#f1f1f1',
    textSecondary: '#cccccc',
    textMuted: '#888888',
    accent: '#f97316',
    accentMuted: '#f9731622',
  },
  light: {
    name: 'light',
    bg: '#ffffff',
    surface: '#f5f5f5',
    card: '#ffffff',
    cardHover: '#ececec',
    border: '#e0e0e0',
    textPrimary: '#1a1a1a',
    textSecondary: '#4a4a4a',
    textMuted: '#777777',
    accent: '#f97316',
    accentMuted: '#f9731622',
  },
  sepia: {
    name: 'sepia',
    bg: '#f4ecd8',
    surface: '#ece2c8',
    card: '#f0e6cc',
    cardHover: '#e6dab8',
    border: '#d8c9a3',
    textPrimary: '#3b2f1e',
    textSecondary: '#5c4c33',
    textMuted: '#8a7a5c',
    accent: '#f97316',
    accentMuted: '#f9731622',
  },
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
};

export const TABLET_BREAKPOINT = 600;