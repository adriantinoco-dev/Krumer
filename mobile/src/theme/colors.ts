export const colors = {
  dark: {
    background: '#111111',
    surface: '#1a1a1a',
    surfaceElevated: '#242424',
    text: '#f2f2f2',
    textMuted: '#a6a6a6',
    border: '#333333',
    accent: '#d6b56d',
  },
  light: {
    background: '#f7f7f4',
    surface: '#ffffff',
    surfaceElevated: '#f0f0eb',
    text: '#1e1e1e',
    textMuted: '#666666',
    border: '#dddddd',
    accent: '#8a6424',
  },
  sepia: {
    background: '#f3ead8',
    surface: '#fff7e8',
    surfaceElevated: '#eadfc8',
    text: '#2a2118',
    textMuted: '#756856',
    border: '#d8c7a5',
    accent: '#8c5d24',
  },
};

export type ThemeName = keyof typeof colors;

