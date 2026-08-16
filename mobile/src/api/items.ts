import { apiClient } from './client';
import type { Item, ItemUpdate } from '../models/item';

export type GetItemsParams = {
  parent_id?: number | null;
  type?: string;
  search?: string;
  tag?: string;
  sort_by?: string;
  order?: 'asc' | 'desc';
  exclude_language?: string;
};

export function getItems(params: GetItemsParams = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiClient.request<Item[]>(`/items${suffix}`);
}

export function getItem(id: number) {
  return apiClient.request<Item>(`/items/${id}`);
}

export function updateItem(id: number, data: ItemUpdate) {
  return apiClient.request<Item>(`/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateItemReadStatus(id: number, isRead: boolean) {
  return apiClient.request<Item>(`/items/${id}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_read: isRead }),
  });
}

export function getCoverUrl(id: number) {
  return `${apiClient.getBaseUrl()}/items/${id}/cover`;
}

export function getFileUrl(filePath: string) {
  return `${apiClient.getBaseUrl()}/files?path=${encodeURIComponent(filePath)}`;
}

