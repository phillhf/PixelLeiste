"""Buttons: show clock, sync time."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from . import PixelConfigEntry
from . import protocol as P
from .entity import PixelEntity


async def async_setup_entry(hass: HomeAssistant, entry: PixelConfigEntry, add: AddEntitiesCallback) -> None:
    add([ClockButton(entry), SyncTimeButton(entry)])


class ClockButton(PixelEntity, ButtonEntity):
    def __init__(self, entry: PixelConfigEntry) -> None:
        super().__init__(entry, "show_clock")

    async def async_press(self) -> None:
        now = dt_util.now()
        await self.client.async_send(P.set_time(now))
        await self.client.async_send(P.set_clock_mode(int(self.data.settings.clock_style) - 1, True, True, now))


class SyncTimeButton(PixelEntity, ButtonEntity):
    def __init__(self, entry: PixelConfigEntry) -> None:
        super().__init__(entry, "sync_time")

    async def async_press(self) -> None:
        await self.client.async_send(P.set_time(dt_util.now()))
