import React from 'react';

export interface SearchResultItem {
  id: string;
  label: string;
  subtitle?: string;
  detail?: string;
  [key: string]: unknown;
}

export interface LiveSearchPanelProps {
  query: string;
  results: SearchResultItem[];
  isLoading?: boolean;
  onSelect: (item: SearchResultItem) => void;
  highlightedIndex: number;
  onHighlightedIndexChange: (index: number) => void;
  emptyState?: React.ReactNode;
  recentItems?: SearchResultItem[];
  dataTestid?: string;
}

export function LiveSearchPanel({
  query,
  results,
  isLoading = false,
  onSelect,
  highlightedIndex,
  onHighlightedIndexChange,
  emptyState,
  recentItems = [],
  dataTestid,
}: LiveSearchPanelProps): React.ReactElement {
  const [localHighlightedIndex, setLocalHighlightedIndex] = React.useState(highlightedIndex);

  React.useEffect(() => {
    setLocalHighlightedIndex(highlightedIndex);
  }, [highlightedIndex]);

  const showResults = query.trim().length > 0;
  const displayItems = showResults ? results : recentItems;
  const isEmpty = !isLoading && displayItems.length === 0;

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      const next = Math.min(localHighlightedIndex + 1, displayItems.length - 1);
      setLocalHighlightedIndex(next);
      onHighlightedIndexChange(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const next = Math.max(localHighlightedIndex - 1, -1);
      setLocalHighlightedIndex(next);
      onHighlightedIndexChange(next);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (localHighlightedIndex >= 0 && localHighlightedIndex < displayItems.length) {
        onSelect(displayItems[localHighlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setLocalHighlightedIndex(-1);
      onHighlightedIndexChange(-1);
    }
  };

  return (
    <div
      data-testid={dataTestid}
      style={{
        width: '100%',
        maxHeight: '320px',
        overflowY: 'auto',
        border: '1px solid var(--it-border)',
        borderRadius: 'var(--it-r-md)',
        backgroundColor: 'var(--it-card)',
        boxShadow: 'var(--it-shadow-md)',
      }}
      role="listbox"
      aria-label="Search results"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {isLoading && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--it-text-secondary)',
            fontSize: '13px',
          }}
        >
          Searching...
        </div>
      )}

      {!isLoading && isEmpty && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--it-text-secondary)',
            fontSize: '13px',
          }}
        >
          {showResults ? 'No results found' : (emptyState ?? 'No recent items')}
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div>
          {!showResults && recentItems.length > 0 && (
            <div
              style={{
                padding: '8px 14px',
                fontSize: '11px',
                color: 'var(--it-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--it-tracking-label)',
                fontWeight: 600,
                borderBottom: '1px solid var(--it-border)',
              }}
            >
              Recent
            </div>
          )}
          {displayItems.map((item, idx) => (
            <div
              key={item.id}
              role="option"
              aria-selected={idx === highlightedIndex}
              data-testid={`search-result-${item.id}`}
              onClick={() => onSelect(item)}
              onMouseEnter={() => onHighlightedIndexChange(idx)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--it-border)',
                backgroundColor: idx === highlightedIndex ? 'var(--it-surface)' : 'transparent',
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
                    fontSize: '12px',
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
}
