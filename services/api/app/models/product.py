"""
Product ORM model — central PostgreSQL.

Mirrors packages/storage/storage/models/product.py but uses app.db.Base
(async SQLAlchemy + asyncpg) instead of the local SQLite Base.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


class Product(Base):
    """Master product catalogue entry — central record."""

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sku: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="pcs")
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    alternate_names: Mapped[str | None] = mapped_column(Text, nullable=True)
    serial_tracking_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Section 16.1 additions
    low_stock_threshold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warranty_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    batch_tracking_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False
    )

    __table_args__ = (
        # Section 16.2 indexes
        Index("ix_products_sku", "sku", unique=True),
        Index("ix_products_low_stock_threshold", "low_stock_threshold"),
    )
