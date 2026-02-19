from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    expires_in: int


class DoorSummary(BaseModel):
    door_id: str
    ble_id: str


class MobileGrantItem(BaseModel):
    grant_id: str
    from_ts: int
    to_ts: int
    doors: list[DoorSummary]


class MobileGrantsResponse(BaseModel):
    key_id: str
    secret_base_b64: str
    grants: list[MobileGrantItem]


class AssignRequest(BaseModel):
    user_email: EmailStr
    room_id: str
    from_ts: int
    to_ts: int


class AssignResponse(BaseModel):
    grant_id: str
    user_id: str
    key_id: str
    door_ids: list[str]


class RevokeRequest(BaseModel):
    grant_id: str


class RevokeResponse(BaseModel):
    revoked: bool
    grant_id: str


class DoorStatusResponse(BaseModel):
    door_id: str
    room_id: str
    room_label: str
    ble_id: str
    status: str
    connected: bool
    fw_version: str
    last_seen_ts: int
    last_sync_seq: int


class AccessEventResponse(BaseModel):
    event_id: str
    ts: int
    door_id: str
    grant_id: str
    key_id: str
    result: str
    error_code: int
    meta: dict[str, Any]


class BackofficeGrantResponse(BaseModel):
    grant_id: str
    user_email: str
    room_id: str
    door_id: str
    from_ts: int
    to_ts: int
    status: str


class StaffSummary(BaseModel):
    staff_id: str
    email: str
    role: str
    is_active: bool
    created_at_ts: int


class CreateStaffRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: Literal['staff', 'admin'] = 'staff'


class UpdateStaffRequest(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6)
    role: Literal['staff', 'admin'] | None = None
    is_active: bool | None = None


class StaffDeleteResponse(BaseModel):
    deleted: bool
    staff_id: str


class ClientSummary(BaseModel):
    user_id: str
    key_id: str
    email: str
    name: str
    is_active: bool
    created_at_ts: int


class CreateClientRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class UpdateClientRequest(BaseModel):
    email: EmailStr | None = None
    name: str | None = Field(default=None, min_length=1)
    password: str | None = Field(default=None, min_length=6)
    is_active: bool | None = None


class ClientDeleteResponse(BaseModel):
    deleted: bool
    user_id: str


class RoomSummary(BaseModel):
    room_id: str
    label: str
    door_count: int


class DoorCreateRequest(BaseModel):
    door_id: str = Field(min_length=36, max_length=36)
    room_id: str = Field(min_length=1, max_length=32)
    room_label: str | None = Field(default=None, max_length=64)
    ble_id: str = Field(min_length=1, max_length=128)


class DoorUpdateRequest(BaseModel):
    room_id: str | None = Field(default=None, min_length=1, max_length=32)
    room_label: str | None = Field(default=None, min_length=1, max_length=64)
    ble_id: str | None = Field(default=None, min_length=1, max_length=128)


class DoorDeleteResponse(BaseModel):
    deleted: bool
    door_id: str


class BaseDoorLinkMessage(BaseModel):
    type: str


class HelloMessage(BaseModel):
    type: Literal['hello']
    door_id: str
    fw_version: str
    capabilities: dict[str, bool]
    last_sync_seq: int
    door_time: int


class AckMessage(BaseModel):
    type: Literal['ack']
    seq: int
    door_id: str


class AccessEventMessage(BaseModel):
    type: Literal['access_event']
    event_id: str
    ts: int
    door_id: str
    result: Literal['success', 'fail']
    error_code: int
    key_id: str
    grant_id: str
    meta: dict[str, Any] = Field(default_factory=dict)


class WelcomeMessage(BaseModel):
    type: Literal['welcome'] = 'welcome'
    server_time: int
    config_version: int
    sync: dict[str, Any]


class GrantEntry(BaseModel):
    key_id: str
    grant_id: str
    from_ts: int
    to_ts: int
    secret_door_b64: str


class GrantReplaceMessage(BaseModel):
    type: Literal['grant_replace'] = 'grant_replace'
    seq: int
    door_id: str
    grants: list[GrantEntry]


class GrantDeltaMessage(BaseModel):
    type: Literal['grant_delta'] = 'grant_delta'
    seq: int
    door_id: str
    add: list[GrantEntry] = Field(default_factory=list)
    remove: list[dict[str, str]] = Field(default_factory=list)
