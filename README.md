# Smart Hotel Door Access System

> A full-stack, BLE-based smart lock platform for hotel room access management.
> Designed for the **Accor / Pullman** R&D project at ESILV.

---

## What is this?

This system replaces physical key cards with a **smartphone-based BLE challenge-response** unlock mechanism. Guests receive time-limited access grants through a mobile app and can open their room door by simply approaching it with their phone — no internet connection required at unlock time.

Hotel staff manage guests, rooms, doors, and access rights through a web-based backoffice.

---

## System Overview

```
+================================================================================+
|                         SMART HOTEL ACCESS PLATFORM                            |
+================================================================================+

   HOTEL STAFF                    GRMS SERVER STACK                DOOR HARDWARE
  +-----------+                  +-------------------+            +-------------+
  |           |   REST / HTTPS   |                   |  WebSocket |             |
  | Backoffice|<---------------->|  FastAPI Backend  |<---------->|  Raspberry  |
  | Web UI    |                  |  (Python 3.11)    | DoorLink   |  Pi Agent   |
  | (React)   |                  |                   |            |  (Python)   |
  +-----------+                  |  Port 18000       |            |             |
                                 +--------+----------+            |  BLE GATT   |
                                          |                       |  peripheral |
                                          | SQLAlchemy            +------+------+
                                          v                              |
                                 +------------------+                    | BLE
                                 |   PostgreSQL     |                    | (HMAC)
                                 |   Port 5432      |                    |
                                 +------------------+                    v
                                                               +-----------------+
  HOTEL GUEST                                                  |   Guest Phone   |
  +-----------+                                                |   iOS App       |
  |           |   REST (get grants)                            |   (Swift)       |
  | Mobile    |<--------- FastAPI /v1/mobile/grants            |                 |
  | App       |                                                |  BLE client     |
  | (iOS)     |                                                |  HMAC-SHA256    |
  |           |<---------------------------------------------->|  HKDF-SHA256    |
  +-----------+           BLE (challenge / response)           +-----------------+
```

---

## Repository Structure

```
R-and-D/
|
+-- grms/                        # Main server stack
|   +-- backend/                 # FastAPI Python backend
|   |   +-- app/
|   |   |   +-- api/             # HTTP + WebSocket routes
|   |   |   +-- core/            # Config, JWT, crypto utils
|   |   |   +-- db/              # Session, init, seed
|   |   |   +-- models/          # SQLAlchemy ORM entities
|   |   |   +-- schemas/         # Pydantic contracts
|   |   |   +-- services/        # Business logic, DoorLink hub
|   |   +-- Dockerfile
|   |   +-- requirements.txt
|   |   +-- .env.example
|   +-- frontend/                # React backoffice UI
|   |   +-- src/
|   |   |   +-- components/      # UI components (tabs, layout)
|   |   |   +-- api.js           # HTTP client (axios)
|   |   +-- Dockerfile
|   |   +-- nginx.conf           # Reverse proxy /api/ -> backend
|   +-- docker-compose.yml       # Full stack: postgres + backend + frontend + pgadmin
|   +-- README.md                # Detailed GRMS documentation
|
+-- door/                        # Raspberry Pi hardware agent
|   +-- door_agent.py            # Single-file async agent
|   +-- requirements.txt
|   +-- Dockerfile
|   +-- docker-compose.rpi.yml   # RPi deployment compose
|   +-- README.md                # Detailed door documentation
|   +-- data/                    # Persistent grant store (volume)
|
+-- ios/                         # iOS mobile client (Swift)
|   +-- ClientApp/
|   |   +-- BleManager.swift     # BLE GATT + HMAC logic
|   |   +-- AuthService.swift    # JWT + API auth
|   |   +-- ApiClient.swift      # REST client
|   |   +-- ClientViewModel.swift
|   |   +-- ContentView.swift
|
+-- documentations/              # Project reports and specs
+-- archives/                    # Legacy versions (v1, v2)
+-- README.md                    # This file
```

---

## Key Concepts

### Access Grants

A **grant** is a time-bounded access right linking a guest (identified by their `key_id`) to one or more doors (identified by their `door_id`). Grants have:

- `from_ts` / `to_ts`: Unix timestamps defining the valid window
- `status`: `active` or `revoked`

### Cryptographic Key Architecture

```
Guest account creation:
  secret_base  <-- 32 random bytes  (stored in DB, sent to mobile in /grants response)
  key_id       <-- random UUID       (public identifier for the key pair)

Per-door key derivation (HKDF-SHA256):
  secret_door = HKDF(
    ikm  = secret_base,
    salt = door_id (16 bytes),
    info = "door-access-v1",
    len  = 32 bytes
  )

  secret_door is pre-computed by the backend and sent only to the door hardware.
  The mobile app derives secret_door independently from secret_base + door_id.
  Neither party needs to share the same computation channel.
```

Compromising one door's secret does **not** compromise any other door or the master secret.

### BLE Challenge-Response

```
Phone                                    Door
  |                                        |
  |  --> Write OP_GET_CHALLENGE            |
  |                                        | Generate nonce (32 bytes, single-use)
  |  <-- NOTIFY: nonce                     |
  |                                        |
  |  Compute: HMAC-SHA256(secret_door,     |
  |    nonce || door_id || key_id || ver)  |
  |                                        |
  |  --> Write OP_AUTHENTICATE             |
  |        key_id, nonce, HMAC, grant_id   |
  |                                        | Verify HMAC + grant time window
  |  <-- NOTIFY: ok / error code           | Actuate relay if ok
```

The door **never makes a network call** during unlock. Everything is verified locally against its pre-loaded grant cache.

### DoorLink — Real-time Grant Sync

The backend pushes grant updates to doors over a persistent WebSocket connection:

```
On grant assignment:   backend --> door: grant_delta (add)
On grant revocation:   backend --> door: grant_delta (remove)
On door reconnect:     backend --> door: grant_replace (full sync)
On unlock attempt:     door --> backend: access_event (success/fail)
```

---

## Quick Start

### 1. Start the GRMS server stack

```bash
cd grms
docker compose up -d --build
```

| Service            | URL                                |
|--------------------|------------------------------------|
| Backoffice UI      | `http://localhost:5173`            |
| Backend API        | `http://localhost:18000`           |
| API docs (Swagger) | `http://localhost:18000/docs`      |
| DoorLink WebSocket | `ws://localhost:18000/doorlink/ws` |
| pgAdmin            | `http://localhost:5051`            |

### 2. Seed demo data

```bash
cd grms
docker compose --profile seed run --rm seed
```

Demo accounts created:

| Role  | Email               | Password   |
|-------|---------------------|------------|
| Staff | `staff@example.com` | `staff123` |
| Guest | `guest@example.com` | `guest123` |

### 3. Deploy the door agent (Raspberry Pi)

```bash
cd door
cp .env.example .env
# Set DOORLINK_URL=ws://<grms-host-ip>:18000/doorlink/ws
# Set DOOR_ID to match the door UUID registered in GRMS backoffice
docker compose -f docker-compose.rpi.yml up -d --build
docker compose -f docker-compose.rpi.yml logs -f
```

---

## Security Summary

| Mechanism              | Implementation                                   |
|------------------------|--------------------------------------------------|
| Password storage       | PBKDF2-SHA256 (passlib)                          |
| API authentication     | JWT HS256, separate secrets for guests and staff |
| Key derivation         | HKDF-SHA256 (RFC 5869)                           |
| BLE authentication     | HMAC-SHA256 challenge-response                   |
| Replay protection      | Single-use nonces with 30-second TTL             |
| Timing-safe comparison | `hmac.compare_digest()` on door                  |
| Intrusion detection    | 3 HMAC failures in 5 min triggers alert          |
| Grant revocation       | Real-time push via DoorLink WebSocket            |
| Offline capability     | Door caches grants locally with persistence      |

---

## Component Documentation

- **[grms/README.md](grms/README.md)** — Full GRMS backend and frontend documentation: API reference, DoorLink protocol, database schema, deployment, security model
- **[door/README.md](door/README.md)** — Full door agent documentation: BLE GATT profile, authentication protocol, GPIO wiring, configuration

---

## Technology Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Backend    | Python 3.11, FastAPI, Uvicorn, SQLAlchemy 2         |
| Database   | PostgreSQL 16                                       |
| Frontend   | React 18, Vite, Nginx                               |
| Door agent | Python 3.11, bluezero (BlueZ), websockets, RPi.GPIO |
| iOS client | Swift, CoreBluetooth, CryptoKit                     |
| Containers | Docker, Docker Compose v2                           |
| Crypto     | HKDF-SHA256, HMAC-SHA256, PBKDF2-SHA256, JWT HS256  |
