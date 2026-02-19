from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import StaffUser, User

bearer = HTTPBearer(auto_error=False)


def _decode_or_401(token: str, *, secret: str) -> dict:
    try:
        return decode_access_token(token, secret)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token')


def get_current_guest(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing token')
    settings = get_settings()
    payload = _decode_or_401(credentials.credentials, secret=settings.jwt_guest_secret)
    user_id = payload.get('sub')
    role = payload.get('role')
    if role != 'guest' or not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token role')

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User not found')
    return user


def get_current_staff(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> StaffUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing token')
    settings = get_settings()
    payload = _decode_or_401(credentials.credentials, secret=settings.jwt_staff_secret)
    staff_id = payload.get('sub')
    role = payload.get('role')
    if role not in {'staff', 'admin'} or not staff_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token role')

    staff = db.get(StaffUser, staff_id)
    if staff is None or not staff.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Staff not found')
    return staff
