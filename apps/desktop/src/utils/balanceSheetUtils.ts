/**
 * Balance sheet computation utilities for Day Books (Section 4).
 *
 * These functions run entirely client-side. The data model:
 *
 * Per product (products with at least one entry in the day book):
 *   - productName
 *   - sku
 *   - openingBalance = current_balance - cumulativeIn + cumulativeOut
 *   - cumulativeOut  = abs(sum of negative quantity_delta entries)
 *   - cumulativeIn   = sum of positive quantity_delta entries
 *   - closingBalance = current_balance
 *
 * The "current_balance" is the live stock_balances.quantity for the product
 * in the store, fetched via the get_stock_balance Tauri command. This is
 * deterministic because: opening + cumulativeIn - cumulativeOut = closing.
 */

export interface DayBookEntryForSheet {
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
  /** Product SKU — optional; caller should populate from a product lookup. */
  sku?: string | null;
}

export interface BalanceSheetRow {
  productId: string;
  productName: string;
  sku: string | null;
  openingBalance: number;
  cumulativeIn: number;
  cumulativeOut: number;
  closingBalance: number;
}

/**
 * Build per-product balance sheet rows from day book entries.
 *
 * @param entries   - Day book entries for a single day
 * @param currentBalances - Map of product_id → current stock balance (from get_stock_balance)
 */
export function buildBalanceSheetData(
  entries: DayBookEntryForSheet[],
  currentBalances: Map<string, number>,
): BalanceSheetRow[] {
  const byProduct = new Map<string, DayBookEntryForSheet[]>();
  for (const entry of entries) {
    const arr = byProduct.get(entry.product_id) ?? [];
    arr.push(entry);
    byProduct.set(entry.product_id, arr);
  }

  const rows: BalanceSheetRow[] = [];
  for (const [productId, productEntries] of byProduct) {
    productEntries.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

    const productName = productEntries[0].product_name;
    const cumulativeIn = productEntries
      .filter((e) => e.quantity_delta > 0)
      .reduce((sum, e) => sum + e.quantity_delta, 0);
    const cumulativeOut = Math.abs(
      productEntries
        .filter((e) => e.quantity_delta < 0)
        .reduce((sum, e) => sum + e.quantity_delta, 0),
    );
    const currentBalance = currentBalances.get(productId) ?? cumulativeIn - cumulativeOut;
    const openingBalance = currentBalance - cumulativeIn + cumulativeOut;
    const closingBalance = currentBalance;

    rows.push({
      productId,
      productName,
      // Use the sku field populated by the caller (e.g. from getProducts() lookup).
      // Falls back to null when the entry was built without a product lookup.
      sku: productEntries[0].sku ?? null,
      openingBalance,
      cumulativeIn,
      cumulativeOut,
      closingBalance,
    });
  }

  return rows.sort((a, b) => a.productName.localeCompare(b.productName));
}

/**
 * Format balance sheet rows as WhatsApp-style text.
 *
 * Output format:
 *   1. <Product Name>, Balance => <closingBalance>
 *   2. <Product Name>, Balance => <closingBalance>
 */
export function formatBalanceSheetText(rows: BalanceSheetRow[]): string {
  return rows
    .map((row, i) => `${i + 1}. ${row.productName}, Balance => ${row.closingBalance}`)
    .join('\n');
}
