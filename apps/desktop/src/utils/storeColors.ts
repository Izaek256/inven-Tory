/**
 * Fixed palette of distinguishable store colors, cycled per store by id hash
 * (Phase 3, Task H). Shared by the header switcher, Products cross-store
 * columns, and the global search modal so a store always renders the same
 * swatch everywhere.
 */

export const STORE_COLORS = [
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

/** Deterministically pick a color swatch for a store id. */
export function storeColor(storeId: string): string {
  let hash = 0;
  for (let i = 0; i < storeId.length; i++) {
    hash = (hash * 31 + storeId.charCodeAt(i)) | 0;
  }
  return STORE_COLORS[Math.abs(hash) % STORE_COLORS.length];
}
