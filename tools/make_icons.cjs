// Renders the app icon with Electron's offscreen Chromium and writes Windows + Android sizes.
// Usage: npx electron tools/make_icons.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// A dark rounded tile with a 3-row LED strip showing a colourful "wave".
function iconHtml(size, { foreground = false } = {}) {
  return `<!doctype html><body style="margin:0;background:transparent">
<canvas id="c" width="${size}" height="${size}"></canvas><script>
const c = document.getElementById('c'), x = c.getContext('2d'), s = ${size};
const fg = ${foreground};
if (!fg) {
  x.fillStyle = '#0e1116';
  const r = s * 0.22; x.beginPath(); x.roundRect(0, 0, s, s, r); x.fill();
}
const inset = fg ? s * 0.25 : s * 0.12;
const w = s - inset * 2, cols = 9, rows = 4, cell = w / cols;
const top = s / 2 - (rows * cell) / 2;
x.fillStyle = '#05070a'; x.beginPath(); x.roundRect(inset - cell * 0.25, top - cell * 0.25, w + cell * 0.5, rows * cell + cell * 0.5, cell * 0.4); x.fill();
const lit = ['#ff3b30','#ff9500','#ffd60a','#34c759','#00e5ff','#0a84ff','#bf5af2','#ff2d92','#ff3b30'];
for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
  const on = j === (Math.round(1.5 + 1.5 * Math.sin(i * 0.8)));
  const on2 = Math.abs(j - (1.5 + 1.5 * Math.sin(i * 0.8))) < 0.9;
  x.fillStyle = on || on2 ? lit[i] : '#1b2028';
  x.beginPath(); x.arc(inset + cell * (i + 0.5), top + cell * (j + 0.5), cell * 0.36, 0, Math.PI * 2); x.fill();
}
</script></body>`;
}

async function render(win, size, opts) {
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(iconHtml(size, opts)));
  const dataUrl = await win.webContents.executeJavaScript("document.getElementById('c').toDataURL('image/png')");
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 1100, transparent: true });
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), await render(win, 512));
  fs.writeFileSync(path.join(ROOT, 'public', 'icon.png'), await render(win, 192));

  // Windows .ico (PNG-compressed entries) for the EXE and the setup
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of icoSizes) pngs.push(await render(win, s));
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach((png, i) => {
    const e = 6 + 16 * i, s = icoSizes[i];
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  fs.writeFileSync(path.join(ROOT, 'installer', 'app.ico'), Buffer.concat([header, ...pngs]));

  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, f] of Object.entries(dens)) {
    const dir = path.join(RES, `mipmap-${d}`);
    if (!fs.existsSync(dir)) continue;
    const legacy = await render(win, Math.round(48 * f));
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), legacy);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), legacy);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await render(win, Math.round(108 * f), { foreground: true }));
  }
  const bg = path.join(RES, 'values', 'ic_launcher_background.xml');
  if (fs.existsSync(bg)) {
    fs.writeFileSync(bg, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E1116</color>\n</resources>\n');
  }
  console.log('icons written');
  app.quit();
});
