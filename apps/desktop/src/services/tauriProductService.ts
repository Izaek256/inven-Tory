import { invoke } from '@tauri-apps/api/core';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product';
import { isTauriEnvironment } from './tauriStoreService';

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

/**
 * Fetch all products from local SQLite DB or central API fallback.
 */
export async function getProducts(): Promise<Product[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Product[]>('get_products');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriProductService] Error invoking get_products:', err);
      throw new Error(`Failed to load products: ${String(err)}`);
    }
  }

  const apiProducts = await _fetchApi<Product[]>('/products');
  if (apiProducts) return apiProducts;

  throw new Error(
    '[TauriProductService] getProducts() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Search products by term (FR-PROD-003: matches name, SKU, model, barcode, alternate_names).
 */
export async function searchProducts(query: string): Promise<Product[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Product[]>('search_products', { query });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriProductService] Error invoking search_products:', err);
      throw new Error(`Failed to search products: ${String(err)}`);
    }
  }

  const apiResults = await _fetchApi<Product[]>(`/products?search=${encodeURIComponent(query)}`);
  if (apiResults) return apiResults;

  throw new Error(
    '[TauriProductService] searchProducts() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Create a new product (FR-PROD-001, FR-PROD-002 - v1.0.0 fields only).
 */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Product>('create_product', { input });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriProductService] Error invoking create_product:', err);
      throw new Error(String(err));
    }
  }

  const created = await _fetchApi<Product>('/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (created) return created;

  throw new Error(
    '[TauriProductService] createProduct() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Update an existing product (v1.0.0 fields only; SKU and ID are immutable).
 */
export async function updateProduct(input: UpdateProductInput): Promise<Product> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Product>('update_product', { input });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriProductService] Error invoking update_product:', err);
      throw new Error(String(err));
    }
  }

  const updated = await _fetchApi<Product>(`/products/${input.id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (updated) return updated;

  throw new Error(
    '[TauriProductService] updateProduct() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}

/**
 * Activate or deactivate a product.
 */
export async function toggleProductActive(id: string, is_active: boolean): Promise<Product> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<Product>('toggle_product_active', { id, is_active });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TauriProductService] Error invoking toggle_product_active:', err);
      throw new Error(String(err));
    }
  }

  const toggled = await _fetchApi<Product>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
  if (toggled) return toggled;

  throw new Error(
    '[TauriProductService] toggleProductActive() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}
