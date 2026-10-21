// iPixel Color BLE protocol (LED_BLE_* panels, e.g. 96x16 "TR5645H135-08H").
// Byte layouts follow the MIT-licensed reverse engineering in lucagoc/pypixelcolor.
import { crc32 } from './crc32';

export const SERVICE_UUID = '000000fa-0000-1000-8000-00805f9b34fb';
export const WRITE_UUID = '0000fa02-0000-1000-8000-00805f9b34fb';
export const NOTIFY_UUID = '0000fa03-0000-1000-8000-00805f9b34fb';
export const DATA_SERVICE_UUID = '0000ae00-0000-1000-8000-00805f9b34fb';

export const CHUNK_SIZE = 244;
export const WINDOW_SIZE = 12 * 1024;

export interface Window {
  data: Uint8Array;
  requiresAck: boolean;
}

export interface SendPlan {
  id: string;
  windows: Window[];
  /** Wait for the "all done" ACK (code 3) after the last window. */
  ackFinal: boolean;
  /** The command answers with a data frame (device info). */
  expectsResponse?: boolean;
}

function single(id: string, bytes: number[], requiresAck = true): SendPlan {
  return { id, windows: [{ data: Uint8Array.from(bytes), requiresAck }], ackFinal: false };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const u32le = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

// ---------------------------------------------------------------------------
// Device info

/** LED type → (width, height); the device reports its type in byte 4 of the info frame. */
const DEVICE_TYPE_SIZES: Record<number, [number, number]> = {
  128: [64, 64], 129: [32, 32], 130: [32, 16], 131: [64, 16], 132: [96, 16],
  133: [64, 20], 134: [128, 32], 135: [144, 16], 136: [192, 16], 137: [48, 24],
  138: [64, 32], 139: [96, 32], 140: [128, 32], 141: [96, 32], 142: [160, 32],
  143: [192, 32], 144: [256, 32], 145: [320, 32], 146: [384, 32], 147: [448, 32],
};

export interface DeviceInfo {
  deviceType: number;
  width: number;
  height: number;
  passwordFlag: number;
  raw: Uint8Array;
}

export function parseDeviceInfo(frame: Uint8Array): DeviceInfo {
  if (frame.length < 5) throw new Error(`Geräteinfo zu kurz (${frame.length} Bytes)`);
  const deviceType = frame[4];
  const [width, height] = DEVICE_TYPE_SIZES[deviceType] ?? [96, 16];
  return { deviceType, width, height, passwordFlag: frame.length >= 11 ? frame[10] : 255, raw: frame };
}

/** Also sets the device clock (same command as setTime, but answered with an info frame). */
export function getDeviceInfo(now = new Date()): SendPlan {
  return {
    ...single('device_info', [8, 0, 1, 0x80, now.getHours(), now.getMinutes(), now.getSeconds(), 0], false),
    expectsResponse: true,
  };
}

// ---------------------------------------------------------------------------
// Simple control commands

export const setPower = (on: boolean) => single('power', [5, 0, 7, 1, on ? 1 : 0]);
export const setBrightness = (level: number) => single('brightness', [5, 0, 4, 0x80, clamp(level, 0, 100)]);
/** 0 = normal, 1..3 = rotated/flipped variants. */
export const setOrientation = (o: number) => single('orientation', [5, 0, 6, 0x80, clamp(o, 0, 3)]);
/** Removes ALL stored content and settings from the panel. */
export const clearAll = () => single('clear', [4, 0, 3, 0x80]);
export const showSlot = (n: number) => single('show_slot', [7, 0, 8, 0x80, 1, 0, clamp(n, 0, 255)]);
export const deleteSlot = (n: number) => single('delete_slot', [7, 0, 2, 1, 1, 0, clamp(n, 0, 255)]);

/** Same bytes as getDeviceInfo – the panel answers with an info frame, not an ACK, so don't wait. */
export function setTime(now = new Date()): SendPlan {
  return single('set_time', [8, 0, 1, 0x80, now.getHours(), now.getMinutes(), now.getSeconds(), 0], false);
}

/** Clock face 0..8. Weekday: Monday = 1 … Sunday = 7. */
export function setClockMode(style: number, format24: boolean, showDate: boolean, now = new Date()): SendPlan {
  const dow = ((now.getDay() + 6) % 7) + 1;
  return single('clock', [
    11, 0, 6, 1,
    clamp(style, 0, 8), format24 ? 1 : 0, showDate ? 1 : 0,
    now.getFullYear() % 100, now.getMonth() + 1, now.getDate(), dow,
  ]);
}

export enum TimerAction { Stop = 0, Start = 1, Pause = 2 }

/** Stopwatch (chronograph). */
export const setStopwatch = (action: TimerAction) => single('stopwatch', [5, 0, 9, 0x80, action]);

export const setCountdown = (action: TimerAction, minutes: number, seconds: number) =>
  single('countdown', [7, 0, 0x0d, 0x80, action, clamp(minutes, 0, 255), clamp(seconds, 0, 59)]);

export const setScores = (p1: number, p2: number) =>
  single('scores', [8, 0, 0x0a, 0x80, clamp(p1, 0, 99), 0, clamp(p2, 0, 99), 0]);

/** DIY ("fun") mode – required before streaming single pixels. */
export const setFunMode = (enable: boolean) => single('fun_mode', [5, 0, 4, 1, enable ? 1 : 0]);

export const setPixel = (x: number, y: number, r: number, g: number, b: number) =>
  single('pixel', [10, 0, 5, 1, 0, r & 0xff, g & 0xff, b & 0xff, x & 0xff, y & 0xff], false);

// ---------------------------------------------------------------------------
// Music

/** Built-in rhythm animation (style 0..1, animation time 0..7). */
export const setRhythmMode = (style: number, time: number) =>
  single('rhythm', [6, 0, 0, 2, clamp(time, 0, 7), clamp(style, 0, 1)]);

/**
 * 11-bar equaliser frame (style 0..4, bar heights 1..15). Sent without waiting for an ACK
 * so it can be streamed from a microphone.
 */
export function setRhythmChart(style: number, levels: number[]): SendPlan {
  const bars = Array.from({ length: 11 }, (_, i) => clamp(levels[i] ?? 1, 1, 15));
  return single('rhythm_chart', [16, 0, 1, 2, clamp(style, 0, 4), ...bars], false);
}

// ---------------------------------------------------------------------------
// Password (6 digits, sent as three two-digit numbers)

function passwordBytes(pw: string): number[] {
  const p = pw.replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  return [Number(p.slice(0, 2)), Number(p.slice(2, 4)), Number(p.slice(4, 6))];
}

/** enable = false removes the password protection. */
export const setPassword = (enable: boolean, pw: string) =>
  single('password_set', [8, 0, 4, 2, enable ? 1 : 0, ...passwordBytes(pw)]);

export const verifyPassword = (pw: string) => single('password_verify', [7, 0, 5, 2, ...passwordBytes(pw)]);

/** Device info byte 10: 255 = no password set. */
export const needsPassword = (info: DeviceInfo) => info.passwordFlag !== 255 && info.passwordFlag !== 0;

// ---------------------------------------------------------------------------
// Windowed transfers (images, GIFs, text)

/** Splits a payload into ≤12 KB windows: [len16][type,0,option][size32][crc32][tail,slot][chunk]. */
function windowed(id: string, payload: Uint8Array, typeBytes: [number, number], tail: number, slot: number): SendPlan {
  const size = u32le(payload.length);
  const crc = u32le(crc32(payload));
  const windows: Window[] = [];
  for (let pos = 0, idx = 0; pos < payload.length; pos += WINDOW_SIZE, idx++) {
    const chunk = payload.subarray(pos, Math.min(pos + WINDOW_SIZE, payload.length));
    const header = [typeBytes[0], typeBytes[1], idx === 0 ? 0 : 2, ...size, ...crc, tail, clamp(slot, 0, 255)];
    const frameLen = header.length + chunk.length + 2;
    const msg = new Uint8Array(frameLen);
    msg.set([frameLen & 0xff, (frameLen >>> 8) & 0xff, ...header]);
    msg.set(chunk, 2 + header.length);
    windows.push({ data: msg, requiresAck: true });
  }
  return { id, windows, ackFinal: true };
}

/** PNG (static) or GIF (animated) file bytes, already scaled to the panel size. slot 0 = show only. */
export function sendImage(fileBytes: Uint8Array, isGif: boolean, slot = 0): SendPlan {
  return isGif
    ? windowed('send_gif', fileBytes, [3, 0], 2, slot)
    : windowed('send_png', fileBytes, [2, 0], 0, slot);
}

export enum TextAnimation {
  Static = 0, ScrollLeft = 1, ScrollRight = 2, ScrollUp = 3, ScrollDown = 4, Blink = 5, Fade = 6, Snowflake = 7,
}

export interface TextOptions {
  animation: TextAnimation;
  /** 0..100 */
  speed: number;
  /** 0 = off, 1..9 rainbow variants */
  rainbow: number;
  color: [number, number, number];
  background?: [number, number, number] | null;
  slot?: number;
}

/** One character cell: 1-bit glyph rows, width 8 or 16, height 16 (or 32 on tall panels). */
export interface Glyph {
  width: number;
  height: number;
  /** Row-major, true = lit. length = width * height. */
  pixels: boolean[];
  /** Per-character colour override. */
  color?: [number, number, number];
}

/**
 * Packs a glyph like the official app: rows of big-endian bytes (MSB = leftmost pixel),
 * then every byte bit-reversed – i.e. effectively LSB = leftmost pixel.
 */
export function encodeGlyphBitmap(g: Glyph): Uint8Array {
  const bytesPerRow = g.width <= 8 ? 1 : g.width <= 16 ? 2 : g.width <= 24 ? 3 : 4;
  const out = new Uint8Array(bytesPerRow * g.height);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if (g.pixels[y * g.width + x]) out[y * bytesPerRow + (x >> 3)] |= 1 << (x & 7);
    }
  }
  return out;
}

export function encodeCharacterBlock(g: Glyph, defaultColor: [number, number, number]): Uint8Array {
  const is32 = g.height >= 32 ? 1 : 0;
  const isWide = g.width > (is32 ? 16 : 8) ? 1 : 0;
  const bitmap = encodeGlyphBitmap(g);
  const out = new Uint8Array(4 + bitmap.length);
  out[0] = (is32 << 1) | isWide;
  out.set(g.color ?? defaultColor, 1);
  out.set(bitmap, 4);
  return out;
}

export function sendText(glyphs: Glyph[], opts: TextOptions): SendPlan {
  if (glyphs.length < 1 || glyphs.length > 255) throw new Error('Text muss 1–255 Zeichen haben');
  const ordered = opts.animation === TextAnimation.ScrollRight ? [...glyphs].reverse() : glyphs;
  const blocks = ordered.map((g) => encodeCharacterBlock(g, opts.color));
  const props = [
    0, 1, 1,
    opts.animation & 0xff, clamp(opts.speed, 0, 100), clamp(opts.rainbow, 0, 9),
    ...opts.color,
    ...(opts.background ? [1, ...opts.background] : [0, 0, 0, 0]),
  ];
  const total = 1 + props.length + blocks.reduce((n, b) => n + b.length, 0);
  const payload = new Uint8Array(total);
  payload[0] = glyphs.length;
  payload.set(props, 1);
  let off = 1 + props.length;
  for (const b of blocks) { payload.set(b, off); off += b.length; }
  return windowed('send_text', payload, [0, 1], 0, opts.slot ?? 0);
}

// ---------------------------------------------------------------------------
// Notifications

export type Notification =
  | { kind: 'ack'; code: number }
  | { kind: 'data'; bytes: Uint8Array };

/** ACK frames are 5 bytes starting with 0x05; code 0/1 = window ok, 3 = transfer complete. */
export function classifyNotification(bytes: Uint8Array): Notification {
  if (bytes.length === 5 && bytes[0] === 0x05) return { kind: 'ack', code: bytes[4] };
  return { kind: 'data', bytes };
}

export const hex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
