import React, { useState, useEffect, useRef, useId } from 'react';
import { Product } from '../types/product';
import { searchProducts } from '../services/tauriProductService';
import { Badge, Spinner } from '@inven-tory/ui';
import { Search, Package, Check, Tag, Barcode } from 'lucide-react';

interface ProductPickerProps {
  onSelectProduct: (product: Product) => void;
  onClose?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const ProductPicker: React.FC<ProductPickerProps> = ({
  onSelectProduct,
  onClose,
  placeholder = 'Scan barcode or type to search product (name, SKU, model, barcode)...',
  autoFocus = true,
}) => {
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-focus input element on mount (Keyboard-first / Barcode scanner friendly per Section 18)
  useEffect((): void => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Execute live search against local DB data (FR-PROD-003)
  useEffect((): (() => void) => {
    let isCancelled = false;
    const fetchResults = async (): Promise<void> => {
      setLoading(true);
      try {
        const matches = await searchProducts(query);
        if (!isCancelled) {
          setResults(matches);
          setSelectedIndex(0);
          setHasSearched(true);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ProductPicker] Search error:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchResults();
    }, 150);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Keep highlighted item visible in scroll view
  useEffect((): void => {
    if (resultsContainerRef.current && results.length > 0) {
      const selectedElem = resultsContainerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElem && typeof selectedElem.scrollIntoView === 'function') {
        selectedElem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, results]);

  // Keyboard navigation handler (ArrowDown, ArrowUp, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      if (onClose) onClose();
    }
  };

  const handleSelect = (product: Product): void => {
    onSelectProduct(product);
  };

  return (
    <div
      className="product-picker-container"
      data-testid="product-picker"
      style={{
        backgroundColor: 'var(--it-card)',
        border: '1px solid var(--it-border)',
        borderRadius: 'var(--it-r-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--it-shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="picker-search-bar"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--it-border)',
          backgroundColor: 'var(--it-surface)',
        }}
      >
        <Search
          size={18}
          className="picker-search-icon"
          style={{ position: 'absolute', left: '14px', color: 'var(--it-green)' }}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            results[selectedIndex] ? `picker-item-${results[selectedIndex].id}` : undefined
          }
          className="picker-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="picker-search-input"
          style={{
            width: '100%',
            padding: '12px 14px 12px 42px',
            background: 'transparent',
            border: 'none',
            color: 'var(--it-text-primary)',
            fontSize: '14px',
            fontFamily: 'var(--it-font-ui)',
            outline: 'none',
          }}
        />
        {loading && (
          <div style={{ paddingRight: '14px' }} data-testid="picker-loading">
            <Spinner size="sm" />
          </div>
        )}
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Product search results"
        className="picker-results-list"
        ref={resultsContainerRef}
        data-testid="picker-results-list"
        style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        {results.length === 0 && hasSearched && !loading ? (
          <div
            className="picker-no-results"
            data-testid="picker-no-results"
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--it-text-secondary)',
              fontSize: '13px',
            }}
          >
            <Package size={24} style={{ opacity: 0.5, marginBottom: '4px' }} />
            <div>No matching products found for "{query}"</div>
          </div>
        ) : (
          results.map((prod, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={prod.id}
                id={`picker-item-${prod.id}`}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                className={`picker-result-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(prod)}
                onMouseEnter={() => setSelectedIndex(index)}
                data-testid={`picker-item-${prod.id}`}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--it-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--it-surface)' : 'transparent',
                }}
              >
                <div
                  className="picker-item-main"
                  style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}
                >
                  <div
                    className="picker-item-header"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span
                      className="picker-sku"
                      data-testid={`picker-sku-${prod.id}`}
                      style={{
                        fontFamily: 'var(--it-font-mono)',
                        fontWeight: 700,
                        color: 'var(--it-green-text)',
                        fontSize: '12px',
                      }}
                    >
                      {prod.sku}
                    </span>
                    <span
                      className="picker-name"
                      style={{ fontSize: '13px', fontWeight: 600, color: 'var(--it-text-primary)' }}
                    >
                      {prod.name}
                    </span>
                    {prod.serial_tracking_enabled && <Badge status="SENT" label="SERIAL" />}
                  </div>
                  <div
                    className="picker-item-details"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '11px',
                      color: 'var(--it-text-secondary)',
                    }}
                  >
                    {prod.brand && (
                      <span
                        className="picker-detail"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Tag size={12} /> {prod.brand} {prod.model ? `(${prod.model})` : ''}
                      </span>
                    )}
                    <span className="picker-detail">Cat: {prod.category}</span>
                    <span className="picker-detail">Unit: {prod.unit}</span>
                    {prod.barcode && (
                      <span
                        className="picker-detail"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Barcode size={12} /> {prod.barcode}
                      </span>
                    )}
                  </div>
                  {prod.alternate_names && (
                    <div
                      className="picker-alt-names"
                      style={{
                        fontSize: '11px',
                        color: 'var(--it-text-secondary)',
                        fontStyle: 'italic',
                      }}
                    >
                      Aliases: {prod.alternate_names}
                    </div>
                  )}
                </div>
                {isSelected && <Check size={16} style={{ color: 'var(--it-green)' }} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
