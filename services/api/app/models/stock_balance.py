"""
StockBalance ORM model — central PostgreSQL.

Materialised quantity projection per (store, product, stock_bucket) triple
(Section 9.4).  Updated atomically with every accepted InventoryTransaction.

Mirrors packages/storage/storage/models/stock_balance.py but uses app.db.Base.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class StockBalance(Base):
    """Materialised stock quantity per store / product / bucket."""

    __tablename__ = "stock_balances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    store_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stores.id"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id"), nullable=False, index=True
    )
    stock_bucket: Mapped[str] = mapped_column(String(50), nullable=False, default="AVAILABLE")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "store_id",
            "product_id",
            "stock_bucket",
            name="uq_stock_balances_store_product_bucket",
        ),
        # Perf: /sync/pull delta filter sorts/orders by updated_at.
        Index("ix_stock_balances_updated_at", "updated_at"),
        # Composite index for common joins and bucket filtering.
        Index("ix_stock_balances_store_product_bucket", "store_id", "product_id", "stock_bucket"),
        Index("ix_stock_balances_product_bucket", "product_id", "stock_bucket"),
        # Partial index for delta sync performance (updated_at IS NOT NULL).
        Index("ix_stock_balances_updated_at_not_null", "updated_at", postgresql_where=text("updated_at IS NOT NULL")),
    )
