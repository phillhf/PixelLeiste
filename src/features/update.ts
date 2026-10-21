// Checks GitHub for a newer release. Windows (installed via setup): downloads the setup,
// verifies its SHA-256 and updates silently. Android: opens the APK download.
import { Browser } from '@capacitor/browser';
import { $, checked, errMsg, getSetting, setSetting, toast } from '../ui/dom';
import { APP_VERSION, REPO, desktop, isAndroid } from '../platform';
import { t } from '../i18n';

interface Release {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

let latest: Release | null = null;

/** -1 if a < b, 0 if equal, 1 if a > b (x.y.z). */
export function compareVersions(a: string, b: string) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export async function checkForUpdate(manual: boolean) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    latest = await r.json() as Release;
    setSetting('lastUpdateCheck', Date.now());
    const v = latest.tag_name.replace(/^v/, '');
    if (compareVersions(v, APP_VERSION) > 0 && (manual || getSetting('skipVersion', '') !== v)) {
      $('updateText').textContent = t('Version {v} ist verfügbar.', { v });
      $('btnUpdate').textContent = desktop || isAndroid ? t('Jetzt aktualisieren') : t('Herunterladen');
      $('updateBar').hidden = false;
    } else if (manual) {
      toast(t('Du hast die neueste Version ({v}).', { v: APP_VERSION }));
    }
  } catch (e) {
    if (manual) toast(t('Update-Prüfung fehlgeschlagen: {e}', { e: errMsg(e) }), true);
  }
}

async function installUpdate() {
  if (!latest) return;
  const v = latest.tag_name.replace(/^v/, '');
  const asset = (name: string) => latest!.assets.find((a) => a.name === name)?.browser_download_url;
  try {
    if (desktop) {
      const setup = asset(`PixelLeiste-Setup-${v}.exe`);
      const sha = asset(`PixelLeiste-Setup-${v}.exe.sha256`);
      if (setup && sha && await desktop.isInstalled()) {
        toast(t('Update wird geladen …'));
        await desktop.installUpdate(setup, sha);
      } else {
        await desktop.openExternal(latest.html_url);
      }
    } else if (isAndroid) {
      await Browser.open({ url: asset(`PixelLeiste-${v}.apk`) ?? latest.html_url });
    } else {
      window.open(latest.html_url, '_blank', 'noopener');
    }
  } catch (e) {
    toast(t('Update-Prüfung fehlgeschlagen: {e}', { e: errMsg(e) }), true);
  }
}

export function initUpdate() {
  $('appVersion').textContent = t('Version {v}', { v: APP_VERSION });
  $('btnCheckUpdate').addEventListener('click', () => checkForUpdate(true));
  $('btnUpdate').addEventListener('click', installUpdate);
  $('btnUpdateLater').addEventListener('click', () => {
    if (latest) setSetting('skipVersion', latest.tag_name.replace(/^v/, ''));
    $('updateBar').hidden = true;
  });
  const last = getSetting('lastUpdateCheck', 0);
  if (checked('autoUpdate') && Date.now() - last > 6 * 3600_000) checkForUpdate(false);
}

export const rerenderUpdate = () => { $('appVersion').textContent = t('Version {v}', { v: APP_VERSION }); };
