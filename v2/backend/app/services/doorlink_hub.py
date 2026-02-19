from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import AccessEvent, Door
from app.schemas import GrantDeltaMessage, GrantReplaceMessage, WelcomeMessage
from app.services import grant_service


@dataclass
class DoorConnection:
    websocket: WebSocket
    door_id: str
    fw_version: str
    capabilities: dict[str, bool]
    connected_at: int
    last_seen_ts: int
    last_ack_seq: int
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send_json(self, payload: dict[str, Any]) -> None:
        async with self.send_lock:
            await self.websocket.send_json(payload)


class DoorLinkHub:
    def __init__(self) -> None:
        self._connections: dict[str, DoorConnection] = {}
        self._lock = asyncio.Lock()

    async def register(self, connection: DoorConnection) -> None:
        async with self._lock:
            self._connections[connection.door_id] = connection

    async def unregister(self, door_id: str) -> None:
        async with self._lock:
            self._connections.pop(door_id, None)

    async def get_connection(self, door_id: str) -> DoorConnection | None:
        async with self._lock:
            return self._connections.get(door_id)

    async def connected_door_ids(self) -> set[str]:
        async with self._lock:
            return set(self._connections.keys())

    async def is_connected(self, door_id: str) -> bool:
        async with self._lock:
            return door_id in self._connections

    async def handle_hello(self, websocket: WebSocket, msg: dict[str, Any]) -> DoorConnection:
        now = int(time.time())
        door_id = msg['door_id']

        connection = DoorConnection(
            websocket=websocket,
            door_id=door_id,
            fw_version=msg.get('fw_version', 'unknown'),
            capabilities=msg.get('capabilities', {}),
            connected_at=now,
            last_seen_ts=now,
            last_ack_seq=int(msg.get('last_sync_seq', 0)),
        )

        await self.register(connection)

        db = SessionLocal()
        try:
            door = db.get(Door, door_id)
            if door is not None:
                door.status = 'online'
                door.fw_version = connection.fw_version
                door.last_seen_ts = now
                db.commit()

            welcome = WelcomeMessage(
                server_time=now,
                config_version=1,
                sync={'mode': 'full', 'from_seq': int(msg.get('last_sync_seq', 0))},
            )
            await connection.send_json(welcome.model_dump())

            seq = grant_service.next_sync_seq(db)
            full_entries = grant_service.get_door_grant_entries(db, door_id=door_id)
            replace = GrantReplaceMessage(seq=seq, door_id=door_id, grants=full_entries)
            await connection.send_json(replace.model_dump())
        finally:
            db.close()

        return connection

    async def handle_ack(self, msg: dict[str, Any]) -> None:
        door_id = msg.get('door_id')
        seq = int(msg.get('seq', 0))
        conn = await self.get_connection(door_id)
        if conn is not None:
            conn.last_seen_ts = int(time.time())
            conn.last_ack_seq = seq

        db = SessionLocal()
        try:
            door = db.get(Door, door_id)
            if door is not None:
                door.last_sync_seq = seq
                door.last_seen_ts = int(time.time())
                db.commit()
        finally:
            db.close()

    async def handle_access_event(self, msg: dict[str, Any]) -> None:
        db = SessionLocal()
        try:
            event = AccessEvent(
                event_id=msg['event_id'],
                ts=int(msg['ts']),
                door_id=msg['door_id'],
                grant_id=msg.get('grant_id', '00000000-0000-0000-0000-000000000000'),
                key_id=msg.get('key_id', '00000000-0000-0000-0000-000000000000'),
                result=msg.get('result', 'fail'),
                error_code=int(msg.get('error_code', 0)),
                meta_json=json.dumps(msg.get('meta', {})),
            )
            db.add(event)

            door = db.get(Door, msg['door_id'])
            if door is not None:
                door.last_seen_ts = int(time.time())
                db.add(door)

            db.commit()
        finally:
            db.close()

    async def mark_door_offline(self, door_id: str) -> None:
        await self.unregister(door_id)
        db = SessionLocal()
        try:
            door = db.get(Door, door_id)
            if door is not None:
                door.status = 'offline'
                door.last_seen_ts = int(time.time())
                db.commit()
        finally:
            db.close()

    async def push_grant_add(self, *, grant_id: str, door_ids: list[str]) -> None:
        db = SessionLocal()
        try:
            for door_id in door_ids:
                conn = await self.get_connection(door_id)
                if conn is None:
                    continue

                seq = grant_service.next_sync_seq(db)
                add_entries = grant_service.get_grant_entries_for_specific_grant(db, grant_id=grant_id, door_id=door_id)
                if not add_entries:
                    continue
                delta = GrantDeltaMessage(seq=seq, door_id=door_id, add=add_entries, remove=[])
                await conn.send_json(delta.model_dump())
        finally:
            db.close()

    async def push_grant_remove(self, *, grant_id: str, door_ids: list[str]) -> None:
        db = SessionLocal()
        try:
            for door_id in door_ids:
                conn = await self.get_connection(door_id)
                if conn is None:
                    continue

                seq = grant_service.next_sync_seq(db)
                delta = GrantDeltaMessage(
                    seq=seq,
                    door_id=door_id,
                    add=[],
                    remove=[{'grant_id': grant_id}],
                )
                await conn.send_json(delta.model_dump())
        finally:
            db.close()


doorlink_hub = DoorLinkHub()
