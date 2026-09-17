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
        '[ProductService] getProducts() requires the desktop app runtime.',
      );
    });

    it('searchProducts throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriProductService.searchProducts('test')).rejects.toThrow(
        '[ProductService] searchProducts() requires the desktop app runtime.',
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
      ).rejects.toThrow('[ProductService] createProduct() requires the desktop app runtime.');
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
      ).rejects.toThrow('[ProductService] updateProduct() requires the desktop app runtime.');
    });

    it('toggleProductActive throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriProductService.toggleProductActive('PROD-001', false)).rejects.toThrow(
        '[ProductService] toggleProductActive() requires the desktop app runtime.',
      );
    });
  });

  describe('tauriStoreService', (): void => {
    it('getStores throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriStoreService.getStores()).rejects.toThrow(
        '[StoreService] getStores() requires the desktop app runtime.',
      );
    });

    it('createStore throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriStoreService.createStore({
          code: 'TEST',
          name: 'Test Store',
        }),
      ).rejects.toThrow('[StoreService] createStore() requires the desktop app runtime.');
    });

    it('updateStore throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriStoreService.updateStore({
          id: 'STORE-001',
          name: 'Updated Name',
        }),
      ).rejects.toThrow('[StoreService] updateStore() requires the desktop app runtime.');
    });

    it('toggleStoreActive throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriStoreService.toggleStoreActive('STORE-001', false)).rejects.toThrow(
        '[StoreService] toggleStoreActive() requires the desktop app runtime.',
      );
    });

    it('registerDevice throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriStoreService.registerDevice('STORE-001', 'Test Device')).rejects.toThrow(
        '[StoreService] registerDevice() requires the desktop app runtime.',
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
      ).rejects.toThrow('[TransactionService] receiveStock() requires the desktop app runtime.');
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
      ).rejects.toThrow('[TransactionService] sellStock() requires the desktop app runtime.');
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
      ).rejects.toThrow('[TransactionService] returnStock() requires the desktop app runtime.');
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
      ).rejects.toThrow('[TransactionService] moveStockBucket() requires the desktop app runtime.');
    });

    it('getStockBalance throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.getStockBalance('STORE-001', 'PROD-001'),
      ).rejects.toThrow('[TransactionService] getStockBalance() requires the desktop app runtime.');
    });

    it('getStockBalanceForBucket throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransactionService.getStockBalanceForBucket('STORE-001', 'PROD-001', 'AVAILABLE'),
      ).rejects.toThrow(
        '[TransactionService] getStockBalanceForBucket() requires the desktop app runtime.',
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
      ).rejects.toThrow('[TransactionService] adjustStock() requires the desktop app runtime.');
    });
  });

  describe('tauriTransferService', (): void => {
    it('getTransfers throws when not in Tauri environment', async (): Promise<void> => {
      await expect(tauriTransferService.getTransfers()).rejects.toThrow(
        '[TransferService] getTransfers() requires the desktop app runtime.',
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
      ).rejects.toThrow('[TransferService] createTransfer() requires the desktop app runtime.');
    });

    it('dispatchTransfer throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.dispatchTransfer('TRF-001', 'USER-001', 'DEV-001'),
      ).rejects.toThrow('[TransferService] dispatchTransfer() requires the desktop app runtime.');
    });

    it('receiveTransfer throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.receiveTransfer('TRF-001', 'USER-001', 'DEV-001'),
      ).rejects.toThrow('[TransferService] receiveTransfer() requires the desktop app runtime.');
    });

    it('cancelTransfer throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.cancelTransfer('TRF-001', 'USER-001', 'DEV-001'),
      ).rejects.toThrow('[TransferService] cancelTransfer() requires the desktop app runtime.');
    });

    it('markTransferException throws when not in Tauri environment', async (): Promise<void> => {
      await expect(
        tauriTransferService.markTransferException('TRF-001', 'Test note'),
      ).rejects.toThrow(
        '[TransferService] markTransferException() requires the desktop app runtime.',
      );
    });
  });
});
