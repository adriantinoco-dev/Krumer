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
  starEmpty: string;
  cardShadowStack: string;
  cardBorder3D: string;
};

export const themes: Record<ThemeName, ThemeTokens> = {
  dark: {
    name: 'dark',
    bg: '#111111',
    surface: '#3d3d3dff',
    card: '#202020',
    cardHover: '#262626',
    border: '#2e2e2e',
    textPrimary: '#f1f1f1',
    textSecondary: '#cccccc',
    textMuted: '#888888',
    accent: '#f97316',
    accentMuted: '#f9731622',
    starEmpty: '#6b6b6b',
    cardShadowStack: '#222222',
    cardBorder3D: '#464545',
  },
  light: {
    name: 'light',
    bg: '#ffffff',
    surface: '#b2b2b2ff',
    card: '#ffffff',
    cardHover: '#ececec',
    border: '#e0e0e0',
    textPrimary: '#1a1a1a',
    textSecondary: '#4a4a4a',
    textMuted: '#777777',
    accent: '#f97316',
    accentMuted: '#f9731622',
    starEmpty: '#a8acb5',
    cardShadowStack: '#000000',
    cardBorder3D: '#000000',
  },
  sepia: {
    name: 'sepia',
    bg: '#f4ecd8ff',
    surface: '#b5ae9eff',
    card: '#f0e6cc',
    cardHover: '#e6dab8',
    border: '#d8c9a3',
    textPrimary: '#3b2f1e',
    textSecondary: '#5c4c33',
    textMuted: '#8a7a5c',
    accent: '#f97316',
    accentMuted: '#f9731622',
    starEmpty: '#a89060',
    cardShadowStack: '#2a2014',
    cardBorder3D: '#2a2014',
  },
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
};

export function coverShadow(themeName: ThemeName): string {
  if (themeName === 'light') return '0 3px 10px rgba(0, 0, 0, 0.16)';
  if (themeName === 'sepia') return '0 3px 10px rgba(90, 60, 30, 0.22)';
  return '0 2px 6px rgba(0, 0, 0, 0.35)';
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
};

export const TABLET_BREAKPOINT = 600;