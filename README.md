# <img src="https://res.cloudinary.com/dun3og1nu/image/upload/v1788902797/app-icon_fleogl.svg" alt="invenTory Logo" height="40" valign="middle"> invenTory

> Offline-First, Multi-Store Inventory Management System — v1.1.0

[![CI](https://github.com/Izaek256/inven-Tory/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/Izaek256/inven-Tory/actions/workflows/ci.yml)
[![Logo](https://img.shields.io/badge/logo-teal%20barcode-%23085041?logoWidth=12&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzA4NTA0MSIvPjxwYXRoIGQ9Ik0xMjggMTI4aDMydjI1NmgtMzJ6bTY0IDBoMTZ2MjU2aC0xNnptNDQgMGgzMnYyNTZoLTMyem02NCAwaDE2djI1NmgtMTZ6bTQ0IDBoMzJ2MjU2aC0zMnoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=)](https://res.cloudinary.com/dun3og1nu/image/upload/v1788902797/app-icon_fleogl.svg)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Repository Structure](#repository-structure)
4. [Prerequisites](#prerequisites)
5. [Local Development Setup](#local-development-setup)
6. [Database Migrations](#database-migrations)
7. [Seeding & Bootstrapping](#seeding--bootstrapping)
8. [Running the Applications](#running-the-applications)
9. [Quick-Start Commands](#quick-start-commands)
10. [Authentication Workflow](#authentication-workflow)
11. [Linters & Formatters](#linters--formatters)
12. [Running Tests](#running-tests)
13. [Docker Deployment](#docker-deployment)
14. [CI/CD](#cicd)
15. [Contributing](#contributing)
16. [License](#license)

---

## Project Overview

**invenTory** is a transaction-driven, offline-first inventory platform designed for businesses operating multiple physical stores. The core architectural principle is that **every stock movement is a durable, immutable event** — never directly mutate quantity columns; always append a transaction.

Stores run fully offline on the Tauri desktop app using a local SQLite database. When network connectivity returns, synchronization to the central PostgreSQL cloud database happens automatically in the background via a batched outbox pattern.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Offline-First** | Desktop app works 100% without internet. SQLite stores all data locally with bcrypt-based offline authentication. |
| **Multi-Store** | Logical partitioning by `store_id`. Users are assigned to a single store; `GLOBAL_ADMIN` sees everything. |
| **Event Ledger** | Every stock movement (RECEIVE, SALE, RETURN, ADJUSTMENT, DAMAGE, TRANSFER) is an immutable `InventoryTransaction` row. Stock balances are derived projections. |
| **Auto Sync** | Outbox events (ADJUSTMENT, RECEIPT, SALE) push in batches when the API is reachable. Background token upgrade handles auth handoff from offline → JWT. |
| **Role-Based Access** | Six roles: `GLOBAL_ADMIN`, `INVENTORY_MANAGER`, `STORE_MANAGER`, `STORE_CLERK`, `AUDITOR`, `SYNC`. |
| **Day Books & Reporting** | Close-of-day books with PDF balance-sheet export. |
| **Device Auto-Registration** | Desktop generates a stable device ID on first launch and auto-registers on the first successful API login — zero pre-provisioning friction. |

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Desktop Shell** | Tauri 2 (Rust) | Cross-platform native wrapper. Secure store for device identity and session tokens. |
| **Desktop UI** | React 18 + TypeScript + Vite 5 | Vitest for unit tests. Shared UI components from `@invenTory/ui`. |
| **Local Database** | SQLite + SQLAlchemy 2.0 (async) | Alembic migrations at `packages/storage/storage/migrations/`. |
| **Cloud API** | FastAPI 0.141 + Python 3.12 | Uvicorn (standard) ASGI server. Async SQLAlchemy + asyncpg. |
| **Cloud ORM** | SQLAlchemy 2.0 (async) | Alembic migrations at `infra/migrations/versions/`. |
| **Cloud Database** | PostgreSQL 16 | Runs via Docker Compose in development. |
| **Auth (API)** | FastAPI-Users 15 + bcrypt 4 + python-jose | Custom login endpoint with device auto-registration. |
| **Auth (Desktop)** | Bcrypt (offline pin_hash) → background JWT upgrade | `tauriAuthService.ts` manages the transition. |
| **Remote Dashboard** | React 18 + TypeScript + Vite 5 | Port 3000 in dev. Uses the shared `@invenTory/ui` package. |
| **Mobile Companion** | React 18 + TypeScript + Vite 5 | Read-only responsive view. Port 3001 in dev. |
| **Shared Domain Logic** | Pure Python package (`packages/domain`) | Zero framework deps. Business rules for ledgers, transfers, outbox state machine. |
| **Shared Types (TS)** | `@invenTory/shared-types` | Workspace package. Single source of truth for TS interfaces shared across desktop/web/mobile. |
| **Shared UI (TS)** | `@invenTory/ui` | Reusable React components: Button, Card, Table, Modal, LinearGridEntry, etc. |
| **Linting (Python)** | ruff 0.5+ | Replaces flake8 + isort + pyupgrade. Config in `pyproject.toml`. |
| **Formatting (Python)** | black 24+ | Uncompromising formatter. 100-char line length. |
| **Linting (TS)** | ESLint 8 + @typescript-eslint | Per-workspace `.eslintrc.json`. |
| **Formatting (TS)** | Prettier 3.3+ | Per-workspace `.prettierrc`. |
| **Containerization** | Docker + Docker Compose | `infra/docker/` for Postgres + API. |
| **CI** | GitHub Actions | `.github/workflows/ci.yml` — lint + test on every PR. |

---

## Repository Structure

```
inven-Tory/
├── apps/                          # Frontend applications (npm workspaces)
│   ├── desktop/                   # Tauri 2 + React desktop app (POS + store mgmt)
│   │   ├── src/                   #   React TSX source
│   │   │   ├── components/        #     App-specific components (Header, Sidebar, Modals)
│   │   │   ├── services/          #     tauri{Auth,Sync,Product,Store,Transaction,Transfer}Service
│   │   │   ├── hooks/             #     useAppState, usePersistentState
│   │   │   ├── views/             #     Login, Dashboard, Products, Receive, Sale, Return, etc.
│   │   │   └── __tests__/         #     Vitest unit tests
│   │   ├── src-tauri/             #   Rust backend (lib.rs, main.rs, tauri.conf.json)
│   │   ├── .env.example           #   VITE_API_BASE_URL, VITE_APP_VERSION
│   │   └── package.json           #   Scripts: dev, build, tauri, lint, test
│   ├── web/                       # React remote management dashboard
│   │   ├── src/                   #   Login, Search, Store, Users, UnifiedDashboard views
│   │   ├── .env.example           #   VITE_API_BASE_URL, VITE_APP_VERSION
│   │   └── package.json           #   Port 3000
│   └── mobile/                    # React read-only mobile companion
│       ├── src/                   #   MobileLoginForm + App shell
│       ├── .env.example           #   VITE_API_BASE_URL
│       └── package.json           #   Port 3001
│
├── packages/                      # Shared code (Python packages + npm workspaces)
│   ├── domain/                    # Pure Python domain logic (NO framework deps)
│   │   ├── domain/
│   │   │   ├── entities/          #   InventoryTransaction, Transfer, enums
│   │   │   └── rules/             #   Ledger rules, transfer rules, outbox state machine
│   │   ├── tests/                 # pytest unit tests
│   │   └── pyproject.toml         # Deps: python-ulid only
│   │
│   ├── storage/                   # SQLite models, migrations, seed logic (Python)
│   │   ├── storage/
│   │   │   ├── models/            #   User, Store, Product, Device, StockBalance, Transfer, OutboxEvent
│   │   │   ├── migrations/        #   Alembic SQLite migrations (versions/ 0001-0005)
│   │   │   │   └── runner.py      #   Programmatic migration runner: run_migrations(db_url)
│   │   │   ├── services/          #   OutboxService for sync queuing
│   │   │   ├── db.py              #   get_engine, get_sessionmaker
│   │   │   └── seed.py            #   Seed helpers
│   │   ├── tests/                 # pytest integration tests
│   │   └── pyproject.toml         # Deps: SQLAlchemy, Alembic, python-ulid, inven-tory-domain
│   │
│   ├── shared-types/              # Shared TypeScript interfaces (npm workspace)
│   │   └── src/index.ts           #   Auth, Product, Store, Sync, Transaction, Transfer types
│   │
│   └── ui/                        # Shared React UI components (npm workspace)
│       └── src/                   #   Button, Card, Table, Modal, LinearGridEntry, Spinner, Toast, etc.
│
├── services/
│   └── api/                       # FastAPI central API service
│       ├── app/
│       │   ├── api/v1/            #   Route modules: auth, products, stores, sync, transactions, transfers, devices, day_books, users
│       │   ├── auth/              #   FastAPI-Users backend + manager
│       │   ├── core/              #   Config, security (hash_password, create_access_token), permissions
│       │   ├── models/            #   SQLAlchemy ORM models (PG): User, Store, Product, Device, InventoryTransaction, etc.
│       │   ├── services/          #   DayBookService, ingestion (sync push handler)
│       │   ├── db.py              #   Async engine + session
│       │   └── main.py            #   FastAPI app factory, CORS, routes
│       ├── migrations/            #   Manual SQL migrations (001_add_day_books.sql)
│       ├── tests/                 # pytest API tests (httpx AsyncClient)
│       ├── .env.example           #   DATABASE_URL, SECRET_KEY, CORS_ORIGINS_RAW, etc.
│       └── pyproject.toml         # Deps: FastAPI, SQLAlchemy[asyncio], asyncpg, Alembic, FastAPI-Users, etc.
│
├── infra/
│   ├── docker/                    # Docker Compose for local PG + API
│   │   ├── docker-compose.yml     #   postgres:16-alpine + API (live-reload mounts)
│   │   └── Dockerfile.api         #   Multi-stage Python API image
│   ├── migrations/                # Alembic PostgreSQL migrations (central DB)
│   │   ├── versions/              #   0001-0005: initial schema, ledger tables, auth consolidation, fastapi-users schema, device user_id int
│   │   ├── alembic.ini            #   Alembic config (uses DATABASE_URL env)
│   │   ├── env.py                 #   Async SQLAlchemy env
│   │   └── README.md
│   └── seed/
│       ├── genesis_single_user.py #  ★ ONE-TIME BOOTSTRAP ★ Seeds PG + SQLite with YOUR admin user
│       └── dev_only/              #   Dev-only seeds: seed_central_postgres.py, seed_local_sqlite.py
│
├── tests/                         # Integration test documentation (see README.md inside)
├── docs/
│   └── architecture.md            # Design docs
├── scripts/
│   └── write_hook.py              # Helper for git hook setup
├── .githooks/                     # Git hooks (auto-activated via `npm install`)
│   ├── pre-commit                 # Prettier --write on staged .ts/.tsx
│   └── pre-push                   # ruff + black + prettier --check (blocks push on failure)
├── .github/workflows/ci.yml       # GitHub Actions CI pipeline
├── Makefile                       # Helpers: make lint, make lint-check, make test, make setup-hooks
├── pyproject.toml                 # Root Python tool config (ruff, black, pytest)
├── package.json                   # Root npm workspace config (lint, test, format, prepare hook)
├── .env.example                   # Shared env template (copy to .env)
├── CONTRIBUTING.md                # Branch naming, commit style, PR checklist, coding standards
├── Inventory_Tory_v1_1_0_SRS.md   # Software Requirements Specification
└── README.md                      # This file
```

---

## Prerequisites

Install these **before** attempting setup. The minimum versions are tested and enforced by CI.

| Tool | Minimum Version | Installation |
|------|----------------|--------------|
| **Python** | 3.12.x | [python.org/downloads](https://www.python.org/downloads/) — on Windows, check "Add Python to PATH". Verify: `python3 --version` |
| **Node.js** | 20.x LTS | [nodejs.org](https://nodejs.org/) — comes with npm 10. Verify: `node --version && npm --version` |
| **npm** | 10.x | Bundled with Node 20. Upgrade with: `npm install -g npm@latest` |
| **Rust + Cargo** | stable (1.80+) | [rustup.rs](https://rustup.rs/) — required for Tauri desktop builds. On Windows, install Visual Studio Build Tools with the "C++ desktop" workload. Verify: `rustc --version && cargo --version` |
| **Docker + Compose** | Docker 24 / Compose v2 | [docker.com](https://www.docker.com/products/docker-desktop/) — Docker Desktop includes Compose. On Linux, install docker-ce + docker-compose-plugin. Verify: `docker --version && docker compose version` |
| **Optional: PostgreSQL client** | 16.x | Useful for `psql` shell access. On macOS: `brew install postgresql@16`. On Ubuntu: `sudo apt install postgresql-client`. Not required if you only use Docker. |

### Platform-Specific Tauri Dependencies (Desktop Only)

If you plan to build/run the Tauri desktop app:

- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo apt update && sudo apt install -y \
    libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

- **Windows**: Visual Studio 2022 Build Tools with "Desktop development with C++" workload (installed before Rustup).

- **macOS**: Xcode Command Line Tools: `xcode-select --install`

---

## Local Development Setup

Follow these steps **in order** for a fully-working local environment.

### Step 1: Clone the Repository

```bash
git clone <your-fork-or-upstream-url>
cd inven-Tory
```

### Step 2: Create Python Virtual Environment

**Linux / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows (PowerShell):**
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Windows (Git Bash):**
```bash
py -3.12 -m venv .venv
source .venv/Scripts/activate
```

> Keep the virtual environment **activated** for all Python commands in the rest of this guide. Your shell prompt should show `(.venv)`.

### Step 3: Install Python Dependencies (Editable)

The three Python packages (`domain`, `storage`, `api`) must be installed as editable installs so imports work across the monorepo. **Run this from the repo root:**

```bash
# Upgrade pip first (important for editable installs with build deps)
pip install --upgrade pip setuptools wheel

# Install all three packages + dev extras in the correct dependency order
pip install -e "./packages/domain[dev]" \
            -e "./packages/storage[dev]" \
            -e "./services/api[dev]"
```

If you see any resolver warnings about version pinning, that's normal — CI uses the same pins.

### Step 4: Install Node.js Dependencies

The root `package.json` declares five npm workspaces. Install everything from the repo root:

```bash
npm install
```

This also runs the `prepare` script which wires `.githooks/` as the active git hooks directory (auto-formats TS on commit, blocks push on lint failure).

### Step 5: Copy & Fill Environment Files

The project uses **three** `.env` files — one at the root (shared Python + root npm scripts), one for the API, and one per frontend app. Start from the provided `.env.example` templates:

```bash
# Root (Python + Node shared)
cp .env.example .env

# FastAPI service
cp services/api/.env.example services/api/.env

# Desktop app
cp apps/desktop/.env.example apps/desktop/.env

# Web dashboard
cp apps/web/.env.example apps/web/.env

# Mobile app (optional — uses web defaults if absent)
cp apps/mobile/.env.example apps/mobile/.env   2>/dev/null || true
```

Now **edit each `.env` file**. The critical values you **must** update:

**Root `.env`** and **`services/api/.env`**:
| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:YourPassw0rd@localhost:5432/invtory` | Connection to your local PostgreSQL. **Percent-encode** special chars (`@` → `%40`, `:` → `%3A`). |
| `SECRET_KEY` | A 64-char random hex string (run: `openssl rand -hex 32`) | Signs JWT access + refresh tokens. |

The desktop and web `.env` files work out-of-the-box with defaults pointing at `http://localhost:8000/api/v1`.

### Step 6: Start the Local PostgreSQL Database

Use Docker Compose from the `infra/docker/` directory:

```bash
cd infra/docker
docker compose up -d postgres
cd -
```

This starts `postgres:16-alpine` on `localhost:5432` with:
- User: `invtory`
- Password: `changeme` (from docker-compose.yml — adjust if you changed it)
- Database: `invtory`
- Persistent volume: `invtory-postgres-data`

Wait 5-10 seconds for the health check to pass, then verify:

```bash
docker compose -f infra/docker/docker-compose.yml ps
# The postgres container should show "healthy" status
```

> **If you prefer a local (non-Docker) PostgreSQL:** Create a database named `invtory` and make sure your `DATABASE_URL` in both `.env` files matches your user/password/host. Ensure the `pg_trgm` and `btree_gist` extensions are available (standard contrib modules).

### Step 7: Run Database Migrations

There are **TWO separate Alembic migration chains** — one for the central PostgreSQL DB and one for the local SQLite DB. Run both **before** seeding.

#### Option A: Migrations via Genesis Script (Recommended)

The Genesis bootstrap script (Step 8 below) has a `--run-migrations` flag that applies both chains **and** seeds data in one go. **If you use `--run-migrations` in Step 8, you can SKIP this step.**

#### Option B: Run Migrations Manually

**Central PostgreSQL (Alembic config: `infra/migrations/alembic.ini`):**
```bash
cd infra/migrations
alembic upgrade head
cd -
```

**Local SQLite (Alembic config: `packages/storage/storage/migrations/alembic.ini`):**

Option 1 — via the Python runner (recommended, same as Genesis uses):
```bash
python -c "from storage.migrations.runner import run_migrations; run_migrations('sqlite:///packages/storage/inven_tory_local.db')"
```

Option 2 — via Alembic CLI directly:
```bash
cd packages/storage/storage/migrations
alembic upgrade head
cd -
```

For each chain, verify the migration status with:
```bash
# PostgreSQL
cd infra/migrations && alembic current && cd -

# SQLite
cd packages/storage/storage/migrations && alembic current && cd -
```

### Step 8: Bootstrap Your First Admin Account (Genesis — Run ONCE)

Run the `genesis_single_user.py` script from the repo root. This seeds **your real, personal admin credentials** into both databases. It is IDEMPOTENT — re-running UPDATEs the existing user row by username rather than duplicating.

**Interactive mode (recommended — hides password input):**
```bash
python infra/seed/genesis_single_user.py --run-migrations
```

The script will prompt you for:
- Username (default: `admin`)
- Email (used for **web dashboard login**)
- Full name (display name)
- Role (choose `1` for `GLOBAL_ADMIN` — lets you create more users later)
- Password (≥ 8 chars, typed twice with no echo)
- Store ID / Code / Name / Address (defaults are fine for dev)
- Press ENTER at the confirmation prompt

**Non-interactive mode (for CI / scripts):**
```bash
python infra/seed/genesis_single_user.py \
    --username admin \
    --email admin@example.com \
    --full-name "Default Admin" \
    --password "MyRealPassw0rd!" \
    --role GLOBAL_ADMIN \
    --store-id STORE-MAIN \
    --store-code MAIN \
    --store-name "Main Store" \
    --store-address "123 Inventory St" \
    --run-migrations
```

**What Genesis does:**
1. Runs `alembic upgrade head` for **both** PostgreSQL and SQLite (with `--run-migrations`).
2. In **PostgreSQL**: creates/updates the admin `User` row, the default `Store`, and the `WEB-DASHBOARD-DEVICE` sentinel device.
3. In **SQLite**: creates/updates a matching local `User` row with `pin_hash` (bcrypt) for offline login, the same `Store`, and a `LOCAL-DEVICE-ANY` device row.
4. Prints a confirmation with your web vs. desktop login credentials.

### Step 9: Verify Everything Works

Start the API and hit the health check:

```bash
# Terminal 1: start the API
cd services/api && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Wait for "Application startup complete"

# Terminal 2: hit health + docs
curl http://localhost:8000/health
# Should return: {"status":"ok"}

# Open OpenAPI docs in a browser
xdg-open http://localhost:8000/docs   # Linux
# or visit http://localhost:8000/docs manually
```

---

## Database Migrations (Detailed Reference)

### Central PostgreSQL Migrations (`infra/migrations/`)

The central cloud API uses **Alembic** with async SQLAlchemy.

| Path | Purpose |
|------|---------|
| `infra/migrations/alembic.ini` | Alembic config. Reads `DATABASE_URL` from env. |
| `infra/migrations/env.py` | Async migration environment (imports `app.db.Base.metadata`). |
| `infra/migrations/versions/` | Migration files (numbered sequentially). |

**Current migration files:**
| # | File | What it does |
|---|------|--------------|
| 0001 | `0001_initial_postgres_schema.py` | Core tables: users, stores, devices, products, stock_balances, inventory_transactions |
| 0002 | `0002_ledger_tables.py` | Outbox/event-ledger infrastructure for sync |
| 0003 | `0003_auth_consolidation.py` | Role + store assignment consolidation |
| 0004 | `0004_fastapi_users_schema.py` | FastAPI-Users compatible columns (is_superuser, is_verified, etc.) |
| 0005 | `0005_update_device_user_id_to_integer.py` | Device.user_id → Integer FK (alignment with int PKs) |

**Common commands (run from `infra/migrations/` with `.venv` activated):**

```bash
# Apply all pending migrations
alembic upgrade head

# Apply one migration forward
alembic upgrade +1

# Roll back one migration
alembic downgrade -1

# Show current migration
alembic current

# Show migration history
alembic history -v

# Auto-generate a new migration (always review the output!)
cd infra/migrations
alembic revision --autogenerate -m "add_foo_bar_table"
# Then inspect the generated file in versions/ before committing!
```

> **Golden rule for schema changes:** Never modify existing quantity or balance columns directly. Always add **new transaction/event tables/columns** that append to the ledger. See `docs/architecture.md` for the event-ledger design principles.

---

### Local SQLite Migrations (`packages/storage/storage/migrations/`)

The Tauri desktop app uses its own **separate Alembic** chain for the embedded SQLite database.

| Path | Purpose |
|------|---------|
| `packages/storage/storage/migrations/alembic.ini` | Alembic config for SQLite (set `sqlalchemy.url` here or pass via CLI/env). |
| `packages/storage/storage/migrations/env.py` | Sync SQLite migration env (imports `storage.db.Base.metadata`). |
| `packages/storage/storage/migrations/runner.py` | ★ Programmatic runner: `run_migrations(db_url)` — used by Genesis and desktop startup. |
| `packages/storage/storage/migrations/versions/` | Numbered SQLite-specific migration files. |

**Current migration files:**
| # | File | What it does |
|---|------|--------------|
| 0001 | `0001_initial_sqlite_schema.py` | Core tables mirroring PG (users, stores, products, transactions, devices) |
| 0002 | `0002_drop_sqlite_password_column.py` | Removes obsolete password col; desktop uses pin_hash for bcrypt offline |
| 0003 | `0003_change_user_id_to_integer.py` | Aligns user PK with central integer IDs |
| 0004 | `0004_add_pin_hash_to_users.py` | Adds `pin_hash` bcrypt column for offline login |
| 0005 | `0005_add_fts5_products.py` | SQLite FTS5 virtual table for full-text product search |

**Common commands:**

```bash
# Option 1 — Programmatic runner (SAME as Genesis + app use — RECOMMENDED)
python -c "from storage.migrations.runner import run_migrations; run_migrations('sqlite:///packages/storage/inven_tory_local.db')"

# Option 2 — Alembic CLI
cd packages/storage/storage/migrations
alembic upgrade head          # Apply all
alembic downgrade -1          # Rollback one
alembic current               # Check status
alembic revision --autogenerate -m "add_xxx"   # Generate new
cd -
```

> **Important:** When running Alembic CLI for SQLite, you must `cd` into the `packages/storage/storage/migrations/` directory first so the relative paths in `alembic.ini` resolve correctly. Alternatively, use the programmatic `run_migrations()` function which handles paths automatically.

---

### Creating a New Migration (Checklist for Developers)

When you add/modify a model:

1. **Update both model locations:**
   - `services/api/app/models/` (PostgreSQL ORM)
   - `packages/storage/storage/models/` (SQLite ORM)
   - Keep them structurally in sync (same columns, types, indexes — differences are intentional and documented, e.g. SQLite FTS5 vs. PG tsvector).

2. **Generate and review BOTH migration chains:**
   ```bash
   # PostgreSQL
   cd infra/migrations
   alembic revision --autogenerate -m "describe_change_purpose"
   # → Edit the generated file in versions/

   # SQLite
   cd ../../packages/storage/storage/migrations
   alembic revision --autogenerate -m "describe_change_purpose"
   # → Edit the generated file
   ```

3. **Manually review** each auto-generated file. Alembic `--autogenerate` is a starting point, NOT a substitute for thought. Common issues it misses:
   - Renames (it sees DROP + ADD, not RENAME)
   - Check constraints, triggers, special indexes
   - SQLite-specific restrictions (limited ALTER TABLE → use `batch_alter_table`)
   - FTS5 or other virtual-table statements

4. **Apply and test both locally:**
   ```bash
   cd <repo root>
   # PG
   cd infra/migrations && alembic upgrade head && alembic current && cd -
   # SQLite
   python -c "from storage.migrations.runner import run_migrations; run_migrations('sqlite:///packages/storage/inven_tory_local.db')"
   ```

5. **Run the test suite** to catch schema regressions.

6. **Commit both migration files** together in the same PR.

---

## Seeding & Bootstrapping

Beyond the one-time Genesis admin user, the project has dev-only seed helpers under `infra/seed/dev_only/`:

| Script | Purpose |
|--------|---------|
| `infra/seed/genesis_single_user.py` | ★ **Main entry point** — seeds PG + SQLite with YOUR admin user, default store, sentinel devices. Use this first. |
| `infra/seed/dev_only/seed_central_postgres.py` | Dev-only: seed PostgreSQL with sample stores, products, transactions. Do NOT use in production. |
| `infra/seed/dev_only/seed_local_sqlite.py` | Dev-only: seed SQLite with matching sample data for offline work. |

See `infra/seed/dev_only/README.md` for full usage of dev-only seeds.

---

## Running the Applications

All commands assume the virtual environment is activated and you're at the **repo root** unless stated otherwise.

### 1. FastAPI Central API (Backend)

The API serves all web, mobile, and desktop sync clients.

**Development mode (auto-reload on code change):**
```bash
cd services/api
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Production mode (multiple workers):**
```bash
cd services/api
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Endpoints:**
| URL | Purpose |
|-----|---------|
| `http://localhost:8000/health` | Health check (returns `{"status":"ok"}`) |
| `http://localhost:8000/docs` | Swagger UI (OpenAPI docs) — interactive playground |
| `http://localhost:8000/redoc` | ReDoc (alternative OpenAPI renderer) |
| `http://localhost:8000/api/v1/*` | All v1 API routes (auth, products, stores, sync, transactions, transfers, users, devices, day_books) |

---

### 2. Tauri Desktop App (Point-of-Sale + Store Management)

The main store-facing app. Runs a Vite dev server for the UI wrapped in a native Tauri window.

**Development mode:**
```bash
cd apps/desktop
npm run tauri dev
```

> First run compiles the Rust backend (1-3 minutes). Subsequent launches are instant because only the Rust code that changed recompiles.

**What to expect:**
- Login screen appears. Use the **username + password** from Genesis (NOT email).
- Offline login works immediately because Genesis wrote a bcrypt `pin_hash` to the local SQLite DB.
- If the API is reachable, after a successful offline login the app auto-upgrades to a real JWT in the background (visible in logs via `tauriAuthService.ts`).
- Sync outbox events push automatically when online.

**Production build (.msi / .dmg / .AppImage):**
```bash
cd apps/desktop
npm run build       # TS build → dist/
npm run tauri build # Rust release build + installer artifacts
# Output in: apps/desktop/src-tauri/target/release/bundle/
```

**Vite-only UI dev (no Tauri window — for rapid UI iteration):**
```bash
cd apps/desktop
npm run dev
# Visit http://localhost:5173 (note: Tauri APIs are mocked; sync/auth won't work fully)
```

---

### 3. Web Management Dashboard

Central admin console. `GLOBAL_ADMIN` users can manage other users from here.

```bash
cd apps/web
npm run dev   # Runs on http://localhost:3000 (Vite auto-reload)
```

**Login:** Use the **email + password** from Genesis (NOT username).

After login:
- **Dashboard** — Unified overview with search
- **Stores** — Store management
- **Users** — ★ Create/edit/delete additional users (appears only for `GLOBAL_ADMIN`)
- **Search** — Global product/stock lookups

**Production build:**
```bash
cd apps/web
npm run build   # Output: apps/web/dist/
```

---

### 4. Mobile Companion App (Read-Only)

Responsive, read-only mobile view. Same backend as the web dashboard.

```bash
cd apps/mobile
npm run dev   # Runs on http://localhost:3001
```

Resize your browser to a mobile viewport or use Chrome DevTools' device emulator.

**Production build:**
```bash
cd apps/mobile
npm run build   # Output: apps/mobile/dist/
```

---

### Running All Services Together (Multi-Terminal)

For a full local environment, open **four terminal tabs** (all with `.venv` activated at repo root):

| Tab | Command |
|-----|---------|
| 1 (API) | `cd services/api && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` |
| 2 (Desktop) | `cd apps/desktop && npm run tauri dev` |
| 3 (Web) | `cd apps/web && npm run dev` |
| 4 (Mobile — optional) | `cd apps/mobile && npm run dev` |

Or, with background processes on Linux/macOS:
```bash
# Start API in background
cd services/api && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
cd ../..

# Start web dashboard in background
cd apps/web && npm run dev &
cd -

# Start mobile in background
cd apps/mobile && npm run dev &
cd -

# Start desktop last (blocks — needs native window)
cd apps/desktop && npm run tauri dev
```

---

## Quick-Start Commands

These are copy-paste sequences after the virtual environment is **already activated**. Useful when setting up a fresh machine or onboarding a new developer.

### Linux / macOS

```bash
# ── 1. Install Python deps ──────────────────────────────────
pip install --upgrade pip setuptools wheel
pip install -e "./packages/domain[dev]" -e "./packages/storage[dev]" -e "./services/api[dev]"

# ── 2. Install Node deps ───────────────────────────────────
npm install

# ── 3. Env files (copy templates only; EDIT AFTER COPYING) ─
cp -n .env.example .env
cp -n services/api/.env.example services/api/.env
cp -n apps/desktop/.env.example apps/desktop/.env
cp -n apps/web/.env.example apps/web/.env
# ^^ NOW EDIT BOTH .env FILES: set DATABASE_URL + SECRET_KEY

# ── 4. Start PostgreSQL ────────────────────────────────────
docker compose -f infra/docker/docker-compose.yml up -d postgres
sleep 10   # Wait for health check

# ── 5. Migrations + Genesis (one-time, interactive) ────────
python infra/seed/genesis_single_user.py --run-migrations

# ── 6. Launch services ─────────────────────────────────────
# Terminal 1 (API):
cd services/api && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Terminal 2 (Web):
cd apps/web && npm run dev
# Terminal 3 (Desktop):
cd apps/desktop && npm run tauri dev
```

### Windows (Git Bash or WSL)

```bash
# ── 1. Install Python deps ──────────────────────────────────
pip install --upgrade pip setuptools wheel
pip install -e "./packages/domain[dev]" -e "./packages/storage[dev]" -e "./services/api[dev]"

# ── 2. Install Node deps ───────────────────────────────────
npm install

# ── 3. Env files ────────────────────────────────────────────
cp .env.example .env
cp services/api/.env.example services/api/.env
cp apps/desktop/.env.example apps/desktop/.env
cp apps/web/.env.example apps/web/.env
# ^^ NOW EDIT BOTH .env FILES: set DATABASE_URL + SECRET_KEY

# ── 4. Start PostgreSQL ────────────────────────────────────
docker compose -f infra/docker/docker-compose.yml up -d postgres
sleep 10

# ── 5. Migrations + Genesis ────────────────────────────────
python infra/seed/genesis_single_user.py --run-migrations

# ── 6. Launch services (separate terminals) ────────────────
# Terminal 1:
cd services/api; python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Terminal 2:
cd apps/web; npm run dev
# Terminal 3:
cd apps/desktop; npm run tauri dev
```

> On **PowerShell**, replace semicolons with separate commands per line, use `Start-Process` for background services, and call `.\.venv\Scripts\Activate.ps1` instead of `source`.

---

## Authentication Workflow (Quick Reference)

After running Genesis, you have one admin user that works across **both login paths** with different identifiers.

### Login Endpoints

| Endpoint | Client | Body |
|----------|--------|------|
| `POST /api/v1/auth/login` | Desktop + Web | `{ "username": "admin", "password": "...", "device_id": "..." }` — `device_id` is **optional**; unknown values auto-register on first success. |
| `POST /api/v1/auth/jwt/login` | FastAPI-Users standard | form-urlencoded `username` (email) + `password` |
| `GET  /api/v1/auth/me` | Any (Bearer `<jwt>`) | Returns current user profile + role |
| `POST /api/v1/auth/refresh` | Any | `{ "refresh_token": "..." }` → new access token |

### Desktop Login Flow

1. On **first launch**, the desktop app generates a stable `DESKTOP-<hostname>-<random>` device ID and persists it to Tauri's secure store via `tauri-plugin-store`.
2. User submits **username + password**.
3. [`tauriAuthService.login()`](file:///home/mandem/Documents/inven-Tory/apps/desktop/src/services/tauriAuthService.ts):
   - **Phase 1 (offline):** bcrypt-verifies against the local SQLite `User.pin_hash`. On success, returns a temporary `offline:*` session token. The UI renders *immediately* — no network required.
   - **Phase 2 (background, online):** Once the API is reachable, the same credentials are submitted to `/api/v1/auth/login` to get a real JWT access_token + refresh_token. These replace the offline token in the secure store.
4. The device_id submitted in Phase 2 is **auto-registered** on the first successful hit. No pre-provisioning needed.
5. Subsequent cold starts skip the network round-trip entirely if a valid refresh_token exists.

### Web Login Flow

- The web `LoginView` posts `{ username, password, device_id: "WEB-DASHBOARD-DEVICE" }` to `/api/v1/auth/login`.
- Genesis pre-creates the `WEB-DASHBOARD-DEVICE` row for you, so this works immediately.
- After login, `/auth/me` populates the user's role. Role == `GLOBAL_ADMIN` is what enables the **Users** page Create/Edit/Delete action buttons.

### User Management (Admin UI)

1. Log in to the **web dashboard** (`http://localhost:3000`) using your Genesis **email + password** as the `GLOBAL_ADMIN`.
2. Open the **Users** sidebar item.
3. Click **New User** to create clerks, managers, auditors, or additional admins.
4. Every created user can log in on **any desktop device immediately** (first login auto-registers the device).
5. Edit / deactivate / delete users from the same Users table.

### Revoking a Compromised Device (Edge Case)

Device auto-registration keeps UX frictionless. If a laptop is lost or stolen, explicitly revoke it in PostgreSQL:

```sql
-- Connect to your central PostgreSQL database
UPDATE devices
   SET is_active = false,
       revocation_reason = 'Lost or stolen',
       revoked_at = NOW()
 WHERE id = 'DESKTOP-LAPTOP123-ABCD';
```

The next login attempt with that `device_id` will fail with HTTP 401 "device has been revoked". All other devices continue working normally.

---

## Linters & Formatters

### Python (ruff + black)

Use the `Makefile` targets — they encode the correct fix-then-verify order:

```bash
# Auto-fix everything (ruff --fix, then black, then verify clean)
make lint

# Read-only gate — same checks that CI + pre-push hook run
make lint-check
```

Equivalent raw commands (run from repo root):
```bash
# Lint + auto-fix import ordering / style
ruff check --fix services/ packages/

# Format code
black services/ packages/

# Verify clean (fail CI-style)
ruff check services/ packages/
black --check services/ packages/
```

### TypeScript (ESLint + Prettier)

Run from the repo root — the root `package.json` forwards these commands to all workspaces:

```bash
# Format everything (Prettier --write across all 5 TS workspaces)
npm run format

# Format check (read-only — same as CI + pre-push)
npm run format:check

# ESLint (all workspaces)
npm run lint
```

Per-workspace (useful for focused work):
```bash
# Desktop only
cd apps/desktop && npm run lint && npm run format:check

# Web only
cd apps/web && npm run lint && npm run format:check

# UI package only
cd packages/ui && npm run lint && npm run format:check
```

### Git Hooks

The repo ships with `.githooks/` — auto-activated by the `prepare` npm script that runs on `npm install`:

| Hook | Trigger | What it does |
|------|---------|--------------|
| `pre-commit` | `git commit` | Runs `prettier --write` on every staged `.ts`/`.tsx` file and re-stages it automatically. The commit **always** lands formatted. |
| `pre-push` | `git push` | Runs `ruff`, `black --check`, and `prettier --check` across the full codebase. **Blocks the push** on any failure (same checks as CI). |

If hooks are not running (e.g. you cloned before the prepare script existed), reactivate:
```bash
make setup-hooks
# — OR —
git config core.hooksPath .githooks
```

To bypass a hook one-time (rare, e.g. hotfix commit): `git commit --no-verify` or `git push --no-verify`. Avoid this on non-hotfix branches — CI will catch the lint failures and block the PR anyway.

---

## Running Tests

### Python (pytest)

The root `pyproject.toml` configures `pythonpath` so imports work correctly regardless of your working directory.

**Full suite (domain rules + storage + API):**
```bash
make test
# — OR —
pytest services/api/tests packages/domain/tests packages/storage/tests -v
```

**By package:**
```bash
# Domain rules only (fast, pure logic, no DB)
pytest packages/domain/tests -v

# Storage integration (SQLite + outbox service)
pytest packages/storage/tests -v

# API endpoint tests (httpx AsyncClient, uses in-memory SQLite for DB)
pytest services/api/tests -v

# Single test file
pytest packages/storage/tests/test_outbox_service.py -v

# Single test function
pytest packages/domain/tests/test_ledger_rules.py::test_ledger_apply_receipt -v -k test_ledger_apply_receipt
```

**Coverage (optional — requires pytest-cov):**
```bash
pip install pytest-cov
pytest packages/domain/tests packages/storage/tests --cov=domain --cov=storage --cov-report=term-missing
```

### TypeScript (Vitest)

All three frontend apps + the shared UI package use Vitest.

**All workspaces (from repo root):**
```bash
npm test
```

**Per workspace:**
```bash
# Desktop (App + services + views)
cd apps/desktop && npm test

# Web (Login + Search + Store views + formatters)
cd apps/web && npm test

# Shared UI components
cd packages/ui && npm test

# Shared types (no tests yet — placeholder)
cd packages/shared-types && npm test

# Watch mode (re-runs on file change)
cd apps/desktop && npx vitest
```

---

## Docker Deployment

The `infra/docker/` directory provides a production-ready Compose setup for PostgreSQL + the FastAPI service. The desktop app and web/mobile frontends are built and distributed separately (Tauri installer bundles + static `dist/` folders).

### Start Full Stack with Docker

```bash
cd infra/docker

# Build + start in background
docker compose up -d --build

# Check logs
docker compose logs -f api
docker compose logs -f postgres

# Check health
docker compose ps

# Stop (keeps data volume)
docker compose down

# Stop + DESTROY DATA VOLUME (nuclear reset)
docker compose down -v
```

**What Compose provides:**
- `postgres` service: PostgreSQL 16-alpine on port `5432` with persistent volume `invtory-postgres-data` and a built-in health check.
- `api` service: FastAPI + Uvicorn built from `infra/docker/Dockerfile.api`. Source directories are **mounted live** for development (edit Python files and Uvicorn restarts automatically).
- Environment: `DATABASE_URL` points at the Compose-internal `postgres` hostname. `CORS_ORIGINS_RAW` includes `localhost:3000/3001/1420`.

**Post-deployment first-run:** You still need to run migrations and Genesis against the containerized PostgreSQL. From repo root with `.venv` activated:

```bash
# Set DATABASE_URL to match the container if your .env still points to localhost
# (the compose file default uses port 5432 on localhost which maps to the container)
python infra/seed/genesis_single_user.py --run-migrations
```

### Build a Production API Image Standalone

```bash
docker build -f infra/docker/Dockerfile.api -t invtory-api:latest .
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql+asyncpg://user:pass@dbhost:5432/invtory" \
  -e SECRET_KEY="$(openssl rand -hex 32)" \
  -e ENVIRONMENT=production \
  invtory-api:latest
```

---

## CI/CD

### GitHub Actions Pipeline (`.github/workflows/ci.yml`)

Every pull request targeting `develop` automatically runs four parallel jobs:

| Job | What it runs |
|-----|-------------|
| `lint-python` | `ruff check services/ packages/` + `black --check services/ packages/` |
| `lint-typescript` | `npm install` → `npm run lint` → `npm run format:check` across all workspaces |
| `test-python` | Pytest across `services/api/tests`, `packages/domain/tests`, `packages/storage/tests` |
| `test-typescript` | `npm test` in all workspaces (desktop, web, mobile, ui, shared-types) |

**All four jobs must be green** before a PR can merge. The `develop` branch requires:
1. Green CI run (above).
2. At least one peer review approval with **zero open review comments**.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full PR checklist + commit style.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete development contract:

- Branch naming convention (`feature/<N>-<slug>`, `bugfix/<N>-<slug>`, etc.)
- Issue workflow (backlog → branch → PR → squash-merge)
- Conventional Commits style (`feat(api): ...`, `fix(sync): ...`, `docs(readme): ...`)
- PR ready-for-review checklist
- Python + TypeScript coding standards (line length, type hints, pure domain, etc.)
- Full Definition of Done

---

## License

See [LICENSE](LICENSE) for full terms.
