"""Config flow: Bluetooth discovery (LED_BLE_*) or pick from the list; options for password/idle time."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.bluetooth import BluetoothServiceInfoBleak, async_discovered_service_info
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_ADDRESS, CONF_NAME
from homeassistant.core import callback

from .const import CONF_IDLE_SECONDS, CONF_PASSWORD, DEFAULT_IDLE_SECONDS, DOMAIN
from .protocol import SERVICE_UUID


def is_panel(info: BluetoothServiceInfoBleak) -> bool:
    name = (info.name or "").upper()
    return name.startswith(("LED_BLE", "LED BLE")) or SERVICE_UUID in [u.lower() for u in info.service_uuids]


class PixelConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._discovery: BluetoothServiceInfoBleak | None = None
        self._found: dict[str, str] = {}

    async def async_step_bluetooth(self, discovery_info: BluetoothServiceInfoBleak) -> ConfigFlowResult:
        await self.async_set_unique_id(discovery_info.address)
        self._abort_if_unique_id_configured()
        if not is_panel(discovery_info):
            return self.async_abort(reason="not_supported")
        self._discovery = discovery_info
        self.context["title_placeholders"] = {"name": discovery_info.name or discovery_info.address}
        return await self.async_step_bluetooth_confirm()

    async def async_step_bluetooth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        assert self._discovery is not None
        name = self._discovery.name or self._discovery.address
        if user_input is not None:
            return self.async_create_entry(title=name, data={CONF_ADDRESS: self._discovery.address, CONF_NAME: name})
        self._set_confirm_only()
        return self.async_show_form(step_id="bluetooth_confirm", description_placeholders={"name": name})

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            address = user_input[CONF_ADDRESS]
            await self.async_set_unique_id(address, raise_on_progress=False)
            self._abort_if_unique_id_configured()
            name = self._found.get(address, address)
            return self.async_create_entry(title=name, data={CONF_ADDRESS: address, CONF_NAME: name})

        configured = self._async_current_ids(include_ignore=False)
        for info in async_discovered_service_info(self.hass, connectable=True):
            if info.address not in configured and is_panel(info):
                self._found[info.address] = info.name or info.address
        if not self._found:
            return self.async_abort(reason="no_devices_found")
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_ADDRESS): vol.In(
                {addr: f"{name} ({addr})" for addr, name in self._found.items()})}),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return PixelOptionsFlow()


class PixelOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            pw = user_input.get(CONF_PASSWORD, "").strip()
            if pw and not (pw.isdigit() and len(pw) == 6):
                errors[CONF_PASSWORD] = "invalid_password"
            else:
                return self.async_create_entry(data={**user_input, CONF_PASSWORD: pw})
        opts = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(CONF_PASSWORD, default=opts.get(CONF_PASSWORD, "")): str,
                vol.Optional(CONF_IDLE_SECONDS, default=opts.get(CONF_IDLE_SECONDS, DEFAULT_IDLE_SECONDS)):
                    vol.All(vol.Coerce(int), vol.Range(5, 3600)),
            }),
            errors=errors,
        )
