# invenTory — System Documentation

| Field                       | Value                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **System Name**       | invenTory — Offline-First, Multi-Store Inventory Management System                                                          |
| **Version**           | 1.1.6 (API / shared packages) · 1.1.7–1.1.8 (Desktop shell)                                                                |
| **Date**              | 2026-09-21                                                                                                                   |
| **Status**            | Draft — generated from repository inspection                                                                                |
| **Audience**          | Engineers new to the system                                                                                                  |
| **Repository Root**   | `D:\inven-Tory`                                                                                                            |
| **Primary Reference** | `README.md`, `docs/architecture.md`, `Inventory_Tory_v1_1_0_SRS.md` (not found / needs confirmation at inspected path) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Communication Map](#3-communication-map)
4. [Core Flows](#4-core-flows)
5. [Data Layer](#5-data-layer)
6. [Caching and Performance Design](#6-caching-and-performance-design)
7. [Client Applications](#7-client-applications)
8. [API Overview](#8-api-overview)
9. [Security Architecture](#9-security-architecture)
10. [Deployment and Infrastructure](#10-deployment-and-infrastructure)
11. [Operational Workflows](#11-operational-workflows)
12. [Business Rules and Models](#12-business-rules-and-models)
13. [Scalability, Limits, and Risks](#13-scalability-limits-and-risks)
14. [Technology Stack Summary](#14-technology-stack-summary)
15. [Glossary](#15-glossary)

- [Appendix A: Configuration Reference](#appendix-a-configuration-reference)
- [Appendix B: Naming Conventions and Folder Layouts](#appendix-b-naming-conventions-and-folder-layouts)
- [Appendix C: Open Questions and Items Needing Confirmation](#appendix-c-open-questions-and-items-needing-confirmation)

---

## 1. Executive Summary

### Figure 1.1: System Context at a Glance — Purpose and Users

```mermaid
flowchart LR
    subgraph Users
        A[Store Clerk]
        B[Store Manager]
        C[Inventory Manager]
        D[Global Admin]
        E[Auditor]
    end
    SYS[[invenTory<br>Offline-First Inventory Platform]]
    Users --> SYS
    SYS --> F[(Central Ledger<br>PostgreSQL)]
    SYS --> G[(Local Ledger<br>SQLite per Store)]
```

*Figure 1.1: System context at a glance — purpose and users.*

*How to read this: Ovals are human roles, the central rounded rectangle is the system boundary, cylinders are where durable state lives. Arrows show who relies on the system and what data it persists.*

invenTory is a transaction-driven inventory platform for businesses operating multiple physical stores. Every stock movement is recorded as a durable, immutable event; current quantities are always derived as a sum of accepted events, never by overwriting a quantity field. Each store operates fully offline on a Tauri desktop application backed by a local SQLite database; when connectivity returns, a background outbox synchronizer pushes batched events to a central FastAPI service backed by PostgreSQL. A web management dashboard and a read-only mobile companion provide remote oversight of the same central ledger.

| Characteristic                      | Description                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**                   | Multi-store inventory control with strict auditability, offline availability, and eventual consistency via event replication                                 |
| **Primary Users**             | Store Clerk, Store Manager, Inventory Manager, Global Admin, Auditor, background Sync actor                                                                  |
| **Core Principle**            | Never synchronize by overwriting quantities; synchronize immutable transaction events with exactly-once business semantics                                   |
| **Deployment Unit per Store** | One desktop installation with its own SQLite file; many stores share one cloud API/database                                                                  |
| **Offline Guarantee**         | All day-to-day operations (receive, sell, transfer, adjust, quarantine, count) commit locally without network                                                |
| **Sync Model**                | Durable outbox with idempotent server ingest, partial-batch acceptance, and delta pull for catalogue refresh                                                 |
| **Languages / Runtimes**      | Python 3.12 (API, domain, storage) · TypeScript 5 + React 18 (desktop, web, mobile, shared packages) · Rust (Tauri shell)                                  |
| **Where It Runs**             | Developer laptops via Docker Compose (PostgreSQL + API) + Tauri native window; production API as container; frontends as static builds and native installers |

---

## 2. System Architecture

### Figure 2.1: System Context — Users, System Boundary, and External Services

```mermaid
flowchart TB
    U1[Store Staff<br>Clerk and Manager]
    U2[Inventory Manager]
    U3[Global Admin]
    U4[Auditor Read Only]

    SYS[[invenTory System<br>Desktop plus Cloud plus Web plus Mobile]]

    EXT1[(GitHub Releases<br>Updater Endpoints)]
    EXT2[Operator Browser]
    EXT3[Host OS<br>Secure Store and File System]

    U1 --> SYS
    U2 --> SYS
    U3 --> SYS
    U4 --> SYS
    SYS --> EXT1
    EXT2 --> SYS
    SYS --> EXT3
```

*Figure 2.1: System context including users and external services.*

*How to read this: Boxes on the left are human actors, the double-bordered box is the system under documentation, boxes on the right are external actors/services. Arrows indicate direction of primary interaction.*

| Actor / External Service           | Interaction with System                                             | Protocol                            |
| ---------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| Store Staff (Clerk/Manager)        | Operate desktop POS and store-management screens                    | Tauri IPC + HTTP when online        |
| Inventory Auditor                  | Reads transactions, day books, stock levels                         | HTTP via web/mobile                 |
| Global Admin                       | Creates users, manages stores                                       | HTTP via web dashboard              |
| Operator Browser                   | Renders web and mobile frontends                                    | HTTPS                               |
| GitHub Releases                    | Serves updater manifests and installers for Tauri updater           | HTTPS JSON                          |
| Host OS Secure Store / File System | Persists device identity, session tokens, SQLite file, auto-backups | File / OS keystore via Tauri plugin |

### Figure 2.2: High-Level Layered Architecture

```mermaid
flowchart TB
    subgraph EdgeLayer["Edge Layer"]
        D[Desktop App<br>Tauri plus React]
        W[Web Dashboard<br>React]
        M[Mobile Companion<br>React Read Only]
    end
    subgraph AppLayer["Application Layer"]
        API[FastAPI Service<br>Routers plus Services]
        DOMAIN[Domain Package<br>Pure Business Rules]
        INGEST[Ingestion Service<br>Idempotent Ledger Writer]
    end
    subgraph DataLayer["Data Layer"]
        PG[(PostgreSQL 16<br>Central Ledger)]
        SQLITE[(SQLite plus FTS5<br>Local Ledger per Device)]
        OUTBOX[(Outbox Queue<br>Durable Pending Events)]
        KV[(KV Store<br>Sync Cursor and Flags)]
    end
    subgraph StorageLayer["Storage Layer"]
        ARTIFACTS[Static Dist<br>Web and Mobile]
        INSTALLER[Tauri Bundles<br>MSIX AppImage deb]
        BACKUPS[Local Backup Files<br>Scheduled Copies]
        VOLUME[Docker Volume<br>pgdata]
    end
    subgraph ExternalLayer["External"]
        GH[GitHub Actions plus Releases]
    end

    D --> API
    W --> API
    M --> API
    API --> DOMAIN
    API --> INGEST
    INGEST --> PG
    D --> SQLITE
    D --> OUTBOX
    D --> KV
    API --> PG
    GH --> INSTALLER
    PG --> VOLUME
    D --> BACKUPS
    API --> ARTIFACTS
```

*Figure 2.2: High-level layered architecture showing edge, application, data, storage, and external layers.*

*How to read this: Top to bottom is the request path. Edge clients call the Application layer, which enforces domain rules and writes to the Data layer. Storage holds build artifacts and persistent volumes; External hosts CI and distribution.*

| Layer                 | Components Contained                                                               | Responsibility                                                        |
| --------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Edge**        | Desktop (Tauri shell + React), Web dashboard, Mobile companion                     | User interaction, offline-first capture, read-only remote views       |
| **Application** | FastAPI routers, domain package, ingestion service, day-book service, auth manager | Request validation, authorization, business invariants, ledger writes |
| **Data**        | PostgreSQL central DB, SQLite local DB, outbox_events, kv_store, stock_balances    | Durable ledger, derived projections, sync coordination                |
| **Storage**     | PostgreSQL volume, SQLite file, backup copies, static dist folders, Tauri bundles  | Persistence and distribution artifacts                                |
| **External**    | GitHub Actions, GitHub Releases, host OS services                                  | Build, test, release, updater hosting, secure persistence             |

### Figure 2.3: Component Interaction Map — Part A (Edge and Application)

```mermaid
flowchart LR
    subgraph DesktopInternals["Desktop Internals"]
        RUI[React Views]
        SVC[Tauri Services<br>Auth Product Store<br>Sync Transfer Transaction]
        RUST[Rust Commands<br>lib dot rs]
        SQLITE2[(SQLite)]
        OB[(Outbox)]
        KV2[(KV Store)]
        SECURE[Secure Store<br>Device ID plus Tokens]
    end
    API2[FastAPI Routers]
    DOM[Domain Rules]
    ING[Ingestion]
    DAY[Day Book Service]

    RUI --> SVC
    SVC --> RUST
    RUST --> SQLITE2
    RUST --> OB
    RUST --> KV2
    SVC --> SECURE
    SVC --> API2
    API2 --> DOM
    API2 --> ING
    API2 --> DAY
    ING --> DOM
    DAY --> DOM
```

*Figure 2.3a: Component interaction map — desktop internals and API services.*

*How to read this: Boxes are software components, cylinders are data stores. Arrows mean "calls or reads/writes". The desktop React layer never touches SQLite directly; it goes through Tauri services and Rust commands.*

### Figure 2.4: Component Interaction Map — Part B (Cloud and Clients)

```mermaid
flowchart LR
    subgraph Cloud["Cloud"]
        ROUTERS[API Routers<br>auth sync products<br>stores users transfers<br>transactions daybooks devices]
        AUTHMGR[Auth Manager<br>FastAPI-Users plus JWT]
        ORM[SQLAlchemy ORM<br>Async]
        MIGR[Alembic<br>PG Migrations]
        SEED[Genesis Seed<br>Single-User Bootstrap]
    end
    subgraph Shared["Shared Packages"]
        DOMAIN2[domain]
        STORAGE[storage<br>SQLite Models plus Runner]
        TYPES[shared-types]
        UI[ui]
    end
    subgraph Clients["Clients"]
        DESKTOP[Desktop]
        WEB[Web]
        MOBILE[Mobile]
        DOCKER[Docker Compose<br>postgres plus api]
    end
    subgraph Infra["Infra"]
        PG2[(PostgreSQL)]
        CI[GitHub Actions CI]
    end

    DESKTOP --> ROUTERS
    WEB --> ROUTERS
    MOBILE --> ROUTERS
    ROUTERS --> AUTHMGR
    ROUTERS --> ORM
    ORM --> PG2
    MIGR --> PG2
    SEED --> PG2
    SEED --> STORAGE
    DOMAIN2 --> ROUTERS
    STORAGE --> DESKTOP
    TYPES --> DESKTOP
    TYPES --> WEB
    TYPES --> MOBILE
    UI --> DESKTOP
    UI --> WEB
    UI --> MOBILE
    DOCKER --> PG2
    DOCKER --> ROUTERS
    CI --> ROUTERS
    CI --> DESKTOP
```

*Figure 2.4: Component interaction map — cloud, shared packages, clients, and infrastructure.*

*How to read this: Grouped boxes are deployment or code-ownership boundaries. Arrows show build-time or run-time dependencies. Shared packages are consumed by both cloud and edge.*

| Component                         | Purpose                                                                                                             | Talks To                                     | Notes                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Desktop React Views               | Screens for POS, products, transfers, counts, day books, settings                                                   | Tauri services                               | Role-aware rendering via session role       |
| Tauri Services (TS)               | Orchestrate IPC to Rust for data and sync                                                                           | Rust commands, secure store, API when online | Background token upgrade, outbox push/pull  |
| Rust Commands (lib.rs)            | SQLite transactions, outbox CRUD, day-book upsert, genesis, restore, backup scheduler                               | SQLite, outbox, kv_store, day_books          | WAL mode, batch status updates              |
| SQLite (+FTS5)                    | Local ledger, products, stores, users, balances, devices, kv                                                        | Rust                                         | File at OS app-data path with dev fallbacks |
| Outbox Events                     | Pending sync queue                                                                                                  | Rust, sync service                           | Indexed on status + next_attempt            |
| KV Store                          | Last-sync timestamp, restore flag                                                                                   | Rust                                         | Used by header and genesis/restore flow     |
| Secure Store (tauri-plugin-store) | Device ID and JWT persistence                                                                                       | Tauri services                               | File`auth.dat`                            |
| FastAPI Routers                   | HTTP surface for auth, sync, products, stores, users, transfers, transactions, day_books, devices, dashboard, admin | Auth manager, ORM, ingestion                 | Versioned under`/api/v1`                  |
| Auth Manager                      | User lookup, password verify, device auto-register, token issue                                                     | Device table, config                         | FastAPI-Users compatible user model         |
| ORM + Alembic                     | Async SQLAlchemy mapping and migrations                                                                             | PostgreSQL                                   | Separate chains for PG and SQLite           |
| Domain Package                    | Ledger projection, transfer state machine, outbox rules                                                             | No framework deps                            | Pure Python with ULID only                  |
| Storage Package                   | SQLite models, migration runner, outbox service, seed helpers                                                       | SQLite                                       | Mirrors PG models structurally              |
| Shared-types / UI                 | TS interfaces and reusable React components                                                                         | Desktop, web, mobile                         | Workspaces                                  |
| Genesis Seed                      | One-time bootstrap of admin user, store, sentinel devices                                                           | PG + SQLite                                  | Idempotent by username                      |
| Ingestion Service                 | Idempotent batch ingestion with balance projection                                                                  | PG ledger + balances + receipts              | Partial-batch, priority ordering            |
| Day Book Service                  | Daily open/close tracking per store                                                                                 | PG and local day_books                       | Closing balance from balances projection    |
| Docker Compose                    | Local postgres + api with live mounts                                                                               | PG and API                                   | Health check on postgres                    |
| GitHub Actions                    | Lint, typecheck, test, Tauri build + smoke test                                                                     | All code                                     | Must be green to merge                      |

---

## 3. Communication Map

### Figure 3.1: Language and Protocol Communication Map

```mermaid
flowchart TB
    subgraph DesktopProcess["Desktop Process"]
        TS[TypeScript<br>React plus Services]
        RS[Rust<br>Tauri Commands]
        SQL[(SQLite)]
        STORE2[Secure Store<br>Plugin]
    end
    subgraph BrowserClients["Browser Clients"]
        WEB2[Web React TS]
        MOB2[Mobile React TS]
    end
    subgraph CloudProcess["Cloud Process"]
        PY[Python 3.12<br>FastAPI]
        PG3[(PostgreSQL)]
    end

    TS -- "IPC Tauri invoke JSON" --> RS
    RS -- "rusqlite SQL Params" --> SQL
    TS -- "JS API JSON" --> STORE2
    TS -- "HTTP JSON Bearer" --> PY
    WEB2 -- "HTTP JSON Bearer" --> PY
    MOB2 -- "HTTP JSON Bearer" --> PY
    PY -- "asyncpg SQL Async" --> PG3
    RS -- "HTTPS JSON Reqwest" --> PY
```

*Figure 3.1: Language and protocol communication map.*

*How to read this: Each node shows runtime/language. Edge labels name the protocol and payload shape with sync vs async. Follow an edge from caller to callee to see how they converse.*

| Link                                          | From (Lang/Runtime)                  | To (Lang/Runtime)         | Protocol                                  | Data Format       | Auth Method                                         | Sync / Async                                             |
| --------------------------------------------- | ------------------------------------ | ------------------------- | ----------------------------------------- | ----------------- | --------------------------------------------------- | -------------------------------------------------------- |
| 1. Desktop UI → Rust                         | TypeScript (React) / Browser + Tauri | Rust / Tauri              | Tauri IPC (`invoke`)                    | JSON (serde)      | None (in-process; OS window trust boundary)         | Synchronous request/response                             |
| 2. Rust → SQLite                             | Rust / rusqlite                      | SQLite                    | SQL via rusqlite (WAL)                    | Rows / params     | File-system permissions + WAL                       | Synchronous within Rust command transaction              |
| 3. Desktop TS → Secure Store                 | TypeScript / Tauri plugin            | Tauri plugin-store (file) | Plugin JS API                             | JSON key-value    | OS file permissions                                 | Asynchronous (promise)                                   |
| 4. Desktop TS → Cloud API (sync, auth, pull) | TypeScript / Fetch                   | Python FastAPI / Uvicorn  | HTTPS (HTTP in dev) JSON REST             | JSON              | Bearer JWT (access token) +`device_id` in payload | Asynchronous; retry with backoff                         |
| 5. Rust → Cloud API (genesis, restore)       | Rust / reqwest blocking              | Python FastAPI            | HTTPS JSON                                | JSON              | Username+password for genesis; Bearer after start   | Synchronous blocking (with timeout) in background thread |
| 6. Web Dashboard → Cloud API                 | TypeScript React / Vite              | Python FastAPI            | HTTPS JSON REST                           | JSON              | Bearer JWT                                          | Asynchronous                                             |
| 7. Mobile Companion → Cloud API              | TypeScript React / Vite              | Python FastAPI            | HTTPS JSON REST                           | JSON              | Bearer JWT                                          | Asynchronous                                             |
| 8. Cloud API → PostgreSQL                    | Python SQLAlchemy async              | PostgreSQL 16             | SQL via asyncpg                           | Rows              | Connection string (DATABASE_URL) + DB user          | Asynchronous                                             |
| 9. CI → Cloud API / Desktop                  | Node 22, Python 3.12, Rust stable    | Uvicorn, Tauri            | HTTP (test fixtures use in-memory SQLite) | JSON / binary     | CI secrets for build-time API URL                   | Asynchronous jobs                                        |
| 10. Updater (Desktop) → GitHub Releases      | Rust updater plugin                  | GitHub                    | HTTPS JSON manifests                      | JSON + installers | Public key verification (minisign)                  | Asynchronous poll at startup                             |

---

## 4. Core Flows

### Figure 4.1: Sequence — Authentication (Desktop Offline-First with Background JWT Upgrade)

```mermaid
sequenceDiagram
    participant UI as Desktop UI
    participant Local as "SQLite pin_hash"
    participant Secure as Secure Store
    participant API as "FastAPI auth login"
    participant PG as PostgreSQL

    UI->>Secure: Load or generate device id
    Secure-->>UI: device id
    UI->>UI: User enters username plus password
    UI->>Local: Verify bcrypt pin hash offline
    Local-->>UI: Match
    UI->>UI: Issue offline session, render immediately
    UI->>Secure: Persist offline session
    opt Background Upgrade when online
        UI->>API: POST auth login with credentials
        API->>PG: Find user verify bcrypt resolve device
        alt Device missing
            API->>PG: Auto-create device anchored to assigned store
        else Device revoked with reason
            API-->>UI: 401 device revoked
        end
        PG-->>API: user plus device row
        API-->>UI: access token plus refresh token plus role
        UI->>Secure: Replace offline token with JWT
        UI->>UI: Continue with JWT for sync
    end
```

*Figure 4.1: Sequence diagram for desktop authentication.*

*How to read this: Time flows top to bottom. Solid arrows are requests, dashed are returns. The `par` block shows the background network upgrade running concurrently with the already-rendered offline session.*

### Figure 4.2: Sequence — Web Dashboard Login (Email-Based)

```mermaid
sequenceDiagram
    participant Web as Web LoginView
    participant API as "FastAPI auth login"
    participant PG as PostgreSQL

    Web->>Web: User enters email plus password
    Web->>API: POST auth login with email password and sentinel device
    API->>PG: Lookup user by lower username verify password
    API->>PG: Find or auto-create sentinel device
    PG-->>API: user plus device
    API-->>Web: JWT plus role
    Web->>API: GET auth me with Bearer
    API-->>Web: Profile with role flag for Users page
```

*Figure 4.2: Sequence diagram for web dashboard authentication.*

*How to read this: The web client uses the same login endpoint as desktop but with a sentinel device identifier that is pre-seeded by genesis. Role determines whether user-management UI is enabled.*

### Figure 4.3: Sequence — Primary User Journey (Receive → Sell → View Balance)

```mermaid
sequenceDiagram
    participant Clerk as "Store Clerk Desktop"
    participant UI as React View
    participant Rust as Rust Commands
    participant SQLite as SQLite
    participant Sync as Sync Engine

    Clerk->>UI: Open Receive Stock select product enter quantity
    UI->>Rust: receive stock with store product quantity
    Rust->>Rust: Validate quantity non-zero generate ULID
    Rust->>SQLite: BEGIN insert transaction plus outbox upsert balance add daybook COMMIT
    SQLite-->>Rust: OK
    Rust-->>UI: Success
    UI->>UI: Show updated local balance immediately

    Clerk->>UI: Open Sale Issue enter quantity plus receipt
    UI->>Rust: sell stock with store product quantity receipt
    Rust->>SQLite: Check local balance sufficiency if strict
    Rust->>SQLite: Insert SALE transaction delta negative
    SQLite-->>Rust: OK
    Rust-->>UI: Success

    Clerk->>UI: Open Dashboard Products
    UI->>Rust: get products get balances
    Rust->>SQLite: SELECT with FTS5 or join on balances
    SQLite-->>Rust: Rows
    Rust-->>UI: Render catalogue plus quantities

    Sync->>Sync: Background push when online replicates to central ledger
```

*Figure 4.3: Sequence diagram for the primary daily journey.*

*How to read this: Vertical lanes are actors or layers. Each stock action is a local transaction first; the balance the clerk sees never waits for the network. Replication happens independently.*

### Figure 4.4: Sequence — Data Write (Local Ledger Commit with Day Book)

```mermaid
sequenceDiagram
    participant UI as View
    participant Rust as "Rust domain check plus ID gen"
    participant DB as SQLite

    UI->>Rust: Stock action with movement type quantity delta reason
    Rust->>Rust: Map UI input to transaction fields plus ULID
    Rust->>DB: Ensure schema tables exist
    Rust->>DB: BEGIN
    DB-->>Rust: tx open
    Rust->>DB: Insert transactions sync status PENDING
    Rust->>DB: Upsert balances increment by delta
    Rust->>DB: Ensure daybooks tables get-or-create row for store plus date
    Rust->>DB: Insert daybook entries skip hidden types
    Rust->>DB: Recompute closing balance from balances
    Rust->>DB: Insert outbox row with JSON payload
    Rust->>DB: COMMIT
    DB-->>Rust: Durable
    Rust-->>UI: Transaction ID plus new balance
```

*Figure 4.4: Sequence diagram for a local data write.*

*How to read this: The write is a single atomic SQLite transaction covering the ledger, the projection, the day book, and the outbox so a crash cannot leave them inconsistent.*

### Figure 4.5: Sequence — Data Read (Catalogue and Balance Projection)

```mermaid
sequenceDiagram
    participant UI as View
    participant Rust as Tauri Commands
    participant DB as "SQLite FTS5 plus balances"
    participant API as "Cloud Pull optional when online"

    UI->>Rust: Request products transactions daybooks
    Rust->>DB: SELECT products JOIN balances or FTS5 search
    DB-->>Rust: Result rows with quantity projections
    Rust-->>UI: Render

    alt Online and after successful push
        UI->>API: POST sync pull with since and limit via engine
        API-->>UI: Products plus Stores plus Balances plus servertime
        UI->>Rust: apply sync pull snapshot
        Rust->>DB: Batched upsert into local tables
        DB-->>Rust: Up to date
    end
```

*Figure 4.5: Sequence diagram for reading inventory data.*

*How to read this: Reads are local-first for instant rendering. The optional pull path runs only after pushes or on a forced sync and keeps the local catalogue converged with the cloud via delta timestamps.*

### Figure 4.6: Sequence — Synchronization (Push + Pull + Retry Backoff)

```mermaid
sequenceDiagram
    participant Outbox as "Outbox PENDING"
    participant Sync as triggerSync
    participant API as "API sync push and pull"
    participant PG as "PostgreSQL Ledger"

    Sync->>Outbox: get pending outbox events with limit and force
    Outbox-->>Sync: Batch rows
    Sync->>Sync: Mark rows SENDING sort by priority
    Sync->>API: POST sync push with events and products
    API->>PG: ingest batch per-item idempotency validation balance upsert
    PG-->>API: Per-item receipts accepted or rejected
    API-->>Sync: PushResponse receipts plus counts
    Sync->>Outbox: Batch update outbox to SYNCED or RETRYABLE or PERMANENT
    Sync->>Outbox: Batch update transaction sync status

    alt Network or 5xx error
        Sync->>Outbox: Mark batch RETRYABLE ERROR with backoff
    end

    alt Push had no fatal error
        Sync->>API: POST sync pull paginated with since cursor
        API-->>Sync: Merged products plus stores plus balances snapshot
        Sync->>Outbox: apply sync pull batched upsert locally
        Sync->>Sync: Store server time as last sync timestamp
    end
```

*Figure 4.6: Sequence diagram for synchronization.*

*How to read this: Arrows in the top half are the push loop that drains the queue in batches. The lower half shows error branching for retryable failures and the pull loop that only runs when the push path did not encounter a fatal error.*

### Figure 4.7: Sequence — Device Auto-Registration and Revocation

```mermaid
sequenceDiagram
    participant Desktop as "Desktop new device"
    participant API as "POST auth login"
    participant DB as Devices Table

    Desktop->>API: Login with previously unseen device id
    API->>DB: SELECT device by id not found
    API->>DB: Resolve anchor store from assigned store or any store
    API->>DB: Insert device row auto-registered
    DB-->>API: OK
    API-->>Desktop: JWT valid

    Desktop->>API: Subsequent login with same device id
    API->>DB: Found is active true update last seen

    alt Admin revokes device
        API->>DB: UPDATE device set is active false with reason
        Desktop->>API: Login with revoked device id
        API-->>Desktop: 401 device revoked
    end
```

*Figure 4.7: Sequence diagram for device auto-registration and revocation.*

*How to read this: The first successful login on any machine creates the device row without pre-provisioning. Revocation is an explicit admin action that then blocks future logins for that identifier.*

### Figure 4.8: Sequence — Restore From Cloud (Phased)

```mermaid
sequenceDiagram
    participant Wizard as Genesis Wizard
    participant Rust as Rust Restore Thread
    participant API as Cloud Restore Endpoints
    participant Local as Local SQLite

    Wizard->>Rust: validate restore credentials
    Rust->>API: Preview fetch
    API-->>Rust: Stores products transactions counts plus estimates
    Rust-->>Wizard: RestorePreview
    Wizard->>Rust: start prioritized restore
    Rust->>API: POST restore start with token
    API-->>Rust: Token
    Rust->>API: GET restore critical stores users products balances
    API-->>Rust: Critical snapshot
    Rust->>Local: Write stores products balances users with pin hash
    Rust->>Local: Insert recent transactions plus daybook entries set flag
    Rust-->>Wizard: Phase critical complete app usable
    Rust->>API: GET restore important 7 day history daybooks
    API-->>Rust: Important snapshot
    Rust->>Local: Append recent history
    Rust->>API: GET restore background older history
    API-->>Rust: Historical snapshot
    Rust->>Local: Append remaining transactions
    Rust-->>Wizard: Restore complete
```

*Figure 4.8: Sequence diagram for phased restore from cloud.*

*How to read this: Horizontal order follows data priority: critical data that makes the app usable arrives first, then progressively less-critical history in the background while progress is polled.*

### Figure 4.9: Sequence — Error and Retry Paths (Idempotency, Stale Rejection, Backoff)

```mermaid
sequenceDiagram
    participant Sync as Sync Engine
    participant API as ingest batch
    participant DB as PostgreSQL

    Sync->>API: Push batch with transaction TX-1

    alt Duplicate transaction PK collision
        API->>DB: INSERT inventory transactions IntegrityError pkey
        DB-->>API: Collision
        API->>DB: Ensure accepted receipt flip stale rejected if any
        DB-->>API: Accepted receipt guaranteed
        API-->>Sync: receipt accepted true
        Sync->>Sync: Mark outbox SYNCED no retry
    end

    alt Server internal transient error
        API->>DB: Unexpected exception
        DB-->>API: 5xx
        API-->>Sync: HTTP 5xx or receipt with Unexpected error
        Sync->>Sync: Mark event RETRYABLE ERROR next attempt via backoff
    end

    alt Validation rejection
        API-->>Sync: receipt accepted false reason permanent prefix
        Sync->>Sync: Mark PERMANENT REJECTION never retried
    end

    alt Stale insufficient stock now solvable
        Sync->>API: Re-push previously rejected SALE after ADJUSTMENT landed
        API->>DB: Re-evaluate current balance
        DB-->>API: Now sufficient
        API->>DB: Delete stale rejected receipt ingest SALE
        API-->>Sync: accepted true
    end
```

*Figure 4.9: Sequence diagram for error and retry paths.*

*How to read this: Each `alt` block is an independent outcome for the same push call. The rightmost block shows the re-evaluation case where a previously domain-rejected event becomes accepted after its baseline lands.*

---

## 5. Data Layer

### Figure 5.1: Entity-Relationship Diagram

```mermaid
erDiagram
    STORES ||--o{ USERS : assigned_store
    STORES ||--o{ DEVICES : owns
    STORES ||--o{ STOCK_BALANCES : holds
    STORES ||--o{ INVENTORY_TRANSACTIONS : records
    STORES ||--o{ TRANSFERS : source_or_dest
    STORES ||--o{ DAY_BOOKS : daily
    PRODUCTS ||--o{ STOCK_BALANCES : stocked
    PRODUCTS ||--o{ INVENTORY_TRANSACTIONS : moves
    PRODUCTS ||--o{ TRANSFERS : moved
    PRODUCTS ||--o{ DAY_BOOK_ENTRIES : listed
    USERS ||--o{ INVENTORY_TRANSACTIONS : creates
    DEVICES ||--o{ INVENTORY_TRANSACTIONS : originates
    TRANSFERS ||--o{ INVENTORY_TRANSACTIONS : correlated
    DAY_BOOKS ||--o{ DAY_BOOK_ENTRIES : contains
    INVENTORY_TRANSACTIONS ||--o{ SYNC_RECEIPTS : receipt_for
    INVENTORY_TRANSACTIONS ||--|| OUTBOX_EVENTS : outbox_mirror

    STORES {
        string id PK
        string code UK
        string name
        string address
        boolean is_active
        datetime created_at
        datetime updated_at
    }
    PRODUCTS {
        string id PK
        string sku UK
        string name
        string brand
        string category
        string unit
        string barcode
        string alternate_names
        boolean serial_tracking_enabled
        boolean is_active
        datetime created_at
        datetime updated_at
    }
    USERS {
        int id PK
        string username UK
        string email UK
        string hashed_password
        string pin_hash
        string full_name
        string role
        string assigned_store_id FK
        boolean is_active
    }
    DEVICES {
        string id PK
        string store_id FK
        string device_name
        boolean is_active
        datetime registered_at
        datetime last_seen_at
        string revocation_reason
        datetime revoked_at
    }
    STOCK_BALANCES {
        string id PK
        string store_id FK
        string product_id FK
        string stock_bucket
        int quantity
        datetime updated_at
    }
    INVENTORY_TRANSACTIONS {
        string transaction_id PK
        string store_id FK
        string product_id FK
        string movement_type
        string stock_bucket
        int quantity_delta
        datetime occurred_at
        datetime recorded_at
        int user_id
        string device_id FK
        string reference_number
        string reason_code
        string transfer_id
        string purchase_order_id
        string batch_id
        int client_sequence
        string sync_status
        datetime server_accepted_at
        string original_transaction_id
    }
    SYNC_RECEIPTS {
        string transaction_id PK
        boolean accepted
        string rejection_reason
        datetime received_at
        datetime processed_at
    }
    TRANSFERS {
        string id PK
        string source_store_id FK
        string destination_store_id FK
        string product_id FK
        int quantity
        string status
        string created_by_user_id FK
        string notes
        datetime created_at
        datetime updated_at
    }
    DAY_BOOKS {
        string id PK
        string store_id FK
        datetime book_date
        int opening_balance
        int closing_balance
        boolean balance_sheet_generated
        datetime balance_sheet_generated_at
    }
    DAY_BOOK_ENTRIES {
        string id PK
        string day_book_id FK
        string transaction_id FK
        string movement_type
        string product_id FK
        int quantity_delta
        string stock_bucket
        string reference_number
        string reason_code
    }
    OUTBOX_EVENTS {
        string id PK
        string event_id UK
        string event_type
        string payload
        string status
        int retry_count
        datetime next_attempt_at
        datetime created_at
        string last_error
    }
```

*Figure 5.1: Entity-relationship diagram for the inventory domain.*

*How to read this: Rectangles are entities, lines are foreign-key relationships with cardinality. The append-only ledger `INVENTORY_TRANSACTIONS` sits at the center; `STOCK_BALANCES` is its derived projection.*

| Entity                         | Purpose                                                                            | Key Relationships                                                                                | Notes                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Store**                | Physical location boundary for scoping all stock                                   | Parent to users (via assigned assignment), devices, balances, transactions, transfers, day books | `code` is unique and human-readable; `id` is `STORE-{CODE}` pattern                                                                |
| **Product**              | Catalog item with identity, categorization, tracking flags                         | Referenced by balances, transactions, transfers, day entries                                     | `sku` unique; FTS5 virtual table locally for search; `is_active` soft-delete                                                         |
| **User**                 | Human or service identity with role and optional store assignment                  | FK to Store nullable; creator of transactions and transfers                                      | FastAPI-Users fields on PG (`hashed_password`, `is_superuser`); `pin_hash` bcrypt only locally for offline                         |
| **Device**               | Named installation or sentinel (e.g., web dashboard) anchored to a store           | FK to Store; referenced by transactions                                                          | Auto-registered on first login; revocable with reason;`last_seen_at` updated on login                                                  |
| **StockBalance**         | Materialized quantity per (store, product, bucket) triple                          | Unique on (store_id, product_id, stock_bucket)                                                   | Always`SUM(quantity_delta)` of accepted transactions for that triple                                                                   |
| **InventoryTransaction** | Immutable movement event; the ledger                                               | FK to Store, Product, Device;`user_id` int; optional `transfer_id` correlation               | `transaction_id` is client-generated ULID and idempotency key; never updated except for in-place delta correction on idempotent replay |
| **SyncReceipt**          | Server verdict per transaction_id                                                  | PK equals transaction_id                                                                         | `accepted` with `rejection_reason`; persisted even for rejected items for idempotency                                                |
| **Transfer**             | Inter-store movement intent and state                                              | Source/destination stores, product, creator user                                                 | State machine DRAFT → DISPATCHED → RECEIVED/EXCEPTION/CANCELLED                                                                        |
| **DayBook**              | Daily container per store+date                                                     | FK to Store; aggregates entries                                                                  | `closing_balance` recomputed from balances projection; `balance_sheet_generated` flag                                                |
| **DayBookEntry**         | Visible transaction line within a day book                                         | FK to day_book and transaction                                                                   | Hidden movement types (ADJUSTMENT, RETURN, DAMAGE) excluded from entries but still affect closing balance                                |
| **OutboxEvent**          | Local pending queue item (SQLite only)                                             | Mirrors a transaction payload as JSON                                                            | Indexed on (status, next_attempt_at); drives sync engine                                                                                 |
| **KV Store**             | Small key-value for coordination (SQLite only)                                     | None                                                                                             | Keys include`last_sync_timestamp` and `restore_completed`                                                                            |
| **AuditEvent**           | Not found / needs confirmation — referenced in router plan but no model inspected | —                                                                                               | Listed as future extension                                                                                                               |

**Migrations and Versioning**

| Database             | Migration Tool                       | Config Path                                                                    | Version Chain                                                                                                                                                                                    | Latest Known   |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| PostgreSQL (central) | Alembic (async)                      | `infra/migrations/alembic.ini` + `env.py` + `infra/migrations/versions/` | 0001 initial schema → 0002 ledger tables → 0003 auth consolidation → 0004 fastapi-users schema → 0005 device user_id int → 0006 drop transfer FK →`20260917_2027_bdecea2c1d35` day books | 7 files listed |
| SQLite (local)       | Alembic (sync) + programmatic runner | `packages/storage/storage/migrations/alembic.ini` + `runner.py`            | 0001 initial sqlite schema → 0002 drop password column → 0003 change user_id to integer → 0004 add pin_hash → 0005 add FTS5 products                                                         | 5 files listed |

Application of migrations is via `alembic upgrade head` or, for SQLite, the programmatic `run_migrations(db_url)` helper used by Genesis and desktop startup. Schema changes follow the non-negotiable rule: new behaviour is added as new tables/columns and new transaction events, not by rewriting quantity columns.

**Retention**

Not found / needs confirmation. No explicit retention, archival, or purge policy was located in inspected configs or models. Backups are local file copies on a schedule; server-side retention for transactions and receipts is assumed indefinite.

---

## 6. Caching and Performance Design

### Figure 6.1: Caching and Data-Flow Diagram

```mermaid
flowchart TB
    subgraph Writes["Write Path Append and Project"]
        W1[User Action] --> W2[Rust Generate ULID]
        W2 --> W3[SQLite TX ledger plus balance plus daybook plus outbox]
        W3 --> W4[Local Balance Projection Updated Instantly]
    end
    subgraph SyncFlow["Sync Flow Batch and Converge"]
        S1[Outbox PENDING] --> S2[Fetch Batch plus Mark SENDING]
        S2 --> S3[HTTP Push to ingest batch]
        S3 --> S4[PG Ledger Append plus Balance Upsert plus Receipt]
        S4 --> S5[Pull Snapshot Delta since cursor]
        S5 --> S6[Local Batched Upsert]
    end
    subgraph Reads["Read Path Local First"]
        R1[View Requests Data] --> R2[Rust SELECT local tables FTS5 balances]
        R2 --> R3[Rendered Instantly No Network]
        R3 -.-> S5
    end
    W4 --> S1
    S6 --> R2
```

*Figure 6.1: Caching and data-flow diagram showing write, sync, and read paths.*

*How to read this: Top shows how a write lands locally and projects instantly. Middle shows the asynchronous batch channel to the server and back. Bottom shows reads never wait for the middle channel unless a pull is in progress; dotted line is the optional refresh.*

| Layer / Store                           | What Lives There                                        | How It Is Populated                                                                                 | How It Is Invalidated / Refreshed                                                                                        | Scope                                                 |
| --------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **React in-memory state**         | Current view data, search results, dashboard aggregates | `get_products`, `get_balances`, `get_transactions` Tauri calls                                | Re-fetch on`inven-tory:stores-updated` event or after sync completion; no explicit TTL                                 | Per window session                                    |
| **SQLite stock_balances**         | Materialized quantities per (store, product, bucket)    | Local`INSERT ... ON CONFLICT DO UPDATE quantity + delta` within same transaction as ledger insert | Never stale locally; server pull may upsert fresher rows; recomputed on restore                                          | Per device, per triple                                |
| **SQLite products + FTS5**        | Catalogue with full-text index                          | Genesis, local create, and server pull delta upsert                                                 | Upsert on pull (`INSERT OR REPLACE`); local creation queued as `PRODUCT_UPDATE`                                      | Per device catalogue                                  |
| **SQLite outbox_events**          | Pending event JSON blobs                                | Every stock movement writes one row                                                                 | Removed / transitioned to SYNCED/RETRYABLE/PERMANENT on push outcome with exponential backoff via`next_attempt_at`     | Durable queue per device                              |
| **SQLite day_books / entries**    | Per-store per-date aggregates                           | `upsert_day_book_entry` after every transaction                                                   | `closing_balance` recomputed from `stock_balances` AVAILABLE sum on each write                                       | Per store+date locally; PG mirrors centrally          |
| **KV kv_store**                   | `last_sync_timestamp`, `restore_completed`          | Written after successful pull or restore                                                            | Overwritten on next sync/restore; read as cursor for delta`since` param                                                | Single row per key per device                         |
| **Tauri secure store (auth.dat)** | Device ID, access and refresh tokens                    | Login success and background token upgrade                                                          | Replaced on refresh or re-login; cleared on logout                                                                       | Per device (OS user profile)                          |
| **PostgreSQL stock_balances**     | Central projection same shape as SQLite                 | `pg_insert ... ON CONFLICT DO UPDATE` inside `ingest_batch` transaction                         | Always authoritative after ingest; no cache invalidation needed                                                          | Central per (store, product, bucket)                  |
| **PostgreSQL sync_receipts**      | Acceptance verdict per transaction_id                   | Written inside ingest transaction                                                                   | Never updated except to flip stale`accepted=false` to `true` on PK collision / retry evaluation                      | Permanent                                             |
| **HTTP responses (pull)**         | Products, stores, balances snapshots                    | Server`SELECT ... WHERE updated_at > since` with placeholder-SKU filtering                        | Client cursor`since=server_time` keeps payloads proportional to changes; pagination slices combined stream at DB level | Per pull request                                      |
| **Static frontend builds**        | `dist/` for web and mobile                            | `vite build` in CI                                                                                | New deploy invalidates; no runtime HTTP cache described                                                                  | CDN / static hosting (Not found / needs confirmation) |

**Backoff and Retry Behavior**

Sync uses client-side exponential backoff: a retryable failure marks the outbox row `RETRYABLE_ERROR` with a `next_attempt_at` timestamp computed from `SYNC_RETRY_MAX` and `SYNC_RETRY_BACKOFF_BASE_SECONDS` (see Appendix A). `get_pending_outbox_events` skips rows whose `next_attempt_at` is in the future unless `force` is set. Permanent validation failures use prefix matching and are never retried automatically; stale domain rejections for `Insufficient stock` are specially re-evaluated inside `ingest_batch` when the live balance has changed since the original rejection.

---

## 7. Client Applications

### Figure 7.1: Desktop Application Map — Shell, Screens, and Navigation

```mermaid
flowchart TB
    subgraph Shell["Desktop Shell Tauri plus React"]
        INIT[Bootstrap<br>Device ID plus Genesis Check]
        AUTH[Auth Gate<br>LoginView OfflineBanner]
        HEADER[Header<br>Store Selector plus Sync Status]
        SIDEBAR[Sidebar<br>Primary plus More Sections]
        MAIN[Main Content Area<br>StoreProvider]
    end
    subgraph Views["Views by Nav Section"]
        subgraph Primary["Primary"]
            DASH[Dashboard]
            CREATE[Create Product<br>CSV Import Export]
            DAY[Day Books<br>PDF Export]
            SALE[Sale Issue]
            RECEIVE[Receive Stock]
            PRODUCTS[Products]
            COUNT[Physical Count<br>ADJUSTMENT]
            TXS[Transactions]
            SETTINGS[Settings]
        end
        subgraph More["More"]
            RET[Returns]
            TRANS[Transfers]
            DAM[Damage and Quarantine]
        end
    end
    subgraph Special["Special Screens"]
        GENESIS[Genesis Wizard<br>Create Store plus Admin]
        RESTORE[Restore Flow<br>Progress Polling]
    end

    INIT --> AUTH
    AUTH --> HEADER
    HEADER --> SIDEBAR
    SIDEBAR --> MAIN
    MAIN --> Primary
    MAIN --> More
    AUTH -.-> GENESIS
    GENESIS -.-> RESTORE
    RESTORE --> AUTH
```

*Figure 7.1: Desktop client application map.*

*How to read this: Top row is the persistent shell that always renders. The middle groups are the navigable screens organized by the sidebar sections. The bottom row is the first-run wizard that gates the shell until genesis or restore completes.*

| Screen / Module                       | Purpose                                                                   | Key Interactions                                                                               | Offline Behavior                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Genesis Wizard**              | First-run creation of store and admin user, or server restore             | Creates`STORE-{CODE}`, user with `pin_hash`, device row; or runs phased restore thread     | Fully local for genesis path; restore path requires network preview              |
| **LoginView**                   | Username + password entry                                                 | Offline bcrypt check then background JWT upgrade; persists tokens to secure store              | Offline login succeeds immediately; network upgrade is best-effort               |
| **Header**                      | Store selector, sync status, restore progress, current user + logout      | Switches`activeStoreId`, dispatches `inven-tory:stores-updated`, shows last sync timestamp | Store switch is local; sync status reads from outbox count + KV timestamp        |
| **Sidebar**                     | Navigation between views (primary vs More overflow)                       | Collapsible with`NavView` enum set                                                           | No network dependency                                                            |
| **Dashboard**                   | KPIs, stock trends, category donut, stacked status bar charts             | Reads local aggregates via Tauri commands                                                      | Entirely local                                                                   |
| **Create Product**              | Single product creation plus CSV/XLSX import/export                       | Writes product + outbox`PRODUCT_UPDATE`; import validates row-level                          | Local write; product replication piggy-backs on next push                        |
| **Products View**               | Search, filter, edit products                                             | FTS5 search locally; upserts via products IPC                                                  | Fully local                                                                      |
| **Receive Stock**               | Increase stock (RECEIPT) with reference and supplier                      | Single ULID transaction + outbox row                                                           | Durable locally; synced later                                                    |
| **Sale / Issue**                | Decrease stock (SALE) requiring receipt number                            | Validates receipt number, checks local balance                                                 | Queued locally even if offline; server enforces again on ingest                  |
| **Returns**                     | Return stock to AVAILABLE or other bucket (RETURN)                        | Bucket-aware transaction with reason                                                           | Local                                                                            |
| **Damage & Quarantine**         | Move stock between buckets (DAMAGE → quarantine)                         | `move_stock_bucket` with reason                                                              | Local                                                                            |
| **Physical Count (Adjustment)** | Reconcile counted vs system quantity (ADJUSTMENT)                         | Computes delta`counted - system`, requires non-blank reason                                  | Local                                                                            |
| **Transfers**                   | Draft → Dispatch → Receive workflow between stores                      | Creates Transfer row; dispatch emits TRANSFER event, receive emits compensating event          | Transfer lifecycle is local-first; central replication is via ledger events only |
| **Transactions**                | Audit list of all local ledger events                                     | Reads`inventory_transactions` with filters                                                   | Local                                                                            |
| **Day Books**                   | Per-store per-date book with closing balance and PDF balance-sheet export | Reads`day_books` + entries; PDF generated client-side                                        | Local; balances reflect outbox-not-yet-synced state until pull converges         |
| **Settings**                    | Profile display, logout, backup controls                                  | Clears tokens; triggers manual backup                                                          | Works offline                                                                    |

**Navigation Model**

`apps/desktop/src/config/navigation.ts` defines a `NavView` union and a `NAV_ITEMS` array partitioned into `primary` (9 items) and `more` (3 items). `useAppState` holds `currentView` and `activeStoreId`; `StoreProvider` propagates the active store context to all child screens. Switching stores dispatches a window event `inven-tory:stores-updated` that causes every mounted view to re-read its store-scoped local data without forcing a logout.

### Figure 7.2: Web Dashboard and Mobile Companion Map

```mermaid
flowchart LR
    subgraph Web["Web Dashboard Port 3000"]
        WLOGIN[Login email and password]
        WDASH[Unified Dashboard plus Search]
        WSTORES[Stores Management]
        WUSERS[Users CRUD<br>GLOBAL ADMIN only]
        WGLOBAL[Global Product Search]
    end
    subgraph Mobile["Mobile Companion Port 3001"]
        MLOGIN[Mobile Login Form]
        MSHELL[Read Only Shell<br>Responsive Views]
    end
    APIx[Central API]

    WLOGIN --> APIx
    WDASH --> APIx
    WSTORES --> APIx
    WUSERS --> APIx
    WGLOBAL --> APIx
    MLOGIN --> APIx
    MSHELL --> APIx
```

*Figure 7.2: Web dashboard and mobile companion navigation and API dependency.*

*How to read this: Each box is a screen group. All arrows point to the same central API; neither web nor mobile has a local database or outbox. Access to Users CRUD is gated by the role returned from `/auth/me`.*

| Client                     | Stack                                   | Ports (dev)                               | Screens Present                                 | Networking Model                                                            | Offline Support                                                    |
| -------------------------- | --------------------------------------- | ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Desktop**          | Tauri 2 (Rust) + React 18 + TS + Vite 5 | 1420 (Tauri devUrl) / 5173 (Vite-only UI) | All screens above including Genesis and Restore | IPC + HTTP to API when reachable; background sync interval defaults to 30 s | Full — every write is local-first                                 |
| **Web Dashboard**    | React 18 + TS + Vite 5                  | 3000                                      | Login, Search, Store, Users, UnifiedDashboard   | Direct HTTP to`VITE_API_BASE_URL`                                         | None described — requires network                                 |
| **Mobile Companion** | React 18 + TS + Vite 5                  | 3001                                      | MobileLoginForm + read-only app shell           | Direct HTTP to`VITE_API_BASE_URL`                                         | None — explicitly read-only, no transaction entry in this version |

Shared concerns for web/mobile: component library from `@invenTory/ui` (Button, Card, Table, Modal, LinearGridEntry, etc.) and types from `@invenTory/shared-types`. Desktop has additional dependencies `xlsx`, `papaparse`, `@react-pdf/renderer`, `recharts`, and Tauri plugins (`store`, updater).

---

## 8. API Overview

### Figure 8.1: API Domain Groups and Mount Points

```mermaid
flowchart TB
    ROOT["health docs redoc openapi"]
    subgraph V1["api v1"]
        AUTH["auth<br>register login jwt login<br>refresh logout me change-password"]
        SYNC["sync<br>push pull status<br>restore preview critical important background"]
        PRODUCTS["products"]
        STORES["stores"]
        USERS["users"]
        TRANSFERS["transfers"]
        TXS["transactions"]
        DAYB["daybooks"]
        DEVS["devices"]
        DASH["dashboard plus admin"]
        RESTORE["restore alias<br>same as sync restore"]
    end
    ROOT --> V1
    V1 --> AUTH
    V1 --> SYNC
    V1 --> PRODUCTS
    V1 --> STORES
    V1 --> USERS
    V1 --> TRANSFERS
    V1 --> TXS
    V1 --> DAYB
    V1 --> DEVS
    V1 --> DASH
    SYNC -.-> RESTORE
```

*Figure 8.1: API domain groups and route mount points.*

*How to read this: The root box hosts health and docs endpoints. The grouped box lists all versioned domain routers mounted under `/api/v1`. The dashed line indicates that `/restore/*` is an alias for `/sync/restore/*`.*

**Authentication**

Bearer JWT in `Authorization` header. The login flow at `POST /api/v1/auth/login` accepts JSON with `username`, `password`, and an optional `device_id` and returns `access_token` plus `refresh_token`. Standard FastAPI-Users routes under `/auth/jwt/*` additionally provide form-encoded login. Refresh is via `POST /api/v1/auth/refresh` with a `refresh_token` body. Current-user introspection is at `GET /api/v1/auth/me`. Device identity is carried as a JWT claim (`device_id`) and also echoed in the `X-Device-Id` CORS-allowed header on subsequent requests.

**Domain Groups**

| Domain / Router             | Prefix                                   | Representative Endpoints                                                                     | Purpose                                                                                               |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **health**            | `/health`                              | `GET /health` returns status and version                                                   | Liveness probe; no auth                                                                               |
| **auth**              | `/api/v1/auth`                         | `POST /login`, `POST /register`, `POST /refresh`, `GET /me`, plus `/jwt/*` routers | Credential verification, device auto-registration, token lifecycle, user creation (GLOBAL_ADMIN only) |
| **sync**              | `/api/v1/sync`                         | `POST /push`, `POST /pull`, `GET /status`, `GET /restore/*`                          | Batched event ingestion, catalogue delta pull, health, and phased restore                             |
| **products**          | `/api/v1/products`                     | CRUD for products                                                                            | Catalogue management centrally; local creation flows through sync`PRODUCT_UPDATE`                   |
| **stores**            | `/api/v1/stores`                       | CRUD for stores                                                                              | Multi-store scope boundary                                                                            |
| **users**             | `/api/v1/users`                        | User list/update/deactivate                                                                  | Mirrors auth users router; GLOBAL_ADMIN gated                                                         |
| **devices**           | `/api/v1/devices`                      | Device list/revocation                                                                       | Device inventory and revocation side-effect                                                           |
| **transactions**      | `/api/v1/transactions`                 | Query ledger events                                                                          | Audit reads; append-only                                                                              |
| **transfers**         | `/api/v1/transfers`                    | Draft/dispatch/receive/cancel lifecycle                                                      | Inter-store movement state machine                                                                    |
| **day_books**         | `/api/v1/day_books`                    | Per-store per-date book queries + close/generate                                             | Daily balance-sheet derived from ledger                                                               |
| **dashboard / admin** | `/api/v1/dashboard`, `/api/v1/admin` | Aggregates for dashboards                                                                    | Not fully inspected — listed in`app/main.py` router registration                                   |

**Response and Error Format**

Success responses follow Pydantic schemas for each domain (e.g., `PushResponse` with `receipts`, `accepted_count`, `rejected_count`, `server_time`). Domain rejections on push are per-item `accepted=false` with a `rejection_reason` string — not an HTTP error — so that `SYNC-012` partial-batch semantics can commit mixed outcomes. Unhandled exceptions are caught by a global JSON handler that returns a machine-readable 500 envelope with `detail`, `message`, `type`, and `path` and, outside `production`, a `traceback` array. The handler also re-applies `Access-Control-Allow-Origin` for the request origin so browser and Tauri webview callers receive a readable error instead of an opaque CORS failure. Request/response logging is at INFO with slow-request escalation at WARNING above `slow_query_threshold_ms`.

**Limits and Behavioural Constraints**

| Limit                                 | Value / Behaviour                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Max batch size for`POST /sync/push` | `events` array capped at 1,000 items; client default batch is 500 (forced catalogue path may also include piggy-backed products)                       |
| Pagination on`POST /sync/pull`      | Optional`limit` up to 1,000,000 slicing combined products→stores→balances stream at DB level; `since` cursor uses `server_time` of previous pull |
| CORS allowed origins                  | Configured via`CORS_ORIGINS_RAW`; includes localhost dev ports, Tauri origins                                                                          |
| Allowed methods                       | GET, POST, PUT, PATCH, DELETE, OPTIONS                                                                                                                   |
| Allowed headers                       | Authorization, Content-Type, X-Device-Id, Accept, Origin, X-Requested-With                                                                               |
| Bulk CSV import                       | Row-level validation; no silent partial success (Not found / needs confirmation for server-side bulk route limits)                                       |

---

## 9. Security Architecture

### Figure 9.1: Security Architecture — Trust Boundaries, Auth Chain, and Secrets Handling

```mermaid
flowchart TB
    subgraph Untrusted["Untrusted Edge and Network"]
        BROWSER[Browser Mobile WebView]
        NETWORK[Network HTTPS in prod]
        DEVICEFS[Device File System<br>SQLite file plus backups]
    end
    subgraph TrustBoundary1["Trust Boundary Application"]
        TAURI[Tauri Window<br>CSP null]
        SECURE2[Secure Store<br>auth dot dat]
        API3[FastAPI App<br>CORS plus Global Error Handler]
        AUTH3[Auth Manager<br>bcrypt plus JWT HS256]
    end
    subgraph Trusted["Trusted Data"]
        PG4[(PostgreSQL<br>Central Ledger)]
        ENV[Env files<br>DATABASE URL plus SECRET KEY]
    end

    BROWSER --> NETWORK
    NETWORK --> API3
    TAURI --> SECURE2
    TAURI --> DEVICEFS
    API3 --> AUTH3
    AUTH3 --> PG4
    ENV --> API3
    ENV --> PG4
```

*Figure 9.1: Security architecture showing trust boundaries, the authentication chain, and secrets handling.*

*How to read this: The left group is exposed to users and the network; the middle group is where authentication and authorization are enforced; the right group holds durable secrets and the ledger. Arrows show the direction secrets and trust must flow; boundaries are where validation occurs.*

| Area                            | Mechanism                                                                                                                                                                                        | Who Enforces / Reads It                                                                                                        | Default / Expected Behaviour                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Perimeter / Transport** | TLS in production (`NFR-SEC-001` asserted); CORS allowlist via `CORS_ORIGINS_RAW`; global JSON exception handler re-emits CORS headers on 5xx                                                | Uvicorn / FastAPI`CORSMiddleware` + custom handler                                                                           | Dev runs on`http://localhost` with HTTP; production requires HTTPS and correct `SECRET_KEY`                                                                                                                                |
| **Password Storage**      | `bcrypt` with 12 rounds (`_BCRYPT_MIN_ROUNDS=12`) producing `$2b$` hashes; `hash_password` / `verify_password` directly via `bcrypt` library, not through passlib wrapper            | `app/core/security.py` and `infra/seed/genesis_single_user.py` (central hashed_password) plus local `pin_hash` in SQLite | Hashes are compatible across central and local DBs; passlib`CryptContext` is intentionally avoided to suppress probe warnings                                                                                                |
| **JWT Access Tokens**     | HS256 signed with`SECRET_KEY`; claims include `sub` (user id), `type=access`, `role`, `device_id`, `iat`, `exp`                                                                    | `create_access_token` / `decode_access_token` with lifetime `ACCESS_TOKEN_EXPIRE_MINUTES`                                | Default 60 minutes; issued on`POST /auth/login` (with device claim) or `POST /auth/refresh` (sentinel `REFRESH_NO_DEVICE`)                                                                                               |
| **JWT Refresh Tokens**    | Same algorithm with`type=refresh` only carrying `sub`; longer lifetime `REFRESH_TOKEN_EXPIRE_DAYS`                                                                                         | `create_refresh_token` / `decode_refresh_token`                                                                            | Default 30 days; exchange via`POST /auth/refresh` to obtain a device-less access token                                                                                                                                       |
| **Device Identity**       | `device_id` claim in access token; optional on login (`SINGLE-USER-DEVICE` fallback); anchored to `assigned_store_id` or any store                                                         | `POST /auth/login` device resolution block                                                                                   | Unknown devices auto-register; only devices with`is_active=false` plus a `revocation_reason` are rejected                                                                                                                  |
| **Device Revocation**     | `Device.is_active` plus `revocation_reason` + `revoked_at`; middleware checks revocation on login and tokens remain stateless otherwise                                                    | Admin operation updating devices table (PostgreSQL)                                                                            | Next login with revoked device returns 401; existing tokens expire naturally after access-token lifetime unless explicitly checked elsewhere (Not found / needs confirmation for middleware revocation check on every request) |
| **Authorization / Roles** | Six roles:`GLOBAL_ADMIN`, `INVENTORY_MANAGER`, `STORE_MANAGER`, `STORE_CLERK`, `AUDITOR`, `SYNC`; server re-authorizes every API action                                              | `app/core/permissions` module + per-router dependency checks; `GLOBAL_ADMIN` gates `POST /auth/register`                 | Users have single store assignment (`assigned_store_id` nullable for global roles); desktop passes `currentUserRole` as prop for local UI gating                                                                           |
| **Secrets Handling**      | `SECRET_KEY` loaded from `.env` via `pydantic-settings`; `DATABASE_URL` with percent-encoded special characters; root and service `.env` files plus per-app `.env.example` templates | `app/core/config.py` (`Settings`) reads env file; staging/prod validation rejects default key                              | No secrets hard-coded;`.env` is git-ignored; Compose provides `dev-secret-change-in-production` placeholder for dev only                                                                                                   |
| **Stateless Logout**      | `POST /auth/logout` is advisory; server does not maintain a token blacklist                                                                                                                    | `app/api/v1/auth.py`                                                                                                         | Client discards cached tokens; true revocation via token expiry or device revocation                                                                                                                                           |
| **CSP / Tauri**           | `tauri.conf.json` sets `security.csp: null`, `withGlobalTauri: true`                                                                                                                       | Tauri runtime                                                                                                                  | Webview CSP is disabled — requires follow-up review for production hardening (see Appendix C)                                                                                                                                 |
| **Audit / Logging**       | Password-change and auth events logged at INFO/WARNING with structured fields;`OfflineAuthBanner` preserves audit intent                                                                       | `app/api/v1/auth.py` logger and desktop services                                                                             | No full audit-event ledger entity inspected (AuditEvent model exists but content is not detailed here)                                                                                                                         |
| **Updater Trust**         | Minisign public key`pubkey` in `tauri.conf.json` plus `createUpdaterArtifacts` true                                                                                                        | `tauri-plugin-updater`                                                                                                       | Verifies installer manifests fetched from GitHub Releases                                                                                                                                                                      |

---

## 10. Deployment and Infrastructure

### Figure 10.1: Deployment and Infrastructure Diagram

```mermaid
flowchart TB
    subgraph DevHost["Development Host"]
        VENV[Python venv<br>3 dot 12]
        NPM[NPM Workspaces<br>Node 20]
        CARGO[Cargo Tauri CLI<br>Rust stable]
    end
    subgraph Compose["Docker Compose"]
        PG5[postgres 16 alpine<br>5432 volume pgdata<br>healthcheck pg isready]
        APIC[api<br>FastAPI Uvicorn<br>8000 mounts api plus domain]
    end
    subgraph FrontendsDev["Frontend Dev Servers"]
        VITE_D[Vite Desktop 1420 wrapped 5173 bare]
        VITE_W[Vite Web 3000]
        VITE_M[Vite Mobile 3001]
    end
    subgraph ProdArtifacts["Production Artifacts"]
        IMAGE[Docker Image<br>built from Dockerfile api]
        DIST_W[Web dist]
        DIST_M[Mobile dist]
        BUNDLE[Tauri Bundles<br>NSIS AppImage deb]
    end
    DevHost --> Compose
    Compose --> FrontendsDev
    Compose --> APIC
    APIC --> PG5
    IMAGE -.-> APIC
    VITE_W --> DIST_W
    VITE_M --> DIST_M
```

*Figure 10.1: Deployment and infrastructure diagram.*

*How to read this: The leftmost group is what's installed on a developer machine. The middle group is the Compose stack that runs the database and API. The rightmost group lists production artifacts whose hosting target is not explicitly described in the repository.*

| Aspect                                      | Details                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Required Tool Versions**            | Python 3.12, Node 20 / npm 10, Rust stable 1.80+, Docker 24 / Compose v2; optional PostgreSQL client 16                                                                                                                                                                                                      |
| **Servers / Services**                | `postgres:16-alpine` on internal port 5432 (mapped to host 5432) with `postgres_data` named volume and healthcheck; `api` FastAPI+Uvicorn on 8000 depending on `postgres` healthy                                                                                                                    |
| **Ports**                             | 5432 PostgreSQL, 8000 API, 1420 desktop Tauri devUrl, 5173 Vite bare desktop UI, 3000 web dashboard, 3001 mobile companion                                                                                                                                                                                   |
| **Networks / Connections**            | Compose network via service name`postgres` resolving to DB host inside API container; CORS origins include all localhost/127.0.0.1 + Tauri origins; desktop Rust contacts API via reqwest over HTTP(S)                                                                                                     |
| **Storage**                           | Docker volume`invtory-postgres-data` for PG; local SQLite file at OS app-data path (`APPDATA\invenTory\data` on Windows, `Library/Application Support/com.invenTory.desktop` on macOS, `.local/share/invenTory` on Linux) with dev fallbacks walked from cwd; backup copies scheduled from same path |
| **External Hosting**                  | Not found / needs confirmation for production hosting provider, reverse proxy, or managed PostgreSQL; Compose is development-only with`DATABASE_URL` pointing at internal hostname                                                                                                                         |
| **Environment Configuration**         | Root`.env`, `services/api/.env`, and per-frontend `.env.example` templates; required values `DATABASE_URL` and `SECRET_KEY` (with percent-encoding for special characters); `SYNC_BATCH_SIZE`, `ENVIRONMENT`, `LOG_LEVEL`, `SQL_ECHO`, `SLOW_QUERY_THRESHOLD_MS`                         |
| **Scaling Story for Deploy Workflow** | Compose for local single-node; production image`Dockerfile.api` is multi-stage Python; scaling to multiple API replicas is not described and would require external PostgreSQL and secret management (see Risks)                                                                                           |

**Backup Strategy**

Local scheduled backup via `backupScheduler` service in the desktop (interval not confirmed). Backups are filesystem copies of the SQLite file, not server-side database backups. Central PostgreSQL backups are Not found / needs confirmation.

**Environment Distinctions**

| Environment           | How Distinguished                                                                                                                               | Behaviour Differences                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **development** | `ENVIRONMENT=development`, `SECRET_KEY` may be default, `LOG_LEVEL=INFO`, `SQL_ECHO` false, CORS includes all localhost + Tauri origins | Uvicorn`--reload`, Compose mounts live source, detailed exception traces returned in 500 envelope              |
| **staging**     | Not found / needs confirmation                                                                                                                  | Not enumerated in inspected configs                                                                              |
| **production**  | `ENVIRONMENT=production` plus non-default `SECRET_KEY` enforced by `Settings.validate_secret_key`                                         | No traceback in 500 envelope, CSP / secret requirements stricter, Tauri updater endpoints target GitHub Releases |

---

## 11. Operational Workflows

### Figure 11.1: CI/CD and Release Pipeline Diagram

```mermaid
flowchart LR
    subgraph Triggers["Triggers"]
        PUSH[push to any branch]
        PR[PR to develop main]
        DISP[workflow dispatch debug build flag]
    end
    subgraph LintTest["Lint and Test Parallel"]
        LP[lint-python<br>ruff plus black]
        TP[test-python<br>pytest domain storage api]
        LT[lint-typescript<br>tsc plus ESLint plus Prettier]
        TT[test-typescript<br>vitest all workspaces]
    end
    subgraph Build["Build Desktop Only on main"]
        BMATRIX[Matrix windows plus linux]
        TAURI[Tauri build features debug<br>with API base URL secret check]
        SMOKE[Smoke Test<br>Xvfb Linux plus raw exe Windows]
        ART[Artifacts Upload<br>AppImage deb plus NSIS exe plus logs]
    end

    PUSH --> LP
    PR --> LP
    DISP --> LP
    PUSH --> TP
    PUSH --> LT
    PUSH --> TT
    LP --> BMATRIX
    TP --> BMATRIX
    LT --> BMATRIX
    TT --> BMATRIX
    BMATRIX --> TAURI
    TAURI --> SMOKE
    SMOKE --> ART
```

*Figure 11.1: CI/CD and release pipeline diagram.*

*How to read this: The leftmost column shows what initiates a run. The middle column runs four checks in parallel on every branch. The right column only executes when the branch is `main` and builds the desktop installers with platform-specific smoke tests.*

| Job                       | Runner / Trigger                                                       | Steps                                                                                                                                                                                                                                                                | Gate                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **lint-python**     | `ubuntu-latest` on every push + PR                                   | Setup Python 3.12 → install`ruff black` → `ruff check services/ packages/` → `black --check`                                                                                                                                                                | Must pass to merge; pre-push hook mirrors                                                             |
| **test-python**     | `ubuntu-latest`                                                      | Setup Python 3.12 → editable installs of`domain`, `storage`, `api` → `pytest ... -v --tb=short` with in-memory SQLite test fixtures                                                                                                                        | Must pass                                                                                             |
| **lint-typescript** | `ubuntu-latest`, Node 22, `npm ci`                                 | `tsc --noEmit` (typecheck) → `npm run lint` (ESLint) → `npm run format:check` (Prettier) across all workspaces                                                                                                                                               | Must pass; pre-commit auto-writes Prettier                                                            |
| **test-typescript** | `ubuntu-latest`, Node 22                                             | `npm ci` → `npm test --workspaces` (Vitest `run --passWithNoTests`)                                                                                                                                                                                           | Must pass                                                                                             |
| **build-desktop**   | `windows-latest` + `ubuntu-22.04` matrix, only `refs/heads/main` | Install Node/Rust → patch`tauri.conf.json` to enable devtools + limit Windows bundles to NSIS → `tauri build --features debug` → smoke launch under `xvfb-run` or Windows exe spawn → capture `startup_debug.log` + upload AppImage/deb/exe + smoke logs | Artifacts retained 7 days, smoke logs 14 days;`VITE_API_BASE_URL` secret must be set or build fails |

Additional local quality gates: `.githooks/pre-commit` runs `prettier --write` on staged `*.ts/*.tsx` and re-stages; `.githooks/pre-push` runs `ruff` + `black --check` + `prettier --check` and blocks push on failure.

### Figure 11.2: Content and Data-Ingestion Pipeline

```mermaid
flowchart TB
    subgraph Capture["Capture"]
        UI2[Receive Sale Transfer Adjust Damage UIs]
        GEN[Genesis Bootstrap]
        IMPORT[CSV Import via Create Product]
    end
    subgraph LocalDurable["Local Durable Layer"]
        TXLOC[InventoryTransaction<br>SQLite ledger]
        BALLOC[StockBalance Upsert]
        DAYLOC[Day Book Entry]
        OUT[(Outbox Row)]
        PRODLOC[Products Catalogue]
    end
    subgraph Transport["Transport"]
        PUSH2[Sync Push Batch<br>HTTP POST sync push]
        PULL2[Sync Pull Snapshot<br>POST sync pull with since limit]
        RESTORE2[Restore Phases<br>preview critical important background]
    end
    subgraph Central["Central Durable Layer"]
        TXCENT[(InventoryTransaction PG<br>Append-only)]
        BALCENT[(StockBalance PG<br>Central projection)]
        RECEIPT[(SyncReceipt<br>Verdict per TX)]
        DAYPG[(DayBook Entries PG)]
    end

    UI2 --> TXLOC
    GEN --> TXLOC
    IMPORT --> PRODLOC
    TXLOC --> BALLOC
    TXLOC --> DAYLOC
    TXLOC --> OUT
    PRODLOC --> OUT
    OUT --> PUSH2
    PUSH2 --> TXCENT
    TXCENT --> BALCENT
    TXCENT --> RECEIPT
    TXCENT --> DAYPG
    PULL2 --> PRODLOC
    RESTORE2 --> TXLOC
    RESTORE2 --> PRODLOC
```

*Figure 11.2: Content and data-ingestion pipeline from capture to central ledger and back.*

*How to read this: Follow the left-to-right flow: human or bootstrap actions create durable local rows; the outbox carries them over the transport; the central ingestion appends them and projects them; the reverse pull and restore flows carry authoritative copies back to the edge.*

| Stage                         | Component Responsible                                                | Behaviour                                                                                                                                                                  | Failure Handling                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capture**             | React views, Genesis seed, CSV parser (`papaparse` + `xlsx`)     | Validates input in UI, generates ULID transaction_id, classifies movement type and bucket                                                                                  | Row-level validation on CSV; no silent partial success — errors surfaced to user                                                            |
| **Local durable write** | Rust commands                                                        | Single SQLite transaction writes`inventory_transactions` (PENDING), `stock_balances` increment, `day_books`/`day_book_entries`, and `outbox_events` JSON payload | WAL +`busy_timeout`; rollback on any step failure                                                                                          |
| **Transport push**      | `tauriSyncService.triggerSync`                                     | Batches by`batchSize` (default 500), sorts by movement priority, piggy-backs catalogue, posts to `/sync/push`                                                          | Network / 5xx →`RETRYABLE_ERROR` with backoff; 200 with `accepted=false` → classified as permanent or retryable by prefix              |
| **Central ingestion**   | `services/ingestion.ingest_batch`                                  | Per-item idempotency on PK, validation, insufficient-stock check, ledger insert, balance upsert, receipt write, day-book add; priority ordering mirrors client             | `IntegrityError` on PK → ensure accepted receipt; unexpected exception → persisted as rejected receipt with `Unexpected error:` marker |
| **Pull / converge**     | `POST /sync/pull` with delta cursor                                | Server`SELECT ... WHERE updated_at > since` skipping placeholder SKUs; pagination at DB level; client batched `apply_sync_pull`                                        | Pull failure is non-fatal; last-sync timestamp still advanced on the push portion                                                            |
| **Restore**             | `do_restore` background thread in Rust                             | Phased fetch of`critical` (usable immediately) → `important` → `background` via three endpoints; updates `RESTORE_PROGRESS` polled by React                      | Cancellation path clears outbox and local progress; errors surface via progress`phase=error`                                               |
| **Derived views**       | Dashboard, search,`GLOBAL_SEARCH` modal, notification center (SRS) | Read from local projections or central aggregates                                                                                                                          | Not found / needs confirmation for refresh interval of derived views such as low-stock alerts                                                |

---

## 12. Business Rules and Models

No diagram opens the business-rules section — the state diagrams and data model above already cover them visually. The additional state diagram that follows is the canonical rule reference for the two stateful areas.

### Figure 12.1: State Diagram — Outbox Event Lifecycle (Local SQLite)

```mermaid
stateDiagram-v2
    [*] --> PENDING: stock action creates outbox row
    PENDING --> SENDING: triggerSync marks batch SENDING
    SENDING --> SYNCED: receipt accepted true
    SENDING --> PERMANENT_REJECTION: server validation prefix
    SENDING --> RETRYABLE_ERROR: 5xx / network / retryable rejection
    RETRYABLE_ERROR --> PENDING: force flag or next_attempt_at reached
    RETRYABLE_ERROR --> PERMANENT_REJECTION: manual triage or prefix reclassification
    SENDING --> RETRYABLE_ERROR: missing receipt / stale domain retried
    SYNCED --> [*]
    PERMANENT_REJECTION --> [*]
```

*Figure 12.1: State diagram for the local outbox event lifecycle.*

*How to read this: Nodes are persisted `status` values, edges are transitions with the event that triggers them. Only `RETRYABLE_ERROR` can return toward `PENDING`; the two terminal states are read-only.*

### Figure 12.2: State Diagram — Transfer Lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT: create transfer intent
    DRAFT --> DISPATCHED: dispatch - emits source negative movement
    DRAFT --> CANCELLED: cancel from draft
    DISPATCHED --> RECEIVED: destination confirms receive + positive movement
    DISPATCHED --> EXCEPTION: discrepancy flagged
    DISPATCHED --> CANCELLED: cancel dispatched - emits compensating positive at source
    EXCEPTION --> RECEIVED: resolve exception and receive
    EXCEPTION --> CANCELLED: cancel from exception - emits compensation
    RECEIVED --> [*]
    CANCELLED --> [*]
```

*Figure 12.2: State diagram for inter-store transfer lifecycle.*

*How to read this: Each transition is validated against an allowed-set map; terminal states have no outgoing edges. Every transition that moves stock creates a corresponding immutable ledger event.*

### Figure 12.3: State Diagram — Day Book Lifecycle

```mermaid
stateDiagram-v2
    [*] --> OPEN: first transaction for store+date creates day_books row
    OPEN --> OPEN: subsequent transactions upsert entries and recompute closing
    OPEN --> CLOSED: balance_sheet_generated flag set by operator
    CLOSED --> [*]
```

*Figure 12.3: State diagram for the per-store per-date day book.*

*How to read this: There are only two non-terminal states. `OPEN` accumulates entries throughout the day; `CLOSED` is a one-way archival step that freezes the book for the date.*

| Business Area                     | Rule                                                                                            | Expression in Words                                                                                                        | Where Enforced                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Ledger invariant**        | Balance projection is sum of accepted deltas                                                    | `balance(store,product,bucket) = sum of quantity_delta over every accepted inventory transaction for that triple`        | `domain/rules/ledger.project_balance` (pure) and `_upsert_stock_balance` (materialized)                 |
| **Non-negotiable**          | Never overwrite quantity columns in sync; always append events                                  | `new_quantity = old_quantity + delta` derived, not `quantity = remote_value`                                           | Architecture invariant; enforced by outbox-only sync                                                        |
| **Negative stock (strict)** | FR-MOV-008: transaction that would make projected balance negative is rejected                  | `if current_quantity + quantity_delta < 0 then reject Insufficient stock`                                                | Server`ingest_transaction` negative-delta branch and domain `validate_transaction` with `strict_mode` |
| **Reversal**                | FR-MOV-009: corrections are new compensating events linked to original                          | `reversal quantity = -original quantity, reason prefixed REVERSAL, reference REV-{original_tx_id}`                       | `domain/rules/ledger.create_reversal`; original row never deleted                                         |
| **Physical count**          | FR-MOV-006: adjustments require a non-blank reason and delta from count                         | `delta = counted_quantity - system_quantity; require trim(reason) non-empty`                                             | `create_adjustment_transaction` plus UI validation; server accepts ADJUSTMENT same as other types         |
| **SALE receipt**            | Phase 3: sale/issue must carry a receipt reference                                              | `if movement_type == SALE then require trim(reference_number) non-empty`                                                 | Server`_validate_payload` and desktop form validation                                                     |
| **Transfer integrity**      | AT-005: paired dispatch and receive deltas are equal and opposite, same transfer_id and product | `dispatch.transfer_id == receive.transfer_id and dispatch.quantity_delta + receive.quantity_delta == 0`                  | `domain/rules/transfer_rules.validate_transfer_deltas` and state machine guard                            |
| **Transfer cancellation**   | Only DISPATCHED or EXCEPTION compensates source stock                                           | `if status in DISPATCHED,EXCEPTION then emit positive compensating movement at source else no-op`                        | `create_cancel_compensation_transaction`                                                                  |
| **Hidden day-book types**   | ADJUSTMENT, RETURN, DAMAGE excluded from visible entries but still affect closing balance       | `if movement_type in hidden then skip day_book_entries insert else upsert entry; always recompute closing from balances` | `upsert_day_book_entry` in Rust                                                                           |
| **Idempotency**             | SYNC-003/004:`transaction_id` is the business-level idempotency key                           | `if ledger already contains transaction_id then return accepted receipt without new write`                               | Server`ingest_transaction` ledger-first check plus receipt re-evaluation                                  |

**Plans, Quotas, and Product Limits**

Not found / needs confirmation for monetised plans, quotas, subscription tiers, or feature ceilings. The system appears to be single-tenant per deployment with role-based capabilities but no plan-dependent gating observed in configuration or routers. Product limits that were found are filesystem or protocol constraints rather than business tiers:

| Limit                           | Value                                                | Source                                               |
| ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Max offline`device_id` length | 64 chars; generated`DESKTOP-{host}-{rand}` pattern | `LoginRequest.device_id` and `_generateDeviceId` |
| Outbox payload`event_type`    | 100 chars                                            | `OutboxEvent` model                                |
| Product id/name/sku lengths     | 36 (id), 100 (sku), 255 (name) with unique sku index | `Product` model                                    |
| Transaction`reference_number` | 100 chars (sale receipt, return ref, etc.)           | `InventoryTransaction` model                       |

---

## 13. Scalability, Limits, and Risks

| Dimension                       | Current Capacity (as inspected)                                                                                           | Bottleneck                                                                                                        | Scaling Recommendation                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **API concurrency**       | Uvicorn single-worker in dev (`--workers 1` default); multi-worker option documented for prod (`--workers 4` example) | Single-process async Python; PostgreSQL connection pool per worker via`asyncpg`                                 | Run behind a process manager with N workers matching CPU cores; move to managed Postgres with connection pooling   |
| **Batch throughput**      | Push caps at 1,000 events per request; client batch 500; pull page 5,000 rows; server sorts batch by movement priority    | Sequential per-item ingestion inside`ingest_batch` with savepoint per item; placeholder filtering done SQL-side | Keep caps; add server-side bulk upsert with`COPY` if ledger exceeds tens of thousands per push                   |
| **Local database**        | SQLite WAL with`busy_timeout` 5,000 ms; indexes on (store,product,date), FTS5 for products                              | Single writer; large outbox floods can delay UI if batched synchronously                                          | Keep writes batched and in background threads; consider pruning SYNCED outbox rows periodically                    |
| **Pull payload size**     | Delta via`since` cursor; pagination available up to 1,000,000 limit                                                     | Without`since` the legacy full snapshot transfers entire catalogue                                              | Always use delta mode with persisted`server_time`; enable `limit` for large catalogs                           |
| **Central ledger growth** | No retention policy found; receipts kept forever                                                                          | Monotonic growth of`inventory_transactions` without archival                                                    | Plan for time-based partitioning or archival beyond 2–3 years; add`received_at` indexes if receipt queries slow |
| **Device fan-out**        | Device auto-registration is unthrottled; any login creates a row                                                          | Possible accumulation of ephemeral device rows from failed or test logins                                         | Add device garbage collection for never-seen-again auto-devices; keep sentinel ids stable                          |
| **CI / build**            | Linux + Windows matrix building Tauri binaries with debug feature and devtools                                            | WiX dependency skipped via patched config; secrets required for networked build                                   | Pin Rust and Node precisely; add cache for`cargo` and `npm ci` already via `actions/cache` implicit          |

**Known Weaknesses and Mitigations**

| Weakness                                                                       | Why It Matters                                        | Mitigation Already Present                                 | Recommended Next Step                                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `security.csp: null` in `tauri.conf.json`                                  | Disables Tauri Content Security Policy                | With-Global-Tauri enabled for IPC                          | Define a strict CSP before production signing                                         |
| SQL`LIKE` placeholder filtering on pull (`OFFLINE-` / `AUTO-`)           | Brittle catalogue filtering tied to naming convention | Documented and index-stable                                | Add explicit`is_placeholder` boolean column                                         |
| Single`SECRET_KEY` for both access and refresh JWTs                          | Compromise rotates all sessions                       | Default flagged in prod validation                         | Split keys or add key-rotation version claim                                          |
| SQLite file is local-only with scheduled copies                                | Machine loss before next sync loses unpushed events   | Durable outbox survives crashes, not theft                 | Add optional encrypted cloud backup channel for outbox                                |
| No central PostgreSQL backup description                                       | Disaster recovery unclear                             | Docker volume persistence locally                          | Document and automate PG dumps + PITR off-site                                        |
| Transfer state lives only locally; central side stores only ledger correlation | Central view of transfer intent incomplete            | Transfer events still in ledger; no hard FK constraint now | Consider central`transfers` mirror populated on pull if dashboard needs transfer UX |
| Mobile app is read-only`FR-MOBILE-003`                                       | Limits field capture on phones                        | Intentional for v1.1.0                                     | Add mobile write endpoints behind same idempotency if roadmap requires                |

---

## 14. Technology Stack Summary

| Layer             | Technology                                                                            | Version (as inspected)                                                     | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Desktop shell     | Tauri                                                                                 | 2.x                                                                        | Cross-platform native wrapper, window lifecycle, plugins (store, updater) |
| Desktop lang      | Rust                                                                                  | stable 1.80+                                                               | Command handlers, SQLite access, crypto, reqwest sync                     |
| Desktop UI        | React                                                                                 | 18.3.0                                                                     | Renderer for all desktop screens                                          |
| Desktop build     | Vite                                                                                  | 5.4.0                                                                      | Dev server and production bundling                                        |
| Desktop UI extras | Recharts, Lucide React, XLSX, PapaParse, @react-pdf/renderer                          | See`apps/desktop/package.json`                                           | Charts, icons, spreadsheet I/O, PDF balance sheets                        |
| Web / Mobile UI   | React + TypeScript + Vite                                                             | 18 / 5.5 / 5.4                                                             | Same component model as desktop, shared libraries                         |
| Remote language   | TypeScript                                                                            | 5.5.0                                                                      | All frontend workspaces                                                   |
| Testing (TS)      | Vitest, Testing Library, jsdom                                                        | 2.0.0 / 16.x / 24.x                                                        | Unit tests for all frontends and UI package                               |
| Lint/format (TS)  | ESLint 8 + Prettier 3.3 + TypeScript-ESLint 7.18                                      | —                                                                         | Workspace-level lint and format gates                                     |
| Cloud framework   | FastAPI                                                                               | 0.141.1                                                                    | HTTP routing, dependency injection, OpenAPI                               |
| Cloud server      | Uvicorn [standard]                                                                    | 0.52.4                                                                     | ASGI server                                                               |
| Validation        | Pydantic + Settings                                                                   | 2.13.5 / 2.15.0                                                            | Request schemas and env-loaded config                                     |
| ORM / Migrations  | SQLAlchemy [asyncio] 2.0.52 + Alembic 1.19.1 + asyncpg 0.31.0                         | —                                                                         | Async PG access and versioned migrations                                  |
| Auth              | FastAPI-Users 15.0.5 + bcrypt 4.2.1 + python-jose[cryptography] 3.5.0 + passlib 1.7.4 | —                                                                         | User lifecycle, JWT HS256, password hashing                               |
| HTTP client       | httpx 0.28.1 (Python), reqwest blocking (Rust)                                        | —                                                                         | Internal calls, integration tests, Rust genesis/restore                   |
| Domain package    | inven-tory-domain (pure Python)                                                       | python-ulid only                                                           | Ledger and transfer business rules, no framework deps                     |
| Storage package   | inven-tory-storage                                                                    | SQLAlchemy, Alembic, python-ulid, domain                                   | SQLite models, runner, outbox service, seed helpers                       |
| Local DB          | SQLite                                                                                | Embedded (via rusqlite)                                                    | Per-device ledger, outbox, KV, day books                                  |
| Central DB        | PostgreSQL                                                                            | 16-alpine                                                                  | Central durable ledger and all projections                                |
| Containerization  | Docker + Docker Compose                                                               | 24 / v2                                                                    | Local PG + API stack with live mounts                                     |
| CI                | GitHub Actions                                                                        | checkout v5, setup-python v6, setup-node v5, dtolnay/rust-toolchain stable | Lint, typecheck, test, build, smoke test                                  |
| Shared TS         | @invenTory/shared-types                                                               | workspace`*`                                                             | Single source of truth for TS interfaces                                  |
| Shared UI         | @invenTory/ui                                                                         | workspace`*`                                                             | Reusable React primitives                                                 |

---

## 15. Glossary

| Term                                                            | Definition                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **ADJUSTMENT**                                            | Movement type for physical count reconciliation; quantity_delta equals counted minus system, requires a reason                 |
| **Alembic**                                               | Python database migration tool used for both PG (async) and SQLite (sync + runner) chains                                      |
| **APP_DATA path**                                         | OS-specific directory where the SQLite file lives (`APPDATA\invenTory\data` on Windows)                                      |
| **CLOSED (Day Book)**                                     | Terminal state after`balance_sheet_generated` is set; no further entries for that store+date                                 |
| **DAMAGE / QUARANTINE**                                   | Movement or bucket transition that isolates stock from AVAILABLE without deleting the ledger entry                             |
| **DRAFT / DISPATCHED / RECEIVED / EXCEPTION / CANCELLED** | Transfer state machine values; only the listed edges are legal                                                                 |
| **Event Ledger**                                          | The append-only`inventory_transactions` table; the authoritative source of truth for all quantities                          |
| **Faster-then-correct (pull)**                            | The pattern`POST /sync/pull?since=&limit=` that keeps wire payload proportional to the delta                                 |
| **FTS5**                                                  | SQLite full-text search virtual table used for product search                                                                  |
| **Genesis**                                               | One-time bootstrap that seeds both databases with the first admin user, store, and sentinel devices; idempotent by username    |
| **Idempotency key**                                       | `transaction_id` ULID; duplicate submissions with the same id return the same accepted receipt without double-counting       |
| **Is_active soft delete**                                 | Boolean flag on stores, products, users, devices; rows remain for audit but are filtered from most reads                       |
| **KV Store**                                              | Small SQLite table`kv_store(key,value,updated_at)` holding sync cursor and restore flag                                      |
| **Outbox (Durable)**                                      | SQLite table`outbox_events` that survives crashes and power loss; the background sync drains it in batches                   |
| **PERMANENT_REJECTION**                                   | Outbox terminal status for validation failures that must not be retried automatically                                          |
| **RETRYABLE_ERROR**                                       | Outbox status for transient network/5xx/domain-stale failures with next attempt scheduled by exponential backoff               |
| **SENDING**                                               | Transient outbox status between dequeue and server verdict within a batch                                                      |
| **SYNCED**                                                | Terminal success status for an outbox event whose transaction was accepted server-side                                         |
| **Secure Store**                                          | Tauri`plugin-store` persistence for device_id and JWTs at `auth.dat`                                                       |
| **Sentinel device**                                       | Pre-seeded identifiers such as`WEB-DASHBOARD-DEVICE` and `LOCAL-DEVICE-ANY` that satisfy the required device_id constraint |
| **SINGLE-USER-DEVICE**                                    | Fallback device_id when caller omits it on login                                                                               |
| **Stock Bucket**                                          | AVAILABLE (default), DAMAGED, QUARANTINE, etc.; scoping axis for balances and movements                                        |
| **Store ID**                                              | String primary key patterned`STORE-{CODE}`; assigned_store_id on users is nullable for global roles                          |
| **Tauri IPC**                                             | `invoke` channel that carries JSON between TypeScript frontend and Rust backend inside the desktop process                   |
| **ULID**                                                  | Universally Unique Lexicographically Sortable Identifier used for transaction_id for idempotency and ordering                  |
| **WAL**                                                   | SQLite Write-Ahead Logging journal mode used for durability with`busy_timeout` protection                                    |
| **WebView CSP**                                           | Content Security Policy applied to the Tauri window webview; currently`null`                                                 |

---

## Appendix A: Configuration Reference

Secrets are masked. Only behaviour-relevant meaning is described.

| Name                                                                   | Purpose                                                                                                 | Who Reads It                                                                                                         | Default / Behaviour                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `API_HOST`                                                           | Host interface for Uvicorn                                                                              | FastAPI config (`Settings.api_host`)                                                                               | `0.0.0.0` — binds all interfaces                                                                                                                                            |
| `API_PORT`                                                           | Port for Uvicorn                                                                                        | `Settings.api_port`                                                                                                | `8000`                                                                                                                                                                       |
| `API_BASE_URL`                                                       | Base URL used to build absolute links and for desktop client config`VITE_API_BASE_URL`                | `Settings` and frontend `.env` files                                                                             | `http://localhost:8000` / `http://localhost:8000/api/v1` in frontends                                                                                                      |
| `DATABASE_URL`                                                       | Async PG connection string (`postgresql+asyncpg://...`)                                               | `app/db.get_engine`, `app/core/config`, Alembic envs, `genesis_single_user.py`, Docker Compose `api` service | `postgresql+asyncpg://postgres:changeme@localhost:5432/inventory` dev placeholder; Compose overrides to `postgresql+asyncpg://invtory:changeme@postgres:5432/invtory`      |
| `SECRET_KEY`                                                         | HS256 signing key for both access and refresh JWTs                                                      | `app/core/security.py` via `Settings.secret_key`                                                                 | `change-me-to-a-random-64-char-hex-string` / `CHANGE_ME_IN_PRODUCTION` / `dev-secret-change-in-production` in Compose; rejected as default in `production` environment |
| `ACCESS_TOKEN_EXPIRE_MINUTES`                                        | Access token lifetime                                                                                   | `create_access_token`                                                                                              | `60`                                                                                                                                                                         |
| `REFRESH_TOKEN_EXPIRE_DAYS`                                          | Refresh token lifetime                                                                                  | `create_refresh_token`                                                                                             | `30`                                                                                                                                                                         |
| `CORS_ORIGINS_RAW` / `CORS_ORIGINS`                                | Comma-separated allowlist for browsers + Tauri webview origins                                          | `Settings` via `cors_origins` property used as `CORSMiddleware.allow_origins` + 5xx handler allowlist          | `http://localhost:5173,http://localhost:3000,http://localhost:3001,http://localhost:1420,http://127.0.0.1:1420,... ,http://tauri.localhost,tauri://localhost`                |
| `SYNC_BATCH_SIZE`                                                    | Fallback batch size for server-side ingestion (Settings); client uses its own`batchSize` argument 500 | `Settings.sync_batch_size` (server ingest cap separate from client batch)                                          | `100` (server); client default `500` in `tauriSyncService`; push hard cap `1000` on request                                                                            |
| `SYNC_RETRY_MAX`                                                     | Maximum retry attempts for outbox events before giving up                                               | Outbox service / sync backoff calculation                                                                            | `5`                                                                                                                                                                          |
| `SYNC_RETRY_BACKOFF_BASE_SECONDS`                                    | Exponential base for retry delay                                                                        | Outbox service                                                                                                       | `2`                                                                                                                                                                          |
| `ENVIRONMENT`                                                        | Distinguishes dev vs prod behaviour (traceback exposure, secret validation)                             | `Settings`                                                                                                         | `development`; valid values `development`, `staging`, `production`                                                                                                     |
| `LOG_LEVEL`                                                          | Level for`logging.basicConfig` and SQLAlchemy pool/engine suppression                                 | `lifespan` in `app/main.py`                                                                                      | `INFO`                                                                                                                                                                       |
| `SQL_ECHO`                                                           | Whether to set SQLAlchemy engine level to INFO (log every statement)                                    | `app/main.py` lifespan + `Settings.sql_echo`                                                                     | `false`                                                                                                                                                                      |
| `SLOW_QUERY_THRESHOLD_MS`                                            | Request duration threshold for WARNING escalation in unified logger                                     | `_log_requests` middleware                                                                                         | `500`; `0` disables escalation                                                                                                                                             |
| `VITE_WEB_DEVICE_ID`                                                 | Sentinel device id for web login                                                                        | Web`LoginView`                                                                                                     | `WEB-DASHBOARD-DEVICE`                                                                                                                                                       |
| `VITE_DEV_DEVICE_ID`                                                 | Fallback device id for desktop dev fallback                                                             | `App.getOrCreateDeviceId`                                                                                          | Not set by default — inspected in code path only                                                                                                                              |
| `INVEN_TORY_DB_PATH` / `DATABASE_PATH`                             | Override SQLite file location                                                                           | `lib.rs:get_db_path`                                                                                               | Not set — uses OS app-data path with dev walk-up                                                                                                                              |
| `INVEN_TORY_DEBUG_STARTUP`                                           | Enables Tauri startup diagnostics and`startup_debug.log`                                              | Rust desktop startup hook + CI smoke test env                                                                        | Not set in normal runs; forced`1` in CI smoke tests                                                                                                                          |
| `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Minisign keys for installer/updater artifact signing                                                    | `tauri build` in GitHub Actions                                                                                    | Empty and suppressed if absent (skips updater artifacts)                                                                                                                       |

---

## Appendix B: Naming Conventions and Folder Layouts

### Figure B.1: Folder Layout (Selected Paths Inspected)

```mermaid
flowchart TB
    ROOT2[inven-Tory]
    ROOT2 --> APPS[apps]
    ROOT2 --> PKGS[packages]
    ROOT2 --> SVCS[services]
    ROOT2 --> INFRA[infra]
    ROOT2 --> DOCS[docs]
    ROOT2 --> SCRIPTS[scripts]
    ROOT2 --> TESTS[tests]
    ROOT2 --> GH[github workflows ci yml]
    ROOT2 --> GHOOKS[githooks pre-commit plus pre-push]

    APPS --> DSK[desktop<br>src plus src-tauri plus package json]
    APPS --> WEB[web<br>src plus package json]
    APPS --> MOB[mobile<br>src plus package json]

    PKGS --> DOM[domain<br>entities plus rules]
    PKGS --> STOR[storage<br>models plus migrations plus services plus seed]
    PKGS --> STYPES[shared-types<br>src index ts]
    PKGS --> UI2[ui<br>src shared React components]

    SVCS --> API4[api<br>api v1 plus auth plus core plus models plus services]

    INFRA --> DOCKER[docker<br>docker compose plus Dockerfile api]
    INFRA --> MIGR2[migrations<br>alembic ini plus env py plus versions]
    INFRA --> SEED[seed<br>genesis plus dev only]

    DSK --> VIEWS[views<br>Login Dashboard Products Receive Sale Return Transfer Damage PhysicalCount DayBooks Transactions Settings GenesisWizard]
    DSK --> COMPS[components<br>Header Sidebar Modals Charts]
    DSK --> SRVS[services<br>tauriAuth tauriSync tauriProduct tauriStore tauriTransaction tauriTransfer tauriData backupScheduler]
    DSK --> HOOKS[hooks<br>useAppState useGenesisState usePersistentState]
```

*Figure B.1: Folder layout showing the inspected paths and their logical grouping.*

*How to read this: Nodes are directories on disk; indentation encodes parent-child ownership. The three `View` and `Service` subgroups list the concrete files found under desktop.*

Directory tree (exact paths inspected):

```
inven-Tory/
├── apps/
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── components/   # Header, Sidebar, ProductModal, StockTrendChart, etc.
│   │   │   ├── views/        # Login, Dashboard, Products, Receive, Sale, Return, Transfer, Damage, PhysicalCount, DayBooks, Transactions, Settings, CreateProduct, GenesisWizard
│   │   │   ├── services/     # tauriAuth, tauriSync, tauriProduct, tauriStore, tauriTransaction, tauriTransfer, tauriData, backupScheduler
│   │   │   ├── hooks/        # useAppState, useGenesisState, usePersistentState
│   │   │   ├── context/      # UpdaterContext, StoreContext
│   │   │   ├── config/       # navigation.ts, storeColors.ts, balanceSheetUtils.ts
│   │   │   └── __tests__/    # Vitest unit tests mirroring views and services
│   │   └── src-tauri/        # Rust lib.rs + main.rs + tauri.conf.json + icons/
│   ├── web/                   # React remote dashboard (port 3000)
│   └── mobile/                # React read-only companion (port 3001)
├── packages/
│   ├── domain/               # Pure Python — domain/entities/, domain/rules/
│   ├── storage/              # SQLite models, migrations/runner.py, services/OutboxService, seed.py
│   ├── shared-types/         # TypeScript interfaces (Auth, Product, Store, Sync, Transaction, Transfer)
│   └── ui/                   # Shared React components (Button, Card, Table, Modal, LinearGridEntry ...)
├── services/
│   └── api/                  # FastAPI central API — app/api/v1/, app/auth/, app/core/, app/models/, app/services/, app/db.py, app/main.py
├── infra/
│   ├── docker/               # docker-compose.yml, Dockerfile.api
│   ├── migrations/           # Alembic PG migrations — versions/0001..0006 + day_books migration
│   └── seed/                 # genesis_single_user.py + dev_only/seed_central_postgres.py + seed_local_sqlite.py
├── docs/
│   └── architecture.md       # Source-of-truth summary (SRS §7)
├── scripts/
│   └── write_hook.py
├── .githooks/
│   ├── pre-commit            # Prettier --write staged TS
│   └── pre-push              # ruff + black + prettier --check (blocks push)
├── .github/workflows/ci.yml  # Lint + test + Tauri build matrix
├── Makefile                  # lint, lint-check, test, setup-hooks
├── pyproject.toml            # Root tool config + pytest + ruff/black
├── package.json              # Root npm workspaces (5 packages)
└── .env.example              # Shared env template (three .env files copy from it)
```

**Naming Conventions**

| Area                    | Convention                                                                                                                                    | Examples                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Branch names            | `<type>/<issue>-<slug>` where type is feature / bugfix / chore / docs, slug is kebab-case                                                   | `feature/15-sync-push-pull`, `bugfix/101-table-cta`                                                    |
| Commit messages         | Conventional Commits`type(scope): subject` lower-case subject, no trailing period                                                           | `feat(api): add sync push partial batch`, `fix(desktop): handle offline token banner`                  |
| Python modules / files  | `snake_case` package and file names, `UPPER_SNAKE` for constants, `PascalCase` for entities                                             | `inventory_transaction.py`, `stock_balance.py`, `NegativeStockError`                                 |
| Python tooling          | 100-char line length,`ruff` selects E/W/F/I/B/C4/UP/N/SIM/TCH/ANN/RUF, `black`                                                            | Configured in`pyproject.toml`                                                                            |
| TypeScript files        | `camelCase` for services/hooks, `PascalCase` for components/views, `kebab` not used                                                     | `tauriSyncService.ts`, `DashboardView.tsx`, `useAppState.ts`                                         |
| IDs and codes           | Upper-snake with prefix`STORE-` for store ids, opaque ULIDs for transaction ids, `device_id` pattern `DESKTOP-{HOST}-{RAND}` upper-case | `STORE-MAIN`, `TRF-DISP-{id}`, `OFFLINE-{sku_token}` placeholders                                    |
| Store code              | Upper-case, derived as lexicographically suffix of store id (`STORE-{CODE}` → `CODE`)                                                    | `MAIN`, `BR01`                                                                                         |
| Database tables         | `snake_case` plural where multi-row, columns `snake_case`, PKs named `id` except ledger `transaction_id`                              | `inventory_transactions`, `stock_balances`, `outbox_events`, `day_book_entries`                    |
| Movement / bucket enums | `UPPER_SNAKE` string values stored in DB (`RECEIPT`, `SALE`, `AVAILABLE`)                                                             | `MOVEMENT_PUSH_PRIORITY` includes ADJUSTMENT 0, RECEIPT/TRANSFER_IN/RETURN 1, SALE/TRANSFER_OUT/DAMAGE 2 |
| Config keys             | `UPPER_SNAKE` env var, `snake_case` `Settings` field with `case_sensitive=False`                                                      | `DATABASE_URL` ↔ `settings.database_url`, `CORS_ORIGINS_RAW` ↔ `cors_origins` property           |
| Migration files         | Zero-padded numeric prefix`000N_*` plus descriptive suffix                                                                                  | `0001_initial_postgres_schema.py`, `0005_add_fts5_products.py`                                         |
| Secrets                 | Never committed;`.env` git-ignored and produced by copying `.env.example`                                                                 | Three`.env` files plus per-frontend examples                                                             |

---

## Appendix C: Open Questions and Items Needing Confirmation

| Item                                               | What Is Unknown / Unconfirmed                                                                                                                                             | Why It Matters                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **SRS location**                             | `Inventory_Tory_v1_1_0_SRS.md` was referenced in `docs/architecture.md` but not present at the inspected absolute path `D:\inven-Tory\Inventory_Tory_v1_1_0_SRS.md` | Many section references (e.g., §7.1, §15.1, FR-MOV-008) cannot be cross-checked without the file |
| **Production hosting target**                | Host, reverse proxy, managed PG provider, CDN for`dist/`, domain, TLS termination                                                                                       | Required for deployment and run-book; Compose is development-only                                  |
| **Audit ledger contents**                    | `AuditEvent` model exists but was not inspected for fields or writing policy                                                                                            | Needed for compliance storytelling                                                                 |
| **Notification center and low-stock alerts** | Architecture and whether derived views use polling, websocket, or pull-time computation                                                                                   | Product behaviour and UX timing                                                                    |
| **Plans / quotas / subscription tiers**      | Whether any monetised gating exists or quotits for stores/products/transactions                                                                                           | Business model and limit enforcement                                                               |
| **Retention / archival policy**              | Lifespan of ledger rows, receipts, outbox pruning, PG backup cadence and PITR                                                                                             | Capacity planning and legal hold                                                                   |
| **Offline image cache key**                  | `FR-PROD-IMG` asserts local caching for offline display but cache location and eviction not confirmed                                                                   | Disk usage and offline completeness                                                                |
| **Warranty lookup computation**              | `FR-WARR` per-serial auto-calculation rule and schema for serials/batches                                                                                               | Traceability feature completeness                                                                  |
| **Background sync enablement rule**          | Desktop`App.tsx` gates `startBackgroundSync` on `apiBaseUrl` not containing `localhost`/`127.0.0.1`; behaviour for custom non-local dev hosts unverified        | Whether local API development with a non-local hostname correctly syncs                            |
| **CORS production allowlist**                | Exact production`CORS_ORIGINS_RAW` values beyond dev defaults                                                                                                           | Browser compatibility and Tauri webview reachability                                               |
| **Updater signing key rollover**             | `pubkey` in `tauri.conf.json` rotation and fallback if signing secrets absent                                                                                         | Release security and auto-update continuity                                                        |
| **Push/pull compression**                    | Whether large catalogue snapshots use any HTTP compression                                                                                                                | Payload size and transfer time for large stores                                                    |
| **Mobile write roadmap**                     | `FR-MOBILE-003` marks mobile read-only in v1.1.0; whether vNext enables writes is unconfirmed                                                                           | Scope and safety of shared ledger idempotency                                                      |
| **Rate limiting**                            | No rate or concurrency limiter was observed in inspected router or middleware config                                                                                      | Abuse resilience of`/auth/login` and `/sync/push`                                              |
| **PostgreSQL extensions**                    | Readme mentions`pg_trgm` and `btree_gist` if using non-Docker PG; actual migration dependency not confirmed                                                           | Required extensions for migrations on external PG                                                  |

---

*End of system documentation. Every component found during repository inspection appears in at least one diagram above; every inspected integration appears in the Communication Map matrix; every diagram carries a numbered caption and a how-to-read note; no source code or config dumps are included beyond Mermaid blocks and directory trees.*
