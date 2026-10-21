// Windows desktop shell. Bluetooth runs through Chromium's Web Bluetooth (WinRT underneath);
// Electron has no built-in device chooser, so we forward discovered devices to the page.
const { app, BrowserWindow, ipcMain, Menu, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const AUTO_PICK_TIMEOUT_MS = 12000;

// Chromium ships Web Bluetooth on Linux (BlueZ via D-Bus) only behind a flag.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
  app.commandLine.appendSwitch('enable-features', 'WebBluetooth');
}

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

// --- self update ------------------------------------------------------------------------
// Windows: installations made with the Inno Setup installer run the new setup silently.
// Linux: an AppImage replaces itself; a .deb installation gets the verified package opened
// in the system's software installer.

const installDir = () => path.dirname(app.getPath('exe'));

/** 'setup' | 'appimage' | 'deb' | 'none' */
function updateMode() {
  if (!app.isPackaged) return 'none';
  if (process.platform === 'win32') return fs.existsSync(path.join(installDir(), 'unins000.exe')) ? 'setup' : 'none';
  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) return 'appimage';
    if (installDir().startsWith('/opt/')) return 'deb';
  }
  return 'none';
}

const ASSET = {
  setup: (v) => `PixelLeiste-Setup-${v}.exe`,
  appimage: (v) => `PixelLeiste-${v}-x86_64.AppImage`,
  deb: (v) => `pixelleiste_${v}_amd64.deb`,
};

ipcMain.handle('update-mode', () => updateMode());
ipcMain.handle('open-external', (_e, url) => (/^https:\/\//.test(url) ? shell.openExternal(url) : undefined));

async function download(url) {
  const allowed = /^https:\/\/github\.com\/phillhf\/PixelLeiste\/releases\/download\//;
  if (!allowed.test(url)) throw new Error('Unerwartete Download-Adresse');
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

ipcMain.handle('install-update', async (_e, version, assets) => {
  const mode = updateMode();
  if (mode === 'none') throw new Error('Diese Installation kann sich nicht selbst aktualisieren');
  const name = ASSET[mode](version);
  const url = assets.find((a) => a.name === name)?.url;
  const shaUrl = assets.find((a) => a.name === `${name}.sha256`)?.url;
  if (!url || !shaUrl) throw new Error(`${name} fehlt in der Release`);

  const expected = (await download(shaUrl)).toString('utf8').trim().split(/\s+/)[0].toLowerCase();
  const data = await download(url);
  if (crypto.createHash('sha256').update(data).digest('hex') !== expected) throw new Error('Prüfsumme des Updates stimmt nicht');

  if (mode === 'setup') {
    const file = path.join(app.getPath('temp'), name);
    fs.writeFileSync(file, data);
    spawn(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/RESTARTAPP=1'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
  } else if (mode === 'appimage') {
    const target = process.env.APPIMAGE;
    const tmp = `${target}.new`;
    fs.writeFileSync(tmp, data, { mode: 0o755 });
    fs.renameSync(tmp, target);
    app.relaunch({ execPath: target });
    app.quit();
  } else {
    const file = path.join(app.getPath('downloads'), name);
    fs.writeFileSync(file, data);
    const err = await shell.openPath(file);
    if (err) throw new Error(`Paket gespeichert unter ${file} – bitte mit „sudo apt install ${file}“ installieren`);
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
