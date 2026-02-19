from app.api.auth import router as auth_router
from app.api.backoffice import router as backoffice_router
from app.api.doorlink import router as doorlink_router
from app.api.mobile import router as mobile_router

__all__ = ['auth_router', 'backoffice_router', 'doorlink_router', 'mobile_router']
