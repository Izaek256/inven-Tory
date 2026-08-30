"""
INVENTORY Tory — domain package.

This package contains pure-Python domain entities and business rules.

ARCHITECTURAL CONSTRAINT: This package must have zero imports from
FastAPI, SQLAlchemy, or any other infrastructure framework. It is
the innermost ring of the clean architecture and must remain
independently testable without any database or web framework present.
"""

from domain.entities import InventoryTransaction, MovementType, StockBucket, SyncStatus
from domain.rules import (
    MissingAdjustmentReasonError,
    NegativeStockError,
    create_adjustment_transaction,
    create_reversal,
    project_balance,
    project_balances_by_store,
    project_global_balance,
    validate_transaction,
)

__all__ = [
    "InventoryTransaction",
    "MissingAdjustmentReasonError",
    "MovementType",
    "NegativeStockError",
    "StockBucket",
    "SyncStatus",
    "create_adjustment_transaction",
    "create_reversal",
    "project_balance",
    "project_balances_by_store",
    "project_global_balance",
    "validate_transaction",
]
