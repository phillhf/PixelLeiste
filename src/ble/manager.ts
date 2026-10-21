// Keeps track of all panels: connecting, remembering, auto-(re)connecting, password check
// and sending to every selected panel at once.
import { PanelConnection, pickDevice, type ProgressFn } from './connection';
import { needsPassword, verifyPassword, type DeviceInfo, type SendPlan } from '../protocol/ipixel';
import { desktop, isAndroid } from '../platform';
import { getSetting, setSetting } from '../ui/dom';
import { t } from '../i18n';

export type PanelState = 'connecting' | 'connected' | 'reconnecting';

export interface Panel {
  /** Stable id used to remember the panel (Android: MAC, Windows: address from the picker). */
  key: string;
  name: string;
  conn: PanelConnection;
  state: PanelState;
  selected: boolean;
}

export interface KnownPanel { key: string; name: string }

export const DEFAULT_INFO: DeviceInfo = { deviceType: 132, width: 96, height: 16, passwordFlag: 255, raw: new Uint8Array() };

const RETRY_DELAYS = [2, 4, 8, 15, 30, 60];

export class PanelManager {
  panels: Panel[] = [];
  private retryTimers = new Map<string, number>();

  constructor(
    private log: (m: string) => void,
    private onChange: () => void,
    private askPassword: (panelName: string) => Promise<string | null>,
  ) {}

  get known(): KnownPanel[] { return getSetting<KnownPanel[]>('known', []); }
  private remember(p: KnownPanel) {
    setSetting('known', [p, ...this.known.filter((k) => k.key !== p.key)].slice(0, 8));
  }
  forget(key: string) {
    setSetting('known', this.known.filter((k) => k.key !== key));
    const pw = getSetting<Record<string, string>>('passwords', {});
    delete pw[key];
    setSetting('passwords', pw);
    this.onChange();
  }

  /** Panels that receive content: selected and connected. */
  get targets() { return this.panels.filter((p) => p.selected && p.state === 'connected'); }
  get anyConnected() { return this.panels.some((p) => p.state === 'connected'); }
  /** Size used for previews and the drawing editor. */
  get primaryInfo(): DeviceInfo {
    return (this.targets[0] ?? this.panels.find((p) => p.state === 'connected'))?.conn.info ?? DEFAULT_INFO;
  }

  /** Picker → connect. `silent` = auto-connect on Windows, the dialog stays hidden. */
  async addViaPicker(showAll: boolean) {
    const dev = await pickDevice(showAll);
    let key = dev.deviceId;
    let name = dev.name || t('Unbenannt');
    if (desktop) {
      const sel = await desktop.lastSelected();
      if (sel) { key = sel.deviceId; name = sel.deviceName || name; }
    }
    return this.open(dev.deviceId, key, name);
  }

  private async open(deviceId: string, key: string, name: string) {
    const existing = this.panels.find((p) => p.key === key);
    if (existing && existing.state !== 'reconnecting') return existing;
    if (existing) this.panels = this.panels.filter((p) => p !== existing);

    const panel: Panel = { key, name, state: 'connecting', selected: existing?.selected ?? true, conn: null! };
    panel.conn = new PanelConnection(deviceId, name, this.log, () => this.lost(panel));
    this.panels.push(panel);
    this.onChange();
    try {
      const info = await panel.conn.open();
      if (needsPassword(info)) await this.unlock(panel);
      panel.state = 'connected';
      this.remember({ key, name });
      return panel;
    } catch (e) {
      await panel.conn.close();
      this.panels = this.panels.filter((p) => p !== panel);
      throw e;
    } finally {
      this.onChange();
    }
  }

  private async unlock(panel: Panel) {
    const saved = getSetting<Record<string, string>>('passwords', {});
    let pw: string | null = saved[panel.key] ?? null;
    if (!pw) pw = await this.askPassword(panel.name);
    if (!pw) throw new Error(t('Abgebrochen'));
    await panel.conn.send(verifyPassword(pw));
    saved[panel.key] = pw;
    setSetting('passwords', saved);
    this.log(`${panel.name}: ${t('Passwort geprüft')}`);
  }

  /** Remembers the password locally after it was changed on the panel. */
  storePassword(panel: Panel, pw: string | null) {
    const saved = getSetting<Record<string, string>>('passwords', {});
    if (pw) saved[panel.key] = pw; else delete saved[panel.key];
    setSetting('passwords', saved);
  }

  async remove(panel: Panel) {
    this.cancelRetry(panel.key);
    this.panels = this.panels.filter((p) => p !== panel);
    await panel.conn.close();
    this.onChange();
  }

  toggle(panel: Panel) { panel.selected = !panel.selected; this.onChange(); }

  // --- automatic (re)connection --------------------------------------------

  private lost(panel: Panel) {
    if (!this.panels.includes(panel)) return;
    panel.state = 'reconnecting';
    this.onChange();
    this.scheduleRetry(panel, 0);
  }

  private cancelRetry(key: string) {
    clearTimeout(this.retryTimers.get(key));
    this.retryTimers.delete(key);
  }

  private scheduleRetry(panel: Panel, attempt: number) {
    this.cancelRetry(panel.key);
    const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)] * 1000;
    this.retryTimers.set(panel.key, window.setTimeout(async () => {
      if (!this.panels.includes(panel) || panel.state !== 'reconnecting') return;
      try {
        await panel.conn.close();
        const info = await panel.conn.open();
        if (needsPassword(info)) await this.unlock(panel);
        panel.state = 'connected';
        this.log(`${panel.name}: ${t('Verbunden')}`);
        this.onChange();
      } catch {
        this.scheduleRetry(panel, attempt + 1);
      }
    }, delay));
  }

  /** Connects all remembered panels without user interaction (app start). */
  async autoConnect() {
    for (const k of this.known) {
      if (this.panels.some((p) => p.key === k.key)) continue;
      try {
        if (isAndroid) {
          await this.open(k.key, k.key, k.name);
        } else if (desktop) {
          // Web Bluetooth needs requestDevice() + a user gesture; the Electron main process
          // supplies both and picks the remembered address silently.
          const bridge = desktop;
          await new Promise<void>((resolve) => {
            window.__pixelAutoPick = () => this.addViaPicker(true).then(() => resolve(), () => resolve());
            bridge.autoConnect(k.key).catch(() => resolve());
          });
        }
      } catch (e) {
        this.log(`${k.name}: ${(e as Error).message}`);
      }
    }
  }

  // --- sending ----------------------------------------------------------------

  /**
   * Builds a plan per panel (sizes may differ) and sends it to all targets in parallel.
   * Resolves with the errors of panels that failed.
   */
  async sendAll(build: (info: DeviceInfo) => SendPlan | Promise<SendPlan>, progress?: ProgressFn): Promise<{ panel: Panel; error: unknown }[]> {
    const targets = this.targets;
    const done = new Map<Panel, [number, number]>();
    const report = () => {
      let d = 0, n = 0;
      for (const [a, b] of done.values()) { d += a; n += b; }
      progress?.(d, n || 1);
    };
    const results = await Promise.allSettled(targets.map(async (p) => {
      const plan = await build(p.conn.info ?? DEFAULT_INFO);
      await p.conn.send(plan, (d, n) => { done.set(p, [d, n]); report(); });
    }));
    return results.flatMap((r, i) => (r.status === 'rejected' ? [{ panel: targets[i], error: r.reason }] : []));
  }

  /** Fire-and-forget for live streams; drops frames when a panel is busy. */
  stream(plan: SendPlan) {
    for (const p of this.targets) p.conn.sendStreaming(plan);
  }
}
