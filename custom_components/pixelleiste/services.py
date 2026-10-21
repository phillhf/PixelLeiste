"""Actions (services) for automations: text, images, clock, slots, timers, scoreboard, rhythm."""

from __future__ import annotations

from pathlib import Path

import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv, device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from . import protocol as P
from .const import (
    DOMAIN, EFFECTS, SERVICE_COUNTDOWN, SERVICE_DELETE_SLOT, SERVICE_ORIENTATION, SERVICE_RHYTHM,
    SERVICE_SCOREBOARD, SERVICE_SEND_IMAGE, SERVICE_SEND_TEXT, SERVICE_SHOW_CLOCK, SERVICE_SHOW_SLOT,
    SERVICE_STOPWATCH,
)
from .render import hex_to_rgb, prepare_image, render_text

ATTR_DEVICE = "device_id"
SLOT = vol.All(vol.Coerce(int), vol.Range(0, 10))
TIMER_ACTIONS = {"start": P.TimerAction.START, "pause": P.TimerAction.PAUSE, "stop": P.TimerAction.STOP}


def _color(value) -> str:
    """Accepts '#ff0000', 'ff0000' or an RGB list from the colour picker selector."""
    if isinstance(value, (list, tuple)) and len(value) == 3:
        return "".join(f"{int(c):02x}" for c in value)
    v = str(value).lstrip("#")
    if len(v) != 6:
        raise vol.Invalid("colour must be #rrggbb")
    int(v, 16)
    return v


BASE = {vol.Required(ATTR_DEVICE): vol.All(cv.ensure_list, [cv.string])}

SCHEMAS = {
    SERVICE_SEND_TEXT: vol.Schema({
        **BASE,
        vol.Required("text"): vol.All(cv.string, vol.Length(min=1, max=255)),
        vol.Optional("effect", default="scroll_left"): vol.In(list(EFFECTS)),
        vol.Optional("color", default="ffffff"): _color,
        vol.Optional("background"): _color,
        vol.Optional("speed", default=60): vol.All(vol.Coerce(int), vol.Range(0, 100)),
        vol.Optional("rainbow", default=0): vol.All(vol.Coerce(int), vol.Range(0, 9)),
        vol.Optional("slot", default=0): SLOT,
    }),
    SERVICE_SEND_IMAGE: vol.Schema({
        **BASE,
        vol.Exclusive("path", "source"): cv.string,
        vol.Exclusive("url", "source"): cv.url,
        vol.Optional("fit", default="crop"): vol.In(["crop", "fit", "stretch"]),
        vol.Optional("slot", default=0): SLOT,
    }),
    SERVICE_SHOW_CLOCK: vol.Schema({
        **BASE,
        vol.Optional("style", default=1): vol.All(vol.Coerce(int), vol.Range(1, 9)),
        vol.Optional("format_24", default=True): cv.boolean,
        vol.Optional("show_date", default=True): cv.boolean,
    }),
    SERVICE_SHOW_SLOT: vol.Schema({**BASE, vol.Required("slot"): vol.All(vol.Coerce(int), vol.Range(1, 10))}),
    SERVICE_DELETE_SLOT: vol.Schema({**BASE, vol.Required("slot"): vol.All(vol.Coerce(int), vol.Range(1, 10))}),
    SERVICE_SCOREBOARD: vol.Schema({
        **BASE,
        vol.Required("left"): vol.All(vol.Coerce(int), vol.Range(0, 99)),
        vol.Required("right"): vol.All(vol.Coerce(int), vol.Range(0, 99)),
    }),
    SERVICE_COUNTDOWN: vol.Schema({
        **BASE,
        vol.Optional("action", default="start"): vol.In(list(TIMER_ACTIONS)),
        vol.Optional("minutes", default=5): vol.All(vol.Coerce(int), vol.Range(0, 255)),
        vol.Optional("seconds", default=0): vol.All(vol.Coerce(int), vol.Range(0, 59)),
    }),
    SERVICE_STOPWATCH: vol.Schema({**BASE, vol.Optional("action", default="start"): vol.In(list(TIMER_ACTIONS))}),
    SERVICE_RHYTHM: vol.Schema({
        **BASE,
        vol.Optional("style", default=1): vol.All(vol.Coerce(int), vol.Range(1, 2)),
        vol.Optional("intensity", default=3): vol.All(vol.Coerce(int), vol.Range(0, 7)),
    }),
    SERVICE_ORIENTATION: vol.Schema({**BASE, vol.Required("orientation"): vol.All(vol.Coerce(int), vol.Range(0, 3))}),
}


def _clients(hass: HomeAssistant, call: ServiceCall):
    registry = dr.async_get(hass)
    clients = []
    for device_id in call.data[ATTR_DEVICE]:
        device = registry.async_get(device_id)
        entry = next((ce for e in (device.config_entries if device else [])
                      if (ce := hass.config_entries.async_get_entry(e)) and ce.domain == DOMAIN), None)
        if entry is None or entry.state is not ConfigEntryState.LOADED:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="unknown_device")
        clients.append(entry.runtime_data.client)
    return clients


async def _load_image(hass: HomeAssistant, call: ServiceCall) -> bytes:
    if path := call.data.get("path"):
        if not hass.config.is_allowed_path(path):
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="path_not_allowed", translation_placeholders={"path": path})
        return await hass.async_add_executor_job(Path(path).read_bytes)
    if url := call.data.get("url"):
        async with async_get_clientsession(hass).get(url) as resp:
            resp.raise_for_status()
            return await resp.read()
    raise ServiceValidationError(translation_domain=DOMAIN, translation_key="no_image")


@callback
def async_setup_services(hass: HomeAssistant) -> None:
    async def send_text(call: ServiceCall) -> None:
        d = call.data
        for client in _clients(hass, call):
            height = client.info.height if client.info else 16
            glyphs = await hass.async_add_executor_job(render_text, d["text"], height)
            await client.async_send(P.send_text(
                glyphs, P.TextAnimation(EFFECTS[d["effect"]]), d["speed"], d["rainbow"],
                hex_to_rgb(d["color"]), hex_to_rgb(d["background"]) if d.get("background") else None, d["slot"],
            ))

    async def send_image(call: ServiceCall) -> None:
        raw = await _load_image(hass, call)
        for client in _clients(hass, call):
            info = client.info or P.DeviceInfo()
            data, gif = await hass.async_add_executor_job(prepare_image, raw, info.width, info.height, call.data["fit"])
            await client.async_send(P.send_image(data, gif, call.data["slot"]))

    async def show_clock(call: ServiceCall) -> None:
        now = dt_util.now()
        for client in _clients(hass, call):
            await client.async_send(P.set_time(now))
            await client.async_send(P.set_clock_mode(call.data["style"] - 1, call.data["format_24"], call.data["show_date"], now))

    def simple(build):
        async def handler(call: ServiceCall) -> None:
            for client in _clients(hass, call):
                await client.async_send(build(call.data))
        return handler

    handlers = {
        SERVICE_SEND_TEXT: send_text,
        SERVICE_SEND_IMAGE: send_image,
        SERVICE_SHOW_CLOCK: show_clock,
        SERVICE_SHOW_SLOT: simple(lambda d: P.show_slot(d["slot"])),
        SERVICE_DELETE_SLOT: simple(lambda d: P.delete_slot(d["slot"])),
        SERVICE_SCOREBOARD: simple(lambda d: P.set_scores(d["left"], d["right"])),
        SERVICE_COUNTDOWN: simple(lambda d: P.set_countdown(TIMER_ACTIONS[d["action"]], d["minutes"], d["seconds"])),
        SERVICE_STOPWATCH: simple(lambda d: P.set_stopwatch(TIMER_ACTIONS[d["action"]])),
        SERVICE_RHYTHM: simple(lambda d: P.set_rhythm_mode(d["style"] - 1, d["intensity"])),
        SERVICE_ORIENTATION: simple(lambda d: P.set_orientation(d["orientation"])),
    }
    for name, handler in handlers.items():
        hass.services.async_register(DOMAIN, name, handler, schema=SCHEMAS[name])
