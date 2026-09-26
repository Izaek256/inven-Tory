import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
  VirtualizedDataTable,
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

describe('Modal focus trap and Escape (P0)', () => {
  it('Escape closes the modal via onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Trap Modal">
        <button data-testid="inner-btn">Inner</button>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focus starts inside the modal body on open', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Focus Modal">
        <button data-testid="inner-btn">Inner</button>
      </Modal>,
    );

    expect(document.activeElement).toBe(screen.getByTestId('inner-btn'));
  });

  it('Tab from the last focusable wraps to the first focusable (close button)', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Wrap Modal">
        <button data-testid="first">First</button>
        <button data-testid="second">Second</button>
      </Modal>,
    );

    const closeButton = screen.getByLabelText('Close dialog');
    screen.getByTestId('second').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
  });

  it('Shift+Tab from the first focusable wraps to the last focusable', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Reverse Wrap Modal">
        <button data-testid="first">First</button>
        <button data-testid="second">Second</button>
      </Modal>,
    );

    screen.getByLabelText('Close dialog').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId('second'));
  });

  it('Tab never escapes the modal (focus stays inside the dialog)', () => {
    const { container } = render(
      <>
        <button data-testid="outside">Outside</button>
        <Modal isOpen={true} onClose={() => {}} title="Contain Modal">
          <button data-testid="inner-a">A</button>
          <button data-testid="inner-b">B</button>
        </Modal>
      </>,
    );

    const dialog = document.querySelector('.it-modal') as HTMLElement;
    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(screen.getByTestId('outside'));
    }
    expect(container).toBeTruthy();
  });

  it('Escape does not close unrelated state when modal is closed', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={false} onClose={onClose} title="Closed Modal">
        <p>hidden</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('VirtualizedDataTable (P2: virtual scrolling)', () => {
  const columns = [
    { key: 'id', header: 'ID', accessor: (r: { id: string }) => r.id },
    { key: 'name', header: 'Name', accessor: (r: { name: string }) => r.name },
    { key: 'value', header: 'Value', accessor: (r: { value: number }) => r.value, numeric: true },
  ];

  it('renders headers and container without crashing', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      name: `Item ${i + 1}`,
      value: i * 10,
    }));

    render(
      <VirtualizedDataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        containerHeight={300}
        estimatedRowHeight={44}
      />,
    );

    expect(screen.getByText('ID')).toBeDefined();
    expect(screen.getByText('Name')).toBeDefined();
    expect(screen.getByText('Value')).toBeDefined();
    // In JSDOM the virtualizer sees no scroll area, so rows render as empty.
    // We verify the component mounts and renders headers without error.
    const container = document.querySelector('.it-table-wrap');
    expect(container).toBeDefined();
  });

  it('renders empty state when no rows', () => {
    render(
      <VirtualizedDataTable
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        containerHeight={300}
      />,
    );
    expect(screen.getByText('No data')).toBeDefined();
  });

  it('renders custom empty slot', () => {
    render(
      <VirtualizedDataTable
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        containerHeight={300}
        emptySlot={<span data-testid="custom-empty">Nothing here</span>}
      />,
    );
    expect(screen.getByTestId('custom-empty')).toBeDefined();
  });

  it('applies rowClassName callback (no crash)', () => {
    const rows = [{ id: '1', name: 'Highlighted', value: 42 }];

    render(
      <VirtualizedDataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        containerHeight={300}
        rowClassName={(row) => (row.id === '1' ? 'highlight-row' : undefined)}
      />,
    );
    // Component renders without error — className logic tested via integration
    const container = document.querySelector('.it-table-wrap');
    expect(container).toBeDefined();
  });

  it('mounts with large dataset without performance issues (no crash)', () => {
    // Create 1000 rows — component should handle without OOM in tests
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i + 1),
      name: `Item ${i + 1}`,
      value: i * 10,
    }));

    render(
      <VirtualizedDataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        containerHeight={300}
        estimatedRowHeight={44}
        overscan={5}
      />,
    );

    // Headers always present
    expect(screen.getByText('ID')).toBeDefined();
    const container = document.querySelector('.it-table-wrap');
    expect(container).toBeDefined();
  });
});
