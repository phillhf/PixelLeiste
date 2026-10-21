// Simulated iPixel LED panels behind a fake Web Bluetooth API (for Playwright tests and demos).
// Reassembles length-prefixed frames like the real panel and answers with ACKs / device info.
// window.__mockBle exposes the received frames and helpers to drop connections.
(() => {
  const ACK = (cmd, sub, code) => new Uint8Array([5, 0, cmd, sub, code]);
  const hex = (b) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');

  class MockCharacteristic extends EventTarget {
    constructor(service, uuid) {
      super();
      this.service = service;
      this.uuid = uuid;
      this.value = null;
    }
    async startNotifications() { return this; }
    async stopNotifications() { return this; }
    async writeValueWithResponse(dv) { this.service.device._receive(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)); }
    async writeValueWithoutResponse(dv) { return this.writeValueWithResponse(dv); }
    _notify(bytes) {
      this.value = new DataView(bytes.buffer);
      this.dispatchEvent(new Event('characteristicvaluechanged'));
    }
  }

  class MockDevice extends EventTarget {
    constructor(id, name, opts = {}) {
      super();
      this.id = id;
      this.name = name;
      this.passwordFlag = opts.password ? 1 : 255;
      this.frames = [];
      this.buffer = new Uint8Array(0);
      this.transfer = null;
      const service = { uuid: '000000fa-0000-1000-8000-00805f9b34fb', device: this };
      this.notifyChar = new MockCharacteristic(service, '0000fa03-0000-1000-8000-00805f9b34fb');
      this.writeChar = new MockCharacteristic(service, '0000fa02-0000-1000-8000-00805f9b34fb');
      const dev = this;
      this.gatt = {
        connected: false,
        device: dev,
        async connect() { this.connected = true; return this; },
        disconnect() {
          if (!this.connected) return;
          this.connected = false;
          dev.dispatchEvent(new Event('gattserverdisconnected'));
        },
        async getPrimaryService() {
          return {
            uuid: service.uuid, device: dev,
            getCharacteristic: async (uuid) => (String(uuid).includes('fa03') ? dev.notifyChar : dev.writeChar),
          };
        },
        async getPrimaryServices() { return [await this.getPrimaryService()]; },
      };
    }

    _reply(bytes) { setTimeout(() => this.notifyChar._notify(bytes), 5); }

    _receive(chunk) {
      if (!this.gatt.connected) throw new Error('GATT disconnected');
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
      while (this.buffer.length >= 2) {
        const len = this.buffer[0] | (this.buffer[1] << 8);
        if (len < 4 || this.buffer.length < len) break;
        const frame = this.buffer.slice(0, len);
        this.buffer = this.buffer.slice(len);
        this._frame(frame);
      }
    }

    _frame(f) {
      const [, , cmd, sub] = f;
      this.frames.push({ cmd, sub, len: f.length, hex: f.length <= 64 ? hex(f) : `${hex(f.slice(0, 32))}…` });
      const windowed = (cmd === 0 && sub === 1) || (cmd === 2 && sub === 0) || (cmd === 3 && sub === 0);
      if (windowed) {
        // [len16][type,0,option][size32][crc32][tail,slot][chunk]
        const size = f[5] | (f[6] << 8) | (f[7] << 16) | (f[8] << 24);
        const option = f[4];
        if (option === 0) this.transfer = { received: 0, size, kind: cmd === 0 ? 'text' : cmd === 2 ? 'png' : 'gif', slot: f[14] };
        this.transfer.received += f.length - 15;
        const done = this.transfer.received >= this.transfer.size;
        if (done) this.lastContent = { kind: this.transfer.kind, bytes: this.transfer.size, slot: this.transfer.slot };
        this._reply(ACK(cmd, sub, done ? 3 : 1));
        return;
      }
      if (cmd === 1 && sub === 0x80) {
        // device info / set time → info frame: byte 4 = type 132 (96×16), byte 10 = password flag
        this._reply(new Uint8Array([11, 0, 1, 0x80, 132, 1, 0, 1, 0, 0, this.passwordFlag]));
        return;
      }
      if ((cmd === 5 && sub === 1) || (cmd === 1 && sub === 2)) return; // pixel / equaliser: no ACK
      if (cmd === 5 && sub === 2) this.verified = hex(f.slice(4));
      if (cmd === 4 && sub === 2) this.passwordFlag = f[4] ? 1 : 255;
      this._reply(ACK(cmd, sub, 0));
    }
  }

  const devices = [new MockDevice('mock-1', 'LED_BLE_A1B2'), new MockDevice('mock-2', 'LED_BLE_C3D4')];
  let pickIndex = 0;

  const bluetooth = {
    async getAvailability() { return true; },
    async requestDevice() {
      const free = devices.filter((d) => !d.gatt.connected);
      const dev = window.__mockBle.nextPick ? devices.find((d) => d.name === window.__mockBle.nextPick) : free[pickIndex++ % Math.max(1, free.length)];
      if (!dev) throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
      return dev;
    },
    async getDevices() { return devices; },
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(navigator, 'bluetooth', { value: bluetooth, configurable: true });

  window.__mockBle = {
    devices,
    nextPick: null,
    framesOf: (name) => devices.find((d) => d.name === name).frames,
    dropConnection: (name) => devices.find((d) => d.name === name).gatt.disconnect(),
    MockDevice,
  };
})();
