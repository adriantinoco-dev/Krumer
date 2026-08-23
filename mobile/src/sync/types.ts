export type SyncEntityType = 'progress' | 'list' | 'list_membership' | 'metadata' | 'tag';
export type SyncOperation = 'upsert' | 'delete';

export type MobileOutboxRow = {
  id: string;
  ownerUserId: string | null;
  entityType: SyncEntityType;
  entityKey: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  status: 'pending' | 'syncing' | 'done' | 'error';
  retryCount: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MobileSyncStatus = {
  state: 'signed_out' | 'offline' | 'pending' | 'syncing' | 'synced' | 'error';
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
};
