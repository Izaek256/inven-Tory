/**
 * Shared "stock changed" window event.
 *
 * Dispatched by the service layer whenever a local stock or catalogue
 * mutation succeeds (sale, receipt, return, transfer, adjustment, product
 * create/update, sync pull, cache wipe). Read-only surfaces such as the
 * global search modal subscribe on mount and invalidate their queries so
 * results refresh immediately instead of waiting for `staleTime` to lapse.
 */

export const STOCK_UPDATED_EVENT = 'inven-tory:stock-updated';

/** Broadcast that stock (or catalogue) data changed. No-op outside the DOM. */
export function notifyStockUpdated(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new Event(STOCK_UPDATED_EVENT));
}

/** Subscribe to stock-change notifications. Returns an unsubscribe function. */
export function subscribeToStockUpdates(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => undefined;
  }
  window.addEventListener(STOCK_UPDATED_EVENT, listener);
  return () => {
    window.removeEventListener(STOCK_UPDATED_EVENT, listener);
  };
}
