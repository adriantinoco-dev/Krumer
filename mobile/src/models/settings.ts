export type SettingMap = Record<string, string | null>;

export type LocalPreferences = {
  apiBaseUrl?: string;
  language?: string;
  theme?: 'dark' | 'light' | 'sepia';
  chapterViewMode?: 'title' | 'title+cover';
};

