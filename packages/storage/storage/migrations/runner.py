"""
Migration runner helper for applying Alembic migrations to SQLite databases.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config


def run_migrations(db_url: str = "sqlite:///inven_tory_local.db") -> None:
    """
    Run Alembic migrations programmatically against the specified database URL.

    This operation is idempotent: if the database is already migrated to head,
    Alembic will perform a no-op cleanly.
    """
    migrations_dir = Path(__file__).parent
    ini_path = migrations_dir / "alembic.ini"

    config = Config(str(ini_path))
    config.set_main_option("script_location", str(migrations_dir))
    config.set_main_option("sqlalchemy.url", db_url)

    command.upgrade(config, "head")
