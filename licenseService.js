const Store = require('electron-store');
const crypto = require('crypto');
const store = new Store();

const LICENSING_SERVER_URL = process.env.LICENSING_SERVER_URL || 'https://lidorbit-api.wasmer.app';

/**
 * Generates or retrieves a persistent, unique machine identifier for this installation.
 * @returns {string} The unique machine ID.
 */
function getMachineId() {
  let machineId = store.get('machineId');
  if (!machineId) {
    machineId = crypto.randomUUID();
    store.set('machineId', machineId);
  }
  return machineId;
}

/**
 * Checks if the application is currently licensed.
 * @returns {boolean} True if a valid license is saved.
 */
function isLicensed() {
  return !!store.get('isLicensed');
}

/**
 * Verifies the user credentials (username/email and password) with the licensing server.
 * @param {string} usernameOrEmail The username or email entered by the user.
 * @param {string} password The password entered by the user.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function verifyLicenseKey(usernameOrEmail, password) {
  if (!usernameOrEmail || typeof usernameOrEmail !== 'string' || usernameOrEmail.trim() === '') {
    return { success: false, message: 'Please enter your username or email.' };
  }
  if (!password || typeof password !== 'string' || password.trim() === '') {
    return { success: false, message: 'Please enter your password.' };
  }

  const trimmedUsernameOrEmail = usernameOrEmail.trim();
  const trimmedPassword = password.trim();


  const machineId = getMachineId();

  try {
    const response = await fetch(`${LICENSING_SERVER_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernameOrEmail: trimmedUsernameOrEmail,
        password: trimmedPassword,
        machineId: machineId
      })
    });

    const data = await response.json();

    if (response.ok && data.success === true) {
      // License is valid! Persist state.
      store.set('isLicensed', true);
      store.set('username', data.user.username);
      store.set('email', data.user.email);
      store.set('licenseKey', data.user.licenseKey);

      // Cache token securely using safeStorage
      if (data.token) {
        try {
          const { safeStorage } = require('electron');
          if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(data.token);
            store.set('secureToken', encrypted.toString('base64'));
          } else {
            store.set('secureToken', data.token); // Plaintext fallback
          }
        } catch (e) {
          console.error('Failed to securely store token:', e);
          store.set('secureToken', data.token);
        }
      }
      return { success: true, message: data.message || 'Logged in successfully!' };
    } else {
      return { success: false, message: data.message || 'Invalid credentials. Please try again.' };
    }
  } catch (error) {
    console.error('Login verification error:', error);
    return {
      success: false,
      message: 'Failed to connect to authentication server. Please check your internet connection.'
    };
  }
}

/**
 * Clears the license state (useful for testing and reset settings).
 */
function clearLicense() {
  store.delete('isLicensed');
  store.delete('licenseKey');
  store.delete('username');
  store.delete('email');
  store.delete('secureToken');
}

/**
 * Retrieves and decrypts the cached JWT session token.
 */
function getDecryptedToken() {
  try {
    const encryptedBase64 = store.get('secureToken');
    if (!encryptedBase64) return null;

    const { safeStorage } = require('electron');
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(encryptedBase64, 'base64'));
      } catch (err) {
        // Fallback if it was stored in plaintext or decryption fails
        return encryptedBase64;
      }
    }
    return encryptedBase64;
  } catch (err) {
    console.error('Failed to decrypt token:', err);
    store.delete('secureToken');
    return null;
  }
}

/**
 * Local offline validation for the 72-hour grace period.
 */
function verifyTokenOffline(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Decode base64 payload (second part of JWT)
    const payloadBuf = Buffer.from(parts[1], 'base64');
    const payload = JSON.parse(payloadBuf.toString('utf8'));

    // Check machine ID
    if (payload.machineId !== getMachineId()) {
      console.log('Offline verification failed: Machine ID mismatch');
      return false;
    }

    // Check 72-hour grace period (exp from token)
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= payload.exp) {
      console.log('Offline verification failed: Grace period token expired');
      return false;
    }

    store.set('isLicensed', true);
    return true;
  } catch (err) {
    console.error('Failed to parse token offline:', err);
    return false;
  }
}

/**
 * Validates the token against the server if online, otherwise checks offline grace period.
 */
async function verifyTokenOnStartup() {
  const token = getDecryptedToken();
  if (!token) {
    store.set('isLicensed', false);
    return false;
  }

  // Try a health check call to see if online
  let online = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${LICENSING_SERVER_URL}/health`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    online = response.ok;
  } catch (e) {
    online = false;
  }

  if (online) {
    try {
      const response = await fetch(`${LICENSING_SERVER_URL}/api/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token, machineId: getMachineId() })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        store.set('isLicensed', true);
        
        // Store refreshed token securely
        if (data.token) {
          const { safeStorage } = require('electron');
          if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(data.token);
            store.set('secureToken', encrypted.toString('base64'));
          } else {
            store.set('secureToken', data.token);
          }
        }
        return true;
      } else {
        console.log('Token rejected by server:', data.message);
        clearLicense();
        return false;
      }
    } catch (err) {
      console.error('Online token verification request failed:', err);
      return verifyTokenOffline(token);
    }
  } else {
    console.log('Offline startup: verifying cached token local grace period');
    return verifyTokenOffline(token);
  }
}

/**
 * Requests the creation of a Stripe Checkout Session and returns its URL.
 * @returns {Promise<string>} The Stripe Checkout Session URL.
 */
async function getCheckoutSessionUrl() {
  try {
    const response = await fetch(`${LICENSING_SERVER_URL}/api/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = await response.json();
    if (data.url) {
      return data.url;
    } else {
      throw new Error(data.error || 'No checkout URL returned from server.');
    }
  } catch (error) {
    console.error('Error fetching checkout session URL:', error);
    throw error;
  }
}

/**
 * Activates the application using the Stripe license key directly.
 * @param {string} licenseKey The license key entered by the user.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function activateLicenseByKey(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim() === '') {
    return { success: false, message: 'Please enter your license key.' };
  }

  const trimmedKey = licenseKey.trim();
  const machineId = getMachineId();

  try {
    const response = await fetch(`${LICENSING_SERVER_URL}/api/activate-by-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        licenseKey: trimmedKey,
        machineId: machineId
      })
    });

    const data = await response.json();

    if (response.ok && data.success === true) {
      // License is valid! Persist state.
      store.set('isLicensed', true);
      store.set('username', data.user.username);
      store.set('email', data.user.email);
      store.set('licenseKey', data.user.licenseKey);

      // Cache token securely using safeStorage
      if (data.token) {
        try {
          const { safeStorage } = require('electron');
          if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(data.token);
            store.set('secureToken', encrypted.toString('base64'));
          } else {
            store.set('secureToken', data.token); // Plaintext fallback
          }
        } catch (e) {
          console.error('Failed to securely store token:', e);
          store.set('secureToken', data.token);
        }
      }
      return { success: true, message: data.message || 'LidOrbit activated successfully!' };
    } else {
      return { success: false, message: data.message || 'Invalid license key. Please try again.' };
    }
  } catch (error) {
    console.error('License key activation error:', error);
    return {
      success: false,
      message: 'Failed to connect to authentication server. Please check your internet connection.'
    };
  }
}

module.exports = {
  isLicensed,
  verifyLicenseKey,
  activateLicenseByKey,
  clearLicense,
  getMachineId,
  getCheckoutSessionUrl,
  verifyTokenOnStartup
};

