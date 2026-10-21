"""Text speed setting."""

from __future__ import annotations

from homeassistant.components.number import NumberMode, RestoreNumber
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import PixelConfigEntry
from .entity import PixelEntity


async def async_setup_entry(hass: HomeAssistant, entry: PixelConfigEntry, add: AddEntitiesCallback) -> None:
    add([SpeedNumber(entry)])


class SpeedNumber(PixelEntity, RestoreNumber):
    _attr_entity_category = EntityCategory.CONFIG
    _attr_native_min_value = 0
    _attr_native_max_value = 100
    _attr_native_step = 1
    _attr_mode = NumberMode.SLIDER

    def __init__(self, entry: PixelConfigEntry) -> None:
        super().__init__(entry, "speed")
        self._attr_native_value = self.data.settings.speed

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_number_data()) is not None and last.native_value is not None:
            await self.async_set_native_value(last.native_value)

    async def async_set_native_value(self, value: float) -> None:
        self.data.settings.speed = int(value)
        self._attr_native_value = int(value)
        self.async_write_ha_state()
