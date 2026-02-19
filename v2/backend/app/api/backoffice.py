from __future__ import annotations

import json
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_staff
from app.db.session import get_db
from app.models import AccessEvent, AccessGrant, Door, GrantDoor, Room, StaffUser, User
from app.schemas import (
    AccessEventResponse,
    AssignRequest,
    AssignResponse,
    BackofficeGrantResponse,
    DoorStatusResponse,
    RevokeRequest,
    RevokeResponse,
)
from app.services import grant_service
from app.services.doorlink_hub import doorlink_hub

router = APIRouter(prefix='/v1/backoffice', tags=['backoffice'])


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
        out.append(
            DoorStatusResponse(
                door_id=door.door_id,
                room_id=door.room_id,
                room_label=room.label,
                ble_id=door.ble_id,
                status=door.status,
                connected=await doorlink_hub.is_connected(door.door_id),
                fw_version=door.fw_version,
                last_seen_ts=door.last_seen_ts,
                last_sync_seq=door.last_sync_seq,
            )
        )
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
