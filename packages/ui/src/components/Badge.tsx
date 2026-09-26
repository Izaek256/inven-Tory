import React from 'react';

/* ─── Status value types ─────────────────────────────────────────────────── */
export type BadgeStatus =
  // Store / product active state
  | 'ACTIVE'
  | 'INACTIVE'
  // Outbox sync statuses
  | 'PENDING'
  | 'SENT'
  | 'ACCEPTED'
  | 'SYNCED'
  // Data freshness
  | 'FRESH'
  | 'RECENT'
  | 'STALE'
  | 'VERY_STALE'
  // Purchase order statuses
  | 'OPEN'
  | 'PARTIAL'
  | 'COMPLETE'
  | 'CANCELLED'
  // Transaction types
  | 'RECEIVE'
  | 'SALE'
  | 'RETURN'
  | 'TRANSFER'
  | 'DAMAGE'
  | 'ADJUSTMENT'
  // Online / offline
  | 'ONLINE'
  | 'OFFLINE';

type BadgeColour = 'green' | 'red' | 'gray' | 'accent' | 'amber';

const STATUS_MAP: Record<BadgeStatus, { colour: BadgeColour; label: string }> = {
  ACTIVE: { colour: 'green', label: 'Active' },
  INACTIVE: { colour: 'red', label: 'Inactive' },
  PENDING: { colour: 'amber', label: 'Pending' },
  SENT: { colour: 'accent', label: 'Sent' },
  ACCEPTED: { colour: 'accent', label: 'Accepted' },
  SYNCED: { colour: 'green', label: 'Synced' },
  FRESH: { colour: 'green', label: 'Fresh' },
  RECENT: { colour: 'accent', label: 'Recent' },
  STALE: { colour: 'amber', label: 'Stale' },
  VERY_STALE: { colour: 'red', label: 'Very Stale' },
  OPEN: { colour: 'accent', label: 'Open' },
  PARTIAL: { colour: 'amber', label: 'Partial' },
  COMPLETE: { colour: 'green', label: 'Complete' },
  CANCELLED: { colour: 'red', label: 'Cancelled' },
  RECEIVE: { colour: 'green', label: 'Receive' },
  SALE: { colour: 'accent', label: 'Sale' },
  RETURN: { colour: 'amber', label: 'Return' },
  TRANSFER: { colour: 'gray', label: 'Transfer' },
  DAMAGE: { colour: 'red', label: 'Damage' },
  ADJUSTMENT: { colour: 'amber', label: 'Adjustment' },
  ONLINE: { colour: 'green', label: 'Online' },
  OFFLINE: { colour: 'amber', label: 'Offline' },
};

export interface BadgeProps {
  status: BadgeStatus;
  label?: string; // Override default label
  className?: string;
}

export const Badge = React.memo(function Badge({
  status,
  label,
  className = '',
}: BadgeProps): React.ReactElement {
  const config = STATUS_MAP[status];
  const displayLabel = label ?? config.label;

  return (
    <span className={`it-badge it-badge--${config.colour} ${className}`} aria-label={displayLabel}>
      {displayLabel}
    </span>
  );
});

/* ─── Styles — reference .tag: left 2px bar, mono, 11px, sharp ───────── */
const CSS = `
.it-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--it-font-mono);
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px 3px 7px;
  border-radius: var(--it-r-sm);
  border-left: var(--it-status-bar) solid;
  white-space: nowrap;
  letter-spacing: 0;
  text-transform: none;
}

.it-badge--green {
  background-color: var(--green-tint);
  color: var(--green);
  border-left-color: var(--green);
}
.it-badge--red {
  background-color: var(--red-tint);
  color: var(--red);
  border-left-color: var(--red);
}
.it-badge--amber {
  background-color: var(--amber-tint);
  color: var(--amber-ink);
  border-left-color: var(--amber);
}
.it-badge--accent {
  background-color: var(--teal-tint);
  color: var(--teal);
  border-left-color: var(--teal);
}
.it-badge--gray {
  background-color: var(--it-bg);
  color: var(--it-text-secondary);
  border-left-color: var(--it-border-strong);
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-badge-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-badge-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
