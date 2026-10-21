"""Panel power and brightness as a light."""

from __future__ import annotations

from typing import Any

from homeassistant.components.light import ATTR_BRIGHTNESS, ColorMode, LightEntity
from homeassistant.const import STATE_ON
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import PixelConfigEntry
from . import protocol as P
from .entity import PixelEntity


async def async_setup_entry(hass: HomeAssistant, entry: PixelConfigEntry, add: AddEntitiesCallback) -> None:
    add([PixelLight(entry)])


class PixelLight(PixelEntity, LightEntity, RestoreEntity):
    """The panel can't report its state, so we remember the last command (assumed state)."""

    _attr_name = None
    _attr_assumed_state = True
    _attr_color_mode = ColorMode.BRIGHTNESS
    _attr_supported_color_modes = {ColorMode.BRIGHTNESS}

    def __init__(self, entry: PixelConfigEntry) -> None:
        super().__init__(entry, "panel")
        self._attr_is_on = True
        self._attr_brightness = 204

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None:
            self._attr_is_on = last.state == STATE_ON
            self._attr_brightness = last.attributes.get(ATTR_BRIGHTNESS) or self._attr_brightness

    async def async_turn_on(self, **kwargs: Any) -> None:
        if not self._attr_is_on:
            await self.client.async_send(P.set_power(True))
            self._attr_is_on = True
        if ATTR_BRIGHTNESS in kwargs:
            level = max(1, round(kwargs[ATTR_BRIGHTNESS] / 255 * 100))
            await self.client.async_send(P.set_brightness(level))
            self._attr_brightness = kwargs[ATTR_BRIGHTNESS]
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.client.async_send(P.set_power(False))
        self._attr_is_on = False
        self.async_write_ha_state()
