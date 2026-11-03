/**
 * UI Lab mock layer — DEVELOPMENT ONLY.
 *
 * While the lab is open this module intercepts `window.__TAURI_INTERNALS__.invoke`
 * (the single funnel every `@tauri-apps/api/core` call goes through) and answers
 * from isolated fixtures instead of the Rust/SQLite backend. Consequences:
 *
 *   - No SQLite reads/writes, no auth record changes, no real server sync can
 *     be triggered while the lab is open, even in `tauri dev`.
 *   - Unknown commands are REJECTED — never passed through to the real backend.
 *   - Profiles (`realistic` | `empty` | `slow` | `error`) drive loading, empty
 *     and failure states for every preview with one control.
 *
 * Everything is gated on `import.meta.env.DEV` (compile-time; `false` in
 * production builds, so this module is dead code there).
 */

import type { LabProfile } from './state';
import type { Store } from '../types/store';
import type { Product } from '../types/product';
import type { InventoryTransaction } from '../types/transaction';
import type { RestorePreview, RestoreProgress } from '../hooks/useGenesisState';

let profile: LabProfile = 'realistic';
let installed = false;
let savedInternals: { invoke?: unknown } | null = null;
let createdInternals = false;

export function getLabProfile(): LabProfile {
  return profile;
}

export function setLabProfile(next: LabProfile): void {
  if (!import.meta.env.DEV) return;
  profile = next;
}

const now = (): string => new Date().toISOString();

// ---------------------------------------------------------------------------
// Fixtures (shapes mirror src/test/setup.ts fixtures)
// ---------------------------------------------------------------------------

export const MOCK_STORES: Store[] = [
  {
    id: 'STORE-ALPHA',
    code: 'ALPHA',
    name: 'Alpha Store',
    address: '123 Main St',
    is_active: true,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: 'STORE-BETA',
    code: 'BETA',
    name: 'Beta Depot',
    address: '42 Harbour Rd',
    is_active: true,
    created_at: now(),
    updated_at: now(),
  },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'PROD-001',
    sku: 'ELEC-001',
    name: 'Hisense 120L Refrigerator',
    category: 'Appliances',
    unit: 'pcs',
    is_active: true,
    serial_tracking_enabled: false,
    barcode: null,
    alternate_names: null,
    stock_quantity: 6,
    store_id: 'STORE-ALPHA',
    created_at: now(),
    updated_at: now(),
  },
  {
    id: 'PROD-TV-55',
    sku: 'TV-55-SONY',
    name: 'Sony 55 Inch TV',
    category: 'Electronics',
    unit: 'pcs',
    is_active: true,
    serial_tracking_enabled: false,
    barcode: null,
    alternate_names: null,
    stock_quantity: 10,
    store_id: 'STORE-ALPHA',
    created_at: now(),
    updated_at: now(),
  },
  {
    id: 'PROD-IPHONE',
    sku: 'ELEC-IPHONE15PRO',
    name: 'Apple iPhone 15 Pro 256GB',
    brand: 'Apple',
    model: 'A3102',
    category: 'Smartphones',
    unit: 'pcs',
    barcode: '195949012345',
    alternate_names: 'iPhone 15 Pro',
    serial_tracking_enabled: true,
    is_active: true,
    stock_quantity: 0,
    store_id: 'STORE-ALPHA',
    created_at: now(),
    updated_at: now(),
  },
  {
    id: 'PROD-XM5',
    sku: 'ELEC-SONY-XM5',
    name: 'Sony WH-1000XM5 Headphones',
    brand: 'Sony',
    model: 'XM5',
    category: 'Audio',
    unit: 'pcs',
    barcode: '027242922112',
    alternate_names: 'Sony XM5',
    serial_tracking_enabled: false,
    is_active: true,
    stock_quantity: 24,
    store_id: 'STORE-ALPHA',
    created_at: now(),
    updated_at: now(),
  },
];

export const MOCK_TRANSACTIONS: InventoryTransaction[] = [
  {
    transaction_id: 'TXN-LAB-1',
    store_id: 'STORE-ALPHA',
    product_id: 'PROD-001',
    movement_type: 'RECEIPT',
    stock_bucket: 'AVAILABLE',
    quantity_delta: 20,
    occurred_at: now(),
    recorded_at: now(),
    user_id: 'LAB-USER',
    device_id: 'UI-LAB-DEVICE',
    reference_number: 'PO-001',
    reason_code: null,
    transfer_id: null,
    purchase_order_id: 'PO-001',
    batch_id: null,
    client_sequence: null,
    sync_status: 'SYNCED',
    server_accepted_at: null,
    original_transaction_id: null,
    product_name: 'Hisense 120L Refrigerator',
  },
  {
    transaction_id: 'TXN-LAB-2',
    store_id: 'STORE-ALPHA',
    product_id: 'PROD-TV-55',
    movement_type: 'SALE',
    stock_bucket: 'AVAILABLE',
    quantity_delta: -2,
    occurred_at: now(),
    recorded_at: now(),
    user_id: 'LAB-USER',
    device_id: 'UI-LAB-DEVICE',
    reference_number: 'RCT-1042',
    reason_code: null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'PENDING',
    server_accepted_at: null,
    original_transaction_id: null,
    product_name: 'Sony 55 Inch TV',
  },
];

export const MOCK_RESTORE_PREVIEW: RestorePreview = {
  stores_count: 2,
  products_count: 148,
  transactions_count: 3921,
  last_sync_timestamp: '2026-10-14T18:32:00Z',
  estimated_critical_time_seconds: 30,
  estimated_total_time_minutes: 4,
};

export const MOCK_RESTORE_PROGRESS: RestoreProgress = {
  phase: 'restoring',
  current_step: 'Restoring products…',
  progress_percent: 62,
  critical_complete: false,
  can_use_app: false,
  total_complete: false,
};

function mockDashboardAnalytics(empty: boolean): Record<string, unknown> {
  if (empty) return {};
  return {
    kpis: {
      total_products_current: 12,
      total_products_prior: 10,
      total_stock_units: 430,
      stock_delta_current: 430,
      stock_delta_prior: 418,
      products_in_multiple_stores: 4,
      receipt_linked_sales_current: 31,
      receipt_linked_sales_prior: 27,
    },
    stock_trend: [
      { date: '2026-10-08', total_stock_units: 418 },
      { date: '2026-10-09', total_stock_units: 424 },
      { date: '2026-10-10', total_stock_units: 421 },
      { date: '2026-10-11', total_stock_units: 430 },
    ],
    category_distribution: [
      { category: 'Electronics', count: 2, percentage: 50 },
      { category: 'Appliances', count: 1, percentage: 25 },
      { category: 'Audio', count: 1, percentage: 25 },
    ],
    low_stock_alerts: [
      {
        product_id: 'PROD-IPHONE',
        product_name: 'Apple iPhone 15 Pro 256GB',
        current_stock: 0,
        threshold: 5,
        category: 'Smartphones',
      },
    ],
    recent_activity: [
      {
        id: 'ACT-1',
        type: 'stock_added',
        product_id: 'PROD-001',
        product_name: 'Hisense 120L Refrigerator',
        sku: 'ELEC-001',
        store_id: 'STORE-ALPHA',
        store_name: 'Alpha Store',
        quantity: 20,
        occurred_at: now(),
        reference_number: 'PO-001',
      },
    ],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Fixture dispatch
// ---------------------------------------------------------------------------

/** Resolve a Tauri command from lab fixtures. Exported for direct testing. */
export async function handleLabInvoke(cmd: string, args?: unknown): Promise<unknown> {
  if (profile === 'error') {
    if (cmd === 'local_login') throw new Error('Invalid username or password.');
    throw new Error(`UI Lab (error profile): simulated failure for "${cmd}"`);
  }
  if (profile === 'slow') await delay(1200);

  const empty = profile === 'empty';
  const a = (args ?? {}) as Record<string, unknown>;

  switch (cmd) {
    // ── Auth / genesis / restore ────────────────────────────────────────────
    case 'local_login':
      return {
        user_id: 'LAB-USER',
        username: (a.username as string) || 'admin',
        full_name: 'UI Lab User',
        role: 'GLOBAL_ADMIN',
        assigned_store_id: 'STORE-ALPHA',
      };
    case 'check_genesis_state':
      return { ready: true, has_user_with_pin: true, has_any_store: true, has_tables: true };
    case 'run_genesis':
      return {
        success: true,
        message: 'UI Lab mock: setup complete (no data written).',
        username: (a.username as string) ?? 'admin',
        store_code: (a.storeCode as string) ?? 'MAIN',
      };
    case 'validate_restore_credentials':
      return MOCK_RESTORE_PREVIEW;
    case 'start_prioritized_restore':
      return 'started';
    case 'get_restore_progress':
      return MOCK_RESTORE_PROGRESS;
    case 'cancel_restore':
      return undefined;

    // ── Stores ──────────────────────────────────────────────────────────────
    case 'get_stores':
      return empty ? [] : MOCK_STORES;
    case 'create_store':
    case 'update_store':
    case 'toggle_store_active':
      return MOCK_STORES[0];
    case 'register_device':
      return {
        id: 'DEVICE-LAB',
        store_id: 'STORE-ALPHA',
        device_name: 'UI Lab Device',
        is_active: true,
        registered_at: now(),
      };

    // ── Products ────────────────────────────────────────────────────────────
    case 'get_products':
    case 'get_products_paginated':
    case 'get_products_by_store':
    case 'search_products':
    case 'search_products_fts5':
      return empty ? [] : MOCK_PRODUCTS;
    case 'get_products_count':
      return empty ? 0 : MOCK_PRODUCTS.length;
    case 'get_product_categories':
      return empty ? [] : ['Appliances', 'Audio', 'Electronics', 'Smartphones'];
    case 'create_product':
    case 'update_product':
    case 'toggle_product_active': {
      const input = (a.input ?? {}) as Partial<Product>;
      return { ...MOCK_PRODUCTS[0], ...input, id: input.id ?? 'PROD-LAB-NEW' } as Product;
    }
    case 'create_products_batch':
      return empty ? [] : [{ success: true, sku: 'ELEC-001', row: 2 }];

    // ── Stock / transactions ────────────────────────────────────────────────
    case 'get_stock_balances_for_store':
      return empty
        ? []
        : [
            { product_id: 'PROD-001', quantity: 6 },
            { product_id: 'PROD-TV-55', quantity: 10 },
            { product_id: 'PROD-IPHONE', quantity: 0 },
            { product_id: 'PROD-XM5', quantity: 24 },
          ];
    case 'get_stock_balance':
    case 'get_stock_balance_for_bucket':
      return empty ? 0 : 6;
    case 'get_local_transactions':
      return empty ? [] : MOCK_TRANSACTIONS;
    case 'receive_stock':
    case 'sell_stock':
    case 'return_stock':
    case 'adjust_stock':
    case 'update_transaction':
      return MOCK_TRANSACTIONS[0];
    case 'move_stock_bucket':
      return [MOCK_TRANSACTIONS[0]];
    case 'delete_transaction':
      return undefined;

    // ── Transfers ───────────────────────────────────────────────────────────
    case 'get_transfers':
      return empty
        ? []
        : [
            {
              id: 'TRF-LAB-1',
              source_store_id: 'STORE-ALPHA',
              destination_store_id: 'STORE-BETA',
              product_id: 'PROD-001',
              quantity: 4,
              status: 'PENDING',
              created_by_user_id: 'LAB-USER',
              created_at: now(),
              updated_at: now(),
            },
          ];
    case 'create_transfer':
    case 'dispatch_transfer':
    case 'receive_transfer':
    case 'cancel_transfer':
    case 'mark_transfer_exception':
      return { id: 'TRF-LAB-1', status: 'PENDING', created_at: now(), updated_at: now() };

    // ── Dashboard / sync / backups / misc ───────────────────────────────────
    case 'get_dashboard_analytics':
      return mockDashboardAnalytics(empty);
    case 'get_last_sync_timestamp':
      return null;
    case 'set_last_sync_timestamp':
    case 'update_outbox_event_statuses':
    case 'update_transaction_sync_statuses':
    case 'add_outbox_event':
    case 'cleanup_expired_outbox_events':
      return undefined;
    case 'get_pending_outbox_count':
      return 0;
    case 'apply_sync_pull':
      return { products: 0, stores: 0, stock_balances: 0 };
    case 'list_local_backups':
      return [];
    case 'create_local_backup':
      return { filename: 'ui-lab-mock.sqlite', created_at: now(), size_bytes: 0 };
    case 'restore_from_backup':
      return 'UI Lab mock: restore skipped (no data touched).';
    case 'daily_backup_if_needed':
      return null;
    case 'delete_all_data':
      return 'UI Lab mock: nothing was deleted.';
    case 'check_app_update':
      return null;
    case 'download_and_install_update':
      return 'UI Lab mock: no update installed.';
    case 'init_fts5_index':
    case 'rebuild_fts5_index':
      return true;
    case 'get_fts5_index_info':
      return { enabled: true, documents: empty ? 0 : MOCK_PRODUCTS.length };
    case 'save_pdf_file':
      return 'ui-lab-mock.pdf';

    default:
      break;
  }

  // Read-shaped unknown commands degrade to an empty list rather than the
  // backend — still fully isolated, never a pass-through.
  if (/^(get_|list_|search_|count_)/.test(cmd)) return [];
  // Everything else (writes, one-shots) is rejected outright so a lab preview
  // can never mutate the real database or trigger server synchronization.
  throw new Error(
    `UI Lab: no mock for Tauri command "${cmd}" — writes are blocked while the UI Lab is active.`,
  );
}

// ---------------------------------------------------------------------------
// Install / uninstall
// ---------------------------------------------------------------------------

type TauriInternals = { invoke?: unknown } & Record<string, unknown>;

/**
 * Intercept `window.__TAURI_INTERNALS__.invoke`. Safe to call repeatedly.
 * Creates a minimal fake internals object when running in a plain browser so
 * `isTauriEnvironment()` services take their Tauri path against fixtures.
 */
export function installLabMocks(nextProfile?: LabProfile): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  if (nextProfile) profile = nextProfile;
  if (installed) return;
  installed = true;

  const w = window as unknown as Record<string, unknown>;
  const existing = '__TAURI_INTERNALS__' in w ? (w.__TAURI_INTERNALS__ as TauriInternals) : null;
  if (existing) {
    savedInternals = { invoke: existing.invoke };
    existing.invoke = (cmd: string, args?: unknown): Promise<unknown> => handleLabInvoke(cmd, args);
  } else {
    createdInternals = true;
    w.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: unknown): Promise<unknown> => handleLabInvoke(cmd, args),
    };
  }
}

/** Restore the previous invoke implementation (or remove the fake one). */
export function uninstallLabMocks(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined' || !installed) return;
  const w = window as unknown as Record<string, unknown>;
  if (createdInternals) {
    delete w.__TAURI_INTERNALS__;
  } else if (savedInternals && '__TAURI_INTERNALS__' in w) {
    (w.__TAURI_INTERNALS__ as TauriInternals).invoke = savedInternals.invoke;
  }
  savedInternals = null;
  createdInternals = false;
  installed = false;
}

export function isLabMockInstalled(): boolean {
  return installed;
}
