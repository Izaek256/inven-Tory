import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  ThemeProvider,
  useTheme,
  Button,
  TextInput,
  NumericInput,
  SearchInput,
  Select,
  Modal,
  ConfirmModal,
  Badge,
  Card,
  StatCard,
  SummaryCard,
  DataTable,
  ThemeToggle,
  EmptyState,
  Spinner,
  StepIndicator,
} from '../index';

function ThemeConsumer(): React.ReactElement {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <button onClick={toggleTheme} data-testid="toggle-btn">
        Toggle
      </button>
    </div>
  );
}

describe('packages/ui components', () => {
  it('ThemeProvider provides theme and toggles data-theme', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme-val')).toBeDefined();
    const toggleBtn = screen.getByTestId('toggle-btn');
    fireEvent.click(toggleBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBeDefined();
  });

  it('renders Button variants', () => {
    render(
      <div>
        <Button variant="primary">Primary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
      </div>,
    );
    expect(screen.getByText('Primary')).toBeDefined();
    expect(screen.getByText('Destructive')).toBeDefined();
    expect(screen.getByText('Secondary')).toBeDefined();
    expect(screen.getByText('Ghost')).toBeDefined();
  });

  it('renders TextInput and handles change', () => {
    render(<TextInput label="Username" placeholder="Enter name" />);
    expect(screen.getByLabelText(/Username/i)).toBeDefined();
  });

  it('renders NumericInput and steppers', () => {
    let val = 5;
    const handleChange = (v: number): void => {
      val = v;
    };
    render(<NumericInput label="Qty" value={val} onChange={handleChange} min={1} max={10} />);
    const incBtn = screen.getByRole('button', { name: /Increase/i });
    fireEvent.click(incBtn);
    expect(val).toBe(6);
  });

  it('renders SearchInput', () => {
    render(<SearchInput placeholder="Search..." />);
    expect(screen.getByPlaceholderText('Search...')).toBeDefined();
  });

  it('renders Select with options', () => {
    render(
      <Select
        label="Store"
        options={[{ value: '1', label: 'Store 1' }]}
        value="1"
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Store/i)).toBeDefined();
  });

  it('renders Modal when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>,
    );
    expect(screen.getByText('Test Modal')).toBeDefined();
    expect(screen.getByText('Modal content')).toBeDefined();
  });

  it('renders ConfirmModal with destructive controls', () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Confirm Delete"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Confirm Delete')).toBeDefined();
    expect(screen.getByText('Are you sure?')).toBeDefined();
  });

  it('renders Badge for statuses', () => {
    render(
      <div>
        <Badge status="ACTIVE" />
        <Badge status="FRESH" />
        <Badge status="PENDING" />
      </div>,
    );
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('Fresh')).toBeDefined();
    expect(screen.getByText('Pending')).toBeDefined();
  });

  it('renders Card, StatCard and SummaryCard', () => {
    render(
      <div>
        <Card>Card content</Card>
        <StatCard label="Total Stock" value={100} />
        <SummaryCard title="Overview">Summary content</SummaryCard>
      </div>,
    );
    expect(screen.getByText('Card content')).toBeDefined();
    expect(screen.getByText('Total Stock')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('Overview')).toBeDefined();
  });

  it('renders DataTable with columns and rows', () => {
    const columns = [
      { key: 'id', header: 'ID', accessor: (r: { id: string }): string => r.id },
      { key: 'name', header: 'Name', accessor: (r: { name: string }): string => r.name },
    ];
    const rows = [{ id: '1', name: 'Item A' }];
    render(<DataTable columns={columns} rows={rows} rowKey={(r): string => r.id} />);
    expect(screen.getByText('Item A')).toBeDefined();
  });

  it('renders ThemeToggle', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: /Switch to/i })).toBeDefined();
  });

  it('renders EmptyState', () => {
    render(<EmptyState heading="No products found" body="Try adding a product." />);
    expect(screen.getByText('No products found')).toBeDefined();
  });

  it('renders Spinner', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('renders StepIndicator', () => {
    const steps = [
      { id: '1', label: 'Select Store' },
      { id: '2', label: 'Enter Counts' },
    ];
    render(<StepIndicator steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('Select Store')).toBeDefined();
  });
});
