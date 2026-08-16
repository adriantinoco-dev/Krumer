import { apiClient } from './client';
import type { UserList } from '../models/list';
import type { Item } from '../models/item';

export function getLists() {
  return apiClient.request<UserList[]>('/lists');
}

export function getListItems(listId: number) {
  return apiClient.request<Item[]>(`/lists/${listId}/items`);
}

export function addItemsToList(listId: number, itemIds: number[]) {
  return apiClient.request(`/lists/${listId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_ids: itemIds }),
  });
}

export function removeItemFromList(listId: number, itemId: number) {
  return apiClient.request(`/lists/${listId}/items/${itemId}`, {
    method: 'DELETE',
  });
}

