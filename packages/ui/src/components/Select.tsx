import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  label,
  hint,
  error,
  required,
  options,
  placeholder,
  id,
  className = '',
  children,
  ...props
}: SelectProps): React.ReactElement {
  const selectId = id ?? `it-select-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className={`it-field ${error ? 'it-field--error' : ''} ${className}`}>
      {label && (
        <label className="it-label" htmlFor={selectId}>
          {label}
          {required && (
            <span className="it-label__required" aria-label="required">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      <select id={selectId} className="it-input it-select" aria-invalid={!!error} {...props}>
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {error && (
        <p className="it-field__error" role="alert">
          {error}
        </p>
      )}
      {hint && !error && <p className="it-field__hint">{hint}</p>}
    </div>
  );
}

const CSS = `
.it-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--it-sp-3) center;
  padding-right: calc(var(--it-sp-3) + 16px + var(--it-sp-2));
  cursor: pointer;
}
[data-theme='dark'] .it-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b95a8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
}
.it-select option {
  background-color: var(--it-card);
  color: var(--it-text-primary);
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-select-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-select-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
