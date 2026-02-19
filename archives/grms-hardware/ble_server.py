"""
GRMS BLE GATT Peripheral  –  Door Side
========================================

Advertises a GATT service so that a real phone (or nRF Connect, LightBlue,
etc.) can connect and trigger an access attempt.

GATT layout
-----------
  Service  :  GRMS_DOOR_SERVICE_UUID  (4fafc201-…)
    └─ Characteristic : ACCESS_CHAR_UUID  (beb5483e-…)
         Properties  : WriteWithoutResponse + Notify
         Write (Phone → Door)  : 16 bytes – user_id as raw UUID bytes
         Notify (Door → Phone) :  3 bytes – [result(1)] + [err_code(2, LE)]
                                  result  0x00 = granted
                                          0x01 = denied

BLE pairing / bonding
---------------------
This module does NOT enforce BLE-layer pairing. Security is provided at
the application layer (grant cache + time window + future HMAC). Adding
OS-level pairing would be a `bless` security-flag change and is out of
scope for the MVP.

Phone-side (how to test without a real app)
-------------------------------------------
  • nRF Connect (iOS / Android) :
      1. Scan for "GRMS-<door_id[:8]>"
      2. Connect → expand the GRMS service
      3. Enable notifications on the characteristic
      4. Write 16 bytes = user_id UUID (big-endian, no hyphens)
         e.g.  7fc96794a0834aa1b5b9c189dc6f399f
      5. Read the notification for the result

Install
-------
  pip install bless

Dependencies
------------
  bless >= 0.2.0  (wraps CoreBluetooth / BlueZ / WinRT)
  Python >= 3.10
"""

import asyncio
import logging
import struct
import uuid as uuidlib
from typing import Awaitable, Callable, Optional

log = logging.getLogger("ble-server")

# ── GATT UUIDs (stable, custom) ───────────────────────────────────────────────
DOOR_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
ACCESS_CHAR_UUID  = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

# ── Type alias ────────────────────────────────────────────────────────────────
# async def handler(key_id: str) -> tuple[granted: bool, error_code: int, grant]
AccessHandler = Callable[[str], Awaitable[tuple[bool, int, object]]]

# ── Internal async queue (bridges sync write-callback → async handler) ────────
_access_queue: asyncio.Queue[str] = asyncio.Queue()


# ─────────────────────────────────────────────────────────────────────────────
# GATT callbacks  (called synchronously by bless internals)
# ─────────────────────────────────────────────────────────────────────────────

def _on_read(characteristic, **kwargs) -> bytearray:
    """Return current characteristic value (last access result)."""
    return characteristic.value or bytearray(3)


def _on_write(characteristic, value, **kwargs) -> None:
    """
    Called when a phone writes to the ACCESS characteristic.
    Expects exactly 16 bytes: the user_id UUID (big-endian, no hyphens).
    Schedules async processing via the event loop.
    """
    try:
        raw = bytes(value)
        if len(raw) != 16:
            log.warning(f"BLE ← write: bad length {len(raw)} bytes (expected 16)")
            return
        key_id = str(uuidlib.UUID(bytes=raw))
        log.info(f"BLE ← write: key_id={key_id[:8]}…")
        # Bridge sync → async
        loop = asyncio.get_event_loop()
        loop.call_soon_threadsafe(_access_queue.put_nowait, key_id)
    except Exception as exc:
        log.warning(f"BLE ← write error: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Async processor
# ─────────────────────────────────────────────────────────────────────────────

async def _process_loop(server, handler: AccessHandler) -> None:
    """
    Drain _access_queue, call the application handler for each key_id,
    then push a notification back to the connected phone.
    """
    while True:
        key_id = await _access_queue.get()
        try:
            granted, err_code, _grant = await handler(key_id)

            # 3-byte response: [0x00|0x01] + [err_code uint16 little-endian]
            response = bytearray(struct.pack("<BH", 0x00 if granted else 0x01, err_code))

            # Update characteristic value then notify
            char = server.get_characteristic(ACCESS_CHAR_UUID)
            if char is not None:
                char.value = response
                server.update_value(DOOR_SERVICE_UUID, ACCESS_CHAR_UUID)
                log.info(
                    f"BLE → notify: result={'GRANTED' if granted else 'DENIED'} "
                    f"code={err_code:#06x}"
                )
            else:
                log.error("BLE: characteristic not found – notification skipped")

        except Exception as exc:
            log.error(f"BLE: handler error: {exc}", exc_info=True)
        finally:
            _access_queue.task_done()


# ─────────────────────────────────────────────────────────────────────────────
# Public entry-point
# ─────────────────────────────────────────────────────────────────────────────

async def run(door_id: str, handler: AccessHandler) -> None:
    """
    Start the BLE GATT peripheral and advertise as a GRMS door.

    Parameters
    ----------
    door_id : str
        UUID of this door — used in the BLE device name ("GRMS-<first-8-chars>").
    handler : async callable
        Coroutine called with (key_id: str) each time a phone presents a key.
        Must return (granted: bool, error_code: int, grant: CachedGrant|None).
        This is where verify_access + send_access_event + post_log are wired in.
    """
    try:
        from bless import (
            BlessServer,
            GATTCharacteristicProperties,
            GATTAttributePermissions,
        )
    except ImportError:
        log.warning("BLE: 'bless' not installed → BLE peripheral disabled")
        log.warning("BLE: run:  pip install bless")
        # Park here so the task doesn't crash the run loop
        await asyncio.Event().wait()
        return

    device_name = f"GRMS-{door_id[:8]}"
    log.info(f"BLE: starting GATT server  name={device_name!r}")

    server = BlessServer(name=device_name, loop=asyncio.get_event_loop())
    server.read_request_func  = _on_read
    server.write_request_func = _on_write

    # ── GATT service / characteristic definition ─────────────────────────────
    gatt = {
        DOOR_SERVICE_UUID: {
            ACCESS_CHAR_UUID: {
                "Properties": (
                    GATTCharacteristicProperties.write_without_response
                    | GATTCharacteristicProperties.notify
                ),
                "Permissions": (
                    GATTAttributePermissions.readable
                    | GATTAttributePermissions.writeable
                ),
                "Value": bytearray(3),   # initial response placeholder
            }
        }
    }
    await server.add_gatt(gatt)
    await server.start()

    log.info(f"BLE: advertising — service {DOOR_SERVICE_UUID}")
    log.info("BLE: waiting for phone connections…")
    log.info("BLE: phone writes 16-byte UUID → door notifies 3-byte result")

    try:
        await _process_loop(server, handler)
    except asyncio.CancelledError:
        pass
    finally:
        await server.stop()
        log.info("BLE: server stopped")
