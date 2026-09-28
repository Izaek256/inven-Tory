# Changelog

All notable changes to invenTory are documented in this file. This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.4] — 2026-09-28

### Fixed — Genesis First-Run Layout

- **The first-run setup screen fills the window** — `.genesis-screen` now stretches (`flex: 1 1 auto`, `min-width: 0`, `width/height: 100%`) instead of being laid out against `min-height: 100vh`, which left the card off-centre and clipped on short windows; `.genesis-center` scrolls internally (`overflow-y: auto`, `min-height: 0`) and `.genesis-card` centres with `margin: auto`. The role-selector chips stay on one line (`flex-wrap: nowrap`, `flex: 1 1 auto`, tighter padding) so the wizard fits without horizontal overflow.

### Fixed — Database Migration System

- **One source of truth per database** — `infra/migrations/` is the only migration system for the central PostgreSQL database and `packages/storage/storage/migrations/` the only one for local SQLite. `services/api/migrations/*.sql` (hand-applied `psql` scripts) is removed; the day-book tables it duplicated were already in the chain, and the tsvector column/indexes it created are now created by revision `0007_fts_and_composite_indexes`.
- **PostgreSQL 0007 actually runs** — `sa.TSVECTOR()` does not exist and was replaced with `sqlalchemy.dialects.postgresql.TSVECTOR`; two composite indexes were created on a nonexistent `transactions` table and now target `inventory_transactions`; `ix_transactions_store_product_occurred` duplicated 0002's `ix_inv_tx_store_prod_date` and is gone. The revision also adds the delta-sync/dashboard indexes the models declare but no migration created (`ix_products_updated_at`, `ix_inv_tx_movement_date`, `ix_stock_balances_updated_at`, `ix_stock_balances_store_product_bucket`, `ix_sync_receipts_received_*`, `ix_products_category_active`, `ix_products_store_quantity`). Every statement is `IF [NOT] EXISTS`, the trigger/function use `CREATE OR REPLACE`, and the legacy trigger from the removed raw SQL is dropped so exactly one maintains `products.ts_vector`.
- **PostgreSQL revision ids fit `alembic_version`** — the id exceeded the `VARCHAR(32)` column and made the chain unusable; it is now `0007_fts_and_composite_indexes`.
- **PostgreSQL 0004 constraint names** — the `users` table was rebuilt through a temporary `_users_new`, so its primary key and unique constraints were named `_users_new_*` (and, on PostgreSQL 17+, so were the `NOT NULL` constraints). They are now named explicitly and any leftover temporary name is renamed after the table rename, in both directions.
- **Local SQLite gained the desktop schema** — `kv_store`, `day_books`, `day_book_entries`, `daily_stock_snapshot` (+ its two triggers), `users.assigned_store_id` and 11 query indexes existed only inside the Tauri Rust bootstrap, so a database created by `alembic upgrade head` was missing objects the desktop app writes to at runtime. Revisions `0007_reconcile_desktop_schema` and `0008_add_query_indexes` define them, with guarded creation so an already-bootstrapped database is untouched.
- **Cloud restore no longer drops every user** — `apply_restore_critical` inserted into `users.assigned_store_id`, a column declared by no schema anywhere; the error was discarded, so restores silently created nothing. The column now exists.
- **Desktop startup creates the schema** — `run()` did not call `ensure_schema_tables()`, so a fresh install started against an empty database and the following startup steps failed silently. It also ran a duplicate ad-hoc `CREATE INDEX` batch; those statements, the ad-hoc column-repair list and the second, conflicting `kv_store` definition are removed now that the chain owns them.
- **The two systems can no longer disagree** — the Rust bootstrap records the canonical revision in `alembic_version`, so `alembic upgrade head` is a no-op on a desktop-bootstrapped database and applies the next revision normally. Both sides are guarded by tests: `packages/storage/tests/test_migrations.py` and `bootstrap_creates_every_object_the_desktop_requires` in `lib.rs`.
- **Migrations run from the repository root** — `infra/migrations/env.py` and the SQLite `env.py` put their package roots on `sys.path` themselves and read the URL from `ALEMBIC_DB_URL` / `ALEMBIC_SQLITE_URL`, so `alembic -c infra/migrations/alembic.ini upgrade head` works without `cd infra/migrations` and without an editable install. The `alembic.ini` post-write hooks pointed at POSIX-only `.venv/bin` paths that do not exist on Windows and are removed.
- **Autogenerate no longer proposes dropping `day_books`** — `DayBook`/`DayBookEntry` were missing from `infra/migrations/env.py`, so the tables were invisible to the model metadata.

## [1.3.3] — 2026-09-28

### Fixed — Search Freeze, Store Sync & Dashboard Tabs

- **Search keystrokes never block the UI** — all 18 search/list Tauri commands are now `async` (run off the main thread), the FTS index is ensured once at startup instead of on every search, and the FTS-miss fallback reuses the already-held DB connection via a LIKE-only helper (no mutex re-acquire, no second FTS pass). Seeded 5,000-product regression test reports through an mpsc channel with a 5s deadlock guard and asserts no-match p95 ≤ 250 ms (measured 60 ms, previously 117 ms under the global DB mutex).
- **Stale results & IPC storms in Receive/Sale/PhysicalCount** — out-of-order search responses are dropped (`searchSeqRef`), the backend round-trip is skipped when the local store-scoped list already has the match, pending debounced searches are cancelled on unmount, and the barcode buffer in `useGridKeyboardFlow` is capped (64 chars / 250 ms burst). New vitest keeps the product field editable through bursts of bad characters with bounded backend calls.
- **Store sync durability** — failed store pushes are re-queued after the processing loop with a 30s retry timer (no tight retry loop) and a 30s store-push timeout with null-result checking; `_reconcileStores` heals `Auto Store (...)` placeholders before the push loop; `create_store` is idempotent for matching id+code (returns the existing store instead of failing).
- **Dashboard store tabs follow the system design** — letter avatar replaced by a lucide `Store` icon (amber when selected), sharp amber-card selected state with a 2px amber underline, unregistered-store badge preserved, dead `.store-tab__code` styling removed; stale app icons replaced.
- **Tooling** — Prettier `endOfLine: "auto"` across all five workspaces so the pre-push hook passes on Windows (CRLF) checkouts; all workspace versions aligned at 1.3.3 (gate: `scripts/check_versions.js`).

## [1.3.0] — 2026-09-24

### Added — Desktop Performance & UX

- **Analytics aggregated in SQLite (`get_dashboard_analytics`)** — new Tauri command computes KPIs, stock trend, category distribution, most-sold products, low-stock alerts, and recent activity inside Rust/SQLite with bounded date-range queries. `DashboardView` no longer ships the full product + ledger catalogues over IPC to aggregate in JS; it fetches one payload via the new `tauriDashboardService` (`emptyAnalytics()` fallback outside the desktop runtime).
- **Products category filter** — server-side filtering: `get_products_paginated` / `get_products_count` accept an optional `category`; new `get_product_categories` command feeds the filter dropdown; mutations refresh the category list so newly created categories are immediately selectable. Pagination resets when search or category changes.
- **Dashboard date-range picker** — KPIs, charts, and activity can be scoped to a custom range (defaults to the last 7 days).
- **ProductModal keyboard submit** — Enter from any text field submits explicitly; native Enter behavior preserved inside `<select>`, `<textarea>`, and on checkboxes/radios/buttons. Footer buttons are `type="button"` so they can no longer implicitly submit the form.

### Changed — Accessibility & Keyboard Flows

- **Modal focus management** — focus lands on the first control in the body on open, Tab/Shift+Tab cycle within the dialog, Escape closes, and focus is restored to the trigger element on close.
- **Login keyboard flow** — Enter in Username advances to Password, Enter in Password submits (native form submission), username autofocus on mount, and a re-entrancy guard blocks double submits while loading.

### Fixed

- README install glob for `.rpm` assets matches the real artifact names (`invenTory-*.rpm` alongside `invenTory_*.rpm`).

## [1.2.1] — 2026-09-24

### Fixed — Release Pipeline & Linux Updater

- **Linux releases ship `.deb` and `.rpm` again** — the v1.2.0 pipeline only uploaded `bundle/appimage/` globs, so deb/rpm stopped being published (v1.1.7 had shipped manifests with no installers at all).
- **Strict AppImage CI gate** — new `Verify AppImage executable + launch (Linux)` step fails the build if the AppImage is missing, not executable after `chmod +x`, or cannot start under Xvfb (previously masked by `|| true`).
- **Complete Linux build dependencies** (`build-essential`, `libssl-dev`, `libxdo-dev`, `libayatana-appindicator3-dev`, `libfuse2`, …) plus `NO_STRIP=true` so linuxdeploy cannot corrupt the AppImage ELF during bundling.
- **Version/tag consistency gate** — new `scripts/check_versions.js` runs in CI and blocks releases when `tauri.conf.json` / `Cargo.toml` / `apps/desktop/package.json` disagree or the git tag ≠ `v<version>`.
- **Release fail-fast checks** — AppImage + `.AppImage.sig` + `.deb` + `.rpm` must exist before upload; updater manifests are now generated with `jq` and validated instead of shell heredocs.
- Removed obsolete `plugins.updater.dialog` config (ignored by `tauri-plugin-updater` v2).
- **Docs** — README documents Linux install (`chmod +x`, `libfuse2`/`libfuse2t64`, `--appimage-extract-and-run`) and auto-update limitations (AppImage-only updates; executable bit; published releases only).

### Verified

- The configured updater `pubkey` matches every shipped signature (v1.1.5 → v1.2.0, keyid `c584a74f0064d800`); full Ed25519 verification of the published v1.2.0 AppImage against the configured pubkey succeeds. No key rotation required.

## [1.2.0] — 2026-09-23

### Changed — Visual-Only Redesign (No Logic Changes)

This is a **non-breaking, visual-only** release. No business logic, state management, API calls, data models, routing logic, or validation rules were modified. All components retain their existing props, events, behavior, and accessibility affordances. Feature flags, permission checks, and conditional rendering are preserved exactly as in v1.1.8. Only presentation-layer code (styles, markup structure, class names, design tokens) was touched.

#### Design System (Source of Truth: `inven-Tory___Redesign.html` v1.2.0)

- **Tokens (`packages/ui/src/tokens.css`)** — Imported `Space Grotesk` / `IBM Plex Mono`, set all radii to sharp `0px`, mapped palette to reference:
  - Light: `paper #EFF1EC`, `paper-raised #F7F8F5`, `surface #FFFFFF`, `line #DCE0D9`, `line-strong #C4CAC0`, `text #14181C`, `muted #62685F`, `faint #92978C`, `amber #DB8A2A` / `amber-ink #7A4A0F` / `amber-tint #FBEEDB`, `teal #1F5B54` / `teal-tint #E2EEEB`, `green #2E7D4F` / `green-tint #E4F1E7`, `red #B3402F` / `red-tint #F7E6E2`
  - Dark: `paper #14171B`, `paper-raised #1A1E23`, `surface #1B1F24`, `line #2B3038`, `line-strong #3A404A`, `text #ECEEE9`, `muted #9AA097`, `faint #6B7169`, tints `#3A2A12` / `#16302B` / `#16301F` / `#341915`
  - Added raw reference variables `--ink`, `--ink-soft`, `--ink-line`, `--paper`, `--surface`, `--line`, `--amber`, `--teal`, etc. and mapped all `--it-*` tokens to them. Focus ring now uses `2px solid var(--amber)` + `teal-tint` shadow, matching reference.
  - Dark mode supports both `data-theme` attribute and `prefers-color-scheme` fallback, per reference.

- **UI Package Components** — restyled injected CSS to match reference sharp corners, tints, and left-border tag treatment:
  - `Button.tsx` — primary now `amber #DB8A2A` with `#241300` text; secondary is `surface + line-strong` outline; destructive is `surface + red`; ghost is transparent; sizes `9px 15px` (md) / `6px 10px` (sm); sharp `0px` radius; amber/teal focus outlines.
  - `Card.tsx` — sharp `0px`, no shadow, `20px` padding; `StatCard` value is `24px` mono `600` with reference tint colors.
  - `Table.tsx` — header has `2px solid var(--ink)` bottom border, `11px` header text, `12px` body cells, `hover: var(--paper)`; sharp wrap.
  - `Badge.tsx` — mono `11px` `500`, `3px 8px`, left `2px` bar, tint backgrounds (`green-tint`, `red-tint`, `amber-tint`, `teal-tint`).
  - `TextInput.tsx` / `Select.tsx` — `12px` label `600` muted, `13.5px` input `9px 11px`, `1px solid var(--line-strong)`, sharp, `teal` focus + `teal-tint` shadow.
  - `Modal.tsx` — `0px` radius, `660px` lg, `12px 20px` header / `16px 20px` body/footer.
  - `LinearGridEntry.tsx` — ink-table header `2px`, `amber-tint` active row, mono inputs.
  - `EmptyState.tsx` — dashed `line-strong`, `paper` background, `54px 20px` padding, sharp.

- **Desktop Layout (`apps/desktop/src/index.css` + `App.tsx`)** — Rebuilt shell to reference `.shell` / `.rail` / `.col` / `.topbar` / `.content` while preserving existing class names for test compatibility:
  - `app-container` is now flex row `100vh` with `rail` sidebar + `col` main column; `app-body` is the `col`; `app-header` is `topbar` (`64px`, `paper-raised`, `1px solid line`); `app-content` is `content` (`26px 30px 60px`, `paper` background).
  - Sidebar (`Sidebar.tsx`) is now `252px` ink (`#12161B`) rail with `amber` mark, `v1.2.0` chip, captions (`Overview` / `Stock operations` / `Records`), `amber` active bar (`3px`), `11px 14px` nav items, `ink-soft` hover/active, `More` collapsible and `rail-foot` with green dot; collapsed is `68px` with centered icons and tooltips.
  - Header (`Header.tsx`) is now topbar with `search` input-button (`280px`, mono `12.5px`, surface+line), `status-chip` pills (`11px` mono, `5px 9px`, green/amber dots, dashed sync-time), `store-tag` (`ink` + amber code `10.5px` mono), user menu (theme toggle) preserved.
  - Added reference utilities: `.sheet` (`20px` padded card), `.kpi` / `.kpi-row`, `.info-bar`, `.search`, `.tab-toggle`, `.stepper`, `.empty-state`, `.log-empty`, `.grid-2`, etc., so any view using those class names automatically matches the reference.

#### Screens Redesigned (Desktop)

All screens listed in the task scope were restyled via tokens + layout + component CSS. No view logic was changed:

- **Sign in** — `LoginView.tsx` now renders reference `login-topbar` (`56px`, `paper-raised`) + `login-card` (`380px`, sharp, `30px 32px`) with amber mark and mono version chip; form uses new field styles and `amber` primary button.
- **Dashboard** — KPI tiles now `12px` grid gap with `24px` mono values and `11px` delta; stock-trend, category, and status charts sit in `sheet` panels; `view-header` is `21px 600` title + `13px` subtitle, `22px` bottom margin.
- **Create product** — sheet with `14px` required fields, `field-row` 2-col, `amber` primary `Add product`, import dropzone `dashed line-strong` + `paper` background, template table `11px` header with `required Yes` in green.
- **Receive stock** — `entry-wrap` (`1fr 300px`) with entry table (`mono 13px` inputs, `amber-tint` active row, `row-num` faint) + `All products` side panel (`pill-qty`).
- **Sale / issue** — same `entry-wrap` but `Receipt no. required` hint in faint, `red` sale tags, qty inputs.
- **Physical count** — `Counted qty` column (`130px`) with immediate-adjustment enter handling preserved.
- **Products catalogue** — full-width `search` (100%), table with `My Store` / `Katwe-Store` / `Total` cols and pagination chips, `Products` title + `Add product` amber CTA.
- **Day books** — daily logs table with `2px ink` header, `Opening` / `Closing` numeric, `Pending amber` / `Closed green` tags, `View` outline buttons.
- **Transactions ledger** — `Stock movement` table with `Date/time` / `Type` (green `Receive` / red `Sale`) / `Bucket Available` / `Qty` mono colored / `Reference` / `Sync` (`Accepted green` / `Pending amber`) / `Transaction ID` faint.
- **Settings** — `System settings` sheets: user card with `46px` teal-tint avatar, `Izaek Mandem` / `@admin` / `teal Global admin` + `Sign out` danger; `Interface theme` switch (`teal` track, `44×24`); `Store management` table (`Code mono muted` / `Active green` / edit/deactivate icon-btns); `App updates` `info-bar` with sync icon.
- **Returns** — `Customer & supplier returns` with `tab-toggle` (`Customer return amber active` / `Supplier return`), `Stock condition` select, `stepper` qty (`38px` btns, mono value), `Original transaction reference` hint, `Process return` with rotate icon, `Entry log` empty `70px` centered.
- **Transfers** — `Inter-store transfers` with `Transfer list (0)` amber + `New transfer` outline, `Filter status` select, `empty-state` dashed (`No transfers found`).
- **Damage & quarantine** — `760px` centered sheet with `Source bucket` / `Destination bucket` selects, `stepper` qty, `Reason for movement` textarea, full-width `Transfer between buckets` amber button with transfer icon.

#### Version Bump

- `package.json` (root, `apps/desktop`, `apps/web`, `apps/mobile`, `packages/ui`, `packages/shared-types`) — `1.1.6` → `1.2.0` (desktop `1.1.7` → `1.2.0`)
- `apps/desktop/src-tauri/Cargo.toml` + `tauri.conf.json` — `1.1.7` → `1.2.0`
- `apps/desktop/.env.example` + `apps/web/.env.example` — `VITE_APP_VERSION 1.1.4` → `1.2.0`
- `README.md` badge — `v1.1.0` → `v1.2.0`
- `Sidebar` brand chip and `LoginView` topbar chip now show `v1.2.0`
- Title bar / Tauri window title now reflects `1.2.0` via `tauri.conf.json`

#### Testing

- Unit: `npm test` — **258 / 258** passed (`apps/desktop` 258, `packages/ui` 29, `apps/web` + `apps/mobile` + `shared-types` no-op)
- Typecheck: `npm run typecheck` — **pass** (all workspaces)
- Lint: `npm run lint` — **pass** (0 errors)
- Build: `npm run build --workspace=@invenTory/desktop` — **pass** (`tsc && vite build`, 2321 modules, `26.46 kB` CSS)

#### Screens Touched (Files Changed)

- `packages/ui/src/tokens.css` — full token redesign
- `packages/ui/src/components/Button.tsx`, `Card.tsx`, `Table.tsx`, `Badge.tsx`, `TextInput.tsx`, `Select.tsx`, `Modal.tsx`, `LinearGridEntry.tsx`, `EmptyState.tsx` — style-only updates
- `apps/desktop/src/index.css` — shell/rail/topbar/content + sheet/kpi/chip/form/entry overrides
- `apps/desktop/src/App.tsx` — flex row shell (visual-only, no logic)
- `apps/desktop/src/components/Sidebar.tsx` — rail branding + grouped nav + amber active bar
- `apps/desktop/src/components/Header.tsx` — topbar search + status-chip + store-tag
- `apps/desktop/src/views/LoginView.tsx` — login-topbar + login-card layout
- Version files: `package.json` (×6), `Cargo.toml`, `tauri.conf.json`, `.env.example` (×2), `README.md`

#### Notes

- No `CHANGELOG.md` existed previously; this entry establishes it.
- All 13 scoped screens now match the static HTML reference artifact's CSS custom properties (`--ink`, `--paper`, `--amber`, `--teal`, `--green`, `--red`, `--font-ui Space Grotesk`, `--font-mono IBM Plex Mono`, `--radius 0px`, `prefers-color-scheme` / `data-theme` handling) while keeping every existing test green.

---

## [1.1.7] — 2026-09-21

- Hotfix: upload installer + sig files as release assets so the updater can actually download them (#59).

## [1.1.6] — 2026-09-21

- Fix: add `VITE_API_BASE_URL` to release build env (fixes blank-window in shipped builds).
- Version bump to 1.1.6.

## [1.1.5] — 2026-09-20

- Server logging cleanup, data-wipe integrity and UI icon cleanup.

## [1.1.4] — 2026-09-19

- Release prep + CI blank-window diagnostics.

## [1.1.0] — 2026-09-18

- Initial inventory management release with offline-first multi-store support, event ledger, sync, and role-based access.
