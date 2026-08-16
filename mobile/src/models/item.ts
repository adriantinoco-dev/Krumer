import type { Progress } from './progress';
import type { Tag } from './tag';

export type ItemType = 'book' | 'series' | 'comic' | 'graphic_novel' | 'chapter';
export type BookFormat = 'epub' | 'pdf';

export type Book = {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  filePath: string;
  coverPath: string | null;
  rating?: number | null;
  progress: string | null;
  childrenCount?: number | null;
  parentId?: string | null;
  children?: Book[];
  addedAt: number;
};

export type Item = {
  id: number;
  title: string;
  metadata_title?: string | null;
  filename_title?: string | null;
  type: ItemType;
  path: string;
  cover_path?: string | null;
  cover_original_path?: string | null;
  author?: string | null;
  publisher?: string | null;
  year?: number | null;
  description?: string | null;
  rating?: number | null;
  parent_id?: number | null;
  last_read?: string | null;
  is_read: boolean;
  added_at: string;
  tags: Tag[];
  progress: Progress[];
  children_count?: number;
  overall_progress?: number;
};

export type ItemUpdate = {
  title?: string;
  author?: string | null;
  publisher?: string | null;
  year?: number | null;
  description?: string | null;
  rating?: number | null;
  tags?: string[];
  is_read?: boolean;
};

