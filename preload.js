const { contextBridge, ipcRenderer } = require('electron');

const backendPortArgument = process.argv.find((argument) => argument.startsWith('--krumer-backend-port='));
const parsedBackendPort = Number.parseInt(backendPortArgument?.split('=')[1] || '', 10);
const backendPort = Number.isInteger(parsedBackendPort) && parsedBackendPort > 0 && parsedBackendPort <= 65535
  ? parsedBackendPort
  : 8765;

contextBridge.exposeInMainWorld('electronAPI', {
  backendBaseUrl: `http://127.0.0.1:${backendPort}`,
  waitForBackendReady: () => ipcRenderer.invoke('backend:wait-until-ready'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startDownload: () => ipcRenderer.invoke('start-download'),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  restartAndInstall: () => ipcRenderer.invoke('restart-and-install'),

  authGetState: () => ipcRenderer.invoke('auth:get-state'),
  authSignIn: (email, password) => ipcRenderer.invoke('auth:sign-in', { email, password }),
  authSignInWithGoogle: () => ipcRenderer.invoke('auth:sign-in-google'),
  authSignUp: (email, password) => ipcRenderer.invoke('auth:sign-up', { email, password }),
  authSendMagicLink: (email) => ipcRenderer.invoke('auth:magic-link', { email }),
  authRequestPasswordReset: (email) => ipcRenderer.invoke('auth:reset-password', { email }),
  authUpdatePassword: (password) => ipcRenderer.invoke('auth:update-password', { password }),
  authSignOut: () => ipcRenderer.invoke('auth:sign-out'),
  onAuthStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('auth:state-changed', listener);
    return () => ipcRenderer.removeListener('auth:state-changed', listener);
  },
  syncTrigger: () => ipcRenderer.invoke('sync:trigger'),
  syncGetStatus: () => ipcRenderer.invoke('sync:get-status'),
  syncGetMetrics: () => ipcRenderer.invoke('sync:get-metrics'),

  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (_event, error) => callback(error));
  }
});
