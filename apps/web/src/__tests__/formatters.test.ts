/**
 * Unit tests for formatting utilities.
 */

import { describe, expect, it } from 'vitest';
import { formatRelativeTime, movementTypeBadge } from '../utils/formatters';

describe('formatRelativeTime', () => {
  it('returns "just now" for very recent timestamps', () => {
    const ts = new Date(Date.now() - 10_000).toISOString();
    expect(formatRelativeTime(ts)).toBe('just now');
  });

  it('returns minutes for timestamps within the hour', () => {
    const ts = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(ts)).toBe('5 min ago');
  });

  it('returns hours for timestamps within a day', () => {
    const ts = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(ts)).toBe('3 hours ago');
  });

  it('uses singular hour for exactly 1 hour', () => {
    const ts = new Date(Date.now() - 1 * 3_600_000 - 30_000).toISOString();
    expect(formatRelativeTime(ts)).toBe('1 hour ago');
  });

  it('returns days for old timestamps', () => {
    const ts = new Date(Date.now() - 4 * 86_400_000).toISOString();
    expect(formatRelativeTime(ts)).toBe('4 days ago');
  });

  it('uses singular day for exactly 1 day', () => {
    const ts = new Date(Date.now() - 1 * 86_400_000 - 60_000).toISOString();
    expect(formatRelativeTime(ts)).toBe('1 day ago');
  });

  it('returns the raw string for invalid dates', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
  });
});

describe('movementTypeBadge', () => {
  it('maps RECEIPT to RECEIVE', () => {
    expect(movementTypeBadge('RECEIPT')).toBe('RECEIVE');
  });

  it('maps SALE to SALE', () => {
    expect(movementTypeBadge('SALE')).toBe('SALE');
  });

  it('maps RETURN to RETURN', () => {
    expect(movementTypeBadge('RETURN')).toBe('RETURN');
  });

  it('maps TRANSFER to TRANSFER', () => {
    expect(movementTypeBadge('TRANSFER')).toBe('TRANSFER');
    expect(movementTypeBadge('TRANSFER_IN')).toBe('TRANSFER');
    expect(movementTypeBadge('TRANSFER_OUT')).toBe('TRANSFER');
  });

  it('maps DAMAGE to DAMAGE', () => {
    expect(movementTypeBadge('DAMAGE')).toBe('DAMAGE');
  });

  it('maps ADJUSTMENT to ADJUSTMENT', () => {
    expect(movementTypeBadge('ADJUSTMENT')).toBe('ADJUSTMENT');
  });

  it('is case-insensitive', () => {
    expect(movementTypeBadge('receipt')).toBe('RECEIVE');
    expect(movementTypeBadge('sale')).toBe('SALE');
  });

  it('falls back to PENDING for unknown types', () => {
    expect(movementTypeBadge('UNKNOWN_XYZ')).toBe('PENDING');
  });
});
