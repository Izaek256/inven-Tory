import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  numeric?: boolean; // right-align + JetBrains Mono
  width?: string;
  render?: (row: T) => React.ReactNode;
  accessor?: (row: T) => string | number | boolean | null | undefined;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptySlot?: React.ReactNode;
  'data-testid'?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptySlot,
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
                    col.numeric ? 'it-th--numeric' : '',
                    col.sortable ? 'it-th--sortable' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={col.width ? { width: col.width } : undefined}
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
                <tr key={rowKey(row)} className="it-tr">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={['it-td', col.numeric ? 'it-td--numeric' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {col.render ? col.render(row) : String(col.accessor?.(row) ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CSS = `
.it-table-wrap {
  border: 1px solid var(--it-border);
  border-radius: var(--it-r-lg);
  overflow: hidden;
  box-shadow: var(--it-shadow-xs);
}
.it-table-scroll { overflow-x: auto; width: 100%; }
.it-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--it-text-base);
  text-align: left;
}

.it-th {
  background-color: var(--it-surface);
  color: var(--it-text-secondary);
  font-size: var(--it-text-xs);
  font-weight: var(--it-weight-semibold);
  letter-spacing: var(--it-tracking-label);
  text-transform: uppercase;
  padding: var(--it-sp-3) var(--it-sp-5);
  border-bottom: 1px solid var(--it-border);
  white-space: nowrap;
}
.it-th--numeric { text-align: right; }
.it-th--sortable { cursor: pointer; }
.it-th--sortable:hover { color: var(--it-text-primary); }
.it-th__inner { display: inline-flex; align-items: center; gap: var(--it-sp-1); }
.it-th__sort-icons { display: inline-flex; flex-direction: column; }
.it-sort--active { color: var(--it-green); }

.it-tr:hover { background-color: var(--it-surface); }
.it-tr:last-child .it-td { border-bottom: none; }

.it-td {
  padding: var(--it-sp-3) var(--it-sp-5);
  border-bottom: 1px solid var(--it-border);
  color: var(--it-text-primary);
  vertical-align: middle;
}
.it-td--numeric {
  font-family: var(--it-font-mono);
  font-size: var(--it-text-base);
  font-weight: var(--it-weight-medium);
  text-align: right;
  color: var(--it-text-primary);
}
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
