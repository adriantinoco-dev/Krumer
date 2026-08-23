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

function ensureConfigured() {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Configure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID para ativar o login nativo do Google.');
  }
  const mod = loadGoogleModule();
  if (!mod) {
    throw new Error('Login com Google precisa de um development build (npx expo run:android). No Expo Go esse módulo nativo não existe.');
  }
  if (configured) return;

  mod.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

export async function getNativeGoogleIdToken() {
  ensureConfigured();
  const mod = loadGoogleModule();
  if (!mod) throw new Error('Login com Google indisponível neste build.');
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = mod;

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) {
      throw new Error('O Google não retornou um token de identidade válido.');
    }
    return response.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if ((error as { code: string }).code === statusCodes.IN_PROGRESS) {
        throw new Error('Já existe um login com Google em andamento.');
      }
      if ((error as { code: string }).code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('O Google Play Services não está disponível ou precisa ser atualizado.');
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
