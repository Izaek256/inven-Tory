/**
 * DashboardTile — modular analytics tile for the web dashboard (Phase 3, 2.1).
 *
 * The analytics dashboard is an extensible surface: new tiles can be dropped
 * into the tile grid freely (each tile is self-contained: title, icon, value,
 * optional detail lines / footer). Layout is a responsive auto-fit grid, so
 * tile count does not need to be fixed.
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface DashboardTileProps {
  /** Tile heading, e.g. "Total Products". */
  title: string;
  /** Hero value, e.g. "142" or "—". */
  value: React.ReactNode;
  /** Optional lucide icon rendered in the tile header. */
  icon?: LucideIcon;
  /** Optional accent color (defaults to the green brand accent). */
  accent?: string;
  /** Optional secondary lines rendered under the hero value. */
  details?: React.ReactNode;
  /** Optional footer line (e.g. "Updated 2 min ago"). */
  footer?: React.ReactNode;
  /** Stable test hook. */
  testId?: string;
  /** Loading state — renders a pulse instead of the value. */
  loading?: boolean;
}

export function DashboardTile({
  title,
  value,
  icon: Icon,
  accent = 'var(--it-green)',
  details,
  footer,
  testId,
  loading = false,
}: DashboardTileProps): React.ReactElement {
  return (
    <div className="web-dashboard-tile" data-testid={testId} style={{ borderLeftColor: accent }}>
      <div className="web-dashboard-tile__head">
        {Icon && <Icon size={16} color={accent} aria-hidden="true" />}
        <span className="web-dashboard-tile__title">{title}</span>
      </div>
      <div
        className="web-dashboard-tile__value"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {loading ? <span className="web-dashboard-tile__pulse" /> : value}
      </div>
      {details && <div className="web-dashboard-tile__details">{details}</div>}
      {footer && <div className="web-dashboard-tile__footer">{footer}</div>}
    </div>
  );
}
