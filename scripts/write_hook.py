#!/usr/bin/env python3
"""Write the useGridKeyboardFlow hook file."""

content = '''import { useState, useCallback, useEffect, useRef } from 'react';

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
  handleSearchSelect: (rowIndex: number, productLabel: string) => void;
  isCommitting: boolean;
  fieldRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  registerFieldRef: (cellId: string, el: HTMLInputElement | null) => void;
  searchQuery: string;
  barcodeBuffer: string;
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
'''

with open(r'd:/inven-Tory/packages/ui/src/hooks/useGridKeyboardFlow.ts', 'w') as f:
    f.write(content)
print('Part 1 written')
