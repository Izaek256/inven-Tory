/**
 * Desktop application root.
 *
 * Authentication gate:
 *   1. On launch, check for a cached AuthSession (Tauri secure store).
 *   2. If no session → show LoginView (posts to /api/v1/auth/login).
 *   3. If session is token_expired_offline → show OfflineAuthBanner inside
 *      the main shell so local ops continue and outbox keeps queuing.
 *   4. If session is valid → render the full application.
 *
 * Offline behavior:
 *   - Expired token while offline → OfflineAuthBanner, NOT full login screen.
 *     Queued transactions are preserved; only sync is blocked.
 *   - Re-auth clears the expired flag and resumes background sync.
 *
 * Role enforcement:
 *   - The current user's role is carried from the JWT into every view via the
 *     currentUser prop.  The provisional TODO(issue-13) userRole='ADMIN' defaults
 *     are replaced by the real role from the session.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './views/DashboardView';
import { ProductsView } from './views/ProductsView';
import { TransactionsView } from './views/TransactionsView';
import { ReceiveStockView } from './views/ReceiveStockView';
import { SaleStockView } from './views/SaleStockView';
import { ReturnStockView } from './views/ReturnStockView';
import { TransferStockView } from './views/TransferStockView';
import { DamageQuarantineView } from './views/DamageQuarantineView';
import { PhysicalCountAdjustmentView } from './views/PhysicalCountAdjustmentView';
import { DayBooksView } from './views/DayBooksView';
import { SettingsView } from './views/SettingsView';
import { CreateProductView } from './views/CreateProductView';
import { LoginView } from './views/LoginView';
import { GenesisWizard } from './views/GenesisWizard';
import { useGenesisState } from './hooks/useGenesisState';
import { OfflineAuthBanner } from './components/OfflineAuthBanner';
import { getStores } from './services/tauriStoreService';
import { getSession, isAuthenticated, logout } from './services/tauriAuthService';
import { startBackgroundSync, stopBackgroundSync, triggerSync } from './services/tauriSyncService';
import { useAppState } from './hooks/useAppState';
import { StoreProvider } from './context/StoreContext';
import { Store as StoreIcon } from 'lucide-react';
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
  const [showGenesis, setShowGenesis] = useState(false);

  const { currentView, setCurrentView, activeStoreId, setActiveStoreId } = useAppState();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [interactiveTimeMs, setInteractiveTimeMs] = useState<number | null>(null);
  const [switchingStore, setSwitchingStore] = useState<{
    active: boolean;
    storeName: string;
    storeCode: string;
  }>({ active: false, storeName: '', storeCode: '' });

  // Import progress state (global so it persists across view switches)
  const [importProgress, setImportProgress] = useState<{
    running: boolean;
    done: number;
    total: number;
    errors: number;
  } | null>(null);

  // Restore progress state — updated by polling after restore is kicked off
  const [restoreProgress, setRestoreProgress] = useState<{
    phase: string;
    currentStep: string;
    progressPercent: number;
    criticalComplete: boolean;
    canUseApp: boolean;
    totalComplete: boolean;
  } | null>(null);
  const restoreUsernameRef = useRef<string>('');
  const restorePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Auth + Genesis bootstrap
  // ---------------------------------------------------------------------------
  const genesis = useGenesisState();

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      const deviceIdVal = await getOrCreateDeviceId();
      setDeviceId(deviceIdVal);

      // Wait for genesis state to be checked
      if (genesis.loading) {
        return;
      }

      // Enter the wizard only once the backend state is known and says so.
      // A failed check (state null) must surface an error panel, never a
      // blank window — see the genesisCheckFailed branch in render.
      if (genesis.state && !genesis.state.ready) {
        setShowGenesis(true);
        setAuthState('loading');
        return;
      }

      // Genesis not needed - hide wizard and proceed normally
      setShowGenesis(false);

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
  }, [genesis.loading, genesis.needsGenesis, genesis.state]);

  // ---------------------------------------------------------------------------
  // Stores data
  // ---------------------------------------------------------------------------
  const fetchStores = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStores();
      setStores(data);
      setActiveStoreId((prev) => {
        const validIds = data.map((s) => s.id);
        if (data.length > 0 && (prev === null || !validIds.includes(prev))) {
          return data[0].id;
        }
        return prev ?? (data.length > 0 ? data[0].id : null);
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[App] Failed to load stores:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [setActiveStoreId]);

  useEffect(() => {
    if (authState === 'authenticated' || authState === 'expired_offline') {
      fetchStores();
    }
  }, [fetchStores, authState]);

  // Listen for local store updates across the app (creation, activation, sync)
  useEffect(() => {
    const handleStoresUpdated = (): void => {
      void fetchStores();
    };
    window.addEventListener('inven-tory:stores-updated', handleStoresUpdated);
    return (): void => {
      window.removeEventListener('inven-tory:stores-updated', handleStoresUpdated);
    };
  }, [fetchStores]);

  // Background Sync Engine
  useEffect(() => {
    if (authState === 'authenticated') {
      const envBaseUrl =
        typeof import.meta !== 'undefined'
          ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
          : undefined;

      // Only start sync if we have a configured API base URL (not local dev server)
      // This prevents unnecessary connection attempts in production builds
      const apiBaseUrl = envBaseUrl ? envBaseUrl.replace(/\/+$/, '') : null;

      if (apiBaseUrl && !apiBaseUrl.includes('localhost') && !apiBaseUrl.includes('127.0.0.1')) {
        // Start background sync with configured server
        startBackgroundSync({ apiBaseUrl }, 30_000);

        // Trigger initial sync immediately
        void triggerSync({ apiBaseUrl, force: true })
          .then(() => {
            return fetchStores();
          })
          .catch((err) => {
            // Silently handle sync errors - app should work offline
            // eslint-disable-next-line no-console
            console.info('[App] Initial sync failed (expected if offline):', err);
          });

        return (): void => {
          stopBackgroundSync();
        };
      } else {
        // No API server configured - run in offline mode
        // Just fetch stores from local database
        void fetchStores();
      }
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

        // Only attempt sync if we have a configured API base URL (not local dev server)
        const apiBaseUrl = envBaseUrl ? envBaseUrl.replace(/\/+$/, '') : null;

        if (apiBaseUrl && !apiBaseUrl.includes('localhost') && !apiBaseUrl.includes('127.0.0.1')) {
          void triggerSync({ apiBaseUrl, force: true })
            .then(() => {
              return fetchStores();
            })
            .catch((err) => {
              // Silently handle sync errors - app should work offline
              // eslint-disable-next-line no-console
              console.info('[App] Reconnection sync failed (expected if offline):', err);
            });
        }
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

  const handleGenesisComplete = (username: string, storeCode: string): void => {
    void username;
    void storeCode;
    setShowGenesis(false);
    setAuthState('unauthenticated');
  };

  /** Called by GenesisWizard when restore has been kicked off on the Rust side.
   *  We keep the genesis wizard visible with progress until critical data is
   *  restored (users with pin_hash written), then transition to the login screen.
   */
  const handleRestoreStarted = useCallback(
    (username: string): void => {
      restoreUsernameRef.current = username;

      // Initial progress placeholder so the wizard shows "restoring…" right away
      setRestoreProgress({
        phase: 'authenticating',
        currentStep: 'Starting restore…',
        progressPercent: 0,
        criticalComplete: false,
        canUseApp: false,
        totalComplete: false,
      });

      // Poll progress every 500 ms
      if (restorePollRef.current) clearInterval(restorePollRef.current);
      restorePollRef.current = setInterval(async () => {
        try {
          const prog = await genesis.getRestoreProgress();
          if (prog.success && prog.progress) {
            const p = prog.progress;
            setRestoreProgress({
              phase: p.phase,
              currentStep: p.current_step,
              progressPercent: p.progress_percent,
              criticalComplete: p.critical_complete,
              canUseApp: p.can_use_app,
              totalComplete: p.total_complete,
            });
            // When critical data is restored, dismiss wizard and show login
            if (p.critical_complete || p.total_complete || p.phase === 'error') {
              if (restorePollRef.current) {
                clearInterval(restorePollRef.current);
                restorePollRef.current = null;
              }
              setShowGenesis(false);
              setAuthState('unauthenticated');
              // Keep progress bar visible for 3 seconds then clear
              setTimeout(() => setRestoreProgress(null), 3000);
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[App] restore poll error:', e);
        }
      }, 500);
    },
    [genesis],
  );

  /** Handle cancel restore - rollback all changes and clear outbox events */
  const handleCancelRestore = useCallback(async (): Promise<void> => {
    // Stop polling
    if (restorePollRef.current) {
      clearInterval(restorePollRef.current);
      restorePollRef.current = null;
    }

    // Clear progress state
    setRestoreProgress(null);

    // Call Rust backend to rollback restore
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cancel_restore');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[App] Failed to cancel restore:', err);
    }

    // Return to selection screen
    setShowGenesis(true);
    setAuthState('loading');
  }, []);

  // Cleanup poll on unmount
  useEffect((): (() => void) => {
    return (): void => {
      if (restorePollRef.current) clearInterval(restorePollRef.current);
    };
  }, []);

  const handleReauthSuccess = (): void => {
    const refresh = async (): Promise<void> => {
      const s = await getSession();
      setSession(s);
      setAuthState('authenticated');
    };
    void refresh();
  };

  // Store-context reload: switching stores via the header persists the new
  // activeStoreId and then refreshes store-scoped data across all mounted views,
  // so every view re-reads `activeStoreId` from context. The session stays intact
  // (no redirect to login); only the active store/context and store-specific data
  // change (Task D — switching must not force re-login).
  const handleSelectStoreAndReload = useCallback(
    (storeId: string): void => {
      const target = stores.find((s) => s.id === storeId);
      setSwitchingStore({
        active: true,
        storeName: target?.name ?? 'Store',
        storeCode: target?.code ?? '',
      });
      setActiveStoreId(storeId);
      // Refresh the store list. Keep the switching overlay open until the refresh
      // completes (or settles), so views never render with the stale previous-store
      // state.
      void fetchStores().then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('inven-tory:stores-updated', { detail: { storeId } }),
          );
        }
        setSwitchingStore({ active: false, storeName: '', storeCode: '' });
      });
    },
    [stores, setActiveStoreId, fetchStores],
  );

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
      case 'create_product':
        return (
          <CreateProductView
            importProgress={importProgress}
            setImportProgress={setImportProgress}
          />
        );
      case 'day_books':
        return <DayBooksView stores={stores} />;
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

  // Local-backend check failed (e.g. database unreachable): render an
  // explicit error with retry instead of an empty window.
  const genesisCheckFailed = !genesis.loading && genesis.state === null;

  const handleGenesisRetry = (): void => {
    setShowGenesis(false);
    void genesis.checkState();
  };

  return (
    <div className="app-container" data-testid="app-container">
      {genesisCheckFailed && (
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--it-bg)',
            padding: '24px',
          }}
          data-testid="genesis-check-error"
          role="alert"
        >
          <div style={{ maxWidth: '480px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--it-text-primary)' }}>
              Couldn&apos;t reach the local database
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '8px' }}>
              {genesis.error ?? 'The app could not read its local data store.'} Your data is
              untouched — retry or restart the app.
            </p>
            <button
              type="button"
              onClick={handleGenesisRetry}
              data-testid="genesis-retry-btn"
              style={{
                marginTop: '16px',
                padding: '8px 20px',
                borderRadius: 'var(--it-r-md)',
                border: '1px solid var(--it-green-border)',
                backgroundColor: 'var(--it-green)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {!genesisCheckFailed && showGenesis && genesis.state && !genesis.state.ready && (
        <GenesisWizard
          state={genesis.state}
          onComplete={handleGenesisComplete}
          onCancel={() => setShowGenesis(false)}
          onCancelRestore={handleCancelRestore}
          running={genesis.runningGenesis}
          error={genesis.error}
          onRun={async (params) => {
            const result = await genesis.runGenesis(params);
            if (result.success) {
              handleGenesisComplete(result.result?.username ?? '', result.result?.store_code ?? '');
            }
            return result;
          }}
          onValidateRestore={async (params) => {
            return await genesis.validateRestore(params);
          }}
          onStartRestore={async (params) => {
            return await genesis.startRestore(params);
          }}
          onGetRestoreProgress={async () => {
            return await genesis.getRestoreProgress();
          }}
          onRestoreStarted={handleRestoreStarted}
          restoreProgress={restoreProgress}
        />
      )}
      {!genesisCheckFailed && !showGenesis && (
        <>
          {switchingStore.active && (
            <div className="store-switch-overlay" data-testid="store-switch-overlay">
              <div className="store-switch-modal">
                <div className="store-switch-spinner-container">
                  <div className="store-switch-spinner-ring" />
                  <div className="store-switch-spinner-core">
                    <StoreIcon size={22} />
                  </div>
                </div>
                <h3 className="store-switch-title">Switching Store</h3>
                <p className="store-switch-target">
                  {switchingStore.storeName}{' '}
                  {switchingStore.storeCode && (
                    <span className="store-switch-badge">{switchingStore.storeCode}</span>
                  )}
                </p>
                <p className="store-switch-subtitle">
                  Refreshing inventory ledger and localized data...
                </p>
              </div>
            </div>
          )}
          <Header
            stores={stores}
            activeStoreId={activeStoreId}
            onSelectStore={handleSelectStoreAndReload}
            interactiveTimeMs={interactiveTimeMs}
            currentUser={session}
            onLogout={handleLogout}
            restoreProgress={restoreProgress}
          />
          <div className="app-body">
            {authState !== 'loading' && authState !== 'unauthenticated' && (
              <Sidebar
                currentView={currentView}
                onNavigate={setCurrentView}
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
              />
            )}
            <main className="app-content">
              {authState === 'expired_offline' && session && (
                <OfflineAuthBanner
                  username={session.username}
                  deviceId={deviceId}
                  onReauthSuccess={handleReauthSuccess}
                />
              )}
              <StoreProvider activeStoreId={activeStoreId} setActiveStoreId={setActiveStoreId}>
                {renderView()}
              </StoreProvider>
            </main>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
