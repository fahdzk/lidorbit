const { powerSaveBlocker } = require('electron');
const { exec, spawn } = require('child_process');
const os = require('os');
const Store = require('electron-store');
const store = new Store();

let blockerId = null;
let caffeinateProcess = null;

// Store original Windows power settings so we can restore them exactly
let originalWinSettings = {
  standbyAc: null,
  standbyDc: null,
  hibernateAc: null,
  hibernateDc: null,
  lidAc: null,
  lidDc: null
};

// Backup file settings using electron-store to persist across reloads/crashes
function getStoredWinSettings() {
  return store.get('originalWinSettings', null);
}

function saveStoredWinSettings(settings) {
  store.set('originalWinSettings', settings);
}

function clearStoredWinSettings() {
  store.delete('originalWinSettings');
}

// Tracks active state
let isActive = false;

/**
 * Execute a command line process and return its stdout as a string.
 */
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Helper to parse powercfg query output for a specific setting GUID.
 * If isTime is true, output is in seconds and returned in minutes.
 * Otherwise, the raw setting index value is returned.
 */
function parsePowercfgSetting(output, settingGuid, isTime = true) {
  const sections = output.split(/Power Setting GUID:/i);
  for (const section of sections) {
    if (section.toLowerCase().includes(settingGuid.toLowerCase())) {
      let ac = null;
      let dc = null;

      const acMatch = section.match(/Current AC Power Setting Index:\s*(0x[0-9a-fA-F]+)/i);
      if (acMatch) {
        const value = parseInt(acMatch[1], 16);
        ac = isTime ? Math.round(value / 60) : value;
      }

      const dcMatch = section.match(/Current DC Power Setting Index:\s*(0x[0-9a-fA-F]+)/i);
      if (dcMatch) {
        const value = parseInt(dcMatch[1], 16);
        dc = isTime ? Math.round(value / 60) : value;
      }

      return { ac, dc };
    }
  }
  return { ac: null, dc: null };
}

/**
 * Windows specific: Back up current standby, hibernate, and lid close settings.
 */
async function backupWindowsPowerSettings() {
  // Check if we already have a persistent backup from a previous crashed session
  const existingBackup = getStoredWinSettings();
  if (existingBackup) {
    originalWinSettings = existingBackup;
    console.log('Found existing power settings backup in store. Restoring from it:', originalWinSettings);
    return;
  }

  const sleepSubgroup = '238c9fa8-0aad-41ed-83f4-97be242c8f20';
  const standbySetting = '29f6c1db-86da-48c5-9fdb-f2b67b1f44da';
  const hibernateSetting = '9d7815a6-7ee4-497e-8888-515a05f02364';
  const buttonsSubgroup = '4f971e89-eebd-4455-a8de-9e59040e7347';
  const lidSetting = '5ca83367-6e45-459f-a27b-476b1d01c936';

  try {
    // 1. Standby timeout query
    try {
      const standbyOut = await runCommand(`powercfg /query SCHEME_CURRENT ${sleepSubgroup}`);
      const standby = parsePowercfgSetting(standbyOut, standbySetting, true);
      originalWinSettings.standbyAc = standby.ac;
      originalWinSettings.standbyDc = standby.dc;
      console.log(`Backed up Windows standby timeouts - AC: ${standby.ac}m, DC: ${standby.dc}m`);
    } catch (e) {
      console.warn('Could not query standby timeouts:', e.message);
    }

    // 2. Hibernate timeout query (may fail if hibernation is disabled)
    try {
      const hibernateOut = await runCommand(`powercfg /query SCHEME_CURRENT ${sleepSubgroup}`);
      const hibernate = parsePowercfgSetting(hibernateOut, hibernateSetting, true);
      originalWinSettings.hibernateAc = hibernate.ac;
      originalWinSettings.hibernateDc = hibernate.dc;
      console.log(`Backed up Windows hibernate timeouts - AC: ${hibernate.ac}m, DC: ${hibernate.dc}m`);
    } catch (e) {
      console.log('Hibernate query failed (likely disabled on system):', e.message);
    }

    // 3. Lid close action query
    try {
      // Unhide the lid close action setting first so it is visible in powercfg queries
      try {
        await runCommand(`powercfg /attributes ${buttonsSubgroup} ${lidSetting} -ATTRIB_HIDE`);
        console.log('Unhid Windows lid-close setting in powercfg attributes');
      } catch (attrErr) {
        console.log('Attributes unhide command failed (might already be unhidden):', attrErr.message);
      }

      const lidOut = await runCommand(`powercfg /query SCHEME_CURRENT ${buttonsSubgroup}`);
      const lid = parsePowercfgSetting(lidOut, lidSetting, false);
      originalWinSettings.lidAc = lid.ac;
      originalWinSettings.lidDc = lid.dc;
      console.log(`Backed up Windows lid-close actions - AC: ${lid.ac}, DC: ${lid.dc}`);
    } catch (e) {
      console.log('Lid close action query failed (likely a desktop PC):', e.message);
    }

    // Persist backup to store so it survives app crashes or restarts
    saveStoredWinSettings(originalWinSettings);
  } catch (err) {
    console.error('Error during powercfg query backup:', err);
  }
}

/**
 * Windows specific: Restore standby, hibernate, and lid settings to their original values.
 */
async function restoreWindowsPowerSettings() {
  const isWin = os.platform() === 'win32';
  if (!isWin) return;

  const settingsToRestore = getStoredWinSettings() || originalWinSettings;
  console.log('Restoring Windows power settings:', settingsToRestore);

  const buttonsSubgroup = '4f971e89-eebd-4455-a8de-9e59040e7347';
  const lidSetting = '5ca83367-6e45-459f-a27b-476b1d01c936';

  // Standby Timeout AC
  if (settingsToRestore.standbyAc !== null) {
    try {
      await runCommand(`powercfg /change standby-timeout-ac ${settingsToRestore.standbyAc}`);
      console.log(`Restored standby-timeout-ac to ${settingsToRestore.standbyAc}m`);
    } catch (e) {
      console.error('Failed to restore standby-timeout-ac:', e.message);
    }
  }

  // Standby Timeout DC
  if (settingsToRestore.standbyDc !== null) {
    try {
      await runCommand(`powercfg /change standby-timeout-dc ${settingsToRestore.standbyDc}`);
      console.log(`Restored standby-timeout-dc to ${settingsToRestore.standbyDc}m`);
    } catch (e) {
      console.error('Failed to restore standby-timeout-dc:', e.message);
    }
  }

  // Hibernate Timeout AC
  if (settingsToRestore.hibernateAc !== null) {
    try {
      await runCommand(`powercfg /change hibernate-timeout-ac ${settingsToRestore.hibernateAc}`);
      console.log(`Restored hibernate-timeout-ac to ${settingsToRestore.hibernateAc}m`);
    } catch (e) {
      console.error('Failed to restore hibernate-timeout-ac:', e.message);
    }
  }

  // Hibernate Timeout DC
  if (settingsToRestore.hibernateDc !== null) {
    try {
      await runCommand(`powercfg /change hibernate-timeout-dc ${settingsToRestore.hibernateDc}`);
      console.log(`Restored hibernate-timeout-dc to ${settingsToRestore.hibernateDc}m`);
    } catch (e) {
      console.error('Failed to restore hibernate-timeout-dc:', e.message);
    }
  }

  // Lid Close AC / DC
  if (settingsToRestore.lidAc !== null || settingsToRestore.lidDc !== null) {
    try {
      // Unhide the lid close action setting before set index
      await runCommand(`powercfg /attributes ${buttonsSubgroup} ${lidSetting} -ATTRIB_HIDE`);
    } catch (e) {}

    if (settingsToRestore.lidAc !== null) {
      try {
        await runCommand(`powercfg /setacvalueindex SCHEME_CURRENT ${buttonsSubgroup} ${lidSetting} ${settingsToRestore.lidAc}`);
        console.log(`Restored lid-close-action ac to index ${settingsToRestore.lidAc}`);
      } catch (e) {
        console.error('Failed to restore lid-close-action ac:', e.message);
      }
    }

    if (settingsToRestore.lidDc !== null) {
      try {
        await runCommand(`powercfg /setdcvalueindex SCHEME_CURRENT ${buttonsSubgroup} ${lidSetting} ${settingsToRestore.lidDc}`);
        console.log(`Restored lid-close-action dc to index ${settingsToRestore.lidDc}`);
      } catch (e) {
        console.error('Failed to restore lid-close-action dc:', e.message);
      }
    }

    // Apply setacvalueindex/setdcvalueindex active scheme changes
    try {
      await runCommand('powercfg /setactive SCHEME_CURRENT');
      console.log('Applied restored power scheme active state');
    } catch (e) {
      console.error('Failed to set active scheme:', e.message);
    }
  }

  // Clear stored backup settings from both store and memory once restored
  clearStoredWinSettings();
  originalWinSettings = {
    standbyAc: null,
    standbyDc: null,
    hibernateAc: null,
    hibernateDc: null,
    lidAc: null,
    lidDc: null
  };
}

/**
 * Windows specific: Change timeouts to 0 (never sleep) and lid action to 0 (do nothing).
 */
async function applyWindowsPowerBypass() {
  const buttonsSubgroup = '4f971e89-eebd-4455-a8de-9e59040e7347';
  const lidSetting = '5ca83367-6e45-459f-a27b-476b1d01c936';

  try {
    // Make sure we back up the existing settings first
    await backupWindowsPowerSettings();

    // Disable standby sleep (set to 0 = never)
    await runCommand('powercfg /change standby-timeout-ac 0');
    await runCommand('powercfg /change standby-timeout-dc 0');
    console.log('Applied standby-timeout-ac/dc to 0 (never)');

    // Attempt to disable hibernate sleep (set to 0 = never), catch silently if disabled
    try {
      await runCommand('powercfg /change hibernate-timeout-ac 0');
      await runCommand('powercfg /change hibernate-timeout-dc 0');
      console.log('Applied hibernate-timeout-ac/dc to 0 (never)');
    } catch (e) {
      console.log('Hibernate change failed (likely disabled on system):', e.message);
    }

    // Disable lid close sleep (set to 0 = do nothing)
    try {
      // Unhide the lid close action setting before set index
      try {
        await runCommand(`powercfg /attributes ${buttonsSubgroup} ${lidSetting} -ATTRIB_HIDE`);
      } catch (attrErr) {}

      await runCommand(`powercfg /setacvalueindex SCHEME_CURRENT ${buttonsSubgroup} ${lidSetting} 0`);
      await runCommand(`powercfg /setdcvalueindex SCHEME_CURRENT ${buttonsSubgroup} ${lidSetting} 0`);
      await runCommand('powercfg /setactive SCHEME_CURRENT');
      console.log('Applied Windows lid-close actions to 0 (do nothing)');
    } catch (e) {
      console.log('Lid close action bypass failed (likely a desktop PC):', e.message);
    }
  } catch (err) {
    console.error('Error applying Windows power settings change:', err);
    throw new Error('Failed to fully modify Windows powercfg. Power Save Blocker fallback remains active.');
  }
}

/**
 * Starts the sleep bypass logic.
 * @returns {Promise<{success: boolean, method: string, message?: string}>}
 */
async function start() {
  if (isActive) {
    return { success: true, method: getBypassMethodName() };
  }

  const platform = os.platform();
  let method = 'Electron PowerSaveBlocker';
  let message = '';

  try {
    // 1. Cross-platform baseline blocker
    blockerId = powerSaveBlocker.start('prevent-display-sleep');
    console.log(`Started Electron powerSaveBlocker with ID: ${blockerId}`);

    // 2. Platform enhancements
    if (platform === 'win32') {
      method = 'Electron Blocker + Windows Powercfg';
      await applyWindowsPowerBypass();
    } else if (platform === 'darwin') {
      method = 'Electron Blocker + macOS Caffeinate';
      // Spawn caffeinate process:
      // -i prevents idle sleep, -d prevents display sleep, -s prevents system sleep, -m prevents disk sleep
      try {
        caffeinateProcess = spawn('caffeinate', ['-i', '-m', '-s', '-d'], {
          detached: true,
          stdio: 'ignore'
        });
        caffeinateProcess.unref();
        console.log(`Spawned macOS caffeinate, PID: ${caffeinateProcess.pid}`);
      } catch (err) {
        console.error('Failed to spawn caffeinate process on Mac:', err);
        message = 'Caffeinate spawn failed. Using Electron Blocker only.';
      }
    }

    isActive = true;
    return { success: true, method, message };
  } catch (err) {
    console.error('Failed to start sleep bypass:', err);
    return {
      success: false,
      method,
      message: err.message || 'An error occurred while activating sleep bypass.'
    };
  }
}

/**
 * Stops the sleep bypass logic.
 * @returns {Promise<boolean>}
 */
async function stop() {
  if (!isActive) {
    return true;
  }

  const platform = os.platform();

  try {
    // 1. Stop baseline blocker
    if (blockerId !== null) {
      powerSaveBlocker.stop(blockerId);
      console.log(`Stopped Electron powerSaveBlocker: ${blockerId}`);
      blockerId = null;
    }

    // 2. Platform restorations
    if (platform === 'win32') {
      await restoreWindowsPowerSettings();
    } else if (platform === 'darwin') {
      if (caffeinateProcess) {
        console.log(`Killing macOS caffeinate process (PID: ${caffeinateProcess.pid})...`);
        try {
          process.kill(-caffeinateProcess.pid); // kill process group
        } catch (e) {
          try {
            caffeinateProcess.kill();
          } catch (err) {
            console.error('Failed to kill caffeinate process:', err);
          }
        }
        caffeinateProcess = null;
      }
    }

    isActive = false;
    return true;
  } catch (err) {
    console.error('Failed to stop sleep bypass cleanly:', err);
    isActive = false; // still set false to avoid lockup
    return false;
  }
}

/**
 * Get active status.
 */
function getActiveState() {
  return isActive;
}

/**
 * Helper to display current bypass technique
 */
function getBypassMethodName() {
  const platform = os.platform();
  if (platform === 'win32') {
    return 'Electron Blocker + Windows powercfg';
  } else if (platform === 'darwin') {
    return 'Electron Blocker + macOS caffeinate';
  }
  return 'Electron PowerSaveBlocker';
}

/**
 * Startup initialization: checks if a backup exists (e.g. from a previous app crash)
 * and restores normal settings immediately since the app starts in the OFF state.
 */
async function initialize() {
  const platform = os.platform();
  if (platform === 'win32') {
    const existingBackup = getStoredWinSettings();
    if (existingBackup) {
      console.log('Found leftover power settings backup on startup. Restoring normal settings...');
      await restoreWindowsPowerSettings();
    }
  }
}

module.exports = {
  start,
  stop,
  initialize,
  getActiveState,
  getBypassMethodName
};
