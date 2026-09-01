/**
 * Desktop application root — Issue 25 auth consolidation.
 *
 * Authentication gate:
 *   1. On launch, check for a cached AuthSession (Tauri secure store).
 *   2. If no session → show LoginView (posts to /api/v1/auth/login).
 *   3. If session is token_expired_offline → show OfflineAuthBanner inside
 *      the main shell so local ops continue and outbox keeps queuing.
 *   4. If session is valid → render the full application.
 *
 * Offline behavior (Section 21):
 *   - Expired token while offline → OfflineAuthBanner, NOT full login screen.
 *     Queued transactions are preserved; only sync is blocked.
 *   - Re-auth clears the expired flag and resumes background sync.
 *
 * Role enforcement:
 *   - The current user's role is carried from the JWT into every view via the
 *     currentUser prop.  The provisional TODO(issue-13) userRole='ADMIN' defaults
 *     are replaced by the real role from the session.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavView } from './components/Sidebar';
import { DashboardView } from './views/DashboardView';
import { ProductsView } from './views/ProductsView';
import { TransactionsView } from './views/TransactionsView';
import { ReceiveStockView } from './views/ReceiveStockView';
import { SaleStockView } from './views/SaleStockView';
import { ReturnStockView } from './views/ReturnStockView';
import { TransferStockView } from './views/TransferStockView';
import { DamageQuarantineView } from './views/DamageQuarantineView';
import { PhysicalCountAdjustmentView } from './views/PhysicalCountAdjustmentView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { OfflineAuthBanner } from './components/OfflineAuthBanner';
import { getStores } from './services/tauriStoreService';
import { getSession, isAuthenticated, logout } from './services/tauriAuthService';
import { Store } from './types/store';
import type { AuthSession } from './types/auth';
import './index.css';

// The device ID is stored in Tauri's secure store alongside the auth session.
// For the initial bootstrap we read it from the local SQLite-backed device
// registration (the same device_id embedded in every transaction).
// If not yet registered, the LoginView shows a "not registered" banner.
const DEVICE_ID_STORE_KEY = 'device_id';

async function getStoredDeviceId(): Promise<string> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load('auth.dat', { autoSave: false });
      const id = await store.get<string>(DEVICE_ID_STORE_KEY);
      return id ?? '';
    }
  } catch {
    // Fall through to empty string
  }
  return '';
}

export function App(): React.ReactElement {
  const [authState, setAuthState] = useState<
    'loading' | 'unauthenticated' | 'authenticated' | 'expired_offline'
  >('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');

  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [interactiveTimeMs, setInteractiveTimeMs] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Auth bootstrap
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      const storedDeviceId = await getStoredDeviceId();
      setDeviceId(storedDeviceId);

      const authed = await isAuthenticated();
      if (!authed) {
        setAuthState('unauthenticated');
        return;
      }

      const s = await getSession();
      setSession(s);
      setAuthState(s?.token_expired_offline ? 'expired_offline' : 'authenticated');
    };
    void bootstrap();
  }, []);

  // ---------------------------------------------------------------------------
  // Stores data
  // ---------------------------------------------------------------------------
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
    if (authState === 'authenticated' || authState === 'expired_offline') {
      fetchStores();
    }
  }, [fetchStores, authState]);

  // Performance instrumentation
  useEffect(() => {
    if (!loading && (authState === 'authenticated' || authState === 'expired_offline')) {
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
          performance.clearMarks('app-init-start');
          performance.clearMarks('app-interactive');
          performance.clearMeasures('cold-start-to-interactive');
          // eslint-disable-next-line no-console
          console.info(`[PERF] Cold start to interactive: ${duration.toFixed(2)}ms`);
          if (duration > 3000) {
            // eslint-disable-next-line no-console
            console.warn(`[PERF-WARN] Cold start exceeded 3000ms budget (NFR-PERF-001)`);
          }
        }
      } catch {
        // Non-fatal
      }
    }
  }, [loading, authState]);

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------
  const handleLoginSuccess = (s: AuthSession): void => {
    setSession(s);
    setAuthState('authenticated');
  };

  const handleReauthSuccess = (): void => {
    const refresh = async (): Promise<void> => {
      const s = await getSession();
      setSession(s);
      setAuthState('authenticated');
    };
    void refresh();
  };

  const handleLogout = async (): Promise<void> => {
    await logout();
    setSession(null);
    setAuthState('unauthenticated');
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const currentUserRole = session?.role ?? 'STORE_CLERK';

  const renderView = (): React.ReactElement => {
    if (authState === 'loading') {
      return (
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--it-bg)',
            color: 'var(--it-text-secondary)',
            fontSize: '14px',
          }}
          data-testid="auth-loading"
        >
          Loading…
        </div>
      );
    }

    if (authState === 'unauthenticated') {
      return <LoginView deviceId={deviceId} onLoginSuccess={handleLoginSuccess} />;
    }

    switch (currentView) {
      case 'dashboard':
        return (
          <DashboardView
            stores={stores}
            loading={loading}
            error={error}
            onRetry={fetchStores}
            userRole={currentUserRole}
          />
        );
      case 'products':
        return <ProductsView userRole={currentUserRole} />;
      case 'receive_stock':
        return <ReceiveStockView />;
      case 'sale_stock':
        return <SaleStockView />;
      case 'return_stock':
        return <ReturnStockView />;
      case 'transfer_stock':
        return <TransferStockView />;
      case 'damage_quarantine':
        return <DamageQuarantineView />;
      case 'physical_count':
        return <PhysicalCountAdjustmentView userRole={currentUserRole} />;
      case 'transactions':
        return <TransactionsView />;
      case 'settings':
        return <SettingsView currentUser={session} onLogout={handleLogout} />;
      default:
        return (
          <DashboardView
            stores={stores}
            loading={loading}
            error={error}
            onRetry={fetchStores}
            userRole={currentUserRole}
          />
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
        currentUser={session}
        onLogout={handleLogout}
      />
      <div className="app-body">
        {authState !== 'loading' && authState !== 'unauthenticated' && (
          <Sidebar currentView={currentView} onNavigate={setCurrentView} />
        )}
        <main className="app-content">
          {authState === 'expired_offline' && session && (
            <OfflineAuthBanner
              username={session.username}
              deviceId={deviceId}
              onReauthSuccess={handleReauthSuccess}
            />
          )}
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;
