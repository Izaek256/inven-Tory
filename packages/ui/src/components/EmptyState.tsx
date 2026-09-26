import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  heading: string;
  body?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'error' | 'loading' | 'success' | 'search' | 'noconnection';
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
  // Default illustrations per variant (SVG inline for zero dependencies)
  const defaultIllustrations: Record<string, React.ReactNode> = {
    default: (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
      >
        <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
        <path
          d="M16 24h32M16 32h24M16 40h16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="48" cy="48" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M44 48h8M48 44v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    search: (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
      >
        <circle cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="2" />
        <path d="M44 44l14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M32 24v16M24 32h16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    ),
    error: (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
      >
        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="3" />
        <path d="M32 20v12M32 44v4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
    success: (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
      >
        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="3" />
        <path
          d="M20 32l10 10 18-18"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    noconnection: (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
      >
        <path
          d="M8 56l48-48M8 8l48 48"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M16 48l16-16M48 16l-16 16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    ),
    loading: (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
      >
        <circle
          cx="32"
          cy="32"
          r="20"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="80"
          strokeDashoffset="40"
        >
          <animate
            attributeName="stroke-dashoffset"
            dur="1s"
            repeatCount="indefinite"
            from="40"
            to="120"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            dur="1s"
            repeatCount="indefinite"
            from="0 32 32"
            to="360 32 32"
          />
        </circle>
      </svg>
    ),
  };

  const illustration = icon ?? defaultIllustrations[variant] ?? defaultIllustrations.default;

  return (
    <div className={`it-empty-state it-empty-state--${variant} ${className}`} data-testid={testId}>
      <div className="it-empty-state__icon">{illustration}</div>
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
  padding: 54px 20px;
  background-color: var(--it-bg);
  border: 1px dashed var(--it-border-strong);
  border-radius: var(--it-r-sm);
  gap: var(--it-sp-3);
  max-width: 520px;
  margin: 0 auto;
}

.it-empty-state__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  color: var(--it-text-secondary);
  margin-bottom: var(--it-sp-2);
  flex-shrink: 0;
}

.it-empty-state--error .it-empty-state__icon,
.it-empty-state--noconnection .it-empty-state__icon {
  color: var(--it-red-text);
}

.it-empty-state--success .it-empty-state__icon {
  color: var(--it-green-text);
}

.it-empty-state--loading .it-empty-state__icon {
  color: var(--it-teal);
}

.it-empty-state__heading {
  font-size: var(--it-text-lg);
  font-weight: var(--it-weight-semibold);
  color: var(--it-text-primary);
}

.it-empty-state__body {
  font-size: var(--it-text-base);
  color: var(--it-text-secondary);
  line-height: 1.6;
  max-width: 420px;
}

.it-empty-state__action {
  margin-top: var(--it-sp-3);
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
