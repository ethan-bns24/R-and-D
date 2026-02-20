from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth_router, backoffice_router, doorlink_router, mobile_router
from app.core.config import get_settings
from app.db.init_db import init_db
from app.db.seed import seed_demo_data
from app.db.session import SessionLocal

settings = get_settings()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if settings.seed_on_start:
        db = SessionLocal()
        try:
            seed_demo_data(db, settings)
            logging.info('Seed data ready.')
        finally:
            db.close()
    yield


app = FastAPI(title=settings.app_name, version='2.0.0', lifespan=lifespan, debug=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router)
app.include_router(mobile_router)
app.include_router(backoffice_router)
app.include_router(doorlink_router)


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}
