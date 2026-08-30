import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  heading: string;
  body?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'error' | 'loading';
  className?: string;
  'data-testid'?: string;
}

export function EmptyState({
  icon,
  heading,
  body,
  action,
  variant = 'default',
  className = '',
  'data-testid': testId,
}: EmptyStateProps): React.ReactElement {
  return (
    <div className={`it-empty-state it-empty-state--${variant} ${className}`} data-testid={testId}>
      {icon && <div className="it-empty-state__icon">{icon}</div>}
      <h3 className="it-empty-state__heading">{heading}</h3>
      {body && <p className="it-empty-state__body">{body}</p>}
      {action && <div className="it-empty-state__action">{action}</div>}
    </div>
  );
}

const CSS = `
.it-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--it-sp-12) var(--it-sp-6);
  background-color: var(--it-card);
  border: 1px dashed var(--it-border);
  border-radius: var(--it-r-lg);
  gap: var(--it-sp-3);
  max-width: 520px;
  margin: 0 auto;
}

.it-empty-state__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--it-gray-surface);
  color: var(--it-gray-text);
  margin-bottom: var(--it-sp-1);
}

.it-empty-state--error .it-empty-state__icon {
  background-color: var(--it-red-surface);
  color: var(--it-red-text);
}

.it-empty-state__heading {
  font-size: var(--it-text-md);
  font-weight: var(--it-weight-semibold);
  color: var(--it-text-primary);
}

.it-empty-state__body {
  font-size: var(--it-text-base);
  color: var(--it-text-secondary);
  line-height: 1.5;
  max-width: 400px;
}

.it-empty-state__action {
  margin-top: var(--it-sp-2);
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-empty-state-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-empty-state-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
