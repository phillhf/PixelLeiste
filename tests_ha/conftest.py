"""Fixtures: Home Assistant test harness + a simulated panel behind a fake Bleak client."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest
from bleak.backends.device import BLEDevice

from homeassistant.components.bluetooth import BluetoothServiceInfoBleak
from homeassistant.helpers.service_info.bluetooth import BluetoothServiceInfo  # noqa: F401

pytest_plugins = "pytest_homeassistant_custom_component"

ADDRESS = "AA:BB:CC:DD:EE:01"
NAME = "LED_BLE_A1B2"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


class FakePanel:
    """Reassembles length-prefixed frames and answers like the real panel."""

    def __init__(self, password_flag: int = 255) -> None:
        self.password_flag = password_flag
        self.frames: list[bytes] = []
        self.buffer = b""
        self.transfer: dict | None = None
        self.connects = 0
        self.disconnects = 0
        self.notify_cb = None

    def reply(self, data: bytes) -> None:
        asyncio.get_running_loop().call_soon(self.notify_cb, None, bytearray(data))

    def receive(self, chunk: bytes) -> None:
        self.buffer += chunk
        while len(self.buffer) >= 2:
            length = self.buffer[0] | (self.buffer[1] << 8)
            if length < 4 or len(self.buffer) < length:
                break
            frame, self.buffer = self.buffer[:length], self.buffer[length:]
            self.frames.append(frame)
            self.handle(frame)

    def handle(self, f: bytes) -> None:
        cmd, sub = f[2], f[3]
        if (cmd, sub) in ((0, 1), (2, 0), (3, 0)):
            size = int.from_bytes(f[5:9], "little")
            if f[4] == 0:
                self.transfer = {"received": 0, "size": size}
            self.transfer["received"] += len(f) - 15
            self.reply(bytes([5, 0, cmd, sub, 3 if self.transfer["received"] >= size else 1]))
        elif (cmd, sub) == (1, 0x80):
            self.reply(bytes([11, 0, 1, 0x80, 132, 1, 0, 1, 0, 0, self.password_flag]))
        elif (cmd, sub) not in ((5, 1), (1, 2)):
            self.reply(bytes([5, 0, cmd, sub, 0]))

    def commands(self) -> list[tuple[int, int]]:
        return [(f[2], f[3]) for f in self.frames]


class FakeClient:
    def __init__(self, panel: FakePanel, disconnected_callback) -> None:
        self.panel = panel
        self.is_connected = True
        self.mtu_size = 247
        self._disconnected_callback = disconnected_callback

    async def start_notify(self, uuid, cb):
        self.panel.notify_cb = cb

    async def write_gatt_char(self, uuid, data, response=True):
        assert len(data) <= 244
        self.panel.receive(bytes(data))

    async def disconnect(self):
        if self.is_connected:
            self.is_connected = False
            self.panel.disconnects += 1
            self._disconnected_callback(self)


@pytest.fixture
def panel():
    return FakePanel()


@pytest.fixture
def mock_ble(panel):
    """Patches HA's bluetooth lookups and bleak-retry-connector with the simulated panel."""
    device = BLEDevice(ADDRESS, NAME, {}, -60)

    async def fake_connect(_cls, _device, _name, disconnected_callback=None, **_kw):
        panel.connects += 1
        return FakeClient(panel, disconnected_callback)

    with (
        patch("custom_components.pixelleiste.panel.bluetooth.async_ble_device_from_address", return_value=device),
        patch("custom_components.pixelleiste.panel.establish_connection", side_effect=fake_connect),
        patch("custom_components.pixelleiste.entity.bluetooth.async_address_present", return_value=True),
    ):
        yield panel


def service_info(name: str = NAME, address: str = ADDRESS) -> BluetoothServiceInfoBleak:
    return BluetoothServiceInfoBleak(
        name=name, address=address, rssi=-60, manufacturer_data={}, service_data={},
        service_uuids=["000000fa-0000-1000-8000-00805f9b34fb"], source="local",
        device=BLEDevice(address, name, {}, -60), advertisement=None, connectable=True, time=0, tx_power=None,
    )
