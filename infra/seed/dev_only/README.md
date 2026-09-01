# Dev-Only Seed Fixtures

**WARNING: Never import or reference any file in this directory from shipped app code.**

These fixtures exist solely for local development and CI database setup.  They
contain fake data with deterministic IDs and insecure placeholder values that are
only safe in an isolated, non-production environment.

## What's here

| File | Purpose |
|------|---------|
| `seed_local_sqlite.py` | Seeds the local SQLite database used by the Tauri desktop app in dev |
| `seed_central_postgres.py` | Seeds the central PostgreSQL database with dev test users + stores |

## How to use

```bash
# Seed local SQLite (desktop dev)
python infra/seed/dev_only/seed_local_sqlite.py

# Seed central PostgreSQL (API dev, requires INVEN_TORY_DB_URL env var)
python infra/seed/dev_only/seed_central_postgres.py
```

## Security notes

- Password hashes in these files are bcrypt-hashed dev-only passwords.
  They are NOT production credentials.
- The `hashed_password` column exists ONLY in the central PostgreSQL `users` table.
  The local SQLite `users` table is a read-only identity cache — it has NO
  `hashed_password` column (enforced by migration 0002_drop_sqlite_password_column).
