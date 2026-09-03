import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { AppUpdate, GitHubRelease } from '../types/update';
import { normalizeVersion } from '../utils/version';

const GITHUB_OWNER = 'adriantinoco-dev';
const GITHUB_REPO = 'Krumer';
const RELEASE_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const FETCH_TIMEOUT_MS = 10_000;
const UPDATE_DIR = 'update/';

function getUpdateDir(): string {
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  return `${cacheDir}${UPDATE_DIR}`;
}

function getApkPath(version: string): string {
  return `${getUpdateDir()}krumer-v${normalizeVersion(version)}.apk`;
}

export async function getLatestRelease(): Promise<AppUpdate | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const release: GitHubRelease = await response.json();

    if (release.draft || release.prerelease) return null;

    const apk = release.assets.find(
      (a) => a.name.toLowerCase().endsWith('.apk'),
    );
    if (!apk) return null;

    return {
      currentVersion: '',
      latestVersion: normalizeVersion(release.tag_name),
      title: release.name ?? `Krumer ${normalizeVersion(release.tag_name)}`,
      releaseNotes: release.body ?? '',
      apkName: apk.name,
      apkUrl: apk.browser_download_url,
      apkSize: apk.size,
      publishedAt: release.published_at,
    };
  } catch {
    return null;
  }
}

async function cleanOldApks(): Promise<void> {
  try {
    const dir = getUpdateDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return;

    const files = await FileSystem.readDirectoryAsync(dir);
    for (const file of files) {
      if (file.endsWith('.apk')) {
        await FileSystem.deleteAsync(`${dir}${file}`, { idempotent: true });
      }
    }
  } catch {
    /* ignore cleanup errors */
  }
}

export async function downloadApk(
  apkUrl: string,
  version: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  await cleanOldApks();

  const dir = getUpdateDir();
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }

  const apkPath = getApkPath(version);
  const downloadResumable = FileSystem.createDownloadResumable(
    apkUrl,
    apkPath,
    {},
    (dl) => {
      if (dl.totalBytesExpectedToWrite > 0) {
        const pct = Math.round(
          (dl.totalBytesWritten / dl.totalBytesExpectedToWrite) * 100,
        );
        onProgress?.(pct);
      }
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error('Download failed');

  return result.uri;
}

export async function installApk(localUri: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('APK installation is only supported on Android');
  }

  const IntentLauncher = require('expo-intent-launcher').default;
  const contentUri = await FileSystem.getContentUriAsync(localUri);

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  } catch (err: any) {
    // err.code === 'ERR_ACTIVITY_NOT_FOUND' when no handler or permission denied
    if (err?.message?.includes('INSTALL_FAILED') || err?.code === 'ERR_ACTIVITY_NOT_FOUND') {
      throw new Error('INSTALL_PERMISSION_MISSING');
    }
    throw err;
  }
}

export async function openInstallPermissionSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const IntentLauncher = require('expo-intent-launcher').default;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_UNKNOWN_APP_SOURCES',
      { data: 'package:com.adriantinoco.krumer' },
    );
  } catch {
    try {
      await IntentLauncher.startActivityAsync('android.settings.SETTINGS');
    } catch { /* ignore */ }
  }
}
