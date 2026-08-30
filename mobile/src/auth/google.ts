import { DEFAULT_LANGUAGE, translate, type LanguageCode } from '../i18n/translations';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
let configured = false;

// Carregamento preguiçoso: importar @react-native-google-signin no topo
// faz TurboModuleRegistry.getEnforcing('RNGoogleSignin') estourar no Expo Go
// (sem binário nativo). Carregando só quando precisa o app não trava na abertura.
let cachedModule: {
  GoogleSignin: any;
  isErrorWithCode: (e: unknown) => boolean;
  isSuccessResponse: (r: unknown) => boolean;
  statusCodes: Record<string, string>;
} | null | undefined;

function loadGoogleModule() {
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin');
    cachedModule = {
      GoogleSignin: mod.GoogleSignin,
      isErrorWithCode: mod.isErrorWithCode,
      isSuccessResponse: mod.isSuccessResponse,
      statusCodes: mod.statusCodes,
    };
    return cachedModule;
  } catch {
    cachedModule = null;
    return null;
  }
}

function ensureConfigured(language: LanguageCode) {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(translate(language, 'auth.googleClientIdRequired'));
  }
  const mod = loadGoogleModule();
  if (!mod) {
    throw new Error(translate(language, 'auth.googleDevelopmentBuild'));
  }
  if (configured) return;

  mod.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

export async function getNativeGoogleIdToken(language: LanguageCode = DEFAULT_LANGUAGE) {
  ensureConfigured(language);
  const mod = loadGoogleModule();
  if (!mod) throw new Error(translate(language, 'auth.googleUnavailable'));
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = mod;

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) {
      throw new Error(translate(language, 'auth.googleTokenInvalid'));
    }
    return response.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if ((error as { code: string }).code === statusCodes.IN_PROGRESS) {
        throw new Error(translate(language, 'auth.googleInProgress'));
      }
      if ((error as { code: string }).code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error(translate(language, 'auth.googlePlayServicesUnavailable'));
      }
    }
    throw error;
  }
}

export async function signOutNativeGoogle() {
  if (!configured) return;
  const mod = loadGoogleModule();
  if (!mod) return;
  await mod.GoogleSignin.signOut().catch(() => undefined);
}
