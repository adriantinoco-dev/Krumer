import { apiClient } from './client';
import type { SettingMap } from '../models/settings';

export function getSettings() {
  return apiClient.request<SettingMap>('/settings');
}

export function updateSettings(settings: SettingMap) {
  return apiClient.request<SettingMap>('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export function getOnboardingStatus() {
  return apiClient.request('/onboarding/status');
}

