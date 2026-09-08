import { useState, useCallback, useEffect, useRef } from 'react';

export interface FieldDef {
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

export interface UseKeyboardEntryFlowOptions {
  fields: FieldDef[];
  onCommit: (values: Record<string, string | number>) => void | Promise<void>;
  debounceMs?: number;
  defaultValues?: Record<string, string | number>;
}

export interface UseKeyboardEntryFlowReturn {
  values: Record<string, string | number>;
  setFieldValue: (id: string, value: string | number) => void;
  activeFieldIndex: number;
  activeFieldId: string | null;
  setActiveFieldIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  isSubmitting: boolean;
  resetRow: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  fieldRefs: Record<string, HTMLInputElement | HTMLSelectElement | null>;
  registerFieldRef: (id: string, el: HTMLInputElement | HTMLSelectElement | null) => void;
}

function isSearchField(field: FieldDef): boolean {
  const id = field.id.toLowerCase();
  return id.includes('product') || id.includes('search') || field.type === 'text';
}

export function useKeyboardEntryFlow({
  fields,
  onCommit,
  debounceMs: _debounceMs = 120,
}: UseKeyboardEntryFlowOptions): UseKeyboardEntryFlowReturn {
  const getDefaults = useCallback(() => {
    const next: Record<string, string | number> = {};
    for (const f of fields) {
      next[f.id] = f.defaultValue ?? (f.type === 'number' ? 1 : '');
    }
    return next;
  }, [fields]);

  const [values, setValues] = useState<Record<string, string | number>>(getDefaults);
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQueryState] = useState('');
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  const activeField = fields[activeFieldIndex] ?? null;
  const activeFieldId = activeField?.id ?? null;
  const isActiveSearch = activeField ? isSearchField(activeField) : false;

  const setFieldValue = useCallback(
    (id: string, value: string | number) => {
      setValues((prev) => {
        const next = { ...prev, [id]: value };
        if (isActiveSearch && id === activeFieldId) {
          setSearchQueryState(String(value));
        }
        return next;
      });
    },
    [activeFieldId, isActiveSearch],
  );

  const setSearchQuery = useCallback((q: string) => {
    setSearchQueryState(q);
  }, []);

  const resetRow = useCallback(() => {
    const next: Record<string, string | number> = {};
    for (const f of fields) {
      next[f.id] = f.defaultValue ?? (f.type === 'number' ? 1 : '');
    }
    setValues(next);
    setActiveFieldIndex(0);
    setSearchQueryState('');
  }, [fields]);

  const focusField = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, fields.length - 1));
      setActiveFieldIndex(clamped);
      const field = fields[clamped];
      if (field) {
        const el = fieldRefs.current[field.id];
        if (el) {
          el.focus();
          if (field.type === 'number' && el instanceof HTMLInputElement) {
            el.select();
          }
        }
      }
    },
    [fields],
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeFieldIndex === fields.length - 1) {
          setIsSubmitting(true);
          try {
            await onCommit(values);
            resetRow();
            focusField(0);
          } finally {
            setIsSubmitting(false);
          }
        } else {
          focusField(activeFieldIndex + 1);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        resetRow();
        focusField(0);
      } else if (e.key === 'Tab') {
        if (e.shiftKey) {
          e.preventDefault();
          focusField(activeFieldIndex - 1);
        } else {
          e.preventDefault();
          focusField(activeFieldIndex + 1);
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const currentField = fields[activeFieldIndex];
        const isSearch = currentField
          ? currentField.id.toLowerCase().includes('product') ||
            currentField.id.toLowerCase().includes('search')
          : false;

        if (isSearch) {
          return;
        }
        e.preventDefault();
      }
    },
    [activeFieldIndex, fields, onCommit, resetRow, values, focusField],
  );

  useEffect(() => {
    if (isActiveSearch && activeFieldId) {
      const val = values[activeFieldId];
      setSearchQueryState(String(val ?? ''));
    } else if (!isActiveSearch) {
      setSearchQueryState('');
    }
  }, [activeFieldId, activeFieldIndex, isActiveSearch, values]);

  const defaultsRef = useRef<string>('');
  useEffect(() => {
    const nextDefaults = getDefaults();
    const serialized = JSON.stringify(nextDefaults);
    if (defaultsRef.current !== serialized) {
      defaultsRef.current = serialized;
      setValues(nextDefaults);
      setSearchQueryState('');
    }
  }, [getDefaults]);

  useEffect(() => {
    if (activeFieldId && typeof document !== 'undefined') {
      const field = fields.find((f) => f.id === activeFieldId);
      if (field?.type === 'number') {
        const el = document.getElementById(activeFieldId) as HTMLInputElement | null;
        if (el && document.activeElement === el) {
          el.select();
        }
      }
    }
  }, [activeFieldId, fields]);

  useEffect(() => {
    if (fields.length > 0 && activeFieldIndex === 0) {
      const firstId = fields[0].id;
      const el = fieldRefs.current[firstId];
      if (el) {
        el.focus();
      }
    }
  }, [fields, activeFieldIndex]);

  const registerFieldRef = useCallback(
    (id: string, el: HTMLInputElement | HTMLSelectElement | null) => {
      fieldRefs.current[id] = el;
    },
    [],
  );

  return {
    values,
    setFieldValue,
    activeFieldIndex,
    activeFieldId,
    setActiveFieldIndex: focusField,
    handleKeyDown,
    isSubmitting,
    resetRow,
    searchQuery,
    setSearchQuery,
    fieldRefs: fieldRefs.current,
    registerFieldRef,
  };
}
