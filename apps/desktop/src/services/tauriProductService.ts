import { invoke } from '@tauri-apps/api/core';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product';
import { isTauriEnvironment } from './tauriStoreService';
import { searchLocal as _searchLocal } from './tauriDataService';

export interface BatchProductInput {
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  category: string;
  unit?: string;
  barcode?: string;
  alternate_names?: string;
}

export interface BatchProductResult {
  row_index: number;
  success: boolean;
  error: string | null;
  product_id: string | null;
  sku: string | null;
}

/**
 * Search the local SQLite FTS5 index directly (no network request).
 * Returns ranked search results for the given query string.
 */
export async function searchLocal(
  query: string,
  storeId?: string | null,
  limit?: number,
): Promise<Product[]> {
  const results = await _searchLocal(query, storeId, limit);
  return results.map(
    (r) =>
      ({
        id: r.product_id,
        sku: r.sku,
        name: r.name,
        brand: r.brand,
        model: null,
        category: '',
        unit: '',
        barcode: null,
        alternate_names: null,
        serial_tracking_enabled: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      }) as Product,
  );
}

export async function initFTS5Index(): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    return await invoke<boolean>('init_fts5_index');
  } catch {
    return false;
  }
}

function _triggerAutoSync(): void {
  const envBaseUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
      : undefined;
  const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

  import('./tauriSyncService')
    .then(({ triggerSync }) => {
      void triggerSync({ apiBaseUrl }).catch(() => undefined);
    })
    .catch(() => undefined);
}

async function _fetchApi<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const { getAccessToken } = await import('./tauriAuthService');
    const token = await getAccessToken();
    const envBaseUrl =
      typeof import.meta !== 'undefined'
        ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
        : undefined;
    const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers,
        signal: options.signal ?? controller.signal,
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Network / API unreachable
  }
  return null;
}

export async function getProducts(): Promise<Product[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Product[]>('get_products');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] getProducts failed:', err);
      throw new Error(`Failed to load products: ${String(err)}`);
    }
  }

  const apiProducts = await _fetchApi<Product[]>('/products');
  if (apiProducts) return apiProducts;

  throw new Error('[ProductService] getProducts() requires the desktop app runtime.');
}

export async function getProductsPaginated(
  limit: number,
  offset: number,
  category?: string | null,
): Promise<Product[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Product[]>('get_products_paginated', {
        limit,
        offset,
        category: category ?? null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] getProductsPaginated failed:', err);
      throw new Error(`Failed to load products: ${String(err)}`);
    }
  }
  throw new Error('[ProductService] getProductsPaginated() requires the desktop app runtime.');
}

export async function getProductsCount(category?: string | null): Promise<number> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<number>('get_products_count', { category: category ?? null });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] getProductsCount failed:', err);
      throw new Error(`Failed to count products: ${String(err)}`);
    }
  }
  throw new Error('[ProductService] getProductsCount() requires the desktop app runtime.');
}

/** Distinct product categories for the products-view category filter. */
export async function getProductCategories(): Promise<string[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<string[]>('get_product_categories');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] getProductCategories failed:', err);
      throw new Error(`Failed to load product categories: ${String(err)}`);
    }
  }
  return [];
}

export async function searchProducts(query: string, storeId?: string | null): Promise<Product[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Product[]>('search_products_fts5', { query, storeId });
    } catch {
      try {
        return await invoke<Product[]>('search_products', { query, storeId });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ProductService] searchProducts failed:', err);
        throw new Error(`Failed to search products: ${String(err)}`);
      }
    }
  }

  const apiResults = await _fetchApi<Product[]>(`/products?search=${encodeURIComponent(query)}`);
  if (apiResults) return apiResults;

  throw new Error('[ProductService] searchProducts() requires the desktop app runtime.');
}

export async function searchProductsFts5(
  query: string,
  storeId?: string | null,
): Promise<Product[]> {
  if (isTauriEnvironment()) {
    try {
      const results = await invoke<Product[]>('search_products_fts5', { query, storeId });
      if (results && results.length > 0) {
        return results;
      }
      return await invoke<Product[]>('search_products', { query, storeId });
    } catch {
      try {
        return await invoke<Product[]>('search_products', { query, storeId });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ProductService] searchProductsFts5 failed:', err);
        throw new Error(`Failed to search products (FTS5): ${String(err)}`);
      }
    }
  }

  const apiResults = await _fetchApi<Product[]>(`/products?search=${encodeURIComponent(query)}`);
  if (apiResults) return apiResults;

  throw new Error('[ProductService] searchProductsFts5() requires the desktop app runtime.');
}

/**
 * Return the active products available for operation in a given store.
 *
 * In the Tauri runtime this uses the store-scoped SQL command so products from
 * other stores are never returned. In browser/test environments it falls back
 * to a best-effort local filter.
 */
export async function getProductsByStore(storeId: string): Promise<Product[]> {
  if (isTauriEnvironment()) {
    try {
      const scoped = await invoke<Product[]>('get_products_by_store', {
        storeId,
        store_id: storeId,
      });
      return scoped.filter((p) => p.is_active);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] getProductsByStore failed:', err);
    }
  }

  const all = await getProducts();
  const byStore = all.filter(
    (p) => p.store_id === storeId || p.store_id === undefined || p.store_id === null,
  );
  return byStore.filter((p) => p.is_active);
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  if (isTauriEnvironment()) {
    try {
      const product = await invoke<Product>('create_product', { input });
      _triggerAutoSync();
      return product;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] createProduct failed:', err);
      throw new Error(String(err));
    }
  }

  const created = await _fetchApi<Product>('/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (created) return created;

  throw new Error('[ProductService] createProduct() requires the desktop app runtime.');
}

export async function updateProduct(input: UpdateProductInput): Promise<Product> {
  if (isTauriEnvironment()) {
    try {
      const product = await invoke<Product>('update_product', { input });
      _triggerAutoSync();
      return product;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] updateProduct failed:', err);
      throw new Error(String(err));
    }
  }

  const updated = await _fetchApi<Product>(`/products/${input.id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (updated) return updated;

  throw new Error('[ProductService] updateProduct() requires the desktop app runtime.');
}

export async function toggleProductActive(id: string, is_active: boolean): Promise<Product> {
  if (isTauriEnvironment()) {
    try {
      const product = await invoke<Product>('toggle_product_active', {
        id,
        isActive: is_active,
        is_active,
      });
      _triggerAutoSync();
      return product;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] toggleProductActive failed:', err);
      throw new Error(String(err));
    }
  }

  // NOTE: the dedicated toggle-active endpoint is required here. PATCH
  // /products/{id} only accepts product fields — sending { is_active } to
  // it is silently ignored (200 OK, nothing changes).
  const toggled = await _fetchApi<Product>(`/products/${id}/toggle-active`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
  if (toggled) return toggled;

  throw new Error('[ProductService] toggleProductActive() requires the desktop app runtime.');
}

export async function createProductsBatch(
  inputs: BatchProductInput[],
): Promise<BatchProductResult[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<BatchProductResult[]>('create_products_batch', {
        inputs,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProductService] createProductsBatch failed:', err);
      throw new Error(String(err));
    }
  }

  throw new Error('[ProductService] createProductsBatch() requires the desktop app runtime.');
}
