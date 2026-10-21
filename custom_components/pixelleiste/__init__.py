"""PixelLeiste – iPixel Color LED panels (e.g. 96x16 TR5645H135-08H) via Bluetooth LE."""

from __future__ import annotations

from dataclasses import dataclass, field

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_ADDRESS, CONF_NAME, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import CONF_IDLE_SECONDS, CONF_PASSWORD, DEFAULT_IDLE_SECONDS, DOMAIN
from .panel import PanelClient
from .services import async_setup_services

PLATFORMS = [Platform.BUTTON, Platform.LIGHT, Platform.NUMBER, Platform.SELECT, Platform.TEXT]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


@dataclass
class TextSettings:
    """Shared by the text, select and number entities."""

    effect: str = "scroll_left"
    color: str = "white"
    speed: int = 60
    clock_style: str = "1"
    listeners: list = field(default_factory=list)


@dataclass
class PixelData:
    client: PanelClient
    settings: TextSettings


type PixelConfigEntry = ConfigEntry[PixelData]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    async_setup_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: PixelConfigEntry) -> bool:
    client = PanelClient(
        hass,
        entry.data[CONF_ADDRESS],
        entry.data.get(CONF_NAME) or entry.title,
        entry.options.get(CONF_PASSWORD) or None,
        int(entry.options.get(CONF_IDLE_SECONDS, DEFAULT_IDLE_SECONDS)),
    )
    entry.runtime_data = PixelData(client, TextSettings())
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: PixelConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: PixelConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        await entry.runtime_data.client.async_shutdown()
    return ok
