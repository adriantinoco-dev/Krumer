export type Progress = {
  id: number;
  item_id: number;
  file_path: string;
  progress_pct: number;
  current_page: number;
  total_pages?: number | null;
  cfi?: string | null;
  updated_at: string;
};

export type ProgressUpdate = {
  file_path: string;
  progress_pct: number;
  current_page: number;
  total_pages?: number | null;
  cfi?: string | null;
};

