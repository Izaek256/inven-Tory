import React from 'react';

/* ─── Card ───────────────────────────────────────────────────────────────── */
export interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPad?: boolean;
}

export function Card({ children, className = '', noPad = false }: CardProps): React.ReactElement {
  return <div className={`it-card ${noPad ? 'it-card--no-pad' : ''} ${className}`}>{children}</div>;
}

/* ─── StatCard ───────────────────────────────────────────────────────────── */
export interface StatCardProps {
  label: string;
  value: string | number;
  valueColour?: 'green' | 'red' | 'amber' | 'accent' | 'default';
  className?: string;
}

export function StatCard({
  label,
  value,
  valueColour = 'default',
  className = '',
}: StatCardProps): React.ReactElement {
  return (
    <div className={`it-card it-stat-card ${className}`}>
      <div className="it-stat-card__label">{label}</div>
      <div className={`it-stat-card__value it-stat-card__value--${valueColour}`}>{value}</div>
    </div>
  );
}

/* ─── SummaryCard ────────────────────────────────────────────────────────── */
export interface SummaryCardProps {
  title?: string;
  subtitle?: string;
  titleIcon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}

export function SummaryCard({
  title,
  subtitle,
  titleIcon,
  children,
  className = '',
  headerAction,
}: SummaryCardProps): React.ReactElement {
  return (
    <div className={`it-card it-summary-card ${className}`}>
      {(title || headerAction) && (
        <div className="it-summary-card__header">
          <div className="it-summary-card__title-row">
            {titleIcon && <span className="it-summary-card__icon">{titleIcon}</span>}
            <div>
              {title && <div className="it-summary-card__title">{title}</div>}
              {subtitle && <div className="it-summary-card__subtitle">{subtitle}</div>}
            </div>
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="it-summary-card__body">{children}</div>
    </div>
  );
}

const CSS = `
.it-card {
  background-color: var(--it-card);
  border: 1px solid var(--it-border);
  border-radius: var(--it-r-lg);
  box-shadow: var(--it-shadow-xs);
  padding: var(--it-sp-5);
}
.it-card--no-pad { padding: 0; overflow: hidden; }

/* StatCard */
.it-stat-card { display: flex; flex-direction: column; gap: var(--it-sp-2); }
.it-stat-card__label {
  font-size: var(--it-text-xs);
  font-weight: var(--it-weight-semibold);
  letter-spacing: var(--it-tracking-label);
  text-transform: uppercase;
  color: var(--it-text-secondary);
}
.it-stat-card__value {
  font-family: var(--it-font-mono);
  font-size: var(--it-text-xl);
  font-weight: var(--it-weight-bold);
  color: var(--it-text-primary);
  line-height: 1.1;
}
.it-stat-card__value--green  { color: var(--it-green-text); }
.it-stat-card__value--red    { color: var(--it-red-text); }
.it-stat-card__value--amber  { color: var(--it-amber-text); }
.it-stat-card__value--accent { color: var(--it-accent-text); }

/* SummaryCard */
.it-summary-card { padding: 0; overflow: hidden; }
.it-summary-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--it-sp-4) var(--it-sp-5);
  border-bottom: 1px solid var(--it-border);
  gap: var(--it-sp-3);
}
.it-summary-card__title-row {
  display: flex;
  align-items: center;
  gap: var(--it-sp-3);
}
.it-summary-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--it-green);
}
.it-summary-card__title {
  font-size: var(--it-text-md);
  font-weight: var(--it-weight-semibold);
  color: var(--it-text-primary);
}
.it-summary-card__subtitle {
  font-size: var(--it-text-xs);
  color: var(--it-text-secondary);
  margin-top: 2px;
}
.it-summary-card__body { padding: var(--it-sp-5); }
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-card-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-card-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
