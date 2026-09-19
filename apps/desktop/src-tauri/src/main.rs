// Tauri desktop entry point.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// Well-known log file path used by the CI smoke test to capture panics and
/// startup diagnostics.  Lives next to the database so CI can find it by
/// scanning the app data directory.
fn debug_log_path() -> PathBuf {
    let base = inven_tory_desktop_lib::get_db_path();
    base.parent()
        .unwrap_or(&base)
        .join("startup_debug.log")
}

/// Append a line to the debug log file (creating it if needed).  Thread-safe
/// via a process-wide mutex so the panic hook and normal logging can both
/// write safely.
static LOG_FILE: Mutex<Option<std::fs::File>> = Mutex::new(None);

fn log_to_file(line: &str) {
    let mut guard = LOG_FILE.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        if let Ok(f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(debug_log_path())
        {
            *guard = Some(f);
        }
    }
    if let Some(ref mut f) = *guard {
        let _ = writeln!(f, "{}", line);
        let _ = f.flush();
    }
}

fn main() {
    // ── Panic hook ──────────────────────────────────────────────────────
    // Writes to stderr (captured by CI) AND a well-known log file so the
    // information is available even when stderr is swallowed.
    std::panic::set_hook(Box::new(|info| {
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("<unnamed>");
        let payload = info.payload();
        let payload_str = if let Some(s) = payload.downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "Box<dyn Any>".to_string()
        };
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown>".to_string());
        let msg = format!(
            "PANIC [thread {}]: {}\n  at {}",
            thread_name, payload_str, location
        );
        eprintln!("{}", msg);
        log_to_file(&msg);
    }));

    // ── Debug startup logging ───────────────────────────────────────────
    // Activated when INVEN_TORY_DEBUG_STARTUP=1 is set (CI sets this).
    if std::env::var("INVEN_TORY_DEBUG_STARTUP").is_ok() {
        let db = inven_tory_desktop_lib::get_db_path();
        let lines = vec![
            format!("[STARTUP] invenTory v{}", env!("CARGO_PKG_VERSION")),
            format!("[STARTUP] DB path: {:?}", db),
            format!(
                "[STARTUP] OS: {} {}",
                std::env::consts::OS,
                std::env::consts::ARCH
            ),
            format!("[STARTUP] CWD: {:?}", std::env::current_dir().ok()),
            format!("[STARTUP] Debug log: {:?}", debug_log_path()),
        ];
        for line in &lines {
            eprintln!("{}", line);
            log_to_file(line);
        }
    }

    inven_tory_desktop_lib::run();
}
