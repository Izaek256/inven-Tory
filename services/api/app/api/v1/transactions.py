"""
Transaction ledger endpoint — read-only for web dashboard and desktop ledger view.

GET /api/v1/transactions
    List transactions with filters for store, product, movement type, date range.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.inventory_transaction import InventoryTransaction
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["transactions"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class TransactionListItem(BaseModel):
    transaction_id: str
    store_id: str
    product_id: str
    movement_type: str
    stock_bucket: str
    quantity_delta: int
    occurred_at: datetime
    user_id: int
    device_id: str
    reference_number: str | None
    reason_code: str | None
    sync_status: str
    server_accepted_at: datetime | None


class TransactionsResponse(BaseModel):
    transactions: list[TransactionListItem]
    total: int


# ---------------------------------------------------------------------------
# GET /api/v1/transactions
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=TransactionsResponse,
    status_code=status.HTTP_200_OK,
    summary="List transactions",
)
async def list_transactions(
    store_id: str | None = Query(default=None, description="Filter by store"),
    product_id: str | None = Query(default=None, description="Filter by product"),
    movement_type: str | None = Query(default=None, description="Filter by movement type"),
    from_date: str | None = Query(default=None, description="ISO date string (from)"),
    to_date: str | None = Query(default=None, description="ISO date string (to)"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=100, ge=1, le=500, description="Maximum results to return"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> TransactionsResponse:
    """
    Return a list of transactions with optional filters.
    Requires authentication.
    """
    stmt = (
        select(InventoryTransaction)
        .order_by(InventoryTransaction.occurred_at.desc())
        .offset(offset)
        .limit(limit)
    )

    if store_id is not None:
        stmt = stmt.where(InventoryTransaction.store_id == store_id)

    if product_id is not None:
        stmt = stmt.where(InventoryTransaction.product_id == product_id)

    if movement_type is not None:
        stmt = stmt.where(InventoryTransaction.movement_type == movement_type)

    if from_date is not None:
        try:
            from_dt = datetime.fromisoformat(from_date)
            stmt = stmt.where(InventoryTransaction.occurred_at >= from_dt)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid from_date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
            )

    if to_date is not None:
        try:
            to_dt = datetime.fromisoformat(to_date)
            stmt = stmt.where(InventoryTransaction.occurred_at <= to_dt)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid to_date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)",
            )

    result = await db.execute(stmt)
    transactions = result.scalars().all()

    # Get total count
    count_stmt = select(InventoryTransaction)
    if store_id is not None:
        count_stmt = count_stmt.where(InventoryTransaction.store_id == store_id)
    if product_id is not None:
        count_stmt = count_stmt.where(InventoryTransaction.product_id == product_id)
    if movement_type is not None:
        count_stmt = count_stmt.where(InventoryTransaction.movement_type == movement_type)
    if from_date is not None:
        try:
            from_dt = datetime.fromisoformat(from_date)
            count_stmt = count_stmt.where(InventoryTransaction.occurred_at >= from_dt)
        except ValueError:
            pass
    if to_date is not None:
        try:
            to_dt = datetime.fromisoformat(to_date)
            count_stmt = count_stmt.where(InventoryTransaction.occurred_at <= to_dt)
        except ValueError:
            pass

    count_result = await db.execute(count_stmt)
    total = len(count_result.scalars().all())

    return TransactionsResponse(
        transactions=[
            TransactionListItem(
                transaction_id=tx.transaction_id,
                store_id=tx.store_id,
                product_id=tx.product_id,
                movement_type=tx.movement_type,
                stock_bucket=tx.stock_bucket,
                quantity_delta=tx.quantity_delta,
                occurred_at=tx.occurred_at,
                user_id=tx.user_id,
                device_id=tx.device_id,
                reference_number=tx.reference_number,
                reason_code=tx.reason_code,
                sync_status=tx.sync_status,
                server_accepted_at=tx.server_accepted_at,
            )
            for tx in transactions
        ],
        total=total,
    )
