/**
 * Property tests for non-Tauri service throws (Property 2).
 *
 * Verifies that Tauri services throw errors when not in a Tauri environment
 * instead of returning mock data in production code paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tauriProductService from '../services/tauriProductService';
import * as tauriStoreService from '../services/tauriStoreService';
import * as tauriTransactionService from '../services/tauriTransactionService';
import * as tauriTransferService from '../services/tauriTransferService';

describe('Property 2: Non-Tauri service throws', (): void => {
  beforeEach((): void => {
    vi.restoreAllMocks();
    // Mock isTauriEnvironment to return false (non-Tauri environment)
    vi.spyOn(tauriStoreService, 'isTauriEnvironment').mockReturnValue(false);
  });

  describe('tauriProductService', (): void => {
    it('getProducts throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriProductService.getProducts()).rejects.toThrow(
        '[TauriProductService] getProducts() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('searchProducts throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriProductService.searchProducts('test')).rejects.toThrow(
        '[TauriProductService] searchProducts() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('createProduct throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriProductService.createProduct({
          sku: 'TEST-001',
          name: 'Test Product',
          category: 'Test',
          unit: 'pcs',
        }),
      ).rejects.toThrow(
        '[TauriProductService] createProduct() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('updateProduct throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriProductService.updateProduct({
          id: 'PROD-001',
          name: 'Updated Name',
          category: 'Test',
          unit: 'pcs',
          serial_tracking_enabled: false,
        }),
      ).rejects.toThrow(
        '[TauriProductService] updateProduct() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('toggleProductActive throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriProductService.toggleProductActive('PROD-001', false)).rejects.toThrow(
        '[TauriProductService] toggleProductActive() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });
  });

  describe('tauriStoreService', (): void => {
    it('getStores throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriStoreService.getStores()).rejects.toThrow(
        '[TauriStoreService] getStores() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('createStore throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriStoreService.createStore({
          code: 'TEST',
          name: 'Test Store',
        }),
      ).rejects.toThrow(
        '[TauriStoreService] createStore() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('updateStore throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriStoreService.updateStore({
          id: 'STORE-001',
          name: 'Updated Name',
        }),
      ).rejects.toThrow(
        '[TauriStoreService] updateStore() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('toggleStoreActive throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriStoreService.toggleStoreActive('STORE-001', false)).rejects.toThrow(
        '[TauriStoreService] toggleStoreActive() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('registerDevice throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriStoreService.registerDevice('STORE-001', 'Test Device')).rejects.toThrow(
        '[TauriStoreService] registerDevice() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });
  });

  describe('tauriTransactionService', (): void => {
    it('receiveStock throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.receiveStock({
          store_id: 'STORE-001',
          product_id: 'PROD-001',
          quantity: 10,
          movement_type: 'RECEIPT',
          user_id: 'USER-001',
          device_id: 'DEV-001',
        }),
      ).rejects.toThrow(
        '[TauriTransactionService] receiveStock() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('sellStock throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.sellStock({
          store_id: 'STORE-001',
          product_id: 'PROD-001',
          quantity: 5,
          movement_type: 'SALE',
          user_id: 'USER-001',
          device_id: 'DEV-001',
        }),
      ).rejects.toThrow(
        '[TauriTransactionService] sellStock() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('returnStock throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.returnStock({
          store_id: 'STORE-001',
          product_id: 'PROD-001',
          quantity: 3,
          return_type: 'CUSTOMER',
          stock_bucket: 'AVAILABLE',
          user_id: 'USER-001',
          device_id: 'DEV-001',
        }),
      ).rejects.toThrow(
        '[TauriTransactionService] returnStock() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('moveStockBucket throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.moveStockBucket({
          store_id: 'STORE-001',
          product_id: 'PROD-001',
          quantity: 2,
          from_bucket: 'AVAILABLE',
          to_bucket: 'DAMAGED',
          reason: 'Test reason',
          user_id: 'USER-001',
          device_id: 'DEV-001',
        }),
      ).rejects.toThrow(
        '[TauriTransactionService] moveStockBucket() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('getStockBalance throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.getStockBalance('STORE-001', 'PROD-001'),
      ).rejects.toThrow(
        '[TauriTransactionService] getStockBalance() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('getStockBalanceForBucket throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.getStockBalanceForBucket('STORE-001', 'PROD-001', 'AVAILABLE'),
      ).rejects.toThrow(
        '[TauriTransactionService] getStockBalanceForBucket() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('adjustStock throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.adjustStock({
          store_id: 'STORE-001',
          product_id: 'PROD-001',
          quantity_delta: 5,
          reason: 'Test adjustment',
          user_id: 'USER-001',
          device_id: 'DEV-001',
        }),
      ).rejects.toThrow(
        '[TauriTransactionService] adjustStock() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });
  });

  describe('tauriTransferService', (): void => {
    it('getTransfers throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriTransferService.getTransfers()).rejects.toThrow(
        '[TauriTransferService] getTransfers() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('createTransfer throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.createTransfer({
          source_store_id: 'STORE-A',
          destination_store_id: 'STORE-B',
          product_id: 'PROD-001',
          quantity: 5,
          created_by_user_id: 'USER-001',
        }),
      ).rejects.toThrow(
        '[TauriTransferService] createTransfer() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('dispatchTransfer throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.dispatchTransfer('TRF-001', 'USER-001', 'DEV-001'),
      ).rejects.toThrow(
        '[TauriTransferService] dispatchTransfer() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('receiveTransfer throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.receiveTransfer('TRF-001', 'USER-001', 'DEV-001'),
      ).rejects.toThrow(
        '[TauriTransferService] receiveTransfer() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('cancelTransfer throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.cancelTransfer('TRF-001', 'USER-001', 'DEV-001'),
      ).rejects.toThrow(
        '[TauriTransferService] cancelTransfer() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });

    it('markTransferException throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.markTransferException('TRF-001', 'Test note'),
      ).rejects.toThrow(
        '[TauriTransferService] markTransferException() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
      );
    });
  });
});
