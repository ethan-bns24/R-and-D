# GRMS — Guest Room Management System

> Server-side stack for the Smart Hotel Door Access platform.
> Manages guests, staff, rooms, doors, access grants, and real-time synchronisation with door hardware over the **DoorLink** WebSocket protocol.

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Component Details](#component-details)
4. [Security Model](#security-model)
5. [API Reference](#api-reference)
6. [DoorLink Protocol](#doorlink-protocol)
7. [Database Schema](#database-schema)
8. [Deployment](#deployment)
9. [Configuration](#configuration)
10. [Demo Accounts](#demo-accounts)

---

## Overview

GRMS is the central server of a hotel smart-lock system. It exposes:

- A **REST API** used by the backoffice web UI and by guest mobile apps
- A **WebSocket endpoint** (`/doorlink/ws`) used by door hardware units (Raspberry Pi) to receive cryptographic key material and report access events

The system relies on a **zero-trust, offline-capable** access model: door hardware can authenticate guests **without any real-time network call** thanks to pre-distributed cryptographic grants.

---

## System Architecture

```
 ┌────────────────────────────────────────────────────────────┐
 │                        HOST MACHINE                        │
 │                                                            │
 │  ┌─────────────┐   REST/HTTP   ┌───────────────────────┐   │
 │  │  Backoffice │ ─────────────>│                       │   │
 │  │  Web UI     │ <─────────────│   FastAPI Backend     │   │
 │  │ (React/Vite)│               │   Port 18000          │   │
 │  │ Port 5173   │               │                       │   │
 │  └─────────────┘               │  /v1/auth/*           │   │
 │         │                      │  /v1/backoffice/*     │   │
 │         │ nginx proxy /api/    │  /v1/mobile/grants    │   │
 │         └─────────────────────>│  /doorlink/ws (WS)    │   │
 │                                │                       │   │
 │  ┌──────────────┐              └──────────┬────────────┘   │
 │  │  PostgreSQL  │<─────────────────────── │ SQLAlchemy     │
 │  │  Port 5432   │                         │                │
 │  └──────────────┘              ┌──────────┴────────────┐   │
 │                                │   DoorLink Hub        │   │
 │  ┌──────────────┐              │   (in-memory WS mgr)  │   │
 │  │   pgAdmin    │              └──────────┬────────────┘   │
 │  │  Port 5051   │                         │ WebSocket      │
 │  └──────────────┘                         │                │
 └───────────────────────────────────────────│────────────────┘
                                             │
                          ╔══════════════════╪══════╗
                          ║  NETWORK (LAN / Wi-Fi)  ║
                          ╚══════════════════╪══════╝
                                             │
                                   ┌─────────┴──────────┐
                                   │  Raspberry Pi      │
                                   │  Door Agent        │
                                   │  (door/)           │
                                   └────────────────────┘

 ┌────────────────────────────────────────────────────────────┐
 │                      GUEST'S PHONE                         │
 │                                                            │
 │  ┌────────────────┐  REST/HTTPS   ┌───────────────────┐    │
 │  │  iOS Client App│ ────────────> │ GET /v1/mobile/   │    │
 │  │  (Swift)       │ <──────────── │     grants        │    │
 │  │                │               └───────────────────┘    │
 │  │  BLE (GATT)    │ ──────────────────────────────────>    │
 │  │  Challenge /   │                   Door Hardware        │
 │  │  Response      │ <──────────────────────────────────    │
 │  └────────────────┘                                        │
 └────────────────────────────────────────────────────────────┘
```

---

## Component Details

### Backend — `grms/backend/`

| Item      | Value                                                 |
|-----------|-------------------------------------------------------|
| Language  | Python 3.11                                           |
| Framework | FastAPI + Uvicorn                                     |
| ORM       | SQLAlchemy 2 (mapped_column style)                    |
| DB driver | pg8000 (pure-Python PostgreSQL)                       |
| Auth      | JWT HS256 (PyJWT) + PBKDF2-SHA256 passwords (passlib) |
| Port      | 18000                                                 |

#### Directory layout

```
grms/backend/
├── app/
│   ├── main.py              # FastAPI app, lifespan, CORS, router registration
│   ├── api/
│   │   ├── auth.py          # /v1/auth/* and /v1/backoffice/auth/login
│   │   ├── backoffice.py    # /v1/backoffice/* (staff CRUD, grants, events)
│   │   ├── mobile.py        # /v1/mobile/grants
│   │   ├── doorlink.py      # WebSocket /doorlink/ws
│   │   └── deps.py          # FastAPI dependency injectors (JWT validation)
│   ├── core/
│   │   ├── config.py        # Pydantic Settings (env vars)
│   │   └── security.py      # JWT encode/decode, password hashing
│   ├── db/
│   │   ├── session.py       # SQLAlchemy engine + SessionLocal
│   │   ├── init_db.py       # create_all() on startup
│   │   ├── seed.py          # Demo data creation
│   │   └── seed_runner.py   # One-shot seed entry point
│   ├── models/
│   │   └── entities.py      # SQLAlchemy ORM models
│   ├── schemas/
│   │   └── contracts.py     # Pydantic request/response + DoorLink message types
│   └── services/
│       ├── grant_service.py # Grant lifecycle + key derivation orchestration
│       ├── doorlink_hub.py  # In-memory WebSocket connection registry
│       └── crypto.py        # HKDF-SHA256 key derivation
├── Dockerfile
├── requirements.txt
├── .env.example
└── .env
```

### Frontend — `grms/frontend/`

| Item         | Value                                                 |
|--------------|-------------------------------------------------------|
| Framework    | React 18 + Vite                                       |
| HTTP client  | axios (via `src/api.js`)                              |
| Serving      | Nginx (port 80 inside container)                      |
| Exposed port | 5173 (maps to Nginx 80)                               |
| API proxy    | Nginx rewrites `/api/` → `http://grms-backend:18000/` |

#### UI Tabs

```
┌─────────────────────────────────────────────────────────────┐
│  [Dashboard] [Users] [Doors] [Access] [Events]   [Refresh]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Dashboard  — Door connectivity status, recent events chart │
│  Users      — CRUD for Staff users and Guest clients        │
│  Doors      — Register / update / delete door hardware      │
│  Access     — Assign / revoke access grants per room/user   │
│  Events     — Filterable access event log (success / fail)  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The UI polls all endpoints every **5 seconds** for live updates. JWT token is stored in `localStorage`.

---

## Security Model

### Authentication layers

```
┌──────────────────────────────────────────────────────────┐
│  LAYER 1: HTTP API Authentication                        │
│                                                          │
│  Guest users  → JWT signed with JWT_GUEST_SECRET         │
│  Staff users  → JWT signed with JWT_STAFF_SECRET         │
│                                                          │
│  Algorithm: HS256  │  Expiry: configurable (default 1h)  │
│  Password hash: PBKDF2-SHA256 (passlib)                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  LAYER 2: Cryptographic Key Distribution                 │
│                                                          │
│  Each user has a random 256-bit master secret:           │
│    secret_base  (stored in DB, sent to mobile via JWT)   │
│                                                          │
│  Per-door key derived with HKDF-SHA256:                  │
│    secret_door = HKDF(                                   │
│      ikm  = secret_base,                                 │
│      salt = door_id (16 bytes UUID),                     │
│      info = "door-access-v1",                            │
│      len  = 32 bytes                                     │
│    )                                                     │
│                                                          │
│  secret_door is sent to door hardware (never to client)  │
│  secret_base is sent to mobile (derives door key locally)│
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  LAYER 3: Door-side Verification (offline)               │
│                                                          │
│  Mobile presents HMAC-SHA256 over:                       │
│    nonce || door_id || key_id || proto_version           │
│  using secret_door as the key.                           │
│                                                          │
│  Door verifies HMAC + grant time window + nonce TTL.     │
│  No network call required at unlock time.                │
└──────────────────────────────────────────────────────────┘
```

### Key isolation principle

```
                         secret_base (master)
                               │
              ┌────────────────┼────────────────┐
              │                │                │
           HKDF             HKDF             HKDF
        door_id=A         door_id=B         door_id=C
              │                │                │
       secret_door_A    secret_door_B    secret_door_C
              │                │                │
        sent to Door A   sent to Door B   sent to Door C
```

Compromising one door's secret does **not** compromise other doors.

### Two JWT secret domains

| Token type  | Secret             | Claims                              | Used by       |
|-------------|--------------------|-------------------------------------|---------------|
| Guest       | `JWT_GUEST_SECRET` | `sub=user_id`, `role=guest`         | Mobile app    |
| Staff       | `JWT_STAFF_SECRET` | `sub=staff_id`, `role=staff\|admin` | Backoffice UI |

---

## API Reference

### Auth endpoints

| Method   | Path                        | Auth   | Description                  |
|----------|-----------------------------|--------|------------------------------|
| POST     | `/v1/auth/signup`           | None   | Register a new guest account |
| POST     | `/v1/auth/login`            | None   | Guest login → JWT            |
| POST     | `/v1/backoffice/auth/login` | None   | Staff login → JWT            |

### Mobile endpoint

| Method   | Path                | Auth      | Description                                               |
|----------|---------------------|-----------|-----------------------------------------------------------|
| GET      | `/v1/mobile/grants` | Guest JWT | Returns key_id, secret_base, active grants + door BLE IDs |

#### Mobile grants response example

```json
{
  "key_id": "uuid-of-the-key",
  "secret_base_b64": "<base64-encoded 32-byte master secret>",
  "grants": [
    {
      "grant_id": "uuid",
      "from_ts": 1700000000,
      "to_ts":   1700086400,
      "doors": [
        { "door_id": "1a7d2ade-...", "ble_id": "DoorAccess-1a7d2ade" }
      ]
    }
  ]
}
```

### Backoffice endpoints

All routes require a valid **Staff JWT** (`Authorization: Bearer <token>`).

#### Staff management

| Method   | Path                        | Description           |
|----------|-----------------------------|-----------------------|
| GET      | `/v1/backoffice/staff`      | List all staff users  |
| POST     | `/v1/backoffice/staff`      | Create a staff user   |
| PUT      | `/v1/backoffice/staff/{id}` | Update staff user     |
| DELETE   | `/v1/backoffice/staff/{id}` | Deactivate staff user |

#### Client (guest) management

| Method   | Path                          | Description                    |
|----------|-------------------------------|--------------------------------|
| GET      | `/v1/backoffice/clients`      | List all guest clients         |
| POST     | `/v1/backoffice/clients`      | Create guest account           |
| PUT      | `/v1/backoffice/clients/{id}` | Update guest account           |
| DELETE   | `/v1/backoffice/clients/{id}` | Deactivate + revoke all grants |

#### Room & Door management

| Method   | Path                        | Description                              |
|----------|-----------------------------|------------------------------------------|
| GET      | `/v1/backoffice/rooms`      | List rooms with door count               |
| GET      | `/v1/backoffice/doors`      | List doors with live connection status   |
| POST     | `/v1/backoffice/doors`      | Register a door                          |
| PUT      | `/v1/backoffice/doors/{id}` | Update door (room, BLE name)             |
| DELETE   | `/v1/backoffice/doors/{id}` | Remove door (forbidden if active grants) |

#### Grant management

| Method  | Path                    | Description                                        |
|---------|-------------------------|----------------------------------------------------|
| GET     | `/v1/backoffice/grants` | List all grants                                    |
| POST    | `/v1/backoffice/assign` | Assign access grant (room + user + time window)    |
| POST    | `/v1/backoffice/revoke` | Revoke a grant (pushes delta to door in real-time) |

#### Event log

| Method   | Path                    | Description                                             |
|----------|-------------------------|---------------------------------------------------------|
| GET      | `/v1/backoffice/events` | Query access events (filterable by door_id, time range) |

### Health check

| Method   | Path      | Description                                             |
|----------|-----------|---------------------------------------------------------|
| GET      | `/health` | Returns `{"status": "ok"}` — used by Docker healthcheck |

---

## DoorLink Protocol

DoorLink is a **JSON-over-WebSocket** protocol between GRMS backend and door hardware.
Endpoint: `ws://<host>:18000/doorlink/ws`

### Message flow

```
  Door Hardware                                    GRMS Backend
       │                                                │
       │──── hello ────────────────────────────────────>│  Register connection
       │                                                │  Update door.status = online
       │<─── welcome ───────────────────────────────────│  Send server_time, sync mode
       │                                                │
       │<─── grant_replace ─────────────────────────────│  Full grant list for this door
       │──── ack (seq=N) ──────────────────────────────>│  Confirm receipt
       │                                                │
       │   [Guest tries to unlock via BLE]              │
       │                                                │
       │──── access_event ─────────────────────────────>│  Report result (success/fail)
       │                                                │
       │   [Staff assigns new grant in backoffice]      │
       │                                                │
       │<─── grant_delta (add) ─────────────────────────│  Incremental update
       │──── ack (seq=N+1) ────────────────────────────>│
       │                                                │
       │   [Staff revokes grant]                        │
       │                                                │
       │<─── grant_delta (remove) ──────────────────────│  Remove by grant_id
       │──── ack (seq=N+2) ────────────────────────────>│
       │                                                │
       │   [Disconnect / network loss]                  │
       │                                                │
       │   reconnect → hello (last_sync_seq=N+2)        │
       │<─── welcome + grant_replace ───────────────────│  Full resync from scratch
```

### Message schemas

#### Door → Server

```jsonc
// hello: sent on WebSocket connect
{
  "type": "hello",
  "door_id": "1a7d2ade-c63e-40f3-ace2-7798e752ee45",
  "fw_version": "1.0.0",
  "capabilities": { "ble": true, "uwb": false, "bg_unlock": false },
  "last_sync_seq": 42,
  "door_time": 1700000000
}

// ack: acknowledges a grant_replace or grant_delta
{
  "type": "ack",
  "seq": 42,
  "door_id": "1a7d2ade-..."
}

// access_event: reports a BLE unlock attempt
{
  "type": "access_event",
  "event_id": "uuid",
  "ts": 1700000000,
  "door_id": "1a7d2ade-...",
  "result": "success",         // or "fail"
  "error_code": 0,
  "key_id": "uuid",
  "grant_id": "uuid",
  "meta": { "reason": "hmac_ok" }
}
```

#### Server → Door

```jsonc
// welcome: handshake acknowledgement
{
  "type": "welcome",
  "server_time": 1700000000,
  "config_version": 1,
  "sync": { "mode": "full", "from_seq": 42 }
}

// grant_replace: full grant list (sent on hello or after delta gap)
{
  "type": "grant_replace",
  "seq": 10,
  "door_id": "1a7d2ade-...",
  "grants": [
    {
      "key_id": "uuid",
      "grant_id": "uuid",
      "from_ts": 1700000000,
      "to_ts": 1700086400,
      "secret_door_b64": "<base64-32-bytes>"  // HKDF derived
    }
  ]
}

// grant_delta: incremental update
{
  "type": "grant_delta",
  "seq": 11,
  "door_id": "1a7d2ade-...",
  "add": [ { "key_id": "...", "grant_id": "...", ... } ],
  "remove": [ { "grant_id": "uuid-to-remove" } ]
}
```

### Sequence numbers and consistency

- A global `SyncState.doorlink_seq` counter in PostgreSQL is incremented atomically for every grant change.
- Doors track `last_sync_seq` locally (persisted to disk).
- On reconnect, if the door's seq is behind, a full `grant_replace` is sent to guarantee consistency.
- Delta messages are strictly ordered; a gap triggers re-sync.

---

## Database Schema

```
┌─────────────┐       ┌──────────────┐       ┌──────────────┐
│    users    │       │ access_grants│       │    doors     │
├─────────────┤       ├──────────────┤       ├──────────────┤
│ user_id  PK │──┐    │ grant_id  PK │──┐    │ door_id   PK │
│ key_id      │  │    │ user_id   FK │  │    │ room_id   FK │
│ email       │  └───>│ key_id       │  │    │ ble_id       │
│ password_hash│      │ from_ts      │  │    │ status       │
│ name        │       │ to_ts        │  │    │ fw_version   │
│ secret_base_b64│    │ status       │  │    │ last_seen_ts │
│ created_at  │       │ created_at   │  │    │ last_sync_seq│
│ is_active   │       │ revoked_at   │  │    └──────┬───────┘
└─────────────┘       └──────────────┘  │           │
                                        │   ┌───────┴──────┐
                       ┌──────────────┐ └──>│ grant_doors  │
                       │ staff_users  │     ├──────────────┤
                       ├──────────────┤     │ id        PK │
                       │ staff_id  PK │     │ grant_id  FK │
                       │ email        │     │ door_id   FK │
                       │ password_hash│     └──────────────┘
                       │ role         │
                       │ is_active    │     ┌──────────────┐
                       └──────────────┘     │    rooms     │
                                            ├──────────────┤
┌──────────────────┐                        │ room_id   PK │
│  access_events   │                        │ label        │
├──────────────────┤                        └──────────────┘
│ event_id      PK │
│ ts               │    ┌──────────────────┐
│ door_id       FK │    │   audit_logs     │
│ grant_id         │    ├──────────────────┤
│ key_id           │    │ id            PK │
│ result           │    │ ts               │
│ error_code       │    │ actor_type       │
│ meta_json        │    │ actor_id         │
└──────────────────┘    │ action           │
                        │ payload_json     │
                        └──────────────────┘

                        ┌──────────────────┐
                        │   sync_state     │
                        ├──────────────────┤
                        │ name  PK         │  "doorlink_seq" → N
                        │ value            │
                        └──────────────────┘
```

---

## Deployment

### Prerequisites

- Docker + Docker Compose (v2)

### Quick start

```bash
cd grms
docker compose up -d --build
```

### Services and ports

| Service    | Container       | Port            | Description           | 
|------------|-----------------|-----------------|-----------------------|
| PostgreSQL | `grms-postgres` | 5432 (internal) | Main database         |
| Backend    | `grms-backend`  | 18000           | FastAPI + DoorLink WS |
| Frontend   | `grms-frontend` | 5173            | React admin UI        |
| pgAdmin    | `grms-pgadmin`  | 5051            | DB administration     |

### Endpoints

```
http://<host>:5173          → Backoffice UI
http://<host>:18000/health  → Backend health check
http://<host>:18000/docs    → OpenAPI / Swagger UI
ws://<host>:18000/doorlink/ws → DoorLink WebSocket
http://<host>:5051          → pgAdmin (admin@admin.com / admin)
```

### Seed demo data (one-shot)

```bash
cd grms
docker compose --profile seed run --rm seed
```

### Stop conflicting containers (if needed)

```bash
docker stop v2-frontend v2-backend
```

### Docker Compose startup order

```
postgres (healthy)
    └── backend (healthy)
            ├── frontend
            ├── pgadmin
            └── seed (one-shot, --profile seed only)
```

---

## Configuration

Backend is configured via environment variables (`.env` file or `docker compose` environment block).

| Variable              | Default                                            | Description                     |
|-----------------------|----------------------------------------------------|---------------------------------|
| `DATABASE_URL`        | `postgresql+pg8000://grms:grms@postgres:5432/grms` | PostgreSQL connection string    |
| `JWT_GUEST_SECRET`    | `guest-dev-secret-change-me`                       | **Change in production**        |
| `JWT_STAFF_SECRET`    | `staff-dev-secret-change-me`                       | **Change in production**        |
| `JWT_EXPIRES_SECONDS` | `3600`                                             | Token lifetime in seconds       |
| `CORS_ORIGINS`        | `http://localhost:5173`                            | Comma-separated allowed origins |
| `APP_HOST`            | `0.0.0.0`                                          | Uvicorn bind address            |
| `APP_PORT`            | `18000`                                            | Uvicorn bind port               |
| `SEED_ON_START`       | `false`                                            | Auto-seed demo data on startup  |

See `.env.example` for the full list.

---

## Demo Accounts

Created by the seed command:

| Type  | Email               | Password   |
|-------|---------------------|------------|
| Staff | `staff@example.com` | `staff123` |
| Guest | `guest@example.com` | `guest123` |

pgAdmin DB connection:

| Field    | Value      |
|----------|------------|
| Host     | `postgres` |
| Port     | `5432`     |
| Database | `grms`     |
| Username | `grms`     |
| Password | `grms`     |
