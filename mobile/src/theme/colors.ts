export type ThemeName = 'dark' | 'light' | 'sepia';

export type ThemeTokens = {
  name: ThemeName;
  bg: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentMuted: string;
};

export const themes: Record<ThemeName, ThemeTokens> = {
  dark: {
    name: 'dark',
    bg: '#1a1a1a',
    surface: '#242424',
    border: '#333333',
    textPrimary: '#e8e8e8',
    textSecondary: '#888888',
    accent: '#c8a96e',
    accentMuted: '#c8a96e22',
  },
  light: {
    name: 'light',
    bg: '#f5f5f5',
    surface: '#ffffff',
    border: '#e0e0e0',
    textPrimary: '#1a1a1a',
    textSecondary: '#666666',
    accent: '#8b6914',
    accentMuted: '#8b691415',
  },
  sepia: {
    name: 'sepia',
    bg: '#f4ede3',
    surface: '#ede0cf',
    border: '#d4c4a8',
    textPrimary: '#2c1e0f',
    textSecondary: '#7a5c3a',
    accent: '#8b6914',
    accentMuted: '#8b691415',
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

