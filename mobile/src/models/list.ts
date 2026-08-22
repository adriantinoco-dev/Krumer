export type UserList = {
  id: number;
  name: string;
  sort_order: number;
  is_default: boolean;
  created_at: string;
  item_count: number;
};

export type SyncList = {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  bookFingerprints: string[];
};

