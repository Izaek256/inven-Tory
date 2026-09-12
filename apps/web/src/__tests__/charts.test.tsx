import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StockTrendChart } from '../components/StockTrendChart';
import { CategoryDonutChart } from '../components/CategoryDonutChart';
import { StockStatusStackedBarChart } from '../components/StockStatusStackedBarChart';
import type {
  StockTrendPoint,
  CategoryDistributionPoint,
  StockStatusCategoryRow,
} from '../types/dashboard';

// Recharts' ResponsiveContainer cannot measure dimensions in jsdom (renders 0×0),
// so the chart content never mounts. Mock it to render with fixed dimensions.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 400, height: 300 } as Record<string, unknown>),
  };
});

describe('StockTrendChart', () => {
  const mockData: StockTrendPoint[] = [
    { date: '2026-09-06', total_stock_units: 1200 },
    { date: '2026-09-07', total_stock_units: 1250 },
    { date: '2026-09-08', total_stock_units: 1300 },
    { date: '2026-09-09', total_stock_units: 1280 },
    { date: '2026-09-10', total_stock_units: 1350 },
    { date: '2026-09-11', total_stock_units: 1400 },
    { date: '2026-09-12', total_stock_units: 1380 },
  ];

  it('renders with data', () => {
    render(<StockTrendChart data={mockData} testId="trend-test" />);
    expect(screen.getByTestId('trend-test')).toBeInTheDocument();
  });

  it('renders empty state with no data', () => {
    render(<StockTrendChart data={[]} testId="trend-empty" />);
    expect(screen.getByText('No stock trend data available')).toBeInTheDocument();
  });
});

describe('CategoryDonutChart', () => {
  const mockData: CategoryDistributionPoint[] = [
    { category: 'Electronics', count: 50, percentage: 50.0 },
    { category: 'Furniture', count: 30, percentage: 30.0 },
    { category: 'Clothing', count: 20, percentage: 20.0 },
  ];

  const fullMockData: CategoryDistributionPoint[] = [
    { category: 'General', count: 52, percentage: 52.2 },
    { category: 'Fridges', count: 22, percentage: 21.7 },
    { category: 'Freezer', count: 9, percentage: 8.7 },
    { category: 'Woofers', count: 4, percentage: 4.3 },
    { category: 'Pacos', count: 4, percentage: 4.3 },
    { category: 'Cookers', count: 4, percentage: 4.3 },
    { category: 'Smartphones', count: 4, percentage: 4.3 },
  ];

  it('renders with data', () => {
    render(<CategoryDonutChart data={mockData} testId="donut-test" />);
    expect(screen.getByTestId('donut-test')).toBeInTheDocument();
  });

  it('renders empty state with no data', () => {
    render(<CategoryDonutChart data={[]} testId="donut-empty" />);
    expect(screen.getByText('No category data available')).toBeInTheDocument();
  });

  it('renders a custom legend with category names, counts, and percentages', () => {
    render(<CategoryDonutChart data={mockData} totalProducts={100} testId="donut-legend-test" />);
    const legend = screen.getByTestId('donut-legend');
    expect(legend).toBeInTheDocument();

    // Every category name should appear in the legend.
    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(screen.getByText('Furniture')).toBeInTheDocument();
    expect(screen.getByText('Clothing')).toBeInTheDocument();

    // Counts + percentages should appear alongside the names.
    expect(screen.getByText('50 (50%)')).toBeInTheDocument();
    expect(screen.getByText('30 (30%)')).toBeInTheDocument();
    expect(screen.getByText('20 (20%)')).toBeInTheDocument();

    // The center of the ring shows the total + "Products" label.
    expect(screen.getByTestId('donut-center-total')).toHaveTextContent('100');
    expect(screen.getByTestId('donut-center-total')).toHaveTextContent('Products');
  });

  it('sorts legend rows descending by percentage with count + percentage right-aligned', () => {
    // Feed data in scrambled order — the legend must still read largest-first.
    const scrambled: CategoryDistributionPoint[] = [
      { category: 'Smartphones', count: 4, percentage: 4.3 },
      { category: 'General', count: 52, percentage: 52.2 },
      { category: 'Cookers', count: 4, percentage: 4.3 },
      { category: 'Fridges', count: 22, percentage: 21.7 },
      { category: 'Freezer', count: 9, percentage: 8.7 },
    ];
    render(<CategoryDonutChart data={scrambled} testId="donut-sorted" />);

    const legend = screen.getByTestId('donut-legend');
    const rows = Array.from(legend.querySelectorAll('li'));
    const names = rows.map((li) => li.textContent ?? '');
    expect(names[0]).toContain('General');
    expect(names[1]).toContain('Fridges');
    expect(names[2]).toContain('Freezer');

    // Count + percentage appear together on the right of each row.
    expect(screen.getByText('52 (52.2%)')).toBeInTheDocument();
    expect(screen.getByText('22 (21.7%)')).toBeInTheDocument();
    expect(screen.getByText('9 (8.7%)')).toBeInTheDocument();
  });

  it('falls back to the slice-count sum when no total is provided', () => {
    render(<CategoryDonutChart data={mockData} testId="donut-fallback-total" />);
    expect(screen.getByTestId('donut-center-total')).toHaveTextContent('100');
  });

  it('renders no inline text labels on the chart itself (regression: label/data-label config disabled)', () => {
    const { container } = render(
      <CategoryDonutChart data={fullMockData} testId="donut-no-labels" />,
    );

    // Recharts renders inline pie labels as <text> elements inside the SVG.
    // With labels disabled, the SVG should contain zero <text> elements.
    const svgTextElements = container.querySelectorAll('svg text');
    expect(svgTextElements.length).toBe(0);

    // Confirm the legend still lists ALL 7 categories (with their percentages).
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Fridges')).toBeInTheDocument();
    expect(screen.getByText('Freezer')).toBeInTheDocument();
    expect(screen.getByText('Woofers')).toBeInTheDocument();
    expect(screen.getByText('Pacos')).toBeInTheDocument();
    expect(screen.getByText('Cookers')).toBeInTheDocument();
    expect(screen.getByText('Smartphones')).toBeInTheDocument();

    // And every count + percentage. Four categories share count 4 / 4.3%.
    expect(screen.getByText('52 (52.2%)')).toBeInTheDocument();
    expect(screen.getByText('22 (21.7%)')).toBeInTheDocument();
    expect(screen.getByText('9 (8.7%)')).toBeInTheDocument();
    expect(screen.getAllByText('4 (4.3%)').length).toBe(4);
  });

  it('chart-only region contains no text nodes with category names (slice area is pure color)', () => {
    const { container } = render(
      <CategoryDonutChart data={fullMockData} testId="donut-slice-only" />,
    );

    // The recharts pie surface renders labels as SVG <text> or <LabelList>.
    // Both would appear inside the <svg>. Assert no SVG <text> anywhere.
    const svg = container.querySelector('svg');
    if (svg) {
      expect(svg.querySelector('text')).toBeNull();
      // Recharts LabelList uses <g class="recharts-label-list"> — must be absent too.
      expect(svg.querySelector('.recharts-label-list')).toBeNull();
    }
  });
});

describe('StockStatusStackedBarChart', () => {
  const mockData: StockStatusCategoryRow[] = [
    { category: 'Electronics', in_stock: 40, low_stock: 5, out_of_stock: 2, total: 47 },
    { category: 'Furniture', in_stock: 30, low_stock: 3, out_of_stock: 1, total: 34 },
  ];

  it('renders with data', () => {
    render(<StockStatusStackedBarChart data={mockData} testId="bar-test" />);
    expect(screen.getByTestId('bar-test')).toBeInTheDocument();
  });

  it('renders empty state with no data', () => {
    render(<StockStatusStackedBarChart data={[]} testId="bar-empty" />);
    expect(screen.getByText('No stock status data available')).toBeInTheDocument();
  });
});
