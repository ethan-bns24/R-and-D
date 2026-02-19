from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.schemas import AccessEventMessage, AckMessage, BaseDoorLinkMessage, HelloMessage
from app.services.doorlink_hub import doorlink_hub

router = APIRouter(tags=['doorlink'])
logger = logging.getLogger(__name__)


@router.websocket('/doorlink/ws')
async def doorlink_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    door_id: str | None = None
    try:
        while True:
            raw = await websocket.receive_text()
            payload = json.loads(raw)
            base = BaseDoorLinkMessage.model_validate(payload)
            if base.type == 'hello':
                hello = HelloMessage.model_validate(payload)
                conn = await doorlink_hub.handle_hello(websocket, hello.model_dump())
                door_id = conn.door_id
                logger.info('Door connected: %s', door_id)
            elif base.type == 'ack':
                ack = AckMessage.model_validate(payload)
                await doorlink_hub.handle_ack(ack.model_dump())
            elif base.type == 'access_event':
                event = AccessEventMessage.model_validate(payload)
                await doorlink_hub.handle_access_event(event.model_dump())
            else:
                logger.warning('Unknown DoorLink message type: %s', base.type)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning('DoorLink websocket error: %s', exc)
    finally:
        if door_id:
            await doorlink_hub.mark_door_offline(door_id)
            logger.info('Door disconnected: %s', door_id)
