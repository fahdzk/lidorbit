const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('original-fs');
const os = require('os');

let win = null;

function getInstallDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'LidOrbit');
  } else if (process.platform === 'darwin') {
    return '/Applications/LidOrbit.app';
  } else {
    return path.join(os.homedir(), '.local', 'share', 'LidOrbit');
  }
}

function checkDependencies() {
  const issues = [];
  if (process.platform === 'win32') {
    const system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    
    // Check for vcruntime140.dll (Visual C++ 2015-2022 Redistributable)
    const vcRuntimePath = path.join(system32, 'vcruntime140.dll');
    if (!fs.existsSync(vcRuntimePath)) {
      issues.push({
        name: 'Microsoft Visual C++ Redistributable (x64) is required.',
        linkText: 'Download VC++ Redistributable',
        url: 'https://aka.ms/vs/17/release/vc_redist.x64.exe'
      });
    }

    // Check for powercfg.exe
    const powercfgPath = path.join(system32, 'powercfg.exe');
    if (!fs.existsSync(powercfgPath)) {
      issues.push({
        name: 'Windows powercfg utility is missing.',
        linkText: 'System Requirements Guide',
        url: 'https://www.lidorbit.com/licenses'
      });
    }
  } else if (process.platform === 'darwin') {
    // Check for caffeinate
    if (!fs.existsSync('/usr/bin/caffeinate') && !fs.existsSync('/usr/sbin/caffeinate')) {
      issues.push({
        name: 'macOS caffeinate utility is missing.',
        linkText: 'System Requirements Guide',
        url: 'https://www.lidorbit.com/licenses'
      });
    }
  }
  return issues;
}

function createWindow() {
  win = new BrowserWindow({
    width: 380,
    height: 380,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  win.center();

  win.once('ready-to-show', () => {
    win.show();
    if (process.platform === 'win32') {
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.setBackgroundColor('#00000000');
        }
      }, 100);
    }
    if (process.platform === 'darwin') {
      win.setVibrancy(null);
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

// IPC Drag Fallback Logic
let isDragging = false;
let startCursorOffset = { x: 0, y: 0 };

ipcMain.handle('drag-start', (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  if (!browserWindow) return;
  const cursor = screen.getCursorScreenPoint();
  const winBounds = browserWindow.getBounds();
  startCursorOffset = {
    x: cursor.x - winBounds.x,
    y: cursor.y - winBounds.y
  };
  isDragging = true;
});

ipcMain.handle('drag-move', (event) => {
  if (!isDragging) return;
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  if (!browserWindow) return;
  const cursor = screen.getCursorScreenPoint();
  browserWindow.setBounds({
    x: cursor.x - startCursorOffset.x,
    y: cursor.y - startCursorOffset.y,
    width: 380,
    height: 380
  });
});

ipcMain.handle('drag-end', () => {
  isDragging = false;
});

// Custom Minimize and Close handlers
ipcMain.handle('minimize-window', (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  if (browserWindow) browserWindow.minimize();
});

ipcMain.handle('close-window', (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  if (browserWindow) browserWindow.close();
});

ipcMain.handle('get-install-dir', () => {
  return getInstallDir();
});

ipcMain.handle('check-dependencies', () => {
  return checkDependencies();
});

ipcMain.handle('open-external', async (event, url) => {
  const allowedUrls = [
    'https://www.lidorbit.com/licenses',
    'https://www.lidorbit.com/privacy-policy',
    'https://www.lidorbit.com/license',
    'https://aka.ms/vs/17/release/vc_redist.x64.exe'
  ];
  if (allowedUrls.includes(url)) {
    await shell.openExternal(url);
  }
});

ipcMain.handle('launch-app', () => {
  const installDir = getInstallDir();
  let targetExe = '';
  if (process.platform === 'win32') {
    targetExe = path.join(installDir, 'LIDORBIT.exe');
  } else if (process.platform === 'darwin') {
    targetExe = '/Applications/LidOrbit.app';
  }
  
  if (targetExe && fs.existsSync(targetExe)) {
    if (process.platform === 'win32') {
      const { spawn } = require('child_process');
      const child = spawn(targetExe, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } else if (process.platform === 'darwin') {
      const { exec } = require('child_process');
      exec(`open "${targetExe}"`);
    }
  }
});

function getPayloadSourceDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app-payload');
  } else {
    return path.join(__dirname, 'extraResources');
  }
}

function getAllFiles(dirPath, originalDirPath = dirPath) {
  let files = [];
  const list = fs.readdirSync(dirPath);
  for (const item of list) {
    const absolutePath = path.join(dirPath, item);
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      files = files.concat(getAllFiles(absolutePath, originalDirPath));
    } else {
      const relativePath = path.relative(originalDirPath, absolutePath);
      files.push({
        relativePath,
        absolutePath,
        size: stat.size
      });
    }
  }
  return files;
}

function copyFileWithProgress(src, dest, onProgressChunk) {
  return new Promise((resolve, reject) => {
    const rd = fs.createReadStream(src);
    const wr = fs.createWriteStream(dest);
    
    rd.on('error', err => {
      wr.destroy();
      reject(err);
    });
    wr.on('error', err => {
      rd.destroy();
      reject(err);
    });
    
    rd.on('data', chunk => {
      onProgressChunk(chunk.length);
    });
    
    wr.on('close', () => {
      resolve();
    });
    
    rd.pipe(wr);
  });
}

// Installation loop
ipcMain.handle('start-install', async (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  if (!browserWindow) return;

  const installDir = getInstallDir();
  const payloadDir = getPayloadSourceDir();

  try {
    if (!fs.existsSync(payloadDir)) {
      throw new Error(`Payload source directory not found: ${payloadDir}`);
    }

    const files = getAllFiles(payloadDir);
    if (files.length === 0) {
      throw new Error(`No installation files found in payload: ${payloadDir}`);
    }

    // Ensure target base directory exists
    fs.mkdirSync(installDir, { recursive: true });

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let bytesCopied = 0;

    for (const file of files) {
      const targetFilePath = path.join(installDir, file.relativePath);
      const targetFileDir = path.dirname(targetFilePath);
      
      // Ensure specific target directory path exists
      fs.mkdirSync(targetFileDir, { recursive: true });

      // Notify progress start of this file
      browserWindow.webContents.send('install-progress', { 
        percent: Math.min(99, Math.round((bytesCopied / totalBytes) * 100)), 
        currentFile: file.relativePath 
      });

      // Copy file with chunk progress update
      await copyFileWithProgress(file.absolutePath, targetFilePath, (chunkLength) => {
        bytesCopied += chunkLength;
        const percent = Math.min(99, Math.round((bytesCopied / totalBytes) * 100));
        browserWindow.webContents.send('install-progress', { 
          percent, 
          currentFile: file.relativePath 
        });
      });
    }

    // Force 100% and notify completion
    browserWindow.webContents.send('install-progress', { percent: 100, currentFile: 'Finalizing installation...' });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create desktop & start menu shortcut links on Windows
    if (process.platform === 'win32') {
      try {
        const desktopPath = path.join(os.homedir(), 'Desktop');
        const shortcutPath = path.join(desktopPath, 'LidOrbit.lnk');
        const targetExe = path.join(installDir, 'LIDORBIT.exe');
        const targetIcon = path.join(installDir, 'assets', 'icon.ico');

        const shortcutOptions = {
          target: targetExe,
          cwd: installDir,
          description: 'LidOrbit Floating sleep bypass widget'
        };

        // Use assets/icon.ico if it exists, otherwise fall back to the executable itself
        if (fs.existsSync(targetIcon)) {
          shortcutOptions.icon = targetIcon;
        } else {
          shortcutOptions.icon = targetExe;
          shortcutOptions.iconIndex = 0;
        }

        shell.writeShortcutLink(shortcutPath, 'create', shortcutOptions);

        const startMenuPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
        const startMenuLnk = path.join(startMenuPath, 'LidOrbit.lnk');
        shell.writeShortcutLink(startMenuLnk, 'create', shortcutOptions);
      } catch (shortcutErr) {
        console.error('Failed to write shortcuts:', shortcutErr);
      }
    }

    browserWindow.webContents.send('install-complete', { installDir });
  } catch (err) {
    browserWindow.webContents.send('install-error', { message: err.message });
  }
});

// App startup
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
