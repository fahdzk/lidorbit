// DOM Elements
const widgetCircle = document.querySelector('.widget-circle');
const statusRing = document.getElementById('status-ring');
const pulseDot = document.getElementById('pulse-dot');
const gearBtn = document.getElementById('gear-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const resizeBtn = document.getElementById('resize-btn');
const closeAppBtn = document.getElementById('close-app-btn');
const cartBtn = document.getElementById('cart-btn');
const toggleSwitchContainer = document.getElementById('toggle-switch-container');
const switchTrack = document.getElementById('switch-track');

// Settings Elements
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const licenseStatusTxt = document.getElementById('license-status-txt');
const licensesBtn = document.getElementById('licenses-btn');
const activateNavBtn = document.getElementById('activate-nav-btn');
const registerNavBtn = document.getElementById('register-nav-btn');
const logoutNavBtn = document.getElementById('logout-nav-btn');
const licenseDetailsSec = document.getElementById('license-details-sec');
const licenseUsernameLbl = document.getElementById('license-username-lbl');
const licenseKeyLbl = document.getElementById('license-key-lbl');
const opacitySlider = document.getElementById('opacity-slider');
const opacityValLbl = document.getElementById('opacity-val-lbl');
const launchLoginChk = document.getElementById('launch-login-chk');
const alwaysTopChk = document.getElementById('always-top-chk');
const shapeBtns = document.querySelectorAll('.shape-btn');
const quitBtn = document.getElementById('quit-btn');
const macTooltip = document.getElementById('mac-tooltip');

// MS Store Elements
const msstorePurchaseSection = document.getElementById('msstore-purchase-section');
const msstoreTrialBtn = document.getElementById('msstore-trial-btn');
const msstoreCartBtn = document.getElementById('msstore-cart-btn');

// Alarm Elements
const alarmToggleBtn = document.getElementById('alarm-toggle-btn');
const alarmDecBtn = document.getElementById('alarm-dec-btn');
const alarmIncBtn = document.getElementById('alarm-inc-btn');
const alarmTimeTxt = document.getElementById('alarm-time-txt');

// Activation Modal Elements
const activationModal = document.getElementById('activation-modal');
const activationPitch = document.getElementById('activation-pitch');
const purchaseBtn = document.getElementById('purchase-btn');
const loginUsernameInput = document.getElementById('login-username-input');
const loginPasswordInput = document.getElementById('login-password-input');
const loginPasswordToggle = document.getElementById('login-password-toggle');
const registerLink = document.getElementById('register-link');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const activateBtn = document.getElementById('activate-btn');
const cancelActivationBtn = document.getElementById('cancel-activation-btn');
const activationMessage = document.getElementById('activation-message');
const tabLoginBtn = document.getElementById('tab-login-btn');
const tabKeyBtn = document.getElementById('tab-key-btn');
const loginFieldsContainer = document.getElementById('login-fields-container');
const keyFieldsContainer = document.getElementById('key-fields-container');
const loginKeyInput = document.getElementById('login-key-input');

// Current runtime state cache
let appState = {
  isLicensed: false,
  bypassActive: false,
  buildChannel: 'direct',
  launchAtLogin: false,
  alwaysOnTop: true,
  widgetShape: 'circle',
  alarmEnabled: true,
  alarmInterval: 10,
  isActualLicensed: false,
  isTrialActive: false,
  trialDaysLeft: 0,
  opacity: 100,
  widgetScale: 1.0
};

// Check if running on macOS (to show clamshell monitor advice tooltip)
const isMac = navigator.userAgent.includes('Macintosh');

/**
 * Update the UI elements based on the current cache state.
 */
function renderUI() {
  // 1. License status and toggle lock
  if (appState.isActualLicensed) {
    toggleSwitchContainer.classList.remove('disabled');
    licenseStatusTxt.textContent = 'Licensed ✓';
    licenseStatusTxt.className = 'status-licensed';
    activateNavBtn.classList.add('hidden');
    registerNavBtn.classList.add('hidden');
    logoutNavBtn.classList.remove('hidden');
    licenseDetailsSec.classList.remove('hidden');
    licenseUsernameLbl.textContent = appState.username || '-';
    licenseKeyLbl.textContent = appState.licenseKey || '-';
    msstorePurchaseSection.classList.add('hidden');
    
    // Hide activation modal if shown
    if (!activationModal.classList.contains('hidden') && cancelActivationBtn.classList.contains('hidden')) {
      activationModal.classList.add('hidden');
    }
  } else {
    toggleSwitchContainer.classList.add('disabled');
    licenseStatusTxt.textContent = 'Unlicensed';
    licenseStatusTxt.className = 'status-unlicensed';
    msstorePurchaseSection.classList.add('hidden');
    
    activateNavBtn.classList.remove('hidden');
    registerNavBtn.classList.remove('hidden');
    logoutNavBtn.classList.add('hidden');
    licenseDetailsSec.classList.add('hidden');
    
    // Automatically force activation modal on start if unlicensed
    if (settingsPanel.classList.contains('hidden')) {
      activationModal.classList.remove('hidden');
      cancelActivationBtn.classList.add('hidden'); // Cannot cancel activation
    }
  }

  // Handle front-facing cart button visibility based on license status
  if (appState.isLicensed) {
    cartBtn.classList.add('hidden');
  } else {
    cartBtn.classList.remove('hidden');
  }

  // 2. Bypass state mapping to hardware toggle slider and pulse animations
  if (appState.bypassActive) {
    switchTrack.classList.add('active');
    statusRing.classList.add('active');
    pulseDot.classList.add('active');
  } else {
    switchTrack.classList.remove('active');
    statusRing.classList.remove('active');
    pulseDot.classList.remove('active');
  }

  // 3. Login and Always on Top Checkboxes
  launchLoginChk.checked = appState.launchAtLogin;
  alwaysTopChk.checked = appState.alwaysOnTop;

  // 3b. Opacity slider details rendering
  opacitySlider.value = appState.opacity || 100;
  opacityValLbl.textContent = `${appState.opacity || 100}%`;
  
  if (settingsPanel.classList.contains('hidden')) {
    widgetCircle.style.opacity = (appState.opacity || 100) / 100;
  } else {
    widgetCircle.style.opacity = 1.0;
  }

  // 5. Channel adjustment (Microsoft Store vs Direct)
  // 5. Channel adjustment and licensing pitch
  if (!appState.isLicensed) {
    purchaseBtn.classList.remove('hidden');
  } else {
    purchaseBtn.classList.add('hidden');
  }

  if (appState.buildChannel === 'msstore') {
    activationPitch.textContent = 'Unlock LIDORBIT for $5.99. Log in with your registered account.';
  } else {
    activationPitch.textContent = 'Unlock LIDORBIT for $5.99. Log in with your registered account.';
  }

  // 6. Platform tooltip display
  if (isMac) {
    macTooltip.classList.remove('hidden');
  } else {
    macTooltip.classList.add('hidden');
  }

  // 7. Shape layout updates
  widgetCircle.classList.remove('circle', 'square', 'rectangle');
  widgetCircle.classList.add(appState.widgetShape || 'circle');

  shapeBtns.forEach(btn => {
    if (btn.getAttribute('data-shape') === appState.widgetShape) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 8. Battery warning alarm display state
  if (appState.alarmEnabled) {
    alarmToggleBtn.classList.add('active');
    alarmToggleBtn.src = 'assets/alarm_on.svg';
    alarmDecBtn.disabled = false;
    alarmIncBtn.disabled = false;
    if (appState.alarmInterval <= 8) {
      alarmDecBtn.disabled = true;
    }
  } else {
    alarmToggleBtn.classList.remove('active');
    alarmToggleBtn.src = 'assets/alarm_off.svg';
    alarmDecBtn.disabled = true;
    alarmIncBtn.disabled = true;
  }
  alarmTimeTxt.textContent = `${appState.alarmInterval}m`;

  // Dynamically update Electron window size
  updateWindowSize();
}

/**
 * Update Electron window size depending on active panels or license state.
 */
function updateWindowSize() {
  const isSettingsOpen = settingsPanel && !settingsPanel.classList.contains('hidden');
  const isActivationOpen = activationModal && !activationModal.classList.contains('hidden');

  if (isSettingsOpen || isActivationOpen || !appState.isLicensed) {
    widgetCircle.classList.add('expanded');
    document.documentElement.style.setProperty('--widget-scale', 1);
    if (window.api && typeof window.api.resizeWindow === 'function') {
      window.api.resizeWindow(380, 540);
    }
  } else {
    widgetCircle.classList.remove('expanded');
    // Normal widget size
    const shape = appState.widgetShape || 'circle';
    let baseWidth = 220;
    let baseHeight = 220;
    if (shape === 'rectangle') {
      baseWidth = 280;
      baseHeight = 220;
    }

    const currentScale = appState.widgetScale || 1.0;
    document.documentElement.style.setProperty('--widget-scale', currentScale);

    const width = Math.round(baseWidth * currentScale);
    const height = Math.round(baseHeight * currentScale);

    if (window.api && typeof window.api.resizeWindow === 'function') {
      window.api.resizeWindow(width, height);
    }
  }
}

/**
 * Fetch fresh state from the main process and refresh the screen.
 */
async function syncState() {
  try {
    appState = await window.api.getState();
    renderUI();
  } catch (err) {
    console.error('Failed to sync app state:', err);
  }
}

// Initialize on window load
window.addEventListener('DOMContentLoaded', () => {
  syncState();

  // Listen for sleep bypass toggles initiated from the system tray menu
  window.api.onBypassToggled((data) => {
    syncState();
  });

  // Register / Buy navigation button click
  registerNavBtn.addEventListener('click', () => {
    window.api.openPurchaseLink();
  });

  // Logout navigation button click
  logoutNavBtn.addEventListener('click', async () => {
    const result = await window.api.logout();
    if (result && result.success) {
      // If bypass is active, turn it off first since we are logging out
      if (appState.bypassActive) {
        await window.api.toggleBypass(false);
      }
      await syncState();
    }
  });

  // Initialize password reveal toggle
  if (loginPasswordToggle && loginPasswordInput) {
    setupPasswordToggle(loginPasswordInput, loginPasswordToggle);
  }
});

// Switch Toggle Behavior
toggleSwitchContainer.addEventListener('click', async () => {
  // If the toggle is disabled, clicking it opens the activation modal
  if (toggleSwitchContainer.classList.contains('disabled')) {
    activationMessage.textContent = '';
    activationMessage.className = 'activation-message';
    cancelActivationBtn.classList.add('hidden'); // Force key entry
    activationModal.classList.remove('hidden');
    return;
  }

  // Toggle state
  const targetState = !appState.bypassActive;
  try {
    const result = await window.api.toggleBypass(targetState);
    if (result.success) {
      appState.bypassActive = result.bypassActive;
      appState.bypassMethod = result.method;
      renderUI();
    } else if (result.message) {
      alert(result.message);
    }
  } catch (err) {
    console.error('Failed to toggle bypass:', err);
  }
});

// Gear icon click (Open settings panel)
gearBtn.addEventListener('click', () => {
  activationModal.classList.add('hidden'); // ensure modal is closed
  settingsPanel.classList.remove('hidden');
  window.api.openSettings();
  renderUI();
});

// Close settings panel
closeSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
  // If still unlicensed, force modal back on screen
  if (!appState.isLicensed) {
    activationModal.classList.remove('hidden');
    cancelActivationBtn.classList.add('hidden');
  }
  renderUI();
});
// Licenses Button Click Behavior
licensesBtn.addEventListener('click', () => {
  window.api.openLicensesLink();
});

// Settings -> Activate Key Nav button click
activateNavBtn.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
  
  // Reset message & inputs
  activationMessage.textContent = '';
  activationMessage.className = 'activation-message';
  loginUsernameInput.value = '';
  loginPasswordInput.value = '';
  loginKeyInput.value = '';
  
  // Reset to default tab (login)
  activeTab = 'login';
  tabLoginBtn.style.borderBottom = '2px solid #6366f1';
  tabLoginBtn.style.color = '#fff';
  tabLoginBtn.style.fontWeight = '600';
  tabKeyBtn.style.borderBottom = 'none';
  tabKeyBtn.style.color = 'rgba(255,255,255,0.5)';
  tabKeyBtn.style.fontWeight = '500';
  
  loginFieldsContainer.classList.remove('hidden');
  keyFieldsContainer.classList.add('hidden');
  activateBtn.textContent = 'Log In';
  
  // If licensed, allow cancellation. If unlicensed, lock them in
  if (appState.isLicensed) {
    cancelActivationBtn.classList.remove('hidden');
  } else {
    cancelActivationBtn.classList.add('hidden');
  }
  
  activationModal.classList.remove('hidden');
});

// Create Account click
registerLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.api.openRegisterLink();
});

// Forgot Password click
forgotPasswordLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.api.openForgotPasswordLink();
});

// Cancel Activation Modal
cancelActivationBtn.addEventListener('click', () => {
  activationModal.classList.add('hidden');
  settingsPanel.classList.remove('hidden');
});

// Handle Tab Switching
let activeTab = 'login'; // 'login' or 'key'

tabLoginBtn.addEventListener('click', () => {
  activeTab = 'login';
  tabLoginBtn.style.borderBottom = '2px solid #6366f1';
  tabLoginBtn.style.color = '#fff';
  tabLoginBtn.style.fontWeight = '600';
  tabKeyBtn.style.borderBottom = 'none';
  tabKeyBtn.style.color = 'rgba(255,255,255,0.5)';
  tabKeyBtn.style.fontWeight = '500';
  
  loginFieldsContainer.classList.remove('hidden');
  keyFieldsContainer.classList.add('hidden');
  activateBtn.textContent = 'Log In';
});

tabKeyBtn.addEventListener('click', () => {
  activeTab = 'key';
  tabKeyBtn.style.borderBottom = '2px solid #6366f1';
  tabKeyBtn.style.color = '#fff';
  tabKeyBtn.style.fontWeight = '600';
  tabLoginBtn.style.borderBottom = 'none';
  tabLoginBtn.style.color = 'rgba(255,255,255,0.5)';
  tabLoginBtn.style.fontWeight = '500';
  
  loginFieldsContainer.classList.add('hidden');
  keyFieldsContainer.classList.remove('hidden');
  activateBtn.textContent = 'Activate';
});

// Submit User Login / Activation
activateBtn.addEventListener('click', async () => {
  if (activeTab === 'login') {
    const usernameOrEmail = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();
    
    if (!usernameOrEmail || !password) {
      activationMessage.textContent = 'Please enter both username/email and password.';
      activationMessage.className = 'activation-message error';
      return;
    }

    activationMessage.textContent = 'Logging in...';
    activationMessage.className = 'activation-message';
    activateBtn.disabled = true;

    try {
      const response = await window.api.activateLicense(usernameOrEmail, password);
      
      if (response.success) {
        activationMessage.textContent = response.message;
        activationMessage.className = 'activation-message success';
        
        // Sync state to enable the toggle
        await syncState();
        
        // Auto-hide the modal after 1.5s and return to main widget state
        setTimeout(() => {
          activationModal.classList.add('hidden');
          loginUsernameInput.value = '';
          loginPasswordInput.value = '';
          loginKeyInput.value = '';
        }, 1500);
      } else {
        activationMessage.textContent = response.message;
        activationMessage.className = 'activation-message error';
      }
    } catch (err) {
      console.error('Login activation error:', err);
      activationMessage.textContent = 'An error occurred during verification.';
      activationMessage.className = 'activation-message error';
    } finally {
      activateBtn.disabled = false;
    }
  } else {
    const licenseKey = loginKeyInput.value.trim();
    
    if (!licenseKey) {
      activationMessage.textContent = 'Please enter your license key.';
      activationMessage.className = 'activation-message error';
      return;
    }

    activationMessage.textContent = 'Activating...';
    activationMessage.className = 'activation-message';
    activateBtn.disabled = true;

    try {
      const response = await window.api.activateLicenseByKey(licenseKey);
      
      if (response.success) {
        activationMessage.textContent = response.message;
        activationMessage.className = 'activation-message success';
        
        // Sync state to enable the toggle
        await syncState();
        
        // Auto-hide the modal after 1.5s and return to main widget state
        setTimeout(() => {
          activationModal.classList.add('hidden');
          loginUsernameInput.value = '';
          loginPasswordInput.value = '';
          loginKeyInput.value = '';
        }, 1500);
      } else {
        activationMessage.textContent = response.message;
        activationMessage.className = 'activation-message error';
      }
    } catch (err) {
      console.error('Key activation error:', err);
      activationMessage.textContent = 'An error occurred during activation.';
      activationMessage.className = 'activation-message error';
    } finally {
      activateBtn.disabled = false;
    }
  }
});

// Launch on Login Checkbox Behavior
launchLoginChk.addEventListener('change', async (e) => {
  const isChecked = e.target.checked;
  const success = await window.api.setLaunchAtLogin(isChecked);
  if (!success) {
    alert('Failed to update launch at login settings.');
    // revert checkbox
    launchLoginChk.checked = !isChecked;
  } else {
    appState.launchAtLogin = isChecked;
  }
});

// Always on Top Checkbox Behavior
alwaysTopChk.addEventListener('change', async (e) => {
  const isChecked = e.target.checked;
  const success = await window.api.setAlwaysOnTop(isChecked);
  if (!success) {
    alert('Failed to update always on top settings.');
    // revert checkbox
    alwaysTopChk.checked = !isChecked;
  } else {
    appState.alwaysOnTop = isChecked;
  }
});

// Minimize Button Click Behavior
minimizeBtn.addEventListener('click', () => {
  window.api.minimizeApp();
});

// Alarm Toggle Click Behavior
alarmToggleBtn.addEventListener('click', async () => {
  const targetState = !appState.alarmEnabled;
  const success = await window.api.setAlarmEnabled(targetState);
  if (success) {
    appState.alarmEnabled = targetState;
    renderUI();
  } else {
    alert('Failed to update battery alarm settings.');
  }
});

// Alarm Decrement Click Behavior
alarmDecBtn.addEventListener('click', async () => {
  if (appState.alarmInterval <= 8) return;
  const targetVal = appState.alarmInterval - 1;
  const success = await window.api.setAlarmInterval(targetVal);
  if (success) {
    appState.alarmInterval = targetVal;
    renderUI();
  } else {
    alert('Failed to update alarm interval settings.');
  }
});

// Alarm Increment Click Behavior
alarmIncBtn.addEventListener('click', async () => {
  const targetVal = appState.alarmInterval + 1;
  const success = await window.api.setAlarmInterval(targetVal);
  if (success) {
    appState.alarmInterval = targetVal;
    renderUI();
  } else {
    alert('Failed to update alarm interval settings.');
  }
});

// Cycle Widget Shape (cycles circle -> square -> rectangle -> circle)
resizeBtn.addEventListener('click', async () => {
  let nextShape = 'circle';
  if (appState.widgetShape === 'circle') {
    nextShape = 'square';
  } else if (appState.widgetShape === 'square') {
    nextShape = 'rectangle';
  } else if (appState.widgetShape === 'rectangle') {
    nextShape = 'circle';
  }

  const success = await window.api.setShape(nextShape);
  if (success) {
    appState.widgetShape = nextShape;
    renderUI();
  } else {
    alert('Failed to change widget shape.');
  }
});

// Shape Buttons Click Behavior
shapeBtns.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const shape = e.target.getAttribute('data-shape');
    const success = await window.api.setShape(shape);
    if (success) {
      appState.widgetShape = shape;
      renderUI();
    } else {
      alert('Failed to change widget shape.');
    }
  });
});
// Opacity Slider Event Listeners
opacitySlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  appState.opacity = val;
  opacityValLbl.textContent = `${val}%`;
  // Apply opacity change live (even while editing settings)
  widgetCircle.style.opacity = val / 100;
});

opacitySlider.addEventListener('change', async (e) => {
  const val = parseInt(e.target.value, 10);
  await window.api.setOpacity(val);
});
// Purchase Redirect Buttons
purchaseBtn.addEventListener('click', () => {
  window.api.openPurchaseLink();
});

cartBtn.addEventListener('click', () => {
  window.api.openPurchaseLink();
});

msstoreTrialBtn.addEventListener('click', () => {
  window.api.openMsStoreLink();
});

msstoreCartBtn.addEventListener('click', () => {
  window.api.openPurchaseLink();
});

// Quit Application
quitBtn.addEventListener('click', () => {
  window.api.quitApp();
});

closeAppBtn.addEventListener('click', () => {
  window.api.quitApp();
});

// Play Warning Tone (Web Audio double beep)
function playWarningBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const playTone = (delay) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(988, audioCtx.currentTime + delay); // B5 note
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime + delay);
      
      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.15); // play for 150ms
    };
    
    playTone(0);
    playTone(0.25);
  } catch (err) {
    console.error('Failed to play alarm sound:', err);
  }
}

// Periodic Battery Safety Checker
let lastAlarmTime = 0;

async function checkBatterySafety() {
  if (!appState.alarmEnabled) return;
  if (typeof navigator.getBattery !== 'function') return;

  try {
    const battery = await navigator.getBattery();
    const batteryPercentage = Math.round(battery.level * 100);
    const isCharging = battery.charging;

    // Trigger alert double beep if battery is 15% or below and NOT charging
    if (batteryPercentage <= 15 && !isCharging) {
      const now = Date.now();
      const intervalMs = appState.alarmInterval * 60 * 1000;

      if (now - lastAlarmTime >= intervalMs) {
        playWarningBeep();
        
        new Notification('LIDORBIT Battery Alert', {
          body: `Battery level is at ${batteryPercentage}%. Please plug in your charger!`,
          silent: true
        });

        lastAlarmTime = now;
      }
    } else {
      if (isCharging || batteryPercentage > 15) {
        lastAlarmTime = 0;
      }
    }
  } catch (err) {
    console.error('Failed to query battery safety:', err);
  }
}

// Check every 10 seconds
setInterval(checkBatterySafety, 10000);

// Scale/Zoom support via scrolling mouse wheel
window.addEventListener('wheel', async (e) => {
  // Only allow scrolling to resize if settings panel and activation modal are NOT open
  const isSettingsOpen = settingsPanel && !settingsPanel.classList.contains('hidden');
  const isActivationOpen = activationModal && !activationModal.classList.contains('hidden');
  if (isSettingsOpen || isActivationOpen || !appState.isLicensed) {
    return;
  }

  // Adjust scale factor (scroll up increases scale, scroll down decreases scale)
  const direction = e.deltaY < 0 ? 1 : -1;
  const step = 0.05;
  let newScale = (appState.widgetScale || 1.0) + direction * step;
  
  // Bound the scale between 0.6 and 1.8
  newScale = Math.round(Math.max(0.6, Math.min(1.8, newScale)) * 100) / 100;

  if (newScale !== appState.widgetScale) {
    appState.widgetScale = newScale;
    
    // Apply transform scale immediately
    document.documentElement.style.setProperty('--widget-scale', newScale);
    
    // Update window size
    updateWindowSize();
    
    // Persist scale factor
    await window.api.setScale(newScale);
  }
});

// Helper function to setup password reveal toggles
function setupPasswordToggle(inputField, toggleBtn) {
  const eyeOpen = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeClosed = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  toggleBtn.innerHTML = eyeOpen;
  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (inputField.type === 'password') {
      inputField.type = 'text';
      toggleBtn.innerHTML = eyeClosed;
    } else {
      inputField.type = 'password';
      toggleBtn.innerHTML = eyeOpen;
    }
  });
}
