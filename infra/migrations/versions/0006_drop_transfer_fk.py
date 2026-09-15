"""Drop the FK from inventory_transactions.transfer_id to transfers.id.

Desktop transfers are created locally in the desktop SQLite DB and are never
replicated to the central server: the server's transfers table is only
populated by /api/v1/transfers interactions (web dashboard, read-only).

Because inventory_transactions.transfer_id was declared with a hard FK to
transfers.id, every TRANSFER_OUT / TRANSFER_IN event pushed from the desktop
was rejected with an "inventory_transactions_transfer_id_fkey" violation,
leaving those events stuck in RETRYABLE_ERROR and blocking outbox draining
("sync no longer works", transfer quantities never converge).

transfer_id is a client-generated correlation ID; the server should store it
as a plain nullable string without a referential constraint.

Revision ID: 0006_drop_transfer_fk
Revises: 0005_device_user_fk
Create Date: 2026-09-14 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006_drop_transfer_fk"
down_revision: str | None = "0005_device_user_fk"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "inventory_transactions_transfer_id_fkey",
        "inventory_transactions",
        type_="foreignkey",
    )


def downgrade() -> None:
    op.create_foreign_key(
        "inventory_transactions_transfer_id_fkey",
        "inventory_transactions",
        "transfers",
        ["transfer_id"],
        ["id"],
    )