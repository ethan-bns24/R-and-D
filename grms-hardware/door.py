#!/usr/bin/env python3
import asyncio
import base64
import hmac
import hashlib
import os
import struct
import time
import json
import uuid
from collections import deque, defaultdict

import RPi.GPIO as GPIO
import websockets

from bluezero import peripheral

# =======================
# Config (à adapter)
# =======================
DOOR_ID = uuid.UUID("11111111-2222-3333-4444-555555555555")  # UUID v4 en prod
PROTO_VERSION = 0x01
CAPABILITIES = 0b0000_0000_0000_0001  # bit0=BLE true (cf doc)

LED_GPIO = 17
OPEN_MS = 600  # impulsion "12V" simulée => LED ON
OPEN_COOLDOWN_SEC = 1.0  # anti double-impulsion
NONCE_TTL_SEC = 30  # TTL nonce (doc: 30s max)
TIME_TOLERANCE_SEC = 120  # dérive horloge tolérée (doc ±120s)

# Intrusion: 3 échecs HMAC en 5 min
INTRUSION_WINDOW_SEC = 5 * 60
INTRUSION_THRESHOLD = 3

# DoorLink WebSocket (porte <-> backend)
DOORLINK_URL = "ws://192.168.1.50:8765"  # wss en prod
DOOR_API_TOKEN = "door-token-mvp"  # en prod: mTLS ou token par porte

# =======================
# UUIDs GATT (doc)
# =======================
SVC_DOORACCESS = "C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C"
CHAR_CONTROLPOINT = "C0DE0002-3F2A-4E9B-9B1E-0A8C2D3A4B5C"  # WRITE/WITH_RESPONSE
CHAR_STATUS = "C0DE0003-3F2A-4E9B-9B1E-0A8C2D3A4B5C"        # NOTIFY
CHAR_INFO = "C0DE0004-3F2A-4E9B-9B1E-0A8C2D3A4B5C"          # READ

# =======================
# TLV helpers (binaire)
# =======================
def tlv_pack(items):
    """items: list[(t:int, v:bytes)] -> bytes"""
    out = bytearray()
    for t, v in items:
        if not (0 <= t <= 255):
            raise ValueError("TLV type out of range")
        if len(v) > 255:
            raise ValueError("TLV value too long for MVP")
        out += bytes([t, len(v)]) + v
    return bytes(out)

def tlv_unpack(buf):
    """bytes -> dict[type:int]=bytes"""
    d = {}
    i = 0
    n = len(buf)
    while i + 2 <= n:
        t = buf[i]
        l = buf[i + 1]
        i += 2
        if i + l > n:
            raise ValueError("Bad TLV length")
        d[t] = buf[i:i + l]
        i += l
    if i != n:
        raise ValueError("Trailing bytes in TLV")
    return d

def u16be(x): return struct.pack(">H", x)
def i64be(x): return struct.pack(">q", int(x))
def uuid_bytes(u: uuid.UUID): return u.bytes  # 16 bytes

# =======================
# Door state
# =======================
GPIO.setmode(GPIO.BCM)
GPIO.setup(LED_GPIO, GPIO.OUT)
GPIO.output(LED_GPIO, GPIO.LOW)

last_open_ts = 0.0

# Nonces anti-rejeu: nonce_hex -> expiry_ts
nonce_cache = {}

# rate limiting / intrusion tracking
failures_by_key = defaultdict(deque)  # key_id(str) -> deque[timestamps]

# Grants cache: key_id(UUID str) -> dict(grant_id, from_ts, to_ts, secret_door(bytes))
# (secret_door est poussé par backend via DoorLink, base64, cf doc)
grants = {}

# doorlink sequencing
last_sync_seq = 0

# GATT notify handle (set later)
_status_char = None

# =======================
# Crypto: HMAC-SHA256
# =======================
def hmac_sha256(key: bytes, msg: bytes) -> bytes:
    return hmac.new(key, msg, hashlib.sha256).digest()

def msg_for_mac(nonce: bytes, door_id: uuid.UUID, key_id: uuid.UUID, version: int) -> bytes:
    # doc: msg = nonce || door_id || key_id || version
    return nonce + door_id.bytes + key_id.bytes + bytes([version])

# =======================
# Nonce management
# =======================
def purge_nonce_cache(now=None):
    now = now or time.time()
    expired = [k for k, exp in nonce_cache.items() if exp <= now]
    for k in expired:
        del nonce_cache[k]

def new_challenge_nonce() -> bytes:
    purge_nonce_cache()
    nonce = os.urandom(32)  # doc: 32 bytes recommandé
    nonce_cache[nonce.hex()] = time.time() + NONCE_TTL_SEC
    return nonce

def is_nonce_valid_and_fresh(nonce: bytes) -> (bool, int):
    # returns (ok, error_code)
    purge_nonce_cache()
    hx = nonce.hex()
    exp = nonce_cache.get(hx)
    if exp is None:
        # soit timeout, soit pas un challenge émis
        return False, 0x0004  # NONCE_TIMEOUT (doc annexe)
    if exp <= time.time():
        del nonce_cache[hx]
        return False, 0x0004
    # nonce est "réservé" une seule fois -> si auth ok/ko on le consomme
    del nonce_cache[hx]
    return True, 0x0000

# =======================
# Logging / DoorLink
# =======================
doorlink_ws = None

async def doorlink_send(msg: dict):
    global doorlink_ws
    if doorlink_ws is None:
        return
    try:
        await doorlink_ws.send(json.dumps(msg))
    except Exception:
        # si erreur, on laissera la boucle reconnecter
        pass

async def emit_access_event(result: str, error_code: int, key_id=None, grant_id=None, meta=None):
    ev = {
        "type": "access_event",
        "event_id": str(uuid.uuid4()),
        "ts": int(time.time()),
        "door_id": str(DOOR_ID),
        "result": result,
        "error_code": int(error_code),
        "key_id": str(key_id) if key_id else None,
        "grant_id": str(grant_id) if grant_id else None,
        "meta": meta or {}
    }
    await doorlink_send(ev)

async def emit_alert(key_id: uuid.UUID, reason: str):
    msg = {
        "type": "alert",
        "ts": int(time.time()),
        "door_id": str(DOOR_ID),
        "key_id": str(key_id),
        "reason": reason
    }
    await doorlink_send(msg)

# =======================
# Door actuation (LED)
# =======================
def open_door_led():
    global last_open_ts
    now = time.time()
    if now - last_open_ts < OPEN_COOLDOWN_SEC:
        return False
    last_open_ts = now
    GPIO.output(LED_GPIO, GPIO.HIGH)
    time.sleep(OPEN_MS / 1000.0)
    GPIO.output(LED_GPIO, GPIO.LOW)
    return True

# =======================
# GATT Status notify
# =======================
def status_notify(payload: bytes):
    global _status_char
    if _status_char is None:
        return
    _status_char.set_value(payload)
    _status_char.notify = True  # bluezero triggers notify on change

def notify_challenge(nonce: bytes):
    # Type 0x81 CHALLENGE
    payload = tlv_pack([
        (0x12, nonce),
        (0x04, i64be(int(time.time()))),
    ])
    status_notify(bytes([0x81]) + payload)

def notify_result(is_success: bool, error_code: int, open_ms: int = 0, event_id: uuid.UUID = None):
    # Type 0x82 RESULT
    items = [
        (0x20, bytes([1 if is_success else 0])),
        (0x21, u16be(error_code)),
    ]
    if is_success:
        items.append((0x22, u16be(open_ms)))
    if event_id:
        items.append((0x23, event_id.bytes))
    payload = tlv_pack(items)
    status_notify(bytes([0x82]) + payload)

# =======================
# Access checks
# =======================
def check_grant_valid(key_id: uuid.UUID) -> (bool, int, dict):
    g = grants.get(str(key_id))
    if not g:
        return False, 0x0001, None  # UNKNOWN_KEY
    now = int(time.time())
    if now < g["from_ts"]:
        return False, 0x0003, g  # NOT_YET_VALID
    if now > g["to_ts"]:
        return False, 0x0002, g  # GRANT_EXPIRED
    return True, 0x0000, g

def record_failure_and_check_intrusion(key_id: uuid.UUID) -> bool:
    dq = failures_by_key[str(key_id)]
    now = time.time()
    # purge old
    while dq and (now - dq[0]) > INTRUSION_WINDOW_SEC:
        dq.popleft()
    dq.append(now)
    return len(dq) >= INTRUSION_THRESHOLD

# =======================
# ControlPoint write handler
# =======================
def on_controlpoint_write(value: bytes, options):
    """
    ControlPoint payload = opcode (1 byte) + TLV
    opcodes doc:
      0x01 GET_CHALLENGE
      0x02 AUTHENTICATE
    """
    try:
        opcode = value[0]
        tlv = tlv_unpack(value[1:])
    except Exception:
        notify_result(False, 0x0009)  # INTERNAL_ERROR
        return

    if opcode == 0x01:  # GET_CHALLENGE
        # optional key_id (0x10)
        nonce = new_challenge_nonce()
        notify_challenge(nonce)
        return

    if opcode == 0x02:  # AUTHENTICATE
        try:
            key_id = uuid.UUID(bytes=tlv[0x10])        # required
            nonce = tlv[0x12]                          # required
            mac = tlv[0x13]                            # required 32 bytes
            grant_id = uuid.UUID(bytes=tlv[0x14]) if 0x14 in tlv else None
        except Exception:
            notify_result(False, 0x0009)
            return

        # nonce checks (TTL + non reuse)
        ok_nonce, err_nonce = is_nonce_valid_and_fresh(nonce)
        if not ok_nonce:
            # NONCE_TIMEOUT or reused/unknown
            notify_result(False, err_nonce)
            asyncio.get_event_loop().create_task(
                emit_access_event("fail", err_nonce, key_id=key_id, grant_id=grant_id,
                                  meta={"reason": "nonce_invalid"})
            )
            return

        # grant validity (door has local cache from DoorLink)
        ok_grant, err_grant, g = check_grant_valid(key_id)
        if not ok_grant:
            notify_result(False, err_grant)
            asyncio.get_event_loop().create_task(
                emit_access_event("fail", err_grant, key_id=key_id, grant_id=grant_id,
                                  meta={"reason": "grant_invalid"})
            )
            return

        # verify HMAC
        secret_door = g["secret_door"]
        msg = msg_for_mac(nonce, DOOR_ID, key_id, PROTO_VERSION)
        expected_mac = hmac_sha256(secret_door, msg)

        if not hmac.compare_digest(mac, expected_mac):
            err = 0x0006  # HMAC_INVALID
            notify_result(False, err)
            asyncio.get_event_loop().create_task(
                emit_access_event("fail", err, key_id=key_id, grant_id=grant_id,
                                  meta={"reason": "hmac_invalid"})
            )
            # intrusion rule
            if record_failure_and_check_intrusion(key_id):
                asyncio.get_event_loop().create_task(
                    emit_alert(key_id, reason="3_failures_5min")
                )
            return

        # OK -> open (LED)
        opened = open_door_led()
        if not opened:
            # door busy/cooldown
            err = 0x0008  # DOOR_BUSY
            notify_result(False, err)
            asyncio.get_event_loop().create_task(
                emit_access_event("fail", err, key_id=key_id, grant_id=grant_id,
                                  meta={"reason": "cooldown"})
            )
            return

        notify_result(True, 0x0000, open_ms=OPEN_MS, event_id=uuid.uuid4())
        asyncio.get_event_loop().create_task(
            emit_access_event("success", 0x0000, key_id=key_id, grant_id=grant_id,
                              meta={"reason": "hmac_ok"})
        )
        return

    # unknown opcode
    notify_result(False, 0x0009)

# =======================
# GATT Info read handler
# =======================
def info_read():
    # TLV:
    # 0x01 door_id (16)
    # 0x02 proto_version (1)
    # 0x03 capabilities (2)
    # 0x04 door_time (8)
    payload = tlv_pack([
        (0x01, DOOR_ID.bytes),
        (0x02, bytes([PROTO_VERSION])),
        (0x03, struct.pack(">H", CAPABILITIES)),
        (0x04, i64be(int(time.time()))),
    ])
    return payload

# =======================
# DoorLink client (WebSocket)
# =======================
async def doorlink_loop():
    global doorlink_ws, last_sync_seq, grants
    backoff = 1
    while True:
        try:
            async with websockets.connect(
                DOORLINK_URL,
                extra_headers={"Authorization": f"Bearer {DOOR_API_TOKEN}"}
            ) as ws:
                doorlink_ws = ws
                backoff = 1

                # HELLO (doc)
                hello = {
                    "type": "hello",
                    "door_id": str(DOOR_ID),
                    "fw_version": "1.0.0-mvp",
                    "capabilities": {"ble": True, "uwb": False, "bg_unlock": False},
                    "last_sync_seq": last_sync_seq,
                    "door_time": int(time.time())
                }
                await ws.send(json.dumps(hello))

                async for raw in ws:
                    msg = json.loads(raw)
                    t = msg.get("type")

                    if t == "welcome":
                        # server_time, config_version, sync mode...
                        continue

                    if t == "grant_replace":
                        # snapshot complet
                        seq = int(msg["seq"])
                        if seq <= last_sync_seq:
                            continue
                        new_grants = {}
                        for it in msg.get("grants", []):
                            key_id = it["key_id"]
                            new_grants[key_id] = {
                                "grant_id": it["grant_id"],
                                "from_ts": int(it["from_ts"]),
                                "to_ts": int(it["to_ts"]),
                                "secret_door": base64.b64decode(it["secret_door_b64"]),
                            }
                        grants = new_grants
                        last_sync_seq = seq
                        await ws.send(json.dumps({"type": "ack", "seq": seq, "door_id": str(DOOR_ID)}))
                        continue

                    if t == "grant_delta":
                        seq = int(msg["seq"])
                        if seq <= last_sync_seq:
                            continue
                        # apply add/remove
                        for it in msg.get("add", []):
                            grants[it["key_id"]] = {
                                "grant_id": it["grant_id"],
                                "from_ts": int(it["from_ts"]),
                                "to_ts": int(it["to_ts"]),
                                "secret_door": base64.b64decode(it["secret_door_b64"]),
                            }
                        for it in msg.get("remove", []):
                            # remove by grant_id
                            rid = it["grant_id"]
                            for k in list(grants.keys()):
                                if grants[k]["grant_id"] == rid:
                                    del grants[k]
                        last_sync_seq = seq
                        await ws.send(json.dumps({"type": "ack", "seq": seq, "door_id": str(DOOR_ID)}))
                        continue

        except Exception:
            doorlink_ws = None
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)

# =======================
# GATT peripheral setup
# =======================
def make_gatt():
    global _status_char

    door = peripheral.Peripheral(adapter_addr=None, local_name="DoorAccess-MVP", appearance=0)
    door.add_service(srv_id=1, uuid=SVC_DOORACCESS, primary=True)

    # Info (READ)
    door.add_characteristic(
        srv_id=1, chr_id=1, uuid=CHAR_INFO,
        value=info_read(),
        notifying=False,
        flags=["read"],
        read_callback=lambda: info_read()
    )

    # Status (NOTIFY)
    _status_char = door.add_characteristic(
        srv_id=1, chr_id=2, uuid=CHAR_STATUS,
        value=b"",
        notifying=True,
        flags=["notify"]
    )

    # ControlPoint (WRITE/WITH_RESPONSE)
    door.add_characteristic(
        srv_id=1, chr_id=3, uuid=CHAR_CONTROLPOINT,
        value=b"",
        notifying=False,
        flags=["write", "write-without-response"],
        write_callback=on_controlpoint_write
    )

    return door

# =======================
# Main
# =======================
async def main():
    print("Starting Door GATT + DoorLink...")
    door = make_gatt()
    door.publish()

    # DoorLink websocket loop
    asyncio.create_task(doorlink_loop())

    # keep alive
    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        GPIO.output(LED_GPIO, GPIO.LOW)
        GPIO.cleanup()
