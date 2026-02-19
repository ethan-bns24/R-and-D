from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


class User(Base):
    __tablename__ = 'users'

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    key_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    secret_base_b64: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class StaffUser(Base):
    __tablename__ = 'staff_users'

    staff_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default='staff')
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Room(Base):
    __tablename__ = 'rooms'

    room_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(64), unique=True)


class Door(Base):
    __tablename__ = 'doors'

    door_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    room_id: Mapped[str] = mapped_column(ForeignKey('rooms.room_id'))
    ble_id: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16), default='offline')
    fw_version: Mapped[str] = mapped_column(String(64), default='unknown')
    last_seen_ts: Mapped[int] = mapped_column(Integer, default=0)
    last_sync_seq: Mapped[int] = mapped_column(Integer, default=0)


class AccessGrant(Base):
    __tablename__ = 'access_grants'

    grant_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.user_id'), index=True)
    key_id: Mapped[str] = mapped_column(String(36), index=True)
    from_ts: Mapped[int] = mapped_column(Integer, index=True)
    to_ts: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(16), default='active', index=True)
    created_by_staff_id: Mapped[str] = mapped_column(ForeignKey('staff_users.staff_id'))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(default=None)


class GrantDoor(Base):
    __tablename__ = 'grant_doors'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    grant_id: Mapped[str] = mapped_column(ForeignKey('access_grants.grant_id'), index=True)
    door_id: Mapped[str] = mapped_column(ForeignKey('doors.door_id'), index=True)


class AccessEvent(Base):
    __tablename__ = 'access_events'

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ts: Mapped[int] = mapped_column(Integer, index=True)
    door_id: Mapped[str] = mapped_column(ForeignKey('doors.door_id'), index=True)
    grant_id: Mapped[str] = mapped_column(String(36), default='00000000-0000-0000-0000-000000000000')
    key_id: Mapped[str] = mapped_column(String(36), default='00000000-0000-0000-0000-000000000000')
    result: Mapped[str] = mapped_column(String(16))
    error_code: Mapped[int] = mapped_column(Integer, default=0)
    meta_json: Mapped[str] = mapped_column(Text, default='{}')


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[int] = mapped_column(Integer, index=True)
    actor_type: Mapped[str] = mapped_column(String(32))
    actor_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(64))
    payload_json: Mapped[str] = mapped_column(Text, default='{}')


class SyncState(Base):
    __tablename__ = 'sync_state'

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0)
