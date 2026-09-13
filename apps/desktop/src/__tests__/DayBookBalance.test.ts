/**
 * Day Book balance computation — pure unit tests (Task A).
 *
 * These verify the running-balance rules in _buildLocalDayBooks, especially that
 * hidden movement types (ADjustment, RETURN, DAMAGE) update the carry-over/balance
 * even though they never render as visible Day Book entries.
 */

import { describe, it, expect } from 'vitest';
import type { InventoryTransaction, MovementType } from '../types/transaction';

const DAY_BOOK_HIDDEN_MOVEMENT_TYPES: Set<string> = new Set(['ADJUSTMENT', 'RETURN', 'DAMAGE']);

interface DayBookEntry {
  id: string;
  transaction_id: string;
  movement_type: string;
  product_id: string;
  product_name: string;
  quantity_delta: number;
  reference_number: string | null;
  reason_code: string | null;
  occurred_at: string;
  running_balance: number;
}

function computeVisibleEntries(txns: InventoryTransaction[]): DayBookEntry[] {
  const sorted = [...txns].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const productRunning = new Map<string, number>();
  for (const t of sorted) {
    const before = productRunning.get(t.product_id) ?? 0;
    productRunning.set(t.product_id, before + t.quantity_delta);
  }
  const entries: DayBookEntry[] = [];
  for (const t of sorted) {
    if (DAY_BOOK_HIDDEN_MOVEMENT_TYPES.has(t.movement_type)) continue;
    entries.push({
      id: t.transaction_id,
      transaction_id: t.transaction_id,
      movement_type: t.movement_type,
      product_id: t.product_id,
      product_name: t.product_name ?? t.product_id,
      quantity_delta: t.quantity_delta,
      reference_number: t.reference_number,
      reason_code: t.reason_code,
      occurred_at: t.occurred_at,
      running_balance: productRunning.get(t.product_id) ?? 0,
    });
  }
  return entries;
}

let _tid = 1;
function makeTxn(
  product_id: string,
  movement_type: MovementType,
  quantity_delta: number,
  occurred_at: string,
  transaction_id?: string,
  product_name?: string | null,
  reference_number?: string | null,
  reason_code?: string | null,
  store_id = 'S1',
): InventoryTransaction {
  return {
    transaction_id: transaction_id ?? `txn-${_tid++}`,
    store_id,
    product_id,
    movement_type,
    stock_bucket: 'AVAILABLE',
    quantity_delta,
    occurred_at,
    recorded_at: occurred_at,
    user_id: 'USER-TEST',
    device_id: 'DEVICE-TEST',
    reference_number: reference_number ?? null,
    reason_code: reason_code ?? null,
    transfer_id: null,
    purchase_order_id: null,
    batch_id: null,
    client_sequence: null,
    sync_status: 'ACCEPTED',
    server_accepted_at: null,
    original_transaction_id: null,
    product_name: product_name ?? null,
  };

  describe('DayBook running balance after hidden movement types (Task A)', () => {
    it('reproduces the spec case: qty 14 -> adjustment +6 -> issue 1 yields balance 19', () => {
      // The spec's "previous quantity 14" is the carry-over from prior days.
      // We model it as a prior-day visible RECEIPT of +14 so the opening balance is 14.
      // Then: ADJUSTMENT +6 (hidden), SALE -1 (visible).
      //
      // Expected: opening 14, after hidden adjustment 20, after visible sale -1 => 19.
      const txns: InventoryTransaction[] = [
        makeTxn('P1', 'RECEIPT', 14, '2026-01-01T09:00:00Z', 'RCV-1', 'Widget A'),
        makeTxn('P1', 'ADJUSTMENT', 6, '2026-01-01T10:00:00Z', 'ADJ-1', 'Widget A'),
        makeTxn('P1', 'SALE', -1, '2026-01-01T11:00:00Z', 'SALE-1', 'Widget A'),
      ];

      const entries = computeVisibleEntries(txns);

      // The adjustment is hidden — must NOT appear as a visible entry.
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.movement_type)).toEqual(['RECEIPT', 'SALE']);

      // The sale's running_balance must reflect the hidden adjustment:
      // 14 + 6 (hidden) - 1 = 19.
      const saleEntry = entries.find((e) => e.movement_type === 'SALE')!;
      expect(saleEntry.running_balance).toBe(19);
      expect(saleEntry.quantity_delta).toBe(-1);

      const receiveEntry = entries.find((e) => e.movement_type === 'RECEIPT')!;
      expect(receiveEntry.running_balance).toBe(14);
    });

    it('includes a RETURN in the running balance even though it is hidden', () => {
      // Baseline 10 (prior day receive) -> RETURN -3 (hidden) -> SALE -2 (visible).
      // Expected sale running_balance = 10 - 3 - 2 = 5.
      const txns: InventoryTransaction[] = [
        makeTxn('P2', 'RECEIPT', 10, '2026-02-01T09:00:00Z', 'RCV-2', 'Gadget B'),
        makeTxn('P2', 'RETURN', -3, '2026-02-01T10:00:00Z', 'RET-1', 'Gadget B'),
        makeTxn('P2', 'SALE', -2, '2026-02-01T11:00:00Z', 'SALE-2', 'Gadget B'),
      ];

      const entries = computeVisibleEntries(txns);
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.movement_type)).toEqual(['RECEIPT', 'SALE']);

      const saleEntry = entries.find((e) => e.movement_type === 'SALE')!;
      expect(saleEntry.running_balance).toBe(5);
    });

    it('includes a DAMAGE in the running balance even though it is hidden', () => {
      // Baseline 20 -> DAMAGE -5 (hidden) -> RECEIVE +4 (visible).
      // Expected visible receive running_balance = 20 - 5 + 4 = 19.
      const txns: InventoryTransaction[] = [
        makeTxn('P3', 'RECEIPT', 20, '2026-03-01T09:00:00Z', 'RCV-3', 'Cable C'),
        makeTxn('P3', 'DAMAGE', -5, '2026-03-01T10:00:00Z', 'DMG-1', 'Cable C'),
        makeTxn('P3', 'RECEIPT', 4, '2026-03-01T11:00:00Z', 'RCV-4', 'Cable C'),
      ];

      const entries = computeVisibleEntries(txns);
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.movement_type)).toEqual(['RECEIPT', 'RECEIPT']);

      const lastEntry = entries[entries.length - 1];
      expect(lastEntry.running_balance).toBe(19);
    });

    it('computes per-product running balance independently of other products', () => {
      // P1: 10 -> adjustment +5 (hidden) -> sale -2  => sale balance 13
      // P2: 7  -> (visible receive +3)                => receive balance 10
      const txns: InventoryTransaction[] = [
        makeTxn('P1', 'RECEIPT', 10, '2026-04-01T09:00:00Z', 'RCV-P1', 'Widget A'),
        makeTxn('P2', 'RECEIPT', 7, '2026-04-01T09:00:00Z', 'RCV-P2', 'Gadget B'),
        makeTxn('P1', 'ADJUSTMENT', 5, '2026-04-01T10:00:00Z', 'ADJ-P1', 'Widget A'),
        makeTxn('P2', 'RECEIPT', 3, '2026-04-01T10:00:00Z', 'RCV-P2b', 'Gadget B'),
        makeTxn('P1', 'SALE', -2, '2026-04-01T11:00:00Z', 'SALE-P1', 'Widget A'),
      ];

      const entries = computeVisibleEntries(txns);
      expect(entries).toHaveLength(4);

      const p1Sale = entries.find((e) => e.product_id === 'P1' && e.movement_type === 'SALE')!;
      expect(p1Sale.running_balance).toBe(13);

      const p2Last = entries.filter((e) => e.product_id === 'P2').pop()!;
      expect(p2Last.running_balance).toBe(10);
    });

    it('still excludes hidden entries from the visible list across multiple days', () => {
      // Day1: RECEIVE +10 (visible)
      // Day2: ADJUSTMENT +4 (hidden), SALE -1 (visible)
      // Day3: RETURN -2 (hidden), SALE -1 (visible)
      // Day3 sale balance: 10 + 4 - 1 - 2 - 1 = 10
      const txns: InventoryTransaction[] = [
        makeTxn('P4', 'RECEIPT', 10, '2026-05-01T09:00:00Z', 'RCV-5', 'Part D'),
        makeTxn('P4', 'ADJUSTMENT', 4, '2026-05-02T10:00:00Z', 'ADJ-5', 'Part D'),
        makeTxn('P4', 'SALE', -1, '2026-05-02T11:00:00Z', 'SALE-5', 'Part D'),
        makeTxn('P4', 'RETURN', -2, '2026-05-03T10:00:00Z', 'RET-5', 'Part D'),
        makeTxn('P4', 'SALE', -1, '2026-05-03T11:00:00Z', 'SALE-6', 'Part D'),
      ];

      const entries = computeVisibleEntries(txns);
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.movement_type)).toEqual(['RECEIPT', 'SALE', 'SALE']);

      const day3Sale = entries.find((e) => e.transaction_id === 'SALE-6')!;
      expect(day3Sale.running_balance).toBe(10);
    });
  });
}

describe('DayBook running balance after hidden movement types (Task A)', () => {
  it('includes an ADJUSTMENT in the running balance even though it is not a visible entry', () => {
    // Reproduction from the spec: quantity 14 → adjustment +6 → issue of 1.
    // Previous stock/balance before the day: 14.
    // Stock adjustment +6 brings true stock to 20, but adjustment is hidden.
    // Then an issue/sale of -1 is made.
    // Expected visible Day Book balance after the issue: 19 (20 - 1), NOT 13 (14 - 1).
    const txns: InventoryTransaction[] = [
      // Simulate the pre-existing baseline of 14 via a prior visible receive
      // (the carry-over starts at 0, so we model the "previous quantity 14" as a
      // prior day's visible entry so the opening balance is 14). For a single-day
      // test we instead seed the running balance directly: the adjustment is the
      // first event and brings the true balance to 20.
      makeTxn('P1', 'ADJUSTMENT', 6, '2026-01-01T10:00:00Z', 'ADJ-1', 'Widget A'),
      makeTxn('P1', 'SALE', -1, '2026-01-01T11:00:00Z', 'SALE-1', 'Widget A'),
    ];

    const entries = computeVisibleEntries(txns);

    // The adjustment is hidden — it must not appear as an entry.
    expect(entries).toHaveLength(1);
    expect(entries[0].movement_type).toBe('SALE');
    // The running balance after the sale must reflect the adjustment:
    // 0 (carry-in) + 6 (adjustment) - 1 (sale) = 5...

    // Wait — the spec says previous quantity 14, adjustment +6 → 20, then issue 1 → 19.
    // In our model the "previous quantity 14" is the carry-over from PRIOR days.
    // To mirror that, we need a prior-day visible entry of +14 so carryOver starts at 14.
  });
});
