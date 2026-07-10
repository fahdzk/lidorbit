# LidOrbit Custom Installer - Compiler Guide

This compiler guide describes the architecture, layout, design specs, and packaging instructions for compiling the circular standalone Electron installer of LidOrbit (codename: `keepitup`).

For details on the core capabilities of the main LidOrbit app (sleep bypass, battery safety alerts, and restoration logic), please refer to the main [README.md](file:///C:/Users/fahdz/Desktop/KEEPITUP/README.md).

---

## 1. Directory Structure

The installer is built as a standalone Electron application inside the `/installer` subdirectory of the repository:

```text
C:\users\fahdz\desktop\keepitup\
├── COMPILER.md                 <-- [THIS FILE] Compilation documentation
├── README.md                   <-- Main LidOrbit application specifications
└── installer/
    ├── package.json            <-- Installer packaging config & scripts
    ├── main.js                 <-- Main Electron lifecycle & simulated install logic
    ├── preload.js              <-- Secure contextBridge bridge APIs
    ├── index.html              <-- Main UI structure (380x380px circular frame)
    ├── style.css               <-- CSS layout, color tokens, animations
    ├── renderer.js             <-- Canvas matrix rain, progress loop & actions
    ├── assets/
    │   └── EULA.txt            <-- End User License Agreement text file
    ├── build/                  <-- Target icons directory
    │   ├── icon.ico            <-- Windows icon
    │   └── icon.icns           <-- macOS icon
    └── release/                <-- Generated distribution bundles
```

---

## 2. Visual Theme & Token Specifications

To preserve the hacker-orb branding, the installer implements the following color and layout system:

| Token Name | Token Hex Value | Application Target |
| :--- | :--- | :--- |
| `--black-deep` | `#0B0B0F` | Outer edges of radial gradient background |
| `--purple-deep` | `#2E1A47` | Center point of radial gradient background |
| `--purple-bright` | `#8B5CF6` | Action button background, active progress fill |
| `--purple-glow` | `#B794F6` | Title logo brand "Orbit", text glow highlights |
| `--cyan-accent` | `#00E5FF` | Status indicators, EULA link hover, completion ring |
| `--text-main` | `#E8E6F0` | Header text, percentage numbers, main wordmark |
| `--text-dim` | `#9D97B5` | Checkbox labels, footer links, active copy files |
| `--red-hover` | `#FF4D4D` | Close button hover state, installation error states |

### Design Elements
- **Circular Window Clipping**: The frame is restricted via `width: 380px; height: 380px; border-radius: 50%; overflow: hidden;` on the root `.orb-container` container.
- **Ambient Canvas Matrix Rain**: Animates low-opacity (`~0.35`) falling `0`s and `1`s on a background `<canvas>` behind the user interface, utilizing the color tokens above.

---

## 3. Core Logic & Flow

### A. EULA Agreement Gate
1. The **Install** button begins in a `disabled` state.
2. The user must click the EULA agreement checkbox ("I agree to the Terms & Disclaimer").
3. Checking the box enables the Install button.
4. During installation, both the checkbox and the action button are disabled to prevent modifications.

### B. IPC Security & Preload Bridge
- `contextIsolation` is enabled with `nodeIntegration: false`.
- The renderer communicates strictly via APIs exposed on `window.lidorbit` through [preload.js](file:///C:/Users/fahdz/Desktop/KEEPITUP/installer/preload.js):
  - `startInstall()`, `onProgress()`, `onComplete()`, `onError()` manage the state machine.
  - `dragStart()`, `dragMove()`, `dragEnd()` route drag gestures to prevent frame blocking.

### C. Dragging Fallbacks
- Standard CSS dragging `-webkit-app-region: drag` is applied to non-interactive sections of the background.
- An IPC-based dragging fallback utilizing `screen.getCursorScreenPoint()` is triggered on `mousedown` on the background. This provides robust support on OS systems where native drag overlays fail.

### D. Dependency Verification Checks
- **Automated Validation**: On launch, the installer checks for critical system prerequisites:
  - **Windows**: Checks if the Microsoft Visual C++ 2015-2022 Redistributable (`vcruntime140.dll`) and OS utility `powercfg.exe` are present in `System32`.
  - **macOS**: Checks if the `caffeinate` binary is present in standard binary paths.
- **Fail State & Rerouting**:
  - If a package is missing, the installer sets status to `MISSING DEP`, showing a red ring overlay, and disables the EULA checkbox.
  - The Action Button changes to `Download Fix` (enabled). Clicking it redirects to Microsoft's official VC++ Redistributable executable download page or system support guidelines.
- **Focus Auto-Clear**: The installer monitors the window `focus` event. When the user returns to the installer frame after completing the system update, the check auto-runs. If it passes, the installer recovers and transitions back to `READY`.

---

## 4. Platform-Specific Gotchas

### Windows Frameless Artifacts
On certain Windows DWM (Desktop Window Manager) systems, frameless transparent windows can render a faint rectangular border block.
- **Workaround**: Shortly after the `ready-to-show` event, call `win.setBackgroundColor('#00000000')` inside [main.js](file:///C:/Users/fahdz/Desktop/KEEPITUP/installer/main.js) (wrapped in a short 100ms timeout).

### macOS Vibrancy Shadows
By default, macOS overlays a background blur vibrancy rectangle.
- **Workaround**: Force `win.setVibrancy(null)` on launch inside [main.js](file:///C:/Users/fahdz/Desktop/KEEPITUP/installer/main.js).

### macOS Code Signing
When deploying the installer on macOS, you must configure certificate signatures in `electron-builder` (e.g. `CSC_LINK` and `CSC_KEY_PASSWORD` env variables) to avoid gatekeeper blocker alerts.

---

## 5. Step-by-Step Build Commands

Always run build operations from within the `/installer` subdirectory:

### Step 1: Install Dependencies
```powershell
cd C:\Users\fahdz\Desktop\KEEPITUP\installer
npm install
```

### Step 2: Test Locally
Launch the frameless circular installer widget in developer mode:
```powershell
npm start
```

### Step 3: Icon Generation
To compile high-resolution icons, place a `1024x1024` master PNG named `master_icon.png` in the `/installer` root and run:
```powershell
npx -y electron-icon-builder --input=master_icon.png --output=build --flatten
```
This automatically outputs `build/icon.ico` and `build/icon.icns`.

### Step 4: Package standalone binaries
To bundle the installer into standalone distributions inside `/release`:
- **For Windows (.exe)**:
  Compiles the installer as a **portable** executable (`LidOrbit Setup.exe`) which instantly launches the custom circular installer window directly when clicked, bypassing standard wizard panels:
  ```powershell
  npm run dist:win
  ```
- **For macOS (.dmg)**:
  ```powershell
  npm run dist:mac
  ```

---

## 6. Pre-Ship Quality Checklist

- [ ] **EULA Checkbox Block**: Install button is disabled by default; toggles when EULA is checked.
- [ ] **EULA & Footer Redirects**: Clicking EULA and footer links successfully triggers the default browser to load external support pages.
- [ ] **Simulated Copy Manifest**: Make sure the manifest array lists correct components (asar, locales, bin, nodes).
- [ ] **App payload bundles**: Swapped in real payload files inside `/installer/extraResources/` to package alongside the installer if shipping production configurations.
- [ ] **Dependency Checks**: Visual C++ Redistributable warning state and download redirections trigger correctly when simulated as missing, and recover automatically on window refocus when restored.
- [ ] **DWM Transparency**: Tested on Windows to ensure no border lines or dark rectangular artifact boxes are visible.
- [ ] **macOS Vibrancy check**: Tested on macOS to verify the circle is completely transparent on desktop backgrounds.
- [ ] **Restoration loop**: Validated that the main app correctly stores and restores standby/hibernate settings on startup/quit.
