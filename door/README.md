# Door Agent — Smart Lock Hardware

> Embedded Python agent running on a **Raspberry Pi** (ARMv7 / ARM64).
> Exposes a BLE GATT peripheral for proximity authentication and maintains a persistent WebSocket connection to the GRMS backend via the **DoorLink** protocol.

---

## Table of Contents

1. [Overview](#overview)
2. [Hardware Requirements](#hardware-requirements)
3. [Architecture](#architecture)
4. [BLE GATT Profile](#ble-gatt-profile)
5. [Authentication Protocol](#authentication-protocol)
6. [Security Model](#security-model)
7. [DoorLink Protocol](#doorlink-protocol)
8. [Grant Synchronisation](#grant-synchronisation)
9. [GPIO Wiring](#gpio-wiring)
10. [State Persistence](#state-persistence)
11. [Deployment](#deployment)
12. [Configuration](#configuration)
13. [Logs and Debugging](#logs-and-debugging)

---

## Overview

The door agent is a **single Python file** (`door_agent.py`) that runs as an async event loop.
It simultaneously:

- **Advertises a BLE GATT server** (`DoorAccess` profile) that mobile apps connect to for challenge-response authentication
- **Maintains a WebSocket connection** to the GRMS backend to receive cryptographic grant updates and report access events
- **Controls GPIO pins** to physically actuate the door relay and drive status LEDs

Authentication is **fully offline-capable**: the agent stores all grants locally and can authenticate guests without any active network connection.

---

## Hardware Requirements

| Component | Details |
|---|---|
| SBC | Raspberry Pi 3/4/5 (ARMv7 or ARM64) |
| OS | Raspberry Pi OS (Bookworm / Bullseye), 64-bit recommended |
| Bluetooth | Built-in or USB BLE adapter (BlueZ 5.x) |
| D-Bus | Required for BlueZ GATT server (system bus) |
| GPIO | Standard 40-pin header |
| Relay | Any 5V relay module on a GPIO-controlled pin |
| LEDs | Two LEDs: green (open) and red (closed), with resistors |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    RASPBERRY PI                               │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  door_agent.py                          │  │
│  │                                                         │  │
│  │  ┌─────────────────┐    ┌────────────────────────────┐  │  │
│  │  │   DoorAgent     │    │       NearbyBLEScanner     │  │  │
│  │  │                 │    │  (optional, debug only)    │  │  │
│  │  │  - grant store  │    └────────────────────────────┘  │  │
│  │  │  - nonce cache  │                                    │  │
│  │  │  - intrusion    │    ┌────────────────────────────┐  │  │
│  │  │    detector     │    │       StateStore           │  │  │
│  │  │                 │    │  /data/door_state.json     │  │  │
│  │  └────────┬────────┘    └────────────────────────────┘  │  │
│  │           │                                             │  │
│  │    ┌──────┴──────────────────────┐                      │  │
│  │    │                             │                      │  │
│  │    v                             v                      │  │
│  │  ┌──────────────────┐   ┌──────────────────────────┐    │  │
│  │  │   BLE GATT       │   │   DoorLink WebSocket     │    │  │
│  │  │   Peripheral     │   │   Client                 │    │  │
│  │  │  (bluezero)      │   │  (websockets lib)        │    │  │
│  │  │                  │   │                          │    │  │
│  │  │  SVC_DOORACCESS  │   │  ws://grms-host:18000    │    │  │
│  │  │  CHAR_INFO       │   │  /doorlink/ws            │    │  │
│  │  │  CHAR_STATUS     │   │                          │    │  │
│  │  │  CHAR_CONTROLPT  │   │  --> hello / ack         │    │  │
│  │  └────────┬─────────┘   │  --> access_event        │    │  │
│  │           │             │  <-- welcome             │    │  │
│  │           │             │  <-- grant_replace/delta │    │  │
│  │           │             └──────────────────────────┘    │  │
│  └───────────│─────────────────────────────────────────────┘  │
│              │                                                │
│  ┌───────────┴────────────────────────────────────────────┐   │
│  │                   GPIO                                 │   │
│  │                                                        │   │
│  │  GPIO 17 ---- Green LED (door open / relay pulse)      │   │
│  │  GPIO 27 ---- Red LED   (door closed / idle)           │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
         | BLE                           | TCP
         v                               v
   Mobile App                     GRMS Backend
   (iOS / Android)                 (FastAPI)
```

---

## BLE GATT Profile

The door exposes a custom **DoorAccess GATT service**:

```
Service: DoorAccess
UUID: C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C
|
+-- CHAR_INFO       (READ)
|   UUID: C0DE0004-3F2A-4E9B-9B1E-0A8C2D3A4B5C
|   Payload: TLV-encoded door metadata
|   Fields:
|     TLV 0x01  door_id       (16 bytes UUID)
|     TLV 0x02  proto_version (1 byte)
|     TLV 0x03  capabilities  (2 bytes, big-endian)
|     TLV 0x04  door_time     (8 bytes, Unix timestamp, big-endian)
|
+-- CHAR_STATUS     (NOTIFY + READ)
|   UUID: C0DE0003-3F2A-4E9B-9B1E-0A8C2D3A4B5C
|   Carries async notifications to mobile:
|     EVT_CHALLENGE  0x81  + TLV(nonce) + TLV(door_time)
|     EVT_RESULT     0x82  + TLV(ok) + TLV(error_code) + TLV(open_ms)
|
+-- CHAR_CONTROLPOINT  (WRITE)
    UUID: C0DE0002-3F2A-4E9B-9B1E-0A8C2D3A4B5C
    Receives commands from mobile:
      OP_GET_CHALLENGE   0x01  (no body)
      OP_AUTHENTICATE    0x02  + TLV(key_id) + TLV(nonce) + TLV(mac) + TLV(grant_id)
```

### TLV encoding

All payloads use a simple **Type-Length-Value** binary encoding:

```
 0        1        2..2+L-1
+--------+--------+------------------+
|  Type  | Length |      Value       |
| 1 byte | 1 byte |    L bytes       |
+--------+--------+------------------+
```

### BLE advertisement

The door advertises with a local name derived from its `door_id`:

```
BLE Local Name:  DoorAccess-<first 8 hex chars of door_id>
Example:         DoorAccess-1a7d2ade
```

Mobile apps filter discovered devices by this name (using the BLE IDs returned by `/v1/mobile/grants`).

---

## Authentication Protocol

The unlock flow is a **2-round BLE challenge-response** using HMAC-SHA256:

```
  Mobile App (iOS)                          Door Agent (RPi)
       |                                          |
       |  1. Scan BLE, find DoorAccess-XXXX       |
       |----------------------------------------->|
       |  2. Connect GATT                          |
       |----------------------------------------->|
       |                                          |
       |  3. Discover services & characteristics  |
       |----------------------------------------->|
       |  4. Enable STATUS notifications          |
       |----------------------------------------->|
       |  5. Read CHAR_INFO (get door_id etc.)    |
       |----------------------------------------->|
       |  6. Validate door_id matches grant       |
       |                                          |
       |  7. Write OP_GET_CHALLENGE [0x01]        |
       |      to CHAR_CONTROLPOINT                |
       |----------------------------------------->|
       |                          8. Generate 32-byte random nonce
       |                          9. Store nonce with TTL (30s)
       |  10. STATUS NOTIFY: EVT_CHALLENGE [0x81] |
       |       TLV(0x12=nonce 32B)                |
       |<-----------------------------------------|
       |                                          |
       |  11. Derive secret_door locally:         |
       |       HKDF(secret_base, door_id, ...)    |
       |  12. Compute MAC:                        |
       |       HMAC-SHA256(secret_door,           |
       |         nonce || door_id ||              |
       |         key_id || proto_version)         |
       |                                          |
       |  13. Write OP_AUTHENTICATE [0x02]        |
       |       TLV(0x10=key_id 16B)               |
       |       TLV(0x12=nonce  32B)               |
       |       TLV(0x13=mac    32B)               |
       |       TLV(0x14=grant_id 16B)             |
       |      to CHAR_CONTROLPOINT                |
       |----------------------------------------->|
       |                          14. Consume nonce (replay-safe)
       |                          15. Look up grant by key_id
       |                          16. Check from_ts / to_ts
       |                          17. Verify grant_id matches
       |                          18. Verify HMAC (timing-safe)
       |                          19. Actuate relay for open_ms ms
       |  20. STATUS NOTIFY: EVT_RESULT [0x82]    |
       |       TLV(0x20=ok:1)                     |
       |       TLV(0x21=error:0x0000)             |
       |       TLV(0x22=open_ms)                  |
       |       TLV(0x23=event_id)                 |
       |<-----------------------------------------|
       |                          21. Emit access_event via DoorLink
       |  22. Disconnect BLE                      |
```

### Error codes

| Code     | Constant             | Meaning                                           |
|----------|----------------------|---------------------------------------------------|
| `0x0000` | `ERR_OK`             | Success                                           |
| `0x0001` | `ERR_UNKNOWN_KEY`    | key_id not found in local grant store             |
| `0x0002` | `ERR_GRANT_EXPIRED`  | Grant `to_ts` in the past                         |
| `0x0003` | `ERR_NOT_YET_VALID`  | Grant `from_ts` in the future                     |
| `0x0004` | `ERR_NONCE_TIMEOUT`  | Nonce expired (> 30s) or already consumed         |
| `0x0006` | `ERR_HMAC_INVALID`   | HMAC verification failed                          |
| `0x0007` | `ERR_GRANT_MISMATCH` | grant_id in packet does not match stored grant    |
| `0x0008` | `ERR_DOOR_BUSY`      | Cooldown active (too soon after previous opening) |
| `0x0009` | `ERR_INTERNAL`       | Parsing error or unexpected state                 |

---

## Security Model

### Nonce replay protection

```
+----------------------------------------------------------------+
|  Every GET_CHALLENGE request generates a fresh 32-byte nonce   |
|  (os.urandom), stored in a TTL cache with a 30-second expiry.  |
|                                                                |
|  On AUTHENTICATE:                                              |
|  1. Nonce must be present in cache (not expired)               |
|  2. Nonce is DELETED from cache immediately (single-use)       |
|                                                                |
|  Replay attacks are impossible: each nonce can only be used    |
|  once, within 30 seconds.                                      |
+----------------------------------------------------------------+
```

### HMAC verification

```
HMAC input message:
  nonce (32 bytes)
  || door_id (16 bytes UUID raw)
  || key_id  (16 bytes UUID raw)
  || proto_version (1 byte)

Key: secret_door derived via HKDF-SHA256 (see GRMS README)

Comparison: hmac.compare_digest()  --> timing-safe, no side-channel
```

### Intrusion detection

```
+----------------------------------------------------------------+
|  Per key_id sliding-window failure tracker:                    |
|                                                                |
|  INTRUSION_THRESHOLD = 3 failures                              |
|  INTRUSION_WINDOW    = 300 seconds (5 min)                     |
|                                                                |
|  If a key_id accumulates >= 3 HMAC failures in 5 minutes,      |
|  an intrusion alert is emitted to the GRMS backend:            |
|  { "reason": "intrusion_detected", "rule": "3_failures_5min" } |
+----------------------------------------------------------------+
```

### Grant time window enforcement

```
Grant is only valid if:
  grant.from_ts  <=  current_unix_time  <=  grant.to_ts

Checked on EVERY AUTHENTICATE request against local clock.
The door never accepts an expired or future-dated grant,
even if it is present in the local cache.
```

### Cooldown between openings

```
OPEN_COOLDOWN_SEC = 1.0  (default)

The relay cannot be triggered more than once per second.
Prevents mechanical stress and rapid-fire brute force via BLE.
```

### Optional BLE encryption

```
BLE_REQUIRE_ENCRYPTION = false  (default, for dev)

When set to true, BlueZ GATT characteristics are flagged with
"encrypt-read" and "encrypt-authenticated-write", requiring
the BLE link to be encrypted before any data exchange.
```

---

## DoorLink Protocol

The door connects to the GRMS backend via WebSocket and exchanges JSON messages.

### Startup sequence

```
  Door                         GRMS Backend
   |                                |
   |  WS connect                    |
   |  Authorization: Bearer <token> |
   |------------------------------->|
   |                                |
   |  { "type": "hello",            |
   |    "door_id": "...",           |
   |    "fw_version": "1.0.0",      |
   |    "capabilities": {...},      |
   |    "last_sync_seq": 0,         |
   |    "door_time": 1700000000 }   |
   |------------------------------->|
   |                                |
   |  { "type": "welcome", ... }    |
   |<-------------------------------|
   |                                |
   |  { "type": "grant_replace",    |
   |    "seq": 5,                   |
   |    "grants": [...] }           |
   |<-------------------------------|
   |                                |
   |  { "type": "ack", "seq": 5 }   |
   |------------------------------->|
```

### Reconnection with exponential backoff

```
Backoff: 1s --> 2s --> 4s --> 8s --> 16s --> 30s (capped)

Pending events (access_event) are queued locally in memory and
flushed as soon as the connection is re-established.
```

---

## Grant Synchronisation

```
                +------------------------------------------+
                |         GRMS Backend DB                  |
                |  AccessGrant table (active grants)       |
                +---------------------+--------------------+
                                      |
                       grant_replace (full sync on connect)
                       grant_delta   (incremental updates)
                                      |
                                      v
                +------------------------------------------+
                |         Door Agent (in memory)           |
                |  grants_by_key: { key_id --> Grant }     |
                |                                          |
                |  Grant {                                 |
                |    key_id:       UUID                    |
                |    grant_id:     UUID                    |
                |    from_ts:      int (Unix)              |
                |    to_ts:        int (Unix)              |
                |    secret_door:  bytes (32, HKDF)        |
                |  }                                       |
                +---------------------+--------------------+
                                      |
                               persisted to disk
                                      |
                                      v
                +------------------------------------------+
                |  /data/door_state.json                   |
                |  {                                       |
                |    "last_sync_seq": 42,                  |
                |    "grants": [...]                       |
                |  }                                       |
                +------------------------------------------+
```

Grant secrets (`secret_door`) are stored **only on the door** — the mobile app never receives them.

---

## GPIO Wiring

```
Raspberry Pi GPIO (BCM numbering)
---------------------------------------------------------------------------

  Pin 11  (GPIO 17) --[resistor]-- Green LED -- GND
                                   (door open indicator)
                                   Pulses HIGH for OPEN_MS ms on unlock

  Pin 13  (GPIO 27) --[resistor]-- Red LED   -- GND
                                   (door closed indicator)
                                   HIGH at idle, LOW during opening

  GPIO 17 also drives the relay coil:
    HIGH = relay energised = door latch retracted (open)
    LOW  = relay de-energised = door latch extended (closed)

Default state: GPIO 17 LOW, GPIO 27 HIGH  -->  door LOCKED
```

Adjust `LED_GPIO` and `LED_CLOSED_GPIO` in `.env` to match your wiring.

---

## State Persistence

The agent persists its grant store to disk at every sync ACK:

```json
{
  "last_sync_seq": 42,
  "grants": [
    {
      "key_id":          "uuid",
      "grant_id":        "uuid",
      "from_ts":         1700000000,
      "to_ts":           1700086400,
      "secret_door_b64": "<base64>"
    }
  ]
}
```

On startup the agent loads this file, allowing it to authenticate guests immediately even before the DoorLink WebSocket reconnects.

---

## Deployment

### Prerequisites

- Docker + Docker Compose (v2)
- Raspberry Pi with BlueZ and D-Bus configured

### Configure

```bash
cd door
cp .env.example .env
# Edit .env:
#   DOOR_ID       = UUID matching the door registered in GRMS
#   DOORLINK_URL  = ws://<grms-host-ip>:18000/doorlink/ws
#   DOOR_API_TOKEN = (leave empty if not required)
```

### Build and run

```bash
docker compose -f docker-compose.rpi.yml up -d --build
```

### View logs

```bash
docker compose -f docker-compose.rpi.yml logs -f
```

### Docker Compose — key settings

The container runs in **privileged** mode with **host networking** to access BlueZ D-Bus:

```yaml
services:
  door-hardware:
    network_mode: host       # Required for BLE advertising
    privileged: true         # Required for GPIO + BlueZ
    volumes:
      - ./data:/data                        # Persistent grant store
      - /var/run/dbus:/var/run/dbus         # BlueZ system bus
    environment:
      DBUS_SYSTEM_BUS_ADDRESS: unix:path=/var/run/dbus/system_bus_socket
```

---

## Configuration

All parameters are read from environment variables at startup.

| Variable                       | Default                            | Description                                                |
|--------------------------------|------------------------------------|------------------------------------------------------------|
| `DOOR_ID`                      | `1a7d2ade-...`                     | UUID of this door (must match GRMS DB)                     |
| `DOORLINK_URL`                 | `ws://127.0.0.1:18000/doorlink/ws` | GRMS backend WebSocket URL                                 |
| `DOOR_API_TOKEN`               | ``                                 | Bearer token for DoorLink auth (optional)                  |
| `FW_VERSION`                   | `1.0.0`                            | Firmware version reported to backend                       |
| `BLE_LOCAL_NAME`               | `DoorAccess-<door_id[:8]>`         | BLE advertisement local name                               |
| `BLE_REQUIRE_ENCRYPTION`       | `false`                            | Require BLE link encryption                                |
| `BLE_ADAPTER_ADDRESS`          | auto-detect                        | Explicit BLE adapter MAC (e.g. `D8:3A:DD:E2:08:99`)        |
| `BLE_NEARBY_SCAN`              | `false`                            | Enable debug nearby device scanning table                  |
| `BLE_NEARBY_TABLE_REFRESH_SEC` | `1`                                | Refresh interval for nearby device table                   |
| `BLE_NEARBY_STALE_SEC`         | `30`                               | Remove devices not seen for this many seconds              |
| `BLE_GATT_DEBUG_LOGS`          | `true`                             | Verbose GATT event logs                                    |
| `BLE_GATT_WATCH_SEC`           | `1`                                | Interval to log connected BLE clients                      |
| `BLE_CONTROLPOINT_ALLOW_WWR`   | `false`                            | Allow Write-Without-Response on ControlPoint               |
| `OPEN_MS`                      | `700`                              | Duration of relay pulse in milliseconds                    |
| `OPEN_COOLDOWN_SEC`            | `1.0`                              | Minimum seconds between successive openings                |
| `LED_GPIO`                     | `17`                               | BCM GPIO pin for green/open LED                            |
| `LED_CLOSED_GPIO`              | `27`                               | BCM GPIO pin for red/closed LED                            |
| `NONCE_TTL_SEC`                | `30`                               | Nonce expiry in seconds                                    |
| `INTRUSION_WINDOW_SEC`         | `300`                              | HMAC failure tracking window (seconds)                     |
| `INTRUSION_THRESHOLD`          | `3`                                | HMAC failures before intrusion alert                       |
| `STATE_FILE`                   | `/data/door_state.json`            | Path for persistent grant store                            |
| `LOG_LEVEL`                    | `INFO`                             | Python logging level                                       |
| `PROTO_VERSION`                | `1`                                | Protocol version reported in BLE INFO and included in HMAC |

---

## Logs and Debugging

### Normal startup output

```
############################################################
#                    BLE DOOR ACCESS                       #
############################################################
door_id         : 1a7d2ade-c63e-40f3-ace2-7798e752ee45
proto_version   : 1
local_name      : DoorAccess-1a7d2ade
service_uuid    : C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C
controlpoint    : C0DE0002-... (WRITE)
status          : C0DE0003-... (NOTIFY)
info            : C0DE0004-... (READ)
require_encrypt : False
open_led_gpio   : 17
closed_led_gpio : 27
############################################################
```

### Successful unlock

```
[GATT] ControlPoint write len=87 raw=02...
[GATT] AUTHENTICATE key_id=<uuid> grant_id=<uuid> nonce=... mac=...
[GATT] AUTH success key_id=<uuid> grant_id=<uuid>

############################################################
#                                                          #
#                    PORTE OUVERTE                         #
#                                                          #
############################################################
```

### Common issues

| Symptom                   | Cause                          | Fix                                  |
|---------------------------|--------------------------------|--------------------------------------|
| `No BLE adapter found`    | BLE adapter not detected       | Set `BLE_ADAPTER_ADDRESS` explicitly |
| `bluetoothctl not found`  | BlueZ not in container         | Ensure `bluez` package is installed  |
| `grant_replace: 0 grants` | Door not registered in GRMS    | Add door via backoffice UI           |
| `ERR_UNKNOWN_KEY`         | key_id not in local cache      | Check DoorLink sync, view logs       |
| `ERR_HMAC_INVALID`        | Wrong secret or message format | Verify DOOR_ID matches GRMS          |
| `ERR_GRANT_EXPIRED`       | Grant time window passed       | Re-assign grant in backoffice        |
