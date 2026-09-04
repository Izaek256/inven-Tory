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
import { startBackgroundSync, stopBackgroundSync, triggerSync } from './services/tauriSyncService';
import { Store } from './types/store';
import type { AuthSession } from './types/auth';
import './index.css';

// The device ID is stored in Tauri's secure store. For single-user mode we
// NO LONGER require a pre-registration step. If nothing is stored we generate
// a stable identifier (hostname + random suffix) the first time the app
// launches and persist it. Any string is accepted by the API login endpoint,
// which auto-registers unknown device_ids on first successful login.
const DEVICE_ID_STORE_KEY = 'device_id';
const DEVICE_STORE_FILE = 'auth.dat';

async function _readStoredDeviceId(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(DEVICE_STORE_FILE, { autoSave: false });
      const id = await store.get<string>(DEVICE_ID_STORE_KEY);
      if (id) return id;
    }
  } catch {
    // Fall through
  }
  return null;
}

async function _writeStoredDeviceId(id: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(DEVICE_STORE_FILE, { autoSave: true });
      await store.set(DEVICE_ID_STORE_KEY, id);
      await store.save();
      return;
    }
  } catch {
    // Fall through
  }
  // Vitest / browser dev fallback: sessionStorage
  try {
    sessionStorage.setItem(DEVICE_ID_STORE_KEY, id);
  } catch {
    // ignore
  }
}

function _generateDeviceId(): string {
  // Stable-ish, user-host identifiable string. We avoid anything that could
  // accidentally contain non-URL-safe chars. Max 64 chars to match the
  // LoginRequest.device_id max length.
  const host = (typeof window !== 'undefined' && window.location?.hostname) || 'local';
  const rand = Math.random().toString(36).slice(2, 10);
  const sanitizedHost = host.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 32);
  return `DESKTOP-${sanitizedHost}-${rand}`.toUpperCase().slice(0, 64);
}

async function getOrCreateDeviceId(): Promise<string> {
  // 1. Stored value (Tauri secure store or sessionStorage fallback)
  const stored = await _readStoredDeviceId();
  if (stored) return stored;

  // 2. Dev-env fallback (still valid; API auto-registers it)
  const envDev = import.meta.env.VITE_DEV_DEVICE_ID as string | undefined;
  if (envDev) {
    await _writeStoredDeviceId(envDev);
    return envDev;
  }

  // 3. Generate + persist a new one (works on ANY device — the API
  //    auto-registers unknown IDs on first successful login).
  const generated = _generateDeviceId();
  await _writeStoredDeviceId(generated);
  return generated;
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
      // In single-user mode the device ID is ALWAYS available (either
      // persisted or freshly generated). No pre-registration required.
      const deviceIdVal = await getOrCreateDeviceId();
      setDeviceId(deviceIdVal);

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

  // Background Sync Engine (Issue 15 / Section 21)
  useEffect(() => {
    if (authState === 'authenticated') {
      const envBaseUrl =
        typeof import.meta !== 'undefined'
          ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
          : undefined;
      const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

      // Start background sync immediately
      startBackgroundSync({ apiBaseUrl }, 30_000);

      // Trigger initial sync immediately (token upgrade should be synchronous now)
      void triggerSync({ apiBaseUrl, force: true })
        .then(() => {
          return fetchStores();
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[App] SYNC ERROR:', err);
        });

      return (): void => {
        stopBackgroundSync();
      };
    }
  }, [authState, fetchStores]);

  // Online reconnection listener: immediately attempt token upgrade and sync outbox
  useEffect(() => {
    const handleOnline = (): void => {
      if (authState === 'authenticated' || authState === 'expired_offline') {
        const envBaseUrl =
          typeof import.meta !== 'undefined'
            ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
            : undefined;
        const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');

        void triggerSync({ apiBaseUrl, force: true })
          .then(() => {
            return fetchStores();
          })
          .catch(() => undefined);
      }
    };

    window.addEventListener('online', handleOnline);
    return (): void => {
      window.removeEventListener('online', handleOnline);
    };
  }, [authState, fetchStores]);

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
