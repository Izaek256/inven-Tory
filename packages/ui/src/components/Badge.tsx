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
  // Data freshness (Section 14.4)
  | 'FRESH'
  | 'RECENT'
  | 'STALE'
  | 'VERY_STALE'
  // Purchase order statuses (Section 8.4)
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

export function Badge({ status, label, className = '' }: BadgeProps): React.ReactElement {
  const config = STATUS_MAP[status];
  const displayLabel = label ?? config.label;

  return (
    <span className={`it-badge it-badge--${config.colour} ${className}`} aria-label={displayLabel}>
      {displayLabel}
    </span>
  );
}

/* ─── Styles — signature left-bar treatment ──────────────────────────────── */
const CSS = `
.it-badge {
  display: inline-flex;
  align-items: center;
  font-size: var(--it-text-xs);
  font-weight: var(--it-weight-semibold);
  letter-spacing: var(--it-tracking-label);
  text-transform: uppercase;
  padding: 2px var(--it-sp-2) 2px var(--it-sp-2);
  border-radius: var(--it-r-sm);
  /* Signature: left border bar, tinted background */
  border-left: var(--it-status-bar) solid;
  white-space: nowrap;
}

.it-badge--green {
  background-color: var(--it-green-surface);
  color: var(--it-green-text);
  border-left-color: var(--it-green);
}
.it-badge--red {
  background-color: var(--it-red-surface);
  color: var(--it-red-text);
  border-left-color: var(--it-red);
}
.it-badge--amber {
  background-color: var(--it-amber-surface);
  color: var(--it-amber-text);
  border-left-color: var(--it-amber);
}
.it-badge--accent {
  background-color: var(--it-accent-surface);
  color: var(--it-accent-text);
  border-left-color: var(--it-accent);
}
.it-badge--gray {
  background-color: var(--it-gray-surface);
  color: var(--it-gray-text);
  border-left-color: var(--it-gray);
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
