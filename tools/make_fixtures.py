"""Generates tests/fixtures.json from the reference implementation (pypixelcolor).

Usage:  python -I tools/make_fixtures.py <path-to-pypixelcolor/src> tests/fixtures.json
Needs:  pip install pillow bleak
"""
import json
import sys
from datetime import datetime
from unittest import mock

sys.path.insert(0, sys.argv[1])

from pypixelcolor.commands import set_brightness, set_power, set_orientation, clear, delete, show_slot  # noqa: E402
from pypixelcolor.commands import set_time, set_clock_mode, set_timer, set_scores, set_fun_mode  # noqa: E402
from pypixelcolor.commands.send_image import _build_send_plan  # noqa: E402
from pypixelcolor.commands.send_text import send_text  # noqa: E402
from pypixelcolor.commands.send_text import image_processing as ip  # noqa: E402
from pypixelcolor.lib.device_info import DeviceInfo  # noqa: E402
from pypixelcolor.lib.font_config import FontConfig  # noqa: E402
from pypixelcolor.commands.send_text.models import RenderContext  # noqa: E402


def windows(plan):
    return [w.data.hex() for w in plan.windows]


FIXED = datetime(2026, 10, 21, 16, 45, 7)  # Wednesday


class FixedDT(datetime):
    @classmethod
    def now(cls, tz=None):
        return FIXED


out = {"commands": {}, "images": {}, "glyphs": {}, "texts": {}}
c = out["commands"]
c["brightness_42"] = windows(set_brightness.set_brightness(42))
c["power_on"] = windows(set_power.set_power(True))
c["power_off"] = windows(set_power.set_power(False))
c["orientation_2"] = windows(set_orientation.set_orientation(2))
c["clear"] = windows(clear.clear())
c["delete_3"] = windows(delete.delete(3))
c["show_5"] = windows(show_slot.show_slot(5))
c["time"] = windows(set_time.set_time(16, 45, 7))
with mock.patch.object(set_clock_mode, "datetime", FixedDT):
    c["clock_3_24_date"] = windows(set_clock_mode.set_clock_mode(3, "", True, True))
c["timer_start"] = windows(set_timer.set_timer(1))
c["scores_7_12"] = windows(set_scores.set_scores(7, 12))
c["fun_on"] = windows(set_fun_mode.set_fun_mode(True))
c["pixel"] = windows(set_fun_mode.set_pixel(5, 9, "ff8000"))

# Image transfers: arbitrary payloads, including a multi-window one (> 12 KB)
small = bytes((i * 7 + 3) & 0xFF for i in range(300))
big = bytes((i * 13 + 1) & 0xFF for i in range(30000))
out["images"]["png_small_slot0"] = {"payload": small.hex(), "gif": False, "slot": 0, "windows": windows(_build_send_plan(small, False, save_slot=0))}
out["images"]["gif_big_slot4"] = {"payload": big.hex(), "gif": True, "slot": 4, "windows": windows(_build_send_plan(big, True, save_slot=4))}

# Glyph bitmaps as rendered by PIL + Unifont, plus their encoded bytes
font = FontConfig.builtin("UNIFONT")
ctx = RenderContext(char_height=16, font_path=font.path, font_size=16, font_offset=(0, 0), pixel_threshold=128)
for ch in "Hi Ü€g漢":
    data, width = ip.char_to_hex(ch, ctx)
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("L", (width, 16), 0)
    ImageDraw.Draw(img).text((0, 0), ch, fill=255, font=ImageFont.truetype(font.path, 16))
    img = ip.apply_pixel_threshold(img, 128)
    rows = ["".join("#" if img.getpixel((x, y)) > 0 else "." for x in range(width)) for y in range(16)]
    out["glyphs"][ch] = {"width": width, "rows": rows}

info = DeviceInfo(device_type=132, mcu_version="", wifi_version="", width=96, height=16, has_wifi=False, password_flag=255, led_type=1)
out["texts"]["hello_scroll"] = {
    "text": "Hi Ü€g漢", "animation": 1, "speed": 60, "rainbow": 0, "color": "ff2000", "bg": None, "slot": 0,
    "windows": windows(send_text("Hi Ü€g漢", animation=1, speed=60, color="ff2000", device_info=info)),
}
out["texts"]["right_bg_rainbow_slot2"] = {
    "text": "Hi Ü€g漢", "animation": 2, "speed": 30, "rainbow": 3, "color": "00ff00", "bg": "000040", "slot": 2,
    "windows": windows(send_text("Hi Ü€g漢", animation=2, speed=30, rainbow_mode=3, color="00ff00", bg_color="000040", save_slot=2, device_info=info)),
}

with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
print("ok", sys.argv[2])
