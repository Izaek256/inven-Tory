"""Add FTS5 virtual table for full-text product search.

This migration creates an FTS5 virtual table `products_fts` that mirrors the
searchable columns of the `products` table, plus triggers to keep it in sync
on INSERT, UPDATE, and DELETE operations.
"""

from alembic import op

revision: str = "0005_add_fts5_products"
down_revision: str = "0004_add_pin_hash_to_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute("""
        CREATE VIRTUAL TABLE products_fts USING fts5(
            sku,
            name,
            brand,
            model,
            category,
            barcode,
            alternate_names,
            content='products',
            content_rowid='rowid',
            tokenize='porter unicode61'
        )
        """)

    conn.execute("""
        CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
            INSERT INTO products_fts(rowid, sku, name, brand, model, category, barcode, alternate_names)
            VALUES (new.rowid, new.sku, new.name, new.brand, new.model, new.category, new.barcode, new.alternate_names);
        END
        """)

    conn.execute("""
        CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
            DELETE FROM products_fts WHERE rowid = old.rowid;
        END
        """)

    conn.execute("""
        CREATE TRIGGER products_au AFTER UPDATE ON products BEGIN
            DELETE FROM products_fts WHERE rowid = old.rowid;
            INSERT INTO products_fts(rowid, sku, name, brand, model, category, barcode, alternate_names)
            VALUES (new.rowid, new.sku, new.name, new.brand, new.model, new.category, new.barcode, new.alternate_names);
        END
        """)

    conn.execute("""
        INSERT INTO products_fts(products_fts) VALUES ('rebuild')
        """)


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute("DROP TRIGGER IF EXISTS products_au")
    conn.execute("DROP TRIGGER IF EXISTS products_ad")
    conn.execute("DROP TRIGGER IF EXISTS products_ai")
    conn.execute("DROP TABLE IF EXISTS products_fts")
