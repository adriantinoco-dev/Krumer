const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const {
  AUTH_REDIRECT_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} = require('./auth-config');

class EncryptedAuthStorage {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.pendingWrite = Promise.resolve();
  }

  async _readFile() {
    try {
      return JSON.parse(await fs.promises.readFile(this.storagePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      console.warn('[Auth] Não foi possível ler a sessão persistida:', error.message);
      return {};
    }
  }

  async getItem(key) {
    await this.pendingWrite;
    const values = await this._readFile();
    if (!values[key]) return null;

    try {
      return safeStorage.decryptString(Buffer.from(values[key], 'base64'));
    } catch (error) {
      console.warn('[Auth] A sessão persistida não pôde ser descriptografada:', error.message);
      return null;
    }
  }

  async setItem(key, value) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('O armazenamento seguro do sistema ainda não está disponível.');
    }

    this.pendingWrite = this.pendingWrite.then(async () => {
      const values = await this._readFile();
      values[key] = safeStorage.encryptString(value).toString('base64');
      await fs.promises.mkdir(path.dirname(this.storagePath), { recursive: true });
      await fs.promises.writeFile(this.storagePath, JSON.stringify(values), { mode: 0o600 });
    });
    await this.pendingWrite;
  }

  async removeItem(key) {
    this.pendingWrite = this.pendingWrite.then(async () => {
      const values = await this._readFile();
      delete values[key];
      if (Object.keys(values).length === 0) {
        try {
          await fs.promises.unlink(this.storagePath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        return;
      }
      await fs.promises.writeFile(this.storagePath, JSON.stringify(values), { mode: 0o600 });
    });
    await this.pendingWrite;
  }
}

function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new Error('Informe um email válido.');
  }
  return normalized;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }
  return password;
}

function sanitizeSession(session, recovery = false) {
  const user = session?.user;
  return {
    authenticated: Boolean(user),
    recovery,
    user: user ? {
      id: user.id,
      email: user.email || '',
      emailConfirmed: Boolean(user.email_confirmed_at)
    } : null,
    expiresAt: session?.expires_at || null
  };
}

function callbackParams(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'krumer:' || url.hostname !== 'auth' || url.pathname !== '/callback') {
    throw new Error('O link de autenticação não pertence ao Krumer.');
  }
  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const [key, value] of hashParams.entries()) params.set(key, value);
  return params;
}

class AuthService {
  constructor(userDataPath) {
    this.recovery = false;
    this.stateListener = null;
    this.storage = new EncryptedAuthStorage(path.join(userDataPath, 'supabase-auth-session.json'));
    this.client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'implicit',
        persistSession: true,
        storage: this.storage
      }
    });
  }

  async initialize() {
    this.client.auth.onAuthStateChange((_event, session) => {
      this._emit(session);
    });
    return this.getState();
  }

  setStateListener(listener) {
    this.stateListener = listener;
  }

  async _emit(session) {
    if (!this.stateListener) return;
    this.stateListener(sanitizeSession(session, this.recovery));
  }

  async getState() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return sanitizeSession(data.session, this.recovery);
  }

  async getSyncCredentials() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session?.access_token || !session.user?.id) return null;
    return {
      accessToken: session.access_token,
      userId: session.user.id,
      expiresAt: session.expires_at || null
    };
  }

  async signIn(email, password) {
    this.recovery = false;
    const { data, error } = await this.client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: validatePassword(password)
    });
    if (error) throw error;
    return sanitizeSession(data.session, false);
  }

  async getGoogleOAuthUrl() {
    this.recovery = false;
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: AUTH_REDIRECT_URL,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });
    if (error) throw error;
    if (!data.url) throw new Error('O Supabase não retornou a URL de autenticação do Google.');

    const oauthUrl = new URL(data.url);
    if (oauthUrl.protocol !== 'https:' || oauthUrl.origin !== new URL(SUPABASE_URL).origin) {
      throw new Error('O Supabase retornou uma URL de autenticação inválida.');
    }
    return oauthUrl.toString();
  }

  async signUp(email, password) {
    this.recovery = false;
    const { data, error } = await this.client.auth.signUp({
      email: normalizeEmail(email),
      password: validatePassword(password),
      options: { emailRedirectTo: AUTH_REDIRECT_URL }
    });
    if (error) throw error;
    return {
      confirmationRequired: !data.session,
      state: sanitizeSession(data.session, false)
    };
  }

  async sendMagicLink(email) {
    const { error } = await this.client.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: {
        emailRedirectTo: AUTH_REDIRECT_URL,
        shouldCreateUser: false
      }
    });
    if (error) throw error;
    return { sent: true };
  }

  async requestPasswordReset(email) {
    const { error } = await this.client.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: AUTH_REDIRECT_URL
    });
    if (error) throw error;
    return { sent: true };
  }

  async updatePassword(password) {
    const { data, error } = await this.client.auth.updateUser({
      password: validatePassword(password)
    });
    if (error) throw error;
    this.recovery = false;
    const { data: sessionData } = await this.client.auth.getSession();
    return sanitizeSession(sessionData.session, false);
  }

  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    this.recovery = false;
    return sanitizeSession(null, false);
  }

  async handleCallback(rawUrl) {
    const params = callbackParams(rawUrl);
    const callbackError = params.get('error_description') || params.get('error');
    if (callbackError) throw new Error(callbackError);

    this.recovery = params.get('type') === 'recovery';
    const code = params.get('code');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (code) {
      const { error } = await this.client.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (accessToken && refreshToken) {
      const { error } = await this.client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) throw error;
    } else {
      throw new Error('O link de autenticação não contém uma sessão válida.');
    }

    const state = await this.getState();
    await this._emit((await this.client.auth.getSession()).data.session);
    return state;
  }
}

module.exports = { AuthService, callbackParams, sanitizeSession };
