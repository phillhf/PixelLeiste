const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelDesktop', {
  onDevices: (cb) => ipcRenderer.on('bt-devices', (_e, list) => {
    ipcRenderer.send('bt-devices-seen', list);
    cb(list);
  }),
  select: (deviceId) => ipcRenderer.send('bt-select', deviceId),
  lastSelected: () => ipcRenderer.invoke('bt-last-selected'),
  autoConnect: (deviceId) => ipcRenderer.invoke('bt-auto-connect', deviceId),
  sysStats: () => ipcRenderer.invoke('sys-stats'),
  platform: process.platform,
  updateMode: () => ipcRenderer.invoke('update-mode'),
  installUpdate: (version, assets) => ipcRenderer.invoke('install-update', version, assets),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
