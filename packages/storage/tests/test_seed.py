"""
Tests for local development seed script.
"""

from sqlalchemy import select

from storage.db import get_engine, get_sessionmaker
from storage.models import Product, StockBalance, Store, User
from storage.seed import seed_database


def test_seed_database(tmp_path):
    """Test executing seed script on a fresh database and re-running for idempotency."""
    db_file = tmp_path / "test_seed.db"
    db_url = f"sqlite:///{db_file}"

    # First run
    seed_database(db_url)

    engine = get_engine(db_url)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        stores = session.scalars(select(Store)).all()
        assert len(stores) == 4

        users = session.scalars(select(User)).all()
        assert len(users) >= 3

        products = session.scalars(select(Product)).all()
        assert len(products) >= 5

        balances = session.scalars(select(StockBalance)).all()
        assert len(balances) > 0

    # Re-run seed script to test idempotency
    seed_database(db_url)

    with session_factory() as session:
        stores_after = session.scalars(select(Store)).all()
        assert len(stores_after) == 4
