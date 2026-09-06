"""
Day Books API endpoints — Daily stock operation logs and balance sheets.

Provides endpoints for:
- Listing day books for a store
- Getting day book details with entries
- Generating balance sheets
- Querying daily operations
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.day_book_service import (
    generate_balance_sheet,
    get_day_book_with_entries,
    get_day_books_for_store,
)

router = APIRouter()


@router.get("/stores/{store_id}/day-books")
async def list_day_books(
    store_id: str,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict[str, Any]:
    """
    List day books for a specific store.
    
    Args:
        store_id: Store identifier
        limit: Maximum number of day books to return (default: 30, max: 100)
        offset: Number of day books to skip (default: 0)
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Dictionary containing list of day books
    """
    day_books = await get_day_books_for_store(db, store_id, limit, offset)
    
    return {
        "store_id": store_id,
        "day_books": [
            {
                "id": db.id,
                "store_id": db.store_id,
                "book_date": db.book_date.isoformat(),
                "opening_balance": db.opening_balance,
                "closing_balance": db.closing_balance,
                "balance_sheet_generated": db.balance_sheet_generated,
                "balance_sheet_generated_at": db.balance_sheet_generated_at.isoformat() if db.balance_sheet_generated_at else None,
                "created_at": db.created_at.isoformat(),
                "updated_at": db.updated_at.isoformat(),
            }
            for db in day_books
        ],
        "count": len(day_books),
        "limit": limit,
        "offset": offset,
    }


@router.get("/day-books/{day_book_id}")
async def get_day_book(
    day_book_id: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict[str, Any]:
    """
    Get a specific day book with all its entries.
    
    Args:
        day_book_id: Day book identifier
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Dictionary containing day book details and entries
    """
    day_book = await get_day_book_with_entries(db, day_book_id)
    
    if not day_book:
        raise HTTPException(status_code=404, detail="Day book not found")
    
    return day_book


@router.post("/day-books/{day_book_id}/balance-sheet")
async def create_balance_sheet(
    day_book_id: str,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict[str, Any]:
    """
    Generate a balance sheet for a day book.
    
    This calculates the closing balance and marks the balance sheet as generated.
    Can only be called after the system is synced for the day.
    
    Args:
        day_book_id: Day book identifier
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Dictionary containing balance sheet data
    """
    try:
        balance_sheet = await generate_balance_sheet(db, day_book_id)
        return balance_sheet
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/stores/{store_id}/day-books/by-date")
async def get_day_book_by_date(
    store_id: str,
    date: str,  # Format: YYYY-MM-DD
    db: AsyncSession = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict[str, Any]:
    """
    Get a day book for a specific store and date.
    
    Args:
        store_id: Store identifier
        date: Date in YYYY-MM-DD format
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Dictionary containing day book details and entries
    """
    try:
        book_date = datetime.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    from app.services.day_book_service import get_or_create_day_book
    
    day_book = await get_or_create_day_book(db, store_id, book_date)
    day_book_data = await get_day_book_with_entries(db, day_book.id)
    
    if not day_book_data:
        raise HTTPException(status_code=404, detail="Day book not found")
    
    return day_book_data
