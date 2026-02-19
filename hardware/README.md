# Hardware Door Agent (BLE + DoorLink)

Service Python pour Raspberry Pi qui:

1. Se connecte en WebSocket au backend DoorLink avec `door_id=1a7d2ade-c63e-40f3-ace2-7798e752ee45`.
2. Expose un service BLE GATT `DoorAccess`.
3. Implemente la sequence MVP:
   - `GET_CHALLENGE` -> `CHALLENGE(nonce)`
   - `AUTHENTICATE(key_id, nonce, mac, grant_id?)`
   - verification grant temporel + nonce TTL/non-rejeu + HMAC
   - ouverture (GPIO) et `RESULT`
4. Envoie `access_event` au backend via DoorLink.

## GATT Profile

- Service UUID: `C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- Characteristic `ControlPoint` (WRITE): `C0DE0002-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- Characteristic `Status` (NOTIFY): `C0DE0003-3F2A-4E9B-9B1E-0A8C2D3A4B5C`
- Characteristic `Info` (READ): `C0DE0004-3F2A-4E9B-9B1E-0A8C2D3A4B5C`

Le service affiche clairement ces caracteristiques au demarrage, et affiche un gros message `PORTE OUVERTE` lors d'une authentification valide.

## Variables d'environnement

Copier `.env.example` en `.env` et adapter:

- `DOORLINK_URL`: URL ws/wss du backend DoorLink.
- `DOOR_API_TOKEN`: token API porte (si active cote backend).
- `BLE_REQUIRE_ENCRYPTION=true` pour forcer des flags BLE chiffres cote GATT.

## Execution locale (sans Docker)

```bash
pip install -r requirements.txt
python door_agent.py
```

## Execution Docker (Raspberry Pi)

Le conteneur doit acceder au bus D-Bus systeme et au hardware BLE.

```bash
cp .env.example .env
docker compose -f docker-compose.rpi.yml up -d --build
docker compose -f docker-compose.rpi.yml logs -f
```

## Notes Raspberry Pi / BLE

- `bluetoothd` doit tourner sur l'hote.
- Le mode `network_mode: host` + montage `/var/run/dbus` est necessaire pour BlueZ.
- `privileged: true` est active pour simplifier l'acces BLE materiel dans le conteneur.
