import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { getNativeGoogleIdToken, signOutNativeGoogle } from '../auth/google';
import { AUTH_REDIRECT_URL, SUPABASE_URL, supabase } from '../auth/supabase';

type SignUpResult = { confirmationRequired: boolean };
type GoogleSignInResult = 'browser-opened' | 'cancelled' | 'signed-in';

type AuthContextValue = {
  ready: boolean;
  recovery: boolean;
  session: Session | null;
  user: User | null;
  requestPasswordReset: (email: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<GoogleSignInResult>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw new Error('Informe um email válido.');
  return normalized;
}

function validatePassword(password: string) {
  if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');
  return password;
}

function getCallbackParams(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'krumer:' || url.hostname !== 'auth' || url.pathname !== '/callback') {
      return null;
    }
    const params = new URLSearchParams(url.search);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    hashParams.forEach((value, key) => params.set(key, value));
    return params;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const handleAuthUrl = useCallback(async (rawUrl: string) => {
    const params = getCallbackParams(rawUrl);
    if (!params) return;
    const callbackError = params.get('error_description') ?? params.get('error');
    if (callbackError) throw new Error(callbackError);

    const code = params.get('code');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const isRecovery = params.get('type') === 'recovery';

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    } else {
      return;
    }
    setRecovery(isRecovery);
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === 'SIGNED_OUT') setRecovery(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });

    async function hydrate() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) console.warn('[Auth] Não foi possível restaurar a sessão:', error.message);
      setSession(data.session ?? null);

      const url = await Linking.getInitialURL();
      if (url) {
        await handleAuthUrl(url).catch((nextError) => console.warn('[Auth] Link inválido:', nextError.message));
      }
      if (mounted) setReady(true);
    }

    void hydrate();
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url).catch((error) => console.warn('[Auth] Link inválido:', error.message));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, [handleAuthUrl]);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    recovery,
    session,
    user: session?.user ?? null,
    signIn: async (email, password) => {
      setRecovery(false);
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password: validatePassword(password),
      });
      if (error) throw error;
    },
    signInWithGoogle: async () => {
      setRecovery(false);
      if (Platform.OS === 'android') {
        const idToken = await getNativeGoogleIdToken();
        if (!idToken) return 'cancelled';

        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (error) throw error;
        return 'signed-in';
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: AUTH_REDIRECT_URL,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error('O Supabase não retornou a URL de autenticação do Google.');

      const oauthUrl = new URL(data.url);
      if (oauthUrl.protocol !== 'https:' || oauthUrl.origin !== new URL(SUPABASE_URL).origin) {
        throw new Error('O Supabase retornou uma URL de autenticação inválida.');
      }
      if (!await Linking.canOpenURL(oauthUrl.toString())) {
        throw new Error('Nenhum navegador está disponível para concluir o login.');
      }
      await Linking.openURL(oauthUrl.toString());
      return 'browser-opened';
    },
    signUp: async (email, password) => {
      setRecovery(false);
      const { data, error } = await supabase.auth.signUp({
        email: normalizeEmail(email),
        password: validatePassword(password),
        options: { emailRedirectTo: AUTH_REDIRECT_URL },
      });
      if (error) throw error;
      return { confirmationRequired: !data.session };
    },
    sendMagicLink: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizeEmail(email),
        options: { emailRedirectTo: AUTH_REDIRECT_URL, shouldCreateUser: false },
      });
      if (error) throw error;
    },
    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
        redirectTo: AUTH_REDIRECT_URL,
      });
      if (error) throw error;
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password: validatePassword(password) });
      if (error) throw error;
      setRecovery(false);
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      if (Platform.OS === 'android') {
        await signOutNativeGoogle().catch((googleError) => {
          console.warn('[Auth] Não foi possível limpar a conta Google local:', googleError);
        });
      }
      setRecovery(false);
    },
  }), [ready, recovery, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
