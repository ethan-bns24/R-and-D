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
- `LED_GPIO` (LED ouverture)
- `LED_CLOSED_GPIO` (LED porte fermee, pin 27 par defaut)
- `BLE_GATT_DEBUG_LOGS` / `BLE_GATT_WATCH_SEC` (logs detailles connexion GATT)
- `BLE_NEARBY_SCAN` / `BLE_NEARBY_TABLE_REFRESH_SEC` / `BLE_NEARBY_STALE_SEC` (tableau scan BLE autour)
  - `BLE_NEARBY_SCAN` est desactive par defaut

## Lancer sur Raspberry Pi

```bash
cd door
docker compose -f docker-compose.rpi.yml up -d --build
docker compose -f docker-compose.rpi.yml logs -f
```
