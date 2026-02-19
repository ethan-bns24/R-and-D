from __future__ import annotations

import base64
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import StaffUser, User
from app.schemas import LoginRequest, SignupRequest, TokenResponse

router = APIRouter(prefix='/v1', tags=['auth'])


@router.post('/auth/signup', response_model=TokenResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Email already in use')

    user = User(
        user_id=str(uuid.uuid4()),
        key_id=str(uuid.uuid4()),
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        secret_base_b64=base64.b64encode(os.urandom(32)).decode('ascii'),
    )
    db.add(user)
    db.commit()

    settings = get_settings()
    token = create_access_token(
        subject=user.user_id,
        role='guest',
        secret=settings.jwt_guest_secret,
        expires_seconds=settings.jwt_expires_seconds,
    )
    return TokenResponse(access_token=token, expires_in=settings.jwt_expires_seconds)


@router.post('/auth/login', response_model=TokenResponse)
def guest_login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')

    settings = get_settings()
    token = create_access_token(
        subject=user.user_id,
        role='guest',
        secret=settings.jwt_guest_secret,
        expires_seconds=settings.jwt_expires_seconds,
    )
    return TokenResponse(access_token=token, expires_in=settings.jwt_expires_seconds)


@router.post('/backoffice/auth/login', response_model=TokenResponse)
def staff_login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    staff = db.execute(select(StaffUser).where(StaffUser.email == payload.email)).scalar_one_or_none()
    if staff is None or not verify_password(payload.password, staff.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')

    settings = get_settings()
    token = create_access_token(
        subject=staff.staff_id,
        role=staff.role,
        secret=settings.jwt_staff_secret,
        expires_seconds=settings.jwt_expires_seconds,
    )
    return TokenResponse(access_token=token, expires_in=settings.jwt_expires_seconds)
