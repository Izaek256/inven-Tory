export interface StockTrendPoint {
  date: string;
  total_stock_units: number;
}

export interface CategoryDistributionPoint {
  category: string;
  count: number;
  percentage: number;
}

export interface StockStatusCategoryRow {
  category: string;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  total: number;
}

export interface KPIDelta {
  metric: string;
  current_value: number;
  prior_value: number;
  delta_absolute: number;
  delta_percentage: number | null;
  period_label: string;
}

export interface MostSoldProduct {
  product_id: string;
  product_name: string;
  category: string;
  units_sold: number;
  trend_direction: 'up' | 'down' | 'neutral';
  trend_percentage: number | null;
}

export type ActivityType =
  | 'stock_added'
  | 'stock_sold'
  | 'transfer_completed'
  | 'receipt_linked'
  | 'stock_removed'
  | 'adjustment'
  | 'damage'
  | 'return';

export interface RecentActivityItem {
  id: string;
  type: ActivityType;
  product_id: string;
  product_name: string;
  sku: string;
  store_id: string;
  store_name: string;
  quantity: number;
  occurred_at: string;
  reference_number: string | null;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface DashboardKPIs {
  total_products_current: number;
  total_products_prior: number;
  total_stock_units: number;
  stock_delta_current: number;
  stock_delta_prior: number;
  products_in_multiple_stores: number;
  receipt_linked_sales_current: number;
  receipt_linked_sales_prior: number;
}

export interface LowStockAlert {
  product_id: string;
  product_name: string;
  current_stock: number;
  threshold: number;
  category: string;
}

/**
 * Entire Analytics Dashboard payload, aggregated in SQLite by the
 * `get_dashboard_analytics` Tauri command (B1/B2/B3/B4). The view renders
 * straight from this payload — it no longer ships the full product/ledger
 * catalogues over IPC to derive these values in JS.
 */
export interface DashboardAnalytics {
  kpis: DashboardKPIs;
  stock_trend: StockTrendPoint[];
  category_distribution: CategoryDistributionPoint[];
  stock_status_by_category: StockStatusCategoryRow[];
  most_sold_products: MostSoldProduct[];
  low_stock_alerts: LowStockAlert[];
  recent_activity: RecentActivityItem[];
}
