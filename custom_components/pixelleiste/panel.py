"""BLE client for one panel via Home Assistant's Bluetooth stack (local adapter or ESPHome proxy).

The panel accepts only one connection at a time, so we connect on demand and disconnect
after a short idle time – the phone/PC app can then connect again.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from bleak.backends.device import BLEDevice
from bleak_retry_connector import BleakClientWithServiceCache, establish_connection

from homeassistant.components import bluetooth
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from . import protocol as P
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
ACK_TIMEOUT = 8.0


class PanelError(HomeAssistantError):
    """Panel not reachable or did not answer."""

    def __init__(self, key: str, **placeholders: str) -> None:
        super().__init__(translation_domain=DOMAIN, translation_key=key, translation_placeholders=placeholders)


class PanelClient:
    """Serialised, on-demand connection to one iPixel panel."""

    def __init__(self, hass: HomeAssistant, address: str, name: str, password: str | None, idle_seconds: int) -> None:
        self.hass = hass
        self.address = address
        self.name = name
        self.password = password
        self.idle_seconds = idle_seconds
        self.info: P.DeviceInfo | None = None
        self._client: BleakClientWithServiceCache | None = None
        self._lock = asyncio.Lock()
        self._chunk = P.CHUNK_SIZE
        self._window_ack = asyncio.Event()
        self._final_ack = asyncio.Event()
        self._response: asyncio.Future[bytes] | None = None
        self._idle_handle: asyncio.TimerHandle | None = None
        self._listeners: list[Callable[[], None]] = []

    @property
    def connected(self) -> bool:
        return self._client is not None and self._client.is_connected

    def add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)
        return lambda: self._listeners.remove(cb)

    def _notify_listeners(self) -> None:
        for cb in list(self._listeners):
            cb()

    # --- connection -------------------------------------------------------------

    def _on_notify(self, _sender: object, data: bytearray) -> None:
        kind, value = P.classify_notification(bytes(data))
        if kind == "ack":
            if value in (0, 1, 3):
                self._window_ack.set()
            if value == 3:
                self._final_ack.set()
        elif self._response and not self._response.done():
            self._response.set_result(value)  # type: ignore[arg-type]

    def _on_disconnect(self, _client: object) -> None:
        _LOGGER.debug("%s: disconnected", self.name)
        self._client = None
        self.hass.loop.call_soon_threadsafe(self._notify_listeners)

    async def _connect(self) -> None:
        if self.connected:
            return
        device: BLEDevice | None = bluetooth.async_ble_device_from_address(self.hass, self.address, connectable=True)
        if device is None:
            raise PanelError("not_found", name=self.name)
        try:
            client = await establish_connection(
                BleakClientWithServiceCache, device, self.name,
                disconnected_callback=self._on_disconnect, max_attempts=3,
            )
        except Exception as err:  # noqa: BLE001 – bleak raises many error types
            raise PanelError("connect_failed", name=self.name, error=str(err)) from err
        self._client = client
        try:
            await client.start_notify(P.NOTIFY_UUID, self._on_notify)
            backend = getattr(client, "_backend", None)
            if backend is not None and hasattr(backend, "_acquire_mtu"):
                try:  # BlueZ reports MTU 23 until it is acquired explicitly
                    await backend._acquire_mtu()  # noqa: SLF001
                except Exception:  # noqa: BLE001
                    pass
            self._chunk = max(20, min(P.CHUNK_SIZE, (client.mtu_size or 23) - 3))
            try:
                self.info = P.parse_device_info(await self._request(P.get_device_info()))
            except (TimeoutError, ValueError):
                _LOGGER.debug("%s: no device info, assuming 96x16", self.name)
                self.info = P.DeviceInfo()
            if self.info.needs_password:
                if not self.password:
                    raise PanelError("password_required", name=self.name)
                await self._send(P.verify_password(self.password))
        except BaseException:
            await self._disconnect()
            raise
        _LOGGER.debug("%s: connected, %sx%s, chunk %s", self.name, self.info.width, self.info.height, self._chunk)
        self._notify_listeners()

    async def _disconnect(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            try:
                await client.disconnect()
            except Exception:  # noqa: BLE001
                pass
        self._notify_listeners()

    def _schedule_idle_disconnect(self) -> None:
        if self._idle_handle:
            self._idle_handle.cancel()
        self._idle_handle = self.hass.loop.call_later(
            self.idle_seconds, lambda: self.hass.async_create_task(self._idle_disconnect()))

    async def _idle_disconnect(self) -> None:
        async with self._lock:
            await self._disconnect()

    async def async_shutdown(self) -> None:
        if self._idle_handle:
            self._idle_handle.cancel()
        async with self._lock:
            await self._disconnect()

    # --- sending -------------------------------------------------------------------

    async def _write(self, data: bytes) -> None:
        assert self._client is not None
        for pos in range(0, len(data), self._chunk):
            await self._client.write_gatt_char(P.WRITE_UUID, data[pos:pos + self._chunk], response=True)

    async def _request(self, plan: P.SendPlan) -> bytes:
        self._response = self.hass.loop.create_future()
        for w in plan.windows:
            await self._write(w.data)
        try:
            return await asyncio.wait_for(self._response, ACK_TIMEOUT)
        finally:
            self._response = None

    async def _send(self, plan: P.SendPlan) -> None:
        self._final_ack.clear()
        for w in plan.windows:
            self._window_ack.clear()
            await self._write(w.data)
            if w.requires_ack:
                await asyncio.wait_for(self._window_ack.wait(), ACK_TIMEOUT)
        if plan.ack_final:
            await asyncio.wait_for(self._final_ack.wait(), ACK_TIMEOUT)

    async def async_send(self, build: P.SendPlan | Callable[[P.DeviceInfo], P.SendPlan]) -> None:
        """Connects if needed and sends; `build` may depend on the panel size."""
        async with self._lock:
            await self._connect()
            plan = build(self.info or P.DeviceInfo()) if callable(build) else build
            try:
                await self._send(plan)
            except TimeoutError as err:
                await self._disconnect()
                raise PanelError("no_answer", name=self.name) from err
            except Exception as err:  # noqa: BLE001
                await self._disconnect()
                raise PanelError("connect_failed", name=self.name, error=str(err)) from err
            finally:
                self._schedule_idle_disconnect()
