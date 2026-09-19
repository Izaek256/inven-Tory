import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import type { Store, Device } from '../types/store';
import type { Product } from '../types/product';
import type { InventoryTransaction, MovementType, StockBucket } from '../types/transaction';
import type { OutboxEventRow } from '../types/sync';
import type { BackupInfo } from '../services/tauriDataService';

// Polyfill ResizeObserver for recharts (not implemented in jsdom)
const g = globalThis as Record<string, unknown>;
if (!g.ResizeObserver) {
  g.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// Polyfill window.matchMedia for jsdom (not implemented in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => false,
  }),
});

// Mock @tauri-apps/api/core so services can invoke() commands in tests.
// This must be a vi.mock so it is hoisted above all other imports and cannot
// be broken by tests that overwrite window.__TAURI_INTERNALS__.
vi.mock('@tauri-apps/api/core', () => {
  const invoke = vi.fn((cmd: string, args?: unknown) => {
    // Mock implementations for common Tauri commands
    // Note: Services themselves handle isTauriEnvironment() checks and throw appropriately
    // This mock provides fixture data when commands are actually invoked
    switch (cmd) {
      // Auth commands
      case 'local_login':
        return Promise.resolve({
          user_id: 'USER-1',
          username: 'testuser',
          full_name: 'Test User',
          role: 'STORE_MANAGER',
          assigned_store_id: 'STORE-ALPHA',
        });

      // Store commands
      case 'get_stores':
        return Promise.resolve<Store[]>([
          {
            id: 'STORE-ALPHA',
            code: 'ALPHA',
            name: 'Alpha Store',
            address: '123 Main St',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);

      case 'create_store':
        return Promise.resolve<Store>({
          id: 'STORE-NEW',
          code: (args as { input: { code: string } }).input.code,
          name: (args as { input: { name: string } }).input.name,
          address: (args as { input: { address?: string } }).input.address || null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      case 'update_store':
        return Promise.resolve<Store>({
          id: (args as { input: { id: string } }).input.id,
          code: 'UPDATED',
          name: (args as { input: { name: string } }).input.name,
          address: (args as { input: { address?: string } }).input.address || null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      case 'toggle_store_active':
        return Promise.resolve<Store>({
          id: (args as { id: string }).id,
          code: 'ALPHA',
          name: 'Alpha Store',
          address: '123 Main St',
          is_active: (args as { is_active: boolean }).is_active,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      case 'register_device':
        return Promise.resolve<Device>({
          id: 'DEVICE-1',
          store_id: (args as { storeId: string }).storeId,
          device_name: (args as { deviceName: string }).deviceName,
          is_active: true,
          registered_at: new Date().toISOString(),
        });

      // Product commands
      case 'get_products':
        return Promise.resolve<Product[]>([
          {
            id: 'PROD-1',
            sku: 'WIDGET-A',
            name: 'Widget Alpha',
            category: 'Electronics',
            unit: 'pcs',
            is_active: true,
            low_stock_threshold: 10,
            stock_quantity: 50,
            serial_tracking_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'PROD-2',
            sku: 'GADGET-B',
            name: 'Gadget Beta',
            category: 'Electronics',
            unit: 'pcs',
            is_active: true,
            low_stock_threshold: 5,
            stock_quantity: 3,
            serial_tracking_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'PROD-3',
            sku: 'CABLE-C',
            name: 'Cable Gamma',
            category: 'Accessories',
            unit: 'm',
            is_active: true,
            low_stock_threshold: null,
            stock_quantity: 100,
            serial_tracking_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'PROD-4',
            sku: 'MOUSE-D',
            name: 'Mouse Delta',
            category: 'Accessories',
            unit: 'pcs',
            is_active: true,
            low_stock_threshold: 20,
            stock_quantity: 0,
            serial_tracking_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);

      case 'get_products_by_store': {
        const storeId =
          (args as { storeId?: string; store_id?: string })?.storeId ||
          (args as { storeId?: string; store_id?: string })?.store_id ||
          'STORE-ALPHA';
        return Promise.resolve<Product[]>([
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
            store_id: storeId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
            store_id: storeId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
      }

      case 'get_products_paginated':
        return Promise.resolve<Product[]>([
          {
            id: 'PROD-1',
            sku: 'WIDGET-A',
            name: 'Widget Alpha',
            category: 'Electronics',
            unit: 'pcs',
            is_active: true,
            low_stock_threshold: 10,
            stock_quantity: 50,
            serial_tracking_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'PROD-2',
            sku: 'GADGET-B',
            name: 'Gadget Beta',
            category: 'Electronics',
            unit: 'pcs',
            is_active: true,
            low_stock_threshold: 5,
            stock_quantity: 3,
            serial_tracking_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);

      case 'get_products_count':
        return Promise.resolve(2);

      case 'list_local_backups':
        return Promise.resolve<BackupInfo[]>([]);

      case 'search_products_fts5':
      case 'search_products': {
        const query = ((args as { query?: string })?.query || '').toLowerCase();
        const allProducts: Product[] = [
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'PROD-1',
            sku: 'WIDGET-A',
            name: 'Widget Alpha',
            category: 'Electronics',
            unit: 'pcs',
            is_active: true,
            low_stock_threshold: 10,
            stock_quantity: 50,
            serial_tracking_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'PROD-2',
            sku: 'GADGET-B',
            name: 'Gadget Beta',
            category: 'Electronics',
            unit: 'pcs',
            is_active: true,
            low_stock_threshold: 5,
            stock_quantity: 3,
            serial_tracking_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'PROD-01',
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'PROD-02',
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
        if (!query) return Promise.resolve(allProducts);
        const filtered = allProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query),
        );
        return Promise.resolve(filtered.length > 0 ? filtered : allProducts);
      }

      case 'create_product':
        return Promise.resolve<Product>({
          id: 'PROD-NEW',
          sku: (args as { input: { sku: string } }).input.sku,
          name: (args as { input: { name: string } }).input.name,
          category: (args as { input: { category: string } }).input.category,
          unit: (args as { input: { unit?: string } }).input.unit || 'pcs',
          is_active: true,
          serial_tracking_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      case 'update_product':
        return Promise.resolve<Product>({
          id: (args as { input: { id: string } }).input.id,
          sku: 'UPDATED-SKU',
          name: (args as { input: { name: string } }).input.name,
          category: (args as { input: { category: string } }).input.category,
          unit: (args as { input: { unit?: string } }).input.unit || 'pcs',
          is_active: true,
          serial_tracking_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      case 'toggle_product_active':
        return Promise.resolve<Product>({
          id: (args as { id: string }).id,
          sku: 'WIDGET-A',
          name: 'Widget Alpha',
          category: 'Electronics',
          unit: 'pcs',
          is_active: (args as { is_active: boolean }).is_active,
          serial_tracking_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      // Stock commands
      case 'get_stock_balances_for_store':
        return Promise.resolve([
          {
            id: 'SB-STORE-ALPHA-PROD-1',
            store_id: 'STORE-ALPHA',
            product_id: 'PROD-1',
            stock_bucket: 'AVAILABLE',
            quantity: 50,
            updated_at: new Date().toISOString(),
          },
          {
            id: 'SB-STORE-ALPHA-PROD-2',
            store_id: 'STORE-ALPHA',
            product_id: 'PROD-2',
            stock_bucket: 'AVAILABLE',
            quantity: 3,
            updated_at: new Date().toISOString(),
          },
        ]);

      case 'get_stock_balance': {
        const sid =
          (args as { store_id?: string; storeId?: string }).store_id ||
          (args as { store_id?: string; storeId?: string }).storeId ||
          'STORE-ALPHA';
        const pid =
          (args as { product_id?: string; productId?: string }).product_id ||
          (args as { product_id?: string; productId?: string }).productId ||
          'PROD-1';
        return Promise.resolve({
          id: `SB-${sid}-${pid}-AVAILABLE`,
          store_id: sid,
          product_id: pid,
          stock_bucket: 'AVAILABLE',
          quantity: 50,
          updated_at: new Date().toISOString(),
        });
      }

      case 'get_stock_balance_for_bucket': {
        const sid2 =
          (args as { store_id?: string; storeId?: string }).store_id ||
          (args as { store_id?: string; storeId?: string }).storeId ||
          'STORE-ALPHA';
        const pid2 =
          (args as { product_id?: string; productId?: string }).product_id ||
          (args as { product_id?: string; productId?: string }).productId ||
          'PROD-1';
        const bkt =
          (args as { bucket?: string; stock_bucket?: string }).bucket ||
          (args as { bucket?: string; stock_bucket?: string }).stock_bucket ||
          'AVAILABLE';
        return Promise.resolve({
          id: `SB-${sid2}-${pid2}-${bkt}`,
          store_id: sid2,
          product_id: pid2,
          stock_bucket: bkt,
          quantity: bkt === 'AVAILABLE' ? 50 : 0,
          updated_at: new Date().toISOString(),
        });
      }

      // Transaction commands
      case 'get_local_transactions':
        return Promise.resolve<InventoryTransaction[]>([
          {
            transaction_id: 'TXN-1',
            store_id: 'STORE-ALPHA',
            product_id: 'PROD-1',
            movement_type: 'RECEIPT',
            stock_bucket: 'AVAILABLE',
            quantity_delta: 50,
            occurred_at: new Date().toISOString(),
            recorded_at: new Date().toISOString(),
            user_id: 'USER-1',
            device_id: 'DEVICE-1',
            reference_number: 'PO-001',
            reason_code: null,
            transfer_id: null,
            purchase_order_id: 'PO-001',
            batch_id: null,
            client_sequence: null,
            sync_status: 'PENDING',
            server_accepted_at: null,
            original_transaction_id: null,
            product_name: 'Widget Alpha',
          },
          {
            transaction_id: 'TXN-2',
            store_id: 'STORE-ALPHA',
            product_id: 'PROD-1',
            movement_type: 'SALE',
            stock_bucket: 'AVAILABLE',
            quantity_delta: -5,
            occurred_at: new Date().toISOString(),
            recorded_at: new Date().toISOString(),
            user_id: 'U1',
            device_id: 'D1',
            reference_number: null,
            reason_code: null,
            transfer_id: null,
            purchase_order_id: null,
            batch_id: null,
            client_sequence: null,
            sync_status: 'SYNCED',
            server_accepted_at: null,
            original_transaction_id: null,
            product_name: 'Widget Alpha',
          },
          {
            transaction_id: 'TXN-3',
            store_id: 'STORE-ALPHA',
            product_id: 'PROD-2',
            movement_type: 'RECEIPT',
            stock_bucket: 'AVAILABLE',
            quantity_delta: 10,
            occurred_at: new Date().toISOString(),
            recorded_at: new Date().toISOString(),
            user_id: 'U1',
            device_id: 'D1',
            reference_number: null,
            reason_code: null,
            transfer_id: null,
            purchase_order_id: null,
            batch_id: null,
            client_sequence: null,
            sync_status: 'PENDING',
            server_accepted_at: null,
            original_transaction_id: null,
            product_name: 'Gadget Beta',
          },
        ]);

      case 'receive_stock':
        return Promise.resolve<InventoryTransaction>({
          transaction_id: 'TXN-RECEIVE',
          store_id: (args as { input?: { store_id?: string } }).input?.store_id || 'STORE-ALPHA',
          product_id: (args as { input?: { product_id?: string } }).input?.product_id || 'PROD-1',
          movement_type: 'RECEIPT',
          stock_bucket: 'AVAILABLE',
          quantity_delta: (args as { input?: { quantity?: number } }).input?.quantity || 1,
          occurred_at: new Date().toISOString(),
          recorded_at: new Date().toISOString(),
          user_id: (args as { input?: { user_id?: string } }).input?.user_id || 'USER-1',
          device_id: (args as { input?: { device_id?: string } }).input?.device_id || 'DEVICE-1',
          reference_number:
            (args as { input?: { reference_number?: string } }).input?.reference_number || null,
          reason_code: null,
          transfer_id: null,
          purchase_order_id: null,
          batch_id: null,
          client_sequence: null,
          sync_status: 'PENDING',
          server_accepted_at: null,
          original_transaction_id: null,
        });

      case 'sell_stock':
        return Promise.resolve<InventoryTransaction>({
          transaction_id: 'TXN-SELL',
          store_id: (args as { input?: { store_id?: string } }).input?.store_id || 'STORE-ALPHA',
          product_id: (args as { input?: { product_id?: string } }).input?.product_id || 'PROD-1',
          movement_type: 'SALE',
          stock_bucket: 'AVAILABLE',
          quantity_delta: -((args as { input?: { quantity?: number } }).input?.quantity || 1),
          occurred_at: new Date().toISOString(),
          recorded_at: new Date().toISOString(),
          user_id: (args as { input?: { user_id?: string } }).input?.user_id || 'USER-1',
          device_id: (args as { input?: { device_id?: string } }).input?.device_id || 'DEVICE-1',
          reference_number:
            (args as { input?: { reference_number?: string } }).input?.reference_number || null,
          reason_code: null,
          transfer_id: null,
          purchase_order_id: null,
          batch_id: null,
          client_sequence: null,
          sync_status: 'PENDING',
          server_accepted_at: null,
          original_transaction_id: null,
        });

      case 'return_stock':
        return Promise.resolve<InventoryTransaction>({
          transaction_id: 'TXN-RETURN',
          store_id: (args as { input?: { store_id?: string } }).input?.store_id || 'STORE-ALPHA',
          product_id: (args as { input?: { product_id?: string } }).input?.product_id || 'PROD-1',
          movement_type: 'RETURN',
          stock_bucket: 'AVAILABLE',
          quantity_delta: (args as { input?: { quantity?: number } }).input?.quantity || 1,
          occurred_at: new Date().toISOString(),
          recorded_at: new Date().toISOString(),
          user_id: (args as { input?: { user_id?: string } }).input?.user_id || 'USER-1',
          device_id: (args as { input?: { device_id?: string } }).input?.device_id || 'DEVICE-1',
          reference_number: null,
          reason_code: (args as { input?: { reason_code?: string } }).input?.reason_code || null,
          transfer_id: null,
          purchase_order_id: null,
          batch_id: null,
          client_sequence: null,
          sync_status: 'PENDING',
          server_accepted_at: null,
          original_transaction_id: null,
        });

      case 'move_stock_bucket':
        return Promise.resolve<InventoryTransaction>({
          transaction_id: 'TXN-MOVE',
          store_id: (args as { input?: { store_id?: string } }).input?.store_id || 'STORE-ALPHA',
          product_id: (args as { input?: { product_id?: string } }).input?.product_id || 'PROD-1',
          movement_type: 'DAMAGE',
          stock_bucket: ((args as { input?: { to_bucket?: StockBucket } }).input?.to_bucket ||
            'DAMAGED') as StockBucket,
          quantity_delta:
            (args as { input?: { quantity_delta?: number } }).input?.quantity_delta || -1,
          occurred_at: new Date().toISOString(),
          recorded_at: new Date().toISOString(),
          user_id: (args as { input?: { user_id?: string } }).input?.user_id || 'USER-1',
          device_id: (args as { input?: { device_id?: string } }).input?.device_id || 'DEVICE-1',
          reference_number: null,
          reason_code: (args as { input?: { reason_code?: string } }).input?.reason_code || null,
          transfer_id: null,
          purchase_order_id: null,
          batch_id: null,
          client_sequence: null,
          sync_status: 'PENDING',
          server_accepted_at: null,
          original_transaction_id: null,
        });

      case 'adjust_stock':
        return Promise.resolve<InventoryTransaction>({
          transaction_id: 'TXN-ADJUST',
          store_id: (args as { input?: { store_id?: string } }).input?.store_id || 'STORE-ALPHA',
          product_id: (args as { input?: { product_id?: string } }).input?.product_id || 'PROD-1',
          movement_type: 'ADJUSTMENT',
          stock_bucket: 'AVAILABLE',
          quantity_delta:
            (args as { input?: { quantity_delta?: number } }).input?.quantity_delta || 0,
          occurred_at: new Date().toISOString(),
          recorded_at: new Date().toISOString(),
          user_id: (args as { input?: { user_id?: string } }).input?.user_id || 'USER-1',
          device_id: (args as { input?: { device_id?: string } }).input?.device_id || 'DEVICE-1',
          reference_number: null,
          reason_code: (args as { input?: { reason_code?: string } }).input?.reason_code || null,
          transfer_id: null,
          purchase_order_id: null,
          batch_id: null,
          client_sequence: null,
          sync_status: 'PENDING',
          server_accepted_at: null,
          original_transaction_id: null,
        });

      case 'create_transaction':
        return Promise.resolve<InventoryTransaction>({
          transaction_id: 'TXN-NEW',
          store_id: (args as { input: { store_id: string } }).input.store_id,
          product_id: (args as { input: { product_id: string } }).input.product_id,
          movement_type: (args as { input: { movement_type: MovementType } }).input
            .movement_type as MovementType,
          stock_bucket: (args as { input: { stock_bucket: StockBucket } }).input
            .stock_bucket as StockBucket,
          quantity_delta: (args as { input: { quantity_delta: number } }).input.quantity_delta,
          occurred_at: new Date().toISOString(),
          recorded_at: new Date().toISOString(),
          user_id: 'USER-1',
          device_id: 'DEVICE-1',
          reference_number:
            (args as { input: { reference_number?: string } }).input.reference_number || null,
          reason_code: (args as { input: { reason_code?: string } }).input.reason_code || null,
          transfer_id: null,
          purchase_order_id: null,
          batch_id: null,
          client_sequence: null,
          sync_status: 'PENDING',
          server_accepted_at: null,
          original_transaction_id: null,
        });

      case 'update_transaction':
        return Promise.resolve<InventoryTransaction>({
          transaction_id:
            (args as { input?: { transaction_id?: string } }).input?.transaction_id || 'TXN-1',
          store_id: (args as { input?: { store_id?: string } }).input?.store_id || 'STORE-ALPHA',
          product_id: (args as { input?: { product_id?: string } }).input?.product_id || 'PROD-1',
          movement_type: ((args as { input?: { movement_type?: MovementType } }).input
            ?.movement_type || 'RECEIPT') as MovementType,
          stock_bucket: ((args as { input?: { stock_bucket?: StockBucket } }).input?.stock_bucket ||
            'AVAILABLE') as StockBucket,
          quantity_delta:
            (args as { input?: { quantity_delta?: number } }).input?.quantity_delta || 0,
          occurred_at: new Date().toISOString(),
          recorded_at: new Date().toISOString(),
          user_id: (args as { input?: { user_id?: string } }).input?.user_id || 'USER-1',
          device_id: (args as { input?: { device_id?: string } }).input?.device_id || 'DEVICE-1',
          reference_number:
            (args as { input?: { reference_number?: string } }).input?.reference_number || null,
          reason_code: (args as { input?: { reason_code?: string } }).input?.reason_code || null,
          transfer_id: null,
          purchase_order_id: null,
          batch_id: null,
          client_sequence: null,
          sync_status: 'PENDING',
          server_accepted_at: null,
          original_transaction_id: null,
        });

      case 'delete_transaction':
        return Promise.resolve(undefined);

      // Sync commands
      case 'get_last_sync_timestamp':
        return Promise.resolve(null);

      case 'set_last_sync_timestamp':
        return Promise.resolve(undefined);

      case 'get_pending_outbox_count':
        return Promise.resolve(0);

      case 'get_pending_outbox_events':
        return Promise.resolve<OutboxEventRow[]>([]);

      case 'update_outbox_event_status':
      case 'update_outbox_event_statuses':
        return Promise.resolve(undefined);

      case 'update_transaction_sync_status':
      case 'update_transaction_sync_statuses':
        return Promise.resolve(undefined);

      case 'apply_sync_pull':
        return Promise.resolve({ products: 0, stores: 0, stock_balances: 0 });

      case 'upsert_product_from_server':
      case 'upsert_store_from_server':
      case 'upsert_stock_balance_from_server':
        return Promise.resolve(undefined);

      // Transfer commands
      case 'get_transfers':
        return Promise.resolve([]);

      case 'create_transfer':
        return Promise.resolve({
          id: 'TRF-1',
          source_store_id: (args as { source_store_id: string }).source_store_id,
          destination_store_id: (args as { destination_store_id: string }).destination_store_id,
          product_id: (args as { product_id: string }).product_id,
          quantity: (args as { quantity: number }).quantity,
          status: 'PENDING',
          created_by_user_id: (args as { created_by_user_id: string }).created_by_user_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      case 'dispatch_transfer':
      case 'receive_transfer':
      case 'cancel_transfer':
      case 'mark_transfer_exception':
        return Promise.resolve(undefined);

      // Default fallback for unhandled commands in Tauri environment
      default:
        console.warn(`[Tauri Mock] Unhandled invoke: ${cmd}`, args);
        return Promise.reject(new Error(`Tauri command '${cmd}' not mocked in test setup`));
    }
  });

  return { invoke };
});

// Also define window.__TAURI_INTERNALS__ for isTauriEnvironment() checks
// and for any code that accesses it directly. Tests may overwrite this
// (e.g. PhysicalCountAdjustmentView.test.tsx) but the vi.mock above
// ensures @tauri-apps/api/core.invoke always works.
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {
    invoke: vi.fn(),
  },
  writable: true,
  configurable: true,
});

// Pre-seed an authenticated session for all tests so App.test.tsx works
// without needing to mock tauriAuthService individually.
beforeEach(async () => {
  const { _setMemSession } = await import('./helpers');
  _setMemSession({
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    user_id: 'USER-DEMO',
    username: 'demo',
    full_name: 'Demo User',
    role: 'STORE_MANAGER',
    assigned_store_id: null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(), // +24 h
    token_expired_offline: false,
  });
});
