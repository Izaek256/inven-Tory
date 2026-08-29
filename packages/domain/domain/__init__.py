"""
INVENTORY Tory — domain package.

This package contains pure-Python domain entities and business rules.

ARCHITECTURAL CONSTRAINT: This package must have zero imports from
FastAPI, SQLAlchemy, or any other infrastructure framework. It is
the innermost ring of the clean architecture and must remain
independently testable without any database or web framework present.

Entities and rules are implemented in later issues:
    Issue 02: Core domain entities (Store, Product, InventoryTransaction, etc.)
    Issue 03: SQLite schema uses these entities (but not the reverse)
"""
