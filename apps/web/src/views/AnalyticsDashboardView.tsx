/**
 * Analytics Dashboard — pure KPI tile grid (Phase 3, Task 2.1).
 *
 * No product table, no recent-activity table: those moved to their own views.
 * The tile grid is extensible — each tile is a DashboardTile dropped into a
 * responsive auto-fit grid, so more analytics can be added later freely.
 *
 * Tiles shipped:
 *   - Total products in catalogue
 *   - Total stock units (across all stores)
 *   - Most-sold products (from Sale/Issue transactions)
 *   - Last sync time
 *   - Low-stock alerts (products at/below their configured threshold)
 *   - Cross-store distribution summary
 *   - Receipt-linked sales volume (sales per day / avg items per receipt)
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  Clock,
  Layers,
  Package,
  ReceiptText,
  TrendingUp,
} from 'lucide-react';
import { EmptyState, Spinner } from '@invenTory/ui';
import { getDashboardMetrics } from '../services/dashboardService';
import type { DashboardMetrics, ReceiptSalesDayMetric } from '../types/dashboard';
import { DashboardTile } from '../components/DashboardTile';

/** Render the last-sync tile value; null-safe and human readable. */
function _formatLastSync(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Unknown';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Summarize receipt-linked sales days: receipts, items, avg items/receipt. */
function _receiptSummary(days: ReceiptSalesDayMetric[]): {
  totalReceipts: number;
  totalItems: number;
  avgPerReceipt: number;
} {
  const totalReceipts = days.reduce((sum, d) => sum + d.receipt_count, 0);
  const totalItems = days.reduce((sum, d) => sum + d.items_sold, 0);
  const avgPerReceipt = totalReceipts > 0 ? totalItems / totalReceipts : 0;
  return { totalReceipts, totalItems, avgPerReceipt };
}

export function AnalyticsDashboardView(): React.ReactElement {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDashboardMetrics()
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  if (loading && !metrics) {
    return (
      <div className="web-center-spinner" data-testid="analytics-loading">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="web-analytics-view" data-testid="analytics-dashboard">
        <EmptyState
          variant="error"
          heading="Failed to load analytics"
          body={error}
          data-testid="analytics-error"
        />
      </div>
    );
  }

  const m: DashboardMetrics = metrics ?? {
    total_products: 0,
    total_stock_units: 0,
    last_sync_at: null,
    most_sold: [],
    low_stock: [],
    cross_store: { products_in_multiple_stores: 0, stores_with_stock: 0, combined_quantity: 0 },
    receipt_linked_sales: [],
  };

  const receipt = _receiptSummary(m.receipt_linked_sales);
  const last7Days = m.receipt_linked_sales.slice(-7);

  return (
    <div className="web-analytics-view" data-testid="analytics-dashboard">
      <div className="web-view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BarChart3 size={22} color="var(--it-green)" aria-hidden="true" />
          <div>
            <h2 className="web-view-title">Dashboard</h2>
            <p className="web-view-subtitle">Catalogue analytics across all stores</p>
          </div>
        </div>
      </div>

      <div className="web-dashboard-tiles" data-testid="analytics-tiles">
        {/* Total products */}
        <DashboardTile
          title="Total Products"
          value={m.total_products.toLocaleString()}
          icon={Package}
          testId="tile-total-products"
          loading={loading}
        />

        {/* Total stock units (all stores) */}
        <DashboardTile
          title="Total Stock Units"
          value={m.total_stock_units.toLocaleString()}
          icon={Boxes}
          accent="var(--it-blue, #3b82f6)"
          testId="tile-total-stock-units"
          loading={loading}
        />

        {/* Last sync */}
        <DashboardTile
          title="Last Sync"
          value={_formatLastSync(m.last_sync_at)}
          icon={Clock}
          accent="var(--it-amber, #f59e0b)"
          testId="tile-last-sync"
          loading={loading}
        />

        {/* Cross-store distribution summary */}
        <DashboardTile
          title="Cross-Store Distribution"
          value={m.cross_store.products_in_multiple_stores.toLocaleString()}
          icon={Layers}
          accent="var(--it-purple, #8b5cf6)"
          details={
            <span>
              products live in more than one store · {m.cross_store.stores_with_stock} store
              {m.cross_store.stores_with_stock === 1 ? '' : 's'} with stock ·{' '}
              {m.cross_store.combined_quantity.toLocaleString()} combined units
            </span>
          }
          testId="tile-cross-store"
          loading={loading}
        />

        {/* Receipt-linked sales volume per day (reliable now that receipt
            number is compulsory per Task F) */}
        <DashboardTile
          title="Receipt-Linked Sales"
          value={receipt.totalReceipts.toLocaleString()}
          icon={ReceiptText}
          accent="var(--it-teal, #14b8a6)"
          details={
            last7Days.length > 0 ? (
              <span className="web-mini-bars" data-testid="receipt-bars">
                {last7Days.map((d) => (
                  <span
                    key={d.date}
                    className="web-mini-bar"
                    title={`${d.date}: ${d.receipt_count} receipts, ${d.items_sold} items`}
                    style={{ height: `${Math.max(4, Math.min(28, d.receipt_count * 4))}px` }}
                  />
                ))}
              </span>
            ) : (
              <span>No receipt-linked sales in the last 7 days</span>
            )
          }
          footer={
            <span>
              {receipt.totalItems.toLocaleString()} items sold · avg{' '}
              {receipt.avgPerReceipt.toFixed(1)} items/receipt
            </span>
          }
          testId="tile-receipt-sales"
          loading={loading}
        />

        {/* Most-sold products (Sale/Issue signal) */}
        <DashboardTile
          title="Most-Sold Products"
          value={
            m.most_sold.length > 0 ? (
              <ol className="web-top-list" data-testid="most-sold-list">
                {m.most_sold.slice(0, 3).map((p) => (
                  <li key={p.product_id}>
                    <span className="web-top-list__name">{p.product_name}</span>
                    <span className="web-top-list__qty">{p.units_sold.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            ) : (
              '—'
            )
          }
          icon={TrendingUp}
          footer={<span>By units sold (Sale / Issue transactions)</span>}
          testId="tile-most-sold"
          loading={loading}
        />

        {/* Low-stock alerts — uses each product's configured threshold where
            set; products without a threshold are not flagged (no invented
            threshold policy). */}
        <DashboardTile
          title="Low-Stock Alerts"
          value={m.low_stock.length > 0 ? m.low_stock.length.toLocaleString() : '—'}
          icon={m.low_stock.length > 0 ? AlertTriangle : Activity}
          accent={m.low_stock.length > 0 ? 'var(--it-red-text, #ef4444)' : 'var(--it-green)'}
          details={
            m.low_stock.length > 0 ? (
              <ul className="web-top-list" data-testid="low-stock-list">
                {m.low_stock.slice(0, 3).map((p) => (
                  <li key={p.product_id}>
                    <span className="web-top-list__name">{p.product_name}</span>
                    <span className="web-top-list__qty">
                      {p.quantity} / {p.threshold} {p.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span>No products below their low-stock threshold</span>
            )
          }
          footer={
            m.low_stock.length > 3 ? (
              <span>and {m.low_stock.length - 3} more below threshold</span>
            ) : undefined
          }
          testId="tile-low-stock"
          loading={loading}
        />
      </div>
    </div>
  );
}
