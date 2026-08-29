# infra/migrations — Alembic database migrations

Alembic migrations for the INVENTORY Tory central PostgreSQL database live here.

**Schema is implemented in Issue 03.** This directory is empty until then — only the Alembic configuration stub is present.

## Directory structure (after Issue 03)

```
infra/migrations/
├── alembic.ini          # Alembic configuration
├── env.py               # Migration environment (async SQLAlchemy)
├── script.py.mako       # Migration file template
└── versions/            # Generated migration files
    └── 0001_initial_schema.py
```

## Running migrations (after Issue 03)

```bash
# From repo root, with .venv activated:
cd infra/migrations
alembic upgrade head          # Apply all migrations
alembic downgrade -1          # Roll back one step
alembic history               # Show migration history
alembic current               # Show current revision
```

## Creating a new migration

```bash
alembic revision --autogenerate -m "describe_your_change"
```

Always review auto-generated migrations before committing. The golden rule from Appendix B applies here: migrations must never replace quantity columns — only add new event/transaction rows.
