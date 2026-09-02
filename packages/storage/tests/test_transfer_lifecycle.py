"""
Integration tests for full transfer lifecycle (DRAFT -> DISPATCHED -> RECEIVED),
EXCEPTION, and CANCELLED paths (Section 11, AT-005).
"""

from datetime import UTC, datetime

from domain.entities import TransferStatus
from domain.rules import (
    create_cancel_compensation_transaction,
    create_dispatch_transaction,
    create_receive_transaction,
    validate_transfer_transition,
)
from sqlalchemy import select
from ulid import ULID

from storage.db import Base, get_engine, get_sessionmaker
from storage.models import (
    Device,
    InventoryTransaction,
    Product,
    StockBalance,
    Store,
    Transfer,
    User,
)


def setup_test_db(tmp_path):
    """Utility to set up clean SQLite database for transfer lifecycle testing."""
    db_file = tmp_path / "test_transfers.db"
    db_url = f"sqlite:///{db_file}"
    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        store_a = Store(id="STORE-A", code="ST-A", name="Store Alpha")
        store_b = Store(id="STORE-B", code="ST-B", name="Store Beta")
        user = User(
            id="USER-1",
            username="manager",
            email="manager@example.com",
        )
        device_a = Device(id="DEV-A", store_id="STORE-A", device_name="POS-A")
        device_b = Device(id="DEV-B", store_id="STORE-B", device_name="POS-B")
        product = Product(
            id="PROD-1",
            sku="SKU-PHONE-01",
            name="Smartphone X",
            category="Electronics",
            unit="pcs",
        )
        # Store A starts with 20 units
        balance_a = StockBalance(
            id="SB-STORE-A-PROD-1-AVAILABLE",
            store_id="STORE-A",
            product_id="PROD-1",
            stock_bucket="AVAILABLE",
            quantity=20,
        )
        # Store B starts with 0 units
        balance_b = StockBalance(
            id="SB-STORE-B-PROD-1-AVAILABLE",
            store_id="STORE-B",
            product_id="PROD-1",
            stock_bucket="AVAILABLE",
            quantity=0,
        )

        session.add_all([store_a, store_b, user, product])
        session.flush()

        session.add_all([device_a, device_b, balance_a, balance_b])
        session.commit()

    return session_factory


def test_full_transfer_lifecycle_integration(tmp_path):
    """
    DoD & AT-005 Integration Test:
    Cover full transfer lifecycle (DRAFT -> DISPATCHED -> RECEIVED).
    Verify Store A -5, Store B +5, both transactions sharing one transfer_id.
    """
    session_factory = setup_test_db(tmp_path)
    transfer_id = f"TRF-{ULID()}"

    # 1. DRAFT state: Create transfer record
    with session_factory() as session:
        db_transfer = Transfer(
            id=transfer_id,
            source_store_id="STORE-A",
            destination_store_id="STORE-B",
            product_id="PROD-1",
            quantity=5,
            status=TransferStatus.DRAFT.value,
            created_by_user_id="USER-1",
        )
        session.add(db_transfer)
        session.commit()

    # Verify initial balances
    with session_factory() as session:
        trf = session.scalar(select(Transfer).where(Transfer.id == transfer_id))
        assert trf is not None
        assert trf.status == "DRAFT"

        bal_a = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-A", StockBalance.product_id == "PROD-1"
            )
        )
        assert bal_a.quantity == 20

    # 2. DISPATCHED state: Source stock decreases (-5)
    with session_factory() as session:
        trf = session.scalar(select(Transfer).where(Transfer.id == transfer_id))
        validate_transfer_transition(TransferStatus(trf.status), TransferStatus.DISPATCHED)
        trf.status = TransferStatus.DISPATCHED.value

        # Domain rule creates dispatch transaction
        from domain.entities import Transfer as DomainTransfer

        domain_trf = DomainTransfer(
            id=trf.id,
            source_store_id=trf.source_store_id,
            destination_store_id=trf.destination_store_id,
            product_id=trf.product_id,
            quantity=trf.quantity,
            status=TransferStatus.DISPATCHED,
            created_by_user_id=trf.created_by_user_id,
        )

        dispatch_domain_tx = create_dispatch_transaction(
            domain_trf, user_id="USER-1", device_id="DEV-A"
        )
        db_dispatch_tx = InventoryTransaction(
            transaction_id=dispatch_domain_tx.transaction_id,
            store_id=dispatch_domain_tx.store_id,
            product_id=dispatch_domain_tx.product_id,
            movement_type=dispatch_domain_tx.movement_type.value,
            stock_bucket=dispatch_domain_tx.stock_bucket.value,
            quantity_delta=dispatch_domain_tx.quantity_delta,
            occurred_at=datetime.now(UTC),
            recorded_at=datetime.now(UTC),
            user_id=dispatch_domain_tx.user_id,
            device_id=dispatch_domain_tx.device_id,
            transfer_id=dispatch_domain_tx.transfer_id,
            reason_code=dispatch_domain_tx.reason_code,
            reference_number=dispatch_domain_tx.reference_number,
        )
        session.add(db_dispatch_tx)

        # Update Store A stock balance
        bal_a = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-A", StockBalance.product_id == "PROD-1"
            )
        )
        bal_a.quantity += dispatch_domain_tx.quantity_delta
        session.commit()

    # Verify mid-state after dispatch
    with session_factory() as session:
        bal_a = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-A", StockBalance.product_id == "PROD-1"
            )
        )
        assert bal_a.quantity == 15

        bal_b = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-B", StockBalance.product_id == "PROD-1"
            )
        )
        assert bal_b.quantity == 0

    # 3. RECEIVED state: Destination stock increases (+5)
    with session_factory() as session:
        trf = session.scalar(select(Transfer).where(Transfer.id == transfer_id))
        validate_transfer_transition(TransferStatus(trf.status), TransferStatus.RECEIVED)
        trf.status = TransferStatus.RECEIVED.value

        from domain.entities import Transfer as DomainTransfer

        domain_trf = DomainTransfer(
            id=trf.id,
            source_store_id=trf.source_store_id,
            destination_store_id=trf.destination_store_id,
            product_id=trf.product_id,
            quantity=trf.quantity,
            status=TransferStatus.RECEIVED,
            created_by_user_id=trf.created_by_user_id,
        )

        receive_domain_tx = create_receive_transaction(
            domain_trf, user_id="USER-1", device_id="DEV-B"
        )
        db_receive_tx = InventoryTransaction(
            transaction_id=receive_domain_tx.transaction_id,
            store_id=receive_domain_tx.store_id,
            product_id=receive_domain_tx.product_id,
            movement_type=receive_domain_tx.movement_type.value,
            stock_bucket=receive_domain_tx.stock_bucket.value,
            quantity_delta=receive_domain_tx.quantity_delta,
            occurred_at=datetime.now(UTC),
            recorded_at=datetime.now(UTC),
            user_id=receive_domain_tx.user_id,
            device_id=receive_domain_tx.device_id,
            transfer_id=receive_domain_tx.transfer_id,
            reason_code=receive_domain_tx.reason_code,
            reference_number=receive_domain_tx.reference_number,
        )
        session.add(db_receive_tx)

        # Update Store B stock balance
        bal_b = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-B", StockBalance.product_id == "PROD-1"
            )
        )
        bal_b.quantity += receive_domain_tx.quantity_delta
        session.commit()

    # Final AT-005 verification
    with session_factory() as session:
        trf = session.scalar(select(Transfer).where(Transfer.id == transfer_id))
        assert trf.status == "RECEIVED"

        bal_a = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-A", StockBalance.product_id == "PROD-1"
            )
        )
        assert bal_a.quantity == 15  # 20 - 5 = 15

        bal_b = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-B", StockBalance.product_id == "PROD-1"
            )
        )
        assert bal_b.quantity == 5  # 0 + 5 = 5

        # Query both transactions by transfer_id
        txs = session.scalars(
            select(InventoryTransaction).where(InventoryTransaction.transfer_id == transfer_id)
        ).all()
        assert len(txs) == 2

        dispatch_tx = next(t for t in txs if t.store_id == "STORE-A")
        receive_tx = next(t for t in txs if t.store_id == "STORE-B")

        assert dispatch_tx.quantity_delta == -5
        assert receive_tx.quantity_delta == 5
        assert dispatch_tx.quantity_delta + receive_tx.quantity_delta == 0


def test_transfer_exception_and_cancelled_paths_integration(tmp_path):
    """
    Test EXCEPTION and CANCELLED workflow paths in storage layer.
    """
    session_factory = setup_test_db(tmp_path)
    transfer_id = f"TRF-{ULID()}"

    # 1. Create and dispatch transfer
    with session_factory() as session:
        db_transfer = Transfer(
            id=transfer_id,
            source_store_id="STORE-A",
            destination_store_id="STORE-B",
            product_id="PROD-1",
            quantity=4,
            status=TransferStatus.DISPATCHED.value,
            created_by_user_id="USER-1",
        )
        session.add(db_transfer)

        # Deduct 4 from Store A
        bal_a = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-A", StockBalance.product_id == "PROD-1"
            )
        )
        bal_a.quantity -= 4
        session.commit()

    # 2. Flag EXCEPTION
    with session_factory() as session:
        trf = session.scalar(select(Transfer).where(Transfer.id == transfer_id))
        validate_transfer_transition(TransferStatus(trf.status), TransferStatus.EXCEPTION)
        trf.status = TransferStatus.EXCEPTION.value
        trf.notes = "Damaged during transit"
        session.commit()

    with session_factory() as session:
        trf = session.scalar(select(Transfer).where(Transfer.id == transfer_id))
        assert trf.status == "EXCEPTION"

    # 3. Cancel dispatched/exception transfer and verify stock restoration
    with session_factory() as session:
        trf = session.scalar(select(Transfer).where(Transfer.id == transfer_id))
        validate_transfer_transition(TransferStatus(trf.status), TransferStatus.CANCELLED)
        trf.status = TransferStatus.CANCELLED.value

        from domain.entities import Transfer as DomainTransfer

        domain_trf = DomainTransfer(
            id=trf.id,
            source_store_id=trf.source_store_id,
            destination_store_id=trf.destination_store_id,
            product_id=trf.product_id,
            quantity=trf.quantity,
            status=TransferStatus.EXCEPTION,
            created_by_user_id=trf.created_by_user_id,
        )

        comp_domain_tx = create_cancel_compensation_transaction(
            domain_trf, user_id="USER-1", device_id="DEV-A"
        )
        assert comp_domain_tx is not None

        db_comp_tx = InventoryTransaction(
            transaction_id=comp_domain_tx.transaction_id,
            store_id=comp_domain_tx.store_id,
            product_id=comp_domain_tx.product_id,
            movement_type=comp_domain_tx.movement_type.value,
            stock_bucket=comp_domain_tx.stock_bucket.value,
            quantity_delta=comp_domain_tx.quantity_delta,
            occurred_at=datetime.now(UTC),
            recorded_at=datetime.now(UTC),
            user_id=comp_domain_tx.user_id,
            device_id=comp_domain_tx.device_id,
            transfer_id=comp_domain_tx.transfer_id,
            reason_code=comp_domain_tx.reason_code,
            reference_number=comp_domain_tx.reference_number,
        )
        session.add(db_comp_tx)

        bal_a = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-A", StockBalance.product_id == "PROD-1"
            )
        )
        bal_a.quantity += comp_domain_tx.quantity_delta
        session.commit()

    # Verify stock restored to Store A (back to 20)
    with session_factory() as session:
        trf = session.scalar(select(Transfer).where(Transfer.id == transfer_id))
        assert trf.status == "CANCELLED"

        bal_a = session.scalar(
            select(StockBalance).where(
                StockBalance.store_id == "STORE-A", StockBalance.product_id == "PROD-1"
            )
        )
        assert bal_a.quantity == 20
