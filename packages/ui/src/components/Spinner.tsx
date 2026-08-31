import React from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const SIZE_MAP: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 36,
};

export function Spinner({
  size = 'md',
  className = '',
  label = 'Loading...',
}: SpinnerProps): React.ReactElement {
  const px = SIZE_MAP[size];
  return (
    <div
      className={`it-spinner it-spinner--${size} ${className}`}
      role="status"
      style={{ width: px, height: px }}
    >
      <span className="it-spinner__circle" />
      <span className="it-sr-only">{label}</span>
    </div>
  );
}

const CSS = `
.it-spinner {
  display: inline-block;
  position: relative;
  flex-shrink: 0;
}

.it-spinner__circle {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 100%;
  border: 2px solid var(--it-border-strong);
  border-top-color: var(--it-green);
  border-radius: 50%;
  animation: it-spin 0.75s linear infinite;
}

@keyframes it-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .it-spinner__circle { animation: none; }
}

.it-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-spinner-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-spinner-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
