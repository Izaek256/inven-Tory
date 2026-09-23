/**
 * Products view — corrected spec (scope reduction).
 * Stores as stacked real names (store name + qty), not short badges.
 * Columns: Product (name+SKU/model subtitle) | Category | Stores (stacked) | Total Stock | Actions (eye)
 * No SKU/Brand/Status columns, no pencil/overflow, only eye.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Spinner } from '@invenTory/ui';
import {
  Eye,
  Package,
  Search,
  SlidersHorizontal,
  List,
  LayoutGrid,
  Plus,
  Store as StoreIcon,
} from 'lucide-react';
import { searchProducts } from '../services/dashboardService';
import type { ProductSearchResult, StoreQuantity } from '../types/dashboard';
import { InventoryPanel } from '../components/InventoryPanel';

const CATALOG_LIMIT = 10000;
const PAGE_SIZE = 10;

export interface StoreColumn {
  store_id: string;
  store_name: string;
}

export function deriveStoreColumns(results: ProductSearchResult[]): StoreColumn[] {
  const byId = new Map<string, string>();
  for (const r of results) {
    for (const sq of r.store_quantities ?? []) byId.set(sq.store_id, sq.store_name);
  }
  return [...byId.entries()]
    .map(([store_id, store_name]) => ({ store_id, store_name }))
    .sort((a, b) => a.store_name.localeCompare(b.store_name));
}

export function storeQty(
  storeQuantities: StoreQuantity[] | undefined,
  storeId: string,
): number | null {
  if (!storeQuantities) return null;
  const sq = storeQuantities.find((s) => s.store_id === storeId);
  return sq ? sq.quantity : null;
}

function getStatus(total: number, threshold: number | null): 'in' | 'low' | 'out' {
  if (total === 0) return 'out';
  if (threshold !== null && total < threshold) return 'low';
  return 'in';
}

/**
 * Scalable store breakdown — wrapping compact chips instead of one row per
 * store, so cards and table rows stay compact no matter how many stores
 * carry the product. Capped with a "+N more" chip; the full per-store
 * picture lives one tap away in the product detail panel.
 */
const STORE_CHIP_MAX = 5;

function StoreBreakdown({ quantities }: { quantities: StoreQuantity[] }): React.ReactElement {
  if (!quantities.length) return <span className="web-cell-empty">—</span>;
  const visible = quantities.slice(0, STORE_CHIP_MAX);
  const hidden = quantities.length - visible.length;
  return (
    <span className="store-chips">
      {visible.map((sq) => (
        <span
          key={sq.store_id}
          className="store-chip"
          title={`${sq.store_name} — ${sq.quantity.toLocaleString()} units`}
        >
          <span className="store-chip__name">{sq.store_name}</span>
          <span className="store-chip__qty">{sq.quantity.toLocaleString()}</span>
        </span>
      ))}
      {hidden > 0 && (
        <span className="store-chip store-chip--more" title={`${hidden} more stores stock this`}>
          +{hidden} more
        </span>
      )}
    </span>
  );
}

export function ProductsCatalogView({ topSearch }: { topSearch?: string }): React.ReactElement {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allResults, setAllResults] = useState<ProductSearchResult[]>([]);
  const [storeColumns, setStoreColumns] = useState<StoreColumn[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchProducts('', CATALOG_LIMIT, 'all-stores')
      .then((data) => {
        if (!cancelled) {
          setAllResults(data.results);
          setStoreColumns(deriveStoreColumns(data.results));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleResize = (): void => setIsNarrow(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return (): void => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (topSearch !== undefined) setQuery(topSearch);
  }, [topSearch]);

  const categories = useMemo(
    () => Array.from(new Set(allResults.map((r) => r.category))).sort(),
    [allResults],
  );
  const brands = useMemo(
    () => Array.from(new Set(allResults.map((r) => r.brand).filter(Boolean) as string[])).sort(),
    [allResults],
  );

  const filteredResults = useMemo(() => {
    let res = allResults;
    if (query.trim()) {
      const term = query.toLowerCase();
      res = res.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.sku.toLowerCase().includes(term) ||
          (r.brand ?? '').toLowerCase().includes(term) ||
          (r.model ?? '').toLowerCase().includes(term) ||
          r.category.toLowerCase().includes(term),
      );
    }
    if (categoryFilter !== 'all') res = res.filter((r) => r.category === categoryFilter);
    if (brandFilter !== 'all') res = res.filter((r) => r.brand === brandFilter);
    if (storeFilter !== 'all') {
      res = res.filter((r) =>
        r.store_quantities?.some((sq) => sq.store_id === storeFilter && sq.quantity > 0),
      );
    }
    return res;
  }, [allResults, query, categoryFilter, brandFilter, storeFilter]);

  const total = allResults.length;
  const inStock = allResults.filter(
    (r) => getStatus(r.total_quantity ?? 0, r.low_stock_threshold) === 'in',
  ).length;
  const lowStock = allResults.filter(
    (r) => getStatus(r.total_quantity ?? 0, r.low_stock_threshold) === 'low',
  ).length;
  const outOfStock = allResults.filter(
    (r) => getStatus(r.total_quantity ?? 0, r.low_stock_threshold) === 'out',
  ).length;
  const pct = (n: number): number => (total ? (n / total) * 100 : 0);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageRows = filteredResults.slice(startIdx, startIdx + PAGE_SIZE);

  if (selectedProduct) {
    return (
      <InventoryPanel
        productId={selectedProduct.id}
        productName={selectedProduct.name}
        onBack={() => setSelectedProduct(null)}
      />
    );
  }

  return (
    <div className="web-catalog-view" data-testid="products-catalog-view">
      <div className="prod-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 0,
              background: 'var(--it-amber-surface)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--it-amber-text)',
            }}
          >
            <Package size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="prod-header__title">Products</h2>
            <p className="prod-header__subtitle">
              Global catalogue with per-store stock distribution across {storeColumns.length} store
              {storeColumns.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <button className="prod-add-btn" data-testid="add-product-btn" onClick={(): void => {}}>
          <Plus size={16} aria-hidden="true" /> Add Product
        </button>
      </div>

      <div className="prod-summary" data-testid="prod-summary-tiles">
        <div className="summary-tile" data-testid="summary-total">
          <div className="summary-tile__head">
            <span className="summary-tile__icon" style={{ background: 'var(--it-green)' }}>
              <Package size={18} color="#fff" />
            </span>
            <span className="summary-tile__label">Total Products</span>
          </div>
          <span className="summary-tile__value">{total.toLocaleString()}</span>
          <span className="summary-tile__meta">
            ≈ {(pct(total) || 100).toFixed(1)}% of catalogue
          </span>
          <div className="summary-tile__bar">
            <div
              className="summary-tile__bar-fill"
              style={{ width: '100%', background: 'var(--it-green)' }}
            />
          </div>
        </div>
        <div className="summary-tile" data-testid="summary-instock">
          <div className="summary-tile__head">
            <span className="summary-tile__icon" style={{ background: 'var(--it-blue)' }}>
              <StoreIcon size={18} color="#fff" />
            </span>
            <span className="summary-tile__label">In Stock</span>
          </div>
          <span className="summary-tile__value">{inStock.toLocaleString()}</span>
          <span className="summary-tile__meta">{pct(inStock).toFixed(1)}% of total</span>
          <div className="summary-tile__bar">
            <div
              className="summary-tile__bar-fill"
              style={{ width: `${pct(inStock)}%`, background: 'var(--it-blue)' }}
            />
          </div>
        </div>
        <div className="summary-tile" data-testid="summary-lowstock">
          <div className="summary-tile__head">
            <span className="summary-tile__icon" style={{ background: 'var(--it-amber)' }}>
              <SlidersHorizontal size={18} color="#fff" />
            </span>
            <span className="summary-tile__label">Low Stock</span>
          </div>
          <span className="summary-tile__value">{lowStock.toLocaleString()}</span>
          <span className="summary-tile__meta">{pct(lowStock).toFixed(1)}% of total</span>
          <div className="summary-tile__bar">
            <div
              className="summary-tile__bar-fill"
              style={{ width: `${pct(lowStock)}%`, background: 'var(--it-amber)' }}
            />
          </div>
        </div>
        <div className="summary-tile" data-testid="summary-outstock">
          <div className="summary-tile__head">
            <span className="summary-tile__icon" style={{ background: 'var(--it-red)' }}>
              <Package size={18} color="#fff" />
            </span>
            <span className="summary-tile__label">Out of Stock</span>
          </div>
          <span className="summary-tile__value">{outOfStock.toLocaleString()}</span>
          <span className="summary-tile__meta">{pct(outOfStock).toFixed(1)}% of total</span>
          <div className="summary-tile__bar">
            <div
              className="summary-tile__bar-fill"
              style={{ width: `${pct(outOfStock)}%`, background: 'var(--it-red)' }}
            />
          </div>
        </div>
      </div>

      <div className="prod-filters" data-testid="prod-filters">
        <div className="prod-filters__search">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(e): void => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search products..."
            data-testid="catalog-search"
            aria-label="Search products"
          />
        </div>
        <select
          className="prod-select"
          value={categoryFilter}
          onChange={(e): void => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          data-testid="filter-category"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="prod-select"
          value={brandFilter}
          onChange={(e): void => {
            setBrandFilter(e.target.value);
            setPage(1);
          }}
          data-testid="filter-brand"
        >
          <option value="all">All Brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          className="prod-select"
          value={storeFilter}
          onChange={(e): void => {
            setStoreFilter(e.target.value);
            setPage(1);
          }}
          data-testid="filter-store"
        >
          <option value="all">All Stores</option>
          {storeColumns.map((c) => (
            <option key={c.store_id} value={c.store_id}>
              {c.store_name}
            </option>
          ))}
        </select>
        <button
          className="header-icon-btn"
          aria-label="More filters"
          style={{ width: 36, height: 36 }}
          type="button"
        >
          <SlidersHorizontal size={16} />
        </button>
        <div className="prod-toggle" data-testid="view-toggle">
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={(): void => setViewMode('list')}
            aria-label="List view"
            type="button"
          >
            <List size={16} />
          </button>
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={(): void => setViewMode('grid')}
            aria-label="Grid view"
            type="button"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="web-center-spinner" data-testid="catalog-loading">
          <Spinner size="md" />
        </div>
      )}
      {error && (
        <EmptyState
          variant="error"
          heading="Failed to load catalogue"
          body={error}
          data-testid="catalog-error"
        />
      )}

      {!loading && !error && (
        <>
          {isNarrow || viewMode === 'grid' ? (
            <div
              className="web-product-cards"
              data-testid="catalog-cards"
              style={
                viewMode === 'grid' && !isNarrow
                  ? { gridTemplateColumns: 'repeat(2, 1fr)', display: 'grid', gap: 12 }
                  : undefined
              }
            >
              {pageRows.map((r) => (
                <div
                  className="web-product-card"
                  key={r.id}
                  data-testid={`catalog-card-${r.id}`}
                  style={{
                    border: '1px solid var(--it-border)',
                    borderRadius: 0,
                    background: 'var(--it-card)',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div
                    className="web-product-card__head"
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="web-cell-product__name" style={{ fontWeight: 600 }}>
                        {r.name}
                      </span>
                      <span
                        className="web-cell-mono"
                        style={{ fontSize: 11, color: 'var(--it-text-secondary)' }}
                      >
                        {r.sku}
                        {r.model ? ` · ${r.model}` : ''} · {r.category}
                      </span>
                    </span>
                    <span className="web-cell-mono" style={{ fontWeight: 700 }}>
                      {(r.total_quantity ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="prod-card__stores">
                    <StoreBreakdown quantities={r.store_quantities ?? []} />
                  </div>
                  <div className="prod-card__foot">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(): void => setSelectedProduct(r)}
                      data-testid={`view-product-card-${r.id}`}
                    >
                      <Eye size={14} aria-hidden="true" /> View
                    </Button>
                    <span className="prod-card__store-count">
                      {(r.store_quantities ?? []).length} store
                      {(r.store_quantities ?? []).length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              ))}
              {pageRows.length === 0 && (
                <EmptyState
                  heading="No products found"
                  body="No products match the search criteria."
                  data-testid="catalog-empty"
                />
              )}
            </div>
          ) : (
            <div
              style={{
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-lg)',
                background: 'var(--it-card)',
                overflow: 'hidden',
              }}
            >
              <table
                className="dash-table catalog-table"
                data-testid="catalog-table"
                style={{ width: '100%' }}
              >
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Stores</th>
                    <th>Total Stock</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} data-testid={`catalog-row-${r.id}`}>
                      <td>
                        <span
                          className="web-cell-product"
                          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                        >
                          <span className="web-cell-product__name" style={{ fontWeight: 600 }}>
                            {r.name}
                          </span>
                          <span
                            className="web-cell-mono"
                            style={{ fontSize: 11, color: 'var(--it-text-secondary)' }}
                          >
                            {r.sku}
                            {r.model ? ` · ${r.model}` : ''}
                          </span>
                        </span>
                      </td>
                      <td>{r.category}</td>
                      <td>
                        <StoreBreakdown quantities={r.store_quantities ?? []} />
                      </td>
                      <td className="web-cell-mono" style={{ fontWeight: 700 }}>
                        {(r.total_quantity ?? 0).toLocaleString()}
                      </td>
                      <td className="catalog-actions">
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                          }}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(): void => setSelectedProduct(r)}
                            data-testid={`view-product-${r.id}`}
                            title={`View ${r.name}`}
                          >
                            <Eye size={14} aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 24 }}>
                        <EmptyState
                          heading="No products found"
                          body="No products match the search criteria."
                          data-testid="catalog-empty"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="prod-pagination" data-testid="prod-pagination">
            <span className="prod-pagination__info" data-testid="pagination-info">
              Showing {filteredResults.length === 0 ? 0 : startIdx + 1}–
              {Math.min(startIdx + PAGE_SIZE, filteredResults.length)} of {filteredResults.length}{' '}
              products
            </span>
            <div className="prod-pagination__pages">
              <button
                className="prod-page-btn"
                disabled={safePage <= 1}
                onClick={(): void => setPage((p) => Math.max(1, p - 1))}
                data-testid="page-prev"
                type="button"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 7)
                .map((n) => (
                  <button
                    key={n}
                    className={`prod-page-btn ${n === safePage ? 'active' : ''}`}
                    onClick={(): void => setPage(n)}
                    data-testid={`page-${n}`}
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              {totalPages > 7 && (
                <span style={{ padding: '0 4px', color: 'var(--it-text-secondary)' }}>…</span>
              )}
              {totalPages > 7 && (
                <button
                  className={`prod-page-btn ${totalPages === safePage ? 'active' : ''}`}
                  onClick={(): void => setPage(totalPages)}
                  data-testid={`page-${totalPages}`}
                  type="button"
                >
                  {totalPages}
                </button>
              )}
              <button
                className="prod-page-btn"
                disabled={safePage >= totalPages}
                onClick={(): void => setPage((p) => Math.min(totalPages, p + 1))}
                data-testid="page-next"
                type="button"
              >
                ›
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
