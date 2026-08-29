"""
Database connection, engine configuration, and session management for local SQLite.
"""

from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Base declarative class for local SQLite models."""


@event.listens_for(Engine, "connect")
def set_sqlite_pragmas(dbapi_connection: Any, connection_record: Any) -> None:
    """Enforce WAL mode and foreign key constraints on SQLite connections."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_engine(db_url: str = "sqlite:///inven_tory_local.db") -> Engine:
    """Create and return a SQLAlchemy engine for SQLite."""
    connect_args = {}
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    return create_engine(
        db_url,
        connect_args=connect_args,
        echo=False,
    )


def get_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    """Create and return a sessionmaker bound to the given engine."""
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
