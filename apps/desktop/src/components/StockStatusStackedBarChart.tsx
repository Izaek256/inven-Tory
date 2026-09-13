import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { StockStatusCategoryRow } from '../types/dashboard';

interface StockStatusStackedBarChartProps {
  data: StockStatusCategoryRow[];
  height?: number;
  testId?: string;
}

export function StockStatusStackedBarChart({
  data,
  height = 280,
  testId,
}: StockStatusStackedBarChartProps): React.ReactElement | null {
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
        No stock status data available
      </div>
    );
  }

  const formattedData = data.map((d) => ({
    category: d.category.length > 15 ? d.category.slice(0, 15) + '…' : d.category,
    fullCategory: d.category,
    inStock: d.in_stock,
    lowStock: d.low_stock,
    outOfStock: d.out_of_stock,
    total: d.total,
  }));

  return (
    <div data-testid={testId} style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formattedData}
          layout="vertical"
          margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--it-border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: 'var(--it-text-secondary)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--it-border)' }}
            tickLine={false}
          />
          <YAxis
            dataKey="category"
            type="category"
            width={120}
            tick={{ fill: 'var(--it-text-primary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--it-card)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
              boxShadow: 'var(--it-shadow-lg)',
            }}
            labelFormatter={(label: string) => {
              const item = formattedData.find((d) => d.category === label);
              return item?.fullCategory || label;
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                inStock: 'In Stock',
                lowStock: 'Low Stock',
                outOfStock: 'Out of Stock',
              };
              return [value, labels[name] || name];
            }}
          />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="top"
            iconType="square"
            iconSize={10}
            wrapperStyle={{ paddingTop: 5 }}
          />
          <Bar
            dataKey="inStock"
            stackId="stock"
            fill="var(--it-green)"
            name="In Stock"
            radius={[0, 4, 4, 0]}
            minPointSize={0}
          />
          <Bar
            dataKey="lowStock"
            stackId="stock"
            fill="var(--it-amber, #f59e0b)"
            name="Low Stock"
            minPointSize={0}
          />
          <Bar
            dataKey="outOfStock"
            stackId="stock"
            fill="var(--it-red, #ef4444)"
            name="Out of Stock"
            radius={[4, 0, 0, 4]}
            minPointSize={0}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
