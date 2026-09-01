/**
 * Dashboard API service — wraps the Issue 16 endpoints.
 *
 * FR-SRCH-001: global product search
 * FR-SRCH-002/003: per-store quantities and global total
 * FR-SRCH-004: movement history
 * FR-SRCH-005: last-sync timestamp per store (returned in StoreInventoryResponse)
 */

import { api } from './apiClient';
import type {
  ProductHistoryResponse,
  ProductInventoryResponse,
  ProductSearchResponse,
  StoreInventoryResponse,
} from '../types/dashboard';

export async function searchProducts(query: string, limit = 50): Promise<ProductSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return api.get<ProductSearchResponse>(`/products/search?${params.toString()}`);
}

export async function getProductInventory(productId: string): Promise<ProductInventoryResponse> {
  return api.get<ProductInventoryResponse>(`/products/${productId}/inventory`);
}

export async function getProductHistory(
  productId: string,
  storeId?: string,
  limit = 100,
): Promise<ProductHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (storeId) params.set('store_id', storeId);
  return api.get<ProductHistoryResponse>(`/products/${productId}/history?${params.toString()}`);
}

export async function getStoreInventory(storeId: string): Promise<StoreInventoryResponse> {
  return api.get<StoreInventoryResponse>(`/stores/${storeId}/inventory`);
}

export async function login(
  username: string,
  password: string,
  deviceId: string,
): Promise<{ access_token: string; role: string }> {
  return api.post<{ access_token: string; role: string }>('/auth/login', {
    username,
    password,
    device_id: deviceId,
  });
}
