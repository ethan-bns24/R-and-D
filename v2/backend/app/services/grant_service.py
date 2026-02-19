from __future__ import annotations

import base64
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models import AccessGrant, AuditLog, Door, GrantDoor, Room, SyncState, User
from app.schemas import DoorSummary, MobileGrantItem, MobileGrantsResponse
from app.services.crypto import derive_secret_door


def now_ts() -> int:
    return int(time.time())


def next_sync_seq(db: Session) -> int:
    row = db.get(SyncState, 'doorlink_seq')
    if row is None:
        row = SyncState(name='doorlink_seq', value=0)
        db.add(row)
        db.flush()
    row.value += 1
    db.commit()
    return row.value


def get_doors_for_room(db: Session, room_id: str) -> list[Door]:
    return list(db.execute(select(Door).where(Door.room_id == room_id)).scalars())


def build_mobile_grants_response(db: Session, user: User) -> MobileGrantsResponse:
    ts = now_ts()
    grants = list(
        db.execute(
            select(AccessGrant)
            .where(
                AccessGrant.user_id == user.user_id,
                AccessGrant.status == 'active',
                AccessGrant.from_ts <= ts,
                AccessGrant.to_ts >= ts,
            )
            .order_by(AccessGrant.from_ts.asc())
        ).scalars()
    )

    items: list[MobileGrantItem] = []
    for grant in grants:
        links = list(db.execute(select(GrantDoor).where(GrantDoor.grant_id == grant.grant_id)).scalars())
        doors: list[DoorSummary] = []
        for link in links:
            door = db.get(Door, link.door_id)
            if door is None:
                continue
            doors.append(DoorSummary(door_id=door.door_id, ble_id=door.ble_id))

        items.append(
            MobileGrantItem(
                grant_id=grant.grant_id,
                from_ts=grant.from_ts,
                to_ts=grant.to_ts,
                doors=doors,
            )
        )

    return MobileGrantsResponse(
        key_id=user.key_id,
        secret_base_b64=user.secret_base_b64,
        grants=items,
    )


def create_grant(
    db: Session,
    *,
    staff_id: str,
    user_email: str,
    room_id: str,
    from_ts: int,
    to_ts: int,
) -> tuple[AccessGrant, User, list[Door]]:
    if to_ts <= from_ts:
        raise ValueError('to_ts must be greater than from_ts')

    user = db.execute(select(User).where(User.email == user_email)).scalar_one_or_none()
    if user is None:
        raise ValueError('user_not_found')

    room = db.get(Room, room_id)
    if room is None:
        raise ValueError('room_not_found')

    doors = get_doors_for_room(db, room_id)
    if not doors:
        raise ValueError('room_has_no_door')

    grant = AccessGrant(
        grant_id=str(uuid.uuid4()),
        user_id=user.user_id,
        key_id=user.key_id,
        from_ts=from_ts,
        to_ts=to_ts,
        status='active',
        created_by_staff_id=staff_id,
    )
    db.add(grant)
    db.flush()

    for door in doors:
        db.add(GrantDoor(grant_id=grant.grant_id, door_id=door.door_id))

    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=staff_id,
            action='assign_grant',
            payload_json=json.dumps(
                {
                    'grant_id': grant.grant_id,
                    'user_id': user.user_id,
                    'room_id': room_id,
                    'from_ts': from_ts,
                    'to_ts': to_ts,
                }
            ),
        )
    )
    db.commit()
    db.refresh(grant)
    return grant, user, doors


def revoke_grant(db: Session, *, staff_id: str, grant_id: str) -> tuple[bool, list[str]]:
    grant = db.get(AccessGrant, grant_id)
    if grant is None:
        return False, []

    grant.status = 'revoked'
    grant.revoked_at = datetime.now(tz=timezone.utc)
    links = list(db.execute(select(GrantDoor).where(GrantDoor.grant_id == grant_id)).scalars())
    door_ids = [link.door_id for link in links]

    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=staff_id,
            action='revoke_grant',
            payload_json=json.dumps({'grant_id': grant_id}),
        )
    )
    db.commit()
    return True, door_ids


def get_door_grant_entries(db: Session, *, door_id: str) -> list[dict[str, str | int]]:
    ts = now_ts()
    rows = db.execute(
        select(AccessGrant, User)
        .join(GrantDoor, GrantDoor.grant_id == AccessGrant.grant_id)
        .join(User, User.user_id == AccessGrant.user_id)
        .where(
            GrantDoor.door_id == door_id,
            AccessGrant.status == 'active',
            AccessGrant.from_ts <= ts,
            AccessGrant.to_ts >= ts,
        )
    ).all()

    entries: list[dict[str, str | int]] = []
    for grant, user in rows:
        secret_door = derive_secret_door(user.secret_base_b64, door_id)
        entries.append(
            {
                'key_id': grant.key_id,
                'grant_id': grant.grant_id,
                'from_ts': grant.from_ts,
                'to_ts': grant.to_ts,
                'secret_door_b64': base64.b64encode(secret_door).decode('ascii'),
            }
        )
    return entries


def get_grant_entries_for_specific_grant(db: Session, *, grant_id: str, door_id: str) -> list[dict[str, str | int]]:
    rows = db.execute(
        select(AccessGrant, User)
        .join(GrantDoor, GrantDoor.grant_id == AccessGrant.grant_id)
        .join(User, User.user_id == AccessGrant.user_id)
        .where(
            AccessGrant.grant_id == grant_id,
            GrantDoor.door_id == door_id,
            AccessGrant.status == 'active',
        )
    ).all()

    out: list[dict[str, str | int]] = []
    for grant, user in rows:
        secret_door = derive_secret_door(user.secret_base_b64, door_id)
        out.append(
            {
                'key_id': grant.key_id,
                'grant_id': grant.grant_id,
                'from_ts': grant.from_ts,
                'to_ts': grant.to_ts,
                'secret_door_b64': base64.b64encode(secret_door).decode('ascii'),
            }
        )
    return out
