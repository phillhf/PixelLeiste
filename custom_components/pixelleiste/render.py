"""Rendering for the panel: pixel-font glyphs (GNU Unifont, identical to the app) and images/GIFs."""

from __future__ import annotations

import io
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageSequence

from .protocol import Glyph

FONT_PATH = Path(__file__).parent / "fonts" / "unifont.otf"
MAX_FRAMES = 120

_COLOR_TAG = re.compile(r"\[#?([0-9a-fA-F]{6})\]|\[/(?:color|#)?\]")


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.lstrip("#")
    return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)


def parse_color_tags(text: str) -> list[tuple[str, tuple[int, int, int] | None]]:
    """'[#ff0000]rot[/] normal' → [(char, colour or None), …]"""
    out: list[tuple[str, tuple[int, int, int] | None]] = []
    stack: list[tuple[int, int, int]] = []
    last = 0
    for m in _COLOR_TAG.finditer(text):
        out += [(c, stack[-1] if stack else None) for c in text[last:m.start()]]
        if m.group(1):
            stack.append(hex_to_rgb(m.group(1)))
        elif stack:
            stack.pop()
        last = m.end()
    out += [(c, stack[-1] if stack else None) for c in text[last:]]
    return out


@lru_cache(maxsize=4)
def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size)


def render_glyph(char: str, height: int = 16) -> Glyph:
    """8 px (normal) or 16 px (wide) cell, 16 px high – the same as the official app."""
    size = 32 if height >= 32 else 16
    half = size // 2
    font = _font(size)
    probe = ImageDraw.Draw(Image.new("L", (size * 2, height)))
    left, _, right, _ = probe.textbbox((0, 0), char, font=font)
    wide = unicodedata.east_asian_width(char) in ("W", "F") or (right - left) > half * 1.25
    width = size if wide else half
    img = Image.new("L", (width, height), 0)
    ImageDraw.Draw(img).text((0, 0), char, fill=255, font=font)
    data = img.tobytes()
    return Glyph(width, height, [v > 128 for v in data])


def render_text(text: str, height: int = 16) -> list[Glyph]:
    glyphs = []
    for char, color in parse_color_tags(text or " "):
        g = render_glyph(char, height)
        g.color = color
        glyphs.append(g)
    return glyphs


def _fit(img: Image.Image, w: int, h: int, mode: str) -> Image.Image:
    rgba = img.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
    src = Image.alpha_composite(bg, rgba).convert("RGB")
    if mode == "stretch":
        return src.resize((w, h), Image.Resampling.LANCZOS)
    scale = max(w / src.width, h / src.height) if mode == "crop" else min(w / src.width, h / src.height)
    nw, nh = max(1, round(src.width * scale)), max(1, round(src.height * scale))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGB", (w, h), (0, 0, 0))
    out.paste(resized, ((w - nw) // 2, (h - nh) // 2))
    return out


def prepare_image(data: bytes, width: int, height: int, fit: str = "crop") -> tuple[bytes, bool]:
    """Any image/GIF → PNG (static) or GIF (animated) bytes at panel size. Returns (bytes, is_gif)."""
    img = Image.open(io.BytesIO(data))
    frames = [f.copy() for f in ImageSequence.Iterator(img)][:MAX_FRAMES]
    out = io.BytesIO()
    if len(frames) > 1:
        scaled = [_fit(f, width, height, fit) for f in frames]
        durations = [max(20, int(f.info.get("duration", img.info.get("duration", 100)) or 100)) for f in frames]
        palette = [f.convert("P", palette=Image.Palette.ADAPTIVE, colors=256) for f in scaled]
        palette[0].save(out, format="GIF", save_all=True, append_images=palette[1:], duration=durations, loop=0, disposal=2, optimize=False)
        return out.getvalue(), True
    _fit(frames[0], width, height, fit).save(out, format="PNG")
    return out.getvalue(), False
