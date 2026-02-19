from __future__ import annotations

import base64
import json
import os
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_staff
from app.core.security import hash_password
from app.db.session import get_db
from app.models import AccessEvent, AccessGrant, AuditLog, Door, GrantDoor, Room, StaffUser, User
from app.schemas import (
    AccessEventResponse,
    AssignRequest,
    AssignResponse,
    BackofficeGrantResponse,
    ClientDeleteResponse,
    ClientSummary,
    CreateClientRequest,
    CreateStaffRequest,
    DoorCreateRequest,
    DoorDeleteResponse,
    DoorStatusResponse,
    DoorUpdateRequest,
    RevokeRequest,
    RevokeResponse,
    RoomSummary,
    StaffDeleteResponse,
    StaffSummary,
    UpdateClientRequest,
    UpdateStaffRequest,
)
from app.services import grant_service
from app.services.doorlink_hub import doorlink_hub

router = APIRouter(prefix='/v1/backoffice', tags=['backoffice'])


def now_ts() -> int:
    return int(time.time())


def dt_to_ts(value: datetime | None) -> int:
    if value is None:
        return 0
    return int(value.timestamp())


def _door_status(door: Door, room: Room, *, connected: bool) -> DoorStatusResponse:
    return DoorStatusResponse(
        door_id=door.door_id,
        room_id=door.room_id,
        room_label=room.label,
        ble_id=door.ble_id,
        status=door.status,
        connected=connected,
        fw_version=door.fw_version,
        last_seen_ts=door.last_seen_ts,
        last_sync_seq=door.last_sync_seq,
    )


def _staff_summary(item: StaffUser) -> StaffSummary:
    return StaffSummary(
        staff_id=item.staff_id,
        email=item.email,
        role=item.role,
        is_active=item.is_active,
        created_at_ts=dt_to_ts(item.created_at),
    )


def _client_summary(item: User) -> ClientSummary:
    return ClientSummary(
        user_id=item.user_id,
        key_id=item.key_id,
        email=item.email,
        name=item.name,
        is_active=item.is_active,
        created_at_ts=dt_to_ts(item.created_at),
    )


@router.get('/staff', response_model=list[StaffSummary])
def list_staff(staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)) -> list[StaffSummary]:
    del staff
    rows = db.execute(select(StaffUser).order_by(StaffUser.created_at.desc())).scalars()
    return [_staff_summary(item) for item in rows]


@router.post('/staff', response_model=StaffSummary)
def create_staff(
    payload: CreateStaffRequest,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> StaffSummary:
    existing_staff = db.execute(select(StaffUser).where(StaffUser.email == payload.email)).scalar_one_or_none()
    existing_client = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing_staff is not None or existing_client is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='email_already_in_use')

    entity = StaffUser(
        staff_id=str(uuid.uuid4()),
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(entity)
    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='create_staff_user',
            payload_json=json.dumps({'staff_id': entity.staff_id, 'email': entity.email, 'role': entity.role}),
        )
    )
    db.commit()
    db.refresh(entity)
    return _staff_summary(entity)


@router.put('/staff/{staff_id}', response_model=StaffSummary)
def update_staff(
    staff_id: str,
    payload: UpdateStaffRequest,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> StaffSummary:
    entity = db.get(StaffUser, staff_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='staff_not_found')

    if payload.email and payload.email != entity.email:
        existing_staff = db.execute(select(StaffUser).where(StaffUser.email == payload.email)).scalar_one_or_none()
        existing_client = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
        if existing_staff is not None or existing_client is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='email_already_in_use')
        entity.email = payload.email

    if payload.role is not None:
        entity.role = payload.role

    if payload.password:
        entity.password_hash = hash_password(payload.password)

    if payload.is_active is not None:
        if entity.staff_id == current_staff.staff_id and payload.is_active is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='cannot_deactivate_self')
        entity.is_active = payload.is_active

    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='update_staff_user',
            payload_json=json.dumps({'staff_id': entity.staff_id, 'email': entity.email, 'role': entity.role}),
        )
    )
    db.commit()
    db.refresh(entity)
    return _staff_summary(entity)


@router.delete('/staff/{staff_id}', response_model=StaffDeleteResponse)
def delete_staff(
    staff_id: str,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> StaffDeleteResponse:
    entity = db.get(StaffUser, staff_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='staff_not_found')
    if entity.staff_id == current_staff.staff_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='cannot_delete_self')

    entity.is_active = False
    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='delete_staff_user',
            payload_json=json.dumps({'staff_id': entity.staff_id}),
        )
    )
    db.commit()
    return StaffDeleteResponse(deleted=True, staff_id=staff_id)


@router.get('/clients', response_model=list[ClientSummary])
def list_clients(staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)) -> list[ClientSummary]:
    del staff
    rows = db.execute(select(User).order_by(User.created_at.desc())).scalars()
    return [_client_summary(item) for item in rows]


@router.post('/clients', response_model=ClientSummary)
def create_client(
    payload: CreateClientRequest,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> ClientSummary:
    existing_staff = db.execute(select(StaffUser).where(StaffUser.email == payload.email)).scalar_one_or_none()
    existing_client = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing_staff is not None or existing_client is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='email_already_in_use')

    entity = User(
        user_id=str(uuid.uuid4()),
        key_id=str(uuid.uuid4()),
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        secret_base_b64=base64.b64encode(os.urandom(32)).decode('ascii'),
    )
    db.add(entity)
    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='create_client_user',
            payload_json=json.dumps({'user_id': entity.user_id, 'email': entity.email, 'name': entity.name}),
        )
    )
    db.commit()
    db.refresh(entity)
    return _client_summary(entity)


@router.put('/clients/{user_id}', response_model=ClientSummary)
def update_client(
    user_id: str,
    payload: UpdateClientRequest,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> ClientSummary:
    entity = db.get(User, user_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='client_not_found')

    if payload.email and payload.email != entity.email:
        existing_staff = db.execute(select(StaffUser).where(StaffUser.email == payload.email)).scalar_one_or_none()
        existing_client = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
        if existing_staff is not None or existing_client is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='email_already_in_use')
        entity.email = payload.email

    if payload.name is not None:
        entity.name = payload.name
    if payload.password:
        entity.password_hash = hash_password(payload.password)
    if payload.is_active is not None:
        entity.is_active = payload.is_active

    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='update_client_user',
            payload_json=json.dumps({'user_id': entity.user_id, 'email': entity.email, 'name': entity.name}),
        )
    )
    db.commit()
    db.refresh(entity)
    return _client_summary(entity)


@router.delete('/clients/{user_id}', response_model=ClientDeleteResponse)
async def delete_client(
    user_id: str,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> ClientDeleteResponse:
    entity = db.get(User, user_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='client_not_found')

    active_grants = list(
        db.execute(
        select(AccessGrant.grant_id).where(
            AccessGrant.user_id == user_id,
            AccessGrant.status == 'active',
        )
        ).scalars()
    )

    for grant_id in active_grants:
        revoked, door_ids = grant_service.revoke_grant(db, staff_id=current_staff.staff_id, grant_id=grant_id)
        if revoked:
            await doorlink_hub.push_grant_remove(grant_id=grant_id, door_ids=door_ids)

    entity.is_active = False
    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='delete_client_user',
            payload_json=json.dumps({'user_id': entity.user_id}),
        )
    )
    db.commit()
    return ClientDeleteResponse(deleted=True, user_id=user_id)


@router.get('/rooms', response_model=list[RoomSummary])
def list_rooms(staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)) -> list[RoomSummary]:
    del staff
    rows = db.execute(
        select(Room.room_id, Room.label, func.count(Door.door_id))
        .outerjoin(Door, Door.room_id == Room.room_id)
        .group_by(Room.room_id, Room.label)
        .order_by(Room.room_id.asc())
    ).all()
    return [RoomSummary(room_id=room_id, label=label, door_count=door_count) for room_id, label, door_count in rows]


@router.post('/doors', response_model=DoorStatusResponse)
async def create_door(
    payload: DoorCreateRequest,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> DoorStatusResponse:
    if db.get(Door, payload.door_id) is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='door_already_exists')

    room = db.get(Room, payload.room_id)
    if room is None:
        room = Room(room_id=payload.room_id, label=payload.room_label or f'Room {payload.room_id}')
        db.add(room)
        db.flush()
    elif payload.room_label:
        room.label = payload.room_label

    door = Door(
        door_id=payload.door_id,
        room_id=payload.room_id,
        ble_id=payload.ble_id,
        status='offline',
        fw_version='unknown',
        last_seen_ts=0,
        last_sync_seq=0,
    )
    db.add(door)
    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='create_door',
            payload_json=json.dumps(
                {'door_id': payload.door_id, 'room_id': payload.room_id, 'ble_id': payload.ble_id},
            ),
        )
    )
    db.commit()
    db.refresh(door)
    db.refresh(room)
    return _door_status(door, room, connected=await doorlink_hub.is_connected(door.door_id))


@router.put('/doors/{door_id}', response_model=DoorStatusResponse)
async def update_door(
    door_id: str,
    payload: DoorUpdateRequest,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> DoorStatusResponse:
    door = db.get(Door, door_id)
    if door is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='door_not_found')

    if payload.room_id:
        room = db.get(Room, payload.room_id)
        if room is None:
            room = Room(room_id=payload.room_id, label=payload.room_label or f'Room {payload.room_id}')
            db.add(room)
            db.flush()
        elif payload.room_label:
            room.label = payload.room_label
        door.room_id = payload.room_id
    else:
        room = db.get(Room, door.room_id)
        if room is not None and payload.room_label:
            room.label = payload.room_label

    if payload.ble_id:
        door.ble_id = payload.ble_id

    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='update_door',
            payload_json=json.dumps(
                {'door_id': door_id, 'room_id': door.room_id, 'ble_id': door.ble_id},
            ),
        )
    )
    db.commit()
    db.refresh(door)
    room = db.get(Room, door.room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='door_has_invalid_room')
    return _door_status(door, room, connected=await doorlink_hub.is_connected(door.door_id))


@router.delete('/doors/{door_id}', response_model=DoorDeleteResponse)
def delete_door(
    door_id: str,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> DoorDeleteResponse:
    door = db.get(Door, door_id)
    if door is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='door_not_found')

    active_link = db.execute(
        select(GrantDoor.id)
        .join(AccessGrant, AccessGrant.grant_id == GrantDoor.grant_id)
        .where(
            GrantDoor.door_id == door_id,
            AccessGrant.status == 'active',
        )
        .limit(1)
    ).scalar_one_or_none()
    if active_link is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='door_has_active_grants')

    room_id = door.room_id
    db.execute(delete(GrantDoor).where(GrantDoor.door_id == door_id))
    db.delete(door)

    remaining_door = db.execute(select(Door.door_id).where(Door.room_id == room_id).limit(1)).scalar_one_or_none()
    if remaining_door is None:
        room = db.get(Room, room_id)
        if room is not None:
            db.delete(room)

    db.add(
        AuditLog(
            ts=now_ts(),
            actor_type='staff',
            actor_id=current_staff.staff_id,
            action='delete_door',
            payload_json=json.dumps({'door_id': door_id, 'room_id': room_id}),
        )
    )
    db.commit()
    return DoorDeleteResponse(deleted=True, door_id=door_id)


@router.post('/assign', response_model=AssignResponse)
async def assign_grant(
    payload: AssignRequest,
    staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> AssignResponse:
    try:
        grant, user, doors = grant_service.create_grant(
            db,
            staff_id=staff.staff_id,
            user_email=payload.user_email,
            room_id=payload.room_id,
            from_ts=payload.from_ts,
            to_ts=payload.to_ts,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await doorlink_hub.push_grant_add(grant_id=grant.grant_id, door_ids=[d.door_id for d in doors])

    return AssignResponse(
        grant_id=grant.grant_id,
        user_id=user.user_id,
        key_id=user.key_id,
        door_ids=[d.door_id for d in doors],
    )


@router.post('/revoke', response_model=RevokeResponse)
async def revoke_grant(
    payload: RevokeRequest,
    staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> RevokeResponse:
    revoked, door_ids = grant_service.revoke_grant(db, staff_id=staff.staff_id, grant_id=payload.grant_id)
    if revoked:
        await doorlink_hub.push_grant_remove(grant_id=payload.grant_id, door_ids=door_ids)
    return RevokeResponse(revoked=revoked, grant_id=payload.grant_id)


@router.get('/doors', response_model=list[DoorStatusResponse])
async def list_doors(staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)) -> list[DoorStatusResponse]:
    del staff
    rows = db.execute(select(Door, Room).join(Room, Door.room_id == Room.room_id).order_by(Room.room_id.asc())).all()
    out: list[DoorStatusResponse] = []
    for door, room in rows:
        out.append(_door_status(door, room, connected=await doorlink_hub.is_connected(door.door_id)))
    return out


@router.get('/events', response_model=list[AccessEventResponse])
def list_events(
    door_id: str | None = Query(default=None),
    from_ts: int | None = Query(default=None),
    to_ts: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> list[AccessEventResponse]:
    del staff
    q = select(AccessEvent)
    if door_id:
        q = q.where(AccessEvent.door_id == door_id)
    if from_ts is not None:
        q = q.where(AccessEvent.ts >= from_ts)
    if to_ts is not None:
        q = q.where(AccessEvent.ts <= to_ts)
    q = q.order_by(AccessEvent.ts.desc()).limit(limit)

    rows = list(db.execute(q).scalars())
    return [
        AccessEventResponse(
            event_id=e.event_id,
            ts=e.ts,
            door_id=e.door_id,
            grant_id=e.grant_id,
            key_id=e.key_id,
            result=e.result,
            error_code=e.error_code,
            meta=json.loads(e.meta_json or '{}'),
        )
        for e in rows
    ]


@router.get('/grants', response_model=list[BackofficeGrantResponse])
def list_grants(
    staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
) -> list[BackofficeGrantResponse]:
    del staff
    rows = db.execute(
        select(AccessGrant, User, GrantDoor)
        .join(User, User.user_id == AccessGrant.user_id)
        .join(GrantDoor, GrantDoor.grant_id == AccessGrant.grant_id)
        .order_by(AccessGrant.created_at.desc())
    ).all()
    doors = {door.door_id: door for door in db.execute(select(Door)).scalars()}

    return [
        BackofficeGrantResponse(
            grant_id=grant.grant_id,
            user_email=user.email,
            room_id=doors[link.door_id].room_id if link.door_id in doors else 'unknown',
            door_id=link.door_id,
            from_ts=grant.from_ts,
            to_ts=grant.to_ts,
            status=grant.status,
        )
        for grant, user, link in rows
    ]
