"""
Domain enums for inventory transactions, stock buckets, and sync states.
"""

from enum import Enum


class MovementType(str, Enum):
    """Types of inventory movements supported in the ledger (FR-MOV-001 to FR-MOV-006)."""

    RECEIPT = "RECEIPT"
    SALE = "SALE"
    RETURN = "RETURN"
    TRANSFER = "TRANSFER"
    ADJUSTMENT = "ADJUSTMENT"
    DAMAGE = "DAMAGE"
    COUNT = "COUNT"
    OTHER = "OTHER"


class StockBucket(str, Enum):
    """Categorized inventory storage buckets."""

    AVAILABLE = "AVAILABLE"
    DAMAGED = "DAMAGED"
    QUARANTINE = "QUARANTINE"
    IN_TRANSIT = "IN_TRANSIT"


class SyncStatus(str, Enum):
    """Synchronization lifecycle state of an event (Section 9.1 & 10.3)."""

    PENDING = "PENDING"
    SENDING = "SENDING"
    SENT = "SENT"  # Backward compatibility alias for SENDING
    ACCEPTED = "ACCEPTED"
    SYNCED = "SYNCED"
    REJECTED = "REJECTED"  # Backward compatibility alias for PERMANENT_REJECTION
    RETRYABLE_ERROR = "RETRYABLE_ERROR"
    PERMANENT_REJECTION = "PERMANENT_REJECTION"
    EXCEPTION_REVIEW = "EXCEPTION_REVIEW"


class TransferStatus(str, Enum):
    """Inter-store transfer lifecycle state machine (Section 11)."""

    DRAFT = "DRAFT"
    DISPATCHED = "DISPATCHED"
    RECEIVED = "RECEIVED"
    EXCEPTION = "EXCEPTION"
    CANCELLED = "CANCELLED"
