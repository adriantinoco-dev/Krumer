export const DEFAULT_LANGUAGE = 'pt-br';

export const translations = {
  'pt-br': {
    'app.title': 'Krumer',
    'sidebar.library': 'Minha Biblioteca',
    'search.placeholder': 'Buscar por titulo ou autor...',
    'settings.title': 'Configuracoes',
    'settings.theme_dark': 'Escuro',
    'settings.theme_light': 'Claro',
    'settings.theme_sepia': 'Sepia',
    'reader.back': 'Voltar a Biblioteca',
  },
  en: {
    'app.title': 'Krumer',
    'sidebar.library': 'My Library',
    'search.placeholder': 'Search by title or author...',
    'settings.title': 'Settings',
    'settings.theme_dark': 'Dark',
    'settings.theme_light': 'Light',
    'settings.theme_sepia': 'Sepia',
    'reader.back': 'Back to Library',
  },
} as const;

export type TranslationKey = keyof typeof translations['pt-br'];

export function t(language: string, key: TranslationKey) {
  const dictionary = translations[language as keyof typeof translations] || translations[DEFAULT_LANGUAGE];
  return dictionary[key] || translations[DEFAULT_LANGUAGE][key] || key;
}

