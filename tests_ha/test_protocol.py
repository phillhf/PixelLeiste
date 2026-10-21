"""Python protocol + glyph rendering must produce exactly the bytes of the reference (tests/fixtures.json)."""

import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
PKG = ROOT / "custom_components" / "pixelleiste"


def _load(name: str):
    # Load the pure modules without importing the integration package (no Home Assistant needed).
    spec = importlib.util.spec_from_file_location(f"pixelleiste_{name}", PKG / f"{name}.py",
                                                  submodule_search_locations=[str(PKG)])
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


P = _load("protocol")
sys.modules["pixelleiste_protocol"] = P
# render.py imports ".protocol" – provide it under a package-like name
import types  # noqa: E402

pkg = types.ModuleType("pixelleiste_pkg")
pkg.__path__ = [str(PKG)]
sys.modules["pixelleiste_pkg"] = pkg
sys.modules["pixelleiste_pkg.protocol"] = P
_spec = importlib.util.spec_from_file_location("pixelleiste_pkg.render", PKG / "render.py")
R = importlib.util.module_from_spec(_spec)
sys.modules["pixelleiste_pkg.render"] = R
_spec.loader.exec_module(R)

FIX = json.loads((ROOT / "tests" / "fixtures.json").read_text(encoding="utf-8"))
FIXED = datetime(2026, 10, 21, 16, 45, 7)


def hexes(plan):
    return [w.data.hex() for w in plan.windows]


@pytest.mark.parametrize("name,plan", [
    ("brightness_42", P.set_brightness(42)),
    ("power_on", P.set_power(True)),
    ("power_off", P.set_power(False)),
    ("orientation_2", P.set_orientation(2)),
    ("clear", P.clear_all()),
    ("delete_3", P.delete_slot(3)),
    ("show_5", P.show_slot(5)),
    ("time", P.set_time(FIXED)),
    ("clock_3_24_date", P.set_clock_mode(3, True, True, FIXED)),
    ("timer_start", P.set_stopwatch(P.TimerAction.START)),
    ("scores_7_12", P.set_scores(7, 12)),
    ("fun_on", P.set_fun_mode(True)),
    ("pixel", P.set_pixel(5, 9, 0xFF, 0x80, 0x00)),
    ("rhythm_chart", P.set_rhythm_chart(3, [1, 4, 8, 12, 15, 10, 6, 3, 8, 12, 14])),
    ("rhythm_mode", P.set_rhythm_mode(1, 5)),
])
def test_commands(name, plan):
    assert hexes(plan) == FIX["commands"][name]


def test_password():
    assert hexes(P.set_password(True, "123456")) == ["08000402010c2238"]
    assert hexes(P.verify_password("012345")) == ["0700050201172d"]


@pytest.mark.parametrize("name", list(FIX["images"]))
def test_images(name):
    f = FIX["images"][name]
    assert hexes(P.send_image(bytes.fromhex(f["payload"]), f["gif"], f["slot"])) == f["windows"]


@pytest.mark.parametrize("char", list(FIX["glyphs"]))
def test_glyph_rendering(char):
    g = R.render_glyph(char, 16)
    rows = ["".join("#" if g.pixels[y * g.width + x] else "." for x in range(g.width)) for y in range(16)]
    assert (g.width, rows) == (FIX["glyphs"][char]["width"], FIX["glyphs"][char]["rows"])


@pytest.mark.parametrize("name", list(FIX["texts"]))
def test_text(name):
    f = FIX["texts"][name]
    plan = P.send_text(
        R.render_text(f["text"]), P.TextAnimation(f["animation"]), f["speed"], f["rainbow"],
        R.hex_to_rgb(f["color"]), R.hex_to_rgb(f["bg"]) if f["bg"] else None, f["slot"],
    )
    assert hexes(plan) == f["windows"]


def test_device_info():
    info = P.parse_device_info(bytes([11, 0, 1, 0x80, 132, 1, 0, 1, 0, 0, 255]))
    assert (info.width, info.height, info.needs_password) == (96, 16, False)


def test_prepare_image_png_and_gif():
    from PIL import Image
    import io

    buf = io.BytesIO()
    Image.new("RGB", (300, 100), (255, 0, 0)).save(buf, format="PNG")
    data, gif = R.prepare_image(buf.getvalue(), 96, 16)
    assert not gif and Image.open(io.BytesIO(data)).size == (96, 16)

    buf = io.BytesIO()
    frames = [Image.new("RGB", (64, 64), c) for c in [(255, 0, 0), (0, 255, 0), (0, 0, 255)]]
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
    data, gif = R.prepare_image(buf.getvalue(), 96, 16, "fit")
    img = Image.open(io.BytesIO(data))
    assert gif and img.size == (96, 16) and img.n_frames == 3
