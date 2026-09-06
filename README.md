# INVENTORY Tory

> Offline-First, Multi-Store Inventory Management System — v1.1.0

[![CI]([https://github.com/org</inven-Tory/actions/workflows/ci.yml/badge.svg?branch=develop>)](](<https://github.com/%3Corg>)[https://github.com/org</inven-Tory/actions/workflows/ci.yml>)](<https://github.com/%3Corg>)

---

## [Overview](<https://github.com/%3Corg>)

[INVENTORY Tory is a transaction-driven inventory platform for businesses running multiple physical stores. Every stock movement is a durable, immutable event. Stores operate fully offline; synchronization to the central cloud database happens automatically when connectivity returns.](<https://github.com/%3Corg>)

[**Technology stack:**](<https://github.com/%3Corg>)

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

## [Repository structure](<https://github.com/%3Corg>)

---

## [Prerequisites](<https://github.com/%3Corg>)

| Tool             | Minimum version | Install                         |
| ---------------- | --------------- | ------------------------------- |
| Python           | 3.12            | [python.org](https://python.org) |
| Node.js          | 20 LTS          | [nodejs.org](https://nodejs.org) |
| npm              | 10              | bundled with Node 20            |
| Rust + Cargo     | stable          | [rustup.rs](https://rustup.rs)   |
| Docker + Compose | 24 / 2          | [docker.com](https://docker.com) |

---

## [Local development setup](<https://github.com/%3Corg>)

### [1. Clone the repository](<https://github.com/%3Corg>)

### [2. Copy environment files](<https://github.com/%3Corg>)

[Edit each `.env` file and fill in your local values (database URL, secret key, etc.).](<https://github.com/%3Corg>)

### [3. Install Python dependencies](<https://github.com/%3Corg>)

### [4. Install Node dependencies](<https://github.com/%3Corg>)

### [5. Start the local PostgreSQL database](<https://github.com/%3Corg>)

### [6. Bootstrap your first admin account (Genesis — run ONCE)](<https://github.com/%3Corg>)

[This seeds **your real credentials** into:](<https://github.com/%3Corg>)

1. [**PostgreSQL** — central database used by the API + web dashboard](<https://github.com/%3Corg>)
2. [**Local SQLite** — used by the Tauri desktop for offline bcrypt-based login](<https://github.com/%3Corg>)

[It also creates a default store and the `WEB-DASHBOARD-DEVICE` sentinel row. No mock users, no seed fixtures.](<https://github.com/%3Corg>)

[**Safety notes:**](<https://github.com/%3Corg>)

- [Idempotent: re-running UPDATEs the existing user row by username (never duplicates).
  Change your password later by re-running with the same `--username`.](<https://github.com/%3Corg>)
- [Refuses the `--run-migrations` flag if Alembic fails — fix schema errors first.](<https://github.com/%3Corg>)

### [7. Run the API server](<https://github.com/%3Corg>)

[The API is available at `http://localhost:8000`. OpenAPI docs: `http://localhost:8000/docs`.](<https://github.com/%3Corg>)

[**Authentication model (single-user mode):**](<https://github.com/%3Corg>)

- [`device_id` is **optional** on `/api/v1/auth/login`.](<https://github.com/%3Corg>)
- [Any `device_id` string you submit is auto-registered on first successful login
  (anchored to `User.assigned_store_id`). Desktop can be installed and used on
  **any machine** without a separate device-registration step.](<https://github.com/%3Corg>)
- [Only explicitly-revoked devices (row has `is_active=false` WITH a
  `revocation_reason`) are rejected — so you can still lock a compromised
  device if needed.](<https://github.com/%3Corg>)

### [8. Run the desktop app (development mode)](<https://github.com/%3Corg>)

[**Desktop login:** use `username + password` (the credentials from step 6).
Offline login works because Genesis already wrote the `pin_hash` bcrypt row
to the local SQLite DB during step 6.](<https://github.com/%3Corg>)

### [9. Run the web dashboard (development mode)](<https://github.com/%3Corg>)

[**Web login:** use `email + password` (the credentials from step 6).
After login, visit **Users** in the sidebar to create/manage additional
accounts (the Create/Edit/Delete buttons appear only when logged in as
`GLOBAL_ADMIN`).](<https://github.com/%3Corg>)

---

## [Quick-start (after virtual environment is activated)](<https://github.com/%3Corg>)

[These are the exact commands to run a fresh environment from scratch once
your virtual environment is already active. Commands are shown for both
**Windows** (PowerShell / Git Bash) and **Linux/macOS**.](<https://github.com/%3Corg>)

### [Windows (Git Bash / PowerShell)](<https://github.com/%3Corg>)

> [**Note:** Replace `YOUR_PASSWORD` with your actual PostgreSQL password.
> The `&` symbol runs each service in the background. On PowerShell, use
> `Start-Process` or run each in a separate terminal tab instead.](<https://github.com/%3Corg>)

### [Linux / macOS](<https://github.com/%3Corg>)

> [**Note:** Replace `YOUR_PASSWORD` with your actual PostgreSQL password.
> Each `&` starts a background process. Open a new terminal tab for each
> service if you prefer isolated outputs.](<https://github.com/%3Corg>)

---

## [Running linters](<https://github.com/%3Corg>)

### [Python](<https://github.com/%3Corg>)

### [TypeScript](<https://github.com/%3Corg>)

---

## [Running tests](<https://github.com/%3Corg>)

### [Python unit tests](<https://github.com/%3Corg>)

### [TypeScript unit tests](<https://github.com/%3Corg>)

---

## [Authentication workflow (quick reference)](<https://github.com/%3Corg>)

[After you&#39;ve run the **Genesis script** (setup step 6 above):](<https://github.com/%3Corg>)

### [Login endpoints](<https://github.com/%3Corg>)

| Endpoint                        | Client                              | Body                                                                                                                      |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/login`     | Desktop + Web (via custom view)     | `{ username, password, device_id? }` — `device_id` is optional; unknown values are auto-registered on first success. |
| `POST /api/v1/auth/jwt/login` | FastAPI Users standard (web/mobile) | form-urlencoded`username` (email) + `password`                                                                        |
| `GET  /api/v1/auth/me`        | Any (Bearer token)                  | — returns the current user profile                                                                                       |
| `POST /api/v1/auth/refresh`   | Any                                 | `{ "refresh_token": "..." }` → new access token                                                                        |

### [Desktop login flow](<https://github.com/%3Corg>)

1. [On first launch the app generates a stable `DESKTOP-<host>-<rand>` device
   ID and saves it to Tauri&#39;s secure store. **No pre-registration needed.**](<https://github.com/%3Corg>)
2. [User submits `username + password`.](<https://github.com/%3Corg>)
3. [`tauriAuthService.login()` first tries **offline SQLite bcrypt** against
   the local `User.pin_hash` (seeded by Genesis). On success it returns an
   `offline:*` session token, then upgrades to a real server JWT in the
   background when network is available.](<https://github.com/%3Corg>)
4. [Central API login auto-registers the generated device ID on first
   successful hit.](<https://github.com/%3Corg>)

### [Web login flow](<https://github.com/%3Corg>)

- [Web uses the custom `LoginView` which posts `{ username, password, device_id: "WEB-DASHBOARD-DEVICE" }`
  to `/auth/login`.  Genesis pre-creates the `WEB-DASHBOARD-DEVICE` row for
  you, so this works without extra steps.](<https://github.com/%3Corg>)
- [After login, a `/auth/me` call populates the user&#39;s role in the app shell;
  role == `GLOBAL_ADMIN` is what enables **Users** page action buttons.](<https://github.com/%3Corg>)

### [User management (admin UI)](<https://github.com/%3Corg>)

1. [Log in to the web dashboard as the `GLOBAL_ADMIN` created in Genesis.](<https://github.com/%3Corg>)
2. [Open the **Users** sidebar page.](<https://github.com/%3Corg>)
3. [Use **New User** to create clerks, managers, auditors, or additional
   admins.  Every created user can log in on **any** device immediately (the
   first login registers that device automatically).](<https://github.com/%3Corg>)
4. [Edit / deactivate / delete users from the same table.](<https://github.com/%3Corg>)

### [Revoking a compromised device (edge case)](<https://github.com/%3Corg>)

[Device auto-registration keeps UX frictionless. If a laptop is actually lost
or stolen, revoke it by running this against the PostgreSQL DB directly:](<https://github.com/%3Corg>)

[The next login attempt with that device_id fails with 401 &#34;device has been
revoked&#34;. Any other device continues working normally.](<https://github.com/%3Corg>)

---

## [CI](<https://github.com/%3Corg>)

[Every pull request targeting `develop` runs the full lint + unit-test pipeline automatically via GitHub Actions (`.github/workflows/ci.yml`). The `develop` branch requires a green CI run and no open review comments before merging.](<https://github.com/%3Corg>)

---

## [Contributing](<https://github.com/%3Corg>)

[See ](<https://github.com/%3Corg>)[CONTRIBUTING.md](CONTRIBUTING.md) for the branch naming convention, commit style, PR checklist and coding standards.

---

## License

See [LICENSE](LICENSE).
