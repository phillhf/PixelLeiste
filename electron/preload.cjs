const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelDesktop', {
  onDevices: (cb) => ipcRenderer.on('bt-devices', (_e, list) => cb(list)),
  select: (deviceId) => ipcRenderer.send('bt-select', deviceId),
});
