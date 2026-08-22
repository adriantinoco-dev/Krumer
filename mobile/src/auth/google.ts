import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
let configured = false;

function ensureConfigured() {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Configure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID para ativar o login nativo do Google.');
  }
  if (configured) return;

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

export async function getNativeGoogleIdToken() {
  ensureConfigured();

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
      if (error.code === statusCodes.IN_PROGRESS) {
        throw new Error('Já existe um login com Google em andamento.');
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('O Google Play Services não está disponível ou precisa ser atualizado.');
      }
    }
    throw error;
  }
}

export async function signOutNativeGoogle() {
  if (!configured) return;
  await GoogleSignin.signOut();
}
