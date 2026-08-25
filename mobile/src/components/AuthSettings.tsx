import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';
import { subscribeSyncStatus } from '../sync/engine';
import type { MobileSyncStatus } from '../sync/types';

type AuthMode = 'signin' | 'signup';

export function AuthSettings() {
  const { ready, recovery, requestPasswordReset, sendMagicLink, signIn, signInWithGoogle, signOut, signUp, updatePassword, user } = useAuth();
  const { theme, t } = useApp();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [syncStatus, setSyncStatus] = useState<MobileSyncStatus | null>(null);

  useEffect(() => subscribeSyncStatus(setSyncStatus), []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(false);
    setMessage(t('auth.working'));
    try {
      await action();
    } catch (nextError) {
      setError(true);
      setMessage(nextError instanceof Error ? nextError.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  function requireMatchingPasswords() {
    if (password !== confirmation) {
      setError(true);
      setMessage(t('auth.passwordsMismatch'));
      return false;
    }
    return true;
  }

  if (!ready) return <ActivityIndicator color={theme.accent} />;

  if (user) {
    return (
      <View style={{ gap: spacing.md }}>
        {message ? <StatusMessage error={error} message={message} /> : null}
        <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md }}>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12 }}>{t('auth.signedInAs')}</Text>
          <Text selectable style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16 }}>{user.email}</Text>
          <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
            {user.email_confirmed_at ? t('auth.emailConfirmed') : t('auth.emailNotConfirmed')}
          </Text>
          <Text style={{ color: syncStatus?.state === 'error' ? '#ef4444' : theme.textSecondary, fontFamily: serifFont, fontSize: 12 }}>
            {syncMark(syncStatus?.state)} Sync{syncStatus?.pending ? ` (${syncStatus.pending})` : ''}
          </Text>
        </View>
        {recovery ? (
          <View style={{ backgroundColor: theme.accentMuted, borderLeftColor: theme.accent, borderLeftWidth: 3, padding: spacing.md }}>
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, lineHeight: 19 }}>{t('auth.recoveryReady')}</Text>
          </View>
        ) : null}
        <Field
          label={t('auth.newPassword')}
          onChangeText={setPassword}
          placeholder={t('auth.passwordPlaceholder')}
          secure
          value={password}
        />
        <Field
          label={t('auth.confirmPassword')}
          onChangeText={setConfirmation}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          secure
          value={confirmation}
        />
        <AuthButton
          disabled={busy || !password || !confirmation}
          label={t('auth.updatePassword')}
          onPress={() => {
            if (!requireMatchingPasswords()) return;
            void run(async () => {
              await updatePassword(password);
              setPassword('');
              setConfirmation('');
              setMessage(t('auth.passwordUpdated'));
            });
          }}
        />
        <AuthButton
          secondary
          disabled={busy}
          label={t('auth.signOut')}
          onPress={() => void run(async () => {
            await signOut();
            setMessage(t('auth.signedOut'));
          })}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ color: theme.textSecondary, fontFamily: serifFont, lineHeight: 19 }}>{t('auth.subtitle')}</Text>
      {message ? <StatusMessage error={error} message={message} /> : null}
      <GoogleButton
        disabled={busy}
        label={t('auth.googleSignIn')}
        onPress={() => void run(async () => {
          const result = await signInWithGoogle();
          if (result === 'cancelled') {
            setMessage('');
          } else {
            setMessage(t(result === 'signed-in' ? 'auth.signedIn' : 'auth.googleBrowserOpened'));
          }
        })}
      />
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ backgroundColor: theme.border, flex: 1, height: 1 }} />
        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, textTransform: 'uppercase' }}>{t('auth.orEmail')}</Text>
        <View style={{ backgroundColor: theme.border, flex: 1, height: 1 }} />
      </View>
      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', padding: 3 }}>
        {(['signin', 'signup'] as AuthMode[]).map((nextMode) => (
          <Pressable
            key={nextMode}
            disabled={busy}
            onPress={() => { setMode(nextMode); setMessage(''); }}
            style={{ backgroundColor: mode === nextMode ? theme.accent : 'transparent', borderRadius: radii.sm, flex: 1, padding: spacing.sm }}
          >
            <Text style={{ color: mode === nextMode ? theme.bg : theme.textSecondary, fontFamily: serifFont, fontWeight: '700', textAlign: 'center' }}>
              {t(nextMode === 'signin' ? 'auth.signIn' : 'auth.signUp')}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field label={t('auth.email')} onChangeText={setEmail} placeholder={t('auth.emailPlaceholder')} value={email} />
      <Field label={t('auth.password')} onChangeText={setPassword} placeholder={t('auth.passwordPlaceholder')} secure value={password} />
      {mode === 'signup' ? (
        <Field
          label={t('auth.confirmPassword')}
          onChangeText={setConfirmation}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          secure
          value={confirmation}
        />
      ) : null}
      <AuthButton
        disabled={busy || !email || !password || (mode === 'signup' && !confirmation)}
        label={t(mode === 'signin' ? 'auth.signIn' : 'auth.signUp')}
        onPress={() => void run(async () => {
          if (mode === 'signup') {
            if (!requireMatchingPasswords()) return;
            const result = await signUp(email, password);
            setMessage(t(result.confirmationRequired ? 'auth.checkEmailConfirmation' : 'auth.accountCreated'));
          } else {
            await signIn(email, password);
            setMessage(t('auth.signedIn'));
          }
          setPassword('');
          setConfirmation('');
        })}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <LinkButton disabled={busy} label={t('auth.magicLink')} onPress={() => void run(async () => {
          await sendMagicLink(email);
          setMessage(t('auth.checkEmailMagic'));
        })} />
        <LinkButton disabled={busy} label={t('auth.forgotPassword')} onPress={() => void run(async () => {
          await requestPasswordReset(email);
          setMessage(t('auth.checkEmailRecovery'));
        })} />
      </View>
    </View>
  );
}

function syncMark(state?: MobileSyncStatus['state']) {
  return ({ synced: '●', syncing: '↻', pending: '…', error: '!', offline: '○', signed_out: '○' })[state ?? 'offline'];
}

function GoogleButton({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{ alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dadce0', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', opacity: disabled ? 0.5 : 1, padding: 12 }}
    >
      <Text style={{ color: '#4285f4', fontFamily: 'Arial', fontSize: 18, fontWeight: '700' }}>G</Text>
      <Text style={{ color: '#202124', fontFamily: serifFont, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, onChangeText, placeholder, secure, value }: { label: string; onChangeText: (value: string) => void; placeholder: string; secure?: boolean; value: string }) {
  const { theme } = useApp();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13 }}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={secure ? 'default' : 'email-address'}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        secureTextEntry={secure}
        style={{ backgroundColor: theme.card, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, color: theme.textPrimary, fontFamily: serifFont, paddingHorizontal: spacing.md, paddingVertical: 12 }}
        value={value}
      />
    </View>
  );
}

function AuthButton({ disabled, label, onPress, secondary }: { disabled?: boolean; label: string; onPress: () => void; secondary?: boolean }) {
  const { theme } = useApp();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{ backgroundColor: secondary ? theme.card : theme.accent, borderColor: secondary ? theme.border : theme.accent, borderRadius: radii.md, borderWidth: 1, opacity: disabled ? 0.5 : 1, padding: 12 }}
    >
      <Text style={{ color: secondary ? theme.textPrimary : theme.bg, fontFamily: serifFont, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function LinkButton({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  const { theme } = useApp();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={{ maxWidth: '48%', opacity: disabled ? 0.5 : 1, paddingVertical: spacing.xs }}>
      <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function StatusMessage({ error, message }: { error: boolean; message: string }) {
  const { theme } = useApp();
  return (
    <View style={{ backgroundColor: error ? '#ef44441a' : theme.accentMuted, borderColor: error ? '#ef444466' : theme.accent, borderRadius: radii.md, borderWidth: 1, padding: spacing.sm }}>
      <Text style={{ color: error ? '#ef4444' : theme.textPrimary, fontFamily: serifFont, fontSize: 13, lineHeight: 18 }}>{message}</Text>
    </View>
  );
}
