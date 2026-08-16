import { apiClient } from './client';
import type { Progress, ProgressUpdate } from '../models/progress';

export function getProgress(itemId: number) {
  return apiClient.request<Progress[]>(`/items/${itemId}/progress`);
}

export function saveProgress(itemId: number, progress: ProgressUpdate) {
  return apiClient.request<Progress>(`/items/${itemId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
  });
}

