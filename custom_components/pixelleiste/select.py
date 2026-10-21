"""Selects: text effect, text colour, clock style, and 'show slot'."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import PixelConfigEntry
from . import protocol as P
from .const import CLOCK_STYLES, COLORS, EFFECTS, SLOTS
from .entity import PixelEntity


async def async_setup_entry(hass: HomeAssistant, entry: PixelConfigEntry, add: AddEntitiesCallback) -> None:
    add([
        SettingSelect(entry, "effect", list(EFFECTS)),
        SettingSelect(entry, "color", list(COLORS)),
        SettingSelect(entry, "clock_style", CLOCK_STYLES),
        ShowSlotSelect(entry),
    ])


class SettingSelect(PixelEntity, SelectEntity, RestoreEntity):
    """Stores a setting used by the text entity / clock button."""

    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, entry: PixelConfigEntry, key: str, options: list[str]) -> None:
        super().__init__(entry, key)
        self._key = key
        self._attr_options = options
        self._attr_current_option = getattr(self.data.settings, key)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None and last.state in self._attr_options:
            await self.async_select_option(last.state)

    async def async_select_option(self, option: str) -> None:
        setattr(self.data.settings, self._key, option)
        self._attr_current_option = option
        self.async_write_ha_state()


class ShowSlotSelect(PixelEntity, SelectEntity):
    """Choosing a slot shows its stored content on the panel."""

    _attr_options = SLOTS

    def __init__(self, entry: PixelConfigEntry) -> None:
        super().__init__(entry, "show_slot")
        self._attr_current_option = None

    async def async_select_option(self, option: str) -> None:
        await self.client.async_send(P.show_slot(int(option)))
        self._attr_current_option = option
        self.async_write_ha_state()
