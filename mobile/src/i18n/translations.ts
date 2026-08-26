export type LanguageCode = 'en' | 'pt-br' | 'es';

export type TranslationKey =
  | 'about.credits'
  | 'about.github'
  | 'about.licenses'
  | 'api.configured'
  | 'api.help'
  | 'api.key'
  | 'api.metadataSubtitle'
  | 'api.metadataTitle'
  | 'api.noKey'
  | 'api.placeholder'
  | 'api.yourKey'
  | 'auth.account'
  | 'auth.accountCreated'
  | 'auth.checkEmailConfirmation'
  | 'auth.checkEmailMagic'
  | 'auth.checkEmailRecovery'
  | 'auth.confirmPassword'
  | 'auth.confirmPasswordPlaceholder'
  | 'auth.email'
  | 'auth.emailConfirmed'
  | 'auth.emailNotConfirmed'
  | 'auth.emailPlaceholder'
  | 'auth.forgotPassword'
  | 'auth.genericError'
  | 'auth.googleBrowserOpened'
  | 'auth.googleSignIn'
  | 'auth.magicLink'
  | 'auth.newPassword'
  | 'auth.orEmail'
  | 'auth.password'
  | 'auth.passwordPlaceholder'
  | 'auth.passwordsMismatch'
  | 'auth.passwordUpdated'
  | 'auth.recoveryReady'
  | 'auth.signIn'
  | 'auth.signOut'
  | 'auth.signUp'
  | 'auth.signedIn'
  | 'auth.signedInAs'
  | 'auth.signedOut'
  | 'auth.subtitle'
  | 'auth.updatePassword'
  | 'auth.working'
  | 'common.cancel'
  | 'common.delete'
  | 'common.done'
  | 'common.continue'
  | 'common.save'
  | 'common.setupLater'
  | 'details.authorInput'
  | 'details.changeCover'
  | 'details.chapters'
  | 'details.editMetadata'
  | 'details.fileSize'
  | 'details.format'
  | 'details.markAsRead'
  | 'details.markAsUnread'
  | 'details.noSynopsis'
  | 'details.pagesInput'
  | 'details.progress'
  | 'details.rating'
  | 'details.readNow'
  | 'details.restoreCover'
  | 'details.synopsis'
  | 'details.synopsisInput'
  | 'details.tags'
  | 'details.tagsHint'
  | 'details.tagsInput'
  | 'details.title'
  | 'details.titleInput'
  | 'details.year'
  | 'details.yearInput'
  | 'general.booksFolder'
  | 'general.folder'
  | 'general.noFolder'
  | 'general.selectFolder'
  | 'language.label'
  | 'language.select'
  | 'library.empty'
  | 'library.emptyHint'
  | 'library.title'
  | 'library.unknownAuthor'
  | 'library.continueReading'
  | 'library.items'
  | 'library.volumesShort'
  | 'library.search'
  | 'library.sortBy'
  | 'library.sortName'
  | 'library.sortRecent'
  | 'library.sortRating'
  | 'library.sortProgress'
  | 'library.statsTotal'
  | 'library.noResults'
  | 'library.noResultsHint'
  | 'lists.addToList'
  | 'lists.bookActions'
  | 'lists.books'
  | 'lists.create'
  | 'lists.delete'
  | 'lists.deleteConfirm'
  | 'lists.empty'
  | 'lists.emptyHint'
  | 'lists.emptyList'
  | 'lists.favorites'
  | 'lists.manageBooks'
  | 'lists.namePlaceholder'
  | 'lists.noCustomLists'
  | 'lists.read'
  | 'lists.rename'
  | 'lists.series'
  | 'lists.title'
  | 'lists.toRead'
  | 'lists.unread'
  | 'onboarding.setup'
  | 'reader.addBookmark'
  | 'reader.bookmarks'
  | 'reader.chapters'
  | 'reader.fontSize'
  | 'reader.nextPage'
  | 'reader.noBookmarks'
  | 'reader.page'
  | 'reader.pdfWebUnavailableDescription'
  | 'reader.pdfWebUnavailableTitle'
  | 'reader.readingSettings'
  | 'reader.removeBookmark'
  | 'reader.resetDefaults'
  | 'reader.previousPage'
  | 'reader.spacing'
  | 'scan.action'
  | 'scan.scanning'
  | 'settings.about'
  | 'settings.apiKey'
  | 'settings.booksPerRow'
  | 'settings.booksPerRowValue'
  | 'settings.general'
  | 'settings.keySaved'
  | 'settings.language'
  | 'settings.sectionAbout'
  | 'settings.sectionAppearance'
  | 'settings.sectionIntegrations'
  | 'settings.sectionLibrary'
  | 'settings.syncDesc'
  | 'settings.syncTitle'
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
    'api.help': 'Get a free key at aistudio.google.com. Used only for book metadata lookup - never stored in the cloud.',
    'api.key': 'Gemini API Key',
    'api.metadataSubtitle': 'Add your Gemini API key to enable automatic metadata fetching.',
    'api.metadataTitle': 'Metadata Search',
    'api.noKey': 'No key configured.',
    'api.placeholder': 'Paste your key here',
    'api.yourKey': 'Your key',
    'auth.account': 'Account',
    'auth.accountCreated': 'Account created and signed in.',
    'auth.checkEmailConfirmation': 'Account created. Check your email to confirm your registration.',
    'auth.checkEmailMagic': 'Sign-in link sent. Check your email.',
    'auth.checkEmailRecovery': 'Recovery link sent. Check your email.',
    'auth.confirmPassword': 'Confirm password',
    'auth.confirmPasswordPlaceholder': 'Enter the password again',
    'auth.email': 'Email',
    'auth.emailConfirmed': 'Email confirmed',
    'auth.emailNotConfirmed': 'Email confirmation pending',
    'auth.emailPlaceholder': 'you@example.com',
    'auth.forgotPassword': 'Forgot password',
    'auth.genericError': 'Authentication could not be completed.',
    'auth.googleBrowserOpened': 'Your browser is open. Choose your Google account to finish signing in.',
    'auth.googleSignIn': 'Continue with Google',
    'auth.magicLink': 'Email me a sign-in link',
    'auth.newPassword': 'New password',
    'auth.orEmail': 'or continue with email',
    'auth.password': 'Password',
    'auth.passwordPlaceholder': 'At least 6 characters',
    'auth.passwordsMismatch': 'The passwords do not match.',
    'auth.passwordUpdated': 'Password changed successfully.',
    'auth.recoveryReady': 'Set a new password to finish account recovery.',
    'auth.signIn': 'Sign in',
    'auth.signOut': 'Sign out',
    'auth.signUp': 'Create account',
    'auth.signedIn': 'Signed in successfully.',
    'auth.signedInAs': 'Signed in as',
    'auth.signedOut': 'Signed out',
    'auth.subtitle': 'Sign in to prepare library sync across your devices.',
    'auth.updatePassword': 'Change password',
    'auth.working': 'Please wait…',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.done': 'Done!',
    'common.continue': 'Continue',
    'common.save': 'Save',
    'common.setupLater': 'Set up later',
    'details.authorInput': 'Author',
    'details.changeCover': 'Change Cover',
    'details.chapters': 'Chapters / Volumes',
    'details.editMetadata': 'Edit Details',
    'details.fileSize': 'File Size',
    'details.format': 'Format',
    'details.markAsRead': 'Mark as Read',
    'details.markAsUnread': 'Mark as Unread',
    'details.noSynopsis': 'No synopsis available.',
    'details.pagesInput': 'Total Pages',
    'details.progress': 'Progress',
    'details.rating': 'Rating',
    'details.readNow': 'Read Now',
    'details.restoreCover': 'Restore Original Cover',
    'details.synopsis': 'Synopsis',
    'details.synopsisInput': 'Synopsis',
    'details.tags': 'Tags',
    'details.tagsHint': 'Separate tags with commas',
    'details.tagsInput': 'Tags (comma separated)',
    'details.title': 'Book Details',
    'details.titleInput': 'Title',
    'details.year': 'Year',
    'details.yearInput': 'Year',
    'general.booksFolder': 'Books folder',
    'general.folder': 'Folder',
    'general.noFolder': 'No folder selected',
    'general.selectFolder': 'Select folder',
    'language.label': 'Language',
    'language.select': 'Select Language',
'library.empty': 'No books yet.',
    'library.emptyHint': 'Go to Settings > General to select your library folder.',
    'library.title': 'Library',
    'library.unknownAuthor': 'Unknown author',
    'library.continueReading': 'Continue Reading',
    'library.items': 'items',
    'library.volumesShort': "vol's",
    'library.search': 'Search title or author…',
    'library.sortBy': 'Sort',
    'library.sortName': 'Title',
    'library.sortRecent': 'Recent',
    'library.sortRating': 'Rating',
    'library.sortProgress': 'Progress',
    'library.statsTotal': 'Total',
    'library.noResults': 'No results.',
    'library.noResultsHint': 'Try a different search term.',
    'lists.addToList': 'Add to list',
    'lists.bookActions': 'Actions',
    'lists.books': 'books',
    'lists.create': 'Create list',
    'lists.delete': 'Delete list',
    'lists.deleteConfirm': 'Are you sure you want to delete this list?',
    'lists.empty': 'No lists yet.',
    'lists.emptyHint': 'Tap + to create your first list.',
    'lists.emptyList': 'No books in this list.',
    'lists.favorites': 'Favorites',
    'lists.manageBooks': 'Manage books',
    'lists.namePlaceholder': 'List name',
    'lists.noCustomLists': 'No custom lists yet. Create one in Lists tab.',
    'lists.read': 'Read',
    'lists.rename': 'Rename list',
    'lists.series': 'Series / Manga',
    'lists.title': 'Lists',
    'lists.toRead': 'To Read',
    'lists.unread': 'Unread',
    'onboarding.setup': 'Set up Krumer',
    'reader.addBookmark': 'Add bookmark',
    'reader.bookmarks': 'Bookmarks',
    'reader.chapters': 'Go to chapter',
    'reader.fontSize': 'Font size',
    'reader.nextPage': 'Next page',
    'reader.noBookmarks': 'No bookmarks yet.',
    'reader.page': 'Page',
    'reader.pdfWebUnavailableDescription':
      'PDF reading uses a native module (react-native-pdf) and does not work in the browser. Open on Android to read this file.',
    'reader.pdfWebUnavailableTitle': 'PDF unavailable on web',
    'reader.readingSettings': 'Reading settings',
    'reader.removeBookmark': 'Remove bookmark',
    'reader.resetDefaults': 'Reset to defaults',
    'reader.previousPage': 'Previous page',
    'reader.spacing': 'Spacing',
    'scan.action': 'Scan',
    'scan.scanning': 'Scanning',
    'settings.about': 'About',
    'settings.apiKey': 'API Key',
    'settings.booksPerRow': 'Books per row',
    'settings.booksPerRowValue': '{0} per row',
    'settings.general': 'General',
    'settings.keySaved': 'Key saved.',
    'settings.language': 'Language',
    'settings.sectionAbout': 'ABOUT',
    'settings.sectionAppearance': 'APPEARANCE',
    'settings.sectionIntegrations': 'INTEGRATIONS',
    'settings.sectionLibrary': 'LIBRARY',
    'settings.syncDesc': 'Sign in to keep your library and reading progress in sync.',
    'settings.syncTitle': 'Sync across devices',
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
    'api.help': 'Obtenha uma chave gratuita em aistudio.google.com. Usada apenas para busca de metadados - nunca armazenada na nuvem.',
    'api.key': 'Chave da API Gemini',
    'api.metadataSubtitle': 'Adicione sua chave de API do Gemini para buscar metadados automaticamente.',
    'api.metadataTitle': 'Busca de Metadados',
    'api.noKey': 'Nenhuma chave configurada.',
    'api.placeholder': 'Cole sua chave aqui',
    'api.yourKey': 'Sua chave',
    'auth.account': 'Conta',
    'auth.accountCreated': 'Conta criada e conectada.',
    'auth.checkEmailConfirmation': 'Conta criada. Confira seu email para confirmar o cadastro.',
    'auth.checkEmailMagic': 'Link de acesso enviado. Confira seu email.',
    'auth.checkEmailRecovery': 'Link de recuperação enviado. Confira seu email.',
    'auth.confirmPassword': 'Confirmar senha',
    'auth.confirmPasswordPlaceholder': 'Digite a senha novamente',
    'auth.email': 'Email',
    'auth.emailConfirmed': 'Email confirmado',
    'auth.emailNotConfirmed': 'Confirmação de email pendente',
    'auth.emailPlaceholder': 'voce@exemplo.com',
    'auth.forgotPassword': 'Esqueci minha senha',
    'auth.genericError': 'Não foi possível concluir a autenticação.',
    'auth.googleBrowserOpened': 'Navegador aberto. Escolha sua conta do Google para concluir o login.',
    'auth.googleSignIn': 'Continuar com Google',
    'auth.magicLink': 'Receber link de acesso',
    'auth.newPassword': 'Nova senha',
    'auth.orEmail': 'ou continue com email',
    'auth.password': 'Senha',
    'auth.passwordPlaceholder': 'Mínimo de 6 caracteres',
    'auth.passwordsMismatch': 'As senhas não coincidem.',
    'auth.passwordUpdated': 'Senha alterada com sucesso.',
    'auth.recoveryReady': 'Defina uma nova senha para concluir a recuperação da conta.',
    'auth.signIn': 'Entrar',
    'auth.signOut': 'Sair da conta',
    'auth.signUp': 'Criar conta',
    'auth.signedIn': 'Login realizado com sucesso.',
    'auth.signedInAs': 'Conectado como',
    'auth.signedOut': 'Conta desconectada',
    'auth.subtitle': 'Entre para preparar a sincronização da sua biblioteca entre dispositivos.',
    'auth.updatePassword': 'Alterar senha',
    'auth.working': 'Aguarde…',
    'common.cancel': 'Cancelar',
    'common.delete': 'Excluir',
    'common.done': 'Concluído!',
    'common.continue': 'Continuar',
    'common.save': 'Salvar',
    'common.setupLater': 'Configurar mais tarde',
    'details.authorInput': 'Autor',
    'details.changeCover': 'Alterar Capa',
    'details.chapters': 'Capítulos / Volumes',
    'details.editMetadata': 'Editar Metadados',
    'details.fileSize': 'Tamanho do Arquivo',
    'details.format': 'Formato',
    'details.markAsRead': 'Marcar como Lido',
    'details.markAsUnread': 'Marcar como Não Lido',
    'details.noSynopsis': 'Nenhuma sinopse disponível.',
    'details.pagesInput': 'Número de Páginas',
    'details.progress': 'Progresso',
    'details.rating': 'Avaliação',
    'details.readNow': 'Ler Agora',
    'details.restoreCover': 'Restaurar Capa Original',
    'details.synopsis': 'Sinopse',
    'details.synopsisInput': 'Sinopse',
    'details.tags': 'Tags',
    'details.tagsHint': 'Separe as tags por vírgula',
    'details.tagsInput': 'Tags (separadas por vírgula)',
    'details.title': 'Detalhes do Livro',
    'details.titleInput': 'Título',
    'details.year': 'Ano',
    'details.yearInput': 'Ano',
    'general.booksFolder': 'Pasta de livros',
    'general.folder': 'Pasta',
    'general.noFolder': 'Nenhuma pasta selecionada',
    'general.selectFolder': 'Selecionar pasta',
    'language.label': 'Idioma',
    'language.select': 'Selecionar idioma',
'library.empty': 'Nenhum livro ainda.',
    'library.emptyHint': 'Vá em Configurações > Geral para selecionar a pasta da sua biblioteca.',
    'library.title': 'Biblioteca',
    'library.unknownAuthor': 'Autor desconhecido',
    'library.continueReading': 'Continuar Lendo',
    'library.items': 'itens',
    'library.volumesShort': "vol's",
    'library.search': 'Buscar título ou autor…',
    'library.sortBy': 'Ordenar',
    'library.sortName': 'Título',
    'library.sortRecent': 'Recentes',
    'library.sortRating': 'Avaliação',
    'library.sortProgress': 'Progresso',
    'library.statsTotal': 'Total',
    'library.noResults': 'Nenhum resultado.',
    'library.noResultsHint': 'Tente outro termo de busca.',
    'lists.addToList': 'Adicionar à lista',
    'lists.bookActions': 'Ações',
    'lists.books': 'livros',
    'lists.create': 'Criar lista',
    'lists.delete': 'Excluir lista',
    'lists.deleteConfirm': 'Tem certeza que deseja excluir esta lista?',
    'lists.empty': 'Nenhuma lista ainda.',
    'lists.emptyHint': 'Toque em + para criar sua primeira lista.',
    'lists.emptyList': 'Nenhum livro nesta lista.',
    'lists.favorites': 'Favoritos',
    'lists.manageBooks': 'Gerenciar livros',
    'lists.namePlaceholder': 'Nome da lista',
    'lists.noCustomLists': 'Nenhuma lista ainda. Crie uma na aba Listas.',
    'lists.read': 'Lidos',
    'lists.rename': 'Renomear lista',
    'lists.series': 'Séries / Mangás',
    'lists.title': 'Listas',
    'lists.toRead': 'Para ler',
    'lists.unread': 'Não lidos',
    'onboarding.setup': 'Configurar Krumer',
    'reader.addBookmark': 'Adicionar marcador',
    'reader.bookmarks': 'Marcadores',
    'reader.chapters': 'Ir para capítulo',
    'reader.fontSize': 'Tamanho da fonte',
    'reader.nextPage': 'Próxima página',
    'reader.noBookmarks': 'Nenhum marcador ainda.',
    'reader.page': 'Página',
    'reader.pdfWebUnavailableDescription':
      'A leitura de PDF usa um módulo nativo (react-native-pdf) e não funciona no navegador. Abra no Android para ler este arquivo.',
    'reader.pdfWebUnavailableTitle': 'PDF indisponível na web',
    'reader.readingSettings': 'Configurações de leitura',
    'reader.removeBookmark': 'Remover marcador',
    'reader.resetDefaults': 'Restaurar padrão',
    'reader.previousPage': 'Página anterior',
    'reader.spacing': 'Espaçamento',
    'scan.action': 'Escanear',
    'scan.scanning': 'Escaneando',
    'settings.about': 'Sobre',
    'settings.apiKey': 'Chave de API',
    'settings.booksPerRow': 'Livros por linha',
    'settings.booksPerRowValue': '{0} por linha',
    'settings.general': 'Geral',
    'settings.keySaved': 'Chave salva.',
    'settings.language': 'Idioma',
    'settings.sectionAbout': 'SOBRE',
    'settings.sectionAppearance': 'APARÊNCIA',
    'settings.sectionIntegrations': 'INTEGRAÇÕES',
    'settings.sectionLibrary': 'BIBLIOTECA',
    'settings.syncDesc': 'Entre para manter sua biblioteca e progresso de leitura sincronizados.',
    'settings.syncTitle': 'Sincronizar entre dispositivos',
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
    'api.help': 'Obtén una clave gratuita en aistudio.google.com. Solo se usa para buscar metadatos - nunca se almacena en la nube.',
    'api.key': 'Clave API Gemini',
    'api.metadataSubtitle': 'Agrega tu clave API de Gemini para buscar metadatos automáticamente.',
    'api.metadataTitle': 'Búsqueda de Metadatos',
    'api.noKey': 'No hay clave configurada.',
    'api.placeholder': 'Pega tu clave aquí',
    'api.yourKey': 'Tu clave',
    'auth.account': 'Cuenta',
    'auth.accountCreated': 'Cuenta creada y conectada.',
    'auth.checkEmailConfirmation': 'Cuenta creada. Revisa tu correo para confirmar el registro.',
    'auth.checkEmailMagic': 'Enlace de acceso enviado. Revisa tu correo.',
    'auth.checkEmailRecovery': 'Enlace de recuperación enviado. Revisa tu correo.',
    'auth.confirmPassword': 'Confirmar contraseña',
    'auth.confirmPasswordPlaceholder': 'Escribe la contraseña otra vez',
    'auth.email': 'Correo electrónico',
    'auth.emailConfirmed': 'Correo confirmado',
    'auth.emailNotConfirmed': 'Confirmación de correo pendiente',
    'auth.emailPlaceholder': 'tu@ejemplo.com',
    'auth.forgotPassword': 'Olvidé mi contraseña',
    'auth.genericError': 'No se pudo completar la autenticación.',
    'auth.googleBrowserOpened': 'Se abrió el navegador. Elige tu cuenta de Google para completar el acceso.',
    'auth.googleSignIn': 'Continuar con Google',
    'auth.magicLink': 'Recibir enlace de acceso',
    'auth.newPassword': 'Nueva contraseña',
    'auth.orEmail': 'o continúa con correo electrónico',
    'auth.password': 'Contraseña',
    'auth.passwordPlaceholder': 'Mínimo 6 caracteres',
    'auth.passwordsMismatch': 'Las contraseñas no coinciden.',
    'auth.passwordUpdated': 'Contraseña cambiada correctamente.',
    'auth.recoveryReady': 'Define una nueva contraseña para completar la recuperación.',
    'auth.signIn': 'Iniciar sesión',
    'auth.signOut': 'Cerrar sesión',
    'auth.signUp': 'Crear cuenta',
    'auth.signedIn': 'Sesión iniciada correctamente.',
    'auth.signedInAs': 'Sesión iniciada como',
    'auth.signedOut': 'Sesión cerrada',
    'auth.subtitle': 'Inicia sesión para preparar la sincronización entre dispositivos.',
    'auth.updatePassword': 'Cambiar contraseña',
    'auth.working': 'Espera…',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.done': 'Listo!',
    'common.continue': 'Continuar',
    'common.save': 'Guardar',
    'common.setupLater': 'Configurar más tarde',
    'details.authorInput': 'Autor',
    'details.changeCover': 'Cambiar Portada',
    'details.chapters': 'Capítulos / Volúmenes',
    'details.editMetadata': 'Editar Metadatos',
    'details.fileSize': 'Tamaño del Archivo',
    'details.format': 'Formato',
    'details.markAsRead': 'Marcar como Leído',
    'details.markAsUnread': 'Marcar como No Leído',
    'details.noSynopsis': 'No hay sinopsis disponible.',
    'details.pagesInput': 'Número de Páginas',
    'details.progress': 'Progreso',
    'details.rating': 'Valoración',
    'details.readNow': 'Leer Ahora',
    'details.restoreCover': 'Restaurar Portada Original',
    'details.synopsis': 'Sinopsis',
    'details.synopsisInput': 'Sinopsis',
    'details.tags': 'Etiquetas',
    'details.tagsHint': 'Separa las etiquetas con comas',
    'details.tagsInput': 'Etiquetas (separadas por coma)',
    'details.title': 'Detalles del Libro',
    'details.titleInput': 'Título',
    'details.year': 'Año',
    'details.yearInput': 'Año',
    'general.booksFolder': 'Carpeta de libros',
    'general.folder': 'Carpeta',
    'general.noFolder': 'Ninguna carpeta seleccionada',
    'general.selectFolder': 'Seleccionar carpeta',
    'language.label': 'Idioma',
    'language.select': 'Seleccionar idioma',
'library.empty': 'Aún no hay libros.',
    'library.emptyHint': 'Ve a Configuración > General para seleccionar la carpeta de tu biblioteca.',
    'library.title': 'Biblioteca',
    'library.unknownAuthor': 'Autor desconocido',
    'library.continueReading': 'Seguir Leyendo',
    'library.items': 'items',
    'library.volumesShort': "vol's",
    'library.search': 'Buscar título o autor…',
    'library.sortBy': 'Ordenar',
    'library.sortName': 'Título',
    'library.sortRecent': 'Recientes',
    'library.sortRating': 'Valoración',
    'library.sortProgress': 'Progreso',
    'library.statsTotal': 'Total',
    'library.noResults': 'Sin resultados.',
    'library.noResultsHint': 'Intenta con otro término.',
    'lists.books': 'libros',
    'lists.create': 'Crear lista',
    'lists.delete': 'Eliminar lista',
    'lists.deleteConfirm': '¿Estás seguro de que deseas eliminar esta lista?',
    'lists.empty': 'Aún no hay listas.',
    'lists.emptyHint': 'Toca + para crear tu primera lista.',
    'lists.emptyList': 'No hay libros en esta lista.',
    'lists.favorites': 'Favoritos',
    'lists.addToList': 'Añadir a lista',
    'lists.bookActions': 'Acciones',
    'lists.manageBooks': 'Gestionar libros',
    'lists.namePlaceholder': 'Nombre de la lista',
    'lists.noCustomLists': 'Aún no hay listas. Crea una en la pestaña Listas.',
    'lists.read': 'Leídos',
    'lists.rename': 'Renombrar lista',
    'lists.series': 'Series / Mangas',
    'lists.title': 'Listas',
    'lists.toRead': 'Por leer',
    'lists.unread': 'No leídos',
    'onboarding.setup': 'Configurar Krumer',
    'reader.addBookmark': 'Añadir marcador',
    'reader.bookmarks': 'Marcadores',
    'reader.chapters': 'Ir al capítulo',
    'reader.fontSize': 'Tamaño de fuente',
    'reader.nextPage': 'Página siguiente',
    'reader.noBookmarks': 'Aún no hay marcadores.',
    'reader.page': 'Página',
    'reader.pdfWebUnavailableDescription':
      'La lectura de PDF usa un módulo nativo (react-native-pdf) y no funciona en el navegador. Ábrelo en Android para leer este archivo.',
    'reader.pdfWebUnavailableTitle': 'PDF no disponible en web',
    'reader.readingSettings': 'Configuración de lectura',
    'reader.removeBookmark': 'Eliminar marcador',
    'reader.resetDefaults': 'Restaurar valores predeterminados',
    'reader.previousPage': 'Página anterior',
    'reader.spacing': 'Espaciado',
    'scan.action': 'Escanear',
    'scan.scanning': 'Escaneando',
    'settings.about': 'Acerca de',
    'settings.apiKey': 'Clave API',
    'settings.booksPerRow': 'Libros por fila',
    'settings.booksPerRowValue': '{0} por fila',
    'settings.general': 'General',
    'settings.keySaved': 'Clave guardada.',
    'settings.language': 'Idioma',
    'settings.sectionAbout': 'ACERCA DE',
    'settings.sectionAppearance': 'APARIENCIA',
    'settings.sectionIntegrations': 'INTEGRACIONES',
    'settings.sectionLibrary': 'BIBLIOTECA',
    'settings.syncDesc': 'Inicia sesión para mantener tu biblioteca y progreso de lectura sincronizados.',
    'settings.syncTitle': 'Sincronizar entre dispositivos',
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

