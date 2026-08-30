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
    pub created_at: String,
    pub updated_at: String,
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

    let candidates = [
        "inven_tory_local.db",
        "../inven_tory_local.db",
        "../../inven_tory_local.db",
    ];

    for cand in candidates {
        let p = Path::new(cand);
        if p.exists() {
            return p.to_path_buf();
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

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn get_stores() -> Result<Vec<Store>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database at {:?}: {}", db_path, e))?;

        let mut stmt = conn
            .prepare("SELECT id, code, name, address, is_active, created_at, updated_at FROM stores ORDER BY name ASC")
            .map_err(|e| format!("Failed to prepare SQL statement: {}", e))?;

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
            .map_err(|e| format!("SQL error: {}", e))?;
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
            .map_err(|e| format!("SQL error: {}", e))?;

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
            .map_err(|e| format!("SQL error: {}", e))?;

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

    // FR-STORE-003: Device registration stub
    // TODO(issue-13): Replace with full server-side OAuth device pairing workflow in Issue 13
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

    #[tauri::command]
    pub fn get_products() -> Result<Vec<Product>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at FROM products ORDER BY name ASC")
            .map_err(|e| format!("Failed to prepare SQL statement: {}", e))?;

        let prod_iter = stmt
            .query_map([], |row| {
                let st_int: i32 = row.get(9)?;
                let active_int: i32 = row.get(10)?;
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
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
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
    pub fn search_products(query: String) -> Result<Vec<Product>, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let term = format!("%{}%", query.trim().to_lowercase());

        let mut stmt = conn
            .prepare("SELECT id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at FROM products WHERE LOWER(name) LIKE ?1 OR LOWER(sku) LIKE ?1 OR LOWER(COALESCE(model, '')) LIKE ?1 OR LOWER(COALESCE(barcode, '')) LIKE ?1 OR LOWER(COALESCE(alternate_names, '')) LIKE ?1 ORDER BY name ASC")
            .map_err(|e| format!("Failed to prepare search query: {}", e))?;

        let prod_iter = stmt
            .query_map(params![term], |row| {
                let st_int: i32 = row.get(9)?;
                let active_int: i32 = row.get(10)?;
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
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
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

    #[tauri::command]
    pub fn create_product(input: NewProductInput) -> Result<Product, String> {
        let db_path = get_db_path();
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let sku_clean = input.sku.trim().to_uppercase();
        let name_clean = input.name.trim().to_string();
        let category_clean = input.category.trim().to_string();
        let unit_clean = input.unit.unwrap_or_else(|| "pcs".to_string()).trim().to_string();

        if sku_clean.is_empty() {
            return Err("Product SKU cannot be empty.".to_string());
        }
        if name_clean.is_empty() {
            return Err("Product name cannot be empty.".to_string());
        }
        if category_clean.is_empty() {
            return Err("Product category cannot be empty.".to_string());
        }

        // FR-PROD-001: Enforce unique SKU
        let mut check_stmt = conn
            .prepare("SELECT COUNT(*) FROM products WHERE UPPER(sku) = ?1")
            .map_err(|e| format!("SQL error: {}", e))?;
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
            "INSERT INTO products (id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
                now,
                now
            ],
        )
        .map_err(|e| format!("Failed to insert product: {}", e))?;

        Ok(Product {
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
            created_at: now.clone(),
            updated_at: now,
        })
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
            .prepare("SELECT id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at FROM products WHERE id = ?1")
            .map_err(|e| format!("SQL error: {}", e))?;

        let prod = stmt
            .query_row(params![input.id], |row| {
                let st_val: i32 = row.get(9)?;
                let active_val: i32 = row.get(10)?;
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
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            })
            .map_err(|e| format!("Failed to fetch updated product: {}", e))?;

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
            .prepare("SELECT id, sku, name, brand, model, category, unit, barcode, alternate_names, serial_tracking_enabled, is_active, created_at, updated_at FROM products WHERE id = ?1")
            .map_err(|e| format!("SQL error: {}", e))?;

        let prod = stmt
            .query_row(params![id], |row| {
                let st_val: i32 = row.get(9)?;
                let active_val: i32 = row.get(10)?;
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
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            })
            .map_err(|e| format!("Failed to fetch product status: {}", e))?;

        Ok(prod)
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
            "quantity_delta": input.quantity
        }))
        .map_err(|e| format!("Failed to serialize outbox payload: {}", e))?;

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
        .map_err(|e| format!("Failed to create outbox event: {}", e))?;

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
            "quantity_delta": quantity_delta
        }))
        .map_err(|e| format!("Failed to serialize outbox payload: {}", e))?;

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
        .map_err(|e| format!("Failed to create outbox event: {}", e))?;

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
            "reference_number": input.reference_number
        }))
        .map_err(|e| format!("Failed to serialize outbox payload: {}", e))?;

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
        .map_err(|e| format!("Failed to create outbox event: {}", e))?;

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
            "reason_code": reason_clean
        })).map_err(|e| format!("Failed to serialize outbox payload: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
            params![outbox_id_1, format!("EVT-{}", outflow_tx_id), payload_1, now],
        )
        .map_err(|e| format!("Failed to create outbox event: {}", e))?;

        let outbox_id_2 = generate_id("OB");
        let payload_2 = serde_json::to_string(&serde_json::json!({
            "transaction_id": inflow_tx_id,
            "store_id": input.store_id,
            "product_id": input.product_id,
            "movement_type": "DAMAGE",
            "stock_bucket": to_upper,
            "quantity_delta": input.quantity,
            "reason_code": reason_clean
        })).map_err(|e| format!("Failed to serialize outbox payload: {}", e))?;

        conn.execute(
            "INSERT INTO outbox_events (id, event_id, event_type, payload, status, retry_count, created_at) VALUES (?1, ?2, 'INVENTORY_TRANSACTION', ?3, 'PENDING', 0, ?4)",
            params![outbox_id_2, format!("EVT-{}", inflow_tx_id), payload_2, now],
        )
        .map_err(|e| format!("Failed to create outbox event: {}", e))?;

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
            .map_err(|e| format!("Failed to prepare SQL statement: {}", e))?;

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
            .map_err(|e| format!("SQL error: {}", e))?;

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

        conn.execute(
            "UPDATE transfers SET status = 'DISPATCHED', updated_at = ?1 WHERE id = ?2",
            params![now, transfer_id],
        )
        .map_err(|e| format!("Failed to update transfer status: {}", e))?;

        let tx_id = generate_id("TX");
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, transfer_id, sync_status) VALUES (?1, ?2, ?3, 'TRANSFER', 'AVAILABLE', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'PENDING')",
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
            .map_err(|e| format!("SQL error: {}", e))?;

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

        conn.execute(
            "UPDATE transfers SET status = 'RECEIVED', updated_at = ?1 WHERE id = ?2",
            params![now, transfer_id],
        )
        .map_err(|e| format!("Failed to update transfer status: {}", e))?;

        let tx_id = generate_id("TX");
        conn.execute(
            "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, transfer_id, sync_status) VALUES (?1, ?2, ?3, 'TRANSFER', 'AVAILABLE', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'PENDING')",
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
            .map_err(|e| format!("SQL error: {}", e))?;

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

        if transfer.status == "DISPATCHED" || transfer.status == "EXCEPTION" {
            let comp_tx_id = generate_id("TX");
            conn.execute(
                "INSERT INTO inventory_transactions (transaction_id, store_id, product_id, movement_type, stock_bucket, quantity_delta, occurred_at, recorded_at, user_id, device_id, reference_number, reason_code, transfer_id, sync_status) VALUES (?1, ?2, ?3, 'TRANSFER', 'AVAILABLE', ?4, ?5, ?6, ?7, ?8, ?9, 'TRANSFER CANCELLED -> Stock Restored', ?10, 'PENDING')",
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
            .map_err(|e| format!("SQL error: {}", e))?;

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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("[TAURI-LOG] Initializing INVENTORY Tory Desktop Shell...");
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_stores,
            commands::create_store,
            commands::update_store,
            commands::toggle_store_active,
            commands::register_device,
            commands::get_products,
            commands::search_products,
            commands::create_product,
            commands::update_product,
            commands::toggle_product_active,
            commands::receive_stock,
            commands::get_stock_balance,
            commands::sell_stock,
            commands::get_stock_balance_for_bucket,
            commands::return_stock,
            commands::move_stock_bucket,
            commands::get_transfers,
            commands::create_transfer,
            commands::dispatch_transfer,
            commands::receive_transfer,
            commands::cancel_transfer,
            commands::mark_transfer_exception,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

