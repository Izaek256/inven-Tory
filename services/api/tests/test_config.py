"""
Property tests for config validation — Issue 16.

Property 7: SECRET_KEY must be changed from the default value in production environment.
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_secret_key_default_allowed_in_development():
    """Default SECRET_KEY is allowed in development environment."""
    settings = Settings(
        environment="development",
        secret_key="CHANGE_ME_IN_PRODUCTION",
        database_url="sqlite:///test.db",
    )
    assert settings.secret_key == "CHANGE_ME_IN_PRODUCTION"


def test_secret_key_default_allowed_in_staging():
    """Default SECRET_KEY is allowed in staging environment."""
    settings = Settings(
        environment="staging",
        secret_key="CHANGE_ME_IN_PRODUCTION",
        database_url="sqlite:///test.db",
    )
    assert settings.secret_key == "CHANGE_ME_IN_PRODUCTION"


def test_secret_key_default_rejected_in_production():
    """Default SECRET_KEY is rejected in production environment (Property 7)."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            environment="production",
            secret_key="CHANGE_ME_IN_PRODUCTION",
            database_url="sqlite:///test.db",
        )
    assert "SECRET_KEY must be changed from the default value in production environment" in str(
        exc_info.value
    )


def test_secret_key_custom_allowed_in_production():
    """Custom SECRET_KEY is allowed in production environment."""
    settings = Settings(
        environment="production",
        secret_key="super-secret-key-12345",
        database_url="sqlite:///test.db",
    )
    assert settings.secret_key == "super-secret-key-12345"
