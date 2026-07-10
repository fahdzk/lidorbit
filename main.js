const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Initialize electron-store
Store.initRenderer();
const store = new Store();

const powerManager = require('./powerManager');
const licenseService = require('./licenseService');
const safetyManager = require('./safetyManager');

// Read BUILD_CHANNEL from environment variable, defaulting to 'direct'
const BUILD_CHANNEL = process.env.BUILD_CHANNEL || 'direct';

// Purchase URL (Replace with your actual Stripe Payment Link)
const PURCHASE_URL = 'https://lidorbit.wasmer.app/purchase.html';
const MS_STORE_URL = 'https://apps.microsoft.com/store/detail/LIDORBIT';
const LICENSES_URL = 'https://www.lidorbit.com/licenses';

let mainWindow = null;
let loadingWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  const alwaysOnTopVal = store.get('alwaysOnTop', true);
  const shape = store.get('widgetShape', 'rectangle');
  const widgetScale = store.get('widgetScale', 1.0);
  let width = 220;
  let height = 220;
  if (!licenseService.isLicensed()) {
    width = 380;
    height = 540;
  } else if (shape === 'rectangle') {
    width = Math.round(280 * widgetScale);
    height = Math.round(220 * widgetScale);
  } else {
    width = Math.round(220 * widgetScale);
    height = Math.round(220 * widgetScale);
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: alwaysOnTopVal,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (alwaysOnTopVal) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  mainWindow.loadFile('index.html');

  // Minimize window hides it to tray
  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
    updateTrayMenu();
  });

  // Open the DevTools in development if needed (uncomment for debugging)
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 300,
    height: 250,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadingWindow.loadFile('loading.html');

  loadingWindow.on('closed', () => {
    loadingWindow = null;
  });
}

// Ensure single instance lock
const additionalData = { myKey: 'lidorbit' };
const gotTheLock = app.requestSingleInstanceLock(additionalData);

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    // Someone tried to run a second instance, focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createLoadingWindow();
    createTray();

    let initDone = false;
    let animDone = false;

    const maybeShowMain = () => {
      if (initDone && animDone) {
        clearTimeout(fallbackTimeout);
        createWindow();
        if (loadingWindow) {
          loadingWindow.close();
        }
      }
    };

    // Safety fallback: if loading doesn't complete within 4 seconds, force proceed
    const fallbackTimeout = setTimeout(() => {
      if (!animDone) {
        console.warn('Loading fallback triggered');
        animDone = true;
        maybeShowMain();
      }
    }, 4000);

    // Run initialization
    powerManager.initialize()
      .then(() => {
        initDone = true;
        maybeShowMain();
      })
      .catch((err) => {
        console.error('Failed to initialize power manager settings:', err);
        initDone = true;
        maybeShowMain();
      });

    // Listen for loading animation finish
    ipcMain.once('loading-finished', () => {
      animDone = true;
      maybeShowMain();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && initDone) {
        createWindow();
      }
    });
  });
}

// Clean up power-management state before quitting
const cleanup = async () => {
  if (isQuitting) return;
  isQuitting = true;
  console.log('Quitting LIDORBIT. Cleaning up power manager settings...');
  safetyManager.stopSafetyMonitor();
  try {
    await powerManager.stop();
  } catch (err) {
    console.error('Error during powerManager cleanup:', err);
  }
};

app.on('before-quit', (event) => {
  event.preventDefault();

  const { dialog } = require('electron');
  const response = dialog.showMessageBoxSync(mainWindow && mainWindow.isVisible() ? mainWindow : null, {
    type: 'question',
    buttons: ['Yes', 'No'],
    defaultId: 1,
    title: 'Confirm Exit',
    message: 'Are you sure you want to close the app?',
    detail: 'This will restore your normal system sleep settings.'
  });

  if (response === 0) { // User clicked 'Yes'
    cleanup().then(() => {
      app.exit(0);
    });
  }
});

app.on('will-quit', () => {
  // Fallback cleanup
  safetyManager.stopSafetyMonitor();
  powerManager.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler: get current application state
ipcMain.handle('get-state', async () => {
  const loginSettings = app.getLoginItemSettings();
  const isLicensed = await licenseService.verifyTokenOnStartup();

  return {
    isLicensed: isLicensed,
    isActualLicensed: isLicensed,
    isTrialActive: false,
    trialDaysLeft: 0,
    bypassActive: powerManager.getActiveState(),
    buildChannel: BUILD_CHANNEL,
    launchAtLogin: loginSettings.openAtLogin,
    alwaysOnTop: store.get('alwaysOnTop', true),
    widgetShape: store.get('widgetShape', 'rectangle'),
    alarmEnabled: store.get('alarmEnabled', true),
    alarmInterval: store.get('alarmInterval', 10),
    username: store.get('username', ''),
    licenseKey: store.get('licenseKey', ''),
    opacity: store.get('widgetOpacity', 100),
    widgetScale: store.get('widgetScale', 1.0)
  };
});

// IPC Handler: license key activation / user login
ipcMain.handle('activate-license', async (event, usernameOrEmail, password) => {
  const result = await licenseService.verifyLicenseKey(usernameOrEmail, password);
  updateTrayMenu();
  return result;
});

// IPC Handler: license key direct activation
ipcMain.handle('activate-license-by-key', async (event, licenseKey) => {
  const result = await licenseService.activateLicenseByKey(licenseKey);
  updateTrayMenu();
  return result;
});

// IPC Handler: user logout
ipcMain.handle('logout', async () => {
  licenseService.clearLicense();
  updateTrayMenu();
  return { success: true };
});

// IPC Handler: set widget window opacity
ipcMain.handle('set-opacity', async (event, opacity) => {
  try {
    store.set('widgetOpacity', opacity);
    console.log(`IPC: Opacity set to ${opacity}%`);
    return true;
  } catch (err) {
    console.error('Failed to set opacity settings:', err);
    return false;
  }
});

// IPC Handler: set widget scale
ipcMain.handle('set-scale', async (event, scale) => {
  try {
    store.set('widgetScale', scale);
    console.log(`IPC: Scale set to ${scale}`);
    return true;
  } catch (err) {
    console.error('Failed to set scale settings:', err);
    return false;
  }
});

// IPC Listener: open forgot password link in external browser
ipcMain.on('open-forgot-password-link', () => {
  shell.openExternal('https://lidorbit.wasmer.app/forgot.html');
});

// IPC Listener: open register link in external browser
ipcMain.on('open-register-link', () => {
  shell.openExternal('https://lidorbit.wasmer.app/register.html');
});

// IPC Handler: toggle sleep bypass
ipcMain.handle('toggle-bypass', async (event, enable) => {
  // Check license state first
  if (!licenseService.isLicensed()) {
    return {
      success: false,
      bypassActive: false,
      method: powerManager.getBypassMethodName(),
      message: 'App is unlicensed. Please activate a license to enable.'
    };
  }

  if (enable) {
    const result = await powerManager.start();
    if (result.success) {
      safetyManager.startSafetyMonitor();
    }
    updateTrayMenu();
    return {
      success: result.success,
      bypassActive: powerManager.getActiveState(),
      method: result.method,
      message: result.message
    };
  } else {
    const success = await powerManager.stop();
    safetyManager.stopSafetyMonitor();
    updateTrayMenu();
    return {
      success,
      bypassActive: powerManager.getActiveState(),
      method: powerManager.getBypassMethodName()
    };
  }
});

// IPC Handler: register PID for safety monitoring
ipcMain.handle('register-active-process', (event, pid) => {
  safetyManager.registerProcess(pid);
  return true;
});

// IPC Handler: unregister PID
ipcMain.handle('unregister-active-process', (event, pid) => {
  safetyManager.unregisterProcess(pid);
  return true;
});

// IPC Handler: update active loop state/checkpoint
ipcMain.handle('update-loop-checkpoint', (event, loopId, checkpointData) => {
  safetyManager.updateCheckpoint(loopId, checkpointData);
  return true;
});

// IPC Listener: open purchase link in external browser
ipcMain.on('open-purchase-link', async () => {
  try {
    const url = await licenseService.getCheckoutSessionUrl();
    shell.openExternal(url);
  } catch (err) {
    console.error('Failed to get Stripe Checkout Session URL, falling back to static URL:', err);
    shell.openExternal(PURCHASE_URL);
  }
});

// IPC Listener: open Microsoft Store link in external browser
ipcMain.on('open-msstore-link', () => {
  shell.openExternal(MS_STORE_URL);
});

// IPC Listener: open licenses link in external browser
ipcMain.on('open-licenses-link', () => {
  shell.openExternal(LICENSES_URL);
});

// IPC Listener: quit application
ipcMain.on('quit-app', () => {
  app.quit();
});

// IPC Listener: open settings (mostly handled UI-side, but logs for transparency)
ipcMain.on('open-settings', () => {
  console.log('IPC: Settings panel toggled in UI');
});

// IPC Handler: set launch at login status
ipcMain.handle('set-launch-at-login', async (event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // On Windows/Mac, optional path/arguments can be supplied
      path: app.getPath('exe')
    });
    console.log(`IPC: Launch at login set to ${enabled}`);
    return true;
  } catch (err) {
    console.error('Failed to set login item settings:', err);
    return false;
  }
});

// IPC Handler: set always on top status
ipcMain.handle('set-always-on-top', async (event, enabled) => {
  try {
    store.set('alwaysOnTop', enabled);
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(enabled, 'screen-saver');
    }
    console.log(`IPC: Always on top set to ${enabled}`);
    return true;
  } catch (err) {
    console.error('Failed to set always on top settings:', err);
    return false;
  }
});

// IPC Listener: minimize application window
ipcMain.on('minimize-app', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

// IPC Handler: set widget shape status
ipcMain.handle('set-shape', async (event, shape) => {
  try {
    store.set('widgetShape', shape);
    if (mainWindow) {
      let width = 220;
      let height = 220;
      if (shape === 'rectangle') {
        width = 280;
        height = 220;
      }
      mainWindow.setSize(width, height);
    }
    console.log(`IPC: Widget shape set to ${shape}`);
    return true;
  } catch (err) {
    console.error('Failed to set widget shape:', err);
    return false;
  }
});

// IPC Handler: set battery alarm status
ipcMain.handle('set-alarm-enabled', async (event, enabled) => {
  try {
    store.set('alarmEnabled', enabled);
    console.log(`IPC: Alarm enabled set to ${enabled}`);
    return true;
  } catch (err) {
    console.error('Failed to set alarm enabled settings:', err);
    return false;
  }
});

// IPC Handler: set battery alarm repeat interval
ipcMain.handle('set-alarm-interval', async (event, interval) => {
  try {
    const val = Math.max(8, parseInt(interval, 10) || 8);
    store.set('alarmInterval', val);
    console.log(`IPC: Alarm interval set to ${val} minutes`);
    return true;
  } catch (err) {
    console.error('Failed to set alarm interval settings:', err);
    return false;
  }
});

/**
 * Creates the Windows/macOS system tray icon and context menu.
 */
function createTray() {
  // 16x16 Base64 circular blue/white icon for the system tray
  const TRAY_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAvklEQVR42mNkQAKsDAwMqwjEICCYgVwDkI1BDf8xNY0aMGjAoAEDBgwUGjCQasCoAaMGjBowcGAg3QDGw///Gf4z/IeJM2ETRtfw/z8DG5L4f5iawWYw/GdAx5gYIBp+/WdAx+gYIMTAwPBfAIj/MzCgY3QMEGZgYPgfAEzxPwMDOkY1Gkg0gGgAxP//DIQNGDRgwICBQgMGEg0YNWDUgFEDBg0YKDRgINWAUQNGDRg1YNDAAQAGQ4f1aPexdQAAAABJRU5ErkJggg==';
  const iconBuffer = Buffer.from(TRAY_ICON_BASE64, 'base64');
  const image = nativeImage.createFromBuffer(iconBuffer);
  image.setTemplateImage(true); // Supports dark/light themes on macOS

  tray = new Tray(image);
  tray.setToolTip('LIDORBIT');

  // Load the initial menu state
  updateTrayMenu();

  // Double-click/click restores the floating widget
  tray.on('click', () => {
    toggleWindowVisibility();
  });
}

/**
 * Toggles window visibility on tray click.
 */
function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    updateTrayMenu();
  } else {
    mainWindow.show();
    mainWindow.focus();
    updateTrayMenu();
  }
}

/**
 * Re-builds context menu to sync active checkbox/label states.
 */
function updateTrayMenu() {
  if (!tray) return;

  const isLicensed = licenseService.isLicensed();
  const bypassActive = powerManager.getActiveState();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: mainWindow && mainWindow.isVisible() ? 'Hide Widget' : 'Show Widget',
      click: () => {
        toggleWindowVisibility();
      }
    },
    { type: 'separator' },
    {
      label: `Bypass Sleep: ${bypassActive ? 'Active (ON)' : 'Inactive (OFF)'}`,
      type: 'checkbox',
      checked: bypassActive,
      enabled: isLicensed,
      click: async () => {
        const targetState = !bypassActive;
        const result = await toggleBypassFromTray(targetState);
        // Dispatch event back to renderer
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('bypass-toggled-externally', result);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit LIDORBIT',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Helper to toggle sleep blocker directly from tray menu.
 */
async function toggleBypassFromTray(enable) {
  if (!licenseService.isLicensed()) return { success: false };

  if (enable) {
    const result = await powerManager.start();
    if (result.success) {
      safetyManager.startSafetyMonitor();
    }
    updateTrayMenu();
    return { success: result.success, bypassActive: powerManager.getActiveState(), method: result.method };
  } else {
    const success = await powerManager.stop();
    safetyManager.stopSafetyMonitor();
    updateTrayMenu();
    return { success, bypassActive: powerManager.getActiveState(), method: powerManager.getBypassMethodName() };
  }
}

// IPC Listener: dynamic window resizing
ipcMain.on('resize-window', (event, width, height) => {
  if (mainWindow) {
    mainWindow.setSize(width, height);
  }
});
