# INVENTORY Tory v1.1.0 — Architecture Overview

> Source of truth: [Inventory_Tory_v1_1_0_SRS.md](../Inventory_Tory_v1_1_0_SRS.md) Section 7.

---

## Deployment architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Store (one per physical location)                               │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Desktop App (Tauri + React/TS)                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │  React UI    │  │ Tauri/Rust   │  │    SQLite DB    │  │  │
│  │  │  (renderer)  │◄─┤  commands    │◄─┤  (local ledger) │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │  │
│  │             Outbox (durable pending sync queue)             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│            HTTPS (when internet available)                       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │  Cloud (central service)    │
              │                            │
              │  FastAPI API               │
              │  SQLAlchemy ORM            │
              │  PostgreSQL DB             │
              │  (central immutable ledger)│
              └─────────────┬──────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
   ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
   │  Web        │   │  Mobile     │   │  Sync       │
   │  Dashboard  │   │  Companion  │   │  Service    │
   │  (React/TS) │   │  (React/TS) │   │  (machine)  │
   └─────────────┘   └─────────────┘   └─────────────┘
```

---

## Core architectural principles (SRS §7.1)

| Principle | Implementation |
|---|---|
| **Local-first** | All store operations commit to SQLite first, no network required |
| **Event-first** | Synchronize transactions/events, never raw quantities |
| **Durable outbox** | Pending events survive crashes, restarts and power loss |
| **Idempotent server** | Transaction ID is idempotency key — retries cannot double-count |
| **Immutable ledger** | Corrections create compensating events, never edits |
| **Projection** | Current balance is `SUM(quantity_delta)` of accepted events |
| **Least privilege** | Role-based; server always re-authorizes API actions |
| **Observable sync** | Pending count and last-sync timestamp always visible |

---

## Non-negotiable design rule (Appendix B)

> **Never synchronize by overwriting quantities.**
>
> Synchronize durable inventory events. Process each event exactly once at the
> business level. Retain the audit trail. Derive current balance from accepted
> movements. Purchase orders, alerts, notifications, and every v1.1.0 addition
> are built on top of this rule — not around it.

---

## Technology stack summary

| Layer | Technology | Notes |
|---|---|---|
| Desktop shell | Tauri 2 (Rust) | Cross-platform; Windows primary (NFR-PORT-001) |
| Desktop UI | React 18 + TypeScript 5 | Strict mode |
| Local DB | SQLite | Embedded; WAL mode for durability |
| Cloud API | FastAPI + Python 3.12 | Async; versioned at `/api/v1/` |
| ORM | SQLAlchemy 2 (async) | Alembic migrations |
| Cloud DB | PostgreSQL 16 | Central durable ledger |
| Remote dashboard | React 18 + TypeScript 5 | Global search, notification center |
| Mobile companion | React 18 + TypeScript 5 | Read-only (FR-MOBILE-003) |
| Transport | HTTPS/JSON REST | TLS in production (NFR-SEC-001) |
| Auth | JWT + device identity | Revocable; server-side authoritative |

---

## Package layout → layer mapping

```
inven-Tory/
├── packages/domain/         ← Domain layer (pure Python, no framework deps)
│   ├── domain/entities/     ← Entities: Store, Product, InventoryTransaction…
│   └── domain/rules/        ← Business invariants: ledger, balance, idempotency
│
├── services/api/            ← Application + Infrastructure layer (FastAPI)
│   ├── app/core/            ← Config, DB session, security utilities
│   ├── app/api/             ← HTTP route handlers (thin — delegate to services)
│   └── app/services/        ← Application services (orchestrate domain + infra)
│
├── apps/desktop/            ← Desktop presentation layer
│   ├── src/                 ← React components, hooks, state
│   └── src-tauri/           ← Rust Tauri commands (SQLite, outbox, sync engine)
│
├── apps/web/                ← Web dashboard presentation layer
├── apps/mobile/             ← Mobile companion presentation layer (read-only)
│
└── infra/
    ├── docker/              ← Container definitions
    └── migrations/          ← Alembic PostgreSQL migrations
```

---

## Data flow: transaction commit (online mode)

```
User action (desktop UI)
  → React component validates input
  → Tauri command invoked
  → Rust: domain rule check (sufficient stock, valid movement type)
  → Rust: generate ULID transaction_id (SYNC-001)
  → Rust: SQLite transaction commit (local ledger + outbox entry)
  → UI: balance updated immediately (local projection)
  → Background sync worker: POST /api/v1/sync/push
  → FastAPI: idempotency check (reject duplicate transaction_id)
  → FastAPI: domain rule re-validated (server-authoritative)
  → PostgreSQL: event appended to central ledger
  → Response: ACCEPTED
  → Rust: outbox entry marked sync_status=ACCEPTED
```

---

## v1.1.0 additions (new entities / flows)

| Feature | SRS ref | Key rule |
|---|---|---|
| Low-stock alerts | FR-ALERT | Notifications are derived views; resolving one never touches the ledger |
| Barcode scanning | FR-SCAN | USB HID → keystrokes → existing product search field |
| Purchase orders | FR-PO | A PO is a plan; only a linked RECEIPT transaction moves stock |
| Reorder suggestions | FR-REORDER | Read-only derived view of trailing sales average |
| Batch/lot tracking | FR-BATCH | Opt-in per product; batch_id links to the receipt transaction |
| Product images | FR-PROD-IMG | Cached locally for offline display |
| CSV import/export | FR-IE | Row-level validation; no silent partial success |
| Warranty lookup | FR-WARR | Per-serial auto-calculated from sale date |
| Mobile companion | FR-MOBILE | Read-only; no transaction entry in v1.1.0 |
| Notification center | FR-NOTIF | Central feed of unresolved alerts on the dashboard |
