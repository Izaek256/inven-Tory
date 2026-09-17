"""add_day_books_tables

Revision ID: bdecea2c1d35
Revises: 0006_drop_transfer_fk
Create Date: 2026-09-17 20:27:58.753357

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'bdecea2c1d35'
down_revision: str | None = '0006_drop_transfer_fk'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create day_books table
    op.create_table(
        "day_books",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("book_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opening_balance", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("closing_balance", sa.Integer(), nullable=True),
        sa.Column("balance_sheet_generated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("balance_sheet_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_day_books_store_date", "day_books", ["store_id", "book_date"])

    # Create day_book_entries table
    op.create_table(
        "day_book_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("day_book_id", sa.String(length=36), nullable=False),
        sa.Column("transaction_id", sa.String(length=36), nullable=False),
        sa.Column("movement_type", sa.String(length=50), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column("quantity_delta", sa.Integer(), nullable=False),
        sa.Column("stock_bucket", sa.String(length=50), nullable=False, server_default=sa.text("'AVAILABLE'")),
        sa.Column("reference_number", sa.String(length=100), nullable=True),
        sa.Column("reason_code", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["day_book_id"], ["day_books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transaction_id"], ["inventory_transactions.transaction_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_day_book_entries_day_book", "day_book_entries", ["day_book_id"])
    op.create_index("idx_day_book_entries_transaction", "day_book_entries", ["transaction_id"])
    op.create_index("idx_day_book_entries_product", "day_book_entries", ["product_id"])


def downgrade() -> None:
    op.drop_index("idx_day_book_entries_product", table_name="day_book_entries")
    op.drop_index("idx_day_book_entries_transaction", table_name="day_book_entries")
    op.drop_index("idx_day_book_entries_day_book", table_name="day_book_entries")
    op.drop_table("day_book_entries")

    op.drop_index("idx_day_books_store_date", table_name="day_books")
    op.drop_table("day_books")
