"""
Transfer listing endpoint — read-only for web dashboard.

GET /api/v1/transfers
    List transfers with optional filters.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.transfer import Transfer
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transfers", tags=["transfers"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class TransferListItem(BaseModel):
    id: str
    source_store_id: str
    destination_store_id: str
    product_id: str
    quantity: int
    status: str
    created_by_user_id: int
    created_at: datetime
    dispatched_at: datetime | None
    received_at: datetime | None
    cancelled_at: datetime | None
    notes: str | None


class TransfersResponse(BaseModel):
    transfers: list[TransferListItem]
    total: int


# ---------------------------------------------------------------------------
# GET /api/v1/transfers
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=TransfersResponse,
    status_code=status.HTTP_200_OK,
    summary="List transfers",
)
async def list_transfers(
    store_id: str | None = Query(default=None, description="Filter by store"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=100, ge=1, le=500, description="Maximum results to return"),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(get_current_user),  # noqa: B008
) -> TransfersResponse:
    """
    Return a list of transfers with optional filters.
    Requires authentication.
    """
    stmt = select(Transfer).order_by(Transfer.created_at.desc()).offset(offset).limit(limit)

    if store_id is not None:
        stmt = stmt.where(
            (Transfer.source_store_id == store_id) | (Transfer.destination_store_id == store_id)
        )

    if status_filter is not None:
        stmt = stmt.where(Transfer.status == status_filter)

    result = await db.execute(stmt)
    transfers = result.scalars().all()

    # Get total count
    count_stmt = select(Transfer)
    if store_id is not None:
        count_stmt = count_stmt.where(
            (Transfer.source_store_id == store_id) | (Transfer.destination_store_id == store_id)
        )
    if status_filter is not None:
        count_stmt = count_stmt.where(Transfer.status == status_filter)

    count_result = await db.execute(count_stmt)
    total = len(count_result.scalars().all())

    return TransfersResponse(
        transfers=[
            TransferListItem(
                id=t.id,
                source_store_id=t.source_store_id,
                destination_store_id=t.destination_store_id,
                product_id=t.product_id,
                quantity=t.quantity,
                status=t.status,
                created_by_user_id=t.created_by_user_id,
                created_at=t.created_at,
                dispatched_at=t.dispatched_at,
                received_at=t.received_at,
                cancelled_at=t.cancelled_at,
                notes=t.notes,
            )
            for t in transfers
        ],
        total=total,
    )
