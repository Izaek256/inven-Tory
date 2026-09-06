"""
Day Book Model — Daily stock operation logs and balance sheets.

A Day Book represents all stock operations for a specific store on a specific day.
It provides a complete audit trail of daily activities and can generate balance sheets
after sync operations.
"""

from datetime import UTC, datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class DayBook(Base):
    """
    Represents a day book for a specific store and date.
    
    Each day book contains:
    - All stock operations for that day
    - Opening balance
    - Closing balance (calculated after sync)
    - Balance sheet generation status
    """
    __tablename__ = "day_books"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    store_id: Mapped[str] = mapped_column(String(36), ForeignKey("stores.id"), nullable=False, index=True)
    book_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    
    # Balance information
    opening_balance: Mapped[int] = mapped_column(Integer, default=0)
    closing_balance: Mapped[int] = mapped_column(Integer, nullable=True)
    
    # Balance sheet status
    balance_sheet_generated: Mapped[bool] = mapped_column(default=False)
    balance_sheet_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC)
    )
    
    # Relationships
    store = relationship("Store", back_populates="day_books")
    entries = relationship("DayBookEntry", back_populates="day_book", cascade="all, delete-orphan")
    
    # Indexes for efficient querying
    __table_args__ = (
        Index("idx_day_books_store_date", "store_id", "book_date"),
    )


class DayBookEntry(Base):
    """
    Individual stock operation entry within a day book.
    
    Each entry represents a single stock movement (sale, receipt, return, etc.)
    that occurred on the day book date for the specific store.
    """
    __tablename__ = "day_book_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    day_book_id: Mapped[str] = mapped_column(String(36), ForeignKey("day_books.id"), nullable=False, index=True)
    
    # Reference to the original transaction
    transaction_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_transactions.transaction_id"), nullable=False, index=True)
    
    # Entry details
    movement_type: Mapped[str] = mapped_column(String(50), nullable=False)  # SALE, RECEIPT, RETURN, etc.
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    quantity_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    stock_bucket: Mapped[str] = mapped_column(String(50), default="AVAILABLE")
    
    # Additional context
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timestamps
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(UTC)
    )
    
    # Relationships
    day_book = relationship("DayBook", back_populates="entries")
    transaction = relationship("InventoryTransaction")
    product = relationship("Product")
    
    # Indexes for efficient querying
    __table_args__ = (
        Index("idx_day_book_entries_day_book", "day_book_id"),
        Index("idx_day_book_entries_transaction", "transaction_id"),
        Index("idx_day_book_entries_product", "product_id"),
    )
