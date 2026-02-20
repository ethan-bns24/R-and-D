# Door Hardware

Service Python pour la porte:
- serveur BLE GATT (DoorAccess)
- client WebSocket DoorLink vers le backend GRMS

## Configuration

Les valeurs de deploiement sont ecrites en dur dans `docker-compose.rpi.yml`.
Si besoin, modifie directement ces champs dans le compose:
- `DOOR_ID`
- `DOORLINK_URL` (ex: `ws://10.42.0.1:18000/doorlink/ws`)
- `BLE_ADAPTER_ADDRESS`

## Lancer sur Raspberry Pi

```bash
cd door
docker compose -f docker-compose.rpi.yml up -d --build
docker compose -f docker-compose.rpi.yml logs -f
```