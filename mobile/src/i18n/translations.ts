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
  | 'metadata.introTitle'
  | 'metadata.introSubtitle'
  | 'metadata.introHowTitle'
  | 'metadata.introHowText'
  | 'metadata.introPrivacyTitle'
  | 'metadata.introPrivacyText'
  | 'metadata.introReviewTitle'
  | 'metadata.introReviewText'
  | 'metadata.introContinue'
  | 'metadata.keyRequiredTitle'
  | 'metadata.keyRequiredMessage'
  | 'metadata.configureKey'
  | 'metadata.searchFailedTitle'
  | 'metadata.retry'
  | 'metadata.close'
  | 'metadata.selectTitle'
  | 'metadata.processingTitle'
  | 'metadata.previewTitle'
  | 'metadata.resultsTitle'
  | 'metadata.processingHint'
  | 'metadata.searchPlaceholder'
  | 'metadata.noSearchResults'
  | 'metadata.noEligible'
  | 'metadata.selectionCounter'
  | 'metadata.available'
  | 'metadata.fetchButton'
  | 'metadata.foundCount'
  | 'metadata.found'
  | 'metadata.notFound'
  | 'metadata.applyButton'
  | 'metadata.unknown'
  | 'metadata.author'
  | 'metadata.release'
  | 'metadata.synopsis'
  | 'metadata.noSynopsis'
  | 'metadata.actionsTitle'
  | 'metadata.searchAction'
  | 'metadata.editAction'
  | 'metadata.appliedTitle'
  | 'metadata.appliedMessage'
  | 'metadata.clearAction'
  | 'metadata.clearTitle'
  | 'metadata.clearMessage'
  | 'metadata.serviceMissingKey'
  | 'metadata.batchLimit'
  | 'metadata.invalidJson'
  | 'metadata.invalidMetadata'
  | 'metadata.safetyBlocked'
  | 'metadata.invalidKey'
  | 'metadata.modelUnavailable'
  | 'metadata.rateLimit'
  | 'metadata.networkUnavailable'
  | 'metadata.timeout'
  | 'metadata.offline'
  | 'metadata.genericError'
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
  | 'auth.googleClientIdRequired'
  | 'auth.googleDevelopmentBuild'
  | 'auth.googleUnavailable'
  | 'auth.googleTokenInvalid'
  | 'auth.googleInProgress'
  | 'auth.googlePlayServicesUnavailable'
  | 'auth.supabaseGoogleUrlMissing'
  | 'auth.supabaseUrlInvalid'
  | 'auth.browserUnavailable'
  | 'auth.invalidEmail'
  | 'auth.passwordTooShort'
  | 'auth.sync'
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
  | 'common.back'
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
  | 'details.bookNotFound'
  | 'details.goBack'
  | 'details.yearExample'
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
  | 'library.clearSearch'
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
  | 'reader.columns'
  | 'reader.displayMode'
  | 'reader.doubleColumn'
  | 'reader.doubleColumnShort'
  | 'reader.doubleColumnPortraitHint'
  | 'reader.deleteNote'
  | 'reader.deleteNoteConfirm'
  | 'reader.fontBold'
  | 'reader.fontFamily'
  | 'reader.fontLight'
  | 'reader.fontMedium'
  | 'reader.fontMono'
  | 'reader.fontRegular'
  | 'reader.fontSans'
  | 'reader.fontSerif'
  | 'reader.fontSize'
  | 'reader.fontSettings'
  | 'reader.fontWeight'
  | 'reader.layoutSettings'
  | 'reader.margins'
  | 'reader.bookMargins'
  | 'reader.customMargins'
  | 'reader.horizontalMargin'
  | 'reader.nextPage'
  | 'reader.noBookmarks'
  | 'reader.topics'
  | 'reader.notes'
  | 'reader.brightness'
  | 'reader.loadingTopics'
  | 'reader.noTopics'
  | 'reader.noToc'
  | 'reader.brightnessUnavailable'
  | 'reader.noNotes'
  | 'reader.noNotesHint'
  | 'reader.newNote'
  | 'reader.note'
  | 'reader.editNoteTitle'
  | 'reader.notePageTitle'
  | 'reader.savedPage'
  | 'reader.pageUnavailable'
  | 'reader.pageWithNumber'
  | 'reader.currentPage'
  | 'reader.noteWillBeSaved'
  | 'reader.goToNotePage'
  | 'reader.editNote'
  | 'reader.writeNotePlaceholder'
  | 'reader.saveNote'
  | 'reader.createNote'
  | 'reader.epubFileNotFound'
  | 'reader.epubSizeUnknown'
  | 'reader.epubTooLarge'
  | 'reader.epubTooLargeDecoded'
  | 'reader.epubReadFailed'
  | 'reader.epubRuntimeNotReady'
  | 'reader.epubClosedBeforeFonts'
  | 'reader.epubFontLoadFailed'
  | 'reader.epubFontRegistrationTimeout'
  | 'reader.epubOpenFailed'
  | 'reader.epubWebViewUnavailable'
  | 'reader.pdfOpenFailed'
  | 'reader.page'
  | 'reader.paginationSettings'
  | 'reader.paginatedMode'
  | 'reader.pdfWebUnavailableDescription'
  | 'reader.pdfWebUnavailableTitle'
  | 'reader.readingSettings'
  | 'reader.orientation'
  | 'reader.orientationFree'
  | 'reader.orientationLandscape'
  | 'reader.orientationPortrait'
  | 'reader.removeBookmark'
  | 'reader.resetDefaults'
  | 'reader.previousPage'
  | 'reader.spacing'
  | 'reader.scrollMode'
  | 'reader.singleColumn'
  | 'reader.zoomCurrent'
  | 'reader.zoomFitPageHint'
  | 'reader.zoomFitWidthHint'
  | 'reader.zoomIn'
  | 'reader.zoomOut'
  | 'reader.zoomReset'
  | 'reader.zoomSettings'
  | 'scan.action'
  | 'scan.scanning'
  | 'settings.about'
  | 'settings.apiKey'
  | 'settings.booksPerRow'
  | 'settings.booksPerRowValue'
  | 'settings.general'
  | 'settings.keySaved'
  | 'settings.language'
  | 'settings.metadataSearch'
  | 'settings.metadataSearchSubtitle'
  | 'settings.sectionAbout'
  | 'settings.sectionAppearance'
  | 'settings.sectionIntegrations'
  | 'settings.sectionLibrary'
  | 'settings.sectionReading'
  | 'settings.pdfEngine'
  | 'settings.pdfEngineNative'
  | 'settings.pdfEngineNativeDescription'
  | 'settings.pdfEngineWebView'
  | 'settings.pdfEngineWebViewDescription'
  | 'settings.pdfEngineWebViewPending'
  | 'settings.syncDesc'
  | 'settings.syncTitle'
  | 'sync.betaAction'
  | 'sync.betaMessage'
  | 'sync.betaTitle'
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
    'metadata.introTitle': 'Find book metadata',
    'metadata.introSubtitle': 'Use Gemini to complete the details of books in your local library.',
    'metadata.introHowTitle': 'How it works',
    'metadata.introHowText': 'Krumer sends the book title to Gemini and receives a structured suggestion.',
    'metadata.introPrivacyTitle': 'Your key stays on your device',
    'metadata.introPrivacyText': 'The key is kept in secure device storage and is used only for Gemini requests.',
    'metadata.introReviewTitle': 'You stay in control',
    'metadata.introReviewText': 'Results are shown for review. Nothing changes until you confirm or save.',
    'metadata.introContinue': 'Got it, continue',
    'metadata.keyRequiredTitle': 'Gemini key required',
    'metadata.keyRequiredMessage': 'Add your Gemini API key in Settings to search for metadata.',
    'metadata.configureKey': 'Configure key',
    'metadata.searchFailedTitle': 'Metadata search failed',
    'metadata.retry': 'Try again',
    'metadata.close': 'Close',
    'metadata.selectTitle': 'Select books',
    'metadata.processingTitle': 'Finding metadata…',
    'metadata.previewTitle': 'Metadata preview',
    'metadata.resultsTitle': 'Search results',
    'metadata.processingHint': 'Requests are processed one at a time.',
    'metadata.searchPlaceholder': 'Search title or author…',
    'metadata.noSearchResults': 'No books match this search.',
    'metadata.noEligible': 'All root books already have metadata.',
    'metadata.selectionCounter': '{0} / {1} selected',
    'metadata.available': 'available',
    'metadata.fetchButton': 'Search metadata',
    'metadata.foundCount': '{0} of {1} results found',
    'metadata.found': 'Found',
    'metadata.notFound': 'Not found',
    'metadata.applyButton': 'Apply found results',
    'metadata.unknown': 'Unknown',
    'metadata.author': 'Author:',
    'metadata.release': 'Release:',
    'metadata.synopsis': 'Synopsis',
    'metadata.noSynopsis': 'No synopsis available.',
    'metadata.actionsTitle': 'Book actions',
    'metadata.searchAction': 'Find metadata',
    'metadata.editAction': 'Edit manually',
    'metadata.appliedTitle': 'Metadata updated',
    'metadata.appliedMessage': '{0} books were updated.',
    'metadata.clearAction': 'Clear metadata',
    'metadata.clearTitle': 'Clear metadata?',
    'metadata.clearMessage': 'Author, year and synopsis will be removed. The title, tags, rating, cover and reading progress will be kept.',
    'metadata.serviceMissingKey': 'Configure a Gemini API key before searching for metadata.',
    'metadata.batchLimit': 'Select at most {0} books per batch.',
    'metadata.invalidJson': 'Gemini returned an invalid JSON response.',
    'metadata.invalidMetadata': 'Gemini returned no valid metadata.',
    'metadata.safetyBlocked': 'Gemini blocked this query for safety reasons.',
    'metadata.invalidKey': 'The Gemini key is invalid or does not have permission.',
    'metadata.modelUnavailable': 'The Gemini model is unavailable.',
    'metadata.rateLimit': 'The Gemini request limit was reached. Wait and try again.',
    'metadata.networkUnavailable': 'The Gemini service is temporarily unavailable.',
    'metadata.timeout': 'The Gemini request took too long.',
    'metadata.offline': 'Could not connect to the Gemini API. Check your connection.',
    'metadata.genericError': 'Could not search for metadata.',
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
    'auth.googleClientIdRequired': 'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to enable native Google sign-in.',
    'auth.googleDevelopmentBuild': 'Google sign-in requires a development build (npx expo run:android). This native module is not available in Expo Go.',
    'auth.googleUnavailable': 'Google sign-in is unavailable in this build.',
    'auth.googleTokenInvalid': 'Google did not return a valid identity token.',
    'auth.googleInProgress': 'A Google sign-in is already in progress.',
    'auth.googlePlayServicesUnavailable': 'Google Play Services is unavailable or needs to be updated.',
    'auth.supabaseGoogleUrlMissing': 'Supabase did not return a Google authentication URL.',
    'auth.supabaseUrlInvalid': 'Supabase returned an invalid authentication URL.',
    'auth.browserUnavailable': 'No browser is available to finish signing in.',
    'auth.invalidEmail': 'Enter a valid email address.',
    'auth.passwordTooShort': 'Password must be at least 6 characters long.',
    'auth.sync': 'Sync',
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
    'common.back': 'Back',
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
    'details.bookNotFound': 'Book not found.',
    'details.goBack': 'Go back',
    'details.yearExample': 'e.g. 2024',
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
    'library.clearSearch': 'Clear search',
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
    'reader.columns': 'Columns',
    'reader.displayMode': 'Display mode',
    'reader.doubleColumn': 'Two-page spread in landscape',
    'reader.doubleColumnShort': 'Double',
    'reader.doubleColumnPortraitHint': 'It will switch to two columns when the device is in landscape.',
    'reader.deleteNote': 'Delete note',
    'reader.deleteNoteConfirm': 'Are you sure you want to delete this note?',
    'reader.fontBold': 'Bold',
    'reader.fontFamily': 'Font family',
    'reader.fontLight': 'Light',
    'reader.fontMedium': 'Medium',
    'reader.fontMono': 'Mono',
    'reader.fontRegular': 'Regular',
    'reader.fontSans': 'Sans',
    'reader.fontSerif': 'Serif',
    'reader.fontSize': 'Font size',
    'reader.fontSettings': 'Font & theme',
    'reader.fontWeight': 'Font weight',
    'reader.layoutSettings': 'Spacing & margins',
    'reader.margins': 'Margins',
    'reader.bookMargins': 'Book',
    'reader.customMargins': 'My margins',
    'reader.horizontalMargin': 'Horizontal margin',
    'reader.nextPage': 'Next page',
    'reader.noBookmarks': 'No bookmarks yet.',
    'reader.topics': 'Topics',
    'reader.notes': 'Notes',
    'reader.brightness': 'Brightness',
    'reader.loadingTopics': 'Loading topics…',
    'reader.noTopics': 'No topics are available for this book.',
    'reader.noToc': 'The table of contents was not found in the EPUB file.',
    'reader.brightnessUnavailable': 'Brightness control is not available on this device.',
    'reader.noNotes': 'No notes yet.',
    'reader.noNotesHint': 'Create a note linked to the current page.',
    'reader.newNote': 'New note',
    'reader.note': 'Note',
    'reader.editNoteTitle': 'Edit note',
    'reader.notePageTitle': 'Note page',
    'reader.savedPage': 'Saved page',
    'reader.pageUnavailable': 'Page —',
    'reader.pageWithNumber': 'Page {0}',
    'reader.currentPage': 'Current page',
    'reader.noteWillBeSaved': 'will be saved with this note',
    'reader.goToNotePage': 'Go to note page',
    'reader.editNote': 'Edit',
    'reader.writeNotePlaceholder': 'Write your note…',
    'reader.saveNote': 'Save',
    'reader.createNote': 'Create',
    'reader.epubFileNotFound': 'The EPUB file is no longer available.',
    'reader.epubSizeUnknown': 'The EPUB size could not be verified safely.',
    'reader.epubTooLarge': 'This EPUB is {0} MiB. The current reader accepts up to {1} MiB.',
    'reader.epubTooLargeDecoded': 'This EPUB exceeds the current reader limit of {0} MiB.',
    'reader.epubReadFailed': 'Could not prepare the EPUB: {0}',
    'reader.epubRuntimeNotReady': 'The EPUB reader did not respond during startup.',
    'reader.epubClosedBeforeFonts': 'The EPUB reader was closed before its fonts were registered.',
    'reader.epubFontLoadFailed': 'Could not load fonts for the EPUB reader.',
    'reader.epubFontRegistrationTimeout': 'Timed out while registering the {0} font in the EPUB.',
    'reader.epubOpenFailed': 'Could not open the EPUB.',
    'reader.epubWebViewUnavailable': 'The EPUB reader WebView could not be loaded.',
    'reader.pdfOpenFailed': 'Could not open the PDF.',
    'reader.page': 'Page',
    'reader.paginationSettings': 'Pagination',
    'reader.paginatedMode': 'Paginated',
    'reader.pdfWebUnavailableDescription':
      'PDF reading uses a native module (react-native-pdf) and does not work in the browser. Open on Android to read this file.',
    'reader.pdfWebUnavailableTitle': 'PDF unavailable on web',
    'reader.readingSettings': 'Reading settings',
    'reader.orientation': 'Orientation',
    'reader.orientationFree': 'Free',
    'reader.orientationLandscape': 'Landscape',
    'reader.orientationPortrait': 'Portrait',
    'reader.removeBookmark': 'Remove bookmark',
    'reader.resetDefaults': 'Reset to defaults',
    'reader.previousPage': 'Previous page',
    'reader.spacing': 'Spacing',
    'reader.scrollMode': 'Scroll',
    'reader.singleColumn': 'Single',
    'reader.zoomCurrent': 'Current zoom',
    'reader.zoomFitPageHint': '100% fits the whole page.',
    'reader.zoomFitWidthHint': '100% fits the page width.',
    'reader.zoomIn': 'Zoom in',
    'reader.zoomOut': 'Zoom out',
    'reader.zoomReset': 'Reset to 100%',
    'reader.zoomSettings': 'Zoom',
    'scan.action': 'Scan',
    'scan.scanning': 'Scanning',
    'settings.about': 'About',
    'settings.apiKey': 'API Key',
    'settings.booksPerRow': 'Books per row',
    'settings.booksPerRowValue': '{0} per row',
    'settings.general': 'General',
    'settings.keySaved': 'Key saved.',
    'settings.language': 'Language',
    'settings.metadataSearch': 'Find metadata',
    'settings.metadataSearchSubtitle': 'Complete missing author, year and synopsis',
    'settings.sectionAbout': 'ABOUT',
    'settings.sectionAppearance': 'APPEARANCE',
    'settings.sectionIntegrations': 'INTEGRATIONS',
    'settings.sectionLibrary': 'LIBRARY',
    'settings.sectionReading': 'READING',
    'settings.pdfEngine': 'PDF engine',
    'settings.pdfEngineNative': 'Native',
    'settings.pdfEngineNativeDescription': 'The current Android PDF reader using PDFium.',
    'settings.pdfEngineWebView': 'WebView',
    'settings.pdfEngineWebViewDescription': 'PDF.js inside a stable WebView.',
    'settings.pdfEngineWebViewPending': 'Available in the next PDF reader phase.',
    'settings.syncDesc': 'Cloud sync will be available after the beta.',
    'settings.syncTitle': 'Sync across devices',
    'sync.betaAction': 'Got it',
    'sync.betaMessage': 'Krumer is in beta. For now, cloud synchronization is not available.',
    'sync.betaTitle': 'Cloud sync unavailable in beta',
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
    'metadata.introTitle': 'Buscar metadados',
    'metadata.introSubtitle': 'Use o Gemini para completar os detalhes dos livros da sua biblioteca local.',
    'metadata.introHowTitle': 'Como funciona',
    'metadata.introHowText': 'O Krumer envia o título ao Gemini e recebe uma sugestão estruturada.',
    'metadata.introPrivacyTitle': 'Sua chave fica no dispositivo',
    'metadata.introPrivacyText': 'A chave fica no armazenamento seguro e é usada apenas nas consultas ao Gemini.',
    'metadata.introReviewTitle': 'Você mantém o controle',
    'metadata.introReviewText': 'Os resultados aparecem para revisão. Nada muda antes da sua confirmação ou salvamento.',
    'metadata.introContinue': 'Entendi, continuar',
    'metadata.keyRequiredTitle': 'Chave Gemini necessária',
    'metadata.keyRequiredMessage': 'Adicione sua chave da API Gemini nas Configurações para buscar metadados.',
    'metadata.configureKey': 'Configurar chave',
    'metadata.searchFailedTitle': 'Falha na busca de metadados',
    'metadata.retry': 'Tentar novamente',
    'metadata.close': 'Fechar',
    'metadata.selectTitle': 'Selecionar livros',
    'metadata.processingTitle': 'Buscando metadados…',
    'metadata.previewTitle': 'Prévia dos metadados',
    'metadata.resultsTitle': 'Resultados da busca',
    'metadata.processingHint': 'As consultas são processadas uma por vez.',
    'metadata.searchPlaceholder': 'Buscar título ou autor…',
    'metadata.noSearchResults': 'Nenhum livro corresponde à busca.',
    'metadata.noEligible': 'Todos os livros já possuem metadados.',
    'metadata.selectionCounter': '{0} / {1} selecionados',
    'metadata.available': 'disponíveis',
    'metadata.fetchButton': 'Buscar metadados',
    'metadata.foundCount': '{0} de {1} resultados encontrados',
    'metadata.found': 'Encontrado',
    'metadata.notFound': 'Não encontrado',
    'metadata.applyButton': 'Aplicar encontrados',
    'metadata.unknown': 'Não identificado',
    'metadata.author': 'Autor:',
    'metadata.release': 'Lançamento:',
    'metadata.synopsis': 'Sinopse',
    'metadata.noSynopsis': 'Nenhuma sinopse disponível.',
    'metadata.actionsTitle': 'Ações do livro',
    'metadata.searchAction': 'Buscar metadados',
    'metadata.editAction': 'Editar manualmente',
    'metadata.appliedTitle': 'Metadados atualizados',
    'metadata.appliedMessage': '{0} livros foram atualizados.',
    'metadata.clearAction': 'Apagar metadados',
    'metadata.clearTitle': 'Apagar metadados?',
    'metadata.clearMessage': 'Autor, ano e sinopse serão removidos. O título, tags, avaliação, capa e progresso de leitura serão mantidos.',
    'metadata.serviceMissingKey': 'Configure uma chave da API Gemini antes de buscar metadados.',
    'metadata.batchLimit': 'Selecione no máximo {0} obras por lote.',
    'metadata.invalidJson': 'A resposta do Gemini não veio em JSON válido.',
    'metadata.invalidMetadata': 'A resposta do Gemini não contém metadados válidos.',
    'metadata.safetyBlocked': 'O Gemini bloqueou esta consulta por motivos de segurança.',
    'metadata.invalidKey': 'A chave Gemini é inválida ou não tem permissão.',
    'metadata.modelUnavailable': 'O modelo Gemini não está disponível.',
    'metadata.rateLimit': 'O limite de requisições do Gemini foi atingido. Aguarde e tente novamente.',
    'metadata.networkUnavailable': 'O serviço Gemini está temporariamente indisponível.',
    'metadata.timeout': 'A consulta ao Gemini demorou demais.',
    'metadata.offline': 'Não foi possível conectar à API Gemini. Verifique sua conexão.',
    'metadata.genericError': 'Não foi possível buscar metadados.',
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
    'auth.googleClientIdRequired': 'Configure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID para ativar o login nativo do Google.',
    'auth.googleDevelopmentBuild': 'O login com Google precisa de um development build (npx expo run:android). No Expo Go, esse módulo nativo não existe.',
    'auth.googleUnavailable': 'O login com Google está indisponível neste build.',
    'auth.googleTokenInvalid': 'O Google não retornou um token de identidade válido.',
    'auth.googleInProgress': 'Já existe um login com Google em andamento.',
    'auth.googlePlayServicesUnavailable': 'O Google Play Services não está disponível ou precisa ser atualizado.',
    'auth.supabaseGoogleUrlMissing': 'O Supabase não retornou a URL de autenticação do Google.',
    'auth.supabaseUrlInvalid': 'O Supabase retornou uma URL de autenticação inválida.',
    'auth.browserUnavailable': 'Nenhum navegador está disponível para concluir o login.',
    'auth.invalidEmail': 'Informe um email válido.',
    'auth.passwordTooShort': 'A senha deve ter pelo menos 6 caracteres.',
    'auth.sync': 'Sincronização',
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
    'common.back': 'Voltar',
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
    'details.bookNotFound': 'Livro não encontrado.',
    'details.goBack': 'Voltar',
    'details.yearExample': 'ex.: 2024',
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
    'library.clearSearch': 'Limpar busca',
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
    'reader.columns': 'Colunas',
    'reader.displayMode': 'Modo de exibição',
    'reader.doubleColumn': 'Duas páginas em modo paisagem',
    'reader.doubleColumnShort': 'Dupla',
    'reader.doubleColumnPortraitHint': 'As duas colunas serão aplicadas ao girar o dispositivo para a horizontal.',
    'reader.deleteNote': 'Excluir nota',
    'reader.deleteNoteConfirm': 'Tem certeza que deseja excluir esta nota?',
    'reader.fontBold': 'Negrito',
    'reader.fontFamily': 'Família da fonte',
    'reader.fontLight': 'Leve',
    'reader.fontMedium': 'Médio',
    'reader.fontMono': 'Mono',
    'reader.fontRegular': 'Regular',
    'reader.fontSans': 'Sem serifa',
    'reader.fontSerif': 'Serifa',
    'reader.fontSize': 'Tamanho da fonte',
    'reader.fontSettings': 'Fonte e tema',
    'reader.fontWeight': 'Peso da fonte',
    'reader.layoutSettings': 'Espaçamento e margens',
    'reader.margins': 'Margens',
    'reader.bookMargins': 'Livro',
    'reader.customMargins': 'Minhas margens',
    'reader.horizontalMargin': 'Margem horizontal',
    'reader.nextPage': 'Próxima página',
    'reader.noBookmarks': 'Nenhum marcador ainda.',
    'reader.topics': 'Tópicos',
    'reader.notes': 'Notas',
    'reader.brightness': 'Brilho',
    'reader.loadingTopics': 'Carregando tópicos…',
    'reader.noTopics': 'Nenhum tópico disponível para este livro.',
    'reader.noToc': 'O sumário não foi encontrado no arquivo EPUB.',
    'reader.brightnessUnavailable': 'Controle de brilho não disponível neste dispositivo.',
    'reader.noNotes': 'Nenhuma nota ainda.',
    'reader.noNotesHint': 'Crie uma nota vinculada à página atual.',
    'reader.newNote': 'Nova nota',
    'reader.note': 'Nota',
    'reader.editNoteTitle': 'Editar nota',
    'reader.notePageTitle': 'Página da nota',
    'reader.savedPage': 'Página salva',
    'reader.pageUnavailable': 'Página —',
    'reader.pageWithNumber': 'Página {0}',
    'reader.currentPage': 'Página atual',
    'reader.noteWillBeSaved': 'será salva com esta anotação',
    'reader.goToNotePage': 'Ir para página da nota',
    'reader.editNote': 'Editar',
    'reader.writeNotePlaceholder': 'Escreva sua anotação…',
    'reader.saveNote': 'Salvar',
    'reader.createNote': 'Criar',
    'reader.epubFileNotFound': 'O arquivo EPUB não está mais disponível.',
    'reader.epubSizeUnknown': 'Não foi possível verificar o tamanho do EPUB com segurança.',
    'reader.epubTooLarge': 'Este EPUB tem {0} MiB. O leitor atual aceita até {1} MiB.',
    'reader.epubTooLargeDecoded': 'Este EPUB ultrapassa o limite de {0} MiB do leitor atual.',
    'reader.epubReadFailed': 'Falha ao preparar o EPUB: {0}',
    'reader.epubRuntimeNotReady': 'O leitor EPUB não respondeu durante a inicialização.',
    'reader.epubClosedBeforeFonts': 'O leitor EPUB foi fechado antes de registrar as fontes.',
    'reader.epubFontLoadFailed': 'Falha ao carregar fontes do leitor EPUB.',
    'reader.epubFontRegistrationTimeout': 'Tempo esgotado ao registrar a fonte {0} no EPUB.',
    'reader.epubOpenFailed': 'Falha ao abrir EPUB.',
    'reader.epubWebViewUnavailable': 'A WebView do leitor EPUB não pôde ser carregada.',
    'reader.pdfOpenFailed': 'Falha ao abrir PDF.',
    'reader.page': 'Página',
    'reader.paginationSettings': 'Paginação',
    'reader.paginatedMode': 'Paginado',
    'reader.pdfWebUnavailableDescription':
      'A leitura de PDF usa um módulo nativo (react-native-pdf) e não funciona no navegador. Abra no Android para ler este arquivo.',
    'reader.pdfWebUnavailableTitle': 'PDF indisponível na web',
    'reader.readingSettings': 'Configurações de leitura',
    'reader.orientation': 'Orientação',
    'reader.orientationFree': 'Livre',
    'reader.orientationLandscape': 'Horizontal',
    'reader.orientationPortrait': 'Vertical',
    'reader.removeBookmark': 'Remover marcador',
    'reader.resetDefaults': 'Restaurar padrão',
    'reader.previousPage': 'Página anterior',
    'reader.spacing': 'Espaçamento',
    'reader.scrollMode': 'Rolagem',
    'reader.singleColumn': 'Simples',
    'reader.zoomCurrent': 'Zoom atual',
    'reader.zoomFitPageHint': '100% ajusta a página inteira.',
    'reader.zoomFitWidthHint': '100% ajusta à largura da página.',
    'reader.zoomIn': 'Aumentar zoom',
    'reader.zoomOut': 'Diminuir zoom',
    'reader.zoomReset': 'Restaurar para 100%',
    'reader.zoomSettings': 'Zoom',
    'scan.action': 'Escanear',
    'scan.scanning': 'Escaneando',
    'settings.about': 'Sobre',
    'settings.apiKey': 'Chave de API',
    'settings.booksPerRow': 'Livros por linha',
    'settings.booksPerRowValue': '{0} por linha',
    'settings.general': 'Geral',
    'settings.keySaved': 'Chave salva.',
    'settings.language': 'Idioma',
    'settings.metadataSearch': 'Buscar metadados',
    'settings.metadataSearchSubtitle': 'Completar autor, ano e sinopse ausentes',
    'settings.sectionAbout': 'SOBRE',
    'settings.sectionAppearance': 'APARÊNCIA',
    'settings.sectionIntegrations': 'INTEGRAÇÕES',
    'settings.sectionLibrary': 'BIBLIOTECA',
    'settings.sectionReading': 'LEITURA',
    'settings.pdfEngine': 'Motor de PDF',
    'settings.pdfEngineNative': 'Nativo',
    'settings.pdfEngineNativeDescription': 'Leitor Android atual baseado em PDFium.',
    'settings.pdfEngineWebView': 'WebView',
    'settings.pdfEngineWebViewDescription': 'PDF.js dentro de uma WebView estável.',
    'settings.pdfEngineWebViewPending': 'Disponível na próxima fase do leitor PDF.',
    'settings.syncDesc': 'A sincronização com a nuvem estará disponível após o beta.',
    'settings.syncTitle': 'Sincronizar entre dispositivos',
    'sync.betaAction': 'Entendi',
    'sync.betaMessage': 'O Krumer está em beta. Por enquanto, a sincronização com a nuvem não está disponivel.',
    'sync.betaTitle': 'Sincronização indisponível no beta',
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
    'metadata.introTitle': 'Buscar metadatos',
    'metadata.introSubtitle': 'Usa Gemini para completar los detalles de los libros de tu biblioteca local.',
    'metadata.introHowTitle': 'Cómo funciona',
    'metadata.introHowText': 'Krumer envía el título a Gemini y recibe una sugerencia estructurada.',
    'metadata.introPrivacyTitle': 'Tu clave queda en el dispositivo',
    'metadata.introPrivacyText': 'La clave se guarda de forma segura y solo se usa en consultas a Gemini.',
    'metadata.introReviewTitle': 'Tú mantienes el control',
    'metadata.introReviewText': 'Los resultados aparecen para revisión. Nada cambia hasta que confirmes o guardes.',
    'metadata.introContinue': 'Entendido, continuar',
    'metadata.keyRequiredTitle': 'Se necesita la clave Gemini',
    'metadata.keyRequiredMessage': 'Agrega tu clave API de Gemini en Configuración para buscar metadatos.',
    'metadata.configureKey': 'Configurar clave',
    'metadata.searchFailedTitle': 'Falló la búsqueda de metadatos',
    'metadata.retry': 'Intentar de nuevo',
    'metadata.close': 'Cerrar',
    'metadata.selectTitle': 'Seleccionar libros',
    'metadata.processingTitle': 'Buscando metadatos…',
    'metadata.previewTitle': 'Vista previa de metadatos',
    'metadata.resultsTitle': 'Resultados de búsqueda',
    'metadata.processingHint': 'Las consultas se procesan una por una.',
    'metadata.searchPlaceholder': 'Buscar título o autor…',
    'metadata.noSearchResults': 'Ningún libro coincide con la búsqueda.',
    'metadata.noEligible': 'Todos los libros raíz ya tienen metadatos.',
    'metadata.selectionCounter': '{0} / {1} seleccionados',
    'metadata.available': 'disponibles',
    'metadata.fetchButton': 'Buscar metadatos',
    'metadata.foundCount': '{0} de {1} resultados encontrados',
    'metadata.found': 'Encontrado',
    'metadata.notFound': 'No encontrado',
    'metadata.applyButton': 'Aplicar encontrados',
    'metadata.unknown': 'No identificado',
    'metadata.author': 'Autor:',
    'metadata.release': 'Lanzamiento:',
    'metadata.synopsis': 'Sinopsis',
    'metadata.noSynopsis': 'No hay sinopsis disponible.',
    'metadata.actionsTitle': 'Acciones del libro',
    'metadata.searchAction': 'Buscar metadatos',
    'metadata.editAction': 'Editar manualmente',
    'metadata.appliedTitle': 'Metadatos actualizados',
    'metadata.appliedMessage': 'Se actualizaron {0} libros.',
    'metadata.clearAction': 'Borrar metadatos',
    'metadata.clearTitle': '¿Borrar metadatos?',
    'metadata.clearMessage': 'Se eliminarán autor, año y sinopsis. Se conservarán el título, las etiquetas, la valoración, la portada y el progreso de lectura.',
    'metadata.serviceMissingKey': 'Configura una clave de la API de Gemini antes de buscar metadatos.',
    'metadata.batchLimit': 'Selecciona como máximo {0} obras por lote.',
    'metadata.invalidJson': 'La respuesta de Gemini no contiene un JSON válido.',
    'metadata.invalidMetadata': 'La respuesta de Gemini no contiene metadatos válidos.',
    'metadata.safetyBlocked': 'Gemini bloqueó esta consulta por motivos de seguridad.',
    'metadata.invalidKey': 'La clave de Gemini no es válida o no tiene permisos.',
    'metadata.modelUnavailable': 'El modelo de Gemini no está disponible.',
    'metadata.rateLimit': 'Se alcanzó el límite de solicitudes de Gemini. Espera e inténtalo de nuevo.',
    'metadata.networkUnavailable': 'El servicio de Gemini no está disponible temporalmente.',
    'metadata.timeout': 'La consulta a Gemini tardó demasiado.',
    'metadata.offline': 'No se pudo conectar con la API de Gemini. Comprueba tu conexión.',
    'metadata.genericError': 'No se pudieron buscar metadatos.',
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
    'auth.googleClientIdRequired': 'Configura EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID para activar el acceso nativo de Google.',
    'auth.googleDevelopmentBuild': 'El acceso con Google requiere un development build (npx expo run:android). Este módulo nativo no está disponible en Expo Go.',
    'auth.googleUnavailable': 'El acceso con Google no está disponible en esta compilación.',
    'auth.googleTokenInvalid': 'Google no devolvió un token de identidad válido.',
    'auth.googleInProgress': 'Ya hay un acceso con Google en curso.',
    'auth.googlePlayServicesUnavailable': 'Google Play Services no está disponible o necesita actualizarse.',
    'auth.supabaseGoogleUrlMissing': 'Supabase no devolvió una URL de autenticación de Google.',
    'auth.supabaseUrlInvalid': 'Supabase devolvió una URL de autenticación no válida.',
    'auth.browserUnavailable': 'No hay ningún navegador disponible para completar el acceso.',
    'auth.invalidEmail': 'Introduce un correo electrónico válido.',
    'auth.passwordTooShort': 'La contraseña debe tener al menos 6 caracteres.',
    'auth.sync': 'Sincronización',
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
    'common.back': 'Volver',
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
    'details.bookNotFound': 'Libro no encontrado.',
    'details.goBack': 'Volver',
    'details.yearExample': 'p. ej., 2024',
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
    'library.clearSearch': 'Borrar búsqueda',
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
    'reader.columns': 'Columnas',
    'reader.displayMode': 'Modo de visualización',
    'reader.doubleColumn': 'Dos páginas en horizontal',
    'reader.doubleColumnShort': 'Doble',
    'reader.doubleColumnPortraitHint': 'Las dos columnas se aplicarán al girar el dispositivo a horizontal.',
    'reader.deleteNote': 'Eliminar nota',
    'reader.deleteNoteConfirm': '¿Estás seguro de que deseas eliminar esta nota?',
    'reader.fontBold': 'Negrita',
    'reader.fontFamily': 'Familia tipográfica',
    'reader.fontLight': 'Ligera',
    'reader.fontMedium': 'Media',
    'reader.fontMono': 'Mono',
    'reader.fontRegular': 'Regular',
    'reader.fontSans': 'Sin serifa',
    'reader.fontSerif': 'Serifa',
    'reader.fontSize': 'Tamaño de fuente',
    'reader.fontSettings': 'Fuente y tema',
    'reader.fontWeight': 'Peso de fuente',
    'reader.layoutSettings': 'Espaciado y márgenes',
    'reader.margins': 'Márgenes',
    'reader.bookMargins': 'Libro',
    'reader.customMargins': 'Mis márgenes',
    'reader.horizontalMargin': 'Margen horizontal',
    'reader.nextPage': 'Página siguiente',
    'reader.noBookmarks': 'Aún no hay marcadores.',
    'reader.topics': 'Temas',
    'reader.notes': 'Notas',
    'reader.brightness': 'Brillo',
    'reader.loadingTopics': 'Cargando temas…',
    'reader.noTopics': 'No hay temas disponibles para este libro.',
    'reader.noToc': 'No se encontró el índice en el archivo EPUB.',
    'reader.brightnessUnavailable': 'El control de brillo no está disponible en este dispositivo.',
    'reader.noNotes': 'Aún no hay notas.',
    'reader.noNotesHint': 'Crea una nota vinculada a la página actual.',
    'reader.newNote': 'Nueva nota',
    'reader.note': 'Nota',
    'reader.editNoteTitle': 'Editar nota',
    'reader.notePageTitle': 'Página de la nota',
    'reader.savedPage': 'Página guardada',
    'reader.pageUnavailable': 'Página —',
    'reader.pageWithNumber': 'Página {0}',
    'reader.currentPage': 'Página actual',
    'reader.noteWillBeSaved': 'se guardará con esta nota',
    'reader.goToNotePage': 'Ir a la página de la nota',
    'reader.editNote': 'Editar',
    'reader.writeNotePlaceholder': 'Escribe tu nota…',
    'reader.saveNote': 'Guardar',
    'reader.createNote': 'Crear',
    'reader.epubFileNotFound': 'El archivo EPUB ya no está disponible.',
    'reader.epubSizeUnknown': 'No se pudo verificar el tamaño del EPUB de forma segura.',
    'reader.epubTooLarge': 'Este EPUB ocupa {0} MiB. El lector actual acepta hasta {1} MiB.',
    'reader.epubTooLargeDecoded': 'Este EPUB supera el límite de {0} MiB del lector actual.',
    'reader.epubReadFailed': 'No se pudo preparar el EPUB: {0}',
    'reader.epubRuntimeNotReady': 'El lector EPUB no respondió durante el inicio.',
    'reader.epubClosedBeforeFonts': 'El lector EPUB se cerró antes de registrar sus fuentes.',
    'reader.epubFontLoadFailed': 'No se pudieron cargar las fuentes del lector EPUB.',
    'reader.epubFontRegistrationTimeout': 'Se agotó el tiempo al registrar la fuente {0} en el EPUB.',
    'reader.epubOpenFailed': 'No se pudo abrir el EPUB.',
    'reader.epubWebViewUnavailable': 'No se pudo cargar la WebView del lector EPUB.',
    'reader.pdfOpenFailed': 'No se pudo abrir el PDF.',
    'reader.page': 'Página',
    'reader.paginationSettings': 'Paginación',
    'reader.paginatedMode': 'Paginado',
    'reader.pdfWebUnavailableDescription':
      'La lectura de PDF usa un módulo nativo (react-native-pdf) y no funciona en el navegador. Ábrelo en Android para leer este archivo.',
    'reader.pdfWebUnavailableTitle': 'PDF no disponible en web',
    'reader.readingSettings': 'Configuración de lectura',
    'reader.orientation': 'Orientación',
    'reader.orientationFree': 'Libre',
    'reader.orientationLandscape': 'Horizontal',
    'reader.orientationPortrait': 'Vertical',
    'reader.removeBookmark': 'Eliminar marcador',
    'reader.resetDefaults': 'Restaurar valores predeterminados',
    'reader.previousPage': 'Página anterior',
    'reader.spacing': 'Espaciado',
    'reader.scrollMode': 'Desplazamiento',
    'reader.singleColumn': 'Simple',
    'reader.zoomCurrent': 'Zoom actual',
    'reader.zoomFitPageHint': '100% ajusta la página completa.',
    'reader.zoomFitWidthHint': '100% ajusta al ancho de la página.',
    'reader.zoomIn': 'Aumentar zoom',
    'reader.zoomOut': 'Reducir zoom',
    'reader.zoomReset': 'Restablecer al 100%',
    'reader.zoomSettings': 'Zoom',
    'scan.action': 'Escanear',
    'scan.scanning': 'Escaneando',
    'settings.about': 'Acerca de',
    'settings.apiKey': 'Clave API',
    'settings.booksPerRow': 'Libros por fila',
    'settings.booksPerRowValue': '{0} por fila',
    'settings.general': 'General',
    'settings.keySaved': 'Clave guardada.',
    'settings.language': 'Idioma',
    'settings.metadataSearch': 'Buscar metadatos',
    'settings.metadataSearchSubtitle': 'Completar autor, año y sinopsis ausentes',
    'settings.sectionAbout': 'ACERCA DE',
    'settings.sectionAppearance': 'APARIENCIA',
    'settings.sectionIntegrations': 'INTEGRACIONES',
    'settings.sectionLibrary': 'BIBLIOTECA',
    'settings.sectionReading': 'LECTURA',
    'settings.pdfEngine': 'Motor de PDF',
    'settings.pdfEngineNative': 'Nativo',
    'settings.pdfEngineNativeDescription': 'Lector Android actual basado en PDFium.',
    'settings.pdfEngineWebView': 'WebView',
    'settings.pdfEngineWebViewDescription': 'PDF.js dentro de una WebView estable.',
    'settings.pdfEngineWebViewPending': 'Disponible en la próxima fase del lector PDF.',
    'settings.syncDesc': 'La sincronización en la nube estará disponible después de la beta.',
    'settings.syncTitle': 'Sincronizar entre dispositivos',
    'sync.betaAction': 'Entendido',
    'sync.betaMessage': 'Krumer está en beta. Por ahora, la sincronización con la nube no está disponible.',
    'sync.betaTitle': 'Sincronización no disponible en la beta',
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

