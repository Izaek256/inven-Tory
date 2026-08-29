use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};

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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("[TAURI-LOG] Initializing INVENTORY Tory Desktop Shell...");
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![commands::get_stores])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
