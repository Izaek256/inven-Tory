import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { CategoryDistributionPoint } from '../types/dashboard';

const COLORS = [
  'var(--it-green)',
  'var(--it-blue, #3b82f6)',
  'var(--it-amber, #f59e0b)',
  'var(--it-purple, #8b5cf6)',
  'var(--it-teal, #14b8a6)',
  'var(--it-red, #ef4444)',
  'var(--it-indigo, #6366f1)',
  'var(--it-pink, #ec4899)',
  'var(--it-orange, #f97316)',
  'var(--it-cyan, #06b6d4)',
];

interface CategoryDonutChartProps {
  data: CategoryDistributionPoint[];
  /** Total catalogue product count — shown in the center of the donut ring. */
  totalProducts?: number;
  height?: number;
  testId?: string;
}

/** A single legend row: color dot + category name left, count + percentage right. */
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
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
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
  height = 280,
  testId,
}: CategoryDonutChartProps): React.ReactElement | null {
  if (!data.length) {
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
          borderRadius: 'var(--it-r-lg)',
          border: '1px solid var(--it-border)',
        }}
      >
        No category data available
      </div>
    );
  }

  // Sort descending by percentage so the legend reads largest-first and the
  // slice order matches. Colors follow the sorted order (not the API order).
  const sorted = [...data].sort((a, b) => b.percentage - a.percentage);
  const formattedData = sorted.map((d, i) => ({
    ...d,
    color: COLORS[i % COLORS.length],
  }));

  // Total shown in the donut hole — prefer the explicit catalogue total from
  // the API response, fall back to the sum of the slice counts.
  const total = totalProducts ?? formattedData.reduce((sum, d) => sum + d.count, 0);

  return (
    <div
      data-testid={testId}
      className="it-donut-layout"
      style={{
        height,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* Left ~45%: the donut itself — color-coded slices only, no text on the chart. */}
      <div
        data-testid="donut-chart-area"
        className="it-donut-chart"
        style={{ position: 'relative', flex: '0 0 45%', height: '100%' }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={formattedData}
              cx="50%"
              cy="50%"
              innerRadius={64}
              outerRadius={96}
              paddingAngle={2}
              dataKey="count"
              nameKey="category"
              isAnimationActive={false}
              // No label / labelLine — the chart renders only color-coded slices.
              // All category names, counts, and percentages appear exclusively in the legend.
            >
              {formattedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--it-card)',
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-md)',
                boxShadow: 'var(--it-shadow-lg)',
              }}
              formatter={(value: number, name: string) => [value, name]}
              labelStyle={{ color: 'var(--it-text-primary)', fontWeight: 500 }}
            />
            {/* No recharts <Legend> — the legend is a plain HTML list below,
                so it can show count + percentage per row and sort independently. */}
          </PieChart>
        </ResponsiveContainer>
        {/* Center-of-ring total, absolutely positioned over the donut hole. */}
        <div
          data-testid="donut-center-total"
          aria-label={`${total} products total`}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1,
              color: 'var(--it-text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {total.toLocaleString()}
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--it-text-secondary)',
              marginTop: 4,
            }}
          >
            Products
          </span>
        </div>
      </div>

      {/* Right ~55%: vertical legend — the ONLY place names/percentages appear. */}
      <ul
        data-testid="donut-legend"
        className="it-donut-legend"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: '1 1 55%',
          minWidth: 0,
          maxHeight: '100%',
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
