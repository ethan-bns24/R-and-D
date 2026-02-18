#!/usr/bin/env python3
import asyncio
import base64
import json
import uuid
import time
import websockets

DOOR_API_TOKEN = "door-token-mvp"

# Exemple: un user "key_id" autorisé + secret_door (32 bytes)
KEY_ID = uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
GRANT_ID = uuid.UUID("99999999-8888-7777-6666-555555555555")
SECRET_DOOR = b"\x11" * 32  # en prod: dérivé HKDF / chiffré au repos etc.
SECRET_DOOR_B64 = base64.b64encode(SECRET_DOOR).decode()

SEQ = 200

async def handler(ws):
    # Auth simple (MVP)
    auth = ws.request_headers.get("Authorization", "")
    if auth != f"Bearer {DOOR_API_TOKEN}":
        await ws.close()
        return

    raw = await ws.recv()
    hello = json.loads(raw)
    door_id = hello["door_id"]
    print("HELLO from door:", door_id)

    await ws.send(json.dumps({
        "type": "welcome",
        "server_time": int(time.time()),
        "config_version": 1,
        "sync": {"mode": "delta", "from_seq": 0}
    }))

    # Push snapshot grants (door_id must match)
    await ws.send(json.dumps({
        "type": "grant_replace",
        "seq": SEQ,
        "door_id": door_id,
        "grants": [{
            "key_id": str(KEY_ID),
            "grant_id": str(GRANT_ID),
            "from_ts": int(time.time()) - 60,
            "to_ts": int(time.time()) + 3600,
            "secret_door_b64": SECRET_DOOR_B64
        }]
    }))

    async for msg in ws:
        data = json.loads(msg)
        t = data.get("type")
        if t == "ack":
            print("ACK:", data)
        elif t == "access_event":
            print("ACCESS_EVENT:", data)
        elif t == "alert":
            print("ALERT:", data)
        else:
            print("MSG:", data)

async def main():
    print("DoorLink stub listening on :8765")
    async with websockets.serve(handler, "0.0.0.0", 8765):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
