// Canvas binary matrix rain effect
const canvas = document.getElementById('matrix-canvas');
const ctx = canvas.getContext('2d');

canvas.width = 380;
canvas.height = 380;

const fontSize = 11;
const columns = Math.ceil(canvas.width / fontSize);
const drops = [];
const colors = ['#8B5CF6', '#B794F6', '#00E5FF', '#6D28D9'];

// Initialize drop data structure
for (let i = 0; i < columns; i++) {
  drops[i] = {
    y: Math.random() * -100 - 20,
    speed: 0.8 + Math.random() * 1.5,
    trailLength: 6 + Math.floor(Math.random() * 8)
  };
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawMatrix() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontSize}px 'Space Grotesk', monospace`;

  for (let i = 0; i < columns; i++) {
    const x = i * fontSize;
    const drop = drops[i];

    for (let j = 0; j < drop.trailLength; j++) {
      const charY = drop.y - (j * fontSize);
      if (charY < 0 || charY > canvas.height) continue;

      const char = Math.random() > 0.5 ? '1' : '0';
      const opacityFactor = (drop.trailLength - j) / drop.trailLength;
      // Ambient rain has low max opacity around 0.35
      const opacity = opacityFactor * 0.35;

      let color;
      if (j === 0) {
        color = Math.random() > 0.5 ? '#00E5FF' : '#B794F6';
      } else {
        color = colors[Math.floor(Math.random() * colors.length)];
      }

      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.fillText(char, x, charY);
    }

    drop.y += drop.speed;

    if (drop.y - (drop.trailLength * fontSize) > canvas.height) {
      drop.y = Math.random() * -50 - 20;
      drop.speed = 0.8 + Math.random() * 1.5;
      drop.trailLength = 6 + Math.floor(Math.random() * 8);
    }
  }
}

// Tick at ~30 FPS
setInterval(drawMatrix, 33);

// IPC-based dragging fallback handlers
const bg = document.getElementById('draggable-bg');
let isMouseDown = false;

bg.addEventListener('mousedown', (e) => {
  // Prevent drag triggers when interacting with buttons, inputs, links, or custom checkboxes
  if (e.target.closest('button, input, a, .eula-checkbox-label, .checkbox-custom')) {
    return;
  }
  isMouseDown = true;
  window.lidorbit.dragStart();
});

window.addEventListener('mousemove', (e) => {
  if (isMouseDown) {
    window.lidorbit.dragMove();
  }
});

window.addEventListener('mouseup', () => {
  if (isMouseDown) {
    isMouseDown = false;
    window.lidorbit.dragEnd();
  }
});

// Window controls
document.getElementById('btn-minimize').addEventListener('click', () => {
  window.lidorbit.minimize();
});

document.getElementById('btn-close').addEventListener('click', () => {
  window.lidorbit.close();
});

// Anchor and External redirects
const eulaLink = document.getElementById('link-eula');
const termsLink = document.getElementById('link-terms');
const privacyLink = document.getElementById('link-privacy');

eulaLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.lidorbit.openExternal('https://www.lidorbit.com/licenses');
});

termsLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.lidorbit.openExternal('https://www.lidorbit.com/licenses');
});

privacyLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.lidorbit.openExternal('https://www.lidorbit.com/privacy-policy');
});

// UI Elements setup
const checkbox = document.getElementById('eula-checkbox');
const actionBtn = document.getElementById('btn-action');
const progressFill = document.querySelector('.progress-ring-fill');
const progressPercent = document.getElementById('progress-percentage');
const progressStatus = document.getElementById('progress-status');
const currentFileLog = document.getElementById('current-file');

// Dependency Missing State
let missingDependency = null;
let installerState = 'ready'; // 'ready', 'installing', 'complete', 'error', 'missing-dependency'
const totalCircumference = 553;

// EULA Agreement Gate
checkbox.addEventListener('change', () => {
  if (installerState === 'ready' || installerState === 'error') {
    actionBtn.disabled = !checkbox.checked;
  }
});

async function runDependencyCheck() {
  try {
    const issues = await window.lidorbit.checkDependencies();
    if (issues && issues.length > 0) {
      missingDependency = issues[0];
      installerState = 'missing-dependency';
      
      progressPercent.textContent = '!';
      progressStatus.textContent = 'MISSING DEP';
      progressStatus.style.color = 'var(--red-hover)';
      
      progressFill.style.stroke = 'var(--red-hover)';
      progressFill.style.strokeDashoffset = 0;
      progressFill.style.filter = 'none';
      
      currentFileLog.textContent = missingDependency.name;
      currentFileLog.style.color = 'var(--red-hover)';
      
      checkbox.checked = false;
      checkbox.disabled = true;
      
      actionBtn.disabled = false;
      actionBtn.textContent = 'Download Fix';
    } else {
      if (installerState === 'missing-dependency') {
        missingDependency = null;
        installerState = 'ready';
        
        progressPercent.textContent = '0%';
        progressStatus.textContent = 'READY';
        progressStatus.style.color = 'var(--cyan-accent)';
        
        progressFill.style.stroke = 'var(--purple-bright)';
        progressFill.style.strokeDashoffset = totalCircumference;
        progressFill.style.filter = 'url(#glow)';
        
        currentFileLog.textContent = 'Ready to configure system...';
        currentFileLog.style.color = 'var(--text-dim)';
        
        checkbox.disabled = false;
        actionBtn.disabled = !checkbox.checked;
        actionBtn.textContent = 'Install LidOrbit';
      }
    }
  } catch (err) {
    console.error('Dependency check failed:', err);
  }
}

// Check on startup
runDependencyCheck();

// Re-check when window is focused
window.addEventListener('focus', () => {
  if (installerState === 'ready' || installerState === 'missing-dependency') {
    runDependencyCheck();
  }
});

function updateProgress(percent, currentFile) {
  // Update percentage text
  progressPercent.textContent = `${percent}%`;
  
  // Update current file path
  currentFileLog.textContent = currentFile;
  
  // Animate SVG stroke offset
  const offset = totalCircumference - (percent / 100) * totalCircumference;
  progressFill.style.strokeDashoffset = offset;
}

// Action Button behavior router
actionBtn.addEventListener('click', () => {
  if (installerState === 'missing-dependency' && missingDependency) {
    window.lidorbit.openExternal(missingDependency.url);
    return;
  }
  
  if (installerState === 'ready' || installerState === 'error') {
    if (!checkbox.checked) return;
    
    // Update UI state to installing
    installerState = 'installing';
    actionBtn.disabled = true;
    checkbox.disabled = true;
    actionBtn.textContent = 'Installing...';
    progressStatus.textContent = 'INSTALLING';
    progressFill.style.stroke = 'var(--purple-bright)';
    
    // Trigger main process copy stream
    window.lidorbit.startInstall();
  } else if (installerState === 'complete') {
    // Launch executable / Close installer
    window.lidorbit.launchApp();
    window.lidorbit.close();
  }
});

// IPC event listeners from main
window.lidorbit.onProgress((data) => {
  if (installerState !== 'installing') return;
  updateProgress(data.percent, data.currentFile);
});

window.lidorbit.onComplete((data) => {
  installerState = 'complete';
  
  // Format completion UI
  progressPercent.textContent = '100%';
  progressStatus.textContent = 'COMPLETE';
  progressStatus.style.color = 'var(--cyan-accent)';
  progressFill.style.strokeDashoffset = 0;
  progressFill.style.stroke = 'var(--cyan-accent)';
  
  // Show glowing drop shadow on completion
  progressFill.style.filter = 'drop-shadow(0 0 8px var(--cyan-accent))';
  
  currentFileLog.textContent = 'LidOrbit setup complete!';
  currentFileLog.style.color = 'var(--cyan-accent)';
  
  actionBtn.disabled = false;
  actionBtn.textContent = 'Launch LidOrbit';
});

window.lidorbit.onError((data) => {
  installerState = 'error';
  
  progressStatus.textContent = 'ERROR';
  progressStatus.style.color = 'var(--red-hover)';
  progressFill.style.stroke = 'var(--red-hover)';
  
  currentFileLog.textContent = data.message || 'An error occurred during install.';
  currentFileLog.style.color = 'var(--red-hover)';
  
  actionBtn.disabled = false;
  checkbox.disabled = false;
  actionBtn.textContent = 'Retry Install';
});
