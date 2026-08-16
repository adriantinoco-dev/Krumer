import type { LocalPreferences } from '../models/settings';

let preferences: LocalPreferences = {};

export function getPreferences() {
  return preferences;
}

export function setPreferences(nextPreferences: Partial<LocalPreferences>) {
  preferences = {
    ...preferences,
    ...nextPreferences,
  };

  return preferences;
}

