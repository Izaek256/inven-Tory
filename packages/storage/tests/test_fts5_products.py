"""
FTS5 smoke tests for the desktop local SQLite `products` table.

P2 (optimization plan): verify (and guard) the FTS5 index that offline
search relies on — the `products_fts` virtual table created by migration
0005, including its INSERT/UPDATE/DELETE keep-in-sync triggers.
"""

from sqlalchemy import text

from storage.db import get_engine
from storage.migrations.runner import run_migrations


def _setup_engine(tmp_path, name: str = "fts5.db"):
    db_file = tmp_path / name
    db_url = f"sqlite:///{db_file}"
    run_migrations(db_url)
    return get_engine(db_url)


def _insert_product(conn, *, product_id: str, sku: str, name: str, brand: str | None = None) -> None:
    conn.execute(
        text(
            """
            INSERT INTO products (id, sku, name, brand, category, unit,
                                  serial_tracking_enabled, is_active,
                                  batch_tracking_enabled, created_at, updated_at)
            VALUES (:id, :sku, :name, :brand, 'General', 'pcs', 0, 1, 0,
                    datetime('now'), datetime('now'))
            """
        ),
        {"id": product_id, "sku": sku, "name": name, "brand": brand},
    )


def _match(conn, query: str) -> list[str]:
    """Run an FTS5 MATCH query and return the matched product names."""
    rows = conn.execute(
        text(
            "SELECT p.name FROM products_fts f "
            "JOIN products p ON p.rowid = f.rowid "
            "WHERE products_fts MATCH :q ORDER BY p.name"
        ),
        {"q": query},
    ).fetchall()
    return [r[0] for r in rows]


def test_fts5_match_returns_expected_results(tmp_path):
    """Basic MATCH: exact term, case-insensitive, prefix, no false hits."""
    engine = _setup_engine(tmp_path)
    with engine.begin() as conn:
        _insert_product(conn, product_id="P1", sku="SKU-MOUSE", name="Wireless Mouse")
        _insert_product(conn, product_id="P2", sku="SKU-KBD", name="Mechanical Keyboard")
        _insert_product(conn, product_id="P3", sku="SKU-CABLE", name="USB-C Cable")

    with engine.connect() as conn:
        # Exact term.
        assert _match(conn, "mouse") == ["Wireless Mouse"]
        # Case-insensitive.
        assert _match(conn, "MOUSE") == ["Wireless Mouse"]
        # Prefix query (as used by the Rust search_products command).
        # NOTE: not "key*" — the porter stemmer maps key -> kei, so short
        # prefixes can legitimately miss; keyb* exercises prefix search.
        assert _match(conn, "keyb*") == ["Mechanical Keyboard"]
        # Multi-term implicit AND must not return unrelated rows.
        assert _match(conn, "wireless cable") == []


def test_fts5_porter_stemming(tmp_path):
    """The porter tokenizer matches morphological variants."""
    engine = _setup_engine(tmp_path)
    with engine.begin() as conn:
        _insert_product(conn, product_id="P1", sku="SKU-SHOE", name="Running Shoes")

    with engine.connect() as conn:
        # "run" stems to the same root as "running".
        assert _match(conn, "run") == ["Running Shoes"]


def test_fts5_triggers_keep_index_in_sync(tmp_path):
    """INSERT / UPDATE / DELETE triggers keep products_fts current."""
    engine = _setup_engine(tmp_path)
    with engine.begin() as conn:
        _insert_product(conn, product_id="P1", sku="SKU-1", name="Old Name Widget")

    with engine.connect() as conn:
        assert _match(conn, "old") == ["Old Name Widget"]
        assert _match(conn, "brandnew") == []

    # UPDATE → the old term disappears, the new term is searchable.
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE products SET name = :name WHERE id = :id"),
            {"name": "BrandNew Widget", "id": "P1"},
        )

    with engine.connect() as conn:
        assert _match(conn, "old") == []
        assert _match(conn, "brandnew") == ["BrandNew Widget"]

    # DELETE → the row leaves the index entirely (no ghost entries: a bare
    # MATCH without the products JOIN must return nothing either).
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM products WHERE id = :id"), {"id": "P1"})

    with engine.connect() as conn:
        assert _match(conn, "brandnew") == []
        assert conn.execute(
            text("SELECT rowid FROM products_fts WHERE products_fts MATCH :q"),
            {"q": "brandnew"},
        ).fetchall() == []
