import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { CLOUD_SYNC_ENABLED, cloudSyncDisabledMessage } from '../config';
import { DEFAULT_LANGUAGE, type LanguageCode } from '../i18n/translations';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? 'https://bcwgtutmzdhkotiuymxl.supabase.co';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? 'sb_publishable_YKD-5OwhrWIjlHFAKDH9jw_wL6nHkd_';

export const AUTH_REDIRECT_URL = 'krumer://auth/callback';

let client: SupabaseClient<any> | null = null;

export function getSupabase(language: LanguageCode = DEFAULT_LANGUAGE) {
  if (!CLOUD_SYNC_ENABLED) throw new Error(cloudSyncDisabledMessage(language));
  if (!client) {
    client = createClient(SUPABASE_URL, supabasePublishableKey, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: processLock,
        persistSession: true,
      },
    });
  }
  return client;
}

if (CLOUD_SYNC_ENABLED && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      getSupabase().auth.startAutoRefresh();
    } else {
      getSupabase().auth.stopAutoRefresh();
    }
  });
}
