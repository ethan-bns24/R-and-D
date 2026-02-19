# V2 Hardware Door Agent

Python service for the door device.

It does both:
- BLE GATT DoorAccess service (Info, ControlPoint, Status)
- DoorLink websocket client to backend

## Protocol

- Service UUID: `C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- ControlPoint (WRITE): `C0DE0002-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- Status (NOTIFY): `C0DE0003-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- Info (READ): `C0DE0004-3F2A-4E9B-9B1E-0A8C2D3A4B5C`

Flow:
- app reads Info
- app writes GET_CHALLENGE
- door notifies CHALLENGE nonce
- app writes AUTHENTICATE(key_id, nonce, mac, grant_id)
- door validates grant window + nonce anti replay + HMAC
- if valid: unlock and notify RESULT success + send access_event over DoorLink

## Local run

```bash
pip install -r requirements.txt
python door_agent.py
```

## Raspberry Pi Docker run

```bash
cp .env.example .env
docker compose -f docker-compose.rpi.yml up -d --build
docker compose -f docker-compose.rpi.yml logs -f
```

Requirements on host:
- bluetoothd running
- D-Bus system socket available (`/var/run/dbus/system_bus_socket`)
- privileged container with host networking
