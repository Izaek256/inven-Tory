/**
 * RecentActivityList - shared row rendering for the Recent Activity feed.
 *
 * Used by BOTH the dashboard preview panel (AnalyticsDashboardView) and the
 * dedicated Recent Activity page (RecentActivityView) so the row format can
 * never drift between the two surfaces again:
 *
 *   Line 1: product name            (bold/darker — its own block element)
 *   Line 2: `{action type} · {store name} · {±units}`   (small, muted)
 *   Right:  relative timestamp ("8h ago"), absolute datetime on hover (title).
 *
 * Task A regression note: the name and detail line MUST be separate
 * block-level elements (flex column via .web-dashboard-preview-content).
 * They were once two inline <span>s with no whitespace between them, which
 * glued the name into the detail text ("…Fridgestock sold") at every width.
 *
 * The backend does NOT capture an acting user on transactions yet
 * (RecentActivityItem has no user field), so user attribution stays deferred.
 */
import React from 'react';
import { Activity, ArrowDown, Layers, ReceiptText, TrendingUp, AlertTriangle } from 'lucide-react';
import type { ActivityType, RecentActivityItem } from '../types/dashboard';

const NEGATIVE_ACTIVITY_TYPES = new Set<ActivityType>([
  'stock_sold',
  'stock_removed',
  'damage',
  'adjustment',
]);

export function formatUnitDelta(type: ActivityType, quantity: number): string {
  const sign = NEGATIVE_ACTIVITY_TYPES.has(type) ? '−' : '+';
  return `${sign}${quantity} units`;
}

export function formatActionLabel(type: ActivityType): string {
  return type.replace(/_/g, ' ');
}

export function formatRelativeTime(iso: string): string {
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

const ACTIVITY_ICONS: Record<string, typeof Activity> = {
  stock_added: TrendingUp,
  stock_sold: ArrowDown,
  transfer_completed: Layers,
  receipt_linked: ReceiptText,
  stock_removed: ArrowDown,
  adjustment: Activity,
  damage: AlertTriangle,
  return: TrendingUp,
};

/** Per-type icon tint (parity with the desktop feed's color coding). */
const ACTIVITY_ICON_COLORS: Record<string, string> = {
  stock_added: 'var(--it-green)',
  stock_sold: 'var(--it-red)',
  transfer_completed: 'var(--it-accent)',
  receipt_linked: 'var(--it-accent)',
  stock_removed: 'var(--it-orange, #f97316)',
  adjustment: 'var(--it-amber)',
  damage: 'var(--it-red)',
  return: 'var(--it-teal, #14b8a6)',
};

export function RecentActivityRow({ item }: { item: RecentActivityItem }): React.ReactElement {
  const Icon = ACTIVITY_ICONS[item.type] ?? Activity;
  const iconColor = ACTIVITY_ICON_COLORS[item.type] ?? 'var(--it-text-secondary)';
  const occurredAbsolute = new Date(item.occurred_at).toLocaleString();
  return (
    <div className="web-dashboard-preview-item" data-testid={`activity-item-${item.id}`}>
      <span className="web-dashboard-preview-icon" aria-hidden="true">
        <Icon size={14} color={iconColor} />
      </span>
      <div className="web-dashboard-preview-content">
        <div className="web-dashboard-preview-label">{item.product_name}</div>
        <div className="web-dashboard-preview-meta">
          {formatActionLabel(item.type)} · {item.store_name} ·{' '}
          {formatUnitDelta(item.type, item.quantity)}
        </div>
      </div>
      <span className="web-dashboard-preview-time" title={occurredAbsolute}>
        {formatRelativeTime(item.occurred_at)}
      </span>
    </div>
  );
}

export function RecentActivityList({ items }: { items: RecentActivityItem[] }): React.ReactElement {
  return (
    <div className="web-dashboard-preview-list">
      {items.map((item) => (
        <RecentActivityRow key={item.id} item={item} />
      ))}
    </div>
  );
}
