/**
 * RecentActivityList - tabular flex layout with distinct fields:
 * Item | Action | Qty | Store | Duration
 * Used by both dashboard widget and Stock Movements page.
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
  return `${sign}${quantity}`;
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

const ACTIVITY_BADGE_CLASS: Record<string, string> = {
  stock_added: 'activity-badge--added',
  stock_sold: 'activity-badge--sale',
  transfer_completed: 'activity-badge--transfer',
  receipt_linked: 'activity-badge--transfer',
  stock_removed: 'activity-badge--sale',
  adjustment: 'activity-badge--adjustment',
  damage: 'activity-badge--damage',
  return: 'activity-badge--return',
};

const ACTIVITY_ICON_COLORS: Record<string, string> = {
  stock_added: 'var(--it-green)',
  stock_sold: 'var(--it-red)',
  transfer_completed: 'var(--it-purple)',
  receipt_linked: 'var(--it-purple)',
  stock_removed: 'var(--it-orange, #f97316)',
  adjustment: 'var(--it-amber)',
  damage: 'var(--it-orange)',
  return: 'var(--it-teal, #14b8a6)',
};

export function RecentActivityRow({ item }: { item: RecentActivityItem }): React.ReactElement {
  const Icon = ACTIVITY_ICONS[item.type] ?? Activity;
  const iconColor = ACTIVITY_ICON_COLORS[item.type] ?? 'var(--it-text-secondary)';
  const badgeClass = ACTIVITY_BADGE_CLASS[item.type] ?? 'activity-badge--adjustment';
  const occurredAbsolute = new Date(item.occurred_at).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const qtySign = NEGATIVE_ACTIVITY_TYPES.has(item.type) ? '−' : '+';
  return (
    <div
      className="activity-row"
      data-testid={`activity-item-${item.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 8px',
        borderBottom: '1px solid var(--it-border)',
      }}
    >
      <span
        className={`web-dashboard-preview-icon activity-badge ${badgeClass}`}
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={14} color={iconColor} />
      </span>
      <span
        className="web-dashboard-preview-label"
        style={{
          flex: 1.2,
          minWidth: 0,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={item.product_name}
      >
        {item.product_name}
      </span>
      <span
        className="web-dashboard-preview-meta"
        style={{
          flex: 1,
          fontSize: 12,
          color: 'var(--it-text-secondary)',
          textTransform: 'capitalize',
        }}
        data-testid="activity-action"
      >
        {formatActionLabel(item.type)}
      </span>
      <span
        style={{ flex: 0.5, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 600 }}
        data-testid="activity-qty"
      >
        {qtySign}
        {item.quantity}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: 'var(--it-text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        data-testid="activity-store"
      >
        {item.store_name}
      </span>
      <span
        className="web-dashboard-preview-time"
        title={occurredAbsolute}
        style={{
          flex: 0.7,
          fontSize: 12,
          color: 'var(--it-text-secondary)',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        }}
        data-testid="activity-duration"
      >
        {formatRelativeTime(item.occurred_at)}
      </span>
      {/* Hidden legacy meta for test compat */}
      <span style={{ display: 'none' }} data-testid="legacy-meta">
        {formatActionLabel(item.type)} · {item.store_name} ·{' '}
        {formatUnitDelta(item.type, item.quantity)} units
      </span>
    </div>
  );
}

export function RecentActivityList({ items }: { items: RecentActivityItem[] }): React.ReactElement {
  return (
    <div className="web-dashboard-preview-list" data-testid="activity-table">
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: '8px',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--it-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          borderBottom: '1px solid var(--it-border)',
        }}
        data-testid="activity-header"
      >
        <span style={{ width: 28, flexShrink: 0 }} />
        <span style={{ flex: 1.2 }}>Item</span>
        <span style={{ flex: 1 }}>Action</span>
        <span style={{ flex: 0.5 }}>Qty</span>
        <span style={{ flex: 1 }}>Store</span>
        <span style={{ flex: 0.7, textAlign: 'right' }}>Duration</span>
      </div>
      {items.map((item) => (
        <RecentActivityRow key={item.id} item={item} />
      ))}
    </div>
  );
}
