const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { autoUpdater, CancellationToken } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let pyProcess = null;
let cancellationToken = null;

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
  const exePath = getBackendExecutablePath();

  if (exePath) {
    console.log(`Iniciando backend empacotado (.exe): ${exePath}`);
    pyProcess = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
  } else {
    const pythonBin = getPythonExecutable();
    const scriptPath = path.join(__dirname, 'backend', 'main.py');
    const backendDir = path.join(__dirname, 'backend');

    console.log(`Iniciando backend Python via script: ${pythonBin} ${scriptPath}`);

    pyProcess = spawn(pythonBin, [scriptPath], {
      cwd: backendDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
  }

  pyProcess.stdout.on('data', (data) => {
    console.log(`[Backend stdout]: ${data}`);
  });

  pyProcess.stderr.on('data', (data) => {
    console.error(`[Backend stderr]: ${data}`);
  });

  pyProcess.on('close', (code) => {
    console.log(`Processo backend encerrado com código: ${code}`);
  });
}

/**
 * Encerra o processo filho do Python ao fechar o app.
 */
function stopPythonBackend() {
  if (pyProcess) {
    console.log('Encerrando servidor backend Python...');
    if (process.platform === 'win32') {
      try {
        const { spawnSync } = require('child_process');
        spawnSync('taskkill', ['/pid', pyProcess.pid, '/f', '/t']);
      } catch (err) {
        pyProcess.kill();
      }
    } else {
      pyProcess.kill('SIGTERM');
    }
    pyProcess = null;
  }
}

/**
 * Verifica se a API FastAPI já está pronta para aceitar requisições.
 */
function waitForBackend(url, timeoutMs = 20000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
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

/**
 * Cria a janela principal do aplicativo Electron.
 */
async function createWindow() {
  const iconPath = path.join(__dirname, 'frontend', 'assets', 'Krumer-icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: iconPath,
    title: 'Krumer',
    show: false, // evita flash antes de maximizar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  // Inicia sempre maximizado
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Abre links externos no navegador padrão do sistema (não dentro do Electron)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.setMenuBarVisibility(false);

  // Inicia o backend Python e aguarda estar online
  startPythonBackend();

  try {
    await waitForBackend('http://127.0.0.1:8765/onboarding/status');
    console.log('Backend iniciado e responsivo na porta 8765.');
  } catch (err) {
    console.error('Falha ao aguardar o backend:', err);
  }

  // Carrega a interface do frontend local
  const frontendPath = path.join(__dirname, 'frontend', 'index.html');
  mainWindow.loadFile(frontendPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handlers IPC para comunicação Frontend <-> Electron Main
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

ipcMain.handle('select-background-image', async () => {
  if (!mainWindow) return { status: 'cancelled', path: null };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar imagem de fundo',
    properties: ['openFile'],
    filters: [
      { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ]
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
  autoUpdater.quitAndInstall(false, true);
});

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
app.whenReady().then(createWindow);

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
