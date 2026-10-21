"""iPixel Color BLE protocol (LED_BLE_* panels) – Python port of src/protocol/ipixel.ts.

Pure functions without Home Assistant imports, tested against the same reference
fixtures as the app (tests/fixtures.json, generated from pypixelcolor).
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass, field
from datetime import datetime
from enum import IntEnum

SERVICE_UUID = "000000fa-0000-1000-8000-00805f9b34fb"
WRITE_UUID = "0000fa02-0000-1000-8000-00805f9b34fb"
NOTIFY_UUID = "0000fa03-0000-1000-8000-00805f9b34fb"

CHUNK_SIZE = 244
WINDOW_SIZE = 12 * 1024


@dataclass
class Window:
    data: bytes
    requires_ack: bool = True


@dataclass
class SendPlan:
    id: str
    windows: list[Window]
    ack_final: bool = False
    expects_response: bool = False


def _clamp(v: float, lo: int, hi: int) -> int:
    return max(lo, min(hi, round(v)))


def _single(plan_id: str, data: list[int], requires_ack: bool = True) -> SendPlan:
    return SendPlan(plan_id, [Window(bytes(b & 0xFF for b in data), requires_ack)])


# --- device info -----------------------------------------------------------------

DEVICE_TYPE_SIZES: dict[int, tuple[int, int]] = {
    128: (64, 64), 129: (32, 32), 130: (32, 16), 131: (64, 16), 132: (96, 16),
    133: (64, 20), 134: (128, 32), 135: (144, 16), 136: (192, 16), 137: (48, 24),
    138: (64, 32), 139: (96, 32), 140: (128, 32), 141: (96, 32), 142: (160, 32),
    143: (192, 32), 144: (256, 32), 145: (320, 32), 146: (384, 32), 147: (448, 32),
}


@dataclass
class DeviceInfo:
    device_type: int = 132
    width: int = 96
    height: int = 16
    password_flag: int = 255
    raw: bytes = field(default=b"", repr=False)

    @property
    def needs_password(self) -> bool:
        return self.password_flag not in (0, 255)


def parse_device_info(frame: bytes) -> DeviceInfo:
    if len(frame) < 5:
        raise ValueError(f"device info too short ({len(frame)} bytes)")
    width, height = DEVICE_TYPE_SIZES.get(frame[4], (96, 16))
    return DeviceInfo(frame[4], width, height, frame[10] if len(frame) >= 11 else 255, bytes(frame))


def get_device_info(now: datetime | None = None) -> SendPlan:
    now = now or datetime.now()
    plan = _single("device_info", [8, 0, 1, 0x80, now.hour, now.minute, now.second, 0], False)
    plan.expects_response = True
    return plan


# --- simple commands ---------------------------------------------------------------

def set_power(on: bool) -> SendPlan:
    return _single("power", [5, 0, 7, 1, 1 if on else 0])


def set_brightness(level: int) -> SendPlan:
    return _single("brightness", [5, 0, 4, 0x80, _clamp(level, 0, 100)])


def set_orientation(orientation: int) -> SendPlan:
    return _single("orientation", [5, 0, 6, 0x80, _clamp(orientation, 0, 3)])


def clear_all() -> SendPlan:
    return _single("clear", [4, 0, 3, 0x80])


def show_slot(n: int) -> SendPlan:
    return _single("show_slot", [7, 0, 8, 0x80, 1, 0, _clamp(n, 0, 255)])


def delete_slot(n: int) -> SendPlan:
    return _single("delete_slot", [7, 0, 2, 1, 1, 0, _clamp(n, 0, 255)])


def set_time(now: datetime | None = None) -> SendPlan:
    """Same bytes as get_device_info – the panel answers with an info frame, not an ACK."""
    now = now or datetime.now()
    return _single("set_time", [8, 0, 1, 0x80, now.hour, now.minute, now.second, 0], False)


def set_clock_mode(style: int, format_24: bool, show_date: bool, now: datetime | None = None) -> SendPlan:
    now = now or datetime.now()
    return _single("clock", [
        11, 0, 6, 1, _clamp(style, 0, 8), 1 if format_24 else 0, 1 if show_date else 0,
        now.year % 100, now.month, now.day, now.isoweekday(),
    ])


class TimerAction(IntEnum):
    STOP = 0
    START = 1
    PAUSE = 2


def set_stopwatch(action: TimerAction) -> SendPlan:
    return _single("stopwatch", [5, 0, 9, 0x80, int(action)])


def set_countdown(action: TimerAction, minutes: int, seconds: int) -> SendPlan:
    return _single("countdown", [7, 0, 0x0D, 0x80, int(action), _clamp(minutes, 0, 255), _clamp(seconds, 0, 59)])


def set_scores(p1: int, p2: int) -> SendPlan:
    return _single("scores", [8, 0, 0x0A, 0x80, _clamp(p1, 0, 99), 0, _clamp(p2, 0, 99), 0])


def set_fun_mode(enable: bool) -> SendPlan:
    return _single("fun_mode", [5, 0, 4, 1, 1 if enable else 0])


def set_pixel(x: int, y: int, r: int, g: int, b: int) -> SendPlan:
    return _single("pixel", [10, 0, 5, 1, 0, r, g, b, x, y], False)


def set_rhythm_mode(style: int, time: int) -> SendPlan:
    return _single("rhythm", [6, 0, 0, 2, _clamp(time, 0, 7), _clamp(style, 0, 1)])


def set_rhythm_chart(style: int, levels: list[int]) -> SendPlan:
    bars = [_clamp(levels[i] if i < len(levels) else 1, 1, 15) for i in range(11)]
    return _single("rhythm_chart", [16, 0, 1, 2, _clamp(style, 0, 4), *bars], False)


def _password_bytes(pw: str) -> list[int]:
    p = "".join(c for c in pw if c.isdigit())[:6].rjust(6, "0")
    return [int(p[0:2]), int(p[2:4]), int(p[4:6])]


def set_password(enable: bool, pw: str) -> SendPlan:
    return _single("password_set", [8, 0, 4, 2, 1 if enable else 0, *_password_bytes(pw)])


def verify_password(pw: str) -> SendPlan:
    return _single("password_verify", [7, 0, 5, 2, *_password_bytes(pw)])


# --- windowed transfers --------------------------------------------------------------

def _windowed(plan_id: str, payload: bytes, type_bytes: tuple[int, int], tail: int, slot: int) -> SendPlan:
    size = len(payload).to_bytes(4, "little")
    crc = (zlib.crc32(payload) & 0xFFFFFFFF).to_bytes(4, "little")
    windows: list[Window] = []
    for idx, pos in enumerate(range(0, len(payload), WINDOW_SIZE)):
        chunk = payload[pos:pos + WINDOW_SIZE]
        header = bytes([type_bytes[0], type_bytes[1], 0 if idx == 0 else 2]) + size + crc + bytes([tail, _clamp(slot, 0, 255)])
        frame_len = len(header) + len(chunk) + 2
        windows.append(Window(frame_len.to_bytes(2, "little") + header + chunk))
    return SendPlan(plan_id, windows, ack_final=True)


def send_image(file_bytes: bytes, is_gif: bool, slot: int = 0) -> SendPlan:
    """PNG or GIF bytes already scaled to the panel size. slot 0 = show only."""
    if is_gif:
        return _windowed("send_gif", file_bytes, (3, 0), 2, slot)
    return _windowed("send_png", file_bytes, (2, 0), 0, slot)


class TextAnimation(IntEnum):
    STATIC = 0
    SCROLL_LEFT = 1
    SCROLL_RIGHT = 2
    SCROLL_UP = 3
    SCROLL_DOWN = 4
    BLINK = 5
    FADE = 6
    SNOWFLAKE = 7


@dataclass
class Glyph:
    width: int
    height: int
    pixels: list[bool]
    color: tuple[int, int, int] | None = None


def encode_glyph_bitmap(g: Glyph) -> bytes:
    """Rows of bytes, LSB = leftmost pixel (the app's MSB-first rows with every byte bit-reversed)."""
    bpr = 1 if g.width <= 8 else 2 if g.width <= 16 else 3 if g.width <= 24 else 4
    out = bytearray(bpr * g.height)
    for y in range(g.height):
        for x in range(g.width):
            if g.pixels[y * g.width + x]:
                out[y * bpr + (x >> 3)] |= 1 << (x & 7)
    return bytes(out)


def encode_character_block(g: Glyph, default_color: tuple[int, int, int]) -> bytes:
    is32 = 1 if g.height >= 32 else 0
    is_wide = 1 if g.width > (16 if is32 else 8) else 0
    return bytes([(is32 << 1) | is_wide, *(g.color or default_color)]) + encode_glyph_bitmap(g)


def send_text(
    glyphs: list[Glyph],
    animation: TextAnimation = TextAnimation.SCROLL_LEFT,
    speed: int = 60,
    rainbow: int = 0,
    color: tuple[int, int, int] = (255, 255, 255),
    background: tuple[int, int, int] | None = None,
    slot: int = 0,
) -> SendPlan:
    if not 1 <= len(glyphs) <= 255:
        raise ValueError("text must have 1–255 characters")
    ordered = list(reversed(glyphs)) if animation == TextAnimation.SCROLL_RIGHT else glyphs
    props = [0, 1, 1, int(animation) & 0xFF, _clamp(speed, 0, 100), _clamp(rainbow, 0, 9), *color]
    props += [1, *background] if background else [0, 0, 0, 0]
    payload = bytes([len(glyphs), *props]) + b"".join(encode_character_block(g, color) for g in ordered)
    return _windowed("send_text", payload, (0, 1), 0, slot)


def classify_notification(data: bytes) -> tuple[str, int | bytes]:
    """('ack', code) for 5-byte ACK frames (0/1 = window ok, 3 = done), else ('data', bytes)."""
    if len(data) == 5 and data[0] == 0x05:
        return "ack", data[4]
    return "data", bytes(data)
