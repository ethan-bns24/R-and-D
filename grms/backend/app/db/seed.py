from __future__ import annotations

import base64
import os
import time
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_password
from app.models import AccessGrant, Door, GrantDoor, Room, StaffUser, SyncState, User


def _ensure_sync_counter(db: Session) -> None:
    row = db.get(SyncState, 'doorlink_seq')
    if row is None:
        db.add(SyncState(name='doorlink_seq', value=0))


def seed_demo_data(db: Session, settings: Settings) -> None:
    _ensure_sync_counter(db)

    staff = db.execute(select(StaffUser).where(StaffUser.email == settings.demo_staff_email)).scalar_one_or_none()
    if staff is None:
        staff = StaffUser(
            staff_id=str(uuid.uuid4()),
            email=settings.demo_staff_email,
            password_hash=hash_password(settings.demo_staff_password),
            role='staff',
        )
        db.add(staff)

    guest = db.execute(select(User).where(User.email == settings.demo_guest_email)).scalar_one_or_none()
    if guest is None:
        guest = User(
            user_id=str(uuid.uuid4()),
            key_id=str(uuid.uuid4()),
            email=settings.demo_guest_email,
            password_hash=hash_password(settings.demo_guest_password),
            name='Demo Guest',
            secret_base_b64=base64.b64encode(os.urandom(32)).decode('ascii'),
        )
        db.add(guest)

    room_101 = db.get(Room, settings.demo_room_101_id)
    if room_101 is None:
        room_101 = Room(room_id=settings.demo_room_101_id, label=f'Room {settings.demo_room_101_id}')
        db.add(room_101)

    room_102 = db.get(Room, settings.demo_room_102_id)
    if room_102 is None:
        room_102 = Room(room_id=settings.demo_room_102_id, label=f'Room {settings.demo_room_102_id}')
        db.add(room_102)

    # PostgreSQL enforces FK checks strictly, so rooms must exist before doors.
    db.flush()

    door_101 = db.get(Door, settings.demo_door_101_id)
    if door_101 is None:
        door_101 = Door(
            door_id=settings.demo_door_101_id,
            room_id=settings.demo_room_101_id,
            ble_id=f'DoorAccess-{settings.demo_door_101_id[:8]}',
            status='offline',
            fw_version='1.0.0',
            last_seen_ts=0,
            last_sync_seq=0,
        )
        db.add(door_101)

    door_102 = db.get(Door, settings.demo_door_102_id)
    if door_102 is None:
        door_102 = Door(
            door_id=settings.demo_door_102_id,
            room_id=settings.demo_room_102_id,
            ble_id=f'DoorAccess-{settings.demo_door_102_id[:8]}',
            status='offline',
            fw_version='1.0.0',
            last_seen_ts=0,
            last_sync_seq=0,
        )
        db.add(door_102)

    db.flush()

    active_grant = db.execute(
        select(AccessGrant).where(
            AccessGrant.user_id == guest.user_id,
            AccessGrant.status == 'active',
        )
    ).scalars().first()

    if active_grant is None:
        now = int(time.time())
        grant = AccessGrant(
            grant_id=str(uuid.uuid4()),
            user_id=guest.user_id,
            key_id=guest.key_id,
            from_ts=now - 3600,
            to_ts=now + 86400,
            status='active',
            created_by_staff_id=staff.staff_id,
        )
        db.add(grant)
        db.flush()
        db.add(GrantDoor(grant_id=grant.grant_id, door_id=settings.demo_door_101_id))

    db.commit()
