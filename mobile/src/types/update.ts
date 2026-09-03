export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubReleaseAsset[];
}

export interface GitHubReleaseAsset {
  name: string;
  content_type: string;
  size: number;
  browser_download_url: string;
}

export interface AppUpdate {
  currentVersion: string;
  latestVersion: string;
  title: string;
  releaseNotes: string;
  apkName: string;
  apkUrl: string;
  apkSize: number;
  publishedAt: string;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';
