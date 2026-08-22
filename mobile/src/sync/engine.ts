import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Book } from '../models/item';
import type { SyncList } from '../models/list';
import { supabase } from '../auth/supabase';
import {
  adoptUnownedRows,
  enqueueBookProgress,
  enqueueListMembership,
  enqueueSyncList,
  mutateOutbox,
} from './outbox';
import type { MobileOutboxRow, MobileSyncStatus } from './types';

const BACKOFF_MS = [5_000, 30_000, 120_000, 600_000, 3_600_000];
const LIST_ID_MAP_KEY = 'krumer.sync.list-id-map.v1';
const PENDING_PROGRESS_KEY = 'krumer.sync.pending-progress.v1';
let activeSync: Promise<MobileSyncStatus> | null = null;
let latestInputs: SyncInputs | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let status: MobileSyncStatus = {
  state: 'signed_out',
  pending: 0,
  lastSyncAt: null,
  lastError: null,
};
const listeners = new Set<(next: MobileSyncStatus) => void>();

type SyncInputs = {
  books: Book[];
  lists: SyncList[];
  replaceBooks: (books: Book[]) => Promise<void>;
  replaceLists: (lists: SyncList[]) => Promise<void>;
};

type RemoteProgress = {
  fingerprint: string;
  progress_pct: number;
  current_page: number;
  total_pages: number | null;
  cfi: string | null;
  is_read: boolean;
  rating: number | null;
  updated_at: string;
};

function emit(next: Partial<MobileSyncStatus>) {
  status = { ...status, ...next };
  listeners.forEach((listener) => listener(status));
}

export function subscribeSyncStatus(listener: (next: MobileSyncStatus) => void) {
  listeners.add(listener);
  listener(status);
  return () => { listeners.delete(listener); };
}

export function setMobileOffline() {
  emit({ state: 'offline' });
}

function flattenBooks(books: Book[]): Book[] {
  return books.flatMap((book) => [book, ...flattenBooks(book.children ?? [])]);
}

function updateBookTree(books: Book[], updates: Map<string, RemoteProgress>): Book[] {
  return books.map((book) => {
    const remote = updates.get(book.fingerprint);
    const children = book.children ? updateBookTree(book.children, updates) : book.children;
    if (!remote) return children === book.children ? book : { ...book, children };
    const localPct = book.progressPct ?? 0;
    const remotePct = Number(remote.progress_pct ?? 0);
    const remoteWinsPosition = remotePct > localPct
      || (remotePct === localPct && Number(remote.current_page ?? 0) >= Number(book.currentPage ?? 0));
    return {
      ...book,
      children,
      ...(remoteWinsPosition ? {
        progressPct: remotePct,
        currentPage: remote.current_page ?? 0,
        totalPages: remote.total_pages,
        cfi: remote.cfi,
        progress: book.format === 'epub'
          ? (remote.cfi ?? book.progress)
          : String(remote.current_page || 1),
      } : {}),
      isRead: Boolean(remote.is_read),
      rating: remote.rating,
    };
  });
}

async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

async function ensureInitialBackfill(userId: string, books: Book[], lists: SyncList[]) {
  const key = `krumer.sync.initial:${userId}`;
  if (await AsyncStorage.getItem(key)) return;
  for (const book of flattenBooks(books)) {
    if ((book.progressPct ?? 0) > 0 || book.isRead || book.rating != null) {
      await enqueueBookProgress(book, book.rating != null);
    }
  }
  for (const list of lists) {
    await enqueueSyncList(list);
    for (const fingerprint of list.bookFingerprints) {
      await enqueueListMembership(list, fingerprint, 'upsert');
    }
  }
  await AsyncStorage.setItem(key, 'true');
}

async function setRowResult(rowId: string, error?: unknown) {
  await mutateOutbox((rows) => {
    const row = rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    row.updatedAt = Date.now();
    if (!error) {
      row.status = 'done';
      row.lastError = null;
      row.nextAttemptAt = null;
      return;
    }
    row.retryCount += 1;
    row.status = 'pending';
    row.lastError = error instanceof Error ? error.message : String(error);
    row.nextAttemptAt = Date.now() + BACKOFF_MS[Math.min(row.retryCount - 1, BACKOFF_MS.length - 1)];
  });
}

async function nextDueRow(userId: string): Promise<MobileOutboxRow | null> {
  let selected: MobileOutboxRow | null = null;
  await mutateOutbox((rows) => {
    const now = Date.now();
    const due = rows
      .filter((row) => row.ownerUserId === userId
        && row.status === 'pending'
        && (!row.nextAttemptAt || row.nextAttemptAt <= now))
      .sort((left, right) => {
        const leftOrder = left.entityType === 'list_membership' ? 1 : 0;
        const rightOrder = right.entityType === 'list_membership' ? 1 : 0;
        return leftOrder - rightOrder || left.createdAt - right.createdAt;
      })[0];
    if (due) {
      due.status = 'syncing';
      due.updatedAt = now;
      selected = { ...due, payload: { ...due.payload } };
    }
  });
  return selected;
}

async function remoteListId(localId: string) {
  const map = await getJson<Record<string, string>>(LIST_ID_MAP_KEY, {});
  return map[localId] ?? localId;
}

async function mapListId(localId: string, remoteId: string) {
  const map = await getJson<Record<string, string>>(LIST_ID_MAP_KEY, {});
  map[localId] = remoteId;
  await AsyncStorage.setItem(LIST_ID_MAP_KEY, JSON.stringify(map));
}

async function pushRow(row: MobileOutboxRow, userId: string) {
  const payload = row.payload as Record<string, any>;
  if (row.entityType === 'progress') {
    const { error } = await supabase.rpc('merge_reading_progress', {
      p_fingerprint: payload.fingerprint,
      p_title: payload.title,
      p_type: payload.type,
      p_progress_pct: payload.progress_pct,
      p_current_page: payload.current_page,
      p_total_pages: payload.total_pages,
      p_cfi: payload.cfi,
      p_is_read: payload.is_read,
      p_rating: payload.rating,
      p_rating_changed: Boolean(payload.rating_changed),
    });
    if (error) throw error;
    return;
  }

  if (row.entityType === 'list') {
    const localId = String(payload.id);
    const mappedId = await remoteListId(localId);
    if (row.operation === 'delete') {
      const { error } = await supabase.from('user_lists')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', mappedId);
      if (error) throw error;
      return;
    }

    const { data: byId, error: idError } = await supabase.from('user_lists')
      .select('id')
      .eq('id', mappedId)
      .maybeSingle();
    if (idError) throw idError;
    let targetId = byId?.id as string | undefined;
    if (!targetId) {
      const { data: byName, error: nameError } = await supabase.from('user_lists')
        .select('id')
        .eq('name', payload.name)
        .maybeSingle();
      if (nameError) throw nameError;
      targetId = byName?.id as string | undefined;
    }
    if (targetId) {
      const { error } = await supabase.from('user_lists').update({
        name: payload.name,
        is_default: Boolean(payload.is_default),
        sort_order: Number(payload.sort_order || 0),
        deleted_at: null,
      }).eq('id', targetId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('user_lists').insert({
        id: localId,
        user_id: userId,
        name: payload.name,
        is_default: Boolean(payload.is_default),
        sort_order: Number(payload.sort_order || 0),
      }).select('id').single();
      if (error) throw error;
      targetId = data.id;
    }
    if (!targetId) throw new Error('O Supabase não retornou o id da lista sincronizada.');
    await mapListId(localId, targetId);
    return;
  }

  const listId = await remoteListId(String(payload.list_id));
  const { error } = await supabase.from('list_memberships').upsert({
    user_id: userId,
    list_id: listId,
    fingerprint: payload.fingerprint,
    deleted_at: row.operation === 'delete' ? new Date().toISOString() : null,
  }, { onConflict: 'list_id,fingerprint' });
  if (error) throw error;
}

async function pushOutbox(userId: string) {
  while (true) {
    const row = await nextDueRow(userId);
    if (!row) break;
    try {
      await pushRow(row, userId);
      await setRowResult(row.id);
    } catch (error) {
      await setRowResult(row.id, error);
      throw error;
    }
  }
}

async function changedRows(table: string, userId: string, select: string) {
  const cursorKey = `krumer.sync.cursor:${userId}:${table}`;
  const cursor = await AsyncStorage.getItem(cursorKey);
  const rows: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(select).order('updated_at', { ascending: true });
    if (cursor) query = query.gt('updated_at', cursor);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as unknown as Array<Record<string, any>>;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return { cursorKey, rows };
}

async function activeMemberships() {
  const rows: Array<{ list_id: string; fingerprint: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('list_memberships')
      .select('list_id,fingerprint')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as Array<{ list_id: string; fingerprint: string }>;
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function pullRemote(inputs: SyncInputs, userId: string) {
  const [progressResult, listResult, membershipResult] = await Promise.all([
    changedRows(
      'reading_progress',
      userId,
      'fingerprint,progress_pct,current_page,total_pages,cfi,is_read,rating,updated_at',
    ),
    changedRows(
      'user_lists',
      userId,
      'id,name,is_default,sort_order,created_at,updated_at,deleted_at',
    ),
    activeMemberships(),
  ]);
  const progressRows = progressResult.rows;
  const listRows = listResult.rows;

  const localFingerprints = new Set(flattenBooks(inputs.books).map((book) => book.fingerprint));
  const pending = await getJson<Record<string, RemoteProgress>>(PENDING_PROGRESS_KEY, {});
  for (const remote of progressRows as unknown as RemoteProgress[]) pending[remote.fingerprint] = remote;
  const applicable = new Map<string, RemoteProgress>();
  for (const [fingerprint, remote] of Object.entries(pending)) {
    if (localFingerprints.has(fingerprint)) {
      applicable.set(fingerprint, remote);
      delete pending[fingerprint];
    }
  }
  await AsyncStorage.setItem(PENDING_PROGRESS_KEY, JSON.stringify(pending));
  if (applicable.size) await inputs.replaceBooks(updateBookTree(inputs.books, applicable));

  let nextLists = [...inputs.lists];
  for (const remote of listRows) {
    const existingIndex = nextLists.findIndex((list) => list.id === remote.id || list.name === remote.name);
    if (remote.deleted_at) {
      if (existingIndex >= 0) nextLists.splice(existingIndex, 1);
      continue;
    }
    const existing = existingIndex >= 0 ? nextLists[existingIndex] : null;
    const next: SyncList = {
      id: remote.id,
      name: remote.name,
      isDefault: Boolean(remote.is_default),
      sortOrder: Number(remote.sort_order || 0),
      createdAt: remote.created_at,
      bookFingerprints: existing?.bookFingerprints ?? [],
    };
    if (existing) await mapListId(existing.id, remote.id);
    if (existingIndex >= 0) nextLists[existingIndex] = next;
    else nextLists.push(next);
  }

  const memberships = membershipResult;
  const byList = new Map<string, string[]>();
  for (const membership of memberships as Array<{ list_id: string; fingerprint: string }>) {
    const current = byList.get(membership.list_id) ?? [];
    current.push(membership.fingerprint);
    byList.set(membership.list_id, current);
  }
  nextLists = nextLists.map((list) => ({
    ...list,
    bookFingerprints: byList.get(list.id) ?? [],
  }));
  await inputs.replaceLists(nextLists);
  if (progressRows.length) {
    await AsyncStorage.setItem(
      progressResult.cursorKey,
      progressRows[progressRows.length - 1].updated_at,
    );
  }
  if (listRows.length) {
    await AsyncStorage.setItem(listResult.cursorKey, listRows[listRows.length - 1].updated_at);
  }
}

async function countPending(userId: string) {
  let count = 0;
  await mutateOutbox((rows) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index].status === 'done' && rows[index].updatedAt < cutoff) rows.splice(index, 1);
    }
    count = rows.filter((row) => row.ownerUserId === userId && row.status !== 'done').length;
  });
  return count;
}

async function scheduleRetry(userId: string) {
  let earliest: number | null = null;
  await mutateOutbox((rows) => {
    for (const row of rows) {
      if (row.ownerUserId !== userId || row.status !== 'pending') continue;
      const dueAt = row.nextAttemptAt ?? Date.now() + 250;
      earliest = earliest == null ? dueAt : Math.min(earliest, dueAt);
    }
  });
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (earliest == null) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (latestInputs) void runMobileSync(latestInputs);
  }, Math.max(250, earliest - Date.now()));
}

async function performSync(inputs: SyncInputs): Promise<MobileSyncStatus> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    emit({ state: 'signed_out', pending: 0 });
    return status;
  }
  emit({ state: 'syncing', lastError: null });
  try {
    await adoptUnownedRows(userId);
    await ensureInitialBackfill(userId, inputs.books, inputs.lists);
    await pushOutbox(userId);
    await pullRemote(inputs, userId);
    emit({
      state: 'synced',
      pending: await countPending(userId),
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    });
    await scheduleRetry(userId);
  } catch (nextError) {
    emit({
      state: 'error',
      pending: await countPending(userId),
      lastError: nextError instanceof Error ? nextError.message : String(nextError),
    });
    await scheduleRetry(userId);
  }
  return status;
}

export function runMobileSync(inputs: SyncInputs) {
  latestInputs = inputs;
  if (!activeSync) {
    activeSync = performSync(inputs).finally(() => { activeSync = null; });
  }
  return activeSync;
}
