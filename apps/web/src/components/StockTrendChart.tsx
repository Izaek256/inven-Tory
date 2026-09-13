import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { StockTrendPoint } from '../types/dashboard';

interface StockTrendChartProps {
  data: StockTrendPoint[];
  height?: number;
  testId?: string;
}

export function StockTrendChart({
  data,
  height = 280,
  testId,
}: StockTrendChartProps): React.ReactElement | null {
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
        No stock trend data available
      </div>
    );
  }

  const formattedData = data.map((d) => ({
    date: d.date,
    value: d.total_stock_units,
    formattedDate: new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
  }));

  return (
    <div data-testid={testId} style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--it-border)" vertical={false} />
          <XAxis
            dataKey="formattedDate"
            tick={{ fill: 'var(--it-text-secondary)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--it-border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--it-text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--it-card)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
              boxShadow: 'var(--it-shadow-lg)',
            }}
            labelStyle={{ color: 'var(--it-text-primary)', fontWeight: 500 }}
            formatter={(value: number) => [value.toLocaleString(), 'Total Stock Units']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--it-green)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--it-green)', fill: 'var(--it-bg)' }}
            // Draw-in on first render (Task E) — brief, ease-out, not sluggish.
            isAnimationActive
            animationDuration={600}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
