from __future__ import annotations

import os
from pathlib import Path

from app.db.session import engine
from app.models import Base


def init_db() -> None:
    db_url = str(engine.url)
    if db_url.startswith('sqlite:///'):
        sqlite_path = db_url.replace('sqlite:///', '', 1)
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
