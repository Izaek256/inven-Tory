import React, { useCallback, useMemo, useState } from 'react';
import { LiveSearchPanel, SearchResultItem } from './LiveSearchPanel';
import { useGridKeyboardFlow, GridFieldDef, GridRow } from '../hooks/useGridKeyboardFlow';

export interface LinearGridEntryProps {
  fields: GridFieldDef[];
  onCommitRow: (row: GridRow, rowIndex: number) => void | Promise<void>;
  onSearch: (query: string, rowIndex: number) => void;
  onBarcodeScan: (barcode: string, rowIndex: number) => void;
  searchResults: SearchResultItem[];
  allItems?: SearchResultItem[];
  initialRowCount?: number;
  dataTestid?: string;
  fieldTestIds?: Record<string, string>;
  onVoidRow?: (rowId: string, rowIndex: number) => void;
  /** Called when a committed row is edited. newValues contains all field values. */
  onEditRow?: (rowId: string, newValues: Record<string, string | number>) => Promise<void>;
  /** Called when a committed row is deleted. */
  onDeleteRow?: (rowId: string) => Promise<void>;
}

function getCellId(rowIndex: number, fieldId: string): string {
  return `cell-${rowIndex}-${fieldId}`;
}

// ─── Inline icon button ────────────────────────────────────────────────────────

interface IconBtnProps {
  onClick: () => void;
  title: string;
  color?: string;
  children: React.ReactNode;
  'data-testid'?: string;
}

function IconBtn({
  onClick,
  title,
  color = 'var(--it-text-secondary)',
  children,
  ...rest
}: IconBtnProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={rest['data-testid']}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color,
        padding: '3px 4px',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--it-r-sm)',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.opacity = '0.7';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.opacity = '1';
      }}
    >
      {children}
    </button>
  );
}

// ─── SVG icons (16 px, stroke-based) ─────────────────────────────────────────

const PencilIcon = (): React.ReactElement => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15H2v-3L11.5 2.5Z" />
  </svg>
);

const CheckIcon = (): React.ReactElement => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="2,8 6,12 14,4" />
  </svg>
);

const TrashIcon = (): React.ReactElement => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="2,4 14,4" />
    <path d="M5 4V2h6v2" />
    <rect x="3" y="4" width="10" height="10" rx="1" />
    <line x1="6" y1="7" x2="6" y2="11" />
    <line x1="10" y1="7" x2="10" y2="11" />
  </svg>
);

export function LinearGridEntry({
  fields,
  onCommitRow,
  onSearch,
  onBarcodeScan,
  searchResults,
  allItems = [],
  initialRowCount = 8,
  dataTestid,
  fieldTestIds = {},
  onVoidRow,
  onEditRow,
  onDeleteRow,
}: LinearGridEntryProps): React.ReactElement {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const panelItemCountRef = React.useRef(allItems.length);

  // Edit/delete UI state (purely presentational — hook state is untouched)
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string | number>>({});
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingRow, setIsDeletingRow] = useState(false);

  // Arrow key handler forwarded from grid inputs to drive panel highlight
  const handleArrowInPanel = useCallback((direction: 1 | -1): void => {
    setHighlightedIndex((prev) => {
      const count = panelItemCountRef.current;
      const next = prev + direction;
      if (next < -1) return -1;
      if (next >= count) return count - 1;
      return next;
    });
  }, []);

  const {
    rows,
    activeRowIndex,
    activeFieldIndex,
    handleKeyDown,
    handleFieldChange,
    handleFieldFocus,
    handleSearchSelect,
    isCommitting,
    registerFieldRef,
    searchQuery,
    patchRowValues,
  } = useGridKeyboardFlow({
    fields,
    initialRowCount,
    onCommitRow,
    onSearch,
    onBarcodeScan,
    onArrowInSearchPanel: handleArrowInPanel,
  });

  // Client-side filtered list for immediate letter-by-letter typing feedback
  const filteredAllItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || allItems.length === 0) return [];
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        (item.detail && item.detail.toLowerCase().includes(q)),
    );
  }, [allItems, searchQuery]);

  const activeDisplayItems = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults.length > 0 ? searchResults : filteredAllItems;
    }
    return allItems.length > 0 ? allItems : searchResults;
  }, [searchQuery, searchResults, filteredAllItems, allItems]);

  React.useEffect(() => {
    panelItemCountRef.current = activeDisplayItems.length;
  }, [activeDisplayItems]);

  // Reset highlight whenever the search query changes (new search starts)
  React.useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  const searchFieldId = useMemo(
    () => fields.find((f) => f.id.toLowerCase().includes('product'))?.id ?? null,
    [fields],
  );

  const handleSearchPanelSelect = useCallback(
    (item: SearchResultItem): void => {
      handleSearchSelect(activeRowIndex, item.label, item.id);
      setHighlightedIndex(-1);
    },
    [activeRowIndex, handleSearchSelect],
  );

  // When Enter is pressed in a search field with a highlighted suggestion,
  // select that suggestion first instead of advancing to the next field.
  // This is handled in the grid's onKeyDown (hook level) via handleSearchSelect
  // being called when Enter fires; but the hook needs to know if a suggestion
  // is highlighted. We intercept Enter at the input level to do this:
  const handleInputKeyDown = useCallback(
    (rowIndex: number, fieldIndex: number) =>
      (e: React.KeyboardEvent<HTMLInputElement>): void => {
        const row = rows[rowIndex];
        if (row?.committed) {
          if (e.key === 'Enter') {
            e.preventDefault();
            const nextUncommitted = rows.findIndex((r, i) => i > rowIndex && !r.committed);
            if (nextUncommitted >= 0) {
              handleFieldFocus(nextUncommitted, 0);
              const cellId = getCellId(nextUncommitted, fields[0]?.id ?? '');
              setTimeout(() => {
                const el = document.querySelector(
                  `[data-cell-id="${cellId}"]`,
                ) as HTMLInputElement | null;
                el?.focus();
              }, 0);
            }
          }
          return;
        }

        const field = fields[fieldIndex];
        const isProductField = field?.id.toLowerCase().includes('product');

        if (e.key === 'Enter' && isProductField && highlightedIndex >= 0) {
          // Panel item highlighted — select it, don't advance field yet
          e.preventDefault();
          e.stopPropagation();
          const item = activeDisplayItems[highlightedIndex];
          if (item) {
            handleSearchPanelSelect(item);
          }
          return;
        }

        if (e.key === 'Backspace') {
          const el = e.currentTarget;
          if (el.value === '' && fieldIndex > 0) {
            e.preventDefault();
            handleFieldFocus(rowIndex, fieldIndex - 1);
            const prevCellId = getCellId(rowIndex, fields[fieldIndex - 1]?.id ?? '');
            setTimeout(() => {
              const prevEl = document.querySelector(
                `[data-cell-id="${prevCellId}"]`,
              ) as HTMLInputElement | null;
              if (prevEl) {
                prevEl.focus();
                prevEl.select();
              }
            }, 0);
          }
          return;
        }

        // All other keys go through the grid-level handler
      },
    [rows, fields, highlightedIndex, activeDisplayItems, handleSearchPanelSelect, handleFieldFocus],
  );

  const handleInputChange = useCallback(
    (rowIndex: number, fieldId: string) =>
      (e: React.ChangeEvent<HTMLInputElement>): void => {
        handleFieldChange(rowIndex, fieldId, e.target.value);
      },
    [handleFieldChange],
  );

  const handleInputFocus = useCallback(
    (rowIndex: number, fieldIndex: number) => (): void => {
      handleFieldFocus(rowIndex, fieldIndex);
    },
    [handleFieldFocus],
  );

  // ─── Edit handlers ─────────────────────────────────────────────────────────

  const startEditing = useCallback((row: GridRow): void => {
    setEditingRowId(row.id);
    setDeletingRowId(null); // clear any pending delete confirm
    setEditValues({ ...row.values });
  }, []);

  const commitEdit = useCallback(
    async (rowId: string): Promise<void> => {
      if (!onEditRow) return;
      setIsSavingEdit(true);
      try {
        await onEditRow(rowId, editValues);
        // Sync the new values back into the hook's row state so the grid
        // cell re-renders with the updated data instead of the stale original.
        patchRowValues(rowId, editValues);
      } finally {
        setIsSavingEdit(false);
        setEditingRowId(null);
      }
    },
    [onEditRow, editValues, patchRowValues],
  );

  const confirmDelete = useCallback(
    async (rowId: string): Promise<void> => {
      if (!onDeleteRow) return;
      setIsDeletingRow(true);
      try {
        await onDeleteRow(rowId);
      } finally {
        setIsDeletingRow(false);
        setDeletingRowId(null);
      }
    },
    [onDeleteRow],
  );

  return (
    <div data-testid={dataTestid} style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
      {/* ── Left: the grid ─────────────────────────────────────────────── */}
      <div style={{ flex: '1 1 58%', minWidth: '320px' }}>
        <div onKeyDown={handleKeyDown}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid var(--it-border)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--it-tracking-label)',
                  color: 'var(--it-text-secondary)',
                }}
              >
                <th style={{ width: '36px', padding: '6px 0', textAlign: 'center' }}>#</th>
                {fields.map((f) => (
                  <th key={f.id} style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 600 }}>
                    {f.label}
                  </th>
                ))}
                {/* actions column — wider when edit/delete enabled */}
                <th style={{ width: onEditRow || onDeleteRow ? '64px' : '28px' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const isEditing = editingRowId === row.id;
                const isDeleting = deletingRowId === row.id;

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid var(--it-border)',
                      backgroundColor: isEditing
                        ? 'rgba(59, 130, 246, 0.05)'
                        : row.committed
                          ? 'transparent'
                          : rowIndex === activeRowIndex
                            ? 'rgba(59, 130, 246, 0.04)'
                            : 'transparent',
                      opacity: row.committed && !isEditing ? 0.72 : 1,
                    }}
                  >
                    {/* Row number */}
                    <td
                      style={{
                        padding: '5px 6px',
                        textAlign: 'center',
                        fontSize: '11px',
                        color: 'var(--it-text-secondary)',
                        fontFamily: 'var(--it-font-mono)',
                      }}
                    >
                      {rowIndex + 1}
                    </td>

                    {/* Field cells */}
                    {fields.map((field, fieldIndex) => {
                      const cellId = getCellId(rowIndex, field.id);
                      const isActive =
                        rowIndex === activeRowIndex && fieldIndex === activeFieldIndex;
                      const testId = fieldTestIds[field.id] ?? cellId;
                      // When editing: use editValues; otherwise use row.values
                      const cellValue = isEditing
                        ? (editValues[field.id] ?? '')
                        : (row.values[field.id] ?? '');
                      // disabled: committed rows that are NOT being edited, OR field is readOnly
                      const isDisabled = (row.committed && !isEditing) || field.readOnly;

                      return (
                        <td key={field.id} style={{ padding: '3px 4px' }}>
                          <input
                            data-cell-id={cellId}
                            data-testid={testId}
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={cellValue}
                            placeholder={isDisabled ? '' : field.placeholder}
                            disabled={isDisabled}
                            onChange={
                              isEditing
                                ? (e): void =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      [field.id]: e.target.value,
                                    }))
                                : handleInputChange(rowIndex, field.id)
                            }
                            onFocus={handleInputFocus(rowIndex, fieldIndex)}
                            onKeyDown={
                              isEditing
                                ? (e): void => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void commitEdit(row.id);
                                    }
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      setEditingRowId(null);
                                    }
                                  }
                                : handleInputKeyDown(rowIndex, fieldIndex)
                            }
                            ref={(el) => registerFieldRef(cellId, el)}
                            min={field.min}
                            max={field.max}
                            style={{
                              width: '100%',
                              padding: '5px 7px',
                              border:
                                isActive && !isEditing
                                  ? '2px solid var(--it-accent)'
                                  : isEditing
                                    ? '1px solid var(--it-accent)'
                                    : '1px solid transparent',
                              borderRadius: 'var(--it-r-sm)',
                              backgroundColor: isEditing
                                ? 'var(--it-card)'
                                : isDisabled
                                  ? 'transparent'
                                  : isActive
                                    ? 'var(--it-card)'
                                    : 'transparent',
                              color: isDisabled
                                ? 'var(--it-text-secondary)'
                                : 'var(--it-text-primary)',
                              fontSize: '13px',
                              fontFamily:
                                field.type === 'number'
                                  ? 'var(--it-font-mono)'
                                  : 'var(--it-font-ui)',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                        </td>
                      );
                    })}

                    {/* Actions cell (edit / delete / void) */}
                    <td style={{ padding: '3px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {row.committed && (
                        <>
                          {/* ── Edit/checkmark ─────────────────────── */}
                          {onEditRow &&
                            (isEditing ? (
                              <IconBtn
                                onClick={() => void commitEdit(row.id)}
                                title="Save changes"
                                color="var(--it-accent)"
                                data-testid={`edit-commit-${row.id}`}
                              >
                                {isSavingEdit ? '…' : <CheckIcon />}
                              </IconBtn>
                            ) : (
                              <IconBtn
                                onClick={() => startEditing(row)}
                                title="Edit this entry"
                                data-testid={`edit-row-${row.id}`}
                              >
                                <PencilIcon />
                              </IconBtn>
                            ))}

                          {/* ── Delete / inline confirm ─────────────── */}
                          {onDeleteRow &&
                            !isEditing &&
                            (isDeleting ? (
                              <span
                                style={{
                                  fontSize: '11px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <IconBtn
                                  onClick={() => void confirmDelete(row.id)}
                                  title="Confirm delete"
                                  color="#ef4444"
                                  data-testid={`delete-confirm-${row.id}`}
                                >
                                  {isDeletingRow ? '…' : '✓'}
                                </IconBtn>
                                <IconBtn
                                  onClick={() => setDeletingRowId(null)}
                                  title="Cancel"
                                  data-testid={`delete-cancel-${row.id}`}
                                >
                                  ✗
                                </IconBtn>
                              </span>
                            ) : (
                              <IconBtn
                                onClick={() => setDeletingRowId(row.id)}
                                title="Delete this entry"
                                color="var(--it-text-secondary)"
                                data-testid={`delete-row-${row.id}`}
                              >
                                <TrashIcon />
                              </IconBtn>
                            ))}

                          {/* Legacy void button (kept for backwards compat) */}
                          {onVoidRow && !onDeleteRow && (
                            <button
                              onClick={() => onVoidRow(row.id, rowIndex)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#ef4444',
                                padding: '2px',
                                fontSize: '16px',
                              }}
                              title="Void entry"
                            >
                              ×
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isCommitting && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--it-text-secondary)' }}>
            Saving…
          </div>
        )}
      </div>

      {/* ── Right: live search panel ──────────────────────────────────── */}
      {searchFieldId && (
        <div
          style={{
            flex: '0 0 38%',
            maxWidth: '380px',
            position: 'sticky',
            top: '8px',
            alignSelf: 'flex-start',
          }}
        >
          <LiveSearchPanel
            query={searchQuery}
            results={searchResults}
            allItems={allItems}
            onSelect={handleSearchPanelSelect}
            highlightedIndex={highlightedIndex}
            onHighlightedIndexChange={setHighlightedIndex}
            dataTestid="live-search-panel"
          />
        </div>
      )}
    </div>
  );
}
