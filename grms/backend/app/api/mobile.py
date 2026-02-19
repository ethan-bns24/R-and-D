from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_guest
from app.db.session import get_db
from app.models import User
from app.schemas import MobileGrantsResponse
from app.services.grant_service import build_mobile_grants_response

router = APIRouter(prefix='/v1/mobile', tags=['mobile'])


@router.get('/grants', response_model=MobileGrantsResponse)
def get_mobile_grants(current_user: User = Depends(get_current_guest), db: Session = Depends(get_db)) -> MobileGrantsResponse:
    return build_mobile_grants_response(db, current_user)
