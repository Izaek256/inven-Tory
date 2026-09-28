# infra/migrations — canonical Alembic chain for the central PostgreSQL database

This is the **single source of truth** for the invenTory central PostgreSQL
schema. Every schema change for that database is a revision in `versions/`.
There is no parallel raw-SQL migration directory and no `create_all` outside of
tests.

## Layout

```
infra/migrations/
├── alembic.ini     # Alembic config. URL from ALEMBIC_DB_URL, then DATABASE_URL.
├── env.py          # Async migration environment; imports every app.models.* class
├── script.py.mako  # Migration file template
└── versions/       # The revision chain (linear, exactly one head)
```

## Commands

Run every command from the **repository root** — no `cd` is needed, because
`script_location` is `%(here)s` and `env.py` puts `services/api` on `sys.path`
itself.

```bash
export ALEMBIC_DB_URL="postgresql+asyncpg://user:pass@localhost:5432/inventory"

alembic -c infra/migrations/alembic.ini upgrade head   # apply everything pending
alembic -c infra/migrations/alembic.ini upgrade +1    # apply one revision
alembic -c infra/migrations/alembic.ini downgrade -1  # roll back one revision
alembic -c infra/migrations/alembic.ini downgrade base # roll everything back
alembic -c infra/migrations/alembic.ini current       # applied revision
alembic -c infra/migrations/alembic.ini heads         # head revision(s); must be one
alembic -c infra/migrations/alembic.ini history       # full chain
```

## Revision chain

| Revision | File | What it does |
|----------|------|--------------|
| `0001_initial_postgres_schema` | `0001_initial_postgres_schema.py` | `stores`, `users`, `devices` |
| `0002_ledger_tables` | `0002_ledger_tables.py` | `products`, `transfers`, `inventory_transactions`, `stock_balances`, `sync_receipts`, `audit_events` |
| `0003_auth_consolidation` | `0003_auth_consolidation.py` | `users.assigned_store_id` + FK |
| `0004_fastapi_users_schema` | `0004_fastapi_users_schema.py` | Rebuild `users` for FastAPI-Users (integer PK, `is_superuser`, `is_verified`); retype the three inbound FKs |
| `0005_device_user_fk` | `0005_update_device_user_id_to_integer.py` | Recreate `devices.registered_by_user_id` FK under its canonical name |
| `0006_drop_transfer_fk` | `0006_drop_transfer_fk.py` | Drop `inventory_transactions.transfer_id` → `transfers.id` (desktop transfers never replicate) |
| `bdecea2c1d35` | `20260917_2027_bdecea2c1d35_add_day_books_tables.py` | `day_books`, `day_book_entries` |
| `0007_fts_and_composite_indexes` | `0007_add_fts_and_composite_indexes.py` | `products.ts_vector` + GIN index + trigger, delta-sync and dashboard indexes (absorbs the former `services/api/migrations/*.sql`) |

**Head:** `0007_fts_and_composite_indexes`.

## Adding a revision

```bash
alembic -c infra/migrations/alembic.ini revision --autogenerate -m "describe_change"
```

Then **read the generated file** before committing. Autogenerate is a starting
point, not an answer: it misses renames, triggers, partial indexes and FTS
statements, and it cannot see any model that is missing from `env.py`.

If you add a model class, add its import to `env.py` as well. A model absent
from that list is invisible to autogenerate, which will then propose dropping
the table its migration created.

## Rules

- **Never** use `alembic stamp` to reconcile a database. If a revision fails,
  fix the revision. `stamp` records a version as applied without applying it,
  leaving the schema silently wrong.
- Never modify an applied revision's behaviour in a way that changes an already
  deployed database. Add a new revision.
- A revision id must be at most **32 characters** — `alembic_version.version_num`
  is `VARCHAR(32)`.
- Golden rule: never rewrite quantity or balance columns. Add new
  event/transaction rows instead. See `docs/architecture.md`.
