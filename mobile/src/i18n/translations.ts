export type LanguageCode = 'en' | 'pt-br' | 'es';

export type TranslationKey =
  | 'about.credits'
  | 'about.github'
  | 'about.licenses'
  | 'api.configured'
  | 'api.key'
  | 'api.metadataSubtitle'
  | 'api.metadataTitle'
  | 'api.noKey'
  | 'api.placeholder'
  | 'common.done'
  | 'common.continue'
  | 'common.save'
  | 'common.setupLater'
  | 'general.booksFolder'
  | 'general.folder'
  | 'general.noFolder'
  | 'general.selectFolder'
  | 'language.label'
  | 'language.select'
  | 'library.empty'
  | 'library.emptyHint'
  | 'library.title'
  | 'lists.books'
  | 'lists.empty'
  | 'lists.emptyHint'
  | 'lists.favorites'
  | 'lists.read'
  | 'lists.series'
  | 'lists.title'
  | 'lists.toRead'
  | 'lists.unread'
  | 'onboarding.setup'
  | 'reader.bookmarks'
  | 'reader.chapters'
  | 'reader.fontSize'
  | 'reader.readingSettings'
  | 'reader.spacing'
  | 'scan.action'
  | 'scan.scanning'
  | 'settings.about'
  | 'settings.apiKey'
  | 'settings.general'
  | 'settings.keySaved'
  | 'settings.language'
  | 'settings.theme'
  | 'settings.title'
  | 'tab.library'
  | 'tab.lists'
  | 'tab.settings'
  | 'theme.dark'
  | 'theme.label'
  | 'theme.light'
  | 'theme.sepia';

type Dictionary = Record<TranslationKey, string>;

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const languages: Array<{ code: LanguageCode; label: string; name: string }> = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'pt-br', label: 'PT', name: 'Português' },
  { code: 'es', label: 'ES', name: 'Español' },
];

export const translations: Record<LanguageCode, Dictionary> = {
  en: {
    'about.credits': 'Personal library manager by adriantinoco-dev.',
    'about.github': 'GitHub',
    'about.licenses': 'Licenses',
    'api.configured': 'Key configured',
    'api.key': 'Gemini API Key',
    'api.metadataSubtitle': 'Add your Gemini API key to enable automatic metadata fetching.',
    'api.metadataTitle': 'Metadata Search',
    'api.noKey': 'No key configured.',
    'api.placeholder': 'Paste your key here',
    'common.done': 'Done!',
    'common.continue': 'Continue',
    'common.save': 'Save',
    'common.setupLater': 'Set up later',
    'general.booksFolder': 'Books folder',
    'general.folder': 'Folder',
    'general.noFolder': 'No folder selected',
    'general.selectFolder': 'Select folder',
    'language.label': 'Language',
    'language.select': 'Select Language',
    'library.empty': 'No books yet.',
    'library.emptyHint': 'Go to Settings > General to select your library folder.',
    'library.title': 'Library',
    'lists.books': 'books',
    'lists.empty': 'No lists yet.',
    'lists.emptyHint': 'Tap + to create your first list.',
    'lists.favorites': 'Favorites',
    'lists.read': 'Read',
    'lists.series': 'Series / Manga',
    'lists.title': 'Lists',
    'lists.toRead': 'To Read',
    'lists.unread': 'Unread',
    'onboarding.setup': 'Set up Krumer',
    'reader.bookmarks': 'Bookmarks',
    'reader.chapters': 'Go to chapter',
    'reader.fontSize': 'Font size',
    'reader.readingSettings': 'Reading settings',
    'reader.spacing': 'Spacing',
    'scan.action': 'Scan',
    'scan.scanning': 'Scanning',
    'settings.about': 'About',
    'settings.apiKey': 'API Key',
    'settings.general': 'General',
    'settings.keySaved': 'Key saved.',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.title': 'Settings',
    'tab.library': 'Library',
    'tab.lists': 'Lists',
    'tab.settings': 'Settings',
    'theme.dark': 'Dark',
    'theme.label': 'Theme',
    'theme.light': 'Light',
    'theme.sepia': 'Sepia',
  },
  'pt-br': {
    'about.credits': 'Gerenciador de biblioteca pessoal por adriantinoco-dev.',
    'about.github': 'GitHub',
    'about.licenses': 'Licenças',
    'api.configured': 'Chave configurada',
    'api.key': 'Chave da API Gemini',
    'api.metadataSubtitle': 'Adicione sua chave de API do Gemini para buscar metadados automaticamente.',
    'api.metadataTitle': 'Busca de Metadados',
    'api.noKey': 'Nenhuma chave configurada.',
    'api.placeholder': 'Cole sua chave aqui',
    'common.done': 'Concluído!',
    'common.continue': 'Continuar',
    'common.save': 'Salvar',
    'common.setupLater': 'Configurar mais tarde',
    'general.booksFolder': 'Pasta de livros',
    'general.folder': 'Pasta',
    'general.noFolder': 'Nenhuma pasta selecionada',
    'general.selectFolder': 'Selecionar pasta',
    'language.label': 'Idioma',
    'language.select': 'Selecionar idioma',
    'library.empty': 'Nenhum livro ainda.',
    'library.emptyHint': 'Vá em Configurações > Geral para selecionar a pasta da sua biblioteca.',
    'library.title': 'Biblioteca',
    'lists.books': 'livros',
    'lists.empty': 'Nenhuma lista ainda.',
    'lists.emptyHint': 'Toque em + para criar sua primeira lista.',
    'lists.favorites': 'Favoritos',
    'lists.read': 'Lidos',
    'lists.series': 'Séries / Mangás',
    'lists.title': 'Listas',
    'lists.toRead': 'Para ler',
    'lists.unread': 'Não lidos',
    'onboarding.setup': 'Configurar Krumer',
    'reader.bookmarks': 'Marcadores',
    'reader.chapters': 'Ir para capítulo',
    'reader.fontSize': 'Tamanho da fonte',
    'reader.readingSettings': 'Configurações de leitura',
    'reader.spacing': 'Espaçamento',
    'scan.action': 'Escanear',
    'scan.scanning': 'Escaneando',
    'settings.about': 'Sobre',
    'settings.apiKey': 'Chave de API',
    'settings.general': 'Geral',
    'settings.keySaved': 'Chave salva.',
    'settings.language': 'Idioma',
    'settings.theme': 'Tema',
    'settings.title': 'Configurações',
    'tab.library': 'Biblioteca',
    'tab.lists': 'Listas',
    'tab.settings': 'Configurações',
    'theme.dark': 'Escuro',
    'theme.label': 'Tema',
    'theme.light': 'Claro',
    'theme.sepia': 'Sépia',
  },
  es: {
    'about.credits': 'Gestor de biblioteca personal por adriantinoco-dev.',
    'about.github': 'GitHub',
    'about.licenses': 'Licencias',
    'api.configured': 'Clave configurada',
    'api.key': 'Clave API Gemini',
    'api.metadataSubtitle': 'Agrega tu clave API de Gemini para buscar metadatos automáticamente.',
    'api.metadataTitle': 'Búsqueda de Metadatos',
    'api.noKey': 'No hay clave configurada.',
    'api.placeholder': 'Pega tu clave aquí',
    'common.done': 'Listo!',
    'common.continue': 'Continuar',
    'common.save': 'Guardar',
    'common.setupLater': 'Configurar más tarde',
    'general.booksFolder': 'Carpeta de libros',
    'general.folder': 'Carpeta',
    'general.noFolder': 'Ninguna carpeta seleccionada',
    'general.selectFolder': 'Seleccionar carpeta',
    'language.label': 'Idioma',
    'language.select': 'Seleccionar idioma',
    'library.empty': 'Aún no hay libros.',
    'library.emptyHint': 'Ve a Configuración > General para seleccionar la carpeta de tu biblioteca.',
    'library.title': 'Biblioteca',
    'lists.books': 'libros',
    'lists.empty': 'Aún no hay listas.',
    'lists.emptyHint': 'Toca + para crear tu primera lista.',
    'lists.favorites': 'Favoritos',
    'lists.read': 'Leídos',
    'lists.series': 'Series / Mangas',
    'lists.title': 'Listas',
    'lists.toRead': 'Por leer',
    'lists.unread': 'No leídos',
    'onboarding.setup': 'Configurar Krumer',
    'reader.bookmarks': 'Marcadores',
    'reader.chapters': 'Ir al capítulo',
    'reader.fontSize': 'Tamaño de fuente',
    'reader.readingSettings': 'Configuración de lectura',
    'reader.spacing': 'Espaciado',
    'scan.action': 'Escanear',
    'scan.scanning': 'Escaneando',
    'settings.about': 'Acerca de',
    'settings.apiKey': 'Clave API',
    'settings.general': 'General',
    'settings.keySaved': 'Clave guardada.',
    'settings.language': 'Idioma',
    'settings.theme': 'Tema',
    'settings.title': 'Configuración',
    'tab.library': 'Biblioteca',
    'tab.lists': 'Listas',
    'tab.settings': 'Configuración',
    'theme.dark': 'Oscuro',
    'theme.label': 'Tema',
    'theme.light': 'Claro',
    'theme.sepia': 'Sepia',
  },
};

export function translate(language: LanguageCode, key: TranslationKey) {
  return translations[language]?.[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
}

