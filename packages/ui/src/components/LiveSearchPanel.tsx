import React from 'react';

const HISTORY_KEY = 'it-search-history';
const MAX_HISTORY = 10;

export function loadSearchHistory(): string[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

export function pushSearchHistory(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return loadSearchHistory();
  const next = [trimmed, ...loadSearchHistory().filter((t) => t !== trimmed)];
  saveHistory(next);
  return next;
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

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
  allItems?: SearchResultItem[];
  dataTestid?: string;
  searchHistory?: string[];
  onSearchHistoryClear?: () => void;
  onHistorySelect?: (term: string) => void;
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
  allItems = [],
  dataTestid,
  searchHistory = [],
  onSearchHistoryClear,
  onHistorySelect,
}: LiveSearchPanelProps): React.ReactElement {
  const [localHighlightedIndex, setLocalHighlightedIndex] = React.useState(highlightedIndex);
  const [localHistory, setLocalHistory] = React.useState<string[]>(() => loadSearchHistory());
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const history = searchHistory.length > 0 ? searchHistory : localHistory;

  React.useEffect(() => {
    setLocalHighlightedIndex(highlightedIndex);
    if (highlightedIndex >= 0) {
      const el = itemRefs.current[highlightedIndex];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({
          block: 'nearest',
          behavior: 'auto',
        });
      }
    }
  }, [highlightedIndex]);

  const showResults = query.trim().length > 0;

  // Immediate client-side filtering on allItems on every keystroke
  const filteredAllItems = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || allItems.length === 0) return [];
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        (item.detail && item.detail.toLowerCase().includes(q)),
    );
  }, [allItems, query]);

  // If backend results are ready, display them; otherwise display the instantly filtered list
  const displayItems = showResults
    ? results.length > 0
      ? results
      : filteredAllItems
    : allItems.length > 0
      ? allItems
      : recentItems;

  const handleSelect = React.useCallback(
    (item: SearchResultItem): void => {
      if (query.trim()) setLocalHistory(pushSearchHistory(query));
      onSelect(item);
    },
    [onSelect, query],
  );

  const isEmpty = !isLoading && displayItems.length === 0;
  const showAllItemsLabel = !showResults && allItems.length > 0;
  const showRecentLabel = !showResults && allItems.length === 0 && recentItems.length > 0;

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
        handleSelect(displayItems[localHighlightedIndex]);
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
        maxHeight: '400px',
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

      {!isLoading && history.length > 0 && !showResults && (
        <div className="it-search-history">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Recent Searches</span>
            <button
              type="button"
              className="it-search-history-clear"
              data-testid="search-history-clear"
              onClick={() => {
                clearSearchHistory();
                setLocalHistory([]);
                onSearchHistoryClear?.();
              }}
            >
              Clear
            </button>
          </div>
          {history.slice(0, 5).map((term) => (
            <div
              key={term}
              className="it-search-history-item"
              role="option"
              aria-selected={false}
              data-testid="search-history-item"
              onClick={() => {
                onHistorySelect?.(term);
                onHighlightedIndexChange(-1);
              }}
              onMouseEnter={() => onHighlightedIndexChange(-1)}
            >
              <span style={{ fontSize: '12px', color: 'var(--it-text-disabled)' }}>↩</span>
              <span>{term}</span>
            </div>
          ))}
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
          {showResults ? 'No results found' : (emptyState ?? 'No products available')}
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div>
          {showAllItemsLabel && (
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
              All Products
            </div>
          )}
          {showRecentLabel && (
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
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              role="option"
              aria-selected={idx === highlightedIndex}
              data-testid={`search-result-${item.id}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => onHighlightedIndexChange(idx)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--it-border)',
                backgroundColor: idx === highlightedIndex ? 'var(--it-surface)' : 'transparent',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {/* Left: name + model subtext */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '13px',
                    color: 'var(--it-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.label}
                </div>
                {item.subtitle && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--it-text-secondary)',
                      fontStyle: 'italic',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.subtitle}
                  </div>
                )}
              </div>

              {/* Right: qty badge */}
              {item.detail && (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--it-text-secondary)',
                    backgroundColor: 'var(--it-surface)',
                    border: '1px solid var(--it-border)',
                    borderRadius: '10px',
                    padding: '1px 7px',
                    fontFamily: 'var(--it-font-mono)',
                    whiteSpace: 'nowrap',
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
