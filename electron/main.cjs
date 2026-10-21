// Windows desktop shell. Bluetooth runs through Chromium's Web Bluetooth (WinRT underneath);
// Electron has no built-in device chooser, so we forward discovered devices to the page.
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');

let pendingSelect = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 860,
    minWidth: 380,
    backgroundColor: '#0e1116',
    title: 'PixelLeiste',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);

  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    pendingSelect = callback;
    win.webContents.send('bt-devices', devices.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName })));
  });

  win.webContents.session.setBluetoothPairingHandler((details, callback) => {
    // The panel uses unauthenticated BLE; accept "just works" pairing requests.
    callback({ confirmed: details.pairingKind === 'confirm' });
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.on('bt-select', (_e, deviceId) => {
  if (pendingSelect) {
    pendingSelect(deviceId || '');
    pendingSelect = null;
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
