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
