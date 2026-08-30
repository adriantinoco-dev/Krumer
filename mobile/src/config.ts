// Supabase/cloud synchronization is intentionally paused for the beta release.
// Keep this gate explicit so the feature can be re-enabled without removing
// the existing auth, outbox, and merge implementation.
import { DEFAULT_LANGUAGE, translate, type LanguageCode } from './i18n/translations';

export const CLOUD_SYNC_ENABLED = false;

export function cloudSyncDisabledMessage(language: LanguageCode = DEFAULT_LANGUAGE) {
  return translate(language, 'sync.betaMessage');
}
