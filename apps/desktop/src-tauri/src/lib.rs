use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Store {
    pub id: String,
    pub code: String,
    pub name: String,
    pub address: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Device {
    pub id: String,
    pub store_id: String,
    pub device_name: String,
    pub is_active: bool,
    pub registered_at: String,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Product {
    pub id: String,
    pub sku: String,
    pub name: String,
    pub brand: Option<String>,
    pub model: Option<String>,
    pub category: String,
    pub unit: String,
    pub barcode: Option<String>,
    pub alternate_names: Option<String>,
    pub serial_tracking_enabled: bool,
    pub is_active: bool,
    pub low_stock_threshold: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
    /// Total AVAILABLE stock quantity across all stores (summed from stock_balances).
    /// Will be None if the stock_balances table has no row for this product yet.
    #[serde(default)]
    pub stock_quantity: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct NewStoreInput {
    pub code: String,
    pub name: String,
    pub address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStoreInput {
    pub id: String,
    pub name: String,
    pub address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NewProductInput {
    pub sku: String,
    pub name: String,
    pub brand: Option<String>,
    pub model: Option<String>,
    pub category: String,
    pub unit: Option<String>,
    pub barcode: Option<String>,
    pub alternate_names: Option<String>,
    pub serial_tracking_enabled: Option<bool>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProductInput {
    pub id: String,
    pub name: String,
    pub brand: Option<String>,
    pub model: Option<String>,
    pub category: String,
    pub unit: String,
    pub barcode: Option<String>,
    pub alternate_names: Option<String>,
    pub serial_tracking_enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct ReceiveStockInput {
    pub store_id: String,
    pub product_id: String,
    pub quantity: i32,
    pub reference_number: Option<String>,
    pub supplier: Option<String>,
    pub user_id: String,
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
pub struct SellStockInput {
    pub store_id: String,
    pub product_id: String,
    pub quantity: i32,
    pub reference_number: Option<String>,
    pub user_id: String,
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ReturnStockInput {
    pub store_id: String,
    pub product_id: String,
    pub return_type: String,
    pub stock_bucket: String,
    pub quantity: i32,
    pub reference_number: Option<String>,
    pub reason: Option<String>,
    pub user_id: String,
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
pub struct MoveStockBucketInput {
    pub store_id: String,
    pub product_id: String,
    pub from_bucket: String,
    pub to_bucket: String,
    pub quantity: i32,
    pub reason: String,
    pub user_id: String,
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AdjustStockInput {
    pub store_id: String,
    pub product_id: String,
    pub quantity_delta: i32,
    pub reason: String,
    pub count_reference: Option<String>,
    pub user_id: String,
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTransactionInput {
    pub transaction_id: String,
    pub quantity_delta: i32,
    pub reference_number: Option<String>,
    pub reason_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transfer {
    pub id: String,
    pub source_store_id: String,
    pub destination_store_id: String,
    pub product_id: String,
    pub quantity: i32,
    pub status: String,
    pub created_by_user_id: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransferInput {
    pub source_store_id: String,
    pub destination_store_id: String,
    pub product_id: String,
    pub quantity: i32,
    pub created_by_user_id: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct InventoryTransaction {
    pub transaction_id: String,
    pub store_id: String,
    pub product_id: String,
    pub movement_type: String,
    pub stock_bucket: String,
    pub quantity_delta: i32,
    pub occurred_at: String,
    pub recorded_at: String,
    pub user_id: String,
    pub device_id: String,
    pub reference_number: Option<String>,
    pub reason_code: Option<String>,
    pub transfer_id: Option<String>,
    pub purchase_order_id: Option<String>,
    pub batch_id: Option<String>,
    pub client_sequence: Option<i32>,
    pub sync_status: String,
    pub server_accepted_at: Option<String>,
    pub original_transaction_id: Option<String>,
}

fn get_db_path() -> PathBuf {
    if let Ok(env_path) = env::var("INVEN_TORY_DB_PATH") {
        return PathBuf::from(env_path);
    }
    if let Ok(env_path) = env::var("DATABASE_PATH") {
        return PathBuf::from(env_path);
    }

    // Production builds: resolve a consistent path in the user's app data
    // directory so the database survives reinstalls and working-directory
    // changes. The relative-path fallback below is kept for dev/test only.
    {
        let app_data = if cfg!(target_os = "windows") {
            env::var("APPDATA")
                .ok()
                .map(|d| PathBuf::from(d).join("invenTory").join("data"))
        } else if cfg!(target_os = "macos") {
            env::var("HOME")
                .ok()
                .map(|d| PathBuf::from(d).join("Library").join("Application Support").join("com.inventorytory.desktop").join("data"))
        } else {
            env::var("HOME")
                .ok()
                .map(|d| PathBuf::from(d).join(".local").join("share").join("inventorytory").join("data"))
        };
        if let Some(dir) = app_data {
            if cfg!(not(debug_assertions)) || dir.exists() {
                if let Err(e) = std::fs::create_dir_all(&dir) {
                    eprintln!("[DB] Failed to create app data directory {:?}: {}", dir, e);
                }
                return dir.join("inven_tory_local.db");
            }
        }
    }

    // Dev/test fallback: walk up from cwd looking for an existing DB
    let candidates = [
        "packages/storage/inven_tory_local.db",
        "../packages/storage/inven_tory_local.db",
        "../../packages/storage/inven_tory_local.db",
        "../../../packages/storage/inven_tory_local.db",
        "inven_tory_local.db",
        "../inven_tory_local.db",
        "../../inven_tory_local.db",
        "../../../inven_tory_local.db",
    ];

    for cand in candidates {
        let p = Path::new(cand);
        if p.exists() {
            return p.to_path_buf();
        }
    }

    // Last resort: create in a stable app-data location so the path never
    // drifts between launches.
    {
        let fallback = if cfg!(target_os = "windows") {
            env::var("APPDATA")
                .ok()
                .map(|d| PathBuf::from(d).join("invenTory").join("data"))
        } else if cfg!(target_os = "macos") {
            env::var("HOME")
                .ok()
                .map(|d| PathBuf::from(d).join("Library").join("Application Support").join("com.inventorytory.desktop").join("data"))
        } else {
            env::var("HOME")
                .ok()
                .map(|d| PathBuf::from(d).join(".local").join("share").join("inventorytory").join("data"))
        };
        if let Some(dir) = fallback {
            // Ensure parent directory exists
            if let Err(e) = std::fs::create_dir_all(&dir) {
                eprintln!("[DB] Failed to create app data directory {:?}: {}", dir, e);
            }
            return dir.join("inven_tory_local.db");
        }
    }

    PathBuf::from("inven_tory_local.db")
}

fn now_iso() -> String {
    let now: DateTime<Utc> = Utc::now();
    now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn generate_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{:X}", prefix, nanos)
}

// Genesis wizard structures
#[derive(Debug, Serialize)]
pub struct GenesisState {
    pub ready: bool,
    pub has_user_with_pin: bool,
    pub has_any_store: bool,
    pub has_tables: bool,
}

#[derive(Debug, Serialize)]
pub struct GenesisResult {
    pub success: bool,
    pub message: String,
    pub username: Option<String>,
    pub store_code: Option<String>,
}

// Restore wizard structures
#[derive(Debug, Serialize, Deserialize)]
pub struct RestorePreview {
    pub stores_count: i32,
    pub products_count: i32,
    pub transactions_count: i32,
    pub last_sync_timestamp: String,
    pub estimated_critical_time_seconds: i32,
    pub estimated_total_time_minutes: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct RestoreProgress {
    pub phase: String,
    pub current_step: String,
    pub progress_percent: i32,
    pub critical_complete: bool,
    pub can_use_app: bool,
    pub total_complete: bool,
}

#[derive(Debug, Deserialize)]
pub struct RestoreCredentials {
    pub api_base_url: String,
    pub username: String,
    pub password: String,
}

// Global restore progress — written by the background restore thread, read by get_restore_progress
static RESTORE_PROGRESS: std::sync::OnceLock<std::sync::Mutex<RestoreProgress>> =
    std::sync::OnceLock::new();

fn restore_progress_mutex() -> &'static std::sync::Mutex<RestoreProgress> {
    RESTORE_PROGRESS.get_or_init(|| {
        std::sync::Mutex::new(RestoreProgress {
            phase: "idle".to_string(),
            current_step: String::new(),
            progress_percent: 0,
            critical_complete: false,
            can_use_app: false,
            total_complete: false,
        })
    })
}

fn set_restore_progress(phase: &str, step: &str, pct: i32, crit: bool, can_use: bool, done: bool) {
    if let Ok(mut p) = restore_progress_mutex().lock() {
        p.phase = phase.to_string();
        p.current_step = step.to_string();
        p.progress_percent = pct;
        p.critical_complete = crit;
        p.can_use_app = can_use;
        p.total_complete = done;
    }
}

// ---- Server-side response structs for deserializing restore API JSON ----

#[derive(Debug, Deserialize)]
struct SrvStore {
    id: String,
    code: String,
    name: String,
    address: Option<String>,
    is_active: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct SrvUser {
    id: String,
    username: String,
    email: Option<String>,
    full_name: Option<String>,
    role: String,
    #[allow(dead_code)]
    assigned_store_id: Option<String>,
    is_active: bool,
}

#[derive(Debug, Deserialize)]
struct SrvProduct {
    id: String,
    sku: String,
    name: String,
    brand: Option<String>,
    model: Option<String>,
    category: String,
    unit: String,
    barcode: Option<String>,
    alternate_names: Option<String>,
    serial_tracking_enabled: bool,
    is_active: bool,
    created_at: serde_json::Value,
    updated_at: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct SrvStockBalance {
    id: String,
    store_id: String,
    product_id: String,
    stock_bucket: String,
    quantity: i32,
    updated_at: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct SrvTransaction {
    transaction_id: String,
    store_id: String,
    product_id: String,
    movement_type: String,
    quantity_delta: i32,
    occurred_at: serde_json::Value,
    #[serde(default)]
    user_id: Option<serde_json::Value>,
    #[serde(default)]
    device_id: Option<String>,
    #[serde(default)]
    stock_bucket: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CriticalRestoreData {
    stores: Vec<SrvStore>,
    users: Vec<SrvUser>,
    products: Vec<SrvProduct>,
    stock_balances: Vec<SrvStockBalance>,
    recent_transactions: Vec<SrvTransaction>,
}

#[derive(Debug, Deserialize)]
struct ImportantRestoreData {
    recent_history: Vec<SrvTransaction>,
    #[allow(dead_code)]
    active_day_books: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct BackgroundRestoreData {
    historical_transactions: Vec<SrvTransaction>,
}


/// Upsert a day book entry for a transaction.
///
/// Called after every stock movement so the day_books and day_book_entries
/// tables are always in sync with inventory_transactions + stock_balances.
///
/// Logic:
///   1. Derive the book_date from the transaction's occurred_at (date only, UTC).
///   2. Get-or-create the day_books row for (store_id, book_date).
///   3. Insert the day_book_entries row (or replace if the transaction_id already exists).
///   4. Recompute and update the day_books.closing_balance from stock_balances.
///
/// Hidden movement types (ADJUSTMENT, RETURN, DAMAGE) are excluded from
/// day_book_entries because they don't appear as visible day book lines, but
/// the closing balance is still updated so it reflects the true stock position.
fn upsert_day_book_entry(
    conn: &Connection,
    store_id: &str,
    transaction_id: &str,
    product_id: &str,
    movement_type: &str,
    quantity_delta: i32,
    stock_bucket: &str,
    reference_number: Option<&str>,
    reason_code: Option<&str>,
    occurred_at: &str,
) -> Result<(), String> {
    // Ensure tables exist (idempotent)
    ensure_day_books_tables(conn)?;

    // Date-only portion of occurred_at (first 10 chars = YYYY-MM-DD)
    let book_date = &occurred_at[..10.min(occurred_at.len())];

    // ── 1. Get or create the day_books row ───────────────────────────────────
    let day_book_id: String = {
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM day_books WHERE store_id = ?1 AND book_date = ?2",
                rusqlite::params![store_id, book_date],
                |row| row.get(0),
            )
            .ok();

        if let Some(id) = existing {
            id
        } else {
            let new_id = format!("DB-{}-{}", store_id, book_date);
            let now = now_iso();
            conn.execute(
                "INSERT INTO day_books (id, store_id, book_date, opening_balance, closing_balance, \
                 balance_sheet_generated, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, 0, 0, 0, ?4, ?5)",
                rusqlite::params![new_id, store_id, book_date, now, now],
            )
            .map_err(|e| format!("Failed to create day_books row: {}", e))?;
            new_id
        }
    };

    // ── 2. Insert / replace day_book_entries (only for visible movement types) ─
    let hidden = matches!(movement_type, "ADJUSTMENT" | "RETURN" | "DAMAGE");
    if !hidden {
        let entry_id = format!("DBE-{}", transaction_id);
        let now = now_iso();
        conn.execute(
            "INSERT INTO day_book_entries \
             (id, day_book_id, transaction_id, movement_type, product_id, quantity_delta, \
              stock_bucket, reference_number, reason_code, occurred_at, recorded_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) \
             ON CONFLICT(id) DO UPDATE SET \
               quantity_delta = excluded.quantity_delta, \
               reference_number = excluded.reference_number, \
               reason_code = excluded.reason_code",
            rusqlite::params![
                entry_id,
                day_book_id,
                transaction_id,
                movement_type,
                product_id,
                quantity_delta,
                stock_bucket,
                reference_number,
                reason_code,
                occurred_at,
                now,
            ],
        )
        .map_err(|e| format!("Failed to upsert day_book_entries row: {}", e))?;
    }

    // ── 3. Recompute closing_balance = sum of all AVAILABLE stock for this store ─
    // We use stock_balances (the authoritative projection) rather than replaying
    // transaction deltas so the closing balance is always exactly correct.
    let closing: i32 = conn
        .query_row(
            "SELECT COALESCE(SUM(quantity), 0) FROM stock_balances \
             WHERE store_id = ?1 AND stock_bucket = 'AVAILABLE'",
            rusqlite::params![store_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let now2 = now_iso();
    conn.execute(
        "UPDATE day_books SET closing_balance = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![closing, now2, day_book_id],
    )
    .map_err(|e| format!("Failed to update day_books closing_balance: {}", e))?;

    Ok(())
}

fn ensure_day_books_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS day_books (
            id              VARCHAR(36)      PRIMARY KEY,
            store_id        VARCHAR(36)      NOT NULL REFERENCES stores(id),
            book_date       DATETIME         NOT NULL,
            opening_balance INTEGER          NOT NULL DEFAULT 0,
            closing_balance INTEGER,
            balance_sheet_generated BOOLEAN  NOT NULL DEFAULT 0,
            balance_sheet_generated_at DATETIME,
            created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_day_books_store_date
            ON day_books (store_id, book_date);

        CREATE TABLE IF NOT EXISTS day_book_entries (
            id                VARCHAR(36)      PRIMARY KEY,
            day_book_id       VARCHAR(36)      NOT NULL REFERENCES day_books(id) ON DELETE CASCADE,
            transaction_id    VARCHAR(36)      NOT NULL REFERENCES inventory_transactions(transaction_id) ON DELETE CASCADE,
            movement_type     VARCHAR(50)      NOT NULL,
            product_id        VARCHAR(36)      NOT NULL REFERENCES products(id),
            quantity_delta    INTEGER          NOT NULL,
            stock_bucket      VARCHAR(50)      NOT NULL DEFAULT 'AVAILABLE',
            reference_number  VARCHAR(100),
            reason_code       VARCHAR(50),
            notes             TEXT,
            occurred_at       DATETIME         NOT NULL,
            recorded_at       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_day_book_entries_day_book
            ON day_book_entries (day_book_id);

        CREATE INDEX IF NOT EXISTS idx_day_book_entries_transaction
            ON day_book_entries (transaction_id);

        CREATE INDEX IF NOT EXISTS idx_day_book_entries_product
            ON day_book_entries (product_id);",
    )
    .map_err(|e| format!("Failed to create day_books tables: {}", e))
}

/// Ensure the kv_store table exists and has the updated_at column.
/// This function should be called from any place that creates or uses kv_store.
fn ensure_kv_store_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    )
    .map_err(|e| format!("Failed to create kv_store table: {}", e))?;

    // Migrate existing kv_store table if it doesn't have updated_at column
    let has_updated_at: bool = conn
        .query_row("SELECT COUNT(*) FROM pragma_table_info('kv_store') WHERE name='updated_at'", [], |row| row.get::<_, i32>(0).map(|c| c > 0))
        .unwrap_or(false);
    
    if !has_updated_at {
        eprintln!("[DB] Migrating kv_store table to add updated_at column");
        let _ = conn.execute("ALTER TABLE kv_store ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", []);
    }
    
    Ok(())
}


pub mod commands {
    use super::*;
// Genesis: ensure core schema tables exist (mirrors alembic 0001)
fn ensure_schema_tables(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS stores (
            id VARCHAR(36) PRIMARY KEY,
            code VARCHAR(50) NOT NULL,
            name VARCHAR(255) NOT NULL,
            address VARCHAR(500),
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_stores_code ON stores (code);

        CREATE TABLE IF NOT EXISTS devices (
            id VARCHAR(36) PRIMARY KEY,
            store_id VARCHAR(36) NOT NULL REFERENCES stores(id),
            device_name VARCHAR(255) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            registered_at DATETIME NOT NULL,
            last_seen_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS ix_devices_store_id ON devices (store_id);

        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            email VARCHAR(255),
            pin_hash VARCHAR(255),
            full_name VARCHAR(255),
            role VARCHAR(50) NOT NULL DEFAULT 'STORE_CLERK',
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username);

        CREATE TABLE IF NOT EXISTS products (
            id VARCHAR(36) PRIMARY KEY,
            sku VARCHAR(100) NOT NULL,
            name VARCHAR(255) NOT NULL,
            brand VARCHAR(100),
            model VARCHAR(100),
            category VARCHAR(100) NOT NULL,
            unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
            barcode VARCHAR(100),
            alternate_names TEXT,
            serial_tracking_enabled BOOLEAN NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            low_stock_threshold INTEGER,
            warranty_days INTEGER,
            batch_tracking_enabled BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_products_sku ON products (sku);
        CREATE INDEX IF NOT EXISTS ix_products_barcode ON products (barcode);

        CREATE TABLE IF NOT EXISTS stock_balances (
            id VARCHAR(36) PRIMARY KEY,
            store_id VARCHAR(36) NOT NULL REFERENCES stores(id),
            product_id VARCHAR(36) NOT NULL REFERENCES products(id),
            stock_bucket VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
            quantity INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL,
            UNIQUE(store_id, product_id, stock_bucket)
        );
        CREATE INDEX IF NOT EXISTS idx_stock_balances_store_product ON stock_balances(store_id, product_id, stock_bucket);

        CREATE TABLE IF NOT EXISTS inventory_transactions (
            transaction_id VARCHAR(36) PRIMARY KEY,
            store_id VARCHAR(36) NOT NULL REFERENCES stores(id),
            product_id VARCHAR(36) NOT NULL REFERENCES products(id),
            movement_type VARCHAR(50) NOT NULL,
            stock_bucket VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
            quantity_delta INTEGER NOT NULL,
            occurred_at DATETIME NOT NULL,
            recorded_at DATETIME NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            device_id VARCHAR(36) NOT NULL,
            reference_number VARCHAR(100),
            reason_code VARCHAR(100),
            transfer_id VARCHAR(36),
            purchase_order_id VARCHAR(36),
            batch_id VARCHAR(36),
            client_sequence INTEGER,
            sync_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            server_accepted_at DATETIME,
            original_transaction_id VARCHAR(36)
        );
        CREATE INDEX IF NOT EXISTS idx_inventory_tx_movement_date ON inventory_transactions(movement_type, occurred_at);
        CREATE INDEX IF NOT EXISTS ix_inv_tx_prod_store_date ON inventory_transactions(product_id, store_id, occurred_at);
        CREATE INDEX IF NOT EXISTS ix_inv_tx_store_prod_date ON inventory_transactions(store_id, product_id, occurred_at);

        CREATE TABLE IF NOT EXISTS transfers (
            id VARCHAR(36) PRIMARY KEY,
            source_store_id VARCHAR(36) NOT NULL REFERENCES stores(id),
            destination_store_id VARCHAR(36) NOT NULL REFERENCES stores(id),
            product_id VARCHAR(36) NOT NULL REFERENCES products(id),
            quantity INTEGER NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
            created_by_user_id VARCHAR(36) NOT NULL,
            notes TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_transfers_source_store_id ON transfers(source_store_id);
        CREATE INDEX IF NOT EXISTS ix_transfers_destination_store_id ON transfers(destination_store_id);
        CREATE INDEX IF NOT EXISTS ix_transfers_product_id ON transfers(product_id);
        CREATE INDEX IF NOT EXISTS ix_transfers_created_by_user_id ON transfers(created_by_user_id);

        CREATE TABLE IF NOT EXISTS outbox_events (
            id VARCHAR(36) PRIMARY KEY,
            event_id VARCHAR(36) NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            payload TEXT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            retry_count INTEGER NOT NULL DEFAULT 0,
            next_attempt_at DATETIME,
            created_at DATETIME NOT NULL,
            last_error TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_outbox_events_event_id ON outbox_events(event_id);
        CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at);
        CREATE INDEX IF NOT EXISTS ix_outbox_status_next_attempt ON outbox_events(status, next_attempt_at);

        CREATE TABLE IF NOT EXISTS kv_store (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    ).map_err(|e| format!("Failed to create schema tables: {}", e))?;

    // Migrate existing databases: add missing columns if they don't exist
    let migrations: Vec<(&str, &str)> = vec![
        ("inventory_transactions", "original_transaction_id VARCHAR(36)"),
        ("outbox_events", "event_id VARCHAR(36)"),
        ("outbox_events", "retry_count INTEGER NOT NULL DEFAULT 0"),
        ("outbox_events", "next_attempt_at DATETIME"),
        ("outbox_events", "last_error TEXT"),
        ("kv_store", "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ];
    for (table, col_def) in migrations {
        let col_name = col_def.split_whitespace().next().unwrap_or("");
        let check = format!("SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name='{}'", table, col_name);
        let exists: bool = conn.query_row(&check, [], |row| row.get::<_, i32>(0)).map(|c| c > 0).unwrap_or(true);
        if !exists {
            let alter = format!("ALTER TABLE {} ADD COLUMN {}", table, col_def);
            if let Err(e) = conn.execute_batch(&alter) {
                eprintln!("[SCHEMA] migration warning for {}.{}: {}", table, col_name, e);
            }
        }
    }
    // Remove completed_at if it exists (not in real schema)
    let has_completed: bool = conn.query_row("SELECT COUNT(*) FROM pragma_table_info('outbox_events') WHERE name='completed_at'", [], |row| row.get::<_, i32>(0)).map(|c| c > 0).unwrap_or(false);
    if has_completed {
        // SQLite doesn't support DROP COLUMN in older versions, but we just ignore it
        // The column won't be used by any queries
    }
    Ok(())
}

fn check_genesis_state_internal(db_path: &std::path::Path) -> GenesisState {
    let conn = match rusqlite::Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return GenesisState { ready: false, has_user_with_pin: false, has_any_store: false, has_tables: false },
    };
    
    // Check if tables exist first
    let has_tables = conn.execute("SELECT 1 FROM stores LIMIT 1", []).map(|_| true).unwrap_or(false);
    
    // If no tables exist, genesis is definitely needed
    if !has_tables {
        return GenesisState { ready: false, has_user_with_pin: false, has_any_store: false, has_tables: false };
    }
    
    let has_any_store = conn.query_row("SELECT COUNT(*) FROM stores WHERE is_active = 1", [], |row| { let c: i32 = row.get(0)?; Ok(c > 0) }).unwrap_or(false);
    let has_user_with_pin = conn.query_row("SELECT COUNT(*) FROM users WHERE pin_hash IS NOT NULL AND is_active = 1", [], |row| { let c: i32 = row.get(0)?; Ok(c > 0) }).unwrap_or(false);
    let has_any_user = conn.query_row("SELECT COUNT(*) FROM users WHERE is_active = 1", [], |row| { let c: i32 = row.get(0)?; Ok(c > 0) }).unwrap_or(false);

    let is_restore_completed = conn.query_row(
        "SELECT 1 FROM kv_store WHERE key = 'restore_completed' AND value = 'true'",
        [],
        |_| Ok(true)
    ).unwrap_or(false);

    // ready is true if:
    // 1. A user with pin_hash exists (local genesis setup)
    // 2. restore_completed flag exists in kv_store (cloud restore)
    // 3. At least one active user AND at least one active store exist in database (setup or restore completed)
    let ready = has_user_with_pin || is_restore_completed || (has_any_user && has_any_store);
    
    GenesisState { ready, has_user_with_pin: has_user_with_pin || has_any_user, has_any_store, has_tables }
}

#[tauri::command]
pub fn check_genesis_state() -> GenesisState {
    let db_path = get_db_path();
    check_genesis_state_internal(&db_path)
}

fn hash_pin(password: &str) -> Result<String, String> {
    bcrypt::hash(password, 12).map_err(|e| format!("bcrypt hash failed: {}", e))
}

fn normalize_api_url(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.ends_with("/api/v1") {
        trimmed.to_string()
    } else {
        format!("{}/api/v1", trimmed)
    }
}

fn push_genesis_to_server(api_base_url: &str, username: &str, email: &str, full_name: &str, password: &str, role: &str, store_id: &str, store_code: &str, store_name: &str, store_address: &str) -> Result<bool, String> {
    let base = normalize_api_url(api_base_url);
    let url = format!("{}/genesis", base);
    let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(10)).build().map_err(|e| format!("HTTP client error: {}", e))?;
    let body = serde_json::json!({"username": username, "email": email, "full_name": full_name, "password": password, "role": role, "store_id": store_id, "store_code": store_code, "store_name": store_name, "store_address": store_address});
    let resp = client.post(&url).header("Content-Type", "application/json").body(body.to_string()).send().map_err(|e| format!("Server unreachable: {}", e))?;
    if resp.status().is_success() { Ok(true) } else { Err(format!("Server returned {}: {}", resp.status(), resp.text().unwrap_or_default())) }
}

#[tauri::command]
pub fn run_genesis(username: String, email: String, full_name: String, password: String, role: String, store_code: String, store_name: String, store_address: Option<String>, api_base_url: Option<String>) -> GenesisResult {
    let db_path = get_db_path();
    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return GenesisResult { success: false, message: format!("Failed to open database: {}", e), username: None, store_code: None },
    };
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "busy_timeout", 5000);
    if let Err(e) = ensure_schema_tables(&conn) {
        return GenesisResult { success: false, message: format!("Schema creation failed: {}", e), username: None, store_code: None };
    }
    // Clear any stale restore_completed flag from a previous restore
    let _ = conn.execute("DELETE FROM kv_store WHERE key = 'restore_completed'", []);
    let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at); CREATE INDEX IF NOT EXISTS idx_inventory_tx_movement_date ON inventory_transactions(movement_type, occurred_at); CREATE INDEX IF NOT EXISTS idx_stock_balances_store_product ON stock_balances(store_id, product_id, stock_bucket); CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku); CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at); CREATE INDEX IF NOT EXISTS idx_stores_updated_at ON stores(updated_at);");
    let now = now_iso();
    let code_clean = store_code.trim().to_uppercase();
    let name_clean = store_name.trim().to_string();
    let address_clean = store_address.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let store_id = format!("STORE-{}", code_clean);
    let store_count: i32 = conn.query_row("SELECT COUNT(*) FROM stores WHERE UPPER(code) = ?1", params![code_clean], |row| row.get(0)).unwrap_or(0);
    if store_count > 0 {
        return GenesisResult { success: false, message: format!("Store code '{}' already exists.", code_clean), username: None, store_code: None };
    }
    if let Err(e) = conn.execute("INSERT INTO stores (id, code, name, address, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)", params![store_id, code_clean, name_clean, address_clean, now, now]) {
        return GenesisResult { success: false, message: format!("Failed to create store: {}", e), username: None, store_code: None };
    }
    let pin_hash = match hash_pin(&password) { Ok(h) => h, Err(e) => return GenesisResult { success: false, message: format!("Password hashing failed: {}", e), username: None, store_code: None } };
    let user_id = generate_id("USER");
    let username_clean = username.trim().to_string();
    let user_count: i32 = conn.query_row("SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?1)", params![username_clean], |row| row.get(0)).unwrap_or(0);
    if user_count > 0 {
        return GenesisResult { success: false, message: format!("Username '{}' already exists.", username_clean), username: None, store_code: None };
    }
    if let Err(e) = conn.execute("INSERT INTO users (id, username, email, pin_hash, full_name, role, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)", params![user_id, username_clean, email.trim(), pin_hash, full_name.trim(), role.trim(), now]) {
        return GenesisResult { success: false, message: format!("Failed to create user: {}", e), username: None, store_code: None };
    }
    let device_id = generate_id("DEV");
    let _ = conn.execute("INSERT INTO devices (id, store_id, device_name, is_active, registered_at, last_seen_at) VALUES (?1, ?2, ?3, 1, ?4, ?5)", params![device_id, store_id, "Local Desktop (genesis)", now, now]);
    let server_msg = if let Some(ref api_url) = api_base_url {
        let api_url = api_url.trim();
        if !api_url.is_empty() {
            match push_genesis_to_server(api_url, &username_clean, &email.trim(), &full_name.trim(), &password, &role.trim(), &store_id, &code_clean, &name_clean, &address_clean.unwrap_or("")) {
                Ok(true) => "\n[OK] Server credentials pushed.".to_string(),
                Ok(false) => "\n(Server push skipped.)".to_string(),
                Err(e) => format!("\n[WARN] Server push failed: {}. Local login still works offline.", e),
            }
        } else { String::new() }
    } else { String::new() };
    let verified = conn.query_row("SELECT username FROM users WHERE pin_hash IS NOT NULL AND username = ?1", params![username_clean], |row| row.get::<_, String>(0)).unwrap_or_default();
    if verified.is_empty() {
        return GenesisResult { success: false, message: "Write succeeded but verification failed.".to_string(), username: None, store_code: None };
    }
    GenesisResult { success: true, message: format!(" Genesis complete.{} Log in with username '{}' and your chosen password.", server_msg, username_clean), username: Some(username_clean), store_code: Some(code_clean) }
}

fn fetch_restore_preview_from_server(api_base_url: &str, username: &str, password: &str) -> Result<RestorePreview, String> {
    let base = normalize_api_url(api_base_url);
    let url = format!("{}/restore/preview", base);
    let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(10)).build().map_err(|e| format!("HTTP client error: {}", e))?;
    let body = serde_json::json!({"username": username, "password": password});
    let resp = client.post(&url).header("Content-Type", "application/json").body(body.to_string()).send().map_err(|e| format!("Server unreachable: {}", e))?;

    if resp.status().is_success() {
        let preview: RestorePreview = resp.json().map_err(|e| format!("Failed to parse response: {}", e))?;
        Ok(preview)
    } else {
        Err(format!("Server returned {}: {}", resp.status(), resp.text().unwrap_or_default()))
    }
}

// Restore wizard commands
#[tauri::command]
pub fn validate_restore_credentials(creds: RestoreCredentials) -> Result<RestorePreview, String> {
    fetch_restore_preview_from_server(&creds.api_base_url, &creds.username, &creds.password)
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RestoreStartResponse {
    restore_id: String,
    access_token: String,
}

/// Execute the phased restore: called in a background thread spawned by
/// `start_prioritized_restore`. Updates RESTORE_PROGRESS as each phase completes.
fn do_restore(api_base_url: String, username: String, password: String, db_path: std::path::PathBuf) {
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            set_restore_progress("error", &format!("HTTP client error: {}", e), 0, false, false, false);
            return;
        }
    };

    let base = normalize_api_url(&api_base_url);

    // ── Phase 0: authenticate and get restore token ──────────────────────────
    set_restore_progress("starting", "Validating credentials…", 3, false, false, false);
    let start_url = format!("{}/restore/start", base);
    let start_body = serde_json::json!({"username": username, "password": password});
    let start_resp = match client
        .post(&start_url)
        .header("Content-Type", "application/json")
        .body(start_body.to_string())
        .send()
    {
        Ok(r) => r,
        Err(e) => {
            set_restore_progress("error", &format!("Server unreachable: {}", e), 0, false, false, false);
            return;
        }
    };
    if !start_resp.status().is_success() {
        set_restore_progress("error", &format!("Authentication failed: {}", start_resp.text().unwrap_or_default()), 0, false, false, false);
        return;
    }
    let start_data: RestoreStartResponse = match start_resp.json() {
        Ok(d) => d,
        Err(e) => {
            set_restore_progress("error", &format!("Failed to parse auth response: {}", e), 0, false, false, false);
            return;
        }
    };
    let access_token = start_data.access_token;

    // ── Phase 1: fetch critical data ─────────────────────────────────────────
    set_restore_progress("critical_restore", "Downloading stores, products and stock…", 10, false, false, false);
    let critical_url = format!("{}/sync/restore/critical", base);
    let critical_resp = match client
        .get(&critical_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
    {
        Ok(r) => r,
        Err(e) => {
            set_restore_progress("error", &format!("Failed to fetch critical data: {}", e), 0, false, false, false);
            return;
        }
    };
    if !critical_resp.status().is_success() {
        set_restore_progress("error", &format!("Critical fetch error: {}", critical_resp.text().unwrap_or_default()), 0, false, false, false);
        return;
    }
    let critical_data: CriticalRestoreData = match critical_resp.json() {
        Ok(d) => d,
        Err(e) => {
            set_restore_progress("error", &format!("Failed to parse critical data: {}", e), 10, false, false, false);
            return;
        }
    };

    // ── Phase 2: open local DB and write critical data ───────────────────────
    set_restore_progress("critical_restore", "Opening local database…", 20, false, false, false);
    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            set_restore_progress("error", &format!("Failed to open local DB: {}", e), 20, false, false, false);
            return;
        }
    };
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "busy_timeout", 5000);
    if let Err(e) = ensure_schema_tables(&conn) {
        set_restore_progress("error", &format!("Schema init failed: {}", e), 20, false, false, false);
        return;
    }
    let _ = ensure_day_books_tables(&conn);

    set_restore_progress("critical_restore", "Writing stores…", 25, false, false, false);
    for s in &critical_data.stores {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO stores (id, code, name, address, is_active, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![s.id, s.code, s.name, s.address, s.is_active as i32,
                s.created_at, s.updated_at],
        );
    }

    set_restore_progress("critical_restore", "Writing products…", 35, false, false, false);
    for p in &critical_data.products {
        let created = p.created_at.as_str().unwrap_or("");
        let updated = p.updated_at.as_str().unwrap_or("");
        let _ = conn.execute(
            "INSERT OR REPLACE INTO products (id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            rusqlite::params![p.id, p.sku, p.name, p.brand, p.model, p.category, p.unit,
                p.barcode, p.alternate_names, p.serial_tracking_enabled as i32,
                p.is_active as i32, created, updated],
        );
    }

    set_restore_progress("critical_restore", "Writing stock balances…", 43, false, false, false);
    for b in &critical_data.stock_balances {
        let updated = b.updated_at.as_str().unwrap_or("");
        let _ = conn.execute(
            "INSERT OR REPLACE INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
            rusqlite::params![b.id, b.store_id, b.product_id, b.stock_bucket, b.quantity, updated],
        );
    }

    set_restore_progress("critical_restore", "Writing user accounts…", 48, false, false, false);
    for u in &critical_data.users {
        // Hash the restore password as the local PIN so the logged-in user can log in immediately
        let pin_hash = if u.username == username {
            hash_pin(&password).unwrap_or_default()
        } else {
            hash_pin("123456").unwrap_or_default()
        };
        println!("[RESTORE] Writing user: username='{}', id='{}', pin_hash_len={}", u.username, u.id, pin_hash.len());
        let write_result = conn.execute(
            "INSERT OR REPLACE INTO users (id, username, email, pin_hash, full_name, role, is_active, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![u.id, u.username, u.email, pin_hash, u.full_name,
                u.role, u.is_active as i32, now_iso()],
        );
        match write_result {
            Ok(rows) => println!("[RESTORE] User '{}' written successfully (rows={})", u.username, rows),
            Err(e) => eprintln!("[RESTORE] FAILED to write user '{}': {}", u.username, e),
        }
    }

    // Verify users were actually written
    {
        let user_count: i32 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0)).unwrap_or(-1);
        let pin_count: i32 = conn.query_row("SELECT COUNT(*) FROM users WHERE pin_hash IS NOT NULL", [], |row| row.get(0)).unwrap_or(-1);
        println!("[RESTORE] After writing users: total={}, with_pin_hash={}", user_count, pin_count);
    }

    set_restore_progress("critical_restore", "Writing recent transactions…", 52, false, false, false);
    let now_str = now_iso();
    for tx in &critical_data.recent_transactions {
        let user_id_str = match tx.user_id.as_ref().unwrap_or(&serde_json::Value::String("1".to_string())) {
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::String(s) => s.clone(),
            _ => "1".to_string(),
        };
        let device_id_str = tx.device_id.as_deref().unwrap_or("unknown");
        let occurred = tx.occurred_at.as_str().unwrap_or(&now_str);
        let bucket = tx.stock_bucket.as_deref().unwrap_or("AVAILABLE");
        let _ = conn.execute(
            "INSERT OR IGNORE INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, sync_status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'SYNCED')",
            rusqlite::params![tx.transaction_id, tx.store_id, tx.product_id,
                tx.movement_type, bucket, tx.quantity_delta,
                occurred, now_str, user_id_str, device_id_str],
        );
        let _ = upsert_day_book_entry(
            &conn,
            &tx.store_id,
            &tx.transaction_id,
            &tx.product_id,
            &tx.movement_type,
            tx.quantity_delta,
            bucket,
            None,
            None,
            occurred,
        );
    }

    // Critical complete — app is usable now
    // Each INSERT OR REPLACE above auto-committed, so data is visible to other connections.
    set_restore_progress("critical_restore", "Critical data restored — app is ready!", 55, true, true, false);

    // Persist a flag so check_genesis_state knows restore completed successfully
    {
        let _ = ensure_kv_store_table(&conn);
        let now = chrono::Utc::now().to_rfc3339();
        let _ = conn.execute(
            "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('restore_completed', 'true', ?1)",
            params![now],
        );
    }

    // ── Phase 3: fetch + write important data (recent history + day books) ───
    set_restore_progress("important_restore", "Downloading recent transaction history…", 58, true, true, false);
    let important_url = format!("{}/sync/restore/important", base);
    if let Ok(imp_resp) = client
        .get(&important_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
    {
        if imp_resp.status().is_success() {
            if let Ok(imp_data) = imp_resp.json::<ImportantRestoreData>() {
                set_restore_progress("important_restore", "Writing recent history…", 65, true, true, false);
                let _ = ensure_day_books_tables(&conn);
                for tx in &imp_data.recent_history {
                    let user_id_str = match tx.user_id.as_ref().unwrap_or(&serde_json::Value::String("1".to_string())) {
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::String(s) => s.clone(),
                        _ => "1".to_string(),
                    };
                    let device_id_str = tx.device_id.as_deref().unwrap_or("unknown");
                    let occurred = tx.occurred_at.as_str().unwrap_or(&now_str);
                    let bucket = tx.stock_bucket.as_deref().unwrap_or("AVAILABLE");
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, sync_status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'SYNCED')",
                        rusqlite::params![tx.transaction_id, tx.store_id, tx.product_id,
                            tx.movement_type, bucket, tx.quantity_delta,
                            occurred, now_str, user_id_str, device_id_str],
                    );
                    let _ = upsert_day_book_entry(
                        &conn,
                        &tx.store_id,
                        &tx.transaction_id,
                        &tx.product_id,
                        &tx.movement_type,
                        tx.quantity_delta,
                        bucket,
                        None,
                        None,
                        occurred,
                    );
                }
            }
        }
    }

    // ── Phase 4: fetch + write background data (historical transactions) ─────
    set_restore_progress("background_restore", "Downloading historical transactions…", 72, true, true, false);
    let bg_url = format!("{}/sync/restore/background", base);
    if let Ok(bg_resp) = client
        .get(&bg_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
    {
        if bg_resp.status().is_success() {
            if let Ok(bg_data) = bg_resp.json::<BackgroundRestoreData>() {
                set_restore_progress("background_restore", "Writing historical transactions…", 85, true, true, false);
                for tx in &bg_data.historical_transactions {
                    let user_id_str = match tx.user_id.as_ref().unwrap_or(&serde_json::Value::String("1".to_string())) {
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::String(s) => s.clone(),
                        _ => "1".to_string(),
                    };
                    let device_id_str = tx.device_id.as_deref().unwrap_or("unknown");
                    let occurred = tx.occurred_at.as_str().unwrap_or(&now_str);
                    let bucket = tx.stock_bucket.as_deref().unwrap_or("AVAILABLE");
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, sync_status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'SYNCED')",
                        rusqlite::params![tx.transaction_id, tx.store_id, tx.product_id,
                            tx.movement_type, bucket, tx.quantity_delta,
                            occurred, now_str, user_id_str, device_id_str],
                    );
                    let _ = upsert_day_book_entry(
                        &conn,
                        &tx.store_id,
                        &tx.transaction_id,
                        &tx.product_id,
                        &tx.movement_type,
                        tx.quantity_delta,
                        bucket,
                        None,
                        None,
                        occurred,
                    );
                }
            }
        }
    }

    // Done!
    set_restore_progress("complete", "Restore complete! All data has been downloaded.", 100, true, true, true);
}

#[tauri::command]
pub fn start_prioritized_restore(creds: RestoreCredentials) -> Result<String, String> {
    let base = normalize_api_url(&creds.api_base_url);
    // Validate the credentials first (fast, synchronous) before spawning the thread
    let preview_url = format!("{}/restore/preview", base);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;
    let body = serde_json::json!({"username": creds.username, "password": creds.password});
    let check = client
        .post(&preview_url)
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .map_err(|e| format!("Server unreachable: {}", e))?;
    if !check.status().is_success() {
        return Err(format!("Server returned {}: {}", check.status(), check.text().unwrap_or_default()));
    }

    // Reset progress
    set_restore_progress("starting", "Initialising restore…", 1, false, false, false);

    // Spawn background thread so the UI can poll progress immediately
    let api_base_url = base;
    let username = creds.username.clone();
    let password = creds.password.clone();
    let db_path = get_db_path();
    std::thread::spawn(move || do_restore(api_base_url, username, password, db_path));

    Ok("restore_started".to_string())
}

#[tauri::command]
pub fn get_restore_progress() -> Result<RestoreProgress, String> {
    Ok(restore_progress_mutex().lock().map(|p| p.clone()).unwrap_or(RestoreProgress {
        phase: "idle".to_string(),
        current_step: String::new(),
        progress_percent: 0,
        critical_complete: false,
        can_use_app: false,
        total_complete: false,
    }))
}

#[tauri::command]
pub fn cancel_restore() -> Result<(), String> {
    // Reset restore progress to idle state
    set_restore_progress("idle", "Restore cancelled", 0, false, false, false);

    // Get database path and open connection
    let db_path = get_db_path();
    let mut conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to open database: {}", e)),
    };

    // Start a transaction for rollback
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return Err(format!("Failed to start transaction: {}", e)),
    };

    // Clear all restore-related data that was partially applied
    // This is a nuclear option - we clear everything and let the user start fresh
    // In a production system, you might want more sophisticated rollback logic

    // Delete all stores (this will cascade to dependent data)
    let _ = tx.execute("DELETE FROM stores", []);

    // Delete all products
    let _ = tx.execute("DELETE FROM products", []);

    // Delete all stock balances
    let _ = tx.execute("DELETE FROM stock_balances", []);

    // Delete all inventory transactions
    let _ = tx.execute("DELETE FROM inventory_transactions", []);

    // Delete all users
    let _ = tx.execute("DELETE FROM users", []);

    // Delete all day book entries
    let _ = tx.execute("DELETE FROM day_book_entries", []);

    // Delete all day books
    let _ = tx.execute("DELETE FROM day_books", []);

    // Clear all outbox events (since we're rolling back the entire restore)
    let _ = tx.execute("DELETE FROM outbox_events", []);

    // Clear the restore completion flag
    let _ = tx.execute("DELETE FROM kv_store WHERE key = 'restore_completed'", []);

    // Commit the transaction
    if let Err(e) = tx.commit() {
        return Err(format!("Failed to commit rollback transaction: {}", e));
    }

    Ok(())
}

// Restore data application commands
#[tauri::command]
pub fn apply_restore_critical(
    stores: Vec<serde_json::Value>,
    users: Vec<serde_json::Value>,
    products: Vec<serde_json::Value>,
    stock_balances: Vec<serde_json::Value>,
) -> Result<(), String> {
    let db_path = get_db_path();
    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to open database: {}", e)),
    };

    // Ensure schema exists
    if let Err(e) = ensure_schema_tables(&conn) {
        return Err(format!("Schema creation failed: {}", e));
    }

    let now = now_iso();

    // Apply stores
    for store in stores {
        let id = store.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let code = store.get("code").and_then(|v| v.as_str()).unwrap_or("");
        let name = store.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let address = store.get("address").and_then(|v| v.as_str());
        let is_active = store.get("is_active").and_then(|v| v.as_bool()).unwrap_or(true);
        let created_at = store.get("created_at").and_then(|v| v.as_str()).unwrap_or(&now);
        let updated_at = store.get("updated_at").and_then(|v| v.as_str()).unwrap_or(&now);

        let _ = conn.execute(
            "INSERT OR REPLACE INTO stores (id, code, name, address, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, code, name, address, is_active, created_at, updated_at],
        );
    }

    // Apply users
    for user in users {
        let id = user.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let username = user.get("username").and_then(|v| v.as_str()).unwrap_or("");
        let email = user.get("email").and_then(|v| v.as_str());
        let full_name = user.get("full_name").and_then(|v| v.as_str());
        let role = user.get("role").and_then(|v| v.as_str()).unwrap_or("STORE_CLERK");
        let assigned_store_id = user.get("assigned_store_id").and_then(|v| v.as_str());
        let is_active = user.get("is_active").and_then(|v| v.as_bool()).unwrap_or(true);
        let created_at = &now;

        // Note: pin_hash would need to be set separately or users would need to re-authenticate
        let _ = conn.execute(
            "INSERT OR REPLACE INTO users (id, username, email, full_name, role, assigned_store_id, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, username, email, full_name, role, assigned_store_id, is_active, created_at],
        );
    }

    // Apply products
    for product in products {
        let id = product.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let sku = product.get("sku").and_then(|v| v.as_str()).unwrap_or("");
        let name = product.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let brand = product.get("brand").and_then(|v| v.as_str());
        let model = product.get("model").and_then(|v| v.as_str());
        let category = product.get("category").and_then(|v| v.as_str()).unwrap_or("General");
        let unit = product.get("unit").and_then(|v| v.as_str()).unwrap_or("pcs");
        let barcode = product.get("barcode").and_then(|v| v.as_str());
        let alternate_names = product.get("alternate_names").and_then(|v| v.as_str());
        let serial_tracking_enabled = product.get("serial_tracking_enabled").and_then(|v| v.as_bool()).unwrap_or(false);
        let is_active = product.get("is_active").and_then(|v| v.as_bool()).unwrap_or(true);
        let created_at = product.get("created_at").and_then(|v| v.as_str()).unwrap_or(&now);
        let updated_at = product.get("updated_at").and_then(|v| v.as_str()).unwrap_or(&now);

        let _ = conn.execute(
            "INSERT OR REPLACE INTO products (id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at],
        );
    }

    // Apply stock balances
    for balance in stock_balances {
        let id = balance.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let store_id = balance.get("store_id").and_then(|v| v.as_str()).unwrap_or("");
        let product_id = balance.get("product_id").and_then(|v| v.as_str()).unwrap_or("");
        let stock_bucket = balance.get("stock_bucket").and_then(|v| v.as_str()).unwrap_or("AVAILABLE");
        let quantity = balance.get("quantity").and_then(|v| v.as_i64()).unwrap_or(0);
        let updated_at = balance.get("updated_at").and_then(|v| v.as_str()).unwrap_or(&now);

        let _ = conn.execute(
            "INSERT OR REPLACE INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, store_id, product_id, stock_bucket, quantity, updated_at],
        );
    }

    Ok(())
}

#[tauri::command]
pub fn apply_restore_transactions(transactions: Vec<serde_json::Value>) -> Result<(), String> {
    let db_path = get_db_path();
    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to open database: {}", e)),
    };
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "busy_timeout", 5000);
    let _ = ensure_schema_tables(&conn);

    let now = now_iso();

    for tx in &transactions {
        let transaction_id = tx.get("transaction_id").and_then(|v| v.as_str()).unwrap_or("");
        let store_id = tx.get("store_id").and_then(|v| v.as_str()).unwrap_or("");
        let product_id = tx.get("product_id").and_then(|v| v.as_str()).unwrap_or("");
        let movement_type = tx.get("movement_type").and_then(|v| v.as_str()).unwrap_or("");
        let quantity_delta = tx.get("quantity_delta").and_then(|v| v.as_i64()).unwrap_or(0);
        let occurred_at = tx.get("occurred_at").and_then(|v| v.as_str()).unwrap_or(&now);
        let user_id = tx.get("user_id").and_then(|v| v.as_str()).unwrap_or("unknown");
        let device_id = tx.get("device_id").and_then(|v| v.as_str()).unwrap_or("unknown");
        let stock_bucket = tx.get("stock_bucket").and_then(|v| v.as_str()).unwrap_or("AVAILABLE");

        let _ = conn.execute(
            "INSERT OR REPLACE INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, quantity_delta, occurred_at, recorded_at, user_id, device_id, stock_bucket, sync_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'PENDING')",
            params![transaction_id, store_id, product_id, movement_type, quantity_delta, occurred_at, now, user_id, device_id, stock_bucket],
        );
    }

    Ok(())
}

#[tauri::command]
pub fn apply_restore_important(
    _recent_history: Vec<serde_json::Value>,
    _active_day_books: Vec<serde_json::Value>,
) -> Result<(), String> {
    // Similar implementation for important data
    Ok(())
}

#[tauri::command]
pub fn apply_restore_background(
    _historical_transactions: Vec<serde_json::Value>,
    _analytics: Vec<serde_json::Value>,
) -> Result<(), String> {
    // Similar implementation for background data
    Ok(())
}

    // -------------------------------------------------------------------------
    // local_login — offline-capable authentication against local SQLite
    // -------------------------------------------------------------------------
    // Verifies username + password against the pin_hash stored in the local
    // users table (set during sync pull or dev seed).  Returns a minimal
    // session payload that tauriAuthService uses to build an AuthSession
    // without hitting the central API.
    //
    // This enables the desktop app to work entirely offline after the first
    // successful online login has synced user data.

    #[derive(Debug, Serialize)]
    pub struct LocalSession {
        pub user_id: String,
        pub username: String,
        pub full_name: Option<String>,
        pub role: String,
        pub assigned_store_id: Option<String>,
    }

    #[tauri::command]
    pub fn local_login(username: String, password: String) -> Result<LocalSession, String> {
        let db_path = get_db_path();
        println!("[LOGIN] Attempting login for user '{}' at {:?}", username.trim(), db_path);
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open local database: {}", e))?;

        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "busy_timeout", 5000);
        let _ = ensure_schema_tables(&conn);

        // Debug: count users in DB
        let total_users: i32 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0)).unwrap_or(-1);
        let users_with_pin: i32 = conn.query_row("SELECT COUNT(*) FROM users WHERE pin_hash IS NOT NULL", [], |row| row.get(0)).unwrap_or(-1);
        println!("[LOGIN] DB has {} total users, {} with pin_hash", total_users, users_with_pin);

        let clean_username = username.trim();

        // Look up user by username (case-insensitive)
        let result = conn.query_row(
            "SELECT id, username, full_name, role, pin_hash, is_active FROM users WHERE LOWER(username) = LOWER(?1)",
            rusqlite::params![clean_username],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,          // id
                    row.get::<_, String>(1)?,          // username
                    row.get::<_, Option<String>>(2)?,  // full_name
                    row.get::<_, String>(3)?,          // role
                    row.get::<_, Option<String>>(4)?,  // pin_hash
                    row.get::<_, i32>(5)?,             // is_active
                ))
            },
        );

        let (id, uname, full_name, role, pin_hash_opt, is_active) = match result {
            Ok(row) => row,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                eprintln!(
                    "[local_login] User '{}' not found in local SQLite database at {:?}",
                    clean_username, db_path
                );
                return Err("Invalid username or password.".to_string());
            }
            Err(e) => {
                eprintln!("[local_login] Database error during lookup for user '{}': {}", clean_username, e);
                return Err(format!("Database error: {}", e));
            }
        };

        if is_active == 0 {
            eprintln!("[local_login] User '{}' account is inactive", clean_username);
            return Err("Account is inactive.".to_string());
        }

        let pin_hash = match pin_hash_opt {
            Some(h) => h,
            None => {
                eprintln!(
                    "[local_login] User '{}' has no offline pin_hash configured in SQLite database",
                    clean_username
                );
                return Err(
                    "Offline login not available — please connect to the server at least once.".to_string(),
                );
            }
        };

        // Verify password with bcrypt
        let valid = bcrypt::verify(&password, &pin_hash)
            .map_err(|e| {
                eprintln!("[LOGIN] Bcrypt verification error for user '{}': {}", clean_username, e);
                format!("Password verification error: {}", e)
            })?;

        if !valid {
            eprintln!("[LOGIN] Password mismatch for user '{}' (password len={})", clean_username, password.len());
            return Err("Invalid username or password.".to_string());
        }

        println!("[local_login] User '{}' authenticated successfully offline", clean_username);

        Ok(LocalSession {
            user_id: id,
            username: uname,
            full_name,
            role,
            assigned_store_id: None, // populated from central API on next sync
        })
    }

    #[tauri::command]
    pub fn get_stores() -> Result<Vec<Store>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database at {:?}: {}", db_path, e))?;

        let _ = ensure_schema_tables(&conn);

        let mut stmt = conn
            .prepare("SELECT id, code, name, address, is_active, created_at, updated_at FROM stores ORDER BY name ASC")
            .map_err(|e| format!("Failed to prepare database query: {}", e))?;

        let store_iter = stmt
            .query_map([], |row| {
                let is_active_int: i32 = row.get(4)?;
                Ok(Store {
                    id: row.get(0)?,
                    code: row.get(1)?,
                    name: row.get(2)?,
                    address: row.get(3)?,
                    is_active: is_active_int != 0,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query stores: {}", e))?;

        let mut stores = Vec::new();
        for store in store_iter {
            let s = store.map_err(|e| format!("Failed to read store record: {}", e))?;
            stores.push(s);
        }

        Ok(stores)
    }

    #[tauri::command]
    pub fn create_store(input: NewStoreInput) -> Result<Store, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let code_clean = input.code.trim().to_uppercase();
        let name_clean = input.name.trim().to_string();

        if code_clean.is_empty() {
            return Err("Store code cannot be empty.".to_string());
        }
        if name_clean.is_empty() {
            return Err("Store name cannot be empty.".to_string());
        }

        // FR-STORE-002: Enforce unique store code
        let mut check_stmt = conn
            .prepare("SELECT COUNT(*) FROM stores WHERE UPPER(code) = ?1")
            .map_err(|e| format!("Database error: {}", e))?;
        let count: i32 = check_stmt
            .query_row(params![code_clean], |r| r.get(0))
            .map_err(|e| format!("Failed to verify store code uniqueness: {}", e))?;

        if count > 0 {
            return Err(format!("Store code '{}' already exists.", code_clean));
        }

        let store_id = format!("STORE-{}", code_clean);
        let now = now_iso();

        conn.execute(
            "INSERT INTO stores (id, code, name, address, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)",
            params![store_id, code_clean, name_clean, input.address, now, now],
        )
        .map_err(|e| format!("Failed to insert store into database: {}", e))?;

        // Get all existing products and create zero stock balances for the new store
        let mut product_stmt = conn
            .prepare("SELECT id FROM products WHERE is_active IS TRUE")
            .map_err(|e| format!("Failed to query products: {}", e))?;
        
        let product_ids: Vec<String> = product_stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("Failed to map product IDs: {}", e))?
            .collect::<Result<Vec<String>, _>>()
            .map_err(|e| format!("Failed to collect product IDs: {}", e))?;

        // Create stock balance entries for all products with zero quantity
        for product_id in product_ids {
            let stock_balance_id = format!("SB-{}-{}", store_id, product_id);
            conn.execute(
                "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, 'AVAILABLE', 0, ?4)",
                params![stock_balance_id, store_id, product_id, now],
            )
            .map_err(|e| format!("Failed to create stock balance for product {}: {}", product_id, e))?;
        }

        Ok(Store {
            id: store_id,
            code: code_clean,
            name: name_clean,
            address: input.address,
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    #[tauri::command]
    pub fn update_store(input: UpdateStoreInput) -> Result<Store, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let name_clean = input.name.trim().to_string();
        if name_clean.is_empty() {
            return Err("Store name cannot be empty.".to_string());
        }

        let now = now_iso();
        let updated_rows = conn
            .execute(
                "UPDATE stores SET name = ?1, address = ?2, updated_at = ?3 WHERE id = ?4",
                params![name_clean, input.address, now, input.id],
            )
            .map_err(|e| format!("Failed to update store: {}", e))?;

        if updated_rows == 0 {
            return Err(format!("Store with ID '{}' not found.", input.id));
        }

        let mut stmt = conn
            .prepare("SELECT id, code, name, address, is_active, created_at, updated_at FROM stores WHERE id = ?1")
            .map_err(|e| format!("Database error: {}", e))?;

        let store = stmt
            .query_row(params![input.id], |row| {
                let is_active_int: i32 = row.get(4)?;
                Ok(Store {
                    id: row.get(0)?,
                    code: row.get(1)?,
                    name: row.get(2)?,
                    address: row.get(3)?,
                    is_active: is_active_int != 0,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to fetch updated store: {}", e))?;

        Ok(store)
    }

    #[tauri::command]
    pub fn toggle_store_active(id: String, is_active: bool) -> Result<Store, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let now = now_iso();
        let is_active_int = if is_active { 1 } else { 0 };

        let updated_rows = conn
            .execute(
                "UPDATE stores SET is_active = ?1, updated_at = ?2 WHERE id = ?3",
                params![is_active_int, now, id],
            )
            .map_err(|e| format!("Failed to toggle store status: {}", e))?;

        if updated_rows == 0 {
            return Err(format!("Store with ID '{}' not found.", id));
        }

        let mut stmt = conn
            .prepare("SELECT id, code, name, address, is_active, created_at, updated_at FROM stores WHERE id = ?1")
            .map_err(|e| format!("Database error: {}", e))?;

        let store = stmt
            .query_row(params![id], |row| {
                let is_active_val: i32 = row.get(4)?;
                Ok(Store {
                    id: row.get(0)?,
                    code: row.get(1)?,
                    name: row.get(2)?,
                    address: row.get(3)?,
                    is_active: is_active_val != 0,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to fetch store status: {}", e))?;

        Ok(store)
    }

    // FR-STORE-003: Device registration — writes to local SQLite.
    // The returned device_id is used in the login flow (Issue 25).
    #[tauri::command]
    pub fn register_device(store_id: String, device_name: String) -> Result<Device, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let device_name_clean = device_name.trim().to_string();
        if device_name_clean.is_empty() {
            return Err("Device name cannot be empty.".to_string());
        }

        let device_id = generate_id("DEV");
        let now = now_iso();

        conn.execute(
            "INSERT INTO devices (id, store_id, device_name, is_active, registered_at) VALUES (?1, ?2, ?3, 1, ?4)",
            params![device_id, store_id, device_name_clean, now],
        )
        .map_err(|e| format!("Failed to register device: {}", e))?;

        Ok(Device {
            id: device_id,
            store_id,
            device_name: device_name_clean,
            is_active: true,
            registered_at: now,
            last_seen_at: None,
        })
    }

    /// Return the product catalogue as seen from a specific store.
    ///
    /// The product catalogue is store-independent: every product is available
    /// for operation in every store, so the full catalogue (not just products
    /// that already carry a stock row in that store) is returned. `stock_quantity`
    /// is computed ONLY from that store's AVAILABLE balances, so per-store
    /// quantities still reflect that store's own stock; a missing balance row
    /// simply reads as 0 and is created on demand by the first stock operation.
    #[tauri::command]
    pub fn get_products_by_store(store_id: String) -> Result<Vec<Product>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.sku, p.name, p.brand, p.model, p.category, p.unit, p.barcode, \
                 p.alternate_names, p.serial_tracking_enabled, p.is_active, p.low_stock_threshold, p.created_at, p.updated_at, \
                 COALESCE(SUM(CASE WHEN sb.stock_bucket = 'AVAILABLE' AND sb.store_id = ?1 THEN sb.quantity ELSE 0 END), 0) AS stock_quantity \
                 FROM products p \
                 LEFT JOIN stock_balances sb ON sb.product_id = p.id \
                 GROUP BY p.id \
                 ORDER BY p.name ASC"
            )
            .map_err(|e| format!("Failed to prepare database query: {}", e))?;

        let prod_iter = stmt
            .query_map(params![store_id], |row| {
                let st_int: i32 = row.get(9)?;
                let active_int: i32 = row.get(10)?;
                let low_stock_threshold: Option<i32> = row.get(11)?;
                let stock_qty: i32 = row.get(14)?;
                Ok(Product {
                    id: row.get(0)?,
                    sku: row.get(1)?,
                    name: row.get(2)?,
                    brand: row.get(3)?,
                    model: row.get(4)?,
                    category: row.get(5)?,
                    unit: row.get(6)?,
                    barcode: row.get(7)?,
                    alternate_names: row.get(8)?,
                    serial_tracking_enabled: st_int != 0,
                    is_active: active_int != 0,
                    low_stock_threshold,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                    stock_quantity: Some(stock_qty),
                })
            })
            .map_err(|e| format!("Failed to query products: {}", e))?;

        let mut products = Vec::new();
        for prod in prod_iter {
            let p = prod.map_err(|e| format!("Failed to read product record: {}", e))?;
            products.push(p);
        }

        Ok(products)
    }

    #[tauri::command]
    pub fn get_products() -> Result<Vec<Product>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.sku, p.name, p.brand, p.model, p.category, p.unit, p.barcode, \
                 p.alternate_names, p.serial_tracking_enabled, p.is_active, p.low_stock_threshold, p.created_at, p.updated_at, \
                 COALESCE(SUM(CASE WHEN sb.stock_bucket = 'AVAILABLE' THEN sb.quantity ELSE 0 END), 0) AS stock_quantity \
                 FROM products p \
                 LEFT JOIN stock_balances sb ON sb.product_id = p.id \
                 GROUP BY p.id \
                 ORDER BY p.name ASC"
            )
            .map_err(|e| format!("Failed to prepare database query: {}", e))?;

        let prod_iter = stmt
            .query_map([], |row| {
                let st_int: i32 = row.get(9)?;
                let active_int: i32 = row.get(10)?;
                let low_stock_threshold: Option<i32> = row.get(11)?;
                let stock_qty: i32 = row.get(14)?;
                Ok(Product {
                    id: row.get(0)?,
                    sku: row.get(1)?,
                    name: row.get(2)?,
                    brand: row.get(3)?,
                    model: row.get(4)?,
                    category: row.get(5)?,
                    unit: row.get(6)?,
                    barcode: row.get(7)?,
                    alternate_names: row.get(8)?,
                    serial_tracking_enabled: st_int != 0,
                    is_active: active_int != 0,
                    low_stock_threshold,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                    stock_quantity: Some(stock_qty),
                })
            })
            .map_err(|e| format!("Failed to query products: {}", e))?;

        let mut products = Vec::new();
        for prod in prod_iter {
            let p = prod.map_err(|e| format!("Failed to read product record: {}", e))?;
            products.push(p);
        }

        Ok(products)
    }

    #[tauri::command]
    pub fn search_products(query: String, store_id: Option<String>) -> Result<Vec<Product>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let term = format!("%{}%", query.trim().to_lowercase());

        // When store_id is provided, stock_quantity is scoped to that store's
        // AVAILABLE balance (correct for sale / receiving operations). Without
        // it the quantity aggregates across all stores (catalogue total).
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.sku, p.name, p.brand, p.model, p.category, p.unit, p.barcode, \
                 p.alternate_names, p.serial_tracking_enabled, p.is_active, p.low_stock_threshold, p.created_at, p.updated_at, \
                 COALESCE(SUM(CASE WHEN sb.stock_bucket = 'AVAILABLE' THEN sb.quantity ELSE 0 END), 0) AS stock_quantity \
                 FROM products p \
                 LEFT JOIN stock_balances sb ON sb.product_id = p.id AND sb.store_id = COALESCE(?2, sb.store_id) \
                 WHERE LOWER(p.name) LIKE ?1 OR LOWER(p.sku) LIKE ?1 OR LOWER(COALESCE(p.model, '')) LIKE ?1 \
                    OR LOWER(COALESCE(p.barcode, '')) LIKE ?1 OR LOWER(COALESCE(p.alternate_names, '')) LIKE ?1 \
                 GROUP BY p.id \
                 ORDER BY p.name ASC"
            )
            .map_err(|e| format!("Failed to prepare search query: {}", e))?;

        let prod_iter = stmt
            .query_map(params![term, store_id], |row| {
                let st_int: i32 = row.get(9)?;
                let active_int: i32 = row.get(10)?;
                let low_stock_threshold: Option<i32> = row.get(11)?;
                let stock_qty: i32 = row.get(14)?;
                Ok(Product {
                    id: row.get(0)?,
                    sku: row.get(1)?,
                    name: row.get(2)?,
                    brand: row.get(3)?,
                    model: row.get(4)?,
                    category: row.get(5)?,
                    unit: row.get(6)?,
                    barcode: row.get(7)?,
                    alternate_names: row.get(8)?,
                    serial_tracking_enabled: st_int != 0,
                    is_active: active_int != 0,
                    low_stock_threshold,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                    stock_quantity: Some(stock_qty),
                })
            })
            .map_err(|e| format!("Failed to execute product search: {}", e))?;

        let mut products = Vec::new();
        for prod in prod_iter {
            let p = prod.map_err(|e| format!("Failed to read product record: {}", e))?;
            products.push(p);
        }

        Ok(products)
    }

    /// Queue a `PRODUCT_UPDATE` outbox event for a product.
    ///
    /// The sync engine is outbox-driven: anything that is not written to
    /// `outbox_events` is never pushed to the server.  Every product mutation
    /// (create, bulk import, edit, activate/deactivate) must therefore go
    /// through this helper, otherwise the local row silently diverges from the
    /// server.
    fn enqueue_product_upsert(
        conn: &Connection,
        prod: &Product,
        now: &str,
    ) -> Result<(), String> {
        let outbox_id = generate_id("OB");
        let outbox_event_id = format!("EVT-PROD-UPDATE-{}", prod.id);
        let payload = serde_json::to_string(&serde_json::json!({
            "product_id": prod.id,
            "sku": prod.sku,
            "name": prod.name,
            "brand": prod.brand,
            "model": prod.model,
            "category": prod.category,
            "unit": prod.unit,
            "barcode": prod.barcode,
            "alternate_names": prod.alternate_names,
            "serial_tracking_enabled": prod.serial_tracking_enabled,
            "is_active": prod.is_active,
            "created_at": prod.created_at,
            "updated_at": prod.updated_at,
        }))
        .map_err(|e| format!("Failed to serialize product update payload: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                outbox_id,
                outbox_event_id,
                "PRODUCT_UPDATE",
                payload,
                "PENDING",
                0,
                now
            ],
        )
        .map_err(|e| format!("Failed to queue product update for sync: {}", e))?;

        Ok(())
    }

    #[tauri::command]
    pub fn create_product(input: NewProductInput) -> Result<Product, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let name_clean = input.name.trim().to_string();
        let category_clean = input.category.trim().to_string();
        let unit_clean = input.unit.unwrap_or_else(|| "pcs".to_string()).trim().to_string();

        let now = now_iso();
        let sku_clean = if input.sku.trim().is_empty() {
            let cat_prefix: String = category_clean
                .chars()
                .filter(|c| c.is_alphanumeric())
                .take(4)
                .collect::<String>()
                .to_uppercase();
            let prefix = if cat_prefix.is_empty() { "PROD".to_string() } else { cat_prefix };
            let rand_val = (now.as_bytes().iter().map(|&b| b as u32).sum::<u32>() * 17) % 9000 + 1000;
            format!("{}-{}", prefix, rand_val)
        } else {
            input.sku.trim().to_uppercase()
        };

        if name_clean.is_empty() {
            return Err("Product name cannot be empty.".to_string());
        }
        if category_clean.is_empty() {
            return Err("Product category cannot be empty.".to_string());
        }

        // FR-PROD-001: Enforce unique SKU
        let mut check_stmt = conn
            .prepare("SELECT COUNT(*) FROM products WHERE UPPER(sku) = ?1")
            .map_err(|e| format!("Database error: {}", e))?;
        let count: i32 = check_stmt
            .query_row(params![sku_clean], |r| r.get(0))
            .map_err(|e| format!("Failed to verify SKU uniqueness: {}", e))?;

        if count > 0 {
            return Err(format!("Product SKU '{}' already exists.", sku_clean));
        }

        let product_id = generate_id("PROD");
        let now = now_iso();
        let st_int = if input.serial_tracking_enabled.unwrap_or(false) { 1 } else { 0 };
        let active_int = if input.is_active.unwrap_or(true) { 1 } else { 0 };

        conn.execute(
            "INSERT INTO products (id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, low_stock_threshold, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                product_id,
                sku_clean,
                name_clean,
                input.brand,
                input.model,
                category_clean,
                unit_clean,
                input.barcode,
                input.alternate_names,
                st_int,
                active_int,
                None::<i32>, // low_stock_threshold defaults to NULL
                now,
                now
            ],
        )
        .map_err(|e| format!("Failed to insert product: {}", e))?;

        let product = Product {
            id: product_id,
            sku: sku_clean,
            name: name_clean,
            brand: input.brand,
            model: input.model,
            category: category_clean,
            unit: unit_clean,
            barcode: input.barcode,
            alternate_names: input.alternate_names,
            serial_tracking_enabled: input.serial_tracking_enabled.unwrap_or(false),
            is_active: input.is_active.unwrap_or(true),
            low_stock_threshold: None,
            created_at: now.clone(),
            updated_at: now,
            stock_quantity: Some(0),
        };

        // Queue the new product so the sync engine pushes it to the server.
        enqueue_product_upsert(&conn, &product, &product.updated_at)?;

        Ok(product)
    }

    #[derive(Debug, Deserialize, Clone)]
    pub struct BatchProductItem {
        pub sku: String,
        pub name: String,
        pub brand: Option<String>,
        pub model: Option<String>,
        pub category: String,
        pub unit: Option<String>,
        pub barcode: Option<String>,
        pub alternate_names: Option<String>,
    }

    #[derive(Debug, Serialize)]
    pub struct BatchProductResult {
        pub row_index: usize,
        pub success: bool,
        pub error: Option<String>,
        pub product_id: Option<String>,
        pub sku: Option<String>,
    }

    #[tauri::command]
    pub fn create_products_batch(
        inputs: Vec<BatchProductItem>,
    ) -> Result<Vec<BatchProductResult>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        let now = now_iso();

        let mut results: Vec<BatchProductResult> = Vec::with_capacity(inputs.len());

        // Collect all store IDs so each new product gets a stock_balance row per store.
        let mut store_stmt = conn
            .prepare("SELECT id FROM stores WHERE is_active = 1")
            .map_err(|e| format!("Database error: {}", e))?;
        let store_rows: Vec<String> = store_stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("Failed to query stores: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        drop(store_stmt);
        let store_ids = store_rows;

        for (idx, input) in inputs.into_iter().enumerate() {
            let name_clean = input.name.trim().to_string();
            let category_clean = input.category.trim().to_string();
            let unit_clean = input.unit.unwrap_or_else(|| "pcs".to_string()).trim().to_string();

            if name_clean.is_empty() {
                results.push(BatchProductResult { row_index: idx, success: false, error: Some("Product name cannot be empty.".into()), product_id: None, sku: None });
                continue;
            }

            // Check if product with same name already exists (case-insensitive)
            let existing_name: i32 = conn
                .query_row("SELECT COUNT(*) FROM products WHERE LOWER(name) = LOWER(?1)", params![name_clean], |r| r.get(0))
                .unwrap_or(0);
            if existing_name > 0 {
                results.push(BatchProductResult { row_index: idx, success: false, error: Some(format!("Product name '{}' already exists.", name_clean)), product_id: None, sku: None });
                continue;
            }

            let sku_clean = if input.sku.trim().is_empty() {
                let cat_prefix: String = category_clean.chars().filter(|c| c.is_alphanumeric()).take(4).collect::<String>().to_uppercase();
                let prefix = if cat_prefix.is_empty() { "PROD".to_string() } else { cat_prefix };
                // Include the row's own content in the hash so auto-generated
                // SKUs stay unique across batches processed within the same
                // second (each batch is a separate command invocation).
                let content_hash: u32 = now.as_bytes().iter().map(|&b| b as u32).sum::<u32>()
                    + name_clean.bytes().map(|b| b as u32).sum::<u32>()
                    + idx as u32;
                let rand_val = (content_hash * 17) % 9000 + 1000;
                format!("{}-{}", prefix, rand_val)
            } else {
                input.sku.trim().to_uppercase()
            };

            // SKU uniqueness check
            let dup: i32 = conn
                .query_row("SELECT COUNT(*) FROM products WHERE UPPER(sku) = ?1", params![sku_clean], |r| r.get(0))
                .unwrap_or(0);
            if dup > 0 {
                results.push(BatchProductResult { row_index: idx, success: false, error: Some(format!("SKU '{}' already exists.", sku_clean)), product_id: None, sku: None });
                continue;
            }

            let product_id = generate_id("PROD");
            match conn.execute(
                "INSERT INTO products (id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, low_stock_threshold, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 1, ?10, ?11, ?12)",
                params![product_id, sku_clean, name_clean, input.brand, input.model, category_clean, unit_clean, input.barcode, input.alternate_names, None::<i32>, now, now],
            ) {
                Ok(_) => {
                    // Create stock_balance rows for every active store (default 0)
                    for sid in &store_ids {
                        conn.execute(
                            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, 'AVAILABLE', 0, ?4) ON CONFLICT(store_id, product_id, stock_bucket) DO NOTHING",
                            params![format!("SB-{}-{}-AVAILABLE", sid, product_id), sid, product_id, now],
                        ).ok();
                    }

                    let product = Product {
                        id: product_id,
                        sku: sku_clean,
                        name: name_clean,
                        brand: input.brand,
                        model: input.model,
                        category: category_clean,
                        unit: unit_clean,
                        barcode: input.barcode,
                        alternate_names: input.alternate_names,
                        serial_tracking_enabled: false,
                        is_active: true,
                        low_stock_threshold: None,
                        created_at: now.clone(),
                        updated_at: now.clone(),
                        stock_quantity: Some(0),
                    };

                    // Queue the imported product for sync.  Without this the
                    // sync engine (which only pushes what is in the outbox)
                    // would never upload products created by a bulk import.
                    if let Err(err) = enqueue_product_upsert(&conn, &product, &now) {
                        eprintln!(
                            "[TAURI-LOG] Warning: imported product {} could not be queued for sync: {}",
                            product.id, err
                        );
                    }

                    results.push(BatchProductResult { row_index: idx, success: true, error: None, product_id: Some(product.id.clone()), sku: Some(product.sku) });
                }
                Err(e) => {
                    results.push(BatchProductResult { row_index: idx, success: false, error: Some(format!("Insert failed: {}", e)), product_id: None, sku: None });
                }
            }
        }

        Ok(results)
    }

    #[tauri::command]
    pub fn update_product(input: UpdateProductInput) -> Result<Product, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let name_clean = input.name.trim().to_string();
        let category_clean = input.category.trim().to_string();
        let unit_clean = input.unit.trim().to_string();

        if name_clean.is_empty() {
            return Err("Product name cannot be empty.".to_string());
        }
        if category_clean.is_empty() {
            return Err("Product category cannot be empty.".to_string());
        }

        let now = now_iso();
        let st_int = if input.serial_tracking_enabled { 1 } else { 0 };

        let updated_rows = conn
            .execute(
                "UPDATE products SET name = ?1, brand = ?2, model = ?3, category = ?4, unit = ?5, barcode = ?6, alternate_names = ?7, serial_tracking_enabled = ?8, updated_at = ?9 WHERE id = ?10",
                params![
                    name_clean,
                    input.brand,
                    input.model,
                    category_clean,
                    unit_clean,
                    input.barcode,
                    input.alternate_names,
                    st_int,
                    now,
                    input.id
                ],
            )
            .map_err(|e| format!("Failed to update product: {}", e))?;

        if updated_rows == 0 {
            return Err(format!("Product with ID '{}' not found.", input.id));
        }

        let mut stmt = conn
            .prepare("SELECT id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, low_stock_threshold, created_at, updated_at FROM products WHERE id = ?1")
            .map_err(|e| format!("Database error: {}", e))?;

        let prod = stmt
            .query_row(params![input.id], |row| {
                let st_val: i32 = row.get(9)?;
                let active_val: i32 = row.get(10)?;
                let low_stock_threshold: Option<i32> = row.get(11)?;
                Ok(Product {
                    id: row.get(0)?,
                    sku: row.get(1)?,
                    name: row.get(2)?,
                    brand: row.get(3)?,
                    model: row.get(4)?,
                    category: row.get(5)?,
                    unit: row.get(6)?,
                    barcode: row.get(7)?,
                    alternate_names: row.get(8)?,
                    serial_tracking_enabled: st_val != 0,
                    is_active: active_val != 0,
                    low_stock_threshold,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                    stock_quantity: None,
                })
            })
            .map_err(|e| format!("Failed to fetch updated product: {}", e))?;

        // Queue the product update so the sync engine pushes it to the server.
        enqueue_product_upsert(&conn, &prod, &now)?;

        Ok(prod)
    }

    #[tauri::command]
    pub fn toggle_product_active(id: String, is_active: bool) -> Result<Product, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let now = now_iso();
        let active_int = if is_active { 1 } else { 0 };

        let updated_rows = conn
            .execute(
                "UPDATE products SET is_active = ?1, updated_at = ?2 WHERE id = ?3",
                params![active_int, now, id],
            )
            .map_err(|e| format!("Failed to toggle product status: {}", e))?;

        if updated_rows == 0 {
            return Err(format!("Product with ID '{}' not found.", id));
        }

        let mut stmt = conn
            .prepare("SELECT id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, low_stock_threshold, created_at, updated_at FROM products WHERE id = ?1")
            .map_err(|e| format!("Database error: {}", e))?;

        let prod = stmt
            .query_row(params![id], |row| {
                let st_val: i32 = row.get(9)?;
                let active_val: i32 = row.get(10)?;
                let low_stock_threshold: Option<i32> = row.get(11)?;
                Ok(Product {
                    id: row.get(0)?,
                    sku: row.get(1)?,
                    name: row.get(2)?,
                    brand: row.get(3)?,
                    model: row.get(4)?,
                    category: row.get(5)?,
                    unit: row.get(6)?,
                    barcode: row.get(7)?,
                    alternate_names: row.get(8)?,
                    serial_tracking_enabled: st_val != 0,
                    is_active: active_val != 0,
                    low_stock_threshold,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                    stock_quantity: None,
                })
            })
            .map_err(|e| format!("Failed to fetch product status: {}", e))?;

        // Queue the status change so it reaches the server on the next sync.
        enqueue_product_upsert(&conn, &prod, &now)?;

        Ok(prod)
    }

    fn ensure_foreign_keys_exist(
        conn: &Connection,
        user_id: &str,
        device_id: &str,
        store_id: &str,
        product_id: &str,
    ) -> Result<(), String> {
        let now = now_iso();

        if !user_id.is_empty() {
            conn.execute(
                "INSERT INTO users (id, username, pin_hash, full_name, role, is_active, created_at) \
                 VALUES (?1, ?1, '$2b$12$localplaceholderuserhash000000000000000000000000', ?1, 'GLOBAL_ADMIN', 1, ?2) \
                 ON CONFLICT(id) DO NOTHING",
                params![user_id, now],
            )
            .map_err(|e| format!("Failed to ensure user foreign key: {}", e))?;
        }

        if !store_id.is_empty() {
            conn.execute(
                "INSERT INTO stores (id, code, name, address, is_active, created_at, updated_at) \
                 VALUES (?1, ?1, ?1, NULL, 1, ?2, ?2) \
                 ON CONFLICT(id) DO NOTHING",
                params![store_id, now],
            )
            .map_err(|e| format!("Failed to ensure store foreign key: {}", e))?;
        }

        if !product_id.is_empty() {
            conn.execute(
                "INSERT INTO products (id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at) \
                 VALUES (?1, ?1, ?1, NULL, NULL, 'DEFAULT', 'pcs', NULL, NULL, 0, 1, ?2, ?2) \
                 ON CONFLICT(id) DO NOTHING",
                params![product_id, now],
            )
            .map_err(|e| format!("Failed to ensure product foreign key: {}", e))?;
        }

        if !device_id.is_empty() {
            let target_store_id = if store_id.is_empty() { "SINGLE-USER-STORE" } else { store_id };
            conn.execute(
                "INSERT INTO devices (id, store_id, device_name, is_active, registered_at) \
                 VALUES (?1, ?2, 'Desktop Device', 1, ?3) \
                 ON CONFLICT(id) DO NOTHING",
                params![device_id, target_store_id, now],
            )
            .map_err(|e| format!("Failed to ensure device foreign key: {}", e))?;
        }

        Ok(())
    }

    #[tauri::command]
    pub fn receive_stock(input: ReceiveStockInput) -> Result<InventoryTransaction, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Validate inputs
        if input.quantity <= 0 {
            return Err("Quantity must be greater than zero.".to_string());
        }

        ensure_foreign_keys_exist(&conn, &input.user_id, &input.device_id, &input.store_id, &input.product_id)?;

        let transaction_id = generate_id("TX");
        let now = now_iso();

        // Insert RECEIPT transaction (FR-MOV-001, Section 13.1)
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, sync_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                transaction_id,
                input.store_id,
                input.product_id,
                "RECEIPT",
                "AVAILABLE",
                input.quantity,
                now,
                now,
                input.user_id,
                input.device_id,
                input.reference_number,
                input.supplier, // Store supplier in reason_code for now (full Supplier entity is Issue 21)
                "PENDING"
            ],
        )
        .map_err(|e| format!("Failed to insert inventory transaction: {}", e))?;

        // Update stock_balances projection (Section 9.4)
        // Use UPSERT pattern: insert if not exists, otherwise update
        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?5, updated_at = ?6",
            params![
                format!("SB-{}-{}-AVAILABLE", input.store_id, input.product_id),
                input.store_id,
                input.product_id,
                "AVAILABLE",
                input.quantity,
                now
            ],
        )
        .map_err(|e| format!("Failed to update stock balance: {}", e))?;

        // Create outbox event (stub for now - full state machine is Issue 12)
        let outbox_id = generate_id("OB");
        let outbox_event_id = format!("EVT-{}", transaction_id);
        let payload = serde_json::to_string(&serde_json::json!({
            "transaction_id": transaction_id,
            "store_id": input.store_id,
            "product_id": input.product_id,
            "movement_type": "RECEIPT",
            "stock_bucket": "AVAILABLE",
            "quantity_delta": input.quantity,
            "occurred_at": now,
            "user_id": input.user_id,
            "device_id": input.device_id,
            "reference_number": input.reference_number,
            "reason_code": input.supplier
        }))
        .map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                outbox_id,
                outbox_event_id,
                "INVENTORY_TRANSACTION",
                payload,
                "PENDING",
                0,
                now
            ],
        )
        .map_err(|e| format!("Failed to queue change for sync: {}", e))?;

        // Update day_books / day_book_entries (non-fatal — best effort)
        let _ = upsert_day_book_entry(
            &conn,
            &input.store_id,
            &transaction_id,
            &input.product_id,
            "RECEIPT",
            input.quantity,
            "AVAILABLE",
            input.reference_number.as_deref(),
            input.supplier.as_deref(),
            &now,
        );

        // Return the created transaction
        Ok(InventoryTransaction {
            transaction_id,
            store_id: input.store_id,
            product_id: input.product_id,
            movement_type: "RECEIPT".to_string(),
            stock_bucket: "AVAILABLE".to_string(),
            quantity_delta: input.quantity,
            occurred_at: now.clone(),
            recorded_at: now.clone(),
            user_id: input.user_id,
            device_id: input.device_id,
            reference_number: input.reference_number,
            reason_code: input.supplier,
            transfer_id: None,
            purchase_order_id: None,
            batch_id: None,
            client_sequence: None,
            sync_status: "PENDING".to_string(),
            server_accepted_at: None,
            original_transaction_id: None,
        })
    }

    /// Query current AVAILABLE balance for a product in a store (Section 9.4).
    /// Used by the UI to display and validate against real local stock before committing a sale.
    #[tauri::command]
    pub fn get_stock_balance(store_id: String, product_id: String) -> Result<i32, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let balance: i32 = conn
            .query_row(
                "SELECT COALESCE(quantity, 0) FROM stock_balances WHERE store_id = ?1 AND product_id = ?2 AND stock_bucket = 'AVAILABLE'",
                params![store_id, product_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(balance)
    }

    /// Sell / issue stock from a store (FR-MOV-002, Section 13.2).
    /// Enforces strict-mode negative-stock rejection (FR-MOV-008, Section 21).
    /// On success: inserts SALE transaction, decreases AVAILABLE balance, enqueues outbox event.
    #[tauri::command]
    pub fn sell_stock(input: SellStockInput) -> Result<InventoryTransaction, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Validate inputs
        if input.quantity <= 0 {
            return Err("Quantity must be greater than zero.".to_string());
        }

        // Phase 3 (Task F): a receipt number is compulsory for Sale/Issue.
        // Enforced here (authoritative local write path), in the UI, and
        // server-side in the ingestion pipeline.
        if input.reference_number.as_ref().map_or(true, |s| s.trim().is_empty()) {
            return Err("Receipt number is required for Sale / Issue transactions.".to_string());
        }

        ensure_foreign_keys_exist(&conn, &input.user_id, &input.device_id, &input.store_id, &input.product_id)?;

        // FR-MOV-008 / Section 21 strict-mode negative-stock rejection:
        // Read current AVAILABLE balance before committing.
        let available: i32 = conn
            .query_row(
                "SELECT COALESCE(quantity, 0) FROM stock_balances WHERE store_id = ?1 AND product_id = ?2 AND stock_bucket = 'AVAILABLE'",
                params![input.store_id, input.product_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if input.quantity > available {
            // AT-012: rejection message must show the available quantity.
            return Err(format!(
                "Insufficient stock. Available quantity: {}. Cannot sell {} units.",
                available, input.quantity
            ));
        }

        let transaction_id = generate_id("TX");
        let now = now_iso();
        let quantity_delta = -input.quantity; // SALE is a negative delta

        // Insert SALE transaction (FR-MOV-002, Section 13.2)
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, sync_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                transaction_id,
                input.store_id,
                input.product_id,
                "SALE",
                "AVAILABLE",
                quantity_delta,
                now,
                now,
                input.user_id,
                input.device_id,
                input.reference_number,
                "PENDING"
            ],
        )
        .map_err(|e| format!("Failed to insert inventory transaction: {}", e))?;

        // Decrease stock_balances projection (Section 9.4)
        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?5, updated_at = ?6",
            params![
                format!("SB-{}-{}-AVAILABLE", input.store_id, input.product_id),
                input.store_id,
                input.product_id,
                "AVAILABLE",
                quantity_delta,
                now
            ],
        )
        .map_err(|e| format!("Failed to update stock balance: {}", e))?;

        // Create outbox event (stub — full state machine is Issue 12)
        let outbox_id = generate_id("OB");
        let outbox_event_id = format!("EVT-{}", transaction_id);
        let payload = serde_json::to_string(&serde_json::json!({
            "transaction_id": transaction_id,
            "store_id": input.store_id,
            "product_id": input.product_id,
            "movement_type": "SALE",
            "stock_bucket": "AVAILABLE",
            "quantity_delta": quantity_delta,
            "occurred_at": now,
            "user_id": input.user_id,
            "device_id": input.device_id,
            "reference_number": input.reference_number
        }))
        .map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                outbox_id,
                outbox_event_id,
                "INVENTORY_TRANSACTION",
                payload,
                "PENDING",
                0,
                now
            ],
        )
        .map_err(|e| format!("Failed to queue change for sync: {}", e))?;

        // Update day_books / day_book_entries (non-fatal)
        let _ = upsert_day_book_entry(
            &conn,
            &input.store_id,
            &transaction_id,
            &input.product_id,
            "SALE",
            quantity_delta,
            "AVAILABLE",
            input.reference_number.as_deref(),
            None,
            &now,
        );

        // Return the created transaction
        Ok(InventoryTransaction {
            transaction_id,
            store_id: input.store_id,
            product_id: input.product_id,
            movement_type: "SALE".to_string(),
            stock_bucket: "AVAILABLE".to_string(),
            quantity_delta,
            occurred_at: now.clone(),
            recorded_at: now.clone(),
            user_id: input.user_id,
            device_id: input.device_id,
            reference_number: input.reference_number,
            reason_code: None,
            transfer_id: None,
            purchase_order_id: None,
            batch_id: None,
            client_sequence: None,
            sync_status: "PENDING".to_string(),
            server_accepted_at: None,
            original_transaction_id: None,
        })
    }

    /// Query stock balance for a specific bucket (AVAILABLE, DAMAGED, QUARANTINE).
    #[tauri::command]
    pub fn get_stock_balance_for_bucket(
        store_id: String,
        product_id: String,
        stock_bucket: String,
    ) -> Result<i32, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let balance: i32 = conn
            .query_row(
                "SELECT COALESCE(quantity, 0) FROM stock_balances WHERE store_id = ?1 AND product_id = ?2 AND stock_bucket = ?3",
                params![store_id, product_id, stock_bucket],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(balance)
    }

    /// Return all AVAILABLE stock balances for a given store in a single query.
    ///
    /// Used by the Day Books view to anchor running-balance calculations against the
    /// authoritative stock_balances projection rather than replaying transaction deltas
    /// from zero — which would be wrong if stock was seeded via server sync pulls
    /// (upsert_stock_balance_from_server) without a corresponding local transaction row.
    #[tauri::command]
    pub fn get_stock_balances_for_store(
        store_id: String,
    ) -> Result<Vec<serde_json::Value>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT product_id, quantity FROM stock_balances \
                 WHERE store_id = ?1 AND stock_bucket = 'AVAILABLE'",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let rows = stmt
            .query_map(params![store_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
            })
            .map_err(|e| format!("Failed to query stock balances: {}", e))?;

        let mut balances = Vec::new();
        for row in rows {
            let (product_id, quantity) = row.map_err(|e| format!("Row error: {}", e))?;
            balances.push(serde_json::json!({
                "product_id": product_id,
                "quantity": quantity,
            }));
        }

        Ok(balances)
    }

    /// Process customer or supplier returns (FR-MOV-003, Section 13.3).
    /// - Customer return: increases AVAILABLE, DAMAGED, or QUARANTINE bucket.
    /// - Supplier return: decreases the selected bucket, enforcing strict mode bounds.
    /// Preserves original reference number when linked to a prior transaction.
    #[tauri::command]
    pub fn return_stock(input: ReturnStockInput) -> Result<InventoryTransaction, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        if input.quantity <= 0 {
            return Err("Quantity must be greater than zero.".to_string());
        }

        let return_type_upper = input.return_type.trim().to_uppercase();
        if return_type_upper != "CUSTOMER" && return_type_upper != "SUPPLIER" {
            return Err("Return type must be CUSTOMER or SUPPLIER.".to_string());
        }

        let bucket_upper = input.stock_bucket.trim().to_uppercase();
        if bucket_upper != "AVAILABLE"
            && bucket_upper != "DAMAGED"
            && bucket_upper != "QUARANTINE"
            && bucket_upper != "IN_TRANSIT"
        {
            return Err("Invalid stock bucket condition.".to_string());
        }

        let quantity_delta = if return_type_upper == "CUSTOMER" {
            input.quantity
        } else {
            // SUPPLIER return decreases the bucket
            let current_balance: i32 = conn
                .query_row(
                    "SELECT COALESCE(quantity, 0) FROM stock_balances WHERE store_id = ?1 AND product_id = ?2 AND stock_bucket = ?3",
                    params![input.store_id, input.product_id, bucket_upper],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            if input.quantity > current_balance {
                return Err(format!(
                    "Insufficient stock in {} bucket. Available quantity: {}. Cannot return {} units to supplier.",
                    bucket_upper, current_balance, input.quantity
                ));
            }
            -input.quantity
        };

        let transaction_id = generate_id("TX");
        let now = now_iso();

        ensure_foreign_keys_exist(&conn, &input.user_id, &input.device_id, &input.store_id, &input.product_id)?;

        // Insert RETURN transaction (FR-MOV-003, Section 13.3)
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, sync_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                transaction_id,
                input.store_id,
                input.product_id,
                "RETURN",
                bucket_upper,
                quantity_delta,
                now,
                now,
                input.user_id,
                input.device_id,
                input.reference_number,
                input.reason,
                "PENDING"
            ],
        )
        .map_err(|e| format!("Failed to insert inventory transaction: {}", e))?;

        // Update stock_balances projection (Section 9.4)
        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?5, updated_at = ?6",
            params![
                format!("SB-{}-{}-{}", input.store_id, input.product_id, bucket_upper),
                input.store_id,
                input.product_id,
                bucket_upper,
                quantity_delta,
                now
            ],
        )
        .map_err(|e| format!("Failed to update stock balance: {}", e))?;

        // Create outbox event
        let outbox_id = generate_id("OB");
        let outbox_event_id = format!("EVT-{}", transaction_id);
        let payload = serde_json::to_string(&serde_json::json!({
            "transaction_id": transaction_id,
            "store_id": input.store_id,
            "product_id": input.product_id,
            "movement_type": "RETURN",
            "stock_bucket": bucket_upper,
            "quantity_delta": quantity_delta,
            "occurred_at": now,
            "user_id": input.user_id,
            "device_id": input.device_id,
            "reference_number": input.reference_number,
            "reason_code": input.reason
        }))
        .map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                outbox_id,
                outbox_event_id,
                "INVENTORY_TRANSACTION",
                payload,
                "PENDING",
                0,
                now
            ],
        )
        .map_err(|e| format!("Failed to queue change for sync: {}", e))?;

        // Update day_books / day_book_entries (RETURN is hidden from entries — non-fatal)
        let _ = upsert_day_book_entry(
            &conn,
            &input.store_id,
            &transaction_id,
            &input.product_id,
            "RETURN",
            quantity_delta,
            &bucket_upper,
            input.reference_number.as_deref(),
            input.reason.as_deref(),
            &now,
        );

        Ok(InventoryTransaction {
            transaction_id,
            store_id: input.store_id,
            product_id: input.product_id,
            movement_type: "RETURN".to_string(),
            stock_bucket: bucket_upper,
            quantity_delta,
            occurred_at: now.clone(),
            recorded_at: now.clone(),
            user_id: input.user_id,
            device_id: input.device_id,
            reference_number: input.reference_number,
            reason_code: input.reason,
            transfer_id: None,
            purchase_order_id: None,
            batch_id: None,
            client_sequence: None,
            sync_status: "PENDING".to_string(),
            server_accepted_at: None,
            original_transaction_id: None,
        })
    }

    /// Move stock between buckets (AVAILABLE, DAMAGED, QUARANTINE) with required reason (FR-MOV-005, Section 9.5).
    /// Enforces strict-mode negative-stock prevention on the source bucket.
    /// Inserts two DAMAGE transactions (outflow from source, inflow to destination),
    /// updates stock_balances for both buckets, and enqueues outbox events.
    #[tauri::command]
    pub fn move_stock_bucket(input: MoveStockBucketInput) -> Result<Vec<InventoryTransaction>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        if input.quantity <= 0 {
            return Err("Quantity must be greater than zero.".to_string());
        }

        let reason_clean = input.reason.trim().to_string();
        if reason_clean.is_empty() {
            return Err("Reason is required for damage/quarantine movements.".to_string());
        }

        let from_upper = input.from_bucket.trim().to_uppercase();
        let to_upper = input.to_bucket.trim().to_uppercase();

        let valid_buckets = ["AVAILABLE", "DAMAGED", "QUARANTINE"];
        if !valid_buckets.contains(&from_upper.as_str()) || !valid_buckets.contains(&to_upper.as_str()) {
            return Err("Invalid stock bucket. Must be AVAILABLE, DAMAGED, or QUARANTINE.".to_string());
        }

        if from_upper == to_upper {
            return Err("Source and destination buckets must be different.".to_string());
        }

        // Enforce strict mode balance check on from_bucket
        let current_from_balance: i32 = conn
            .query_row(
                "SELECT COALESCE(quantity, 0) FROM stock_balances WHERE store_id = ?1 AND product_id = ?2 AND stock_bucket = ?3",
                params![input.store_id, input.product_id, from_upper],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if input.quantity > current_from_balance {
            return Err(format!(
                "Insufficient stock in {} bucket. Available quantity: {}. Cannot move {} units.",
                from_upper, current_from_balance, input.quantity
            ));
        }

        let now = now_iso();
        let outflow_tx_id = generate_id("TX");
        let inflow_tx_id = generate_id("TX");

        ensure_foreign_keys_exist(&conn, &input.user_id, &input.device_id, &input.store_id, &input.product_id)?;

        // Insert outflow transaction (-quantity from from_bucket)
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reason_code, sync_status) VALUES (?1, ?2, ?3, 'DAMAGE', ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'PENDING')",
            params![
                outflow_tx_id,
                input.store_id,
                input.product_id,
                from_upper,
                -input.quantity,
                now,
                now,
                input.user_id,
                input.device_id,
                reason_clean,
            ],
        )
        .map_err(|e| format!("Failed to insert outflow inventory transaction: {}", e))?;

        // Insert inflow transaction (+quantity to to_bucket)
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reason_code, sync_status) VALUES (?1, ?2, ?3, 'DAMAGE', ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'PENDING')",
            params![
                inflow_tx_id,
                input.store_id,
                input.product_id,
                to_upper,
                input.quantity,
                now,
                now,
                input.user_id,
                input.device_id,
                reason_clean,
            ],
        )
        .map_err(|e| format!("Failed to insert inflow inventory transaction: {}", e))?;

        // Update stock_balances for from_bucket
        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?5, updated_at = ?6",
            params![
                format!("SB-{}-{}-{}", input.store_id, input.product_id, from_upper),
                input.store_id,
                input.product_id,
                from_upper,
                -input.quantity,
                now
            ],
        )
        .map_err(|e| format!("Failed to update source stock balance: {}", e))?;

        // Update stock_balances for to_bucket
        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?5, updated_at = ?6",
            params![
                format!("SB-{}-{}-{}", input.store_id, input.product_id, to_upper),
                input.store_id,
                input.product_id,
                to_upper,
                input.quantity,
                now
            ],
        )
        .map_err(|e| format!("Failed to update destination stock balance: {}", e))?;

        // Outbox events
        let outbox_id_1 = generate_id("OB");
        let payload_1 = serde_json::to_string(&serde_json::json!({
            "transaction_id": outflow_tx_id,
            "store_id": input.store_id,
            "product_id": input.product_id,
            "movement_type": "DAMAGE",
            "stock_bucket": from_upper,
            "quantity_delta": -input.quantity,
            "occurred_at": now,
            "user_id": input.user_id,
            "device_id": input.device_id,
            "reason_code": reason_clean
        })).map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
            params![outbox_id_1, format!("EVT-{}", outflow_tx_id), payload_1, now],
        )
        .map_err(|e| format!("Failed to queue change for sync: {}", e))?;

        let outbox_id_2 = generate_id("OB");
        let payload_2 = serde_json::to_string(&serde_json::json!({
            "transaction_id": inflow_tx_id,
            "store_id": input.store_id,
            "product_id": input.product_id,
            "movement_type": "DAMAGE",
            "stock_bucket": to_upper,
            "quantity_delta": input.quantity,
            "occurred_at": now,
            "user_id": input.user_id,
            "device_id": input.device_id,
            "reason_code": reason_clean
        })).map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
            params![outbox_id_2, format!("EVT-{}", inflow_tx_id), payload_2, now],
        )
        .map_err(|e| format!("Failed to queue change for sync: {}", e))?;

        // Update day_books closing_balance for both transactions (both DAMAGE = hidden — non-fatal)
        let _ = upsert_day_book_entry(
            &conn, &input.store_id, &outflow_tx_id, &input.product_id,
            "DAMAGE", -input.quantity, &from_upper, None, Some(reason_clean.as_str()), &now,
        );
        let _ = upsert_day_book_entry(
            &conn, &input.store_id, &inflow_tx_id, &input.product_id,
            "DAMAGE", input.quantity, &to_upper, None, Some(reason_clean.as_str()), &now,
        );

        Ok(vec![
            InventoryTransaction {
                transaction_id: outflow_tx_id,
                store_id: input.store_id.clone(),
                product_id: input.product_id.clone(),
                movement_type: "DAMAGE".to_string(),
                stock_bucket: from_upper,
                quantity_delta: -input.quantity,
                occurred_at: now.clone(),
                recorded_at: now.clone(),
                user_id: input.user_id.clone(),
                device_id: input.device_id.clone(),
                reference_number: None,
                reason_code: Some(reason_clean.clone()),
                transfer_id: None,
                purchase_order_id: None,
                batch_id: None,
                client_sequence: None,
                sync_status: "PENDING".to_string(),
                server_accepted_at: None,
                original_transaction_id: None,
            },
            InventoryTransaction {
                transaction_id: inflow_tx_id,
                store_id: input.store_id,
                product_id: input.product_id,
                movement_type: "DAMAGE".to_string(),
                stock_bucket: to_upper,
                quantity_delta: input.quantity,
                occurred_at: now.clone(),
                recorded_at: now.clone(),
                user_id: input.user_id,
                device_id: input.device_id,
                reference_number: None,
                reason_code: Some(reason_clean),
                transfer_id: None,
                purchase_order_id: None,
                batch_id: None,
                client_sequence: None,
                sync_status: "PENDING".to_string(),
                server_accepted_at: None,
                original_transaction_id: None,
            },
        ])
    }

    #[tauri::command]
    pub fn get_transfers() -> Result<Vec<Transfer>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, source_store_id, destination_store_id, product_id, quantity, status, created_by_user_id, notes, created_at, updated_at FROM transfers ORDER BY created_at DESC")
            .map_err(|e| format!("Failed to prepare database query: {}", e))?;

        let trf_iter = stmt
            .query_map([], |row| {
                Ok(Transfer {
                    id: row.get(0)?,
                    source_store_id: row.get(1)?,
                    destination_store_id: row.get(2)?,
                    product_id: row.get(3)?,
                    quantity: row.get(4)?,
                    status: row.get(5)?,
                    created_by_user_id: row.get(6)?,
                    notes: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("Failed to query transfers: {}", e))?;

        let mut transfers = Vec::new();
        for trf in trf_iter {
            let t = trf.map_err(|e| format!("Failed to read transfer record: {}", e))?;
            transfers.push(t);
        }

        Ok(transfers)
    }

    #[tauri::command]
    pub fn get_local_transactions() -> Result<Vec<InventoryTransaction>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, transfer_id, purchase_order_id, batch_id, client_sequence, sync_status, server_accepted_at, original_transaction_id FROM inventory_transactions ORDER BY occurred_at DESC")
            .map_err(|e| format!("Failed to prepare database query: {}", e))?;

        let txn_iter = stmt
            .query_map([], |row| {
                Ok(InventoryTransaction {
                    transaction_id: row.get(0)?,
                    store_id: row.get(1)?,
                    product_id: row.get(2)?,
                    movement_type: row.get(3)?,
                    stock_bucket: row.get(4)?,
                    quantity_delta: row.get(5)?,
                    occurred_at: row.get(6)?,
                    recorded_at: row.get(7)?,
                    user_id: row.get(8)?,
                    device_id: row.get(9)?,
                    reference_number: row.get(10)?,
                    reason_code: row.get(11)?,
                    transfer_id: row.get(12)?,
                    purchase_order_id: row.get(13)?,
                    batch_id: row.get(14)?,
                    client_sequence: row.get(15)?,
                    sync_status: row.get(16)?,
                    server_accepted_at: row.get(17)?,
                    original_transaction_id: row.get(18)?,
                })
            })
            .map_err(|e| format!("Failed to query transactions: {}", e))?;

        let mut transactions = Vec::new();
        for txn in txn_iter {
            let t = txn.map_err(|e| format!("Failed to read transaction record: {}", e))?;
            transactions.push(t);
        }

        Ok(transactions)
    }

    #[tauri::command]
    pub fn create_transfer(input: CreateTransferInput) -> Result<Transfer, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        if input.quantity <= 0 {
            return Err("Quantity must be greater than zero.".to_string());
        }

        if input.source_store_id == input.destination_store_id {
            return Err("Source store and destination store must be different.".to_string());
        }

        let transfer_id = generate_id("TRF");
        let now = now_iso();

        ensure_foreign_keys_exist(&conn, &input.created_by_user_id, "SINGLE-USER-DEVICE", &input.source_store_id, &input.product_id)?;
        ensure_foreign_keys_exist(&conn, &input.created_by_user_id, "SINGLE-USER-DEVICE", &input.destination_store_id, &input.product_id)?;

        conn.execute(
            "INSERT INTO transfers (id, source_store_id, destination_store_id, product_id, quantity, status, created_by_user_id, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                transfer_id,
                input.source_store_id,
                input.destination_store_id,
                input.product_id,
                input.quantity,
                "DRAFT",
                input.created_by_user_id,
                input.notes,
                now,
                now
            ],
        )
        .map_err(|e| format!("Failed to insert transfer into database: {}", e))?;

        Ok(Transfer {
            id: transfer_id,
            source_store_id: input.source_store_id,
            destination_store_id: input.destination_store_id,
            product_id: input.product_id,
            quantity: input.quantity,
            status: "DRAFT".to_string(),
            created_by_user_id: input.created_by_user_id,
            notes: input.notes,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    #[tauri::command]
    pub fn dispatch_transfer(
        transfer_id: String,
        user_id: String,
        device_id: String,
    ) -> Result<Transfer, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, source_store_id, destination_store_id, product_id, quantity, status, created_by_user_id, notes, created_at, updated_at FROM transfers WHERE id = ?1")
            .map_err(|e| format!("Database error: {}", e))?;

        let transfer = stmt
            .query_row(params![transfer_id], |row| {
                Ok(Transfer {
                    id: row.get(0)?,
                    source_store_id: row.get(1)?,
                    destination_store_id: row.get(2)?,
                    product_id: row.get(3)?,
                    quantity: row.get(4)?,
                    status: row.get(5)?,
                    created_by_user_id: row.get(6)?,
                    notes: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|_| format!("Transfer with ID '{}' not found.", transfer_id))?;

        if transfer.status != "DRAFT" {
            return Err(format!(
                "Cannot dispatch transfer in '{}' status. Must be in DRAFT status.",
                transfer.status
            ));
        }

        let available: i32 = conn
            .query_row(
                "SELECT COALESCE(quantity, 0) FROM stock_balances WHERE store_id = ?1 AND product_id = ?2 AND stock_bucket = 'AVAILABLE'",
                params![transfer.source_store_id, transfer.product_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if transfer.quantity > available {
            return Err(format!(
                "Insufficient stock at source store. Available: {}, required: {}.",
                available, transfer.quantity
            ));
        }

        let now = now_iso();
        let quantity_delta = -transfer.quantity;

        ensure_foreign_keys_exist(&conn, &user_id, &device_id, &transfer.source_store_id, &transfer.product_id)?;

        conn.execute(
            "UPDATE transfers SET status = 'DISPATCHED', updated_at = ?1 WHERE id = ?2",
            params![now, transfer_id],
        )
        .map_err(|e| format!("Failed to update transfer status: {}", e))?;

        let tx_id = generate_id("TX");
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, transfer_id, sync_status) VALUES (?1, ?2, ?3, 'TRANSFER_OUT', 'AVAILABLE', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'PENDING')",
            params![
                tx_id,
                transfer.source_store_id,
                transfer.product_id,
                quantity_delta,
                now,
                now,
                user_id,
                device_id,
                format!("TRF-DISP-{}", transfer_id),
                format!("TRANSFER DISPATCH -> Store {}", transfer.destination_store_id),
                transfer_id
            ],
        )
        .map_err(|e| format!("Failed to insert dispatch transaction: {}", e))?;

        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, 'AVAILABLE', ?4, ?5) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?4, updated_at = ?5",
            params![
                format!("SB-{}-{}-AVAILABLE", transfer.source_store_id, transfer.product_id),
                transfer.source_store_id,
                transfer.product_id,
                quantity_delta,
                now
            ],
        )
        .map_err(|e| format!("Failed to update source stock balance: {}", e))?;

        let outbox_id = generate_id("OB");
        let outbox_event_id = format!("EVT-{}", tx_id);
        let payload = serde_json::to_string(&serde_json::json!({
            "transaction_id": tx_id,
            "store_id": transfer.source_store_id,
            "product_id": transfer.product_id,
            "movement_type": "TRANSFER_OUT",
            "stock_bucket": "AVAILABLE",
            "quantity_delta": quantity_delta,
            "occurred_at": now,
            "user_id": user_id,
            "device_id": device_id,
            "transfer_id": transfer_id,
            "reference_number": format!("TRF-DISP-{}", transfer_id)
        }))
        .map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
            params![outbox_id, outbox_event_id, payload, now],
        )
        .map_err(|e| format!("Failed to queue change for sync: {}", e))?;

        Ok(Transfer {
            status: "DISPATCHED".to_string(),
            updated_at: now,
            ..transfer
        })
    }

    #[tauri::command]
    pub fn receive_transfer(
        transfer_id: String,
        user_id: String,
        device_id: String,
    ) -> Result<Transfer, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, source_store_id, destination_store_id, product_id, quantity, status, created_by_user_id, notes, created_at, updated_at FROM transfers WHERE id = ?1")
            .map_err(|e| format!("Database error: {}", e))?;

        let transfer = stmt
            .query_row(params![transfer_id], |row| {
                Ok(Transfer {
                    id: row.get(0)?,
                    source_store_id: row.get(1)?,
                    destination_store_id: row.get(2)?,
                    product_id: row.get(3)?,
                    quantity: row.get(4)?,
                    status: row.get(5)?,
                    created_by_user_id: row.get(6)?,
                    notes: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|_| format!("Transfer with ID '{}' not found.", transfer_id))?;

        if transfer.status != "DISPATCHED" && transfer.status != "EXCEPTION" {
            return Err(format!(
                "Cannot confirm receipt for transfer in '{}' status.",
                transfer.status
            ));
        }

        let now = now_iso();
        let quantity_delta = transfer.quantity;

        ensure_foreign_keys_exist(&conn, &user_id, &device_id, &transfer.destination_store_id, &transfer.product_id)?;

        conn.execute(
            "UPDATE transfers SET status = 'RECEIVED', updated_at = ?1 WHERE id = ?2",
            params![now, transfer_id],
        )
        .map_err(|e| format!("Failed to update transfer status: {}", e))?;

        let tx_id = generate_id("TX");
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, transfer_id, sync_status) VALUES (?1, ?2, ?3, 'TRANSFER_IN', 'AVAILABLE', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'PENDING')",
            params![
                tx_id,
                transfer.destination_store_id,
                transfer.product_id,
                quantity_delta,
                now,
                now,
                user_id,
                device_id,
                format!("TRF-RECV-{}", transfer_id),
                format!("TRANSFER RECEIVE <- Store {}", transfer.source_store_id),
                transfer_id
            ],
        )
        .map_err(|e| format!("Failed to insert receive transaction: {}", e))?;

        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, 'AVAILABLE', ?4, ?5) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?4, updated_at = ?5",
            params![
                format!("SB-{}-{}-AVAILABLE", transfer.destination_store_id, transfer.product_id),
                transfer.destination_store_id,
                transfer.product_id,
                quantity_delta,
                now
            ],
        )
        .map_err(|e| format!("Failed to update destination stock balance: {}", e))?;

        let outbox_id = generate_id("OB");
        let outbox_event_id = format!("EVT-{}", tx_id);
        let payload = serde_json::to_string(&serde_json::json!({
            "transaction_id": tx_id,
            "store_id": transfer.destination_store_id,
            "product_id": transfer.product_id,
            "movement_type": "TRANSFER_IN",
            "stock_bucket": "AVAILABLE",
            "quantity_delta": quantity_delta,
            "occurred_at": now,
            "user_id": user_id,
            "device_id": device_id,
            "transfer_id": transfer_id,
            "reference_number": format!("TRF-RECV-{}", transfer_id)
        }))
        .map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
            params![outbox_id, outbox_event_id, payload, now],
        )
        .map_err(|e| format!("Failed to queue change for sync: {}", e))?;

        Ok(Transfer {
            status: "RECEIVED".to_string(),
            updated_at: now,
            ..transfer
        })
    }

    #[tauri::command]
    pub fn cancel_transfer(
        transfer_id: String,
        user_id: String,
        device_id: String,
    ) -> Result<Transfer, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, source_store_id, destination_store_id, product_id, quantity, status, created_by_user_id, notes, created_at, updated_at FROM transfers WHERE id = ?1")
            .map_err(|e| format!("Database error: {}", e))?;

        let transfer = stmt
            .query_row(params![transfer_id], |row| {
                Ok(Transfer {
                    id: row.get(0)?,
                    source_store_id: row.get(1)?,
                    destination_store_id: row.get(2)?,
                    product_id: row.get(3)?,
                    quantity: row.get(4)?,
                    status: row.get(5)?,
                    created_by_user_id: row.get(6)?,
                    notes: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|_| format!("Transfer with ID '{}' not found.", transfer_id))?;

        if transfer.status == "RECEIVED" || transfer.status == "CANCELLED" {
            return Err(format!(
                "Cannot cancel transfer in terminal status '{}'.",
                transfer.status
            ));
        }

        let now = now_iso();
        ensure_foreign_keys_exist(&conn, &user_id, &device_id, &transfer.source_store_id, &transfer.product_id)?;

        if transfer.status == "DISPATCHED" || transfer.status == "EXCEPTION" {
            let comp_tx_id = generate_id("TX");
            conn.execute(
                "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, transfer_id, sync_status) VALUES (?1, ?2, ?3, 'TRANSFER_OUT', 'AVAILABLE', ?4, ?5, ?6, ?7, ?8, ?9, 'TRANSFER CANCELLED -> Stock Restored', ?10, 'PENDING')",
                params![
                    comp_tx_id,
                    transfer.source_store_id,
                    transfer.product_id,
                    transfer.quantity,
                    now,
                    now,
                    user_id,
                    device_id,
                    format!("TRF-CNCL-{}", transfer_id),
                    transfer_id
                ],
            )
            .map_err(|e| format!("Failed to insert cancellation compensation transaction: {}", e))?;

            conn.execute(
                "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, 'AVAILABLE', ?4, ?5) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?4, updated_at = ?5",
                params![
                    format!("SB-{}-{}-AVAILABLE", transfer.source_store_id, transfer.product_id),
                    transfer.source_store_id,
                    transfer.product_id,
                    transfer.quantity,
                    now
                ],
            )
            .map_err(|e| format!("Failed to restore source stock balance: {}", e))?;

            let outbox_id = generate_id("OB");
            let outbox_event_id = format!("EVT-{}", comp_tx_id);
            let payload = serde_json::to_string(&serde_json::json!({
                "transaction_id": comp_tx_id,
                "store_id": transfer.source_store_id,
                "product_id": transfer.product_id,
                "movement_type": "TRANSFER_OUT",
                "stock_bucket": "AVAILABLE",
                "quantity_delta": transfer.quantity,
                "occurred_at": now,
                "user_id": user_id,
                "device_id": device_id,
                "transfer_id": transfer_id,
                "reference_number": format!("TRF-CNCL-{}", transfer_id)
            }))
            .map_err(|e| format!("Failed to prepare sync data: {}", e))?;

            conn.execute(
                "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
                params![outbox_id, outbox_event_id, payload, now],
            )
            .map_err(|e| format!("Failed to queue change for sync: {}", e))?;
        }

        conn.execute(
            "UPDATE transfers SET status = 'CANCELLED', updated_at = ?1 WHERE id = ?2",
            params![now, transfer_id],
        )
        .map_err(|e| format!("Failed to update transfer status: {}", e))?;

        Ok(Transfer {
            status: "CANCELLED".to_string(),
            updated_at: now,
            ..transfer
        })
    }

    #[tauri::command]
    pub fn mark_transfer_exception(
        transfer_id: String,
        notes: Option<String>,
    ) -> Result<Transfer, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, source_store_id, destination_store_id, product_id, quantity, status, created_by_user_id, notes, created_at, updated_at FROM transfers WHERE id = ?1")
            .map_err(|e| format!("Database error: {}", e))?;

        let transfer = stmt
            .query_row(params![transfer_id], |row| {
                Ok(Transfer {
                    id: row.get(0)?,
                    source_store_id: row.get(1)?,
                    destination_store_id: row.get(2)?,
                    product_id: row.get(3)?,
                    quantity: row.get(4)?,
                    status: row.get(5)?,
                    created_by_user_id: row.get(6)?,
                    notes: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|_| format!("Transfer with ID '{}' not found.", transfer_id))?;

        if transfer.status != "DISPATCHED" {
            return Err(format!(
                "Cannot mark exception for transfer in '{}' status. Must be in DISPATCHED status.",
                transfer.status
            ));
        }

        let now = now_iso();
        let updated_notes = match (transfer.notes.as_deref(), notes.as_deref()) {
            (Some(existing), Some(new_note)) => Some(format!("{}; EXCEPTION: {}", existing, new_note)),
            (None, Some(new_note)) => Some(format!("EXCEPTION: {}", new_note)),
            (Some(existing), None) => Some(existing.to_string()),
            (None, None) => Some("EXCEPTION: Flagged for discrepancy review".to_string()),
        };

        conn.execute(
            "UPDATE transfers SET status = 'EXCEPTION', notes = ?1, updated_at = ?2 WHERE id = ?3",
            params![updated_notes, now, transfer_id],
        )
        .map_err(|e| format!("Failed to update transfer status: {}", e))?;

        Ok(Transfer {
            status: "EXCEPTION".to_string(),
            notes: updated_notes,
            updated_at: now,
            ..transfer
        })
    }

    #[tauri::command]
    pub fn adjust_stock(input: AdjustStockInput) -> Result<InventoryTransaction, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let reason_clean = input.reason.trim().to_string();
        if reason_clean.is_empty() {
            return Err("Adjustment reason is required.".to_string());
        }

        if input.quantity_delta < 0 {
            let mut check_stmt = conn
                .prepare("SELECT quantity FROM stock_balances WHERE store_id = ?1 AND product_id = ?2 AND stock_bucket = 'AVAILABLE'")
                .map_err(|e| format!("Database error checking balance: {}", e))?;

            let current_balance: i32 = check_stmt
                .query_row(params![input.store_id, input.product_id], |r| r.get(0))
                .unwrap_or(0);

            let new_balance = current_balance + input.quantity_delta;
            if new_balance < 0 {
                return Err(format!(
                    "Adjustment would drive stock negative ({}) for store '{}', product '{}'. Cannot apply delta {}.",
                    new_balance, input.store_id, input.product_id, input.quantity_delta
                ));
            }
        }

        let tx_id = generate_id("TX-ADJ");
        let now = now_iso();
        let ref_num = input.count_reference.or_else(|| Some(format!("COUNT-ADJ-{}", now)));

        ensure_foreign_keys_exist(&conn, &input.user_id, &input.device_id, &input.store_id, &input.product_id)?;

        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, sync_status) VALUES (?1, ?2, ?3, 'ADJUSTMENT', 'AVAILABLE', ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'PENDING')",
            params![
                tx_id,
                input.store_id,
                input.product_id,
                input.quantity_delta,
                now,
                now,
                input.user_id,
                input.device_id,
                ref_num,
                reason_clean,
            ],
        )
        .map_err(|e| format!("Failed to insert adjustment transaction: {}", e))?;

        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) VALUES (?1, ?2, ?3, 'AVAILABLE', ?4, ?5) ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = quantity + ?4, updated_at = ?5",
            params![
                format!("SB-{}-{}-AVAILABLE", input.store_id, input.product_id),
                input.store_id,
                input.product_id,
                input.quantity_delta,
                now
            ],
        )
        .map_err(|e| format!("Failed to update stock balance: {}", e))?;

        let outbox_id = generate_id("OB");
        let outbox_event_id = format!("EVT-{}", tx_id);
        let payload = serde_json::to_string(&serde_json::json!({
            "transaction_id": tx_id,
            "store_id": input.store_id,
            "product_id": input.product_id,
            "movement_type": "ADJUSTMENT",
            "stock_bucket": "AVAILABLE",
            "quantity_delta": input.quantity_delta,
            "occurred_at": now,
            "user_id": input.user_id,
            "device_id": input.device_id,
            "reason_code": reason_clean,
            "reference_number": ref_num
        })).map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
            params![outbox_id, outbox_event_id, payload, now],
        )
        .map_err(|e| format!("Failed to queue change for sync: {}", e))?;

        // Update day_books / day_book_entries (ADJUSTMENT is hidden from entries
        // but closing_balance is still updated — non-fatal)
        let _ = upsert_day_book_entry(
            &conn,
            &input.store_id,
            &tx_id,
            &input.product_id,
            "ADJUSTMENT",
            input.quantity_delta,
            "AVAILABLE",
            ref_num.as_deref(),
            Some(reason_clean.as_str()),
            &now,
        );

        Ok(InventoryTransaction {
            transaction_id: tx_id,
            store_id: input.store_id,
            product_id: input.product_id,
            movement_type: "ADJUSTMENT".to_string(),
            stock_bucket: "AVAILABLE".to_string(),
            quantity_delta: input.quantity_delta,
            occurred_at: now.clone(),
            recorded_at: now,
            user_id: input.user_id,
            device_id: input.device_id,
            reference_number: ref_num,
            reason_code: Some(reason_clean),
            transfer_id: None,
            purchase_order_id: None,
            batch_id: None,
            client_sequence: None,
            sync_status: "PENDING".to_string(),
            server_accepted_at: None,
            original_transaction_id: None,
        })
    }

    /// Update an existing inventory transaction (row-level edit from LinearGridEntry).
    ///
    /// Updates the quantity_delta and reference fields in inventory_transactions,
    /// patches the stock_balances projection with the delta difference, and
    /// resets the existing outbox event to PENDING so the next sync push
    /// re-pushes the updated payload.  No new row is inserted.
    ///
    /// The server-side ingestion service handles the same transaction_id with
    /// a different quantity_delta by applying an in-place UPDATE (see
    /// ingestion.py _ingest_transaction_impl).
    #[tauri::command]
    pub fn update_transaction(input: UpdateTransactionInput) -> Result<InventoryTransaction, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let now = now_iso();

        // Read the existing transaction to get context we won't let the UI override
        let old: (i32, String, String, String, String, String, String, String) = conn
            .query_row(
                "SELECT quantity_delta, store_id, product_id, stock_bucket, \
                 movement_type, user_id, device_id, sync_status \
                 FROM inventory_transactions WHERE transaction_id = ?1",
                params![input.transaction_id],
                |row| {
                    Ok((
                        row.get::<_, i32>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                    ))
                },
            )
            .map_err(|e| {
                if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                    format!("Transaction '{}' not found.", input.transaction_id)
                } else {
                    format!("Failed to query transaction: {}", e)
                }
            })?;

        let (old_delta, store_id, product_id, stock_bucket, movement_type, user_id, device_id, _sync_status) = old;
        let delta_diff = input.quantity_delta - old_delta;

        // Phase 3 (Task F): a receipt number is compulsory for Sale/Issue.
        // Applies to row edits too — a SALE line cannot be committed without one.
        if movement_type == "SALE"
            && input.reference_number.as_ref().map_or(true, |s| s.trim().is_empty())
        {
            return Err("Receipt number is required for Sale / Issue transactions.".to_string());
        }

        // Update the transaction row (only mutable fields)
        conn.execute(
            "UPDATE inventory_transactions \
             SET quantity_delta = ?1, reference_number = ?2, reason_code = ?3 \
             WHERE transaction_id = ?4",
            params![
                input.quantity_delta,
                input.reference_number,
                input.reason_code,
                input.transaction_id,
            ],
        )
        .map_err(|e| format!("Failed to update transaction: {}", e))?;

        // Patch stock_balances with the delta difference
        if delta_diff != 0 {
            conn.execute(
                "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
                 ON CONFLICT(store_id, product_id, stock_bucket) \
                 DO UPDATE SET quantity = quantity + ?5, updated_at = ?6",
                params![
                    format!("SB-{}-{}-{}", store_id, product_id, stock_bucket),
                    store_id,
                    product_id,
                    stock_bucket,
                    delta_diff,
                    now,
                ],
            )
            .map_err(|e| format!("Failed to update stock balance: {}", e))?;
        }

        // Reset the existing outbox event to PENDING and update its payload
        // so the next sync push will re-push the updated payload.
        let outbox_event_id = format!("EVT-{}", input.transaction_id);
        let payload = serde_json::to_string(&serde_json::json!({
            "transaction_id": input.transaction_id,
            "store_id": store_id,
            "product_id": product_id,
            "movement_type": movement_type,
            "stock_bucket": stock_bucket,
            "quantity_delta": input.quantity_delta,
            "occurred_at": now,
            "user_id": user_id,
            "device_id": device_id,
            "reference_number": input.reference_number,
            "reason_code": input.reason_code,
        }))
        .map_err(|e| format!("Failed to prepare sync data: {}", e))?;

        conn.execute(
            "UPDATE outbox_events \
             SET payload = ?1, status = 'PENDING', retry_count = 0, last_error = NULL \
             WHERE event_id = ?2",
            params![payload, outbox_event_id],
        )
        .map_err(|e| format!("Failed to update queued change: {}", e))?;

        // Update day_books / day_book_entries to reflect the edit (non-fatal)
        let _ = upsert_day_book_entry(
            &conn,
            &store_id,
            &input.transaction_id,
            &product_id,
            &movement_type,
            input.quantity_delta,
            &stock_bucket,
            input.reference_number.as_deref(),
            input.reason_code.as_deref(),
            &now,
        );

        // Return the updated transaction
        Ok(InventoryTransaction {
            transaction_id: input.transaction_id.clone(),
            store_id,
            product_id,
            movement_type,
            stock_bucket,
            quantity_delta: input.quantity_delta,
            occurred_at: now.clone(),
            recorded_at: now.clone(),
            user_id,
            device_id,
            reference_number: input.reference_number,
            reason_code: input.reason_code,
            transfer_id: None,
            purchase_order_id: None,
            batch_id: None,
            client_sequence: None,
            sync_status: "PENDING".to_string(),
            server_accepted_at: None,
            original_transaction_id: None,
        })
    }

    /// Delete an existing inventory transaction (row-level delete from LinearGridEntry).
    ///
    /// Reads the existing transaction, reverses the stock_balances delta, deletes
    /// the inventory_transactions row, and handles the outbox event:
    /// - If the transaction was NOT yet synced (PENDING): mark the outbox event
    ///   as PERMANENT_REJECTION so it is never pushed.
    /// - If the transaction was already SYNCED/ACCEPTED: insert a new tombstone
    ///   outbox event with a compensating movement (opposite delta) so the
    ///   server receives a reversal and zeroes the effect.
    #[tauri::command]
    pub fn delete_transaction(transaction_id: String) -> Result<(), String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let now = now_iso();

        // Read the existing transaction
        let transaction = match conn.query_row(
            "SELECT quantity_delta, store_id, product_id, stock_bucket, \
             movement_type, sync_status, user_id, device_id \
             FROM inventory_transactions WHERE transaction_id = ?1",
            params![transaction_id],
            |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        ) {
            Ok(val) => val,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Transaction already removed from local SQLite — idempotent success
                return Ok(());
            }
            Err(e) => return Err(format!("Failed to query transaction: {}", e)),
        };

        let (quantity_delta, store_id, product_id, stock_bucket, movement_type, sync_status, user_id, device_id) = transaction;
        let outbox_event_id = format!("EVT-{}", transaction_id);

        // Reverse the stock_balances delta (add the negative of the original delta)
        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(store_id, product_id, stock_bucket) \
             DO UPDATE SET quantity = quantity + ?5, updated_at = ?6",
            params![
                format!("SB-{}-{}-{}", store_id, product_id, stock_bucket),
                store_id,
                product_id,
                stock_bucket,
                -quantity_delta,
                now,
            ],
        )
        .map_err(|e| format!("Failed to reverse stock balance: {}", e))?;

        conn.execute(
            "DELETE FROM day_book_entries WHERE transaction_id = ?1",
            params![transaction_id],
        )
        .map_err(|e| format!("Failed to delete day-book entries: {}", e))?;

        // Delete the transaction row
        conn.execute(
            "DELETE FROM inventory_transactions WHERE transaction_id = ?1",
            params![transaction_id],
        )
        .map_err(|e| format!("Failed to delete transaction: {}", e))?;

        // Handle the outbox event based on sync status
        let is_synced = sync_status == "SYNCED" || sync_status == "ACCEPTED";
        if is_synced {
            // Transaction was already on the server — push a compensating reversal.
            // movement_type: SALE delta < 0 → reverse with RECEIPT; RECEIPT delta > 0 → reverse with SALE.
            let void_movement_type = if quantity_delta < 0 { "RECEIPT" } else { "SALE" };
            let void_delta = -quantity_delta;
            let void_event_id = format!("EVT-VOID-{}", transaction_id);
            let payload = serde_json::to_string(&serde_json::json!({
                "transaction_id": transaction_id,
                "store_id": store_id,
                "product_id": product_id,
                "movement_type": void_movement_type,
                "stock_bucket": stock_bucket,
                "quantity_delta": void_delta,
                "occurred_at": now,
                "user_id": user_id,
                "device_id": device_id,
                "reference_number": null,
                "reason_code": format!("Reversal of deleted transaction {} ({})", transaction_id, movement_type),
            }))
            .map_err(|e| format!("Failed to serialize void payload: {}", e))?;

            conn.execute(
                "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) \
                 VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
                params![generate_id("OB"), void_event_id, payload, now],
            )
            .map_err(|e| format!("Failed to queue tombstone change for sync: {}", e))?;
        } else {
            // Transaction not yet synced — permanently reject so it is never pushed.
            conn.execute(
                "UPDATE outbox_events \
                 SET status = 'PERMANENT_REJECTION', \
                     last_error = 'Transaction deleted locally before sync' \
                 WHERE event_id = ?1",
                params![outbox_event_id],
            )
            .map_err(|e| format!("Failed to update queued change status: {}", e))?;
        }

        // Recompute closing_balance on the day_books row for this store+date (non-fatal)
        let book_date = &now[..10];
        let day_book_id_candidate = format!("DB-{}-{}", store_id, book_date);
        let closing: i32 = conn
            .query_row(
                "SELECT COALESCE(SUM(quantity), 0) FROM stock_balances \
                 WHERE store_id = ?1 AND stock_bucket = 'AVAILABLE'",
                params![store_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let _ = conn.execute(
            "UPDATE day_books SET closing_balance = ?1, updated_at = ?2 WHERE id = ?3",
            params![closing, now, day_book_id_candidate],
        );

        Ok(())
    }

    #[tauri::command]
    pub fn save_pdf_file(filename: String, bytes: Vec<u8>) -> Result<String, String> {
        use std::fs;
        use std::path::PathBuf;

        let base_dir = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."));

        let downloads_dir = base_dir.join("Downloads");
        let target_dir = if downloads_dir.exists() {
            downloads_dir
        } else {
            base_dir
        };

        let target_path = target_dir.join(&filename);

        fs::write(&target_path, &bytes)
            .map_err(|e| format!("Failed to write file to {}: {}", target_path.display(), e))?;

        let path_str = target_path.to_string_lossy().to_string();

        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("explorer.exe")
                .args(["/select,", &path_str])
                .spawn();
        }

        Ok(path_str)
    }

    #[tauri::command]
    pub fn get_pending_outbox_count() -> Result<i32, String> {
        println!("[TAURI-SYNC] get_pending_outbox_count called");
        
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let _ = ensure_schema_tables(&conn);

        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM outbox_events WHERE status IN ('PENDING', 'SENDING', 'RETRYABLE_ERROR')")
            .map_err(|e| format!("Database error counting pending changes: {}", e))?;

        let count: i32 = stmt
            .query_row([], |row| row.get(0))
            .map_err(|e| format!("Failed to query pending sync count: {}", e))?;

        println!("[TAURI-SYNC] get_pending_outbox_count returning: {}", count);
        Ok(count)
    }

    // -----------------------------------------------------------------------
    // Sync commands — Issue 15
    // -----------------------------------------------------------------------

    /// Return pending outbox events ready for push (PENDING or RETRYABLE_ERROR
    /// with a past or null next_attempt_at), ordered by created_at ASC.
    /// The sync worker reads these, posts them to /api/v1/sync/push, then calls
    /// update_outbox_event_status to advance each event's state.
    #[tauri::command]
    pub fn get_pending_outbox_events(
        limit: Option<i32>,
        force: Option<bool>,
    ) -> Result<Vec<serde_json::Value>, String> {
        println!("[TAURI-SYNC] get_pending_outbox_events called with limit: {:?}, force: {:?}", limit, force);
        
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let batch_limit = limit.unwrap_or(100).max(1).min(500);
        let force_sync = force.unwrap_or(false);
        let now = now_iso();
        
        println!("[TAURI-SYNC] batch_limit: {}, force_sync: {}, now: {}", batch_limit, force_sync, now);

        // 1. Revert any orphaned events left stuck in 'SENDING' or 'PERMANENT_REJECTION' back to 'PENDING'
        if force_sync {
            conn.execute(
                "UPDATE outbox_events SET status = 'PENDING' WHERE status IN ('SENDING', 'PERMANENT_REJECTION')",
                [],
            )
            .map_err(|e| format!("Failed to reset pending changes: {}", e))?;
            conn.execute(
                "UPDATE outbox_events SET next_attempt_at = NULL WHERE status = 'RETRYABLE_ERROR'",
                [],
            )
            .map_err(|e| format!("Failed to reset retry backoff: {}", e))?;
        } else {
            conn.execute(
                "UPDATE outbox_events SET status = 'PENDING' WHERE status = 'SENDING'",
                [],
            )
            .map_err(|e| format!("Failed to reset syncing changes: {}", e))?;
        }

        // 1b. Repair legacy outbox events that used movement_type "TRANSFER"
        //     (invalid on server; should be TRANSFER_OUT or TRANSFER_IN).
        //     Rewrites the stored JSON payload and the corresponding
        //     inventory_transactions row so the next push succeeds.
        if force_sync {
            let mut repair_stmt = conn
                .prepare("SELECT id, event_id, payload FROM outbox_events WHERE event_type = 'INVENTORY_TRANSACTION'")
                .map_err(|e| format!("Database error preparing repair query: {}", e))?;
            let repair_rows: Vec<(String, String, String)> = repair_stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
                .map_err(|e| format!("Failed to query outbox for repair: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            drop(repair_stmt);

            for (oe_id, _oe_event_id, payload_str) in repair_rows {
                let parsed: serde_json::Value = match serde_json::from_str(&payload_str) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let mt = match parsed.get("movement_type").and_then(|v| v.as_str()) {
                    Some(s) => s,
                    None => continue,
                };
                if mt != "TRANSFER" {
                    continue;
                }
                // Determine correct type from reference_number prefix
                let ref_num = parsed.get("reference_number").and_then(|v| v.as_str()).unwrap_or("");
                let delta = parsed.get("quantity_delta").and_then(|v| v.as_i64()).unwrap_or(0);
                let new_mt = if ref_num.starts_with("TRF-RECV-") {
                    "TRANSFER_IN"
                } else if ref_num.starts_with("TRF-DISP-") || ref_num.starts_with("TRF-CNCL-") {
                    "TRANSFER_OUT"
                } else if delta < 0 {
                    "TRANSFER_OUT"
                } else {
                    "TRANSFER_IN"
                };

                // Rewrite the outbox payload JSON
                if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&payload_str) {
                    if let Some(obj) = val.as_object_mut() {
                        obj.insert("movement_type".to_string(), serde_json::Value::String(new_mt.to_string()));
                        if let Ok(new_payload) = serde_json::to_string(&val) {
                            conn.execute(
                                "UPDATE outbox_events SET payload = ?1 WHERE id = ?2",
                                params![new_payload, oe_id],
                            ).ok();
                        }
                    }
                }

                // Also fix the local inventory_transactions row so the ledger is consistent
                if let Some(tx_id) = parsed.get("transaction_id").and_then(|v| v.as_str()) {
                    conn.execute(
                        "UPDATE inventory_transactions SET movement_type = ?1 WHERE transaction_id = ?2",
                        params![new_mt, tx_id],
                    ).ok();
                }
            }
        }

        let mut stmt = conn
            .prepare(
                "SELECT id, event_id, event_type, payload, status, retry_count, \
                 next_attempt_at, created_at, last_error \
                 FROM outbox_events \
                 WHERE status = 'PENDING' \
                    OR (status = 'RETRYABLE_ERROR' \
                        AND (next_attempt_at IS NULL OR next_attempt_at <= ?1)) \
                 ORDER BY created_at ASC \
                 LIMIT ?2",
            )
            .map_err(|e| format!("Database error preparing sync queue query: {}", e))?;

        let rows = stmt
            .query_map(params![now, batch_limit], |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "event_id": row.get::<_, String>(1)?,
                    "event_type": row.get::<_, String>(2)?,
                    "payload": row.get::<_, String>(3)?,
                    "status": row.get::<_, String>(4)?,
                    "retry_count": row.get::<_, i32>(5)?,
                    "next_attempt_at": row.get::<_, Option<String>>(6)?,
                    "created_at": row.get::<_, String>(7)?,
                    "last_error": row.get::<_, Option<String>>(8)?
                }))
            })
            .map_err(|e| format!("Failed to query pending changes: {}", e))?;

        let mut events = Vec::new();
        for row in rows {
            events.push(row.map_err(|e| format!("Failed to read outbox row: {}", e))?);
        }
        Ok(events)
    }

    /// Transition an outbox event to a new status.
    ///
    /// Valid target_status values:
    ///   "SENDING"            — optimistic lock before HTTP call
    ///   "ACCEPTED"           — server returned accepted receipt
    ///   "SYNCED"             — final settled state
    ///   "RETRYABLE_ERROR"    — transient error; backoff applied
    ///   "PERMANENT_REJECTION"— server rejected with 4xx validation error
    ///
    /// For RETRYABLE_ERROR the retry_count is incremented and next_attempt_at
    /// is calculated with exponential backoff: base 5 s * 2^retry_count,
    /// capped at 3600 s (SYNC-011).
    #[tauri::command]
    pub fn update_outbox_event_status(
        event_id: String,
        target_status: String,
        error_msg: Option<String>,
    ) -> Result<(), String> {
        println!("[TAURI-SYNC] update_outbox_event_status called: event_id={}, target_status={}, error_msg={:?}", 
                 event_id, target_status, error_msg);
        
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Read current retry_count
        let (current_retry, _current_status): (i32, String) = conn
            .query_row(
                "SELECT retry_count, status FROM outbox_events WHERE event_id = ?1",
                params![event_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| format!("Outbox event '{}' not found.", event_id))?;

        match target_status.as_str() {
            "RETRYABLE_ERROR" => {
                // Increment retry_count and calculate exponential backoff
                let new_retry = current_retry + 1;
                // base 5 s * 2^(new_retry - 1), capped at 3600 s
                let delay_secs: i64 = (5_i64 * 2_i64.pow((new_retry - 1).max(0) as u32)).min(3600);
                // next_attempt_at = now + delay (simple ISO offset approach: store as epoch nanos)
                // We store as an ISO 8601 string offset by delay seconds.
                // rusqlite doesn't have datetime arithmetic, so we compute in Rust.
                let delay = std::time::Duration::from_secs(delay_secs as u64);
                let next_attempt: chrono::DateTime<Utc> = Utc::now() + chrono::Duration::from_std(delay)
                    .unwrap_or(chrono::Duration::seconds(3600));
                let next_attempt_str = next_attempt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

                conn.execute(
                    "UPDATE outbox_events SET status = ?1, retry_count = ?2, \
                     next_attempt_at = ?3, last_error = ?4 \
                     WHERE event_id = ?5",
                    params![
                        target_status,
                        new_retry,
                        next_attempt_str,
                        error_msg,
                        event_id
                    ],
                )
                .map_err(|e| format!("Failed to update queued change: {}", e))?;
            }
            "ACCEPTED" | "SYNCED" => {
                conn.execute(
                    "UPDATE outbox_events SET status = ?1, last_error = NULL, \
                     next_attempt_at = NULL \
                     WHERE event_id = ?2",
                    params![target_status, event_id],
                )
                .map_err(|e| format!("Failed to update queued change: {}", e))?;
            }
            "PERMANENT_REJECTION" | "EXCEPTION_REVIEW" => {
                conn.execute(
                    "UPDATE outbox_events SET status = ?1, last_error = ?2 \
                     WHERE event_id = ?3",
                    params![target_status, error_msg, event_id],
                )
                .map_err(|e| format!("Failed to update queued change: {}", e))?;
            }
            _ => {
                // SENDING or other status — just update the status field
                conn.execute(
                    "UPDATE outbox_events SET status = ?1 WHERE event_id = ?2",
                    params![target_status, event_id],
                )
                .map_err(|e| format!("Failed to update queued change: {}", e))?;
            }
        }

        Ok(())
    }

    /// Update the sync_status (and optionally server_accepted_at) on an
    /// inventory_transactions row after a successful push acknowledgement.
    ///
    /// If the row no longer exists (e.g. the transaction was deleted locally
    /// and replaced by a compensating void event), this is treated as a
    /// successful no-op instead of an error — the void event carries the
    /// deletion to the server and there is nothing left to mark on this side.
    #[tauri::command]
    pub fn update_transaction_sync_status(
        transaction_id: String,
        sync_status: String,
        server_accepted_at: Option<String>,
    ) -> Result<(), String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        match server_accepted_at {
            Some(ref ts) => conn.execute(
                "UPDATE inventory_transactions SET sync_status = ?1, server_accepted_at = ?2 \
                 WHERE transaction_id = ?3",
                params![sync_status, ts, transaction_id],
            ),
            None => conn.execute(
                "UPDATE inventory_transactions SET sync_status = ?1 \
                 WHERE transaction_id = ?2",
                params![sync_status, transaction_id],
            ),
        }
        .map_err(|e| format!("Failed to update transaction sync status: {}", e))?;

        // Rows that were deleted locally (delete_transaction) simply don't exist
        // anymore — that's expected and not an error.
        Ok(())
    }

    /// Batch transition outbox events to new statuses (called once per push
    /// batch instead of per-event).  Accepts the full receipt outcome list the
    /// sync service builds after an HTTP push.  Mirrors the per-event semantics
    /// of `update_outbox_event_status` — including retry backoff for
    /// RETRYABLE_ERROR — but commits once.
    #[tauri::command]
    pub fn update_outbox_event_statuses(
        updates: Vec<serde_json::Value>,
    ) -> Result<(), String> {
        let db_path = get_db_path();
        let mut conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to begin outbox status transaction: {}", e))?;

        for u in &updates {
            let event_id: String = u
                .get("event_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Missing event_id in outbox status update: {:?}", u))?;
            let target_status: String = u
                .get("target_status")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Missing target_status in outbox status update: {:?}", u))?;
            let error_msg: Option<String> = u
                .get("error_msg")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let (current_retry,): (i32,) = tx
                .query_row(
                    "SELECT retry_count FROM outbox_events WHERE event_id = ?1",
                    params![event_id],
                    |row| Ok((row.get(0)?,)),
                )
                .map_err(|_| format!("Outbox event '{}' not found.", event_id))?;

            match target_status.as_str() {
                "RETRYABLE_ERROR" => {
                    let new_retry = current_retry + 1;
                    let delay_secs: i64 =
                        (5_i64 * 2_i64.pow((new_retry - 1).max(0) as u32)).min(3600);
                    let delay = std::time::Duration::from_secs(delay_secs as u64);
                    let next_attempt: chrono::DateTime<Utc> =
                        Utc::now() + chrono::Duration::from_std(delay)
                            .unwrap_or(chrono::Duration::seconds(3600));
                    let next_attempt_str =
                        next_attempt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

                    tx.execute(
                        "UPDATE outbox_events SET status = ?1, retry_count = ?2, \
                         next_attempt_at = ?3, last_error = ?4 \
                         WHERE event_id = ?5",
                        params![target_status, new_retry, next_attempt_str, error_msg, event_id],
                    )
                    .map_err(|e| format!("Failed to update queued change: {}", e))?;
                }
                "ACCEPTED" | "SYNCED" => {
                    tx.execute(
                        "UPDATE outbox_events SET status = ?1, last_error = NULL, \
                         next_attempt_at = NULL \
                         WHERE event_id = ?2",
                        params![target_status, event_id],
                    )
                    .map_err(|e| format!("Failed to update queued change: {}", e))?;
                }
                "PERMANENT_REJECTION" | "EXCEPTION_REVIEW" => {
                    tx.execute(
                        "UPDATE outbox_events SET status = ?1, last_error = ?2 \
                         WHERE event_id = ?3",
                        params![target_status, error_msg, event_id],
                    )
                    .map_err(|e| format!("Failed to update queued change: {}", e))?;
                }
                _ => {
                    tx.execute(
                        "UPDATE outbox_events SET status = ?1 WHERE event_id = ?2",
                        params![target_status, event_id],
                    )
                    .map_err(|e| format!("Failed to update queued change: {}", e))?;
                }
            }
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit outbox status transaction: {}", e))?;
        Ok(())
    }

    /// Batch-update sync_status on inventory_transactions rows after a push
    /// batch (mirrors `update_transaction_sync_status` per-event but commits
    /// once).
    #[tauri::command]
    pub fn update_transaction_sync_statuses(
        updates: Vec<serde_json::Value>,
    ) -> Result<(), String> {
        let db_path = get_db_path();
        let mut conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to begin transaction status transaction: {}", e))?;

        for u in &updates {
            let transaction_id: String = u
                .get("transaction_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| {
                    format!("Missing transaction_id in status update: {:?}", u)
                })?;
            let sync_status: String = u
                .get("sync_status")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Missing sync_status in status update: {:?}", u))?;
            let server_accepted_at: Option<String> = u
                .get("server_accepted_at")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            match server_accepted_at {
                Some(ref ts) => {
                    tx.execute(
                        "UPDATE inventory_transactions SET sync_status = ?1, server_accepted_at = ?2 \
                         WHERE transaction_id = ?3",
                        params![sync_status, ts, transaction_id],
                    )
                    .map_err(|e| format!("Failed to update transaction sync status: {}", e))?;
                }
                None => {
                    tx.execute(
                        "UPDATE inventory_transactions SET sync_status = ?1 \
                         WHERE transaction_id = ?2",
                        params![sync_status, transaction_id],
                    )
                    .map_err(|e| format!("Failed to update transaction sync status: {}", e))?;
                }
            }
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit transaction status transaction: {}", e))?;
        Ok(())
    }

    /// Read the stored last-successful-sync timestamp (SYNC-009).
    /// Returns null if no sync has completed yet.
    #[tauri::command]
    pub fn get_last_sync_timestamp() -> Result<Option<String>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Ensure the kv_store table exists and has updated_at column
        ensure_kv_store_table(&conn)?;

        let result: Option<String> = conn
            .query_row(
                "SELECT value FROM kv_store WHERE key = 'last_sync_at'",
                [],
                |row| row.get(0),
            )
            .ok();

        Ok(result)
    }

    /// Returns true if a product name/sku looks like a server-side auto-provisioned
    /// placeholder (created when a transaction references an unknown product_id).
    fn is_placeholder_product(sku: &str, name: &str) -> bool {
        (sku.starts_with("OFFLINE-") || sku.starts_with("AUTO-"))
            && (name.starts_with("OFFLINE-PROD-") || name.starts_with("Offline Item ("))
    }

    /// Upsert a product from server data (INSERT ... ON CONFLICT DO UPDATE).
    ///
    /// If the incoming server record is an auto-provisioned placeholder
    /// (sku starts with "OFFLINE-" or "AUTO-") and the local row already has
    /// a real name, the local name/sku/brand/model/category/unit are preserved.
    /// Only non-placeholder server data overwrites local data.
    #[tauri::command]
    pub fn upsert_product_from_server(product: Product) -> Result<Product, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let incoming_is_placeholder = is_placeholder_product(&product.sku, &product.name);

        if incoming_is_placeholder {
            // Check whether the local row already has a real (non-placeholder) name.
            let local_is_placeholder: bool = conn
                .query_row(
                    "SELECT sku, name FROM products WHERE id = ?1",
                    params![product.id],
                    |row| {
                        let sku: String = row.get(0)?;
                        let name: String = row.get(1)?;
                        Ok(is_placeholder_product(&sku, &name))
                    },
                )
                .unwrap_or(true); // If row doesn't exist yet, treat as placeholder (will insert)

            if !local_is_placeholder {
                // Local product has a real name — do not overwrite it with the placeholder.
                // Only update is_active and updated_at (structural/status fields).
                conn.execute(
                    "UPDATE products SET is_active = ?1, updated_at = ?2 WHERE id = ?3",
                    params![
                        if product.is_active { 1 } else { 0 },
                        product.updated_at,
                        product.id,
                    ],
                )
                .map_err(|e| format!("Failed to update product status: {}", e))?;
                return Ok(product);
            }
            // Both are placeholders — fall through to normal upsert so at least the
            // row exists with an ID the FK constraints need.
        }

        // Normal full upsert: server data is real, or both are placeholders (insert path).
        conn.execute(
            "INSERT INTO products (id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, low_stock_threshold, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
             ON CONFLICT(id) DO UPDATE SET \
             sku = excluded.sku, \
             name = excluded.name, \
             brand = excluded.brand, \
             model = excluded.model, \
             category = excluded.category, \
             unit = excluded.unit, \
             barcode = excluded.barcode, \
             alternate_names = excluded.alternate_names, \
             serial_tracking_enabled = excluded.serial_tracking_enabled, \
             is_active = excluded.is_active, \
             low_stock_threshold = excluded.low_stock_threshold, \
             updated_at = excluded.updated_at",
            params![
                product.id,
                product.sku,
                product.name,
                product.brand,
                product.model,
                product.category,
                product.unit,
                product.barcode,
                product.alternate_names,
                if product.serial_tracking_enabled { 1 } else { 0 },
                if product.is_active { 1 } else { 0 },
                product.low_stock_threshold,
                product.created_at,
                product.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to upsert product: {}", e))?;

        Ok(product)
    }

    /// Upsert a store from server data (INSERT ... ON CONFLICT DO UPDATE).
    /// Upsert a store from server data (INSERT ... ON CONFLICT DO UPDATE).
    ///
    /// If the incoming server record is an auto-provisioned placeholder
    /// (name starts with "Auto Store (") and the local row already has a real
    /// name, the local name/address/code are preserved so user renames and
    /// locally created store names are never clobbered by the pull loop.
    #[tauri::command]
    pub fn upsert_store_from_server(store: Store) -> Result<Store, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let incoming_is_placeholder = store.name.starts_with("Auto Store (");

        if incoming_is_placeholder {
            // Check whether the local row already has a real (non-placeholder) name.
            let local_is_placeholder: bool = conn
                .query_row(
                    "SELECT name FROM stores WHERE id = ?1",
                    params![store.id],
                    |row| {
                        let name: String = row.get(0)?;
                        Ok(name.starts_with("Auto Store ("))
                    },
                )
                .unwrap_or(true); // If the row doesn't exist yet, treat as placeholder (will insert)

            if !local_is_placeholder {
                // Local store has a real name — do not overwrite it with the
                // placeholder. Only update is_active and updated_at.
                conn.execute(
                    "UPDATE stores SET is_active = ?1, updated_at = ?2 WHERE id = ?3",
                    params![
                        if store.is_active { 1 } else { 0 },
                        store.updated_at,
                        store.id,
                    ],
                )
                .map_err(|e| format!("Failed to update store status: {}", e))?;
                return Ok(store);
            }
            // Both are placeholders — fall through to normal upsert so at least the
            // row exists with an ID the FK constraints need.
        }

        conn.execute(
            "INSERT INTO stores (id, code, name, address, is_active, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(id) DO UPDATE SET \
             code = excluded.code, \
             name = excluded.name, \
             address = excluded.address, \
             is_active = excluded.is_active, \
             updated_at = excluded.updated_at",
            params![
                store.id,
                store.code,
                store.name,
                store.address,
                if store.is_active { 1 } else { 0 },
                store.created_at,
                store.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to upsert store: {}", e))?;

        Ok(store)
    }

    /// Upsert a stock balance row from server data (INSERT ... ON CONFLICT DO UPDATE).
    #[derive(Debug, Serialize, Deserialize)]
    pub struct StockBalanceSnapshot {
        pub id: String,
        pub store_id: String,
        pub product_id: String,
        pub stock_bucket: String,
        pub quantity: i32,
        pub updated_at: String,
    }

    #[tauri::command]
    pub fn upsert_stock_balance_from_server(balance: StockBalanceSnapshot) -> Result<(), String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at",
            params![
                balance.id,
                balance.store_id,
                balance.product_id,
                balance.stock_bucket,
                balance.quantity,
                balance.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to upsert stock balance: {}", e))?;

        Ok(())
    }

    /// Batch-apply a full /sync/pull snapshot in a single transaction.
    ///
    /// This replaces the previous per-row invoke loop (one `upsert_*` command
    /// per product / store / balance), which opened a fresh SQLite connection
    /// and issued one statement per row.  For a large catalogue that was N×3
    /// fsync-on-open + per-row roundtrips; this command does it in one
    /// connection and one transaction with prepared statements.
    #[tauri::command(rename_all = "snake_case")]
    pub fn apply_sync_pull(
        products: Vec<Product>,
        stores: Vec<Store>,
        stock_balances: Vec<StockBalanceSnapshot>,
    ) -> Result<serde_json::Value, String> {
        let db_path = get_db_path();
        let mut conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        // WAL improves concurrent reads during a long apply; busy_timeout
        // avoids SQLITE_BUSY when the file is briefly locked by another
        // connection (e.g. the outbox flusher).
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "busy_timeout", 5000);

        // One transaction => atomic apply + a single fsync for the whole
        // snapshot instead of one commit per row.
        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to begin sync pull transaction: {}", e))?;

        let mut product_stmt = tx.prepare(
            "INSERT INTO products (id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, low_stock_threshold, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
             ON CONFLICT(id) DO UPDATE SET \
             sku = excluded.sku, \
             name = excluded.name, \
             brand = excluded.brand, \
             model = excluded.model, \
             category = excluded.category, \
             unit = excluded.unit, \
             barcode = excluded.barcode, \
             alternate_names = excluded.alternate_names, \
             serial_tracking_enabled = excluded.serial_tracking_enabled, \
             is_active = excluded.is_active, \
             low_stock_threshold = excluded.low_stock_threshold, \
             updated_at = excluded.updated_at",
        )
        .map_err(|e| format!("Failed to prepare product upsert: {}", e))?;

        let mut store_stmt = tx.prepare(
            "INSERT INTO stores (id, code, name, address, is_active, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(id) DO UPDATE SET \
             code = excluded.code, \
             name = excluded.name, \
             address = excluded.address, \
             is_active = excluded.is_active, \
             updated_at = excluded.updated_at",
        )
        .map_err(|e| format!("Failed to prepare store upsert: {}", e))?;

        let mut balance_stmt = tx.prepare(
            "INSERT INTO stock_balances (id, store_id, product_id, stock_bucket, quantity, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(store_id, product_id, stock_bucket) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at",
        )
        .map_err(|e| format!("Failed to prepare balance upsert: {}", e))?;

        let keep_placeholder_products = false;
        let keep_placeholder_stores = false;

        let result = (|| -> Result<serde_json::Value, rusqlite::Error> {
            let mut product_count: usize = 0;
            let mut store_count: usize = 0;
            let mut balance_count: usize = 0;

            for p in &products {
                if !keep_placeholder_products && is_placeholder_product(&p.sku, &p.name) {
                    // Do not let a placeholder clobber a real local product.
                    let local_name: Option<String> = tx
                        .query_row(
                            "SELECT name FROM products WHERE id = ?1",
                            params![p.id],
                            |row| row.get(0),
                        )
                        .ok();
                    if let Some(name) = local_name {
                        if !is_placeholder_product(&p.sku, &name) {
                            tx.execute(
                                "UPDATE products SET is_active = ?1, updated_at = ?2 WHERE id = ?3",
                                params![
                                    if p.is_active { 1 } else { 0 },
                                    p.updated_at,
                                    p.id,
                                ],
                            )?;
                            continue;
                        }
                    }
                }
                product_count += product_stmt.execute(params![
                    p.id,
                    p.sku,
                    p.name,
                    p.brand,
                    p.model,
                    p.category,
                    p.unit,
                    p.barcode,
                    p.alternate_names,
                    if p.serial_tracking_enabled { 1 } else { 0 },
                    if p.is_active { 1 } else { 0 },
                    p.low_stock_threshold,
                    p.created_at,
                    p.updated_at,
                ])?;
            }

            for s in &stores {
                if !keep_placeholder_stores && s.name.starts_with("Auto Store (") {
                    let local_name: Option<String> = tx
                        .query_row(
                            "SELECT name FROM stores WHERE id = ?1",
                            params![s.id],
                            |row| row.get(0),
                        )
                        .ok();
                    if let Some(name) = local_name {
                        if !name.starts_with("Auto Store (") {
                            tx.execute(
                                "UPDATE stores SET is_active = ?1, updated_at = ?2 WHERE id = ?3",
                                params![
                                    if s.is_active { 1 } else { 0 },
                                    s.updated_at,
                                    s.id,
                                ],
                            )?;
                            continue;
                        }
                    }
                }
                store_count += store_stmt.execute(params![
                    s.id,
                    s.code,
                    s.name,
                    s.address,
                    if s.is_active { 1 } else { 0 },
                    s.created_at,
                    s.updated_at,
                ])?;
            }

            for b in &stock_balances {
                balance_count += balance_stmt.execute(params![
                    b.id,
                    b.store_id,
                    b.product_id,
                    b.stock_bucket,
                    b.quantity,
                    b.updated_at,
                ])?;
            }

            Ok(serde_json::json!({
                "products": product_count,
                "stores": store_count,
                "stock_balances": balance_count,
            }))
        })();

        match result {
            Ok(summary) => {
                drop(product_stmt);
                drop(store_stmt);
                drop(balance_stmt);
                tx.commit()
                    .map_err(|e| format!("Failed to commit sync pull transaction: {}", e))?;
                Ok(summary)
            }
            Err(e) => {
                let msg = format!("Failed to apply sync pull (rolled back): {}", e);
                drop(product_stmt);
                drop(store_stmt);
                drop(balance_stmt);
                drop(tx);
                Err(msg)
            }
        }
    }

    /// Ensure the products_fts FTS5 virtual table and its sync triggers exist.
    /// Lazily creates them on first search if the Python Alembic migration hasn't
    /// run in this database yet (Tauri/desktop context).
    fn ensure_products_fts(conn: &Connection) -> Result<(), String> {
        // Check if the FTS5 table already exists
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='products_fts'",
                [],
                |row| row.get::<_, i32>(0),
            )
            .unwrap_or(0)
            == 1;

        if exists {
            let fts_count: i64 = conn
                .query_row("SELECT count(*) FROM products_fts", [], |r| r.get(0))
                .unwrap_or(0);
            let prod_count: i64 = conn
                .query_row("SELECT count(*) FROM products", [], |r| r.get(0))
                .unwrap_or(0);
            if fts_count == 0 && prod_count > 0 {
                let _ = conn.execute_batch("INSERT INTO products_fts(products_fts) VALUES ('rebuild');");
            }
            return Ok(());
        }

        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
                sku,
                name,
                brand,
                model,
                category,
                barcode,
                alternate_names,
                content='products',
                content_rowid='rowid',
                tokenize='porter unicode61'
            );

            CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
                INSERT INTO products_fts(rowid, sku, name, brand, model, category, barcode, alternate_names)
                VALUES (new.rowid, new.sku, new.name, new.brand, new.model, new.category, new.barcode, new.alternate_names);
            END;

            CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
                DELETE FROM products_fts WHERE rowid = old.rowid;
            END;

            CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
                DELETE FROM products_fts WHERE rowid = old.rowid;
                INSERT INTO products_fts(rowid, sku, name, brand, model, category, barcode, alternate_names)
                VALUES (new.rowid, new.sku, new.name, new.brand, new.model, new.category, new.barcode, new.alternate_names);
            END;

            INSERT INTO products_fts(products_fts) VALUES ('rebuild');",
        )
        .map_err(|e| format!("Failed to create products_fts table: {}", e))?;

        Ok(())
    }

    #[tauri::command]
    pub fn search_products_fts5(query: String, store_id: Option<String>) -> Result<Vec<Product>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database at {:?}: {}", db_path, e))?;

        let term = query.trim();
        if term.is_empty() {
            return Ok(Vec::new());
        }

        // Lazily create/verify the FTS5 table
        let _ = ensure_products_fts(&conn);

        // Build tokenized prefix query for FTS5 (e.g. "His"* "260"*)
        let tokens: Vec<String> = term
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| !s.is_empty())
            .map(|s| format!("\"{}\"*", s))
            .collect();

        if !tokens.is_empty() {
            let fts_query = tokens.join(" ");
            let fts_result = (|| -> Result<Vec<Product>, String> {
                let mut stmt = conn
                    .prepare(
                        "SELECT p.id, p.sku, p.name, p.brand, p.model, p.category, p.unit, p.barcode, \
                         p.alternate_names, p.serial_tracking_enabled, p.is_active, p.low_stock_threshold, p.created_at, p.updated_at, \
                         COALESCE(SUM(CASE WHEN sb.stock_bucket = 'AVAILABLE' THEN sb.quantity ELSE 0 END), 0) AS stock_quantity \
                         FROM ( \
                            SELECT rowid, bm25(products_fts) AS rank \
                            FROM products_fts \
                            WHERE products_fts MATCH ?1 \
                            ORDER BY rank ASC \
                            LIMIT 50 \
                         ) fts \
                         JOIN products p ON p.rowid = fts.rowid \
                         LEFT JOIN stock_balances sb \
                            ON sb.product_id = p.id AND sb.stock_bucket = 'AVAILABLE' AND sb.store_id = COALESCE(?2, sb.store_id) \
                         GROUP BY p.id \
                         ORDER BY fts.rank ASC"
                    )
                    .map_err(|e| format!("Failed to prepare FTS5 search query: {}", e))?;

                let prod_iter = stmt
                    .query_map(params![fts_query, store_id], |row| {
                        let st_int: i32 = row.get(9)?;
                        let active_int: i32 = row.get(10)?;
                        let low_stock_threshold: Option<i32> = row.get(11)?;
                        let stock_qty: i32 = row.get(14)?;
                        Ok(Product {
                            id: row.get(0)?,
                            sku: row.get(1)?,
                            name: row.get(2)?,
                            brand: row.get(3)?,
                            model: row.get(4)?,
                            category: row.get(5)?,
                            unit: row.get(6)?,
                            barcode: row.get(7)?,
                            alternate_names: row.get(8)?,
                            serial_tracking_enabled: st_int != 0,
                            is_active: active_int != 0,
                            low_stock_threshold,
                            created_at: row.get(12)?,
                            updated_at: row.get(13)?,
                            stock_quantity: Some(stock_qty),
                        })
                    })
                    .map_err(|e| format!("Failed to execute FTS5 product search: {}", e))?;

                let mut products = Vec::new();
                for prod in prod_iter {
                    let p = prod.map_err(|e| format!("Failed to read FTS5 product record: {}", e))?;
                    products.push(p);
                }
                Ok(products)
            })();

            if let Ok(products) = fts_result {
                if !products.is_empty() {
                    return Ok(products);
                }
            }
        }

        // Fallback to substring LIKE query if FTS5 returned 0 results or encountered an issue
        search_products(query, store_id)
    }

    // ============================================================================
    // App Update Checker (Tauri Updater)
    // ============================================================================

    #[tauri::command]
    pub async fn check_app_update(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
        use tauri_plugin_updater::UpdaterExt;
        println!("[UPDATER] check_app_update called");
        let updater = app.updater().map_err(|e| format!("Failed to init updater: {}", e))?;
        println!("[UPDATER] updater initialized, calling check()...");
        match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                let date = update.date.map(|d| d.to_string());
                let body = update.body.clone();
                println!("[UPDATER] Update available: version={}, date={:?}", version, date);
                Ok(Some(serde_json::json!({
                    "available": true,
                    "version": version,
                    "date": date,
                    "body": body,
                })))
            }
            Ok(None) => {
                println!("[UPDATER] No update available (app is up to date)");
                Ok(Some(serde_json::json!({
                    "available": false,
                })))
            }
            Err(e) => {
                // Don't fail the command if update check fails (network issues, etc.)
                println!("[UPDATER] Update check error: {}", e);
                Ok(Some(serde_json::json!({
                    "available": false,
                    "error": e.to_string(),
                })))
            }
        }
    }

    #[tauri::command]
    pub async fn download_and_install_update(app: tauri::AppHandle) -> Result<String, String> {
        use tauri_plugin_updater::UpdaterExt;
        use tauri::Emitter;
        let updater = app.updater().map_err(|e| format!("Failed to init updater: {}", e))?;
        let update = updater.check().await
            .map_err(|e| format!("Failed to check for updates: {}", e))?
            .ok_or("No update available")?;
        
        // Emit progress event helper
        let emit_progress = |downloaded: u64, total: Option<u64>| {
            let _ = app.emit("updater://progress", serde_json::json!({
                "downloaded": downloaded,
                "total": total,
                "stage": "downloading",
            }));
        };
        
        // Download and install the update
        let mut downloaded: u64 = 0;
        update.download_and_install(
            |chunk_length, content_length| {
                downloaded += chunk_length as u64;
                if let Some(total) = content_length {
                    println!("[UPDATER] Downloaded {} / {} bytes", downloaded, total);
                    emit_progress(downloaded, Some(total as u64));
                } else {
                    emit_progress(downloaded, None);
                }
            },
            || {
                println!("[UPDATER] Download complete, installing...");
                let _ = app.emit("updater://progress", serde_json::json!({
                    "downloaded": 0,
                    "total": 0,
                    "stage": "installing",
                }));
            },
        ).await
        .map_err(|e| format!("Failed to download and install update: {}", e))?;
        
        // Emit complete event
        let _ = app.emit("updater://progress", serde_json::json!({
            "downloaded": 0,
            "total": 0,
            "stage": "complete",
        }));
        
        // Restart the app
        app.restart();
        
        // Unreachable but needed for return type
        #[allow(unreachable_code)]
        Ok("Update downloaded and installed. The app will restart to apply the update.".to_string())
    }

    /// Delete all product-related data from local SQLite (GLOBAL_ADMIN only).
    /// This wipes products, stock_balances, inventory_transactions, day_books, day_book_entries,
    /// transfers, outbox_events, and devices. Users and stores are preserved.
    #[tauri::command]
    pub fn delete_all_data(confirm_store_name: String) -> Result<String, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Verify the store name matches the active store (security check)
        let store_name: String = conn
            .query_row(
                "SELECT name FROM stores WHERE is_active = 1 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|_| "No active store found".to_string())?;

        if store_name != confirm_store_name {
            return Err(format!(
                "Store name confirmation failed. Expected '{}', got '{}'.",
                store_name, confirm_store_name
            ));
        }

        let now = now_iso();

        // Delete in correct order due to foreign key constraints
        // First, delete dependent tables
        conn.execute("DELETE FROM day_book_entries", [])
            .map_err(|e| format!("Failed to delete day_book_entries: {}", e))?;
        
        conn.execute("DELETE FROM day_books", [])
            .map_err(|e| format!("Failed to delete day_books: {}", e))?;
        
        conn.execute("DELETE FROM inventory_transactions", [])
            .map_err(|e| format!("Failed to delete inventory_transactions: {}", e))?;
        
        conn.execute("DELETE FROM stock_balances", [])
            .map_err(|e| format!("Failed to delete stock_balances: {}", e))?;
        
        conn.execute("DELETE FROM transfers", [])
            .map_err(|e| format!("Failed to delete transfers: {}", e))?;
        
        conn.execute("DELETE FROM outbox_events", [])
            .map_err(|e| format!("Failed to delete outbox_events: {}", e))?;
        
        conn.execute("DELETE FROM products", [])
            .map_err(|e| format!("Failed to delete products: {}", e))?;
        
        conn.execute("DELETE FROM devices", [])
            .map_err(|e| format!("Failed to delete devices: {}", e))?;

        // Reset stores to inactive except the first one (keep one store for re-auth)
        conn.execute(
            "UPDATE stores SET is_active = 0, updated_at = ?1 WHERE code != (SELECT code FROM stores ORDER BY id LIMIT 1)",
            params![now],
        )
        .map_err(|e| format!("Failed to deactivate stores: {}", e))?;

        // Reset the first store to active
        conn.execute(
            "UPDATE stores SET is_active = 1, updated_at = ?1 WHERE code = (SELECT code FROM stores ORDER BY id LIMIT 1)",
            params![now],
        )
        .map_err(|e| format!("Failed to activate primary store: {}", e))?;

        // Clear kv_store (sync timestamps, etc.)
        conn.execute("DELETE FROM kv_store", [])
            .map_err(|e| format!("Failed to delete kv_store: {}", e))?;

        // Recreate FTS5 table if it exists
        conn.execute_batch(
            "DROP TABLE IF EXISTS products_fts;
             CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
                 sku,
                 name,
                 brand,
                 model,
                 category,
                 barcode,
                 alternate_names,
                 content='products',
                 content_rowid='rowid',
                 tokenize='porter unicode61'
             );
             INSERT INTO products_fts(products_fts) VALUES ('rebuild');",
        )
        .ok();

        Ok(format!(
            "All product-related data wiped successfully. Store '{}' preserved for authentication.",
            store_name
        ))
    }

    /// List all local backup files in the backup directory.
    #[tauri::command]
    pub fn list_local_backups() -> Result<Vec<serde_json::Value>, String> {
        use std::fs;

        let db_path = get_db_path();
        let db_dir = db_path.parent()
            .ok_or("Failed to get database directory")?;
        
        let backup_dir = db_dir.join("backups");
        
        if !backup_dir.exists() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        for entry in fs::read_dir(&backup_dir)
            .map_err(|e| format!("Failed to read backup directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read backup entry: {}", e))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("db") {
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to get backup metadata: {}", e))?;
                
                let filename = path.file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown.db")
                    .to_string();
                
                let created_at = metadata.created()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| {
                        chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339())
                    })
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

                backups.push(serde_json::json!({
                    "filename": filename,
                    "path": path.to_string_lossy().to_string(),
                    "size": metadata.len(),
                    "created_at": created_at,
                }));
            }
        }

        // Sort by creation date, newest first
        backups.sort_by(|a, b| b["created_at"].as_str().unwrap_or("").cmp(a["created_at"].as_str().unwrap_or("")));

        Ok(backups)
    }

/// Create a consistent point-in-time snapshot of the local SQLite database.
    ///
    /// `VACUUM INTO` writes a single, fully self-contained copy that includes
    /// every committed transaction — including pages still living in the
    /// write-ahead log.  A plain `fs::copy` of a WAL database only copies the
    /// main file, so the resulting "backup" can be stale or inconsistent.
    ///
    /// Returns `(filename, full path, size in bytes)`.
    fn create_db_snapshot(
        db_path: &Path,
        backup_dir: &Path,
    ) -> Result<(String, PathBuf, u64), String> {
        use std::fs;

        fs::create_dir_all(backup_dir)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;

        let timestamp = Utc::now().format("%Y-%m-%d_%H-%M-%S");
        let db_filename = db_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("inven_tory_local.db");
        let base_name = db_filename.trim_end_matches(".db");

        // Two backups requested within the same second (e.g. the scheduled one
        // landing right next to a manual one) must not overwrite each other.
        let mut backup_filename = format!("{}_{}.db", base_name, timestamp);
        let mut backup_path = backup_dir.join(&backup_filename);
        let mut suffix = 1;
        while backup_path.exists() && suffix < 1000 {
            backup_filename = format!("{}_{}_{}.db", base_name, timestamp, suffix);
            backup_path = backup_dir.join(&backup_filename);
            suffix += 1;
        }

        let snapshot = (|| -> Result<(), String> {
            let conn = Connection::open(db_path)
                .map_err(|e| format!("Failed to open database for backup: {}", e))?;
            // Fold the write-ahead log back into the main file so the snapshot
            // reflects every committed transaction.
            conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
                .map_err(|e| format!("Failed to checkpoint write-ahead log: {}", e))?;
            let escaped_path = backup_path.to_string_lossy().replace('\'', "''");
            conn.execute_batch(&format!("VACUUM INTO '{}';", escaped_path))
                .map_err(|e| format!("VACUUM INTO failed: {}", e))?;
            Ok(())
        })();

        if let Err(err) = snapshot {
            // Fallback for SQLite builds without VACUUM INTO support.
            eprintln!(
                "[TAURI-LOG] VACUUM INTO snapshot failed ({}); falling back to file copy",
                err
            );
            fs::copy(db_path, &backup_path)
                .map_err(|e| format!("Failed to copy database to backup: {}", e))?;
        }

        let size = fs::metadata(&backup_path)
            .map_err(|e| format!("Failed to get backup metadata: {}", e))?
            .len();

        Ok((backup_filename, backup_path, size))
    }
    /// Create a local backup of the database (manual / user-initiated).
    #[tauri::command]
    pub fn create_local_backup() -> Result<serde_json::Value, String> {
        use chrono::Utc;

        let db_path = get_db_path();
        let db_dir = db_path.parent()
            .ok_or("Failed to get database directory")?;
        
        let backup_dir = db_dir.join("backups");
        let (backup_filename, backup_path, size) = create_db_snapshot(&db_path, &backup_dir)?;

        let created_at = Utc::now().to_rfc3339();

        Ok(serde_json::json!({
            "filename": backup_filename,
            "path": backup_path.to_string_lossy().to_string(),
            "size": size,
            "created_at": created_at,
        }))
    }

    /// Restore database from a local backup file.
    #[tauri::command]
    pub fn restore_from_backup(filename: String) -> Result<String, String> {
        use std::fs;

        let db_path = get_db_path();
        let db_dir = db_path.parent()
            .ok_or("Failed to get database directory")?;
        
        let backup_dir = db_dir.join("backups");
        let backup_path = backup_dir.join(&filename);

        if !backup_path.exists() {
            return Err(format!("Backup file '{}' not found", filename));
        }

        // Copy backup to a temporary file first, then replace the main db
        // This avoids issues with the database being locked
        let temp_path = db_dir.join(format!("inven_tory_local.db.restore_{}", chrono::Utc::now().timestamp()));
        fs::copy(&backup_path, &temp_path)
            .map_err(|e| format!("Failed to copy backup to temp file: {}", e))?;

        // Close any existing connections by dropping the pool (not applicable here, but we need to ensure no open connections)
        // In practice, the app should restart after restore
        fs::rename(&temp_path, &db_path)
            .map_err(|e| format!("Failed to replace database with backup: {}", e))?;

        Ok(format!("Database restored from '{}'. Please restart the application.", filename))
    }

    /// Create today's daily backup if one has not been taken yet.
    ///
    /// This command is *time*-driven: the frontend calls it from a scheduler
    /// that fires at local midnight (see `startDailyBackupScheduler` in
    /// `services/backupScheduler.ts`).  It is deliberately NOT called on app
    /// launch — a restart must never create a backup on its own.
    ///
    /// The "already backed up today" marker is stored in `kv_store` using the
    /// **local** calendar date, so the once-per-day guard rolls over at the
    /// user's midnight (not midnight UTC).
    ///
    /// Returns the new backup info, or `None` when today's backup already
    /// exists.
    #[tauri::command]
    pub fn daily_backup_if_needed() -> Result<Option<serde_json::Value>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        ensure_kv_store_table(&conn)?;

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        let last_backup_date: Option<String> = conn
            .query_row(
                "SELECT value FROM kv_store WHERE key = 'last_daily_backup_at'",
                [],
                |row| row.get(0),
            )
            .ok();

        // If already backed up today, skip
        if last_backup_date.as_deref() == Some(today.as_str()) {
            return Ok(None);
        }

        // Create a consistent snapshot of the database.
        let db_dir = db_path.parent()
            .ok_or("Failed to get database directory")?;
        let backup_dir = db_dir.join("backups");
        let (backup_filename, backup_path, size) = create_db_snapshot(&db_path, &backup_dir)?;

        let created_at = Utc::now().to_rfc3339();

        // Record that we backed up today (local date) plus the exact time.
        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES ('last_daily_backup_at', ?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
            params![today, created_at],
        )
        .map_err(|e| format!("Failed to record backup date: {}", e))?;

        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES ('last_daily_backup_iso', ?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
            params![created_at, created_at],
        )
        .map_err(|e| format!("Failed to record backup timestamp: {}", e))?;

        Ok(Some(serde_json::json!({
            "filename": backup_filename,
            "path": backup_path.to_string_lossy().to_string(),
            "size": size,
            "created_at": created_at,
        })))
    }

    /// Persist the last-successful-sync timestamp (SYNC-009).
    #[tauri::command]
    pub fn set_last_sync_timestamp(timestamp: String) -> Result<(), String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        ensure_kv_store_table(&conn)?;

        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES ('last_sync_at', ?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
            params![timestamp, now],
        )
        .map_err(|e| format!("Failed to persist last_sync_at: {}", e))?;

        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("[TAURI-LOG] Initializing invenTory Desktop Shell...");

    // Initialize local database schema (create tables if they don't exist)
    if let Ok(db_path) = get_db_path().into_os_string().into_string() {
        if let Ok(conn) = Connection::open(&db_path) {
            // Persistent WAL mode: better concurrent read/write behaviour than
            // the default rollback journal and avoids SQLITE_BUSY during sync.
            // Set once here; the mode is stored in the database file itself so
            // every later Connection::open inherits it automatically.
            let _ = conn.pragma_update(None, "journal_mode", "WAL");
            let _ = conn.pragma_update(None, "busy_timeout", 5000);

            // Idempotent hot-path indexes on the local ledger/catalogue tables
            // so sync and day-book queries don't do full table scans.
            let _ = conn.execute_batch(
                "CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at); \
                 CREATE INDEX IF NOT EXISTS idx_inventory_tx_movement_date ON inventory_transactions(movement_type, occurred_at); \
                 CREATE INDEX IF NOT EXISTS idx_stock_balances_store_product ON stock_balances(store_id, product_id, stock_bucket); \
                 CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku); \
                 CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at); \
                 CREATE INDEX IF NOT EXISTS idx_stores_updated_at ON stores(updated_at);",
            );

            if let Err(e) = ensure_day_books_tables(&conn) {
                eprintln!("[TAURI-LOG] Warning: Failed to initialize day_books tables: {}", e);
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::local_login,
            commands::get_stores,
            commands::create_store,
            commands::update_store,
            commands::toggle_store_active,
            commands::register_device,
            commands::get_products,
            commands::get_products_by_store,
            commands::search_products,
            commands::search_products_fts5,
            commands::create_product,
            commands::create_products_batch,
            commands::update_product,
            commands::toggle_product_active,
            commands::receive_stock,
            commands::get_stock_balance,
            commands::sell_stock,
            commands::get_stock_balance_for_bucket,
            commands::get_stock_balances_for_store,
            commands::return_stock,
            commands::move_stock_bucket,
            commands::adjust_stock,
            commands::update_transaction,
            commands::delete_transaction,
            commands::get_transfers,
            commands::get_local_transactions,
            commands::create_transfer,
            commands::dispatch_transfer,
            commands::receive_transfer,
            commands::cancel_transfer,
            commands::mark_transfer_exception,
            commands::get_pending_outbox_count,
            commands::save_pdf_file,
            // Issue 15: sync commands
            commands::get_pending_outbox_events,
            commands::update_outbox_event_status,
            commands::update_outbox_event_statuses,
            commands::update_transaction_sync_status,
            commands::update_transaction_sync_statuses,
            commands::get_last_sync_timestamp,
            commands::set_last_sync_timestamp,
            commands::upsert_product_from_server,
            commands::upsert_store_from_server,
            commands::upsert_stock_balance_from_server,
            commands::apply_sync_pull,
            // App Update Checker
            commands::check_app_update,
            commands::download_and_install_update,
            // Delete All Data
            commands::delete_all_data,
            // Backup & Restore
            commands::list_local_backups,
            commands::create_local_backup,
            commands::restore_from_backup,
            commands::daily_backup_if_needed,
            // Genesis wizard
            commands::check_genesis_state,
            commands::run_genesis,
            // Restore wizard
            commands::validate_restore_credentials,
            commands::start_prioritized_restore,
            commands::get_restore_progress,
            commands::cancel_restore,
            // Restore data application
            commands::apply_restore_critical,
            commands::apply_restore_transactions,
            commands::apply_restore_important,
            commands::apply_restore_background,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

