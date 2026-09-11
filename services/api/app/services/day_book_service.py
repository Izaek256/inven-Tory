"""
Day Book Service — Manages daily stock operation logs and balance sheets.

This service handles:
- Creating day books for stores on specific dates
- Adding entries to day books from stock transactions
- Generating balance sheets after sync operations
- Querying day books and entries for reporting
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.day_book import DayBook, DayBookEntry
from app.models.inventory_transaction import InventoryTransaction


async def get_or_create_day_book(
    db: AsyncSession,
    store_id: str,
    book_date: datetime,
) -> DayBook:
    """
    Get an existing day book for a store and date, or create one if it doesn't exist.

    Args:
        db: Database session
        store_id: Store identifier
        book_date: Date for the day book (will be normalized to start of day)

    Returns:
        DayBook instance
    """
    # Normalize to start of day
    book_date_normalized = book_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # Try to find existing day book
    result = await db.execute(
        select(DayBook).where(
            DayBook.store_id == store_id,
            func.date(DayBook.book_date) == book_date_normalized.date(),
        )
    )
    day_book = result.scalars().first()

    if day_book:
        return day_book

    # Create new day book
    day_book = DayBook(
        id=str(uuid.uuid4()),
        store_id=store_id,
        book_date=book_date_normalized,
        opening_balance=0,  # Will be calculated when entries are added
        balance_sheet_generated=False,
    )
    db.add(day_book)
    await db.flush()
    return day_book


async def add_transaction_to_day_book(
    db: AsyncSession,
    transaction: InventoryTransaction,
) -> DayBookEntry:
    """
    Add a transaction as an entry to the appropriate day book.

    Args:
        db: Database session
        transaction: The inventory transaction to add

    Returns:
        DayBookEntry instance
    """
    # Get or create the day book for this transaction's date and store
    day_book = await get_or_create_day_book(db, transaction.store_id, transaction.occurred_at)

    # Check if entry already exists for this transaction
    existing_result = await db.execute(
        select(DayBookEntry).where(DayBookEntry.transaction_id == transaction.transaction_id)
    )
    existing_entry = existing_result.scalars().first()

    if existing_entry:
        return existing_entry

    # Create new entry
    entry = DayBookEntry(
        id=str(uuid.uuid4()),
        day_book_id=day_book.id,
        transaction_id=transaction.transaction_id,
        movement_type=transaction.movement_type,
        product_id=transaction.product_id,
        quantity_delta=transaction.quantity_delta,
        stock_bucket=transaction.stock_bucket,
        reference_number=transaction.reference_number,
        reason_code=transaction.reason_code,
        notes=None,
        occurred_at=transaction.occurred_at,
    )
    db.add(entry)
    await db.flush()

    # Recalculate opening balance for the day book
    await _recalculate_day_book_balance(db, day_book)

    return entry


async def _recalculate_day_book_balance(db: AsyncSession, day_book: DayBook) -> None:
    """
    Recalculate the opening balance for a day book based on all AVAILABLE-bucket
    transactions before this day (excludes IN_TRANSIT to avoid double-counting
    TRANSFER_OUT/TRANSFER_IN pairs).

    The opening_balance stored on the DayBook is an aggregate across all products
    in the store — it's used only for the header row display. The per-product
    running_balance shown in entries is computed in get_day_book_with_entries.
    """
    result = await db.execute(
        select(func.sum(InventoryTransaction.quantity_delta)).where(
            InventoryTransaction.store_id == day_book.store_id,
            InventoryTransaction.stock_bucket == "AVAILABLE",
            InventoryTransaction.occurred_at < day_book.book_date,
            InventoryTransaction.sync_status != "REJECTED",
        )
    )
    total_delta = result.scalar() or 0

    day_book.opening_balance = total_delta
    await db.flush()


async def generate_balance_sheet(
    db: AsyncSession,
    day_book_id: str,
) -> dict:
    """
    Generate a balance sheet for a day book.

    This calculates the closing balance based on all entries in the day book
    and marks the balance sheet as generated.

    Args:
        db: Database session
        day_book_id: Day book identifier

    Returns:
        Dictionary containing balance sheet data
    """
    # Get the day book
    result = await db.execute(select(DayBook).where(DayBook.id == day_book_id))
    day_book = result.scalars().first()

    if not day_book:
        raise ValueError(f"Day book {day_book_id} not found")

    # Calculate closing balance (opening + sum of all entries)
    entries_result = await db.execute(
        select(func.sum(DayBookEntry.quantity_delta)).where(DayBookEntry.day_book_id == day_book_id)
    )
    entries_sum = entries_result.scalar() or 0

    closing_balance = day_book.opening_balance + entries_sum

    # Update day book
    day_book.closing_balance = closing_balance
    day_book.balance_sheet_generated = True
    day_book.balance_sheet_generated_at = datetime.now(UTC)
    await db.flush()

    # Get all entries for the balance sheet
    entries_result = await db.execute(
        select(DayBookEntry)
        .where(DayBookEntry.day_book_id == day_book_id)
        .order_by(DayBookEntry.occurred_at)
    )
    entries = entries_result.scalars().all()

    return {
        "day_book_id": day_book_id,
        "store_id": day_book.store_id,
        "book_date": day_book.book_date.isoformat(),
        "opening_balance": day_book.opening_balance,
        "closing_balance": closing_balance,
        "entries_count": len(entries),
        "generated_at": (
            day_book.balance_sheet_generated_at.isoformat()
            if day_book.balance_sheet_generated_at
            else None
        ),
        "entries": [
            {
                "id": entry.id,
                "transaction_id": entry.transaction_id,
                "movement_type": entry.movement_type,
                "product_id": entry.product_id,
                "quantity_delta": entry.quantity_delta,
                "stock_bucket": entry.stock_bucket,
                "reference_number": entry.reference_number,
                "reason_code": entry.reason_code,
                "occurred_at": entry.occurred_at.isoformat(),
            }
            for entry in entries
        ],
    }


async def get_day_books_for_store(
    db: AsyncSession,
    store_id: str,
    limit: int = 30,
    offset: int = 0,
) -> list[DayBook]:
    """
    Get day books for a specific store, ordered by date (most recent first).

    Args:
        db: Database session
        store_id: Store identifier
        limit: Maximum number of day books to return
        offset: Number of day books to skip

    Returns:
        List of DayBook instances
    """
    result = await db.execute(
        select(DayBook)
        .where(DayBook.store_id == store_id)
        .order_by(DayBook.book_date.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def get_day_book_with_entries(
    db: AsyncSession,
    day_book_id: str,
) -> dict | None:
    """
    Get a day book with all its entries, including product names and running balances.

    Args:
        db: Database session
        day_book_id: Day book identifier

    Returns:
        Dictionary containing day book and entries, or None if not found
    """
    from app.models.product import Product

    result = await db.execute(select(DayBook).where(DayBook.id == day_book_id))
    day_book = result.scalars().first()

    if not day_book:
        return None

    # Get entries with product names — only RECEIPT and SALE are shown in the
    # Day Book (what came in / what went out). ADJUSTMENT, RETURN, DAMAGE,
    # TRANSFER_IN, and TRANSFER_OUT are excluded from the visible ledger but
    # still update the underlying stock balance correctly.
    _DAY_BOOK_VISIBLE_TYPES = {"RECEIPT", "SALE"}

    entries_result = await db.execute(
        select(DayBookEntry, Product.name)
        .join(Product, DayBookEntry.product_id == Product.id)
        .where(
            DayBookEntry.day_book_id == day_book_id,
            DayBookEntry.movement_type.in_(_DAY_BOOK_VISIBLE_TYPES),
        )
        .order_by(DayBookEntry.occurred_at)
    )
    entries_with_products = list(entries_result.all())

    # Seed per-product opening balances from ALL prior AVAILABLE-bucket
    # transactions (same store). The Day Book only *displays* RECEIPT/SALE
    # entries, but the opening/closing balance math must reflect every
    # operation that touched stock (receives, recounts, returns, damage, etc.)
    # so the balance is always correct regardless of what's visibly logged.
    product_ids = list({e.product_id for e, _ in entries_with_products})
    product_running: dict[str, int] = {}
    if product_ids:
        from app.models.inventory_transaction import InventoryTransaction as TxnModel

        prior_result = await db.execute(
            select(
                TxnModel.product_id,
                func.sum(TxnModel.quantity_delta).label("prior_sum"),
            )
            .where(
                TxnModel.store_id == day_book.store_id,
                TxnModel.product_id.in_(product_ids),
                TxnModel.stock_bucket == "AVAILABLE",
                TxnModel.occurred_at < day_book.book_date,
                TxnModel.sync_status != "REJECTED",
            )
            .group_by(TxnModel.product_id)
        )
        for row in prior_result.all():
            product_running[row.product_id] = int(row.prior_sum or 0)

    # Calculate running balance for each entry — per product, starting from
    # that product's cumulative balance before today.
    entries_data = []

    for entry, product_name in entries_with_products:
        before = product_running.get(entry.product_id, 0)
        after = before + entry.quantity_delta
        product_running[entry.product_id] = after
        entries_data.append(
            {
                "id": entry.id,
                "transaction_id": entry.transaction_id,
                "movement_type": entry.movement_type,
                "product_id": entry.product_id,
                "product_name": product_name,
                "quantity_delta": entry.quantity_delta,
                "reference_number": entry.reference_number,
                "reason_code": entry.reason_code,
                "notes": entry.notes,
                "occurred_at": entry.occurred_at.isoformat(),
                "recorded_at": entry.recorded_at.isoformat(),
                "running_balance": after,
            }
        )

    return {
        "id": day_book.id,
        "store_id": day_book.store_id,
        "book_date": day_book.book_date.isoformat(),
        "opening_balance": day_book.opening_balance,
        "closing_balance": day_book.closing_balance,
        "balance_sheet_generated": day_book.balance_sheet_generated,
        "balance_sheet_generated_at": (
            day_book.balance_sheet_generated_at.isoformat()
            if day_book.balance_sheet_generated_at
            else None
        ),
        "created_at": day_book.created_at.isoformat(),
        "updated_at": day_book.updated_at.isoformat(),
        "entries": entries_data,
    }
