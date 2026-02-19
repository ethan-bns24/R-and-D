# Hotel Access V2

Full rewrite in `v2/`:
- backend: Python FastAPI + DoorLink WebSocket + seeded demo DB
- frontend: React backoffice (rooms/doors/events/assign/revoke)
- hardware: Python BLE GATT door agent (Raspberry Pi)
- ios: SwiftUI client in same folder format as existing `ios/`

## 1) Start backend + frontend

```bash
cd v2
cp backend/.env.example backend/.env
docker compose up -d --build
```

Open:
- Backoffice UI: `http://localhost:5173`
- Backend health: `http://localhost:18000/health`

Note:
- The frontend proxies API calls through `/api` to the backend container.
- From another machine, open only `http://<host-ip>:5173` and API calls stay on the server side.

Seed credentials:
- Staff: `staff@example.com` / `staff123`
- Guest: `guest@example.com` / `guest123`

## 2) DoorLink websocket for hardware

Door endpoint:
- `ws://<backend-host>:18000/doorlink/ws`

Example for Raspberry Pi host network:
- `ws://10.42.0.1:18000/doorlink/ws`

When a door connects, `GET /v1/backoffice/doors` shows `connected=true`.
The React dashboard polls that endpoint and highlights connected rooms/doors.

## 3) Run hardware on Raspberry Pi

```bash
cd v2/hardware
cp .env.example .env
# set DOORLINK_URL=ws://10.42.0.1:18000/doorlink/ws
# set BLE_ADAPTER_ADDRESS if needed
docker compose -f docker-compose.rpi.yml up -d --build
docker compose -f docker-compose.rpi.yml logs -f
```

## 4) iOS client

Use files in `v2/ios/ClientApp`.
Flow implemented:
- login guest
- fetch grants
- BLE scan by DoorAccess service
- read Info
- GET_CHALLENGE
- AUTHENTICATE (HKDF + HMAC)
- RESULT success/fail

## API / protocol summary

REST:
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/backoffice/auth/login`
- `GET /v1/mobile/grants`
- `POST /v1/backoffice/assign`
- `POST /v1/backoffice/revoke`
- `GET /v1/backoffice/doors`
- `GET /v1/backoffice/events`
- `GET /v1/backoffice/grants`

DoorLink WS:
- Door -> Server: `hello`, `ack`, `access_event`
- Server -> Door: `welcome`, `grant_replace`, `grant_delta`

BLE GATT DoorAccess:
- Service: `C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- ControlPoint: `C0DE0002-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- Status: `C0DE0003-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- Info: `C0DE0004-3F2A-4E9B-9B1E-0A8C2D3A4B5C`


