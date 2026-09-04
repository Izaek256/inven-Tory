# INVENTORY Tory

> Offline-First, Multi-Store Inventory Management System — v1.1.0

[![CI](<https://github.com/<org>/inven-Tory/actions/workflows/ci.yml/badge.svg?branch=develop>)](<https://github.com/<org>/inven-Tory/actions/workflows/ci.yml>)

---

## Overview

INVENTORY Tory is a transaction-driven inventory platform for businesses running multiple physical stores. Every stock movement is a durable, immutable event. Stores operate fully offline; synchronization to the central cloud database happens automatically when connectivity returns.

**Technology stack:**

| Layer            | Technology                    |
| ---------------- | ----------------------------- |
| Desktop shell    | Tauri (Rust)                  |
| Desktop UI       | React + TypeScript            |
| Local database   | SQLite                        |
| Cloud API        | FastAPI (Python 3.12)         |
| ORM              | SQLAlchemy                    |
| Cloud database   | PostgreSQL                    |
| Remote dashboard | React + TypeScript            |
| Mobile companion | React (responsive, read-only) |

---

## Repository structure

```
inven-Tory/
├── apps/
│   ├── desktop/          # Tauri + React desktop app
│   ├── web/              # Remote management dashboard
│   └── mobile/           # Read-only mobile companion
├── services/
│   └── api/              # FastAPI central API
├── packages/
│   ├── domain/           # Shared Python domain entities and rules
│   └── shared-types/     # Shared TypeScript type definitions
├── infra/
│   ├── docker/           # Docker Compose + Dockerfiles
│   └── migrations/       # Alembic migration scripts
├── tests/                # Integration / E2E tests
└── docs/                 # Architecture and design docs
```

---

## Prerequisites

| Tool             | Minimum version | Install                         |
| ---------------- | --------------- | ------------------------------- |
| Python           | 3.12            | [python.org](https://python.org) |
| Node.js          | 20 LTS          | [nodejs.org](https://nodejs.org) |
| npm              | 10              | bundled with Node 20            |
| Rust + Cargo     | stable          | [rustup.rs](https://rustup.rs)   |
| Docker + Compose | 24 / 2          | [docker.com](https://docker.com) |

---

## Local development setup

### 1. Clone the repository

```bash
git clone https://github.com/<org>/inven-Tory.git
cd inven-Tory
git checkout develop
```

### 2. Copy environment files

```bash
cp .env.example .env
cp apps/desktop/.env.example apps/desktop/.env
cp services/api/.env.example services/api/.env
```

Edit each `.env` file and fill in your local values (database URL, secret key, etc.).

### 3. Install Python dependencies

```bash
# Create a virtual environment in the project root
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install the API package and the domain package in editable mode
pip install -e "services/api[dev]"
pip install -e "packages/domain[dev]"
pip install -e "packages/storage[dev]"
```

### 4. Install Node dependencies

```bash
npm install   # installs all workspace packages from the root
```

### 5. Start the local PostgreSQL database

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres
```

### 6. Bootstrap your first admin account (Genesis — run ONCE)

This seeds **your real credentials** into:

1. **PostgreSQL** — central database used by the API + web dashboard
2. **Local SQLite** — used by the Tauri desktop for offline bcrypt-based login

It also creates a default store and the `WEB-DASHBOARD-DEVICE` sentinel row. No mock users, no seed fixtures.

```bash
# From repo root with .venv activated
pip install click   # first time only

# Interactive — prompts for YOUR username / email / password / store:
python infra/seed/genesis_single_user.py --run-migrations

# OR non-interactive, explicit values (great for CI / repeat setups):
python infra/seed/genesis_single_user.py --run-migrations \
  --username YOUR_USERNAME \
  --email you@example.com \
  --full-name "Your Full Name" \
  --password "YourRealPassw0rd!" \
  --role GLOBAL_ADMIN \
  --store-id STORE-MAIN \
  --store-code MAIN \
  --store-name "My Store" \
  --store-address "123 Main St"
```

**Safety notes:**
- Idempotent: re-running UPDATEs the existing user row by username (never duplicates).
  Change your password later by re-running with the same `--username`.
- Refuses the `--run-migrations` flag if Alembic fails — fix schema errors first.

### 7. Run the API server

```bash
cd services/api
uvicorn app.main:app --reload --port 8000
```

The API is available at `http://localhost:8000`. OpenAPI docs: `http://localhost:8000/docs`.

**Authentication model (single-user mode):**
- `device_id` is **optional** on `/api/v1/auth/login`.
- Any `device_id` string you submit is auto-registered on first successful login
  (anchored to `User.assigned_store_id`). Desktop can be installed and used on
  **any machine** without a separate device-registration step.
- Only explicitly-revoked devices (row has `is_active=false` WITH a
  `revocation_reason`) are rejected — so you can still lock a compromised
  device if needed.

### 8. Run the desktop app (development mode)

```bash
cd apps/desktop
npm install   # first time only
npm run dev
```

**Desktop login:** use `username + password` (the credentials from step 6).
Offline login works because Genesis already wrote the `pin_hash` bcrypt row
to the local SQLite DB during step 6.

### 9. Run the web dashboard (development mode)

```bash
cd apps/web
npm install   # first time only
npm run dev
```

**Web login:** use `email + password` (the credentials from step 6).
After login, visit **Users** in the sidebar to create/manage additional
accounts (the Create/Edit/Delete buttons appear only when logged in as
`GLOBAL_ADMIN`).

---

## Quick-start (after virtual environment is activated)

These are the exact commands to run a fresh environment from scratch once
your virtual environment is already active. Commands are shown for both
**Windows** (PowerShell / Git Bash) and **Linux/macOS**.

### Windows (Git Bash / PowerShell)

```bash
# Navigate to the project root
cd /d/inven-Tory

# Activate the virtual environment (if not already active)
source .venv/Scripts/activate

# Install all Node dependencies
npm install

# Remove any stale local SQLite databases
find . -type f -name "inven_tory_local.db" -delete

# Run the local SQLite Alembic migrations (packages/storage)
.venv/Scripts/python -m alembic -c packages/storage/storage/migrations/alembic.ini upgrade head

# Reset and recreate the PostgreSQL database
psql -U postgres -h localhost -d postgres -c "DROP DATABASE IF EXISTS inventory;"
psql -U postgres -h localhost -d postgres -c "CREATE DATABASE inventory;"

# Set the PostgreSQL connection URL and run the cloud Alembic migrations
export ALEMBIC_DB_URL="postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/inventory"
.venv/Scripts/python -m alembic -c infra/migrations/alembic.ini upgrade head

# Start all three services (background processes)
cd services/api && ../../.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000 &
cd ../../apps/web && npm run dev &
cd ../desktop && npm run dev
```

> **Note:** Replace `YOUR_PASSWORD` with your actual PostgreSQL password.
> The `&` symbol runs each service in the background. On PowerShell, use
> `Start-Process` or run each in a separate terminal tab instead.

### Linux / macOS

```bash
# Navigate to the project root
cd ~/path/to/inven-Tory

# Activate the virtual environment (if not already active)
source .venv/bin/activate

# Install all Node dependencies
npm install

# Remove any stale local SQLite databases
find . -type f -name "inven_tory_local.db" -delete

# Run the local SQLite Alembic migrations (packages/storage)
python -m alembic -c packages/storage/storage/migrations/alembic.ini upgrade head

# Reset and recreate the PostgreSQL database
psql -U postgres -h localhost -d postgres -c "DROP DATABASE IF EXISTS inventory;"
psql -U postgres -h localhost -d postgres -c "CREATE DATABASE inventory;"

# Set the PostgreSQL connection URL and run the cloud Alembic migrations
export ALEMBIC_DB_URL="postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/inventory"
python -m alembic -c infra/migrations/alembic.ini upgrade head

# Start all three services (background processes)
cd services/api && python -m uvicorn app.main:app --reload --port 8000 &
cd ../../apps/web && npm run dev &
cd ../desktop && npm run dev
```

> **Note:** Replace `YOUR_PASSWORD` with your actual PostgreSQL password.
> Each `&` starts a background process. Open a new terminal tab for each
> service if you prefer isolated outputs.

---

## Running linters

### Python

```bash
# From repo root (with .venv activated)
ruff check services/ packages/domain/
black --check services/ packages/domain/
```

### TypeScript

```bash
npm run lint --workspaces
```

---

## Running tests

### Python unit tests

```bash
pytest   # configuration in root pyproject.toml
```

### TypeScript unit tests

```bash
npm test --workspaces --if-present
```

---

## Authentication workflow (quick reference)

After you've run the **Genesis script** (setup step 6 above):

### Login endpoints

| Endpoint | Client | Body |
|---|---|---|
| `POST /api/v1/auth/login` | Desktop + Web (via custom view) | `{ username, password, device_id? }` — `device_id` is optional; unknown values are auto-registered on first success. |
| `POST /api/v1/auth/jwt/login` | FastAPI Users standard (web/mobile) | form-urlencoded `username` (email) + `password` |
| `GET  /api/v1/auth/me` | Any (Bearer token) | — returns the current user profile |
| `POST /api/v1/auth/refresh` | Any | `{ "refresh_token": "..." }` → new access token |

### Desktop login flow
1. On first launch the app generates a stable `DESKTOP-<host>-<rand>` device
   ID and saves it to Tauri's secure store. **No pre-registration needed.**
2. User submits `username + password`.
3. `tauriAuthService.login()` first tries **offline SQLite bcrypt** against
   the local `User.pin_hash` (seeded by Genesis). On success it returns an
   `offline:*` session token, then upgrades to a real server JWT in the
   background when network is available.
4. Central API login auto-registers the generated device ID on first
   successful hit.

### Web login flow
- Web uses the custom `LoginView` which posts `{ username, password, device_id: "WEB-DASHBOARD-DEVICE" }`
  to `/auth/login`.  Genesis pre-creates the `WEB-DASHBOARD-DEVICE` row for
  you, so this works without extra steps.
- After login, a `/auth/me` call populates the user's role in the app shell;
  role == `GLOBAL_ADMIN` is what enables **Users** page action buttons.

### User management (admin UI)
1. Log in to the web dashboard as the `GLOBAL_ADMIN` created in Genesis.
2. Open the **Users** sidebar page.
3. Use **New User** to create clerks, managers, auditors, or additional
   admins.  Every created user can log in on **any** device immediately (the
   first login registers that device automatically).
4. Edit / deactivate / delete users from the same table.

### Revoking a compromised device (edge case)
Device auto-registration keeps UX frictionless. If a laptop is actually lost
or stolen, revoke it by running this against the PostgreSQL DB directly:

```sql
UPDATE devices
   SET is_active = false,
       revocation_reason = 'Lost laptop S/N 12345',
       revoked_at = NOW()
 WHERE id = 'DESKTOP-HOSTNAME-RAND1234';
```

The next login attempt with that device_id fails with 401 "device has been
revoked". Any other device continues working normally.

---

## CI

Every pull request targeting `develop` runs the full lint + unit-test pipeline automatically via GitHub Actions (`.github/workflows/ci.yml`). The `develop` branch requires a green CI run and no open review comments before merging.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch naming convention, commit style, PR checklist and coding standards.

---

## License

See [LICENSE](LICENSE).

