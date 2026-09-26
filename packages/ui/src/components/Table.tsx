import React, { useState, useRef, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useVirtualizer, type Virtualizer as TanStackVirtualizer } from '@tanstack/react-virtual';

export type SortDirection = 'asc' | 'desc' | null;

// Memoized row component for DataTable to prevent unnecessary re-renders
interface DataTableRowProps<T> {
  row: T;
  columns: ColumnDef<T>[];
  rowClassName?: string;
}

function DataTableRow<T>({ row, columns, rowClassName }: DataTableRowProps<T>): React.ReactElement {
  return (
    <tr className={['it-tr', rowClassName].filter(Boolean).join(' ')}>
      {columns.map((col) => (
        <td
          key={col.key}
          className={[
            'it-td',
            col.numeric && !col.align ? 'it-td--numeric' : '',
            col.align ? `it-td--align-${col.align}` : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {col.render ? col.render(row) : String(col.accessor?.(row) ?? '')}
        </td>
      ))}
    </tr>
  );
}

const MemoizedDataTableRow = React.memo(DataTableRow);

export interface ColumnDef<T> {
  key: string;
  header: string | React.ReactElement;
  sortable?: boolean;
  numeric?: boolean; // right-align + JetBrains Mono
  width?: string;
  minWidth?: string;
  /** Explicit cell/header alignment; overrides numeric's right-align when set. */
  align?: 'left' | 'center' | 'right';
  /** Allow the header text to wrap (word-wrap) instead of staying on one line. */
  headerWrap?: boolean;
  render?: (row: T) => React.ReactNode;
  accessor?: (row: T) => string | number | boolean | null | undefined;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptySlot?: React.ReactNode;
  /** Optional per-row class (used for e.g. optimistic-update flash effects). */
  rowClassName?: (row: T) => string | undefined;
  'data-testid'?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptySlot,
  rowClassName,
  'data-testid': testId,
}: DataTableProps<T>): React.ReactElement {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  const handleSort = (key: string): void => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const sortedRows = React.useMemo<T[]>(() => {
    if (!sortKey || !sortDir) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.accessor) return rows;
    return [...rows].sort((a, b): number => {
      const av = col.accessor!(a);
      const bv = col.accessor!(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  return (
    <div className="it-table-wrap" data-testid={testId}>
      <div className="it-table-scroll">
        <table className="it-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    'it-th',
                    col.numeric && !col.align ? 'it-th--numeric' : '',
                    col.align ? `it-th--align-${col.align}` : '',
                    col.headerWrap ? 'it-th--wrap' : '',
                    col.sortable ? 'it-th--sortable' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    col.width || col.minWidth
                      ? { width: col.width, minWidth: col.minWidth }
                      : undefined
                  }
                  onClick={col.sortable ? (): void => handleSort(col.key) : undefined}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <span className="it-th__inner">
                    {col.header}
                    {col.sortable && (
                      <span className="it-th__sort-icons" aria-hidden="true">
                        <ChevronUp
                          size={12}
                          className={
                            sortKey === col.key && sortDir === 'asc' ? 'it-sort--active' : ''
                          }
                        />
                        <ChevronDown
                          size={12}
                          className={
                            sortKey === col.key && sortDir === 'desc' ? 'it-sort--active' : ''
                          }
                        />
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="it-td it-td--empty">
                  {emptySlot ?? <span className="it-table__empty-text">No data</span>}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <MemoizedDataTableRow
                  key={rowKey(row)}
                  row={row}
                  columns={columns}
                  rowClassName={rowClassName?.(row) ?? ''}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// VirtualizedDataTable — uses @tanstack/react-virtual for large row sets
// -----------------------------------------------------------------------------
export interface VirtualizedDataTableProps<T> extends Omit<DataTableProps<T>, 'rowClassName'> {
  /** Estimated height of each row in pixels (used for initial layout). */
  estimatedRowHeight?: number;
  /** Height of the virtualized container (default: 500px). */
  containerHeight?: number;
  /** Overscan count (rows rendered outside viewport). Default: 5. */
  overscan?: number;
  /** Optional per-row class for highlighting (e.g. optimistic updates). */
  rowClassName?: (row: T) => string | undefined;
}

export function VirtualizedDataTable<T>({
  columns,
  rows,
  rowKey,
  emptySlot,
  estimatedRowHeight = 44,
  containerHeight = 500,
  overscan = 5,
  rowClassName,
  'data-testid': testId,
}: VirtualizedDataTableProps<T>): React.ReactElement {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  });

  const sortedRows = useMemo<T[]>(() => {
    // VirtualizedDataTable doesn't support client-side sorting — data should be
    // pre-sorted by the caller (typically server-side). This is intentional for
    // large datasets where client-side sorting isn't practical.
    return rows;
  }, [rows]);

  const getRowClassName = useCallback(
    (index: number) => {
      const row = sortedRows[index];
      const base = 'it-tr';
      const custom = rowClassName?.(row) ?? '';
      return [base, custom].filter(Boolean).join(' ');
    },
    [sortedRows, rowClassName],
  );

  if (rows.length === 0) {
    return (
      <div className="it-table-wrap" data-testid={testId}>
        <div className="it-table-scroll" style={{ height: containerHeight }}>
          <table className="it-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="it-th"
                    style={
                      col.width || col.minWidth
                        ? { width: col.width, minWidth: col.minWidth }
                        : undefined
                    }
                  >
                    <span className="it-th__inner">{col.header}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={columns.length}
                  className="it-td it-td--empty"
                  style={{ height: containerHeight }}
                >
                  {emptySlot ?? <span className="it-table__empty-text">No data</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="it-table-wrap" data-testid={testId}>
      <div
        ref={parentRef}
        className="it-table-scroll it-table-scroll--virtualized"
        style={{ height: containerHeight, position: 'relative' }}
      >
        <table className="it-table">
          <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    'it-th',
                    col.numeric && !col.align ? 'it-th--numeric' : '',
                    col.align ? `it-th--align-${col.align}` : '',
                    col.headerWrap ? 'it-th--wrap' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    col.width || col.minWidth
                      ? { width: col.width, minWidth: col.minWidth }
                      : undefined
                  }
                >
                  <span className="it-th__inner">{col.header}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <tr
                key={rowKey(sortedRows[virtualRow.index])}
                className={getRowClassName(virtualRow.index)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      'it-td',
                      col.numeric && !col.align ? 'it-td--numeric' : '',
                      col.align ? `it-td--align-${col.align}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {col.render
                      ? col.render(sortedRows[virtualRow.index])
                      : String(col.accessor?.(sortedRows[virtualRow.index]) ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CSS = `
.it-table-wrap {
  border: 1px solid var(--it-border);
  border-radius: var(--it-r-md);
  overflow: hidden;
  box-shadow: none;
  background: var(--it-card);
}
.it-table-scroll { overflow-x: auto; width: 100%; }
.it-table-scroll--virtualized { overflow-y: auto; overflow-x: auto; }
.it-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.it-th {
  background-color: var(--it-card);
  color: var(--it-text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: none;
  padding: 0 12px 10px;
  border-bottom: 2px solid var(--ink);
  white-space: nowrap;
}
.it-th--numeric { text-align: right; }
.it-th--wrap { white-space: normal; overflow-wrap: anywhere; }
.it-th--align-center { text-align: center; }
.it-th--align-right { text-align: right; }
.it-th--sortable { cursor: pointer; }
.it-th--sortable:hover { color: var(--it-text-primary); }
.it-th__inner { display: inline-flex; align-items: center; gap: var(--it-sp-1); }
.it-th__sort-icons { display: inline-flex; flex-direction: column; }
.it-sort--active { color: var(--amber); }

.it-tr:hover { background-color: var(--it-bg); }
.it-tr:last-child .it-td { border-bottom: none; }

.it-td {
  padding: 12px;
  border-bottom: 1px solid var(--it-border);
  color: var(--it-text-primary);
  vertical-align: middle;
  font-size: 13px;
}
.it-td--numeric {
  font-family: var(--it-font-mono);
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  color: var(--it-text-primary);
  font-variant-numeric: tabular-nums;
}
.it-td--align-center { text-align: center; }
.it-td--align-right { text-align: right; }
.it-td--empty { text-align: center; padding: var(--it-sp-12); }
.it-table__empty-text { color: var(--it-text-secondary); }
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-table-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-table-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
