const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /**
   * Retrieves the current state of the application.
   * @returns {Promise<{isLicensed: boolean, bypassActive: boolean, buildChannel: string, bypassMethod: string, launchAtLogin: boolean}>}
   */
  getState: () => ipcRenderer.invoke('get-state'),

  /**
   * Attempts to log in and activate the application.
   * @param {string} usernameOrEmail
   * @param {string} password
   * @returns {Promise<{success: boolean, message: string}>}
   */
  activateLicense: (usernameOrEmail, password) => ipcRenderer.invoke('activate-license', usernameOrEmail, password),
  
  /**
   * Attempts to activate the application using the Stripe license key directly.
   * @param {string} licenseKey
   * @returns {Promise<{success: boolean, message: string}>}
   */
  activateLicenseByKey: (licenseKey) => ipcRenderer.invoke('activate-license-by-key', licenseKey),
  
  /**
   * Logs out the current user by clearing license data.
   * @returns {Promise<{success: boolean}>}
   */
  logout: () => ipcRenderer.invoke('logout'),

  /**
   * Sets the window opacity.
   * @param {number} opacity (30 - 100)
   * @returns {Promise<boolean>}
   */
  setOpacity: (opacity) => ipcRenderer.invoke('set-opacity', opacity),

  /**
   * Opens the forgot password link in the user's default web browser.
   */
  openForgotPasswordLink: () => ipcRenderer.send('open-forgot-password-link'),

  /**
   * Opens the register account link in the user's default web browser.
   */
  openRegisterLink: () => ipcRenderer.send('open-register-link'),

  /**
   * Toggles the power sleep bypass state.
   * @param {boolean} enable
   * @returns {Promise<{success: boolean, bypassActive: boolean, method: string, message?: string}>}
   */
  toggleBypass: (enable) => ipcRenderer.invoke('toggle-bypass', enable),

  /**
   * Opens the purchase URL in the user's default web browser.
   */
  openPurchaseLink: () => ipcRenderer.send('open-purchase-link'),

  /**
   * Opens the Microsoft Store URL in the user's default web browser.
   */
  openMsStoreLink: () => ipcRenderer.send('open-msstore-link'),

  /**
   * Opens the Licenses URL in the user's default web browser.
   */
  openLicensesLink: () => ipcRenderer.send('open-licenses-link'),

  /**
   * Notifies main process that settings were toggled or opened.
   */
  openSettings: () => ipcRenderer.send('open-settings'),

  /**
   * Quits the application.
   */
  quitApp: () => ipcRenderer.send('quit-app'),

  /**
   * Sets whether the app should launch on user login.
   * @param {boolean} enabled
   * @returns {Promise<boolean>}
   */
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('set-launch-at-login', enabled),

  /**
   * Minimizes the application window.
   */
  minimizeApp: () => ipcRenderer.send('minimize-app'),

  /**
   * Sets whether the application window is always on top.
   * @param {boolean} enabled
   * @returns {Promise<boolean>}
   */
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled),

  /**
   * Sets the shape of the application widget window.
   * @param {string} shape ('circle', 'square', 'rectangle')
   * @returns {Promise<boolean>}
   */
  setShape: (shape) => ipcRenderer.invoke('set-shape', shape),

  /**
   * Sets whether the battery low warning alarm is enabled.
   * @param {boolean} enabled
   * @returns {Promise<boolean>}
   */
  setAlarmEnabled: (enabled) => ipcRenderer.invoke('set-alarm-enabled', enabled),

  /**
   * Sets the battery warning alarm repeat interval in minutes.
   * @param {number} interval
   * @returns {Promise<boolean>}
   */
  setAlarmInterval: (interval) => ipcRenderer.invoke('set-alarm-interval', interval),

  /**
   * Listen for external bypass toggles from the tray menu.
   * @param {function} callback
   */
  onBypassToggled: (callback) => ipcRenderer.on('bypass-toggled-externally', (event, data) => callback(data)),

  /**
   * Notifies main process that loading has completed.
   */
  finishLoading: () => ipcRenderer.send('loading-finished'),

  /**
   * Registers a process PID to be paused/resumed by the thermal monitor.
   * @param {number} pid
   * @returns {Promise<boolean>}
   */
  registerActiveProcess: (pid) => ipcRenderer.invoke('register-active-process', pid),

  /**
   * Unregisters a process PID.
   * @param {number} pid
   * @returns {Promise<boolean>}
   */
  unregisterActiveProcess: (pid) => ipcRenderer.invoke('unregister-active-process', pid),

  /**
   * Updates checkpoints or state of active agent loops.
   * @param {string} loopId
   * @param {object} checkpointData
   * @returns {Promise<boolean>}
   */
  updateLoopCheckpoint: (loopId, checkpointData) => ipcRenderer.invoke('update-loop-checkpoint', loopId, checkpointData),

  /**
   * Resizes the application window.
   * @param {number} width
   * @param {number} height
   */
  resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height),

  /**
   * Persists the custom widget scale factor.
   * @param {number} scale
   * @returns {Promise<boolean>}
   */
  setScale: (scale) => ipcRenderer.invoke('set-scale', scale)
});
