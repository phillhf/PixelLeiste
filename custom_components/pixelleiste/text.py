"""Text entity: typing a text sends it with the effect/colour/speed chosen in the other entities."""

from __future__ import annotations

from homeassistant.components.text import TextEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import PixelConfigEntry, TextSettings
from . import protocol as P
from .const import COLORS, EFFECTS
from .entity import PixelEntity
from .render import hex_to_rgb, render_text


async def async_setup_entry(hass: HomeAssistant, entry: PixelConfigEntry, add: AddEntitiesCallback) -> None:
    add([PixelText(entry)])


def build_text_plan(text: str, s: TextSettings, info: P.DeviceInfo, slot: int = 0) -> P.SendPlan:
    rainbow = s.color == "rainbow"
    return P.send_text(
        render_text(text, info.height),
        P.TextAnimation(EFFECTS[s.effect]), s.speed, 1 if rainbow else 0,
        hex_to_rgb(COLORS[s.color]), None, slot,
    )


class PixelText(PixelEntity, TextEntity, RestoreEntity):
    _attr_native_max = 255

    def __init__(self, entry: PixelConfigEntry) -> None:
        super().__init__(entry, "text")
        self._attr_native_value = ""

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None and last.state not in ("unknown", "unavailable"):
            self._attr_native_value = last.state

    async def async_set_value(self, value: str) -> None:
        if value.strip():
            settings = self.data.settings
            await self.hass.async_add_executor_job(render_text, value)  # warm the font cache off the loop
            await self.client.async_send(lambda info: build_text_plan(value, settings, info))
        self._attr_native_value = value
        self.async_write_ha_state()
