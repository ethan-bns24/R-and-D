#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import inspect
import json
import logging
import os
import struct
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import websockets
from bluezero import adapter, peripheral

try:
    import RPi.GPIO as GPIO  # type: ignore
except Exception:
    GPIO = None


UUID_NIL = "00000000-0000-0000-0000-000000000000"
DEFAULT_DOOR_ID = "1a7d2ade-c63e-40f3-ace2-7798e752ee45"

# BLE DoorAccess profile UUIDs
SVC_DOORACCESS = "C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C"
CHAR_CONTROLPOINT = "C0DE0002-3F2A-4E9B-9B1E-0A8C2D3A4B5C"
CHAR_STATUS = "C0DE0003-3F2A-4E9B-9B1E-0A8C2D3A4B5C"
CHAR_INFO = "C0DE0004-3F2A-4E9B-9B1E-0A8C2D3A4B5C"

# ControlPoint opcodes
OP_GET_CHALLENGE = 0x01
OP_AUTHENTICATE = 0x02

# Status notifications
EVT_CHALLENGE = 0x81
EVT_RESULT = 0x82

# TLV types
TLV_DOOR_ID = 0x01
TLV_PROTO_VERSION = 0x02
TLV_CAPABILITIES = 0x03
TLV_DOOR_TIME = 0x04

TLV_KEY_ID = 0x10
TLV_NONCE = 0x12
TLV_MAC = 0x13
TLV_GRANT_ID = 0x14

TLV_RESULT_OK = 0x20
TLV_RESULT_ERROR = 0x21
TLV_RESULT_OPEN_MS = 0x22
TLV_RESULT_EVENT_ID = 0x23

# Error codes
ERR_OK = 0x0000
ERR_UNKNOWN_KEY = 0x0001
ERR_GRANT_EXPIRED = 0x0002
ERR_NOT_YET_VALID = 0x0003
ERR_NONCE_TIMEOUT = 0x0004
ERR_HMAC_INVALID = 0x0006
ERR_GRANT_MISMATCH = 0x0007
ERR_DOOR_BUSY = 0x0008
ERR_INTERNAL = 0x0009


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    return int(raw)


@dataclass
class Config:
    door_id: uuid.UUID
    proto_version: int
    capabilities: int

    ble_local_name: str
    ble_require_encryption: bool
    ble_adapter_address: str | None

    doorlink_url: str
    door_api_token: str
    fw_version: str

    led_gpio: int
    open_ms: int
    open_cooldown_sec: float

    nonce_ttl_sec: int
    intrusion_window_sec: int
    intrusion_threshold: int

    state_file: Path

    @staticmethod
    def from_env() -> "Config":
        door_id_raw = os.getenv("DOOR_ID", DEFAULT_DOOR_ID)
        door_id = uuid.UUID(door_id_raw)
        ble_name = os.getenv("BLE_LOCAL_NAME", f"DoorAccess-{door_id.hex[:8]}")
        return Config(
            door_id=door_id,
            proto_version=env_int("PROTO_VERSION", 1),
            capabilities=env_int("CAPABILITIES", 0b0000_0000_0000_0001),
            ble_local_name=ble_name,
            ble_require_encryption=env_bool("BLE_REQUIRE_ENCRYPTION", False),
            ble_adapter_address=os.getenv("BLE_ADAPTER_ADDRESS"),
            doorlink_url=os.getenv("DOORLINK_URL", "ws://127.0.0.1:4001"),
            door_api_token=os.getenv("DOOR_API_TOKEN", ""),
            fw_version=os.getenv("FW_VERSION", "1.0.0"),
            led_gpio=env_int("LED_GPIO", 17),
            open_ms=env_int("OPEN_MS", 700),
            open_cooldown_sec=float(os.getenv("OPEN_COOLDOWN_SEC", "1.0")),
            nonce_ttl_sec=env_int("NONCE_TTL_SEC", 30),
            intrusion_window_sec=env_int("INTRUSION_WINDOW_SEC", 300),
            intrusion_threshold=env_int("INTRUSION_THRESHOLD", 3),
            state_file=Path(os.getenv("STATE_FILE", "/data/door_state.json")),
        )


class GPIOController:
    def __init__(self, pin: int) -> None:
        self.pin = pin
        self.enabled = GPIO is not None
        if self.enabled:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.pin, GPIO.OUT)
            GPIO.output(self.pin, GPIO.LOW)

    def high(self) -> None:
        if self.enabled:
            GPIO.output(self.pin, GPIO.HIGH)

    def low(self) -> None:
        if self.enabled:
            GPIO.output(self.pin, GPIO.LOW)

    def cleanup(self) -> None:
        if self.enabled:
            GPIO.output(self.pin, GPIO.LOW)
            GPIO.cleanup()


@dataclass
class Grant:
    key_id: str
    grant_id: str
    from_ts: int
    to_ts: int
    secret_door: bytes

    @staticmethod
    def from_wire(item: dict[str, Any]) -> "Grant":
        return Grant(
            key_id=str(uuid.UUID(item["key_id"])),
            grant_id=str(uuid.UUID(item["grant_id"])),
            from_ts=int(item["from_ts"]),
            to_ts=int(item["to_ts"]),
            secret_door=base64.b64decode(item["secret_door_b64"]),
        )

    def to_state(self) -> dict[str, Any]:
        return {
            "key_id": self.key_id,
            "grant_id": self.grant_id,
            "from_ts": self.from_ts,
            "to_ts": self.to_ts,
            "secret_door_b64": base64.b64encode(self.secret_door).decode("ascii"),
        }


class StateStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> tuple[int, dict[str, Grant]]:
        if not self.path.exists():
            return 0, {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            seq = int(data.get("last_sync_seq", 0))
            grants_raw = data.get("grants", [])
            grants = {}
            for item in grants_raw:
                g = Grant(
                    key_id=str(uuid.UUID(item["key_id"])),
                    grant_id=str(uuid.UUID(item["grant_id"])),
                    from_ts=int(item["from_ts"]),
                    to_ts=int(item["to_ts"]),
                    secret_door=base64.b64decode(item["secret_door_b64"]),
                )
                grants[g.key_id] = g
            return seq, grants
        except Exception as exc:
            logging.warning("State file unreadable (%s), reset local cache.", exc)
            return 0, {}

    def save(self, last_sync_seq: int, grants_by_key: dict[str, Grant]) -> None:
        payload = {
            "last_sync_seq": last_sync_seq,
            "grants": [g.to_state() for g in grants_by_key.values()],
        }
        self.path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


class DoorAgent:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.state = StateStore(cfg.state_file)
        self.led = GPIOController(cfg.led_gpio)

        self.loop = asyncio.get_running_loop()
        self.doorlink_ws: Any = None
        self.pending_events: deque[dict[str, Any]] = deque()
        self.status_char: Any = None

        self.last_open_ts = 0.0
        self.open_lock = asyncio.Lock()

        self.nonce_cache: dict[str, float] = {}
        self.failures_by_key: dict[str, deque[float]] = defaultdict(deque)

        self.last_sync_seq, self.grants_by_key = self.state.load()

    # ---------- Low-level helpers ----------
    @staticmethod
    def tlv_pack(items: list[tuple[int, bytes]]) -> bytes:
        out = bytearray()
        for t, v in items:
            if not (0 <= t <= 255):
                raise ValueError("TLV type out of range")
            if len(v) > 255:
                raise ValueError("TLV value too long")
            out.extend(bytes([t, len(v)]))
            out.extend(v)
        return bytes(out)

    @staticmethod
    def tlv_unpack(buf: bytes) -> dict[int, bytes]:
        out: dict[int, bytes] = {}
        i = 0
        while i + 2 <= len(buf):
            t = buf[i]
            ln = buf[i + 1]
            i += 2
            if i + ln > len(buf):
                raise ValueError("Bad TLV length")
            out[t] = buf[i : i + ln]
            i += ln
        if i != len(buf):
            raise ValueError("Trailing bytes in TLV")
        return out

    @staticmethod
    def i64be(v: int) -> bytes:
        return struct.pack(">q", int(v))

    @staticmethod
    def u16be(v: int) -> bytes:
        return struct.pack(">H", v)

    def _msg_for_hmac(self, nonce: bytes, key_id: uuid.UUID) -> bytes:
        return nonce + self.cfg.door_id.bytes + key_id.bytes + bytes([self.cfg.proto_version])

    def _hmac_sha256(self, key: bytes, msg: bytes) -> bytes:
        return hmac.new(key, msg, hashlib.sha256).digest()

    def _persist(self) -> None:
        self.state.save(self.last_sync_seq, self.grants_by_key)

    # ---------- BLE display ----------
    def print_ble_profile(self) -> None:
        print("")
        print("############################################################")
        print("#                    BLE DOOR ACCESS                       #")
        print("############################################################")
        print(f"door_id         : {self.cfg.door_id}")
        print(f"proto_version   : {self.cfg.proto_version}")
        print(f"local_name      : {self.cfg.ble_local_name}")
        print(f"service_uuid    : {SVC_DOORACCESS}")
        print(f"controlpoint    : {CHAR_CONTROLPOINT} (WRITE)")
        print(f"status          : {CHAR_STATUS} (NOTIFY)")
        print(f"info            : {CHAR_INFO} (READ)")
        print(f"require_encrypt : {self.cfg.ble_require_encryption}")
        print("############################################################")
        print("")

    @staticmethod
    def print_open_banner() -> None:
        print("")
        print("############################################################")
        print("#                                                          #")
        print("#                    PORTE OUVERTE                         #")
        print("#                                                          #")
        print("############################################################")
        print("")

    # ---------- GATT Info / Status ----------
    def info_read(self, *_args: Any, **_kwargs: Any) -> bytes:
        return self.tlv_pack(
            [
                (TLV_DOOR_ID, self.cfg.door_id.bytes),
                (TLV_PROTO_VERSION, bytes([self.cfg.proto_version])),
                (TLV_CAPABILITIES, self.u16be(self.cfg.capabilities)),
                (TLV_DOOR_TIME, self.i64be(int(time.time()))),
            ]
        )

    def status_notify(self, payload: bytes) -> None:
        if self.status_char is None:
            return
        self.status_char.set_value(payload)
        self.status_char.notify = True

    def notify_challenge(self, nonce: bytes) -> None:
        payload = self.tlv_pack(
            [
                (TLV_NONCE, nonce),
                (TLV_DOOR_TIME, self.i64be(int(time.time()))),
            ]
        )
        self.status_notify(bytes([EVT_CHALLENGE]) + payload)

    def notify_result(self, ok: bool, err: int, open_ms: int = 0, event_id: uuid.UUID | None = None) -> None:
        items: list[tuple[int, bytes]] = [
            (TLV_RESULT_OK, bytes([1 if ok else 0])),
            (TLV_RESULT_ERROR, self.u16be(err)),
        ]
        if ok:
            items.append((TLV_RESULT_OPEN_MS, self.u16be(open_ms)))
        if event_id:
            items.append((TLV_RESULT_EVENT_ID, event_id.bytes))
        self.status_notify(bytes([EVT_RESULT]) + self.tlv_pack(items))

    # ---------- Nonce handling ----------
    def purge_nonce_cache(self) -> None:
        now = time.time()
        expired = [k for k, exp in self.nonce_cache.items() if exp <= now]
        for key in expired:
            del self.nonce_cache[key]

    def new_nonce(self) -> bytes:
        self.purge_nonce_cache()
        nonce = os.urandom(32)
        self.nonce_cache[nonce.hex()] = time.time() + self.cfg.nonce_ttl_sec
        return nonce

    def consume_nonce(self, nonce: bytes) -> tuple[bool, int]:
        self.purge_nonce_cache()
        hx = nonce.hex()
        exp = self.nonce_cache.get(hx)
        if exp is None or exp <= time.time():
            self.nonce_cache.pop(hx, None)
            return False, ERR_NONCE_TIMEOUT
        del self.nonce_cache[hx]
        return True, ERR_OK

    # ---------- Access checks ----------
    def check_grant_valid(self, key_id: str) -> tuple[bool, int, Grant | None]:
        grant = self.grants_by_key.get(key_id)
        if grant is None:
            return False, ERR_UNKNOWN_KEY, None
        now = int(time.time())
        if now < grant.from_ts:
            return False, ERR_NOT_YET_VALID, grant
        if now > grant.to_ts:
            return False, ERR_GRANT_EXPIRED, grant
        return True, ERR_OK, grant

    def record_hmac_failure(self, key_id: str) -> bool:
        q = self.failures_by_key[key_id]
        now = time.time()
        while q and (now - q[0]) > self.cfg.intrusion_window_sec:
            q.popleft()
        q.append(now)
        return len(q) >= self.cfg.intrusion_threshold

    async def actuate_open(self) -> bool:
        async with self.open_lock:
            now = time.time()
            if (now - self.last_open_ts) < self.cfg.open_cooldown_sec:
                return False
            self.last_open_ts = now

            self.led.high()
            await asyncio.sleep(self.cfg.open_ms / 1000.0)
            self.led.low()
            self.print_open_banner()
            return True

    # ---------- DoorLink ----------
    async def doorlink_send(self, msg: dict[str, Any]) -> None:
        if self.doorlink_ws is None:
            self.pending_events.append(msg)
            return
        try:
            await self.doorlink_ws.send(json.dumps(msg))
        except Exception:
            self.pending_events.appendleft(msg)

    async def flush_pending_events(self) -> None:
        while self.pending_events and self.doorlink_ws is not None:
            msg = self.pending_events[0]
            try:
                await self.doorlink_ws.send(json.dumps(msg))
                self.pending_events.popleft()
            except Exception:
                break

    async def emit_access_event(
        self,
        result: str,
        error_code: int,
        key_id: uuid.UUID | None = None,
        grant_id: uuid.UUID | None = None,
        meta: dict[str, Any] | None = None,
    ) -> None:
        event = {
            "type": "access_event",
            "event_id": str(uuid.uuid4()),
            "ts": int(time.time()),
            "door_id": str(self.cfg.door_id),
            "result": result,
            "error_code": int(error_code),
            "key_id": str(key_id) if key_id else UUID_NIL,
            "grant_id": str(grant_id) if grant_id else UUID_NIL,
            "meta": meta or {},
        }
        await self.doorlink_send(event)

    async def emit_intrusion_alert(self, key_id: uuid.UUID) -> None:
        alert = {
            "type": "access_event",
            "event_id": str(uuid.uuid4()),
            "ts": int(time.time()),
            "door_id": str(self.cfg.door_id),
            "result": "fail",
            "error_code": ERR_HMAC_INVALID,
            "key_id": str(key_id),
            "grant_id": UUID_NIL,
            "meta": {"reason": "intrusion_detected", "rule": "3_failures_5min"},
        }
        await self.doorlink_send(alert)

    async def _send_hello(self) -> None:
        if self.doorlink_ws is None:
            return
        hello = {
            "type": "hello",
            "door_id": str(self.cfg.door_id),
            "fw_version": self.cfg.fw_version,
            "capabilities": {"ble": True, "uwb": False, "bg_unlock": False},
            "last_sync_seq": self.last_sync_seq,
            "door_time": int(time.time()),
        }
        await self.doorlink_ws.send(json.dumps(hello))

    async def _send_ack(self, seq: int) -> None:
        if self.doorlink_ws is None:
            return
        ack = {"type": "ack", "seq": seq, "door_id": str(self.cfg.door_id)}
        await self.doorlink_ws.send(json.dumps(ack))

    async def _handle_grant_replace(self, msg: dict[str, Any]) -> None:
        msg_door_id = msg.get("door_id")
        if msg_door_id and msg_door_id != str(self.cfg.door_id):
            logging.warning("grant_replace ignored for other door_id=%s", msg_door_id)
            return
        seq = int(msg["seq"])
        if seq <= self.last_sync_seq:
            return

        next_grants: dict[str, Grant] = {}
        for item in msg.get("grants", []):
            grant = Grant.from_wire(item)
            next_grants[grant.key_id] = grant

        self.grants_by_key = next_grants
        self.last_sync_seq = seq
        self._persist()
        await self._send_ack(seq)
        logging.info("grant_replace applied seq=%s total_grants=%s", seq, len(self.grants_by_key))

    async def _handle_grant_delta(self, msg: dict[str, Any]) -> None:
        msg_door_id = msg.get("door_id")
        if msg_door_id and msg_door_id != str(self.cfg.door_id):
            logging.warning("grant_delta ignored for other door_id=%s", msg_door_id)
            return
        seq = int(msg["seq"])
        if seq <= self.last_sync_seq:
            return

        # Strict order required by spec.
        expected = self.last_sync_seq + 1
        if seq != expected:
            raise RuntimeError(f"Grant delta out of order: got={seq} expected={expected}")

        for item in msg.get("add", []):
            grant = Grant.from_wire(item)
            self.grants_by_key[grant.key_id] = grant

        for item in msg.get("remove", []):
            rid = str(uuid.UUID(item["grant_id"]))
            keys_to_delete = [k for k, g in self.grants_by_key.items() if g.grant_id == rid]
            for key in keys_to_delete:
                del self.grants_by_key[key]

        self.last_sync_seq = seq
        self._persist()
        await self._send_ack(seq)
        logging.info("grant_delta applied seq=%s total_grants=%s", seq, len(self.grants_by_key))

    async def doorlink_loop(self) -> None:
        backoff = 1
        while True:
            headers: dict[str, str] = {}
            if self.cfg.door_api_token:
                headers["Authorization"] = f"Bearer {self.cfg.door_api_token}"

            kwargs = {
                "ping_interval": 30,
                "ping_timeout": 90,
                "max_size": 8192,
            }

            try:
                try:
                    connect_cm = websockets.connect(
                        self.cfg.doorlink_url,
                        additional_headers=headers if headers else None,
                        **kwargs,
                    )
                except TypeError:
                    connect_cm = websockets.connect(
                        self.cfg.doorlink_url,
                        extra_headers=headers if headers else None,
                        **kwargs,
                    )

                async with connect_cm as ws:
                    self.doorlink_ws = ws
                    backoff = 1
                    logging.info("DoorLink connected: %s", self.cfg.doorlink_url)
                    await self._send_hello()
                    await self.flush_pending_events()

                    async for raw in ws:
                        msg = json.loads(raw)
                        msg_type = msg.get("type")

                        if msg_type == "welcome":
                            logging.info("WELCOME: %s", msg)
                            continue
                        if msg_type == "grant_replace":
                            await self._handle_grant_replace(msg)
                            continue
                        if msg_type == "grant_delta":
                            await self._handle_grant_delta(msg)
                            continue

                        logging.warning("DoorLink message ignored: %s", msg_type)

            except Exception as exc:
                logging.warning("DoorLink disconnected: %s", exc)
            finally:
                self.doorlink_ws = None

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)

    # ---------- BLE ControlPoint ----------
    def on_controlpoint_write(self, value: bytes, _options: Any = None) -> None:
        raw = bytes(value)
        self.loop.call_soon_threadsafe(lambda: asyncio.create_task(self.handle_controlpoint(raw)))

    async def handle_controlpoint(self, raw: bytes) -> None:
        try:
            opcode = raw[0]
            tlv = self.tlv_unpack(raw[1:])
        except Exception:
            self.notify_result(False, ERR_INTERNAL)
            return

        if opcode == OP_GET_CHALLENGE:
            nonce = self.new_nonce()
            self.notify_challenge(nonce)
            logging.info("BLE GET_CHALLENGE -> nonce issued")
            return

        if opcode != OP_AUTHENTICATE:
            self.notify_result(False, ERR_INTERNAL)
            return

        try:
            key_id = uuid.UUID(bytes=tlv[TLV_KEY_ID])
            nonce = tlv[TLV_NONCE]
            mac = tlv[TLV_MAC]
            grant_id = uuid.UUID(bytes=tlv[TLV_GRANT_ID]) if TLV_GRANT_ID in tlv else None
            if len(nonce) != 32 or len(mac) != 32:
                raise ValueError("Invalid nonce/mac length")
        except Exception:
            self.notify_result(False, ERR_INTERNAL)
            return

        ok_nonce, err_nonce = self.consume_nonce(nonce)
        if not ok_nonce:
            self.notify_result(False, err_nonce)
            await self.emit_access_event(
                "fail",
                err_nonce,
                key_id=key_id,
                grant_id=grant_id,
                meta={"reason": "nonce_invalid"},
            )
            return

        ok_grant, err_grant, grant = self.check_grant_valid(str(key_id))
        if not ok_grant or grant is None:
            self.notify_result(False, err_grant)
            await self.emit_access_event(
                "fail",
                err_grant,
                key_id=key_id,
                grant_id=grant_id,
                meta={"reason": "grant_invalid"},
            )
            return

        if grant_id is not None and grant.grant_id != str(grant_id):
            self.notify_result(False, ERR_GRANT_MISMATCH)
            await self.emit_access_event(
                "fail",
                ERR_GRANT_MISMATCH,
                key_id=key_id,
                grant_id=grant_id,
                meta={"reason": "grant_mismatch"},
            )
            return

        msg = self._msg_for_hmac(nonce, key_id)
        expected = self._hmac_sha256(grant.secret_door, msg)
        if not hmac.compare_digest(mac, expected):
            self.notify_result(False, ERR_HMAC_INVALID)
            await self.emit_access_event(
                "fail",
                ERR_HMAC_INVALID,
                key_id=key_id,
                grant_id=uuid.UUID(grant.grant_id),
                meta={"reason": "hmac_invalid"},
            )
            if self.record_hmac_failure(str(key_id)):
                await self.emit_intrusion_alert(key_id)
            return

        opened = await self.actuate_open()
        if not opened:
            self.notify_result(False, ERR_DOOR_BUSY)
            await self.emit_access_event(
                "fail",
                ERR_DOOR_BUSY,
                key_id=key_id,
                grant_id=uuid.UUID(grant.grant_id),
                meta={"reason": "cooldown"},
            )
            return

        event_id = uuid.uuid4()
        self.notify_result(True, ERR_OK, open_ms=self.cfg.open_ms, event_id=event_id)
        await self.emit_access_event(
            "success",
            ERR_OK,
            key_id=key_id,
            grant_id=uuid.UUID(grant.grant_id),
            meta={"reason": "hmac_ok"},
        )
        logging.info("AUTHENTICATE success key_id=%s grant_id=%s", key_id, grant.grant_id)

    # ---------- BLE server ----------
    def _characteristic_flags(self, base_flags: list[str]) -> list[str]:
        if not self.cfg.ble_require_encryption:
            return base_flags
        # BlueZ flag names used by D-Bus GATT API.
        if "read" in base_flags:
            return [*base_flags, "encrypt-read"]
        if "write" in base_flags or "write-without-response" in base_flags:
            return [*base_flags, "encrypt-authenticated-write"]
        return base_flags

    def _resolve_adapter_address(self) -> str | None:
        if self.cfg.ble_adapter_address:
            return self.cfg.ble_adapter_address
        try:
            adapters = adapter.Adapter.available()
            if adapters:
                first = adapters[0]
                # bluezero objects expose adapter MAC as `.address`
                addr = getattr(first, "address", None)
                if isinstance(addr, str) and addr:
                    return addr
        except Exception as exc:
            logging.warning("Unable to discover BLE adapter automatically: %s", exc)
        return None

    def _build_peripheral(self) -> peripheral.Peripheral:
        ctor = peripheral.Peripheral
        params = inspect.signature(ctor).parameters

        # bluezero API differs across versions/distributions.
        if "adapter_addr" in params:
            return ctor(adapter_addr=None, local_name=self.cfg.ble_local_name, appearance=0)
        if "adapter_address" in params:
            adapter_address = self._resolve_adapter_address()
            if not adapter_address:
                raise RuntimeError(
                    "No BLE adapter found. Set BLE_ADAPTER_ADDRESS (example: AA:BB:CC:DD:EE:FF)."
                )
            logging.info("Using BLE adapter address: %s", adapter_address)
            return ctor(adapter_address=adapter_address, local_name=self.cfg.ble_local_name, appearance=0)
        if "local_name" in params:
            try:
                return ctor(local_name=self.cfg.ble_local_name, appearance=0)
            except TypeError:
                return ctor(local_name=self.cfg.ble_local_name)
        return ctor(self.cfg.ble_local_name)

    def make_gatt(self) -> peripheral.Peripheral:
        door = self._build_peripheral()
        door.add_service(srv_id=1, uuid=SVC_DOORACCESS, primary=True)

        door.add_characteristic(
            srv_id=1,
            chr_id=1,
            uuid=CHAR_INFO,
            value=self.info_read(),
            notifying=False,
            flags=self._characteristic_flags(["read"]),
            read_callback=self.info_read,
        )

        self.status_char = door.add_characteristic(
            srv_id=1,
            chr_id=2,
            uuid=CHAR_STATUS,
            value=b"",
            notifying=True,
            flags=["notify"],
        )

        door.add_characteristic(
            srv_id=1,
            chr_id=3,
            uuid=CHAR_CONTROLPOINT,
            value=b"",
            notifying=False,
            flags=self._characteristic_flags(["write", "write-without-response"]),
            write_callback=self.on_controlpoint_write,
        )
        return door

    async def run(self) -> None:
        self.print_ble_profile()

        gatt = self.make_gatt()
        gatt.publish()
        logging.info("BLE service published.")

        asyncio.create_task(self.doorlink_loop())

        while True:
            await asyncio.sleep(1)

    def shutdown(self) -> None:
        self.led.cleanup()


def configure_logging() -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(message)s",
    )


async def main() -> None:
    configure_logging()
    cfg = Config.from_env()
    agent = DoorAgent(cfg)
    try:
        await agent.run()
    finally:
        agent.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
