# Door Hardware

Service Python pour la porte:
- serveur BLE GATT (DoorAccess)
- client WebSocket DoorLink vers le backend GRMS

## Variables principales

- `DOOR_ID`
- `DOORLINK_URL` (ex: `ws://10.42.0.1:18000/doorlink/ws`)
- `BLE_ADAPTER_ADDRESS` (optionnel, recommandé si auto-détection KO)

## Lancer sur Raspberry Pi

```bash
cd door
cp .env.example .env
docker compose -f docker-compose.rpi.yml up -d --build
docker compose -f docker-compose.rpi.yml logs -f
```
