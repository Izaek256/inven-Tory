/**
 * Dashboard API service — wraps the Issue 16 endpoints + Phase 4 analytics.
 *
 * FR-SRCH-001: global product search
 * FR-SRCH-002/003: per-store quantities and global total
 * FR-SRCH-004: movement history
 * FR-SRCH-005: last-sync timestamp per store (returned in StoreInventoryResponse)
 *
 * Features: request deduplication, response caching with TTL,
 * server-side pagination, and AbortController-based cancellation.
 */

import { api } from './apiClient';
import type {
  DashboardMetrics,
  ProductHistoryResponse,
  ProductInventoryResponse,
  ProductSearchResponse,
  StoreInventoryResponse,
  StockTrendResponse,
  CategoryDistributionResponse,
  StockStatusByCategoryResponse,
  KPIDeltasResponse,
  MostSoldExtendedResponse,
  RecentActivityResponse,
  OperationsSummaryResponse,
} from '../types/dashboard';

const DEFAULT_TIMEOUT_MS = 30_000;
const inFlightRequests = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { data: unknown; expiresAt: number }>();

function getCacheTTL(): number {
  return Number(import.meta.env.VITE_API_CACHE_TTL_MS ?? 30_000);
}

function getCache(path: string): unknown {
  const entry = responseCache.get(path);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  responseCache.delete(path);
  return undefined;
}

function setCache(path: string, data: unknown): void {
  responseCache.set(path, { data, expiresAt: Date.now() + getCacheTTL() });
}

function getInFlight(path: string): Promise<unknown> | undefined {
  return inFlightRequests.get(path);
}

function setInFlight(path: string, promise: Promise<unknown>): void {
  inFlightRequests.set(path, promise);
}

function clearInFlight(path: string): void {
  inFlightRequests.delete(path);
}

export async function searchProductsServer(
  query: string = '',
  page = 1,
  pageSize = 50,
): Promise<ProductSearchResponse> {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(1000, Math.max(1, Math.floor(pageSize)));
  const offset = (safePage - 1) * safeSize;
  const params = new URLSearchParams({
    q: query,
    limit: String(safeSize),
    offset: String(offset),
  });
  const path = `/products/search?${params.toString()}`;
  const cached = getCache(path);
  if (cached !== undefined) return cached as ProductSearchResponse;

  const inFlight = getInFlight(path);
  if (inFlight) return inFlight as Promise<ProductSearchResponse>;

  const promise = api.get<ProductSearchResponse>(path, DEFAULT_TIMEOUT_MS);
  setInFlight(path, promise);
  try {
    const data = await promise;
    setCache(path, data);
    return data;
  } finally {
    clearInFlight(path);
  }
}

export async function searchProducts(
  query: string = '',
  limit = 100,
  scope: 'all-stores' | '' = '',
): Promise<ProductSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (scope) params.set('scope', scope);
  const path = `/products/search?${params.toString()}`;
  const cached = getCache(path);
  if (cached !== undefined) return cached as ProductSearchResponse;

  const inFlight = getInFlight(path);
  if (inFlight) return inFlight as Promise<ProductSearchResponse>;

  const promise = api.get<ProductSearchResponse>(path, DEFAULT_TIMEOUT_MS);
  setInFlight(path, promise);
  try {
    const data = await promise;
    setCache(path, data);
    return data;
  } finally {
    clearInFlight(path);
  }
}

/** Dashboard analytics for the KPI tile grid (Phase 3, Task B). */
export async function getDashboardMetrics(storeId?: string | null): Promise<DashboardMetrics> {
  const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
  return api.get<DashboardMetrics>(`/dashboard/metrics${qs}`);
}

/** Stock trend time series (Phase 4, Task C). */
export async function getStockTrend(
  startDate?: string,
  endDate?: string,
  storeId?: string | null,
): Promise<StockTrendResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (storeId) params.set('store_id', storeId);
  return api.get<StockTrendResponse>(`/dashboard/stock-trend?${params.toString()}`);
}

/** Category distribution for donut chart (Phase 4, Task D). */
export async function getCategoryDistribution(
  storeId?: string | null,
): Promise<CategoryDistributionResponse> {
  const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
  return api.get<CategoryDistributionResponse>(`/dashboard/category-distribution${qs}`);
}

/** Stock status by category for stacked bar chart (Phase 4, Task E). */
export async function getStockStatusByCategory(): Promise<StockStatusByCategoryResponse> {
  return api.get<StockStatusByCategoryResponse>('/dashboard/stock-status-by-category');
}

/** KPI period-over-period deltas (Phase 4, Task B). */
export async function getKPIDeltas(
  startDate?: string,
  endDate?: string,
  storeId?: string | null,
): Promise<KPIDeltasResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (storeId) params.set('store_id', storeId);
  return api.get<KPIDeltasResponse>(`/dashboard/kpi-deltas?${params.toString()}`);
}

/** Most-sold products with trends (Phase 4, Task F). */
export async function getMostSoldExtended(
  startDate?: string,
  endDate?: string,
  limit = 10,
  storeId?: string | null,
): Promise<MostSoldExtendedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (storeId) params.set('store_id', storeId);
  return api.get<MostSoldExtendedResponse>(`/dashboard/most-sold-extended?${params.toString()}`);
}

/** Recent activity feed (Phase 4, Task H). */
export async function getRecentActivity(
  limit = 20,
  storeId?: string | null,
): Promise<RecentActivityResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (storeId) params.set('store_id', storeId);
  return api.get<RecentActivityResponse>(`/dashboard/recent-activity?${params.toString()}`);
}

/**
 * Stock-moving operation counts for the selected period, grouped by movement
 * type — feeds the Transactions / Returns / Damage & Quarantine KPI tiles.
 */
export async function getOperationsSummary(
  startDate?: string,
  endDate?: string,
  storeId?: string | null,
): Promise<OperationsSummaryResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (storeId) params.set('store_id', storeId);
  const qs = params.toString();
  return api.get<OperationsSummaryResponse>(`/dashboard/operations-summary${qs ? `?${qs}` : ''}`);
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

export async function getStoresInventoryBulk(
  storeIds: string[],
): Promise<StoreInventoryResponse[]> {
  if (storeIds.length === 0) return [];
  const idsParam = storeIds.map(encodeURIComponent).join(',');
  const path = `/stores/inventory/bulk?ids=${idsParam}`;
  const cached = getCache(path);
  if (cached !== undefined) return cached as StoreInventoryResponse[];

  const inFlight = getInFlight(path);
  if (inFlight) return inFlight as Promise<StoreInventoryResponse[]>;

  const promise = api.get<StoreInventoryResponse[]>(path, DEFAULT_TIMEOUT_MS);
  setInFlight(path, promise);
  try {
    const data = await promise;
    setCache(path, data);
    return data;
  } finally {
    clearInFlight(path);
  }
}

export async function listStores(
  includePlaceholders = false,
): Promise<
  Array<{ id: string; code: string; name: string; address?: string | null; is_active: boolean }>
> {
  const stores =
    await api.get<
      Array<{ id: string; code: string; name: string; address?: string | null; is_active: boolean }>
    >('/stores');
  if (includePlaceholders) return stores;
  return stores.filter((s) => !s.name.startsWith('Auto Store ('));
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

export function abortAll(): void {
  inFlightRequests.clear();
}

export function clearResponseCache(): void {
  responseCache.clear();
}
