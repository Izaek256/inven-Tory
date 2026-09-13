/**
 * DashboardTile — modular analytics tile for the web dashboard (Phase 3, 2.1 + Phase 4).
 *
 * The analytics dashboard is an extensible surface: new tiles can be dropped
 * into the tile grid freely (each tile is self-contained: title, icon, value,
 * optional delta / detail lines / footer). Layout is a responsive fixed-column
 * grid sized so the tile count always fills complete rows (Task C).
 *
 * Typographic roles (Task B type scale — see index.css):
 *   title  → 11px uppercase muted label
 *   value  → 28px bold KPI number (tabular-nums; pass `numericValue` to get
 *            the count-up animation and locale formatting for free)
 *   delta  → 12px colored trend line
 *   footer → 12px muted supporting row, pinned to the tile's bottom edge so
 *            equal-height tiles never end in dead space
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useCountUp } from '../hooks/useCountUp';

export interface DashboardTileProps {
  /** Tile heading, e.g. "Total Products". */
  title: string;
  /**
   * Hero value for text KPIs ("3 h ago", "—"). Optional when `numericValue`
   * is provided instead — exactly one of the two should be used.
   */
  value?: React.ReactNode;
  /**
   * Numeric hero value — rendered with a brief count-up animation and locale
   * digit grouping. Use for pure-number KPIs; keep `value` for text values
   * like "3 h ago" (a count-up on text is meaningless).
   */
  numericValue?: number;
  /** Optional lucide icon rendered in the tile header. */
  icon?: LucideIcon;
  /** Optional accent color (defaults to the green brand accent). */
  accent?: string;
  /** Optional secondary lines rendered under the hero value. */
  details?: React.ReactNode;
  /** Optional footer row, pinned to the tile bottom (sparkline / context line). */
  footer?: React.ReactNode;
  /** Optional delta/trend indicator (Phase 4, Task B). */
  delta?: {
    label: string;
    positive?: boolean;
    neutral?: boolean;
  };
  /** Stable test hook. */
  testId?: string;
  /** Loading state — renders a pulse instead of the value. */
  loading?: boolean;
  /** Entrance-animation stagger delay in ms (Task E). */
  animDelay?: number;
  /** Tile variant for two-tier hierarchy: 'primary' (larger) or 'secondary' (compact). */
  variant?: 'primary' | 'secondary';
}

function CountUpValue({ value }: { value: number }): React.ReactElement {
  const display = useCountUp(value);
  return <span data-testid="tile-count-up">{display.toLocaleString()}</span>;
}

function DeltaIndicator({
  label,
  positive,
  neutral,
}: {
  label: string;
  positive?: boolean;
  neutral?: boolean;
}): React.ReactElement {
  if (neutral) {
    return (
      <span className="web-dashboard-tile__delta web-dashboard-tile__delta--neutral">
        <Minus size={12} aria-hidden="true" />
        {label}
      </span>
    );
  }
  return (
    <span
      className={`web-dashboard-tile__delta ${positive ? 'web-dashboard-tile__delta--positive' : 'web-dashboard-tile__delta--negative'}`}
    >
      {positive ? (
        <TrendingUp size={12} aria-hidden="true" />
      ) : (
        <TrendingDown size={12} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

export function DashboardTile({
  title,
  value,
  numericValue,
  icon: Icon,
  accent = 'var(--it-green)',
  details,
  footer,
  delta,
  testId,
  loading = false,
  animDelay,
  variant = 'secondary',
}: DashboardTileProps): React.ReactElement {
  return (
    <div
      className={`web-dashboard-tile web-anim-card ${variant === 'primary' ? 'web-dashboard-tile--primary' : 'web-dashboard-tile--secondary'}`}
      data-testid={testId}
      style={animDelay ? { animationDelay: `${animDelay}ms` } : undefined}
    >
      <div className="web-dashboard-tile__head">
        {Icon && (
          <span
            className="web-dashboard-tile__icon"
            style={{ backgroundColor: accent }}
            aria-hidden="true"
          >
            <Icon size={16} color="#fff" />
          </span>
        )}
        <span className="web-dashboard-tile__title">{title}</span>
      </div>
      <div
        className="web-dashboard-tile__value"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {loading ? (
          <span className="web-dashboard-tile__pulse" />
        ) : numericValue !== undefined ? (
          <CountUpValue value={numericValue} />
        ) : (
          value
        )}
      </div>
      {delta && (
        <DeltaIndicator label={delta.label} positive={delta.positive} neutral={delta.neutral} />
      )}
      {details && <div className="web-dashboard-tile__details">{details}</div>}
      {footer && <div className="web-dashboard-tile__footer">{footer}</div>}
    </div>
  );
}
