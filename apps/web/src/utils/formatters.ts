/**
 * Shared formatting utilities for the web dashboard.
 */

import type { BadgeStatus } from '@inven-tory/ui';

/**
 * Format an ISO-8601 timestamp as a human-readable relative time string.
 * e.g. "2 min ago", "3 hours ago", "4 days ago"
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

/**
 * Map a raw movement_type string from the API to the nearest BadgeStatus
 * supported by the Badge component.
 */
export function movementTypeBadge(movementType: string): BadgeStatus {
  const upper = movementType.toUpperCase();
  const map: Record<string, BadgeStatus> = {
    RECEIPT: 'RECEIVE',
    RECEIVE: 'RECEIVE',
    SALE: 'SALE',
    ISSUE: 'SALE',
    RETURN: 'RETURN',
    TRANSFER: 'TRANSFER',
    TRANSFER_OUT: 'TRANSFER',
    TRANSFER_IN: 'TRANSFER',
    DAMAGE: 'DAMAGE',
    QUARANTINE: 'DAMAGE',
    ADJUSTMENT: 'ADJUSTMENT',
    COUNT: 'ADJUSTMENT',
  };
  return map[upper] ?? 'PENDING';
}
