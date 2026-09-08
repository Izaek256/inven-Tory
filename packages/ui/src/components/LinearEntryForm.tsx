import React, { useMemo, useCallback } from 'react';
import { Button, TextInput, NumericInput, Select, DataTable } from '@invenTory/ui';
import { LiveSearchPanel, SearchResultItem } from './LiveSearchPanel';
import { useKeyboardEntryFlow, FieldDef } from '../hooks/useKeyboardEntryFlow';
import type { ColumnDef } from './Table';

export interface LinearEntryFormProps<TRow extends object = Record<string, unknown>> {
  fields: FieldDef[];
  onCommit: (values: Record<string, string | number>) => void | Promise<void>;
  searchResults?: SearchResultItem[];
  onSearch?: (query: string) => void;
  onSearchSelect?: (item: SearchResultItem) => void;
  sessionTableRows?: TRow[];
  sessionTableColumns?: ColumnDef<TRow>[];
  sessionTableEmptyState?: React.ReactNode;
  sessionTableTitle?: string;
  renderSessionRowActions?: (row: TRow, index: number) => React.ReactNode;
  title?: string;
  subtitle?: string;
  dataTestid?: string;
  fieldTestIds?: Record<string, string>;
  submitTestId?: string;
  submitLabel?: string;
}

export function LinearEntryForm<TRow extends object = Record<string, unknown>>({
  fields,
  onCommit,
  searchResults = [],
  onSearch,
  onSearchSelect,
  sessionTableRows = [],
  sessionTableColumns = [],
  sessionTableEmptyState,
  sessionTableTitle,
  title,
  subtitle,
  dataTestid,
  fieldTestIds = {},
  submitTestId = 'linear-entry-submit',
  submitLabel = 'Commit',
}: LinearEntryFormProps<TRow>): React.ReactElement {
  const searchFieldId = useMemo(
    () =>
      fields.find(
        (f) => f.id.toLowerCase().includes('product') || f.id.toLowerCase().includes('search'),
      )?.id ?? null,
    [fields],
  );

  const {
    values,
    setFieldValue,
    setActiveFieldIndex,
    handleKeyDown,
    isSubmitting,
    resetRow,
    searchQuery,
    setSearchQuery,
  } = useKeyboardEntryFlow({
    fields,
    onCommit,
  });

  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);

  React.useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  const handleSearchChange = useCallback(
    (id: string, value: string) => {
      setFieldValue(id, value);
      setSearchQuery(value);
      onSearch?.(value);
    },
    [onSearch, setFieldValue, setSearchQuery],
  );

  const handleSearchSelect = useCallback(
    (item: SearchResultItem) => {
      if (searchFieldId) {
        setFieldValue(searchFieldId, item.label);
      }
      onSearchSelect?.(item);
      setHighlightedIndex(-1);
      setSearchQuery('');
    },
    [onSearchSelect, searchFieldId, setFieldValue, setSearchQuery],
  );

  const handleFieldFocus = useCallback(
    (index: number) => {
      setActiveFieldIndex(index);
    },
    [setActiveFieldIndex],
  );

  const hasSearchResults = searchFieldId && searchResults.length > 0;

  return (
    <div data-testid={dataTestid} style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 60%', minWidth: '320px' }}>
        {title && (
          <div className="view-header" style={{ marginBottom: '16px' }}>
            <div>
              <h2 className="view-title">{title}</h2>
              {subtitle && <p className="view-subtitle">{subtitle}</p>}
            </div>
          </div>
        )}

        <div
          onKeyDown={handleKeyDown}
          style={{
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '16px' }}>
            {fields.map((field, idx) => {
              const isSearch = field.id === searchFieldId;
              const testId = fieldTestIds[field.id] ?? `field-${field.id}`;
              const commonInputProps = {
                id: field.id,
                label: field.label,
                required: field.required,
                placeholder: field.placeholder,
                onFocus: (): void => handleFieldFocus(idx),
                'data-testid': testId,
              };

              if (field.type === 'select') {
                return (
                  <div
                    key={field.id}
                    style={{ flex: '1 1 200px', minWidth: '160px', position: 'relative' }}
                  >
                    <Select
                      {...commonInputProps}
                      value={String(values[field.id] ?? '')}
                      onChange={(e) => setFieldValue(field.id, e.target.value)}
                      options={field.options ?? []}
                    />
                  </div>
                );
              }

              if (field.type === 'number') {
                return (
                  <div key={field.id} style={{ flex: '1 1 200px', minWidth: '160px' }}>
                    <NumericInput
                      {...commonInputProps}
                      min={field.min}
                      max={field.max}
                      value={Number(values[field.id] ?? 0)}
                      onChange={(v) => setFieldValue(field.id, v)}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={field.id}
                  style={{ flex: '1 1 200px', minWidth: '160px', position: 'relative' }}
                >
                  <TextInput
                    {...commonInputProps}
                    value={String(values[field.id] ?? '')}
                    onChange={(e) => {
                      if (isSearch) {
                        handleSearchChange(field.id, e.target.value);
                      } else {
                        setFieldValue(field.id, e.target.value);
                      }
                    }}
                  />
                  {isSearch && hasSearchResults && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        maxHeight: '240px',
                        overflowY: 'auto',
                        backgroundColor: 'var(--it-card)',
                        border: '1px solid var(--it-border)',
                        borderRadius: 'var(--it-r-md)',
                        boxShadow: 'var(--it-shadow-md)',
                        zIndex: 10,
                      }}
                      role="listbox"
                      aria-label="Search results"
                    >
                      {searchResults.map((item, index) => (
                        <div
                          key={item.id}
                          role="option"
                          aria-selected={index === highlightedIndex}
                          data-testid={`search-result-${item.id}`}
                          onClick={() => handleSearchSelect(item)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--it-border)',
                            backgroundColor:
                              index === highlightedIndex ? 'var(--it-surface)' : 'transparent',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              color: 'var(--it-text-primary)',
                            }}
                          >
                            {item.label}
                          </span>
                          {item.subtitle && (
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--it-text-secondary)',
                                fontFamily: 'var(--it-font-mono)',
                              }}
                            >
                              {item.subtitle}
                            </span>
                          )}
                          {item.detail && (
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--it-text-secondary)',
                              }}
                            >
                              {item.detail}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '8px' }}>
            <Button
              type="button"
              variant="primary"
              loading={isSubmitting}
              onClick={async () => {
                await onCommit(values);
                resetRow();
              }}
              style={{ width: '100%' }}
              data-testid={submitTestId}
            >
              {submitLabel}
            </Button>
          </div>
        </div>

        {sessionTableTitle && (
          <h3
            style={{
              marginTop: '24px',
              marginBottom: '12px',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--it-text-primary)',
            }}
          >
            {sessionTableTitle}
          </h3>
        )}

        {sessionTableColumns.length > 0 && (
          <DataTable<TRow>
            columns={sessionTableColumns}
            rows={sessionTableRows}
            rowKey={(row) => String((row as Record<string, unknown>).id ?? Math.random())}
            emptySlot={
              sessionTableEmptyState ?? (
                <span style={{ color: 'var(--it-text-secondary)' }}>No entries yet</span>
              )
            }
            data-testid="session-table"
          />
        )}
      </div>

      {searchFieldId && !hasSearchResults && (
        <div
          style={{
            flex: '0 0 40%',
            maxWidth: '400px',
            position: 'sticky',
            top: '8px',
            alignSelf: 'flex-start',
          }}
        >
          <LiveSearchPanel
            query={searchQuery}
            results={searchResults}
            onSelect={handleSearchSelect}
            highlightedIndex={highlightedIndex}
            onHighlightedIndexChange={setHighlightedIndex}
            dataTestid="live-search-panel"
          />
        </div>
      )}
    </div>
  );
}
