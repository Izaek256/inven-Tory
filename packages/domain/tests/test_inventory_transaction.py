"""
Unit tests for InventoryTransaction entity.
"""

from datetime import UTC, datetime

import pytest

from domain.entities.enums import MovementType, StockBucket, SyncStatus
from domain.entities.inventory_transaction import InventoryTransaction


def test_inventory_transaction_creation_defaults() -> None:
    now = datetime.now(UTC)
    tx = InventoryTransaction(
        store_id="store-a",
        product_id="hisense-120l",
        movement_type=MovementType.RECEIPT,
        quantity_delta=100,
        occurred_at=now,
        user_id="user-1",
        device_id="dev-1",
    )

    assert len(tx.transaction_id) == 26  # Valid ULID string length
    assert tx.store_id == "store-a"
    assert tx.product_id == "hisense-120l"
    assert tx.movement_type == MovementType.RECEIPT
    assert tx.quantity_delta == 100
    assert tx.stock_bucket == StockBucket.AVAILABLE
    assert tx.sync_status == SyncStatus.PENDING
    assert tx.reference_number is None
    assert tx.original_transaction_id is None


def test_inventory_transaction_string_enum_coercion() -> None:
    now = datetime.now(UTC)
    tx = InventoryTransaction(
        store_id="store-b",
        product_id="hisense-120l",
        movement_type="SALE",  # String instead of MovementType enum
        quantity_delta=-5,
        occurred_at=now,
        user_id="user-2",
        device_id="dev-2",
        stock_bucket="DAMAGED",  # String instead of StockBucket enum
        sync_status="ACCEPTED",  # String instead of SyncStatus enum
    )

    assert tx.movement_type == MovementType.SALE
    assert tx.stock_bucket == StockBucket.DAMAGED
    assert tx.sync_status == SyncStatus.ACCEPTED


def test_inventory_transaction_immutability() -> None:
    now = datetime.now(UTC)
    tx = InventoryTransaction(
        store_id="store-a",
        product_id="prod-1",
        movement_type=MovementType.RECEIPT,
        quantity_delta=10,
        occurred_at=now,
        user_id="user-1",
        device_id="dev-1",
    )

    with pytest.raises(AttributeError):
        tx.quantity_delta = 20  # type: ignore[misc]


def test_inventory_transaction_quantity_delta_type_validation() -> None:
    now = datetime.now(UTC)
    with pytest.raises(TypeError, match="quantity_delta must be an integer"):
        InventoryTransaction(
            store_id="store-a",
            product_id="prod-1",
            movement_type=MovementType.RECEIPT,
            quantity_delta="10",  # type: ignore[arg-type]
            occurred_at=now,
            user_id="user-1",
            device_id="dev-1",
        )


def test_inventory_transaction_quantity_delta_bool_rejection() -> None:
    now = datetime.now(UTC)
    with pytest.raises(TypeError, match="quantity_delta must be an integer"):
        InventoryTransaction(
            store_id="store-a",
            product_id="prod-1",
            movement_type=MovementType.RECEIPT,
            quantity_delta=True,  # type: ignore[arg-type]
            occurred_at=now,
            user_id="user-1",
            device_id="dev-1",
        )


def test_inventory_transaction_invalid_enum_types_rejection() -> None:
    now = datetime.now(UTC)
    base_kwargs = {
        "store_id": "store-a",
        "product_id": "prod-1",
        "quantity_delta": 10,
        "occurred_at": now,
        "user_id": "user-1",
        "device_id": "dev-1",
    }

    with pytest.raises(TypeError, match="movement_type must be a MovementType or string"):
        InventoryTransaction(
            movement_type=123,  # type: ignore[arg-type]
            **base_kwargs,
        )

    with pytest.raises(TypeError, match="stock_bucket must be a StockBucket or string"):
        InventoryTransaction(
            movement_type=MovementType.RECEIPT,
            stock_bucket=True,  # type: ignore[arg-type]
            **base_kwargs,
        )

    with pytest.raises(TypeError, match="sync_status must be a SyncStatus or string"):
        InventoryTransaction(
            movement_type=MovementType.RECEIPT,
            sync_status=456,  # type: ignore[arg-type]
            **base_kwargs,
        )


def test_inventory_transaction_invalid_enum_strings_rejection() -> None:
    now = datetime.now(UTC)
    base_kwargs = {
        "store_id": "store-a",
        "product_id": "prod-1",
        "quantity_delta": 10,
        "occurred_at": now,
        "user_id": "user-1",
        "device_id": "dev-1",
    }

    with pytest.raises(ValueError):
        InventoryTransaction(
            movement_type="INVALID_MOVEMENT",  # type: ignore[arg-type]
            **base_kwargs,
        )

    with pytest.raises(ValueError):
        InventoryTransaction(
            movement_type=MovementType.RECEIPT,
            stock_bucket="NON_EXISTENT_BUCKET",  # type: ignore[arg-type]
            **base_kwargs,
        )

    with pytest.raises(ValueError):
        InventoryTransaction(
            movement_type=MovementType.RECEIPT,
            sync_status="UNKNOWN_STATUS",  # type: ignore[arg-type]
            **base_kwargs,
        )

