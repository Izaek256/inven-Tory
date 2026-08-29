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

---

## CI

Every pull request targeting `develop` runs the full lint + unit-test pipeline automatically via GitHub Actions (`.github/workflows/ci.yml`). The `develop` branch requires a green CI run and no open review comments before merging.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch naming convention, commit style, PR checklist and coding standards.

---

## License

See [LICENSE](LICENSE).
