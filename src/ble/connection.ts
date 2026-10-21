// BLE link to the panel. Uses @capacitor-community/bluetooth-le, which maps to native
// Android BLE in the APK and to Web Bluetooth in Electron / Chrome.
import { BleClient, type BleDevice } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import {
  CHUNK_SIZE, DATA_SERVICE_UUID, NOTIFY_UUID, SERVICE_UUID, WRITE_UUID,
  classifyNotification, getDeviceInfo, hex, parseDeviceInfo, setTime,
  type DeviceInfo, type SendPlan,
} from '../protocol/ipixel';

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
    const t = setTimeout(() => reject(new Error(`Keine Antwort der Leiste (${what})`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class PanelConnection {
  device: BleDevice | null = null;
  info: DeviceInfo | null = null;
  private chunkSize = CHUNK_SIZE;
  private queue: Promise<unknown> = Promise.resolve();
  private windowAck = new Waiter<number>();
  private finalAck = new Waiter<void>();
  private response = new Waiter<Uint8Array>();
  private initialized = false;

  constructor(private log: LogFn, private onDisconnect: () => void) {}

  get connected() { return this.device !== null; }

  private async init() {
    if (this.initialized) return;
    await BleClient.initialize({ androidNeverForLocation: true });
    this.initialized = true;
  }

  /** Opens the system device picker, connects and reads the panel size. */
  async connect(showAll = false): Promise<DeviceInfo> {
    await this.init();
    const device = await BleClient.requestDevice({
      ...(showAll ? {} : { namePrefix: 'LED' }),
      optionalServices: [SERVICE_UUID, DATA_SERVICE_UUID],
    });
    this.log(`Verbinde mit ${device.name ?? device.deviceId} …`);
    await BleClient.connect(device.deviceId, () => {
      this.log('Verbindung getrennt');
      this.device = null;
      this.info = null;
      this.onDisconnect();
    });
    this.device = device;

    if (Capacitor.isNativePlatform()) {
      try {
        const mtu = await BleClient.getMtu(device.deviceId);
        this.chunkSize = Math.max(20, Math.min(CHUNK_SIZE, mtu - 3));
        this.log(`MTU ${mtu} → ${this.chunkSize} Byte pro Paket`);
      } catch { /* keep default */ }
    }

    await BleClient.startNotifications(device.deviceId, SERVICE_UUID, NOTIFY_UUID, (view) => {
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
      const n = classifyNotification(bytes);
      if (n.kind === 'ack') {
        if (n.code === 0 || n.code === 1 || n.code === 3) this.windowAck.resolve(n.code);
        if (n.code === 3) this.finalAck.resolve();
      } else {
        this.log(`← ${hex(bytes)}`);
        this.response.resolve(bytes);
      }
    });

    try {
      const frame = await this.request(getDeviceInfo());
      this.info = parseDeviceInfo(frame);
      this.log(`Panel erkannt: ${this.info.width}×${this.info.height} (Typ ${this.info.deviceType})`);
    } catch (e) {
      this.log(`Geräteinfo nicht lesbar (${(e as Error).message}) – nehme 96×16 an`);
      this.info = { deviceType: 132, width: 96, height: 16, passwordFlag: 255, raw: new Uint8Array() };
      await this.send(setTime()).catch(() => undefined);
    }
    return this.info;
  }

  async disconnect() {
    const d = this.device;
    if (!d) return;
    try { await BleClient.stopNotifications(d.deviceId, SERVICE_UUID, NOTIFY_UUID); } catch { /* ignore */ }
    await BleClient.disconnect(d.deviceId);
    this.device = null;
    this.info = null;
  }

  private async write(data: Uint8Array) {
    if (!this.device) throw new Error('Nicht verbunden');
    for (let pos = 0; pos < data.length; pos += this.chunkSize) {
      const chunk = data.slice(pos, pos + this.chunkSize);
      await BleClient.write(this.device.deviceId, SERVICE_UUID, WRITE_UUID, new DataView(chunk.buffer));
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
      if (plan.ackFinal) await withTimeout(this.finalAck.promise, ACK_TIMEOUT_MS, `${plan.id} Abschluss`);
    });
  }
}
