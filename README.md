# INVENTORY Tory

> Offline-First, Multi-Store Inventory Management System — v1.1.0

[![CI](https://github.com/<org>/inven-Tory/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/<org>/inven-Tory/actions/workflows/ci.yml)

---

## Overview

INVENTORY Tory is a transaction-driven inventory platform for businesses running multiple physical stores. Every stock movement is a durable, immutable event. Stores operate fully offline; synchronization to the central cloud database happens automatically when connectivity returns.

**Technology stack:**
| Layer | Technology |
|---|---|
| Desktop shell | Tauri (Rust) |
| Desktop UI | React + TypeScript |
| Local database | SQLite |
| Cloud API | FastAPI (Python 3.12) |
| ORM | SQLAlchemy |
| Cloud database | PostgreSQL |
| Remote dashboard | React + TypeScript |
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

| Tool | Minimum version | Install |
|---|---|---|
| Python | 3.12 | [python.org](https://python.org) |
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org) |
| npm | 10 | bundled with Node 20 |
| Rust + Cargo | stable | [rustup.rs](https://rustup.rs) |
| Docker + Compose | 24 / 2 | [docker.com](https://docker.com) |

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
```

### 4. Install Node dependencies

```bash
npm install   # installs all workspace packages from the root
```

### 5. Start the local PostgreSQL database

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres
```

### 6. Run the API server

```bash
cd services/api
uvicorn app.main:app --reload --port 8000
```

The API is available at `http://localhost:8000`. OpenAPI docs: `http://localhost:8000/docs`.

### 7. Run the desktop app (development mode)

```bash
cd apps/desktop
npm run dev
```

### 8. Run the web dashboard (development mode)

```bash
cd apps/web
npm run dev
```

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

### Testing Authentication (Issue 25)

The authentication system uses FastAPI Users. Here's how to test the authentication flow:

#### 1. Test API Authentication Endpoints

Start the API server:
```bash
cd services/api
uvicorn app.main:app --reload --port 8000
```

Test the FastAPI Users endpoints using curl or a tool like Postman:

**Register a new user:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "username": "testuser",
    "full_name": "Test User",
    "role": "STORE_CLERK"
  }'
```

**Login with username (desktop):**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "SecurePassword123!",
    "device_id": "test-device-001"
  }'
```

**Login with email (web/mobile):**
```bash
curl -X POST http://localhost:8000/api/v1/auth/jwt/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@example.com&password=SecurePassword123!"
```

**Get current user profile:**
```bash
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <your_access_token>"
```

**Refresh access token:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<your_refresh_token>"}'
```

#### 2. Test Desktop App Authentication

1. Start the desktop app in development mode:
```bash
cd apps/desktop
npm run dev
```

2. Register a device first (if not already registered)
3. Use the login screen with the username/password you created
4. Verify the token is cached in Tauri secure storage
5. Test offline behavior: disconnect network, let token expire, verify local operations still work

#### 3. Test Web Dashboard Authentication

1. Start the web dashboard:
```bash
cd apps/web
npm run dev
```

2. Navigate to the login screen
3. Use email/password to log in
4. Verify the token is stored in localStorage
5. Test logout functionality

#### 4. Test Mobile Companion Authentication

1. Start the mobile app:
```bash
cd apps/mobile
npm run dev
```

2. Navigate to the login screen
3. Use email/password to log in
4. Verify the token is stored in localStorage
5. Test logout functionality

#### 5. Test Permission Checks

Test that permission dependencies work correctly:

```bash
# Try to access an admin endpoint as a regular user (should fail with 403)
curl -X POST http://localhost:8000/api/v1/users \
  -H "Authorization: Bearer <regular_user_token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "new@example.com", "password": "password"}'
```

#### 6. Test Device Revocation

1. Create a user and register a device
2. Login with that device
3. Revoke the device (via device management endpoint)
4. Try to use the same token — should be rejected with 401

#### 7. Run Authentication Tests

The desktop app has authentication tests:
```bash
cd apps/desktop
npm test -- AuthService.test
```

#### 8. Mock Data Audit

Verify no mock data exists in the codebase:
```bash
# Search for mock, dummy, placeholder, fake
grep -r "mock\|dummy\|placeholder\|fake" --include="*.ts" --include="*.tsx" --include="*.py" --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=infra/seed/dev_only
```

Expected: Zero hits outside of explicitly-labeled dev-fixture paths.

---

## CI

Every pull request targeting `develop` runs the full lint + unit-test pipeline automatically via GitHub Actions (`.github/workflows/ci.yml`). The `develop` branch requires a green CI run and no open review comments before merging.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch naming convention, commit style, PR checklist and coding standards.

---

## License

See [LICENSE](LICENSE).
