import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const GEMINI_KEY = 'krumer.gemini.api-key';
const PREFERENCES_KEY = 'krumer.preferences';

export async function getGeminiApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const value = await SecureStore.getItemAsync(GEMINI_KEY);
    return value?.trim() || null;
  } catch (error) {
    console.warn('[Krumer] SecureStore read failed:', error);
    return null;
  }
}

export async function setGeminiApiKey(value: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  const normalized = value?.trim() || null;
  if (normalized) {
    await SecureStore.setItemAsync(GEMINI_KEY, normalized);
  } else {
    await SecureStore.deleteItemAsync(GEMINI_KEY);
  }
}

export async function removeGeminiApiKey(): Promise<void> {
  await setGeminiApiKey(null);
}

export async function migrateLegacyGeminiApiKey(preferences: Record<string, unknown>): Promise<boolean> {
  const current = await getGeminiApiKey();
  if (current) return true;

  const legacy = typeof preferences.geminiApiKey === 'string' ? preferences.geminiApiKey.trim() : '';
  if (!legacy || Platform.OS === 'web') return false;

  try {
    await SecureStore.setItemAsync(GEMINI_KEY, legacy);
    return true;
  } catch (error) {
    // Keep the legacy value in AsyncStorage until a later hydration can retry.
    console.warn('[Krumer] SecureStore migration failed:', error);
    return false;
  }
}

export async function removeLegacyGeminiApiKey(): Promise<void> {
  const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(parsed, 'geminiApiKey')) return;
    delete parsed.geminiApiKey;
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.warn('[Krumer] Legacy Gemini key cleanup failed:', error);
  }
}

export { GEMINI_KEY };
