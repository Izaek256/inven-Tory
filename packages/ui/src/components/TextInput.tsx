import React from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';

/* ─── TextInput ──────────────────────────────────────────────────────────── */
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export function TextInput({
  label,
  hint,
  error,
  required,
  id,
  className = '',
  ...props
}: TextInputProps): React.ReactElement {
  const inputId = id ?? `it-input-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className={`it-field ${error ? 'it-field--error' : ''} ${className}`}>
      {label && (
        <label className="it-label" htmlFor={inputId}>
          {label}
          {required && (
            <span className="it-label__required" aria-label="required">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      <input id={inputId} className="it-input" aria-invalid={!!error} {...props} />
      {error && (
        <p className="it-field__error" role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="it-field__hint">{hint}</p>}
    </div>
  );
}

/* ─── NumericInput ───────────────────────────────────────────────────────── */
export interface NumericInputProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  id?: string;
  'data-testid'?: string;
}

export function NumericInput({
  label,
  hint,
  error,
  required,
  value,
  min = 0,
  max,
  step = 1,
  onChange,
  disabled = false,
  id,
  'data-testid': testId,
}: NumericInputProps): React.ReactElement {
  const inputId = id ?? `it-num-${Math.random().toString(36).slice(2, 7)}`;

  const decrement = (): void => {
    const next = value - step;
    if (min === undefined || next >= min) onChange(next);
  };

  const increment = (): void => {
    const next = value + step;
    if (max === undefined || next <= max) onChange(next);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) onChange(parsed);
  };

  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className={`it-field ${error ? 'it-field--error' : ''}`}>
      {label && (
        <label className="it-label" htmlFor={inputId}>
          {label}
          {required && (
            <span className="it-label__required" aria-label="required">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      <div className="it-numeric">
        <button
          type="button"
          className="it-numeric__btn"
          onClick={decrement}
          disabled={disabled || atMin}
          aria-label="Decrease"
          tabIndex={0}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <input
          id={inputId}
          type="number"
          className="it-input it-input--numeric"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={handleChange}
          disabled={disabled}
          aria-invalid={!!error}
          data-testid={testId}
        />
        <button
          type="button"
          className="it-numeric__btn"
          onClick={increment}
          disabled={disabled || atMax}
          aria-label="Increase"
          tabIndex={0}
        >
          <ChevronUp size={14} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p className="it-field__error" role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="it-field__hint">{hint}</p>}
    </div>
  );
}

/* ─── SearchInput ────────────────────────────────────────────────────────── */
export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function SearchInput({
  label,
  id,
  className = '',
  ...props
}: SearchInputProps): React.ReactElement {
  const inputId = id ?? `it-search-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className={`it-search ${className}`}>
      {label && (
        <label className="it-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="it-search__wrap">
        <Search className="it-search__icon" size={16} aria-hidden="true" />
        <input id={inputId} type="search" className="it-input it-search__input" {...props} />
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const CSS = `
.it-field { display: flex; flex-direction: column; gap: var(--it-sp-1); }
.it-field--error .it-input { border-color: var(--it-red); }
.it-field--error .it-input:focus-visible { box-shadow: var(--it-focus-ring-red); }

.it-label {
  font-size: var(--it-text-sm);
  font-weight: var(--it-weight-semibold);
  color: var(--it-text-primary);
  letter-spacing: var(--it-tracking-label);
  text-transform: uppercase;
}
.it-label__required { color: var(--it-red); }

.it-input {
  width: 100%;
  padding: var(--it-sp-2) var(--it-sp-3);
  background-color: var(--it-card);
  border: 1px solid var(--it-border);
  border-radius: var(--it-r-md);
  color: var(--it-text-primary);
  font-family: var(--it-font-ui);
  font-size: var(--it-text-base);
  transition: border-color var(--it-dur-fast) var(--it-ease), box-shadow var(--it-dur-fast) var(--it-ease);
  outline: none;
}
.it-input::placeholder { color: var(--it-text-disabled); }
.it-input:focus-visible {
  border-color: var(--it-accent);
  box-shadow: var(--it-focus-ring);
}
.it-input:disabled {
  background-color: var(--it-surface);
  color: var(--it-text-disabled);
  cursor: not-allowed;
}

/* Numeric */
.it-input--numeric {
  text-align: center;
  font-family: var(--it-font-mono);
  font-size: var(--it-text-base);
  font-weight: var(--it-weight-medium);
  -moz-appearance: textfield;
  border-radius: 0;
  border-left: none;
  border-right: none;
  flex: 1;
}
.it-input--numeric::-webkit-outer-spin-button,
.it-input--numeric::-webkit-inner-spin-button { -webkit-appearance: none; }

.it-numeric {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--it-border);
  border-radius: var(--it-r-md);
  overflow: hidden;
}
.it-numeric:focus-within {
  border-color: var(--it-accent);
  box-shadow: var(--it-focus-ring);
}
.it-numeric__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--it-sp-2) var(--it-sp-3);
  background-color: var(--it-surface);
  border: none;
  color: var(--it-text-secondary);
  cursor: pointer;
  transition: background-color var(--it-dur-fast) var(--it-ease), color var(--it-dur-fast) var(--it-ease);
}
.it-numeric__btn:hover:not(:disabled) {
  background-color: var(--it-gray-surface);
  color: var(--it-text-primary);
}
.it-numeric__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.it-numeric__btn:focus-visible { outline: none; box-shadow: var(--it-focus-ring); }

/* Search */
.it-search { display: flex; flex-direction: column; gap: var(--it-sp-1); }
.it-search__wrap { position: relative; }
.it-search__icon {
  position: absolute;
  left: var(--it-sp-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--it-text-secondary);
  pointer-events: none;
}
.it-search__input { padding-left: calc(var(--it-sp-3) + 16px + var(--it-sp-2)); }

.it-field__error { font-size: var(--it-text-xs); color: var(--it-red-text); }
.it-field__hint  { font-size: var(--it-text-xs); color: var(--it-text-secondary); }
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-input-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-input-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
