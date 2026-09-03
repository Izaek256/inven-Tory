import { invoke } from '@tauri-apps/api/core';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product';
import { isTauriEnvironment } from './tauriStoreService';

let MOCK_PRODUCTS: Product[] = [
  {
    id: 'PROD-IPHONE15PRO',
    sku: 'ELEC-IPHONE15PRO',
    name: 'Apple iPhone 15 Pro 256GB',
    brand: 'Apple',
    model: 'A3102',
    category: 'Smartphones',
    unit: 'pcs',
    barcode: '195949012345',
    alternate_names: 'iPhone 15 Pro, Apple Phone 15',
    serial_tracking_enabled: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'PROD-SAMSUNGS24',
    sku: 'ELEC-SAMSUNG-S24',
    name: 'Samsung Galaxy S24 Ultra',
    brand: 'Samsung',
    model: 'SM-S928B',
    category: 'Smartphones',
    unit: 'pcs',
    barcode: '880609501234',
    alternate_names: 'S24 Ultra, Samsung Galaxy Phone',
    serial_tracking_enabled: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'PROD-MACBOOKM3',
    sku: 'ELEC-MACBOOK-M3',
    name: 'Apple MacBook Air 15" M3',
    brand: 'Apple',
    model: 'MRYM3LL/A',
    category: 'Laptops',
    unit: 'pcs',
    barcode: '195949567890',
    alternate_names: 'MacBook Air M3, MBA 15',
    serial_tracking_enabled: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'PROD-SONYXM5',
    sku: 'ELEC-SONY-XM5',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    brand: 'Sony',
    model: 'WH1000XM5/B',
    category: 'Audio',
    unit: 'pcs',
    barcode: '027242922112',
    alternate_names: 'XM5, Sony ANC Headphones',
    serial_tracking_enabled: false,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

/**
 * Fetch all products from local SQLite DB.
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

  throw new Error(
    '[TauriProductService] toggleProductActive() requires the Tauri runtime. Non-Tauri environments are not supported in production.',
  );
}
