const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lidorbit', {
  dragStart: () => ipcRenderer.invoke('drag-start'),
  dragMove: () => ipcRenderer.invoke('drag-move'),
  dragEnd: () => ipcRenderer.invoke('drag-end'),
  minimize: () => ipcRenderer.invoke('minimize-window'),
  close: () => ipcRenderer.invoke('close-window'),
  startInstall: () => ipcRenderer.invoke('start-install'),
  getInstallDir: () => ipcRenderer.invoke('get-install-dir'),
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  launchApp: () => ipcRenderer.invoke('launch-app'),
  
  onProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },
  onComplete: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('install-complete', listener);
    return () => ipcRenderer.removeListener('install-complete', listener);
  },
  onError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('install-error', listener);
    return () => ipcRenderer.removeListener('install-error', listener);
  }
});
