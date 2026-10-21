// BLE link to one panel. Uses @capacitor-community/bluetooth-le, which maps to native
// Android BLE in the APK and to Web Bluetooth in Electron / Chrome.
import { BleClient, type BleDevice } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import {
  CHUNK_SIZE, DATA_SERVICE_UUID, NOTIFY_UUID, SERVICE_UUID, WRITE_UUID,
  classifyNotification, getDeviceInfo, hex, parseDeviceInfo, setTime,
  type DeviceInfo, type SendPlan,
} from '../protocol/ipixel';
import { t } from '../i18n';

const ACK_TIMEOUT_MS = 8000;

export type LogFn = (msg: string) => void;
export type ProgressFn = (done: number, total: number) => void;

class Waiter<T> {
  private resolveFn?: (v: T) => void;
  promise!: Promise<T>;
  constructor() { this.reset(); }
  reset() { this.promise = new Promise<T>((r) => (this.resolveFn = r)); }
  resolve(v: T) { this.resolveFn?.(v); }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(t('Keine Antwort der Leiste ({what})', { what }))), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

let initialized: Promise<void> | null = null;
export function initBle() {
  initialized ??= BleClient.initialize({ androidNeverForLocation: true });
  return initialized;
}

/** Opens the system device picker (Android dialog / Electron list / browser chooser). */
export async function pickDevice(showAll: boolean): Promise<BleDevice> {
  await initBle();
  return BleClient.requestDevice({
    ...(showAll ? {} : { namePrefix: 'LED' }),
    optionalServices: [SERVICE_UUID, DATA_SERVICE_UUID],
  });
}

export class PanelConnection {
  info: DeviceInfo | null = null;
  connected = false;
  private chunkSize = CHUNK_SIZE;
  private queue: Promise<unknown> = Promise.resolve();
  private windowAck = new Waiter<number>();
  private finalAck = new Waiter<void>();
  private response = new Waiter<Uint8Array>();
  private closing = false;

  /** onLost fires when the link drops without disconnect() being called. */
  constructor(readonly deviceId: string, readonly name: string, private log: LogFn, private onLost: () => void) {}

  /** Connects (again) to the known device id and reads the panel size. */
  async open(): Promise<DeviceInfo> {
    await initBle();
    this.closing = false;
    this.log(`${this.name}: ${t('Verbinde …')}`);
    await BleClient.connect(this.deviceId, () => {
      const wasOpen = this.connected;
      this.connected = false;
      if (!this.closing && wasOpen) {
        this.log(`${this.name}: ${t('Getrennt – verbinde neu …')}`);
        this.onLost();
      }
    }, { timeout: 15000 });

    if (Capacitor.isNativePlatform()) {
      try {
        const mtu = await BleClient.getMtu(this.deviceId);
        this.chunkSize = Math.max(20, Math.min(CHUNK_SIZE, mtu - 3));
      } catch { /* keep default */ }
    }

    await BleClient.startNotifications(this.deviceId, SERVICE_UUID, NOTIFY_UUID, (view) => {
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
      const n = classifyNotification(bytes);
      if (n.kind === 'ack') {
        if (n.code === 0 || n.code === 1 || n.code === 3) this.windowAck.resolve(n.code);
        if (n.code === 3) this.finalAck.resolve();
      } else {
        this.log(`${this.name} ← ${hex(bytes)}`);
        this.response.resolve(bytes);
      }
    });
    this.connected = true;

    try {
      this.info = parseDeviceInfo(await this.request(getDeviceInfo()));
      this.log(`${this.name}: ${this.info.width}×${this.info.height} (Typ ${this.info.deviceType}, Passwort-Flag ${this.info.passwordFlag})`);
    } catch (e) {
      this.log(`${this.name}: Geräteinfo nicht lesbar (${(e as Error).message}) – nehme 96×16 an`);
      this.info = { deviceType: 132, width: 96, height: 16, passwordFlag: 255, raw: new Uint8Array() };
      await this.send(setTime()).catch(() => undefined);
    }
    return this.info;
  }

  async close() {
    this.closing = true;
    this.connected = false;
    try { await BleClient.stopNotifications(this.deviceId, SERVICE_UUID, NOTIFY_UUID); } catch { /* ignore */ }
    try { await BleClient.disconnect(this.deviceId); } catch { /* ignore */ }
  }

  private async write(data: Uint8Array) {
    if (!this.connected) throw new Error(t('Nicht verbunden.'));
    for (let pos = 0; pos < data.length; pos += this.chunkSize) {
      const chunk = data.slice(pos, pos + this.chunkSize);
      await BleClient.write(this.deviceId, SERVICE_UUID, WRITE_UUID, new DataView(chunk.buffer));
    }
  }

  /** Runs one GATT job at a time – parallel writes make most BLE stacks fail. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private request(plan: SendPlan): Promise<Uint8Array> {
    return this.enqueue(async () => {
      this.response.reset();
      for (const w of plan.windows) await this.write(w.data);
      return withTimeout(this.response.promise, ACK_TIMEOUT_MS, plan.id);
    });
  }

  /** Sends a plan window by window, waiting for the panel's ACKs like the official app. */
  send(plan: SendPlan, progress?: ProgressFn): Promise<void> {
    return this.enqueue(async () => {
      const total = plan.windows.reduce((n, w) => n + w.data.length, 0);
      let done = 0;
      this.finalAck.reset();
      for (const w of plan.windows) {
        this.windowAck.reset();
        await this.write(w.data);
        done += w.data.length;
        progress?.(done, total);
        if (w.requiresAck) await withTimeout(this.windowAck.promise, ACK_TIMEOUT_MS, plan.id);
      }
      if (plan.ackFinal) await withTimeout(this.finalAck.promise, ACK_TIMEOUT_MS, plan.id);
    });
  }

  /** True while nothing is queued – used to drop frames when streaming (equaliser, pixels). */
  get idle() { return this.pending === 0; }
  private pending = 0;
  sendStreaming(plan: SendPlan) {
    if (this.pending > 1) return;
    this.pending++;
    this.send(plan).catch(() => undefined).finally(() => this.pending--);
  }
}
