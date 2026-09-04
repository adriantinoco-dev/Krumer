import { useCallback, useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { useApp } from '../context/AppContext';
import type { AppUpdate, UpdateStatus } from '../types/update';
import { getLatestRelease, downloadApk, installApk, openInstallPermissionSettings } from '../services/updateService';
import { isNewerVersion } from '../utils/version';
import { patchPreferences } from '../storage/preferences';

const CHECK_DEBOUNCE_MS = 4 * 60 * 60 * 1000; // 4 hours

function getCurrentVersion(): string {
  return Constants.expoConfig?.version ?? '0.2.0';
}

export type CheckUpdateResult =
  | { status: 'available'; update: AppUpdate }
  | { status: 'upToDate' }
  | { status: 'error'; error?: string };

export type UseAppUpdateReturn = {
  status: UpdateStatus;
  updateInfo: AppUpdate | null;
  downloadProgress: number;
  error: string | null;
  checkForUpdate: (silent?: boolean) => Promise<CheckUpdateResult>;
  startDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openSettings: () => Promise<void>;
  dismissUpdate: () => void;
  ignoreVersion: () => Promise<void>;
};

export function useAppUpdate(): UseAppUpdateReturn {
  const { preferences, ready, t } = useApp();

  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<AppUpdate | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const checkingRef = useRef(false);
  const downloadingRef = useRef(false);
  const localApkUriRef = useRef<string | null>(null);

  const currentVersion = getCurrentVersion();

  const checkForUpdate = useCallback(async (silent = true): Promise<CheckUpdateResult> => {
    if (checkingRef.current) return { status: 'upToDate' };
    checkingRef.current = true;

    try {
      if (!silent) setStatus('checking');

      const release = await getLatestRelease();
      if (!release) {
        if (!silent) setStatus('idle');
        return { status: 'upToDate' };
      }

      release.currentVersion = currentVersion;

      if (!isNewerVersion(release.latestVersion, currentVersion)) {
        if (!silent) setStatus('idle');
        return { status: 'upToDate' };
      }

      if (preferences.ignoredVersion === release.latestVersion) {
        if (!silent) setStatus('idle');
        return { status: 'upToDate' };
      }

      setUpdateInfo(release);
      setStatus('available');

      await patchPreferences({ lastUpdateCheck: Date.now() });
      return { status: 'available', update: release };
    } catch (err) {
      if (!silent) setStatus('idle');
      return { status: 'error', error: err instanceof Error ? err.message : undefined };
    } finally {
      checkingRef.current = false;
    }
  }, [currentVersion, preferences.ignoredVersion]);

  const startDownload = useCallback(async () => {
    if (!updateInfo || downloadingRef.current) return;
    downloadingRef.current = true;

    try {
      setStatus('downloading');
      setDownloadProgress(0);
      setError(null);

      const uri = await downloadApk(
        updateInfo.apkUrl,
        updateInfo.latestVersion,
        (pct) => setDownloadProgress(pct),
      );

      localApkUriRef.current = uri;
      setStatus('downloaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setStatus('error');
    } finally {
      downloadingRef.current = false;
    }
  }, [updateInfo]);

  const installUpdate = useCallback(async () => {
    if (!localApkUriRef.current) return;

    try {
      await installApk(localApkUriRef.current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      if (msg === 'INSTALL_PERMISSION_MISSING') {
        setError('INSTALL_PERMISSION_MISSING');
      } else {
        setError(msg);
      }
      setStatus('error');
    }
  }, []);

  const openSettings = useCallback(async () => {
    await openInstallPermissionSettings();
  }, []);

  const dismissUpdate = useCallback(() => {
    setStatus('idle');
    setUpdateInfo(null);
    setDownloadProgress(0);
    setError(null);
    setDismissed(true);
    localApkUriRef.current = null;
  }, []);

  const ignoreVersion = useCallback(async () => {
    if (!updateInfo) return;
    await patchPreferences({ ignoredVersion: updateInfo.latestVersion });
    dismissUpdate();
  }, [updateInfo, dismissUpdate]);

  // Auto-check on startup (silent, triggers on every launch per F7 spec)
  useEffect(() => {
    if (!ready || !preferences.hasOnboarded || dismissed) return;

    void checkForUpdate(true);
  }, [ready, preferences.hasOnboarded, dismissed, checkForUpdate]);

  // Debug: expose force-show on window for testing
  useEffect(() => {
    if (__DEV__) {
      (window as any).__krumerUpdateForceShow = () => {
        const cv = getCurrentVersion();
        setUpdateInfo({
          currentVersion: cv,
          latestVersion: '99.0.0',
          title: 'Krumer 99.0.0',
          releaseNotes: `Esta versão foca em organização da biblioteca, personalização do leitor e conveniências no dia a dia\n\n## O que mudou\n\n🔢 **F1 - Contador de itens recursivo**\nO número ao lado de "Minha Biblioteca" agora soma os livros dentro de subpastas e coleções, não só os do nível raiz.\n\n⌨️ **F2 - Menu de atalhos nas Configurações**\nUma nova seção lista todos os atalhos do app, organizados por contexto (Geral, Biblioteca, Leitura), direto do \`shortcutsMap\`.\n\n🖼️ **F3 - Restaurar capa original**\nNa edição de metadados, um botão permite voltar à capa original do arquivo a qualquer momento.\n\n🔄 **F4 - Rescan automático**\nA biblioteca é reescaneada sozinha ao sair da leitura ou trocar de aba, sincronizando o que foi adicionado ou removido sem travar a interface.\n\n🌐 **F5 - Seleção de idioma no onboarding**\nO idioma agora é escolhido logo no primeiro passo da configuração inicial, e fica salvo.\n\n🗂️ **F6 - Visualização de capítulos**\nEscolha entre "Somente Título" ou "Título + Capa" para a lista de capítulos, com a preferência salva localmente.\n\n🔔 **F7 - Tela de atualização com changelog**\nAs notificações de nova versão agora puxam o changelog direto do GitHub Releases e mostram o que mudou\n\n## Correções\n\n🐛 **Sincronização de status de leitura**\n\nO status de leitura agora é propagado corretamente entre livros pai e filhos.\n\n- "Continuar Lendo" passou a exibir o capítulo (livro filho) em leitura, com progresso e capa próprios, em vez da série pai; clique retoma a leitura do arquivo diretamente`,
          apkName: 'krumer-v99.0.0.apk',
          apkUrl: 'https://example.com/krumer-v99.0.0.apk',
          apkSize: 50_000_000,
          publishedAt: new Date().toISOString(),
        });
        setStatus('available');
      };
    }
  }, [currentVersion]);

  return {
    status,
    updateInfo,
    downloadProgress,
    error,
    checkForUpdate,
    startDownload,
    installUpdate,
    openSettings,
    dismissUpdate,
    ignoreVersion,
  };
}
