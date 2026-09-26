"""Fix FTS5 keep-in-sync triggers for external-content table.

The triggers created by 0005 used plain `DELETE FROM products_fts WHERE
rowid = old.rowid`. For an *external-content* FTS5 table, that statement
re-reads the column values from the content table (which already holds the
new/removed row), so the old tokens are never removed from the index:
UPDATE leaves stale terms matching and DELETE leaves ghost entries.

Recreate the triggers using the official FTS5 `'delete'` command with
explicit old values, then rebuild the index to clear accumulated garbage.
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0006_fix_fts5_triggers"
down_revision: str = "0005_add_fts5_products"
branch_labels = None
depends_on = None

_COLUMNS = "sku, name, brand, model, category, barcode, alternate_names"
_OLD_VALUES = (
    "old.sku, old.name, old.brand, old.model, old.category, old.barcode, old.alternate_names"
)
_NEW_VALUES = (
    "new.sku, new.name, new.brand, new.model, new.category, new.barcode, new.alternate_names"
)


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("DROP TRIGGER IF EXISTS products_au"))
    conn.execute(sa.text("DROP TRIGGER IF EXISTS products_ad"))
    conn.execute(sa.text("DROP TRIGGER IF EXISTS products_ai"))

    conn.execute(sa.text(f"""
        CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
            INSERT INTO products_fts(rowid, {_COLUMNS})
            VALUES (new.rowid, {_NEW_VALUES});
        END
        """))

    conn.execute(sa.text(f"""
        CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
            INSERT INTO products_fts(products_fts, rowid, {_COLUMNS})
            VALUES ('delete', old.rowid, {_OLD_VALUES});
        END
        """))

    conn.execute(sa.text(f"""
        CREATE TRIGGER products_au AFTER UPDATE ON products BEGIN
            INSERT INTO products_fts(products_fts, rowid, {_COLUMNS})
            VALUES ('delete', old.rowid, {_OLD_VALUES});
            INSERT INTO products_fts(rowid, {_COLUMNS})
            VALUES (new.rowid, {_NEW_VALUES});
        END
        """))

    conn.execute(sa.text("INSERT INTO products_fts(products_fts) VALUES ('rebuild')"))


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("DROP TRIGGER IF EXISTS products_au"))
    conn.execute(sa.text("DROP TRIGGER IF EXISTS products_ad"))
    conn.execute(sa.text("DROP TRIGGER IF EXISTS products_ai"))

    conn.execute(sa.text("""
        CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
            DELETE FROM products_fts WHERE rowid = old.rowid;
        END
        """))

    conn.execute(sa.text(f"""
        CREATE TRIGGER products_au AFTER UPDATE ON products BEGIN
            DELETE FROM products_fts WHERE rowid = old.rowid;
            INSERT INTO products_fts(rowid, {_COLUMNS})
            VALUES (new.rowid, {_NEW_VALUES});
        END
        """))

    conn.execute(sa.text("""
        CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
            INSERT INTO products_fts(rowid, sku, name, brand, model, category, barcode, alternate_names)
            VALUES (new.rowid, new.sku, new.name, new.brand, new.model, new.category, new.barcode, new.alternate_names);
        END
        """))

    conn.execute(sa.text("INSERT INTO products_fts(products_fts) VALUES ('rebuild')"))
