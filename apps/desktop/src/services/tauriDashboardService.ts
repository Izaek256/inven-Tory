/**
 * tauriDashboardService.
 *
 * Thin wrapper around the `get_dashboard_analytics` Tauri command, which does
 * all Analytics Dashboard aggregation in SQLite (B1/B2/B3/B4). The view used
 * to ship the full product + ledger catalogues over IPC and aggregate in JS;
 * now a single bounded query set returns the completed payload.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriStoreService';
import { DashboardAnalytics } from '../types/dashboard';

/** Zeroed fallback returned outside the desktop runtime / on IPC failure. */
export function emptyAnalytics(): DashboardAnalytics {
  return {
    kpis: {
      total_products_current: 0,
      total_products_prior: 0,
      total_stock_units: 0,
      stock_delta_current: 0,
      stock_delta_prior: 0,
      products_in_multiple_stores: 0,
      receipt_linked_sales_current: 0,
      receipt_linked_sales_prior: 0,
    },
    stock_trend: [],
    category_distribution: [],
    stock_status_by_category: [],
    most_sold_products: [],
    low_stock_alerts: [],
    recent_activity: [],
  };
}

/**
 * Fetch the aggregated Analytics Dashboard payload for the given date range.
 *
 * @param storeId   Active store id to scope every metric to, or null/'' for
 *                  global (all stores) aggregation.
 * @param startDate Inclusive range start (YYYY-MM-DD).
 * @param endDate   Inclusive range end (YYYY-MM-DD).
 */
export async function getDashboardAnalytics(
  storeId: string | null,
  startDate: string,
  endDate: string,
): Promise<DashboardAnalytics> {
  if (isTauriEnvironment()) {
    try {
      const payload = await invoke<DashboardAnalytics>('get_dashboard_analytics', {
        storeId,
        startDate,
        endDate,
      });
      return {
        ...emptyAnalytics(),
        ...payload,
        kpis: { ...emptyAnalytics().kpis, ...payload?.kpis },
        stock_trend: payload?.stock_trend ?? [],
        category_distribution: payload?.category_distribution ?? [],
        stock_status_by_category: payload?.stock_status_by_category ?? [],
        most_sold_products: payload?.most_sold_products ?? [],
        low_stock_alerts: payload?.low_stock_alerts ?? [],
        recent_activity: payload?.recent_activity ?? [],
      };
    } catch (err) {
      throw new Error(`Failed to load dashboard analytics: ${String(err)}`);
    }
  }
  return emptyAnalytics();
}
