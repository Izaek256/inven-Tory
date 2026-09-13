/**
 * Dashboard API service — wraps the Issue 16 endpoints + Phase 4 analytics.
 *
 * FR-SRCH-001: global product search
 * FR-SRCH-002/003: per-store quantities and global total
 * FR-SRCH-004: movement history
 * FR-SRCH-005: last-sync timestamp per store (returned in StoreInventoryResponse)
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

export async function searchProducts(
  query: string = '',
  limit = 200,
  scope: 'all-stores' | '' = '',
): Promise<ProductSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (scope) params.set('scope', scope);
  return api.get<ProductSearchResponse>(`/products/search?${params.toString()}`);
}

/** Dashboard analytics for the KPI tile grid (Phase 3, Task B). */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return api.get<DashboardMetrics>('/dashboard/metrics');
}

/** Stock trend time series (Phase 4, Task C). */
export async function getStockTrend(
  startDate?: string,
  endDate?: string,
): Promise<StockTrendResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  return api.get<StockTrendResponse>(`/dashboard/stock-trend?${params.toString()}`);
}

/** Category distribution for donut chart (Phase 4, Task D). */
export async function getCategoryDistribution(): Promise<CategoryDistributionResponse> {
  return api.get<CategoryDistributionResponse>('/dashboard/category-distribution');
}

/** Stock status by category for stacked bar chart (Phase 4, Task E). */
export async function getStockStatusByCategory(): Promise<StockStatusByCategoryResponse> {
  return api.get<StockStatusByCategoryResponse>('/dashboard/stock-status-by-category');
}

/** KPI period-over-period deltas (Phase 4, Task B). */
export async function getKPIDeltas(
  startDate?: string,
  endDate?: string,
): Promise<KPIDeltasResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  return api.get<KPIDeltasResponse>(`/dashboard/kpi-deltas?${params.toString()}`);
}

/** Most-sold products with trends (Phase 4, Task F). */
export async function getMostSoldExtended(
  startDate?: string,
  endDate?: string,
  limit = 10,
): Promise<MostSoldExtendedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  return api.get<MostSoldExtendedResponse>(`/dashboard/most-sold-extended?${params.toString()}`);
}

/** Recent activity feed (Phase 4, Task H). */
export async function getRecentActivity(limit = 20): Promise<RecentActivityResponse> {
  return api.get<RecentActivityResponse>(`/dashboard/recent-activity?limit=${limit}`);
}

/**
 * Stock-moving operation counts for the selected period, grouped by movement
 * type — feeds the Transactions / Returns / Damage & Quarantine KPI tiles.
 */
export async function getOperationsSummary(
  startDate?: string,
  endDate?: string,
): Promise<OperationsSummaryResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
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

export async function listStores(): Promise<
  Array<{ id: string; code: string; name: string; address?: string | null; is_active: boolean }>
> {
  return api.get('/stores');
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
