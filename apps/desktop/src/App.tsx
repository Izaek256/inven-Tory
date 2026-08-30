import React, { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavView } from './components/Sidebar';
import { DashboardView } from './views/DashboardView';
import { ProductsView } from './views/ProductsView';
import { TransactionsView } from './views/TransactionsView';
import { ReceiveStockView } from './views/ReceiveStockView';
import { SettingsView } from './views/SettingsView';
import { getStores } from './services/tauriStoreService';
import { Store } from './types/store';
import './index.css';

export function App(): React.ReactElement {
  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [interactiveTimeMs, setInteractiveTimeMs] = useState<number | null>(null);

  const fetchStores = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStores();
      setStores(data);
      setActiveStoreId((prevActive) => {
        if (data.length > 0 && !prevActive) {
          return data[0].id;
        }
        return prevActive;
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[App] Failed to load stores:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // Performance instrumentation: Mark cold start to interactive
  useEffect(() => {
    if (!loading) {
      try {
        if (performance.getEntriesByName('app-init-start').length > 0) {
          performance.mark('app-interactive');
          const measure = performance.measure(
            'cold-start-to-interactive',
            'app-init-start',
            'app-interactive',
          );
          const duration = measure.duration;
          setInteractiveTimeMs(duration);

          // Clear performance entries so future reloads/retries do not re-measure or leak entries
          performance.clearMarks('app-init-start');
          performance.clearMarks('app-interactive');
          performance.clearMeasures('cold-start-to-interactive');

          // eslint-disable-next-line no-console
          console.info(`[PERF] Cold start to interactive: ${duration.toFixed(2)}ms`);

          // Verify performance budget (NFR-PERF-001: < 3000ms)
          if (duration > 3000) {
            // eslint-disable-next-line no-console
            console.warn(
              `[PERF-WARN] Cold start (${duration.toFixed(2)}ms) exceeded 3000ms budget (NFR-PERF-001)`,
            );
          } else {
            // eslint-disable-next-line no-console
            console.info(`[PERF-PASS] Cold start within 3000ms performance budget (NFR-PERF-001)`);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[PERF] Failed measuring startup timing:', err);
      }
    }
  }, [loading]);

  const renderView = (): React.ReactElement => {
    switch (currentView) {
      case 'dashboard':
        return (
          <DashboardView stores={stores} loading={loading} error={error} onRetry={fetchStores} />
        );
      case 'products':
        return <ProductsView />;
      case 'receive_stock':
        return <ReceiveStockView />;
      case 'transactions':
        return <TransactionsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return (
          <DashboardView stores={stores} loading={loading} error={error} onRetry={fetchStores} />
        );
    }
  };

  return (
    <div className="app-container" data-testid="app-container">
      <Header
        stores={stores}
        activeStoreId={activeStoreId}
        onSelectStore={setActiveStoreId}
        interactiveTimeMs={interactiveTimeMs}
      />
      <div className="app-body">
        <Sidebar currentView={currentView} onNavigate={setCurrentView} />
        <main className="app-content">{renderView()}</main>
      </div>
    </div>
  );
}

export default App;
