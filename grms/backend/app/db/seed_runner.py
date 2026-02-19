from __future__ import annotations

import logging

from app.core.config import get_settings
from app.db.init_db import init_db
from app.db.seed import seed_demo_data
from app.db.session import SessionLocal

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)


def main() -> None:
    settings = get_settings()
    init_db()
    db = SessionLocal()
    try:
        seed_demo_data(db, settings)
        logger.info('Seed completed successfully.')
    finally:
        db.close()


if __name__ == '__main__':
    main()
