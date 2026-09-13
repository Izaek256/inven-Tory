import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardTile } from '../components/DashboardTile';

describe('DashboardTile', () => {
  it('renders title and value', () => {
    render(<DashboardTile title="Total Products" value="42" testId="tile-test" />);
    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders delta for positive change', () => {
    render(
      <DashboardTile
        title="Total Products"
        value="42"
        testId="tile-delta-pos"
        delta={{ label: '+3 vs prior period', positive: true }}
      />,
    );
    expect(screen.getByText('+3 vs prior period')).toBeInTheDocument();
  });

  it('renders delta for negative change', () => {
    render(
      <DashboardTile
        title="Total Products"
        value="42"
        testId="tile-delta-neg"
        delta={{ label: '-5 vs prior period', positive: false }}
      />,
    );
    expect(screen.getByText('-5 vs prior period')).toBeInTheDocument();
  });

  it('renders delta for neutral/zero change', () => {
    render(
      <DashboardTile
        title="Total Products"
        value="42"
        testId="tile-delta-neutral"
        delta={{ label: '0 change', neutral: true }}
      />,
    );
    expect(screen.getByText('0 change')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<DashboardTile title="Total Products" value="42" testId="tile-loading" loading />);
    expect(screen.getByTestId('tile-loading-value')).toBeInTheDocument();
  });

  it('animates numericValue with a count-up that settles on the final number', async () => {
    render(
      <DashboardTile
        title="Total Products"
        value="ignored"
        numericValue={1234}
        testId="tile-countup"
      />,
    );
    // The count-up must land exactly on the target value (locale-formatted).
    await waitFor(
      () => {
        expect(screen.getByTestId('tile-countup-value')).toHaveTextContent('1,234');
      },
      { timeout: 2000 },
    );
  });

  it('renders text values like "3 h ago" immediately (no count-up on text)', () => {
    render(<DashboardTile title="Last Sync" value="3 h ago" testId="tile-text" />);
    expect(screen.getByTestId('tile-text-value')).toHaveTextContent('3 h ago');
  });

  it('applies the entrance-animation stagger delay', () => {
    render(
      <DashboardTile title="Total Products" value="42" testId="tile-stagger" animDelay={120} />,
    );
    expect(screen.getByTestId('tile-stagger')).toHaveStyle({ animationDelay: '120ms' });
  });
});
