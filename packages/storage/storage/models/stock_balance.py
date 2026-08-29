"""
Stock balance model for local SQLite database.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from storage.db import Base


def current_utc_now() -> datetime:
    return datetime.now(UTC)


class StockBalance(Base):
    """Materialized quantity projection per product/store/bucket."""

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
        DateTime(timezone=True), default=current_utc_now, onupdate=current_utc_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "store_id", "product_id", "stock_bucket", name="uq_stock_balances_store_product_bucket"
        ),
    )
