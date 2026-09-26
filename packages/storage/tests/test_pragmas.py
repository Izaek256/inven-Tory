"""
PRAGMA configuration tests for the local desktop SQLite DB.

P2 (optimization plan): cache_size=-64000, temp_store=MEMORY,
synchronous=NORMAL must be applied at connection time alongside the
existing journal_mode=WAL and foreign_keys=ON.
"""

from sqlalchemy import create_engine, event

from storage.db import get_engine, set_sqlite_pragmas


def test_set_sqlite_pragmas_applies_all_plan_pragmas(tmp_path):
    """Directly exercise the connect listener against a raw DBAPI connection."""
    engine = create_engine(f"sqlite:///{tmp_path / 'pragma_direct.db'}")
    event.listen(engine, "connect", set_sqlite_pragmas)

    with engine.connect() as conn:
        cache_size = conn.exec_driver_sql("PRAGMA cache_size").scalar_one()
        assert int(cache_size) == -64000, f"cache_size PRAGMA missing, got {cache_size}"

        temp_store = conn.exec_driver_sql("PRAGMA temp_store").scalar_one()
        assert int(temp_store) == 2, f"temp_store=MEMORY missing, got {temp_store}"

        synchronous = conn.exec_driver_sql("PRAGMA synchronous").scalar_one()
        assert int(synchronous) == 1, f"synchronous=NORMAL missing, got {synchronous}"

        journal_mode = conn.exec_driver_sql("PRAGMA journal_mode").scalar_one()
        assert str(journal_mode).lower() == "wal"

        foreign_keys = conn.exec_driver_sql("PRAGMA foreign_keys").scalar_one()
        assert int(foreign_keys) == 1


def test_get_engine_registers_pragma_listener(tmp_path):
    """get_engine() wires the PRAGMA listener for sqlite URLs."""
    db_file = tmp_path / "pragma_test.db"
    engine = get_engine(f"sqlite:///{db_file}")

    with engine.connect() as conn:
        cache_size = int(conn.exec_driver_sql("PRAGMA cache_size").scalar_one())
        assert cache_size == -64000
