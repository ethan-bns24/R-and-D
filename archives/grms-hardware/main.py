#!/usr/bin/env python3
"""
GRMS Hardware Door Simulator
=============================

Connects to the GRMS API DoorLink WebSocket server as a door CLIENT.

Architecture
------------
  1. Opens a persistent WebSocket to ws://localhost:4001 (Go DoorLink server)
  2. Sends HELLO, receives WELCOME + GRANT_REPLACE / GRANT_DELTA
  3. Stores authorised grants in a local in-memory cache
  4. Interactive CLI lets you simulate a user presenting their key_id (UUID) via BLE
  5. Door verifies locally (time window) and sends ACCESS_EVENT back via WebSocket
  6. Sends structured log entries to POST /v1/doors/logs

Usage
-----
  DOOR_ID=<uuid> python main.py

Environment variables
---------------------
  DOOR_ID       UUID of this door in the GRMS database   (default: 00000000-…-0001)
  DOOR_TOKEN    Bearer token for the door API calls      (default: door-token-mvp)
  API_BASE      REST API base URL                        (default: http://localhost:4000)
  DOORLINK_URL  DoorLink WebSocket URL                   (default: ws://localhost:4001)
"""

import asyncio
import base64
import json
import logging
import os
import sys
import time
import uuid
from dataclasses import dataclass
from typing import Optional

import httpx
import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

DOOR_ID      = os.getenv("DOOR_ID",       "550e8400-e29b-41d4-a716-446655440010")
DOOR_TOKEN   = os.getenv("DOOR_TOKEN",    "door-token-mvp")
API_BASE     = os.getenv("API_BASE",      "http://localhost:4000")
DOORLINK_URL = os.getenv("DOORLINK_URL",  "ws://localhost:4001")

FW_VERSION    = "1.0.0"
PING_INTERVAL = 30   # seconds between WebSocket pings
RECONNECT_MIN = 2    # initial reconnect delay (seconds)
RECONNECT_MAX = 60   # maximum reconnect delay (seconds)

# BLE error codes — must match domain/event.go constants
ERR_OK            = 0x0000  # success
ERR_UNKNOWN_KEY   = 0x0001  # key_id not in grant cache
ERR_GRANT_EXPIRED = 0x0002  # grant has passed to_ts
ERR_NOT_YET_VALID = 0x0003  # grant has not reached from_ts

UUID_NIL = "00000000-0000-0000-0000-000000000000"

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("door-sim")

# ─────────────────────────────────────────────────────────────────────────────
# Grant Cache
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CachedGrant:
    key_id:      str
    grant_id:    str
    from_ts:     int
    to_ts:       int
    secret_door: bytes   # decoded from base64

# grant_id → CachedGrant
_grant_cache: dict[str, CachedGrant] = {}
_last_seq:    int = 0
_quit_event:  Optional[asyncio.Event] = None

# ─────────────────────────────────────────────────────────────────────────────
# REST Logging Helper
# ─────────────────────────────────────────────────────────────────────────────

async def post_log(level: str, message: str, meta: dict | None = None) -> None:
    """Fire-and-forget: POST a structured log entry to /v1/doors/logs."""
    payload = {
        "door_id": DOOR_ID,
        "level":   level,
        "message": message,
        "ts":      int(time.time()),
        "meta":    meta or {},
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{API_BASE}/v1/doors/logs",
                json=payload,
                headers={"Authorization": f"Bearer {DOOR_TOKEN}"},
            )
            if resp.status_code not in (200, 201, 204):
                log.debug(f"Log endpoint returned {resp.status_code}")
    except Exception as e:
        log.debug(f"Failed to post log: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Grant Cache Management
# ─────────────────────────────────────────────────────────────────────────────

def apply_grant_replace(msg: dict) -> None:
    global _grant_cache, _last_seq
    _grant_cache.clear()
    for g in msg.get("grants", []):
        _grant_cache[g["grant_id"]] = CachedGrant(
            key_id=g["key_id"],
            grant_id=g["grant_id"],
            from_ts=g["from_ts"],
            to_ts=g["to_ts"],
            secret_door=base64.b64decode(g["secret_door_b64"]),
        )
    _last_seq = msg.get("seq", _last_seq)
    log.info(f"Cache replaced: {len(_grant_cache)} grants (seq={_last_seq})")


def apply_grant_delta(msg: dict) -> None:
    global _grant_cache, _last_seq
    removed = sum(
        1 for e in msg.get("remove", [])
        if _grant_cache.pop(e["grant_id"], None) is not None
    )
    added = 0
    for g in msg.get("add", []):
        _grant_cache[g["grant_id"]] = CachedGrant(
            key_id=g["key_id"],
            grant_id=g["grant_id"],
            from_ts=g["from_ts"],
            to_ts=g["to_ts"],
            secret_door=base64.b64decode(g["secret_door_b64"]),
        )
        added += 1
    _last_seq = msg.get("seq", _last_seq)
    log.info(f"Cache delta: +{added} -{removed} → {len(_grant_cache)} total (seq={_last_seq})")

# ─────────────────────────────────────────────────────────────────────────────
# Access Verification
# ─────────────────────────────────────────────────────────────────────────────

def _find_grant_by_key_id(key_id: str) -> Optional[CachedGrant]:
    for g in _grant_cache.values():
        if g.key_id == key_id:
            return g
    return None


def verify_access(key_id: str) -> tuple[bool, int, Optional[CachedGrant]]:
    """
    Check if key_id is allowed to open this door right now.
    Returns (granted: bool, error_code: int, grant: CachedGrant | None)
    error_code values match domain/event.go BLE error constants.
    """
    now = int(time.time())
    grant = _find_grant_by_key_id(key_id)
    if grant is None:
        return False, ERR_UNKNOWN_KEY, None
    if now < grant.from_ts:
        return False, ERR_NOT_YET_VALID, grant
    if now > grant.to_ts:
        return False, ERR_GRANT_EXPIRED, grant
    return True, ERR_OK, grant

# ─────────────────────────────────────────────────────────────────────────────
# DoorLink Protocol Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def send_hello(ws) -> None:
    msg = {
        "type":          "hello",
        "door_id":       DOOR_ID,
        "fw_version":    FW_VERSION,
        "capabilities":  {"ble": True, "uwb": False, "bg_unlock": False},
        "last_sync_seq": _last_seq,
        "door_time":     int(time.time()),
    }
    await ws.send(json.dumps(msg))
    log.info(f"→ HELLO sent  (door_id={DOOR_ID}, seq={_last_seq})")


async def wait_for_welcome(ws) -> dict:
    raw = await asyncio.wait_for(ws.recv(), timeout=10)
    msg = json.loads(raw)
    if msg.get("type") != "welcome":
        raise ValueError(f"Expected 'welcome', got: {msg.get('type')!r}")
    log.info(
        f"← WELCOME  config_version={msg.get('config_version')}  "
        f"sync={msg.get('sync', {}).get('mode')}"
    )
    return msg


async def send_ack(ws, seq: int) -> None:
    ack = {"type": "ack", "seq": seq, "door_id": DOOR_ID}
    await ws.send(json.dumps(ack))
    log.info(f"→ ACK seq={seq}")


async def send_access_event(
    ws,
    key_id:     str,
    result:     str,
    grant:      Optional[CachedGrant],
    error_code: int = 0,
) -> None:
    msg = {
        "type":       "access_event",
        "event_id":   str(uuid.uuid4()),
        "ts":         int(time.time()),
        "door_id":    DOOR_ID,
        "result":     result,          # "success" | "fail"
        "error_code": error_code,      # ERR_OK = 0, ERR_UNKNOWN_KEY = 1, …
        "key_id":     key_id,          # user UUID → stored as user_id in DB
        "grant_id":   grant.grant_id if grant else UUID_NIL,
        "meta":       {"source": "ble_sim"},
    }
    await ws.send(json.dumps(msg))
    log.info(f"→ ACCESS_EVENT  result={result}  key={key_id[:8]}…")

# ─────────────────────────────────────────────────────────────────────────────
# DoorLink Message Loop
# ─────────────────────────────────────────────────────────────────────────────

async def doorlink_loop(ws) -> None:
    """Receive and handle incoming DoorLink messages until connection closes."""
    async for raw in ws:
        msg = json.loads(raw)
        mtype = msg.get("type")

        if mtype == "grant_replace":
            apply_grant_replace(msg)
            await send_ack(ws, msg["seq"])
            await post_log("info", "Grant cache replaced", {"count": len(_grant_cache)})

        elif mtype == "grant_delta":
            apply_grant_delta(msg)
            await send_ack(ws, msg["seq"])

        else:
            log.debug(f"← Unhandled message type: {mtype!r}")

# ─────────────────────────────────────────────────────────────────────────────
# Interactive CLI
# ─────────────────────────────────────────────────────────────────────────────

_HELP = """
  Commands:
    <key_id>    Simulate BLE access with this user UUID
    list        Show cached grants
    status      Show door status
    help        Show this message
    q / exit    Quit
"""


def _print_grant_list() -> None:
    if not _grant_cache:
        print("  ⚠  Grant cache is EMPTY")
        return
    now = int(time.time())
    print(f"  Cached grants ({len(_grant_cache)}):")
    for g in _grant_cache.values():
        ok  = g.from_ts <= now <= g.to_ts
        ico = "✓" if ok else "✗"
        exp = time.strftime("%Y-%m-%d %H:%M", time.localtime(g.to_ts))
        print(f"    {ico}  grant={g.grant_id[:8]}…  key={g.key_id[:8]}…  expires={exp}")


async def cli_loop(ws) -> None:
    """Interactive prompt: type a key_id to simulate a BLE access attempt."""
    loop = asyncio.get_running_loop()
    print("\n" + "═" * 58)
    print("  GRMS DOOR SIMULATOR  –  BLE Access CLI")
    print(f"  Door : {DOOR_ID}")
    print("  Type 'help' for commands, 'q' to quit")
    print("═" * 58 + "\n")

    while True:
        try:
            sys.stdout.write("door> ")
            sys.stdout.flush()
            line = await loop.run_in_executor(None, sys.stdin.readline)
            line = line.strip()

            if not line:
                continue

            if line in ("q", "exit", "quit"):
                _quit_event.set()
                break

            if line == "help":
                print(_HELP)
                continue

            if line == "list":
                _print_grant_list()
                continue

            if line == "status":
                print(f"  door_id : {DOOR_ID}")
                print(f"  seq     : {_last_seq}")
                print(f"  grants  : {len(_grant_cache)}")
                continue

            # Validate that input looks like a UUID
            try:
                uuid.UUID(line)
            except ValueError:
                print(f"  ⚠  Not a valid UUID: {line!r}")
                continue

            # Treat input as a key_id (user UUID)
            key_id = line.lower()   # normalise to lowercase for consistency
            granted, err_code, grant = verify_access(key_id)
            result = "success" if granted else "fail"

            _ERR_LABELS = {
                ERR_OK:            "OK",
                ERR_UNKNOWN_KEY:   "UNKNOWN_KEY",
                ERR_GRANT_EXPIRED: "GRANT_EXPIRED",
                ERR_NOT_YET_VALID: "NOT_YET_VALID",
            }
            label = _ERR_LABELS.get(err_code, f"ERR_{err_code:#06x}")

            if granted:
                print(f"  ✓  ACCESS GRANTED  (key={key_id[:8]}…)")
            else:
                print(f"  ✗  ACCESS DENIED   (key={key_id[:8]}…  code={label})")

            await send_access_event(ws, key_id, result, grant, err_code)
            await post_log(
                "info" if granted else "warn",
                f"Access {result}",
                {"key_id": key_id, "error_code": err_code, "label": label},
            )

        except asyncio.CancelledError:
            break
        except EOFError:
            log.info("stdin EOF – running in headless mode")
            break
        except Exception as e:
            log.error(f"CLI error: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Main Connection Loop  (with exponential-backoff reconnection)
# ─────────────────────────────────────────────────────────────────────────────

async def run() -> None:
    global _quit_event
    _quit_event = asyncio.Event()

    reconnect_delay = RECONNECT_MIN

    while not _quit_event.is_set():
        try:
            log.info(f"Connecting to {DOORLINK_URL} …")
            async with websockets.connect(
                DOORLINK_URL,
                additional_headers={"Authorization": f"Bearer {DOOR_TOKEN}"},
                ping_interval=PING_INTERVAL,
                ping_timeout=10,
                open_timeout=10,
            ) as ws:
                reconnect_delay = RECONNECT_MIN  # reset on successful connect

                # ── Handshake ────────────────────────────────────────────────
                await send_hello(ws)
                await wait_for_welcome(ws)
                await post_log("info", "DoorLink connected", {"fw": FW_VERSION})

                # ── Run message loop + CLI concurrently ──────────────────────
                tasks = [
                    asyncio.ensure_future(doorlink_loop(ws)),
                    asyncio.ensure_future(cli_loop(ws)),
                ]
                done, pending = await asyncio.wait(
                    tasks, return_when=asyncio.FIRST_COMPLETED
                )
                for t in pending:
                    t.cancel()
                    try:
                        await t
                    except asyncio.CancelledError:
                        pass

                # Re-raise task exceptions so the outer handler can log them
                for t in done:
                    exc = t.exception()
                    if exc:
                        raise exc

        except ConnectionClosed as e:
            log.warning(f"Connection closed: code={e.code}")
            await post_log("warn", "Connection closed", {"code": str(e.code)})

        except (OSError, WebSocketException) as e:
            log.error(f"Connection failed: {e}")

        except asyncio.CancelledError:
            log.info("Cancelled – exiting.")
            break

        except Exception as e:
            log.error(f"Unexpected error: {e}", exc_info=True)

        if _quit_event.is_set():
            break

        log.info(f"Reconnecting in {reconnect_delay}s …")
        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, RECONNECT_MAX)


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\nBye!")