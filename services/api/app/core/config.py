"""
Application settings loaded from environment variables via pydantic-settings.

All configuration comes from environment variables (or a .env file).
No secrets are hard-coded here — see .env.example for the full list.
"""

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central settings object. Import and use `settings` singleton below."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── API ────────────────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    environment: str = "development"
    log_level: str = "INFO"

    # ── Database ───────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:changeme@localhost:5432/inventory"

    # ── Security ───────────────────────────────────────────────────────────────
    secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # ── CORS ───────────────────────────────────────────────────────────────────
    cors_origins_raw: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    # ── Sync ───────────────────────────────────────────────────────────────────
    sync_batch_size: int = 100
    sync_retry_max: int = 5
    sync_retry_backoff_base_seconds: int = 2

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        allowed = {"development", "staging", "production"}
        if v not in allowed:
            raise ValueError(f"environment must be one of {allowed}")
        return v

    @model_validator(mode="after")
    def validate_secret_key(self) -> "Settings":
        if self.environment == "production" and self.secret_key == "CHANGE_ME_IN_PRODUCTION":
            raise ValueError(
                "SECRET_KEY must be changed from the default value in production environment"
            )
        return self


settings = Settings()
