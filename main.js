const { app, BrowserWindow, dialog, ipcMain, shell, screen } = require('electron');
const { autoUpdater, CancellationToken } = require('electron-updater');
const { AuthService } = require('./auth-service');
const { CLOUD_SYNC_ENABLED } = require('./auth-config');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { selectBackendPort } = require('./backend-port');

let mainWindow = null;
let pyProcess = null;
let cancellationToken = null;
let authService = null;
let backendPort = 8765;
let backendReady = false;
let backendReadyPromise = Promise.resolve(false);
const syncBridgeToken = crypto.randomBytes(32).toString('hex');
let pendingAuthUrl = process.argv.find((arg) => arg.startsWith('krumer://')) || null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

async function handleAuthUrl(url) {
  if (!CLOUD_SYNC_ENABLED) return;
  if (!url) return;
  if (!authService) {
    pendingAuthUrl = url;
    return;
  }
  try {
    await authService.handleCallback(url);
    focusMainWindow();
  } catch (error) {
    console.error('[Auth] Falha ao processar callback:', error.message);
    if (mainWindow) {
      const currentState = authService ? await authService.getState() : {
        authenticated: false,
        recovery: false,
        user: null
      };
      mainWindow.webContents.send('auth:state-changed', { ...currentState, error: error.message });
    }
  }
}

app.on('second-instance', (_event, commandLine) => {
  const authUrl = commandLine.find((arg) => arg.startsWith('krumer://'));
  void handleAuthUrl(authUrl);
  focusMainWindow();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  void handleAuthUrl(url);
});

// Configurações do autoUpdater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Em dev, ativa modo de atualização para testes locais
if (!app.isPackaged) {
  autoUpdater.forceDevUpdateConfig = true;
}

/**
 * Procura o executável do backend compilado (.exe).
 */
function getBackendExecutablePath() {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'krumer-backend.exe' : 'krumer-backend';
  
  const isDev = !app.isPackaged;
  const devExe = path.join(__dirname, 'resources', exeName);
  const prodExe = path.join(process.resourcesPath, 'resources', exeName);
  const prodExeRoot = path.join(process.resourcesPath, exeName);

  if (isDev && fs.existsSync(devExe)) {
    return devExe;
  }
  if (!isDev && fs.existsSync(prodExe)) {
    return prodExe;
  }
  if (!isDev && fs.existsSync(prodExeRoot)) {
    return prodExeRoot;
  }
  return null;
}

/**
 * Procura o executável Python adequado (virtualenv do projeto ou do sistema).
 */
function getPythonExecutable() {
  const isWin = process.platform === 'win32';
  const venvPython = isWin
    ? path.join(__dirname, 'backend', '.venv', 'Scripts', 'python.exe')
    : path.join(__dirname, 'backend', '.venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return isWin ? 'python' : 'python3';
}

/**
 * Inicia o servidor backend FastAPI em Python como processo filho.
 */
function startPythonBackend() {
  backendReady = false;
  const exePath = getBackendExecutablePath();

  if (exePath) {
    console.log(`Iniciando backend empacotado (.exe): ${exePath}`);
    pyProcess = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        KRUMER_BACKEND_RELOAD: '0',
        KRUMER_API_PORT: String(backendPort),
        KRUMER_SYNC_BRIDGE_TOKEN: syncBridgeToken,
        KRUMER_CLOUD_SYNC_ENABLED: CLOUD_SYNC_ENABLED ? '1' : '0'
      }
    });
  } else {
    const pythonBin = getPythonExecutable();
    const scriptPath = path.join(__dirname, 'backend', 'main.py');
    const backendDir = path.join(__dirname, 'backend');

    console.log(`Iniciando backend Python via script: ${pythonBin} ${scriptPath}`);

    pyProcess = spawn(pythonBin, [scriptPath], {
      cwd: backendDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        KRUMER_BACKEND_RELOAD: '0',
        KRUMER_API_PORT: String(backendPort),
        KRUMER_SYNC_BRIDGE_TOKEN: syncBridgeToken,
        KRUMER_CLOUD_SYNC_ENABLED: CLOUD_SYNC_ENABLED ? '1' : '0'
      }
    });
  }

  const startedProcess = pyProcess;

  startedProcess.stdout.on('data', (data) => {
    console.log(`[Backend stdout]: ${data}`);
  });

  startedProcess.stderr.on('data', (data) => {
    console.error(`[Backend stderr]: ${data}`);
  });

  startedProcess.on('error', (error) => {
    console.error('[Backend] Falha ao iniciar o processo Python:', error);
  });

  startedProcess.on('close', (code, signal) => {
    console.log(`Processo backend encerrado com código ${code} e sinal ${signal || 'nenhum'}.`);
    if (pyProcess === startedProcess) {
      backendReady = false;
      pyProcess = null;
    }
  });
}

/**
 * Encerra o processo filho do Python ao fechar o app.
 */
function stopPythonBackend() {
  backendReady = false;
  const processToStop = pyProcess;
  pyProcess = null;
  if (!processToStop) return;

  console.log('Encerrando servidor backend Python...');
  try {
    const signalSent = processToStop.kill('SIGTERM');
    if (!signalSent) {
      console.warn('[Backend] O processo Python já estava encerrado.');
    }
  } catch (err) {
    console.error('[Backend] Falha ao encerrar o processo Python:', err);
  }
}

/**
 * Verifica se a API FastAPI já está pronta para aceitar requisições.
 */
function waitForBackend(timeoutMs = 20000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      callSyncBackend('GET', '/sync/status', null, 1000)
        .then(() => resolve(true))
        .catch(retry);
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error('Timeout aguardando inicialização do servidor backend Python.'));
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

function callSyncBackend(method, route, body = null, timeoutMs = 10000) {
  const payload = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: backendPort,
      path: route,
      method,
      headers: {
        'X-Krumer-Sync-Bridge': syncBridgeToken,
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        } : {})
      },
      timeout: timeoutMs
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        let parsed = {};
        try { parsed = raw ? JSON.parse(raw) : {}; } catch (_error) { parsed = { raw }; }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(parsed);
        else reject(new Error(parsed.detail || `Backend de sync respondeu ${response.statusCode}.`));
      });
    });
    request.on('timeout', () => request.destroy(new Error('Timeout no backend de sync.')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function syncAuthToBackend() {
  if (!CLOUD_SYNC_ENABLED || !authService || !pyProcess || !backendReady) return;
  try {
    const credentials = await authService.getSyncCredentials();
    if (!credentials) {
      await callSyncBackend('DELETE', '/sync/session');
      return;
    }
    await callSyncBackend('PUT', '/sync/session', {
      access_token: credentials.accessToken,
      user_id: credentials.userId,
      expires_at: credentials.expiresAt
    });
  } catch (error) {
    console.warn('[Sync] Não foi possível atualizar a sessão do backend:', error.message);
  }
}

/**
 * Cria a janela principal do aplicativo Electron.
 */
async function createWindow() {
  const iconPath = path.join(__dirname, 'frontend', 'assets', 'Krumer-icon.ico');
  const initialWorkArea = screen.getPrimaryDisplay().workArea;
  backendPort = await selectBackendPort();
  if (backendPort !== 8765) {
    console.warn(`[Backend] Porta 8765 ocupada; usando a porta local ${backendPort}.`);
  }

  mainWindow = new BrowserWindow({
    x: initialWorkArea.x,
    y: initialWorkArea.y,
    width: initialWorkArea.width,
    height: initialWorkArea.height,
    minWidth: 900,
    minHeight: 600,
    icon: iconPath,
    title: 'Krumer',
    show: false, // evita flash antes de maximizar
    opacity: process.platform === 'win32' ? 0 : 1,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--krumer-backend-port=${backendPort}`],
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  // No Windows, maximize() torna a janela visível antes do renderer terminar
  // de se ajustar à moldura maximizada. Ela permanece transparente até dois
  // frames após o evento de maximização para o loading nascer no centro final.
  mainWindow.once('ready-to-show', () => {
    const windowToShow = mainWindow;
    if (process.platform !== 'win32') {
      windowToShow.maximize();
      windowToShow.show();
      return;
    }

    let revealStarted = false;
    const revealAfterStableLayout = () => {
      if (revealStarted || windowToShow.isDestroyed()) return;
      revealStarted = true;
      windowToShow.webContents.executeJavaScript(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
      ).finally(() => {
        if (windowToShow.isDestroyed()) return;
        windowToShow.setOpacity(1);
        windowToShow.show();
      });
    };

    windowToShow.once('maximize', revealAfterStableLayout);
    windowToShow.maximize();
    setTimeout(revealAfterStableLayout, 250);
  });

  // Abre links externos no navegador padrão do sistema (não dentro do Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.setMenuBarVisibility(false);

  // Inicia o backend em paralelo para que a tela de abertura já fique visível.
  startPythonBackend();
  backendReadyPromise = waitForBackend()
    .then(async () => {
      backendReady = true;
      console.log(`Backend iniciado e autenticado na porta ${backendPort}.`);
      if (CLOUD_SYNC_ENABLED) await syncAuthToBackend();
      return true;
    })
    .catch((err) => {
      console.error('Falha ao aguardar o backend:', err);
      return false;
    });

  // Carrega a interface do frontend local
  const frontendPath = path.join(__dirname, 'frontend', 'index.html');
  await mainWindow.loadFile(frontendPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handlers IPC para comunicação Frontend <-> Electron Main
ipcMain.handle('backend:wait-until-ready', () => (
  backendReady ? Promise.resolve(true) : backendReadyPromise
));

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return { status: 'cancelled', path: null };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar pasta de livros',
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return { status: 'success', path: result.filePaths[0] };
  }
  return { status: 'cancelled', path: null };
});

ipcMain.handle('check-for-updates', async () => {
  console.log('[Update] check-for-updates chamado');
  try {
    const result = await autoUpdater.checkForUpdates();
    console.log('[Update] checkForUpdates resultado:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[Update] erro na verificação:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', err ? err.message || err.toString() : 'Erro ao checar atualizações');
    }
  }
});

ipcMain.handle('start-download', async () => {
  try {
    cancellationToken = new CancellationToken();
    return await autoUpdater.downloadUpdate(cancellationToken);
  } catch (err) {
    if (mainWindow) {
      mainWindow.webContents.send('update-error', err ? err.message || err.toString() : 'Erro ao iniciar download');
    }
  }
});

ipcMain.handle('cancel-download', async () => {
  if (cancellationToken) {
    cancellationToken.cancel();
    cancellationToken = null;
  }
});

ipcMain.handle('restart-and-install', () => {
  autoUpdater.quitAndInstall(true, true);
});

function requireAuthService() {
  if (!CLOUD_SYNC_ENABLED) throw new Error('A sincronização com a nuvem está indisponível durante o beta.');
  if (!authService) throw new Error('O serviço de autenticação ainda não está pronto.');
  return authService;
}

function getDisabledSyncStatus() {
  return {
    state: 'disabled',
    pending: 0,
    last_sync_at: null,
    last_error: 'A sincronização com a nuvem está indisponível durante o beta.'
  };
}

ipcMain.handle('auth:get-state', () => requireAuthService().getState());
ipcMain.handle('auth:sign-in', (_event, { email, password }) => requireAuthService().signIn(email, password));
ipcMain.handle('auth:sign-in-google', async () => {
  const url = await requireAuthService().getGoogleOAuthUrl();
  await shell.openExternal(url);
  return { opened: true };
});
ipcMain.handle('auth:sign-up', (_event, { email, password }) => requireAuthService().signUp(email, password));
ipcMain.handle('auth:magic-link', (_event, { email }) => requireAuthService().sendMagicLink(email));
ipcMain.handle('auth:reset-password', (_event, { email }) => requireAuthService().requestPasswordReset(email));
ipcMain.handle('auth:update-password', (_event, { password }) => requireAuthService().updatePassword(password));
ipcMain.handle('auth:sign-out', () => requireAuthService().signOut());
ipcMain.handle('sync:trigger', () => (
  CLOUD_SYNC_ENABLED ? callSyncBackend('POST', '/sync/trigger') : getDisabledSyncStatus()
));
ipcMain.handle('sync:get-status', () => (
  CLOUD_SYNC_ENABLED ? callSyncBackend('GET', '/sync/status') : getDisabledSyncStatus()
));
ipcMain.handle('sync:get-metrics', () => (
  CLOUD_SYNC_ENABLED ? callSyncBackend('GET', '/sync/metrics') : getDisabledSyncStatus()
));

// Eventos do electron-updater repassados para o Renderer Process
autoUpdater.on('update-available', (info) => {
  console.log('[Update] update-available:', JSON.stringify(info));
  if (mainWindow) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log('[Update] download-progress:', progressObj.percent);
  if (mainWindow) mainWindow.webContents.send('download-progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[Update] update-downloaded:', JSON.stringify(info));
  if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
});

autoUpdater.on('error', (err) => {
  console.error('[Update] erro do autoUpdater:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err ? err.message || err.toString() : 'Falha na atualização');
  }
});

// Ciclo de vida da aplicação Electron
app.whenReady().then(async () => {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('krumer', process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('krumer');
  }

  if (CLOUD_SYNC_ENABLED) {
    authService = new AuthService(app.getPath('userData'));
    authService.setStateListener((state) => {
      if (mainWindow) mainWindow.webContents.send('auth:state-changed', state);
      void syncAuthToBackend();
    });
    await authService.initialize();
  }

  if (CLOUD_SYNC_ENABLED && pendingAuthUrl) {
    const url = pendingAuthUrl;
    pendingAuthUrl = null;
    await handleAuthUrl(url);
  }

  await createWindow();
});

app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopPythonBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
