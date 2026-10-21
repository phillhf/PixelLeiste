"""Config flow, entities, actions and connection handling against the simulated panel."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import CONF_ADDRESS, CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.pixelleiste.const import DOMAIN

from .conftest import ADDRESS, NAME, service_info

pytestmark = pytest.mark.usefixtures("mock_ble")


@pytest.fixture(autouse=True)
def no_bluetooth_setup():
    # The bluetooth integration needs real adapters; the tests patch the lookups instead.
    with patch("homeassistant.components.bluetooth.async_setup", return_value=True), \
         patch("homeassistant.components.bluetooth_adapters.async_setup", return_value=True):
        yield


async def setup_entry(hass: HomeAssistant, options: dict | None = None) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, title=NAME, unique_id=ADDRESS,
                            data={CONF_ADDRESS: ADDRESS, CONF_NAME: NAME}, options=options or {})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def device_id(hass: HomeAssistant) -> str:
    return dr.async_get(hass).async_get_device(identifiers={(DOMAIN, ADDRESS)}).id


# --- config flow ------------------------------------------------------------------

async def test_user_flow_lists_panels(hass: HomeAssistant) -> None:
    with patch("custom_components.pixelleiste.config_flow.async_discovered_service_info",
               return_value=[service_info(), service_info("Kopfhörer", "11:22:33:44:55:66")]):
        result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    options = result["data_schema"].schema[CONF_ADDRESS].container
    assert list(options) == [ADDRESS]  # headphones are not offered
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_ADDRESS: ADDRESS})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == NAME


async def test_user_flow_without_panels_aborts(hass: HomeAssistant) -> None:
    with patch("custom_components.pixelleiste.config_flow.async_discovered_service_info", return_value=[]):
        result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["reason"] == "no_devices_found"


async def test_bluetooth_discovery(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_BLUETOOTH}, data=service_info())
    assert result["step_id"] == "bluetooth_confirm"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_ADDRESS: ADDRESS, CONF_NAME: NAME}


async def test_options_validate_password(hass: HomeAssistant) -> None:
    entry = await setup_entry(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"password": "12ab", "idle_seconds": 30})
    assert result["errors"] == {"password": "invalid_password"}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"password": "123456", "idle_seconds": 30})
    assert result["type"] is FlowResultType.CREATE_ENTRY


# --- entities ---------------------------------------------------------------------

async def test_entities_created(hass: HomeAssistant) -> None:
    entry = await setup_entry(hass)
    assert entry.state is ConfigEntryState.LOADED
    ids = {e.entity_id for e in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)}
    assert ids == {
        "light.led_ble_a1b2", "text.led_ble_a1b2_text", "number.led_ble_a1b2_text_speed",
        "select.led_ble_a1b2_text_effect", "select.led_ble_a1b2_text_colour", "select.led_ble_a1b2_clock_face",
        "select.led_ble_a1b2_show_slot", "button.led_ble_a1b2_show_clock", "button.led_ble_a1b2_sync_time",
    }


async def test_light_power_and_brightness(hass: HomeAssistant, panel) -> None:
    await setup_entry(hass)
    await hass.services.async_call("light", "turn_off", {"entity_id": "light.led_ble_a1b2"}, blocking=True)
    assert panel.frames[-1].hex() == "0500070100"
    await hass.services.async_call("light", "turn_on", {"entity_id": "light.led_ble_a1b2", "brightness": 128}, blocking=True)
    assert [f.hex() for f in panel.frames[-2:]] == ["0500070101", "0500048032"]  # on, 50 %
    assert hass.states.get("light.led_ble_a1b2").state == "on"


async def test_text_entity_uses_settings(hass: HomeAssistant, panel) -> None:
    await setup_entry(hass)
    await hass.services.async_call("select", "select_option", {"entity_id": "select.led_ble_a1b2_text_effect", "option": "blink"}, blocking=True)
    await hass.services.async_call("select", "select_option", {"entity_id": "select.led_ble_a1b2_text_colour", "option": "red"}, blocking=True)
    await hass.services.async_call("number", "set_value", {"entity_id": "number.led_ble_a1b2_text_speed", "value": 30}, blocking=True)
    await hass.services.async_call("text", "set_value", {"entity_id": "text.led_ble_a1b2_text", "value": "Hi"}, blocking=True)
    text = panel.frames[-1]
    assert (text[2], text[3]) == (0, 1)
    payload = text[15:]
    # [count][0,1,1,animation,speed,rainbow,r,g,b,…]
    assert payload[0] == 2 and list(payload[4:10]) == [5, 30, 0, 0xFF, 0x2A, 0x1A]
    assert hass.states.get("text.led_ble_a1b2_text").state == "Hi"


async def test_show_slot_select_and_clock_button(hass: HomeAssistant, panel) -> None:
    await setup_entry(hass)
    await hass.services.async_call("select", "select_option", {"entity_id": "select.led_ble_a1b2_show_slot", "option": "4"}, blocking=True)
    assert panel.frames[-1].hex() == "07000880010004"
    await hass.services.async_call("button", "press", {"entity_id": "button.led_ble_a1b2_show_clock"}, blocking=True)
    assert panel.commands()[-2:] == [(1, 0x80), (6, 1)]


# --- actions ------------------------------------------------------------------------

async def test_send_text_action(hass: HomeAssistant, panel) -> None:
    await setup_entry(hass)
    await hass.services.async_call(DOMAIN, "send_text", {
        "device_id": device_id(hass), "text": "[#00ff00]Grün[/] ok", "effect": "scroll_right",
        "color": [255, 255, 0], "background": "#000040", "speed": 80, "slot": 3,
    }, blocking=True)
    f = panel.frames[-1]
    assert f[14] == 3  # save slot
    payload = f[15:]
    assert payload[0] == 7 and list(payload[4:14]) == [2, 80, 0, 255, 255, 0, 1, 0, 0, 0x40]


async def test_send_image_action(hass: HomeAssistant, panel, tmp_path) -> None:
    from PIL import Image

    gif = tmp_path / "anim.gif"
    frames = [Image.new("RGB", (32, 32), c) for c in [(255, 0, 0), (0, 0, 255)]]
    frames[0].save(gif, save_all=True, append_images=frames[1:], duration=200, loop=0)
    hass.config.allowlist_external_dirs = {str(tmp_path)}
    await setup_entry(hass)
    await hass.services.async_call(DOMAIN, "send_image", {"device_id": device_id(hass), "path": str(gif), "slot": 2}, blocking=True)
    f = panel.frames[-1]
    assert (f[2], f[3], f[13], f[14]) == (3, 0, 2, 2)  # GIF, tail 2, slot 2

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(DOMAIN, "send_image", {"device_id": device_id(hass), "path": "/etc/passwd"}, blocking=True)


async def test_simple_actions(hass: HomeAssistant, panel) -> None:
    await setup_entry(hass)
    dev = device_id(hass)
    calls = [
        ("scoreboard", {"left": 3, "right": 7}, "08000a8003000700"),
        ("countdown", {"action": "start", "minutes": 2, "seconds": 30}, "07000d8001021e"),
        ("stopwatch", {"action": "stop"}, "0500098000"),
        ("show_slot", {"slot": 2}, "07000880010002"),
        ("delete_slot", {"slot": 9}, "07000201010009"),
        ("rhythm", {"style": 2, "intensity": 5}, "060000020501"),
        ("set_orientation", {"orientation": 1}, "0500068001"),
    ]
    for service, data, expected in calls:
        await hass.services.async_call(DOMAIN, service, {"device_id": dev, **data}, blocking=True)
        assert panel.frames[-1].hex() == expected, service


# --- connection handling ----------------------------------------------------------------

async def test_connects_on_demand_and_releases_after_idle(hass: HomeAssistant, panel) -> None:
    await setup_entry(hass, {"idle_seconds": 10})
    assert panel.connects == 0  # nothing sent yet → no connection held
    await hass.services.async_call("light", "turn_off", {"entity_id": "light.led_ble_a1b2"}, blocking=True)
    await hass.services.async_call("light", "turn_on", {"entity_id": "light.led_ble_a1b2"}, blocking=True)
    assert panel.connects == 1 and panel.disconnects == 0  # reused for both commands
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=11))
    await hass.async_block_till_done()
    assert panel.disconnects == 1


async def test_password(hass: HomeAssistant, panel) -> None:
    panel.password_flag = 1
    await setup_entry(hass, {"password": "123456"})
    await hass.services.async_call("light", "turn_off", {"entity_id": "light.led_ble_a1b2"}, blocking=True)
    assert panel.frames[1].hex() == "07000502 0c2238".replace(" ", "")


async def test_password_missing_raises(hass: HomeAssistant, panel) -> None:
    panel.password_flag = 1
    await setup_entry(hass)
    with pytest.raises(HomeAssistantError, match="password"):
        await hass.services.async_call("light", "turn_off", {"entity_id": "light.led_ble_a1b2"}, blocking=True)


async def test_unload(hass: HomeAssistant, panel) -> None:
    entry = await setup_entry(hass)
    await hass.services.async_call("light", "turn_off", {"entity_id": "light.led_ble_a1b2"}, blocking=True)
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert panel.disconnects == 1


async def test_setup_component(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, DOMAIN, {})
    assert hass.services.has_service(DOMAIN, "send_text")
