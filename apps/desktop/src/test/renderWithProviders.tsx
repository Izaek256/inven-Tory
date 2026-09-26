/**
 * renderWithProviders — wraps the component under test with all context
 * providers that desktop views require at the application level.
 *
 * Currently wraps:
 *   - QueryClientProvider  (React Query / useQuery hooks)
 *   - ToastProvider        (useToast hook)
 *
 * Usage:
 *   import { renderWithProviders } from '../test/renderWithProviders';
 *   renderWithProviders(<ReceiveStockView />);
 */

import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ToastProvider } from '@invenTory/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function AllProviders({ children }: { children: React.ReactNode }): React.ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}
