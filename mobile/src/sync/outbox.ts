import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Book } from '../models/item';
import type { SyncList } from '../models/list';
import { getSupabase } from '../auth/supabase';
import { CLOUD_SYNC_ENABLED } from '../config';
import type { MobileOutboxRow, SyncEntityType, SyncOperation } from './types';

export const OUTBOX_KEY = 'krumer.sync.outbox.v1';
let mutation = Promise.resolve<unknown>(undefined);

export async function loadOutbox(): Promise<MobileOutboxRow[]> {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveOutbox(rows: MobileOutboxRow[]) {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(rows));
}

async function activeUserId() {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

export function mutateOutbox<T>(callback: (rows: MobileOutboxRow[]) => Promise<T> | T): Promise<T> {
  const next = mutation.then(async () => {
    const rows = await loadOutbox();
    const result = await callback(rows);
    await saveOutbox(rows);
    return result;
  });
  mutation = next.catch(() => undefined);
  return next;
}

export async function enqueueMobileWrite(
  entityType: SyncEntityType,
  entityKey: string,
  operation: SyncOperation,
  payload: Record<string, unknown>,
) {
  if (!CLOUD_SYNC_ENABLED) return;
  const ownerUserId = await activeUserId();
  await mutateOutbox((rows) => {
    const now = Date.now();
    const existing = rows.find((row) =>
      row.entityType === entityType
      && row.entityKey === entityKey
      && row.ownerUserId === ownerUserId
      && row.status === 'pending'
    );
    if (existing) {
      if (
        entityType === 'progress'
        && existing.payload.rating_changed
        && !payload.rating_changed
      ) {
        payload = { ...payload, rating_changed: true };
      }
      Object.assign(existing, {
        operation,
        payload,
        retryCount: 0,
        nextAttemptAt: null,
        lastError: null,
        updatedAt: now,
      });
      return;
    }
    rows.push({
      id: `${now}-${Math.random().toString(36).slice(2)}`,
      ownerUserId,
      entityType,
      entityKey,
      operation,
      payload,
      status: 'pending',
      retryCount: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
  });
}

export function enqueueBookProgress(book: Book, ratingChanged = false) {
  return enqueueMobileWrite('progress', book.fingerprint, 'upsert', {
    fingerprint: book.fingerprint,
    title: book.title,
    type: book.children?.length ? 'series' : 'book',
    progress_pct: book.progressPct ?? 0,
    current_page: book.currentPage ?? 0,
    total_pages: book.totalPages ?? null,
    cfi: book.cfi ?? (book.format === 'epub' ? book.progress : null),
    is_read: Boolean(book.isRead || (book.progressPct ?? 0) >= 100),
    rating: book.rating ?? null,
    rating_changed: ratingChanged,
  });
}

export function enqueueSyncList(list: SyncList, operation: SyncOperation = 'upsert') {
  return enqueueMobileWrite('list', list.id, operation, {
    id: list.id,
    name: list.name,
    is_default: list.isDefault,
    sort_order: list.sortOrder,
    created_at: list.createdAt,
  });
}

export function enqueueListMembership(
  list: SyncList,
  fingerprint: string,
  operation: SyncOperation,
) {
  return enqueueMobileWrite(
    'list_membership',
    `${list.id}:${fingerprint}`,
    operation,
    { list_id: list.id, fingerprint },
  );
}

export function enqueueMetadata(book: Book) {
  return enqueueMobileWrite('metadata', book.fingerprint, 'upsert', {
    fingerprint: book.fingerprint,
    title: book.title,
    author: book.author,
    publisher: (book as any).publisher ?? null,
    year: (book as any).year ?? null,
    description: (book as any).description ?? null,
    type: book.children?.length ? 'series' : 'book',
  });
}

export function enqueueTag(book: Book, tagName: string, operation: SyncOperation = 'upsert') {
  const normalized = tagName.trim();
  if (!normalized) return Promise.resolve();
  return enqueueMobileWrite('tag', `${book.fingerprint}:${normalized.toLowerCase()}`, operation, {
    fingerprint: book.fingerprint,
    tag_name: normalized,
  });
}

export async function adoptUnownedRows(userId: string) {
  await mutateOutbox((rows) => {
    for (const row of rows) {
      if (!row.ownerUserId) row.ownerUserId = userId;
      if (row.ownerUserId === userId && row.status === 'syncing') row.status = 'pending';
    }
  });
}
