"""Base entity: one device per panel, availability follows Bluetooth advertisements."""

from __future__ import annotations

from homeassistant.components import bluetooth
from homeassistant.const import CONF_ADDRESS
from homeassistant.core import callback
from homeassistant.helpers.device_registry import CONNECTION_BLUETOOTH, DeviceInfo
from homeassistant.helpers.entity import Entity

from . import PixelConfigEntry
from .const import DOMAIN, MANUFACTURER


class PixelEntity(Entity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, entry: PixelConfigEntry, key: str) -> None:
        self.entry = entry
        self.data = entry.runtime_data
        self.client = entry.runtime_data.client
        address = entry.data[CONF_ADDRESS]
        self._attr_translation_key = key
        self._attr_unique_id = f"{address}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, address)},
            connections={(CONNECTION_BLUETOOTH, address)},
            name=entry.title,
            manufacturer=MANUFACTURER,
            model="LED panel 96×16",
        )

    @property
    def available(self) -> bool:
        # Connected right now, or recently seen advertising (local adapter or proxy).
        return self.client.connected or bluetooth.async_address_present(
            self.hass, self.client.address, connectable=True)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.client.add_listener(self._handle_update))

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()
