from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = Field(default='Hotel Access V2', alias='APP_NAME')
    app_env: str = Field(default='dev', alias='APP_ENV')
    app_host: str = Field(default='0.0.0.0', alias='APP_HOST')
    app_port: int = Field(default=8000, alias='APP_PORT')

    cors_origins: str = Field(default='http://localhost:5173', alias='CORS_ORIGINS')
    database_url: str = Field(default='sqlite:///./data/demo.db', alias='DATABASE_URL')

    jwt_guest_secret: str = Field(default='guest-dev-secret-change-me', alias='JWT_GUEST_SECRET')
    jwt_staff_secret: str = Field(default='staff-dev-secret-change-me', alias='JWT_STAFF_SECRET')
    jwt_expires_seconds: int = Field(default=3600, alias='JWT_EXPIRES_SECONDS')

    seed_on_start: bool = Field(default=True, alias='SEED_ON_START')
    demo_staff_email: str = Field(default='staff@example.com', alias='DEMO_STAFF_EMAIL')
    demo_staff_password: str = Field(default='staff123', alias='DEMO_STAFF_PASSWORD')
    demo_guest_email: str = Field(default='guest@example.com', alias='DEMO_GUEST_EMAIL')
    demo_guest_password: str = Field(default='guest123', alias='DEMO_GUEST_PASSWORD')

    demo_room_101_id: str = Field(default='101', alias='DEMO_ROOM_101_ID')
    demo_room_102_id: str = Field(default='102', alias='DEMO_ROOM_102_ID')
    demo_door_101_id: str = Field(default='1a7d2ade-c63e-40f3-ace2-7798e752ee45', alias='DEMO_DOOR_101_ID')
    demo_door_102_id: str = Field(default='4bca1510-f89d-40d9-8a2d-e8460b7696d2', alias='DEMO_DOOR_102_ID')

    @property
    def cors_origins_list(self) -> List[str]:
        return [item.strip() for item in self.cors_origins.split(',') if item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

