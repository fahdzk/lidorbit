const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const powerManager = require('./powerManager');

// PIDs explicitly registered by external scripts
const registeredPIDs = new Set();
// Stored checkpoints of active loops
let loopCheckpoints = {};

let isSuspended = false; // Tracks if processes are currently suspended by thermal safety
let thermalInterval = null;
let batteryInterval = null;

// File paths for emergency checkpoints and triggers
const CHECKPOINT_FILE = path.join(process.cwd(), 'emergency_checkpoint.json');
const TRIGGER_FILE = path.join(process.cwd(), 'emergency_trigger.json');

/**
 * Register a PID to be monitored
 */
function registerProcess(pid) {
  const numericPid = Number(pid);
  if (!isNaN(numericPid) && numericPid > 0) {
    registeredPIDs.add(numericPid);
    console.log(`[Safety Manager] Registered process PID: ${numericPid}`);
    // If we are currently suspended, suspend this newly registered process immediately
    if (isSuspended) {
      suspendPIDs([numericPid]);
    }
  }
}

/**
 * Unregister a PID
 */
function unregisterProcess(pid) {
  const numericPid = Number(pid);
  registeredPIDs.delete(numericPid);
  console.log(`[Safety Manager] Unregistered process PID: ${numericPid}`);
}

/**
 * Update current checkpoint data
 */
function updateCheckpoint(loopId, checkpointData) {
  loopCheckpoints[loopId] = checkpointData;
  console.log(`[Safety Manager] Updated checkpoint for loop: ${loopId}`);
}

/**
 * Checks if the laptop lid is closed by querying display status.
 * If the internal laptop screen becomes inactive, we assume the lid is closed.
 */
function checkLidClosed() {
  return new Promise((resolve) => {
    // Look for WMI Monitor display params, specifically looking for inactive internal monitor (starts with DISPLAY)
    exec(`powershell -NoProfile -NonInteractive -Command "Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorBasicDisplayParams | Select-Object -Property InstanceName, Active | ConvertTo-Json"`, (err, stdout, stderr) => {
      if (!err && stdout.trim()) {
        try {
          const data = JSON.parse(stdout);
          const monitors = Array.isArray(data) ? data : [data];
          // Check if the built-in screen (usually has DISPLAY in InstanceName) is inactive (Active = false)
          const internalMon = monitors.find(m => m.InstanceName && m.InstanceName.toUpperCase().includes('DISPLAY'));
          if (internalMon) {
            resolve(internalMon.Active === false);
            return;
          }
        } catch (e) {
          // ignore parsing error
        }
      }
      resolve(false);
    });
  });
}

/**
 * Queries WMI for the current system temperature in Celsius.
 */
function getSystemTemperature() {
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -NonInteractive -Command "Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation | Select-Object -Property Temperature, HighPrecisionTemperature | ConvertTo-Json"`, (err, stdout, stderr) => {
      if (!err && stdout.trim()) {
        try {
          const data = JSON.parse(stdout);
          const zones = Array.isArray(data) ? data : [data];
          let maxTemp = -999;
          for (const zone of zones) {
            let tempK = null;
            if (zone.HighPrecisionTemperature) {
              tempK = zone.HighPrecisionTemperature / 10;
            } else if (zone.Temperature) {
              tempK = zone.Temperature;
            }
            if (tempK) {
              const tempC = tempK - 273.15;
              if (tempC > maxTemp) maxTemp = tempC;
            }
          }
          if (maxTemp > -999) {
            return resolve(maxTemp);
          }
        } catch (e) {
          // ignore parsing/extraction error and try fallback
        }
      }

      // Fallback WMI query: MSAcpi_ThermalZoneTemperature (typically requires Admin, but provided as safe fallback)
      exec(`powershell -NoProfile -NonInteractive -Command "Get-CimInstance -Namespace root\\wmi -ClassName MSAcpi_ThermalZoneTemperature | Select-Object -Property CurrentTemperature | ConvertTo-Json"`, (err2, stdout2, stderr2) => {
        if (!err2 && stdout2.trim()) {
          try {
            const data = JSON.parse(stdout2);
            const zones = Array.isArray(data) ? data : [data];
            let maxTemp = -999;
            for (const zone of zones) {
              if (zone.CurrentTemperature) {
                const tempC = (zone.CurrentTemperature / 10) - 273.15;
                if (tempC > maxTemp) maxTemp = tempC;
              }
            }
            if (maxTemp > -999) {
              return resolve(maxTemp);
            }
          } catch (e) {
            // ignore
          }
        }
        reject(new Error(stderr2 || "Temperature unavailable or access denied"));
      });
    });
  });
}

/**
 * Queries native Windows GetSystemPowerStatus API via PowerShell C# P/Invoke compilation
 */
function getSystemPowerStatus() {
  return new Promise((resolve, reject) => {
    const psCommand = `powershell -NoProfile -NonInteractive -Command "$code = 'using System; using System.Runtime.InteropServices; [StructLayout(LayoutKind.Sequential)] public struct SYSTEM_POWER_STATUS { public byte ACLineStatus; public byte BatteryFlag; public byte BatteryLifePercent; public byte Reserved1; public int BatteryLifeTime; public int BatteryFullLifeTime; } public class PowerStatus { [DllImport(\\\"kernel32.dll\\\", SetLastError = true)] public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS lpSystemPowerStatus); }'; Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue; $status = New-Object SYSTEM_POWER_STATUS; $res = [PowerStatus]::GetSystemPowerStatus([ref]$status); if ($res) { [PSCustomObject]@{ ACLineStatus = $status.ACLineStatus; BatteryLifePercent = $status.BatteryLifePercent } | ConvertTo-Json }"`;

    exec(psCommand, (err, stdout, stderr) => {
      if (!err && stdout.trim()) {
        try {
          const status = JSON.parse(stdout);
          resolve({
            onBattery: status.ACLineStatus === 0,
            batteryPercent: status.BatteryLifePercent
          });
        } catch (e) {
          reject(e);
        }
      } else {
        reject(new Error(stderr || 'Failed to query power status'));
      }
    });
  });
}

/**
 * Suspend a list of PIDs and any auto-detected LLM/python processes using native Windows API
 */
function suspendPIDs(pids = []) {
  return new Promise((resolve) => {
    const pidSet = new Set([...pids, ...registeredPIDs]);
    const pidArray = Array.from(pidSet);
    const pidListStr = pidArray.length > 0 ? pidArray.join(',') : '';

    const psCommand = `powershell -NoProfile -NonInteractive -Command "$code = 'using System; using System.Runtime.InteropServices; public class ProcessUtil { [DllImport(\\\"ntdll.dll\\\", SetLastError = true)] public static extern int NtSuspendProcess(IntPtr handle); }'; Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue; $pids = @(${pidListStr}); foreach ($pid in $pids) { if ($pid -gt 0) { $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue; if ($proc) { [ProcessUtil]::NtSuspendProcess($proc.Handle) } } }; $names = @('python', 'ollama', 'ollama_llama_server', 'llama'); foreach ($name in $names) { $procs = Get-Process -Name $name -ErrorAction SilentlyContinue; foreach ($p in $procs) { [ProcessUtil]::NtSuspendProcess($p.Handle) } }"`;

    exec(psCommand, (err, stdout, stderr) => {
      console.log('[Safety Manager] SafePause process suspension logs:\n', stdout.trim());
      resolve();
    });
  });
}

/**
 * Resume a list of PIDs and auto-detected processes using native Windows API
 */
function resumePIDs(pids = []) {
  return new Promise((resolve) => {
    const pidSet = new Set([...pids, ...registeredPIDs]);
    const pidArray = Array.from(pidSet);
    const pidListStr = pidArray.length > 0 ? pidArray.join(',') : '';

    const psCommand = `powershell -NoProfile -NonInteractive -Command "$code = 'using System; using System.Runtime.InteropServices; public class ProcessUtil { [DllImport(\\\"ntdll.dll\\\", SetLastError = true)] public static extern int NtResumeProcess(IntPtr handle); }'; Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue; $pids = @(${pidListStr}); foreach ($pid in $pids) { if ($pid -gt 0) { $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue; if ($proc) { [ProcessUtil]::NtResumeProcess($proc.Handle) } } }; $names = @('python', 'ollama', 'ollama_llama_server', 'llama'); foreach ($name in $names) { $procs = Get-Process -Name $name -ErrorAction SilentlyContinue; foreach ($p in $procs) { [ProcessUtil]::NtResumeProcess($p.Handle) } }"`;

    exec(psCommand, (err, stdout, stderr) => {
      console.log('[Safety Manager] SafeResume process resumption logs:\n', stdout.trim());
      resolve();
    });
  });
}

/**
 * Trigger SafePause()
 */
async function triggerSafePause(temp) {
  if (isSuspended) return;
  isSuspended = true;
  console.warn(`[Safety Manager] Temperature reached ${temp.toFixed(1)}°C (Exceeds 85°C limit!). Triggering SafePause()...`);
  await suspendPIDs();
}

/**
 * Trigger SafeResume()
 */
async function triggerSafeResume(temp) {
  if (!isSuspended) return;
  isSuspended = false;
  console.log(`[Safety Manager] Temperature cooled to ${temp.toFixed(1)}°C (Below 70°C target). Triggering SafeResume()...`);
  await resumePIDs();
}

/**
 * Trigger ForceEmergencyShutdown() due to critical battery
 */
async function triggerForceEmergencyShutdown(batteryPercent) {
  console.error(`[Safety Manager] Battery dropped to ${batteryPercent}% on battery power! Triggering ForceEmergencyShutdown()...`);
  
  // 1. Instantly write memory checkpoints, state and history to emergency_checkpoint.json
  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      batteryPercent: batteryPercent,
      checkpoints: loopCheckpoints,
      registeredPIDs: Array.from(registeredPIDs)
    };
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`[Safety Manager] Emergency checkpoints written successfully to: ${CHECKPOINT_FILE}`);
  } catch (err) {
    console.error('[Safety Manager] Failed to write emergency checkpoints:', err);
  }

  // 2. Write emergency_trigger.json signal file to force active terminal scripts to write their state instantly
  try {
    const triggerData = { emergency: true, timestamp: new Date().toISOString() };
    fs.writeFileSync(TRIGGER_FILE, JSON.stringify(triggerData, null, 2), 'utf-8');
    console.log(`[Safety Manager] Emergency trigger file signal written to: ${TRIGGER_FILE}`);
  } catch (err) {
    console.error('[Safety Manager] Failed to write emergency trigger file:', err);
  }

  // 3. Explicitly release the 'SetThreadExecutionState' block by stopping the powerManager bypass
  try {
    console.log('[Safety Manager] Releasing sleep bypass to allow default Windows sleep/hibernate behaviors...');
    await powerManager.stop();
  } catch (err) {
    console.error('[Safety Manager] Error stopping power bypass:', err);
  }
}

/**
 * Initialize and start the background safety monitoring loops
 */
function startSafetyMonitor() {
  stopSafetyMonitor();

  console.log('[Safety Manager] Initializing Thermal Safety & Battery Guardrail Monitors...');

  // 1. Thermal Safety Monitor: Polls every 5 seconds
  thermalInterval = setInterval(async () => {
    try {
      // Monitor only when sleep bypass is ON
      if (powerManager.getActiveState()) {
        const isLidClosed = await checkLidClosed();
        
        if (isLidClosed) {
          const temp = await getSystemTemperature();
          console.log(`[Safety Manager] Lid is closed. Current Temp: ${temp.toFixed(1)}°C`);
          
          if (temp > 85 && !isSuspended) {
            await triggerSafePause(temp);
          } else if (temp < 70 && isSuspended) {
            await triggerSafeResume(temp);
          }
        } else {
          // If the lid was opened, automatically resume if we were suspended
          if (isSuspended) {
            await triggerSafeResume(0);
          }
        }
      } else {
        // If bypass is off, ensure everything is in resumed state
        if (isSuspended) {
          await triggerSafeResume(0);
        }
      }
    } catch (err) {
      console.warn('[Safety Manager] Thermal Safety Monitor loop warning:', err.message);
    }
  }, 5000);

  // 2. Battery Guardrail: Polls every 30 seconds
  batteryInterval = setInterval(async () => {
    try {
      if (powerManager.getActiveState()) {
        const powerStatus = await getSystemPowerStatus();
        
        // If running on battery
        if (powerStatus.onBattery) {
          console.log(`[Safety Manager] Running on Battery: ${powerStatus.batteryPercent}%`);
          
          if (powerStatus.batteryPercent < 20) {
            clearInterval(batteryInterval); // stop monitoring once triggered
            await triggerForceEmergencyShutdown(powerStatus.batteryPercent);
          }
        }
      }
    } catch (err) {
      console.warn('[Safety Manager] Battery Guardrail loop warning:', err.message);
    }
  }, 30000);
}

/**
 * Stop background safety monitoring loops
 */
function stopSafetyMonitor() {
  if (thermalInterval) {
    clearInterval(thermalInterval);
    thermalInterval = null;
  }
  if (batteryInterval) {
    clearInterval(batteryInterval);
    batteryInterval = null;
  }
}

module.exports = {
  registerProcess,
  unregisterProcess,
  updateCheckpoint,
  startSafetyMonitor,
  stopSafetyMonitor,
  getSystemTemperature,
  getSystemPowerStatus,
  checkLidClosed,
  suspendPIDs,
  resumePIDs,
  CHECKPOINT_FILE,
  TRIGGER_FILE
};
