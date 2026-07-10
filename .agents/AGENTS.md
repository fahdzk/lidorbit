# LIDORBIT Agent Workspace Rules & State Memory

This document stores the current development state, architecture details, and verification flows for LIDORBIT so that any new developer or agent session can seamlessly resume work.

---

## 1. Current State & Completed Actions

- **Windows Installer Compiled**: 
  - The setup installer has been successfully generated at [LIDORBIT Setup 1.0.0.exe](file:///c:/Users/fahdz/Desktop/KEEPITUP/dist/LIDORBIT%20Setup%201.0.0.exe) (~80.9 MB).
  - The packaging configuration in [package.json](file:///c:/Users/fahdz/Desktop/KEEPITUP/package.json) has been corrected to include the critical runtime files: `safetyManager.js` and `loading.html`.

- **Licensing Server (Production)**:
  - Host URL: `https://lidorbit-api.wasmer.app`
  - Health check verified: `{"status":"healthy","mode":"production","maxDevices":1}`
  - Database: Connected to Aiven PostgreSQL. Schemas are fully initialized.

- **Website Frontend (Production)**:
  - Host URL: `https://lidorbit.wasmer.app`
  - Frontend scripts dynamically switch API calls between relative paths (for localhost testing) and the production URL (`https://lidorbit-api.wasmer.app`).

---

## 2. Testing Credentials & Configuration

### Test User Account
- **Username**: `lidorbituser`
- **Email**: `user@lidorbit.com`
- **Password**: `Password123!`
- **Stripe License Key**: `cs_test_LIDORBIT_TEST_LICENSE`

### Local Testing Environment
- **Licensing Server (Local)**: 
  - Port: `3000` (run using `npm start` or `npm run dev` in [licensing-server](file:///c:/Users/fahdz/Desktop/KEEPITUP/licensing-server))
- **Electron Client (Local)**: 
  - To test the desktop app against the local server, start it using the following command in PowerShell:
    ```powershell
    $env:LICENSING_SERVER_URL="http://localhost:3000"; npm start
    ```

---

## 3. Core Architecture Links

- **Main Desktop App Files**:
  - [main.js](file:///c:/Users/fahdz/Desktop/KEEPITUP/main.js): Window creation, IPC main handlers, and power manager integration.
  - [preload.js](file:///c:/Users/fahdz/Desktop/KEEPITUP/preload.js): Context bridge exposing methods to the renderer.
  - [renderer.js](file:///c:/Users/fahdz/Desktop/KEEPITUP/renderer.js): Front-end UI styling hooks, battery monitoring, and IPC triggers.
  - [powerManager.js](file:///c:/Users/fahdz/Desktop/KEEPITUP/powerManager.js): System standby, hibernate, and lid-closed action overrides.
  - [safetyManager.js](file:///c:/Users/fahdz/Desktop/KEEPITUP/safetyManager.js): Background process checks and checkpoints.

- **Licensing Server Files**:
  - [server.js](file:///c:/Users/fahdz/Desktop/KEEPITUP/licensing-server/server.js): Express routes, Stripe webhook handler, and device limits.
  - [database.js](file:///c:/Users/fahdz/Desktop/KEEPITUP/licensing-server/database.js): PostgreSQL connection pool and user database queries.
  - [emailService.js](file:///c:/Users/fahdz/Desktop/KEEPITUP/licensing-server/emailService.js): Integration with Brevo API v3 for transactional mail delivery.
