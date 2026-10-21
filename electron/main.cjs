// Windows desktop shell. Bluetooth runs through Chromium's Web Bluetooth (WinRT underneath);
// Electron has no built-in device chooser, so we forward discovered devices to the page.
const { app, BrowserWindow, ipcMain, Menu, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const AUTO_PICK_TIMEOUT_MS = 12000;

let win = null;
let pendingSelect = null;
let lastSelected = null;
let autoPick = null; // { deviceId, timer }

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 900,
    minWidth: 380,
    backgroundColor: '#0e1116',
    title: 'PixelLeiste',
    icon: path.join(__dirname, '..', 'installer', 'app.ico'),
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
    if (autoPick) {
      const hit = devices.find((d) => d.deviceId === autoPick.deviceId);
      if (hit) finishSelect(hit.deviceId, hit.deviceName);
      return; // stay silent while auto-connecting
    }
    win.webContents.send('bt-devices', devices.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName })));
  });

  win.webContents.session.setBluetoothPairingHandler((details, callback) => {
    // The panel uses unauthenticated BLE; accept "just works" pairing requests.
    callback({ confirmed: details.pairingKind === 'confirm' });
  });

  // Links (release page) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

let knownNames = new Map();
function finishSelect(deviceId, deviceName) {
  if (autoPick) { clearTimeout(autoPick.timer); autoPick = null; }
  if (deviceId) lastSelected = { deviceId, deviceName: deviceName || knownNames.get(deviceId) || '' };
  if (pendingSelect) {
    pendingSelect(deviceId || '');
    pendingSelect = null;
  }
}

ipcMain.on('bt-select', (_e, deviceId) => finishSelect(deviceId));
ipcMain.on('bt-devices-seen', (_e, list) => { for (const d of list) knownNames.set(d.deviceId, d.deviceName); });
ipcMain.handle('bt-last-selected', () => lastSelected);

// Auto-connect: Web Bluetooth's requestDevice() needs a user gesture – executeJavaScript can
// provide one. The select handler above then picks the remembered device without a dialog.
ipcMain.handle('bt-auto-connect', async (_e, deviceId) => {
  if (autoPick) return;
  autoPick = {
    deviceId,
    timer: setTimeout(() => finishSelect(''), AUTO_PICK_TIMEOUT_MS),
  };
  await win.webContents.executeJavaScript('window.__pixelAutoPick && window.__pixelAutoPick()', true).catch(() => undefined);
});

// CPU / RAM for the live text placeholders {cpu} and {ram}.
let lastCpu = os.cpus();
ipcMain.handle('sys-stats', () => {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const prev = lastCpu[i]?.times ?? c.times;
    const d = Object.keys(c.times).reduce((s, k) => s + (c.times[k] - prev[k]), 0);
    total += d;
    idle += c.times.idle - prev.idle;
  });
  lastCpu = now;
  return {
    cpu: total > 0 ? Math.round(100 * (1 - idle / total)) : 0,
    ram: Math.round(100 * (1 - os.freemem() / os.totalmem())),
  };
});

// --- self update (only for installations made with the Inno Setup installer) -------------

const installDir = () => path.dirname(app.getPath('exe'));
ipcMain.handle('is-installed', () => app.isPackaged && fs.existsSync(path.join(installDir(), 'unins000.exe')));
ipcMain.handle('open-external', (_e, url) => (/^https:\/\//.test(url) ? shell.openExternal(url) : undefined));

ipcMain.handle('install-update', async (_e, setupUrl, shaUrl) => {
  const allowed = /^https:\/\/github\.com\/phillhf\/PixelLeiste\/releases\/download\//;
  if (!allowed.test(setupUrl) || !allowed.test(shaUrl)) throw new Error('Unerwartete Download-Adresse');
  const expected = (await (await net.fetch(shaUrl)).text()).trim().split(/\s+/)[0].toLowerCase();
  const data = Buffer.from(await (await net.fetch(setupUrl)).arrayBuffer());
  const actual = crypto.createHash('sha256').update(data).digest('hex');
  if (actual !== expected) throw new Error('Prüfsumme des Updates stimmt nicht');
  const file = path.join(app.getPath('temp'), path.basename(new URL(setupUrl).pathname));
  fs.writeFileSync(file, data);
  spawn(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/RESTARTAPP=1'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 300);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
