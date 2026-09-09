import { useState, useCallback, useEffect, useRef } from 'react';

export interface GridFieldDef {
  id: string;
  type: 'text' | 'number' | 'select';
  label: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  readOnly?: boolean;
}

export interface GridRow {
  id: string;
  values: Record<string, string | number>;
  committed: boolean;
  committedAt?: string;
}

export interface UseGridKeyboardFlowOptions {
  fields: GridFieldDef[];
  initialRowCount?: number;
  onCommitRow: (row: GridRow, rowIndex: number) => void | Promise<void>;
  onSearch: (query: string, rowIndex: number) => void;
  onBarcodeScan: (barcode: string, rowIndex: number) => void;
  /**
   * Called when ArrowUp/Down is pressed while a search field is focused.
   * direction: +1 for Down, -1 for Up. itemCount is the total items in the panel
   * so the caller can clamp the highlighted index.
   */
  onArrowInSearchPanel?: (direction: 1 | -1) => void;
}

export interface UseGridKeyboardFlowReturn {
  rows: GridRow[];
  activeRowIndex: number;
  activeFieldIndex: number;
  activeCellId: string | null;
  setActiveCell: (rowIndex: number, fieldIndex: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleFieldChange: (rowIndex: number, fieldId: string, value: string) => void;
  handleFieldFocus: (rowIndex: number, fieldIndex: number) => void;
  handleSearchSelect: (rowIndex: number, productLabel: string, productId?: string) => void;
  /** Directly commit a row by index. Use instead of relying on event-bubbling Enter. */
  triggerCommit: (rowIndex: number) => Promise<void>;
  isCommitting: boolean;
  fieldRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  registerFieldRef: (cellId: string, el: HTMLInputElement | null) => void;
  searchQuery: string;
  barcodeBuffer: string;
  /**
   * Patch the display values of an already-committed row by its id.
   * Call this after a successful onEditRow so the grid cell re-renders
   * with the updated values instead of the original stale ones.
   */
  patchRowValues: (rowId: string, newValues: Record<string, string | number>) => void;
}

function isSearchField(field: GridFieldDef): boolean {
  const id = field.id.toLowerCase();
  return id.includes('product') || id.includes('search');
}

function isLastField(fields: GridFieldDef[], fieldIndex: number): boolean {
  return fieldIndex >= fields.length - 1;
}

function getCellId(rowIndex: number, fieldId: string): string {
  return `cell-${rowIndex}-${fieldId}`;
}

export function useGridKeyboardFlow({
  fields,
  initialRowCount = 8,
  onCommitRow,
  onSearch,
  onBarcodeScan,
  onArrowInSearchPanel,
}: UseGridKeyboardFlowOptions): UseGridKeyboardFlowReturn {
  const createEmptyRow = useCallback(
    (index: number): GridRow => {
      const values: Record<string, string | number> = {};
      for (const f of fields) {
        values[f.id] = f.defaultValue ?? (f.type === 'number' ? 1 : '');
      }
      return {
        id: `row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        values,
        committed: false,
      };
    },
    [fields],
  );

  const [rows, setRows] = useState<GridRow[]>(() =>
    Array.from({ length: initialRowCount }, (_, i) => createEmptyRow(i)),
  );
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const [isCommitting, setIsCommitting] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeBuffer, setBarcodeBuffer] = useState('');

  const activeCellId = getCellId(activeRowIndex, fields[activeFieldIndex]?.id ?? '');

  const registerFieldRef = useCallback((cellId: string, el: HTMLInputElement | null): void => {
    fieldRefs.current[cellId] = el;
  }, []);

  // ─── focusCell ────────────────────────────────────────────────────────────
  // Moves DOM focus to the input at (rowIndex, fieldIndex) and updates
  // active-row/field state. Must be defined before commitRow uses it.
  const focusCell = useCallback(
    (rowIndex: number, fieldIndex: number): void => {
      const field = fields[fieldIndex];
      if (!field) return;
      const cellId = getCellId(rowIndex, field.id);
      const el = fieldRefs.current[cellId];
      setActiveRowIndex(rowIndex);
      setActiveFieldIndex(fieldIndex);
      if (el) {
        el.focus();
      }
    },
    [fields],
  );

  // ─── setActiveCell (public alias) ─────────────────────────────────────────
  const setActiveCell = useCallback(
    (rowIndex: number, fieldIndex: number): void => {
      focusCell(rowIndex, fieldIndex);
    },
    [focusCell],
  );

  const handleFieldChange = useCallback(
    (rowIndex: number, fieldId: string, value: string): void => {
      setRows((prev) => {
        const next = [...prev];
        const row = next[rowIndex];
        if (!row || row.committed) return prev;
        next[rowIndex] = { ...row, values: { ...row.values, [fieldId]: value } };
        return next;
      });
      const field = fields.find((f) => f.id === fieldId);
      if (field && isSearchField(field) && rowIndex === activeRowIndex) {
        setSearchQuery(value);
        onSearch(value, rowIndex);
      }
    },
    [fields, activeRowIndex, onSearch],
  );

  const handleFieldFocus = useCallback(
    (rowIndex: number, fieldIndex: number): void => {
      setActiveRowIndex(rowIndex);
      setActiveFieldIndex(fieldIndex);
      const field = fields[fieldIndex];
      if (field && isSearchField(field)) {
        setRows((prev) => {
          const row = prev[rowIndex];
          if (row) {
            setSearchQuery(String(row.values[field.id] ?? ''));
          }
          return prev;
        });
      }
    },
    [fields],
  );

  // ─── commitRow ────────────────────────────────────────────────────────────
  // Read the row directly from the closure so we don't rely on setState updater
  // side-effects (which React may defer past an await boundary).
  const commitRow = useCallback(
    async (rowIndex: number): Promise<void> => {
      const row = rows[rowIndex];
      if (!row || row.committed) return;

      const committedRow: GridRow = {
        ...row,
        committed: true,
        committedAt: new Date().toISOString(),
      };

      setRows((prev) => {
        // Guard: if another event committed this row already, don't double-commit
        if (prev[rowIndex]?.committed) return prev;
        const next = [...prev];
        next[rowIndex] = committedRow;
        return next;
      });

      setIsCommitting(true);
      try {
        await onCommitRow(committedRow, rowIndex);

        const nextRowIndex = rowIndex + 1;
        setRows((prev) => {
          if (nextRowIndex >= prev.length) {
            return [...prev, createEmptyRow(prev.length)];
          }
          return prev;
        });
        setSearchQuery('');
        // Focus next row's first field after React flushes the new row render
        setTimeout(() => focusCell(nextRowIndex, 0), 0);
      } finally {
        setIsCommitting(false);
      }
    },
    [rows, onCommitRow, createEmptyRow, focusCell],
  );

  // ─── handleSearchSelect ───────────────────────────────────────────────────
  const handleSearchSelect = useCallback(
    (rowIndex: number, productLabel: string, productId?: string): void => {
      setRows((prev) => {
        const next = [...prev];
        const row = next[rowIndex];
        if (!row) return prev;
        const newValues: Record<string, string | number> = { ...row.values, product: productLabel };
        if (productId) {
          newValues.product_id = productId;
        }
        next[rowIndex] = { ...row, values: newValues };
        return next;
      });
      setSearchQuery('');
      onSearch('', rowIndex);
      setTimeout(() => focusCell(rowIndex, 1), 0);
    },
    [focusCell, onSearch],
  );

  // ─── handleKeyDown ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent): Promise<void> => {
      const currentRow = rows[activeRowIndex];
      if (!currentRow) return;

      const activeField = fields[activeFieldIndex];
      const isActiveSearchField = activeField ? isSearchField(activeField) : false;

      // Committed rows: only Enter to jump to the next uncommitted row
      if (currentRow.committed) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const nextIdx = rows.findIndex((r, i) => i > activeRowIndex && !r.committed);
          if (nextIdx >= 0) focusCell(nextIdx, 0);
        }
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // HARD REQUIREMENT: arrow keys ONLY navigate the suggestion panel.
        // They must never move between grid rows or fields.
        if (isActiveSearchField) {
          e.preventDefault();
          e.stopPropagation();
          onArrowInSearchPanel?.(e.key === 'ArrowDown' ? 1 : -1);
        } else {
          // Not on a search field — still block row navigation
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (isLastField(fields, activeFieldIndex)) {
          await commitRow(activeRowIndex);
        } else {
          focusCell(activeRowIndex, activeFieldIndex + 1);
        }
        return;
      }

      if (e.key === 'Backspace') {
        const fieldId = fields[activeFieldIndex]?.id;
        const cellId = getCellId(activeRowIndex, fieldId ?? '');
        const el = fieldRefs.current[cellId];
        // Only navigate back if the field is empty and there is a previous field
        if (el && el.value === '' && activeFieldIndex > 0) {
          e.preventDefault();
          const prevIdx = activeFieldIndex - 1;
          const prevFieldId = fields[prevIdx]?.id;
          const prevCellId = getCellId(activeRowIndex, prevFieldId ?? '');
          setActiveFieldIndex(prevIdx);
          const prevEl = fieldRefs.current[prevCellId];
          if (prevEl) {
            prevEl.focus();
            prevEl.select();
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setRows((prev) => {
          const next = [...prev];
          next[activeRowIndex] = createEmptyRow(activeRowIndex);
          return next;
        });
        setSearchQuery('');
        onSearch('', activeRowIndex);
        focusCell(activeRowIndex, 0);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (activeFieldIndex > 0) focusCell(activeRowIndex, activeFieldIndex - 1);
        } else {
          if (isLastField(fields, activeFieldIndex)) {
            await commitRow(activeRowIndex);
          } else {
            focusCell(activeRowIndex, activeFieldIndex + 1);
          }
        }
        return;
      }

      // Barcode scanner: collect characters rapidly
      if (e.key.length === 1 && isActiveSearchField) {
        setBarcodeBuffer((prev) => prev + e.key);
        // A barcode scan typically delivers Enter after the characters
        // We detect "fast input" by checking buffer length on Enter (handled above)
      }
    },
    [
      rows,
      activeRowIndex,
      activeFieldIndex,
      fields,
      focusCell,
      commitRow,
      createEmptyRow,
      onArrowInSearchPanel,
      onSearch,
    ],
  );

  // Barcode detection: if the product field gets a rapid burst of characters
  // followed immediately by an Enter, it's a scanner. We handle this by checking
  // the field value length on Enter — if it matches a barcode exactly, the view's
  // onBarcodeScan callback fires and returns the exact match. The grid's Enter
  // handler then selects it. This is mediated through the view's handleCommitRow.
  // The barcodeBuffer is exposed so the view can implement its own logic.
  useEffect(() => {
    setBarcodeBuffer('');
  }, [activeRowIndex]);

  // Barcode-scan check on search field changes
  const prevSearchQuery = useRef('');
  useEffect(() => {
    if (searchQuery && searchQuery !== prevSearchQuery.current) {
      const rowIndex = activeRowIndex;
      onBarcodeScan(searchQuery, rowIndex);
    }
    prevSearchQuery.current = searchQuery;
  }, [searchQuery, activeRowIndex, onBarcodeScan]);

  // Initial focus: row 0, field 0
  const hasInitialFocused = useRef(false);
  useEffect(() => {
    if (hasInitialFocused.current) return;
    if (fields.length > 0 && rows.length > 0) {
      const cellId = getCellId(0, fields[0].id);
      const el = fieldRefs.current[cellId];
      if (el) {
        el.focus();
        hasInitialFocused.current = true;
      }
    }
  });

  const patchRowValues = useCallback(
    (rowId: string, newValues: Record<string, string | number>): void => {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, ...newValues } } : r)),
      );
    },
    [],
  );

  return {
    rows,
    activeRowIndex,
    activeFieldIndex,
    activeCellId,
    setActiveCell,
    handleKeyDown,
    handleFieldChange,
    handleFieldFocus,
    handleSearchSelect,
    triggerCommit: commitRow,
    isCommitting,
    fieldRefs,
    registerFieldRef,
    searchQuery,
    barcodeBuffer,
    patchRowValues,
  };
}
