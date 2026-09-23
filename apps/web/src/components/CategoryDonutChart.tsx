import React, { useMemo } from 'react';
import type { CategoryDistributionPoint } from '../types/dashboard';

/**
 * CategoryDonutChart — artifact-style donut.
 * Conic-gradient ring (no SVG text on the chart surface), center-hole total,
 * square legend swatches. Teal-first artifact palette.
 */

const COLORS = [
  'var(--teal)',
  'var(--amber)',
  'var(--green)',
  'var(--red)',
  '#6d5a4a',
  '#1f5b54',
  '#7a4a0f',
  '#2e7d4f',
];

interface CategoryDonutChartProps {
  data: CategoryDistributionPoint[];
  /** Total catalogue product count — shown in the center of the donut ring. */
  totalProducts?: number;
  height?: number;
  testId?: string;
}

/** A single legend row: square swatch + category name left, count + percentage right. */
function DonutLegendRow({
  color,
  category,
  count,
  percentage,
}: {
  color: string;
  category: string;
  count: number;
  percentage: number;
}): React.ReactElement {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: 0,
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: 'var(--it-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {category}
      </span>
      <span
        style={{
          color: 'var(--it-text-secondary)',
          marginLeft: 'auto',
          paddingLeft: 12,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'var(--it-font-mono)',
          fontSize: 11.5,
        }}
      >
        {count} ({percentage}%)
      </span>
    </li>
  );
}

export function CategoryDonutChart({
  data,
  totalProducts,
  height = 210,
  testId,
}: CategoryDonutChartProps): React.ReactElement | null {
  const sorted = useMemo(() => [...data].sort((a, b) => b.percentage - a.percentage), [data]);

  if (!sorted.length) {
    return (
      <div
        data-testid={testId}
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--it-text-secondary)',
          backgroundColor: 'var(--it-surface)',
          border: '1px solid var(--it-border)',
          fontSize: 13,
        }}
      >
        No category data available
      </div>
    );
  }

  const formattedData = sorted.map((d, i) => ({
    ...d,
    color: COLORS[i % COLORS.length],
  }));

  // Total shown in the donut hole — prefer the explicit catalogue total from
  // the API response, fall back to the sum of the slice counts.
  const total = totalProducts ?? formattedData.reduce((sum, d) => sum + d.count, 0);

  // Conic-gradient ring: slices proportional to percentage (fallback to
  // count-share when percentages sum to ~0).
  const pctSum = formattedData.reduce((s, d) => s + d.percentage, 0);
  const countSum = formattedData.reduce((s, d) => s + d.count, 0) || 1;
  let acc = 0;
  const stops = formattedData
    .map((d) => {
      const share = pctSum > 0 ? d.percentage / pctSum : d.count / countSum;
      const from = acc * 100;
      acc += share;
      const to = acc * 100;
      return `${d.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
    })
    .join(', ');

  return (
    <div
      data-testid={testId}
      className="it-donut-layout"
      style={{
        minHeight: height,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 22,
      }}
    >
      {/* Donut ring — pure color, no text on the chart surface. */}
      <div
        data-testid="donut-chart-area"
        className="it-donut-chart"
        style={{
          width: 132,
          height: 132,
          flex: '0 0 132px',
          borderRadius: '50%',
          background: `conic-gradient(${stops})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          data-testid="donut-center-total"
          aria-label={`${total} products total`}
          style={{
            width: 82,
            height: 82,
            borderRadius: '50%',
            background: 'var(--it-card)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1,
              color: 'var(--it-text-primary)',
              fontFamily: 'var(--it-font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {total.toLocaleString()}
          </span>
          <span style={{ fontSize: 10, color: 'var(--it-text-secondary)', marginTop: 2 }}>
            Products
          </span>
        </div>
      </div>

      {/* Legend — the ONLY place names/percentages appear. */}
      <ul
        data-testid="donut-legend"
        className="it-donut-legend"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flex: '1 1 auto',
          minWidth: 0,
          maxHeight: height,
          overflowY: 'auto',
        }}
      >
        {formattedData.map((d) => (
          <DonutLegendRow
            key={d.category}
            color={d.color}
            category={d.category}
            count={d.count}
            percentage={d.percentage}
          />
        ))}
      </ul>
    </div>
  );
}
