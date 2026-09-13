/**
 * Web dashboard root.
 *
 * Layout mirrors the desktop app:
 *   - 48px header with brand, online/offline badge, theme toggle
 *   - 200px left sidebar on desktop/tablet widths
 *   - Bottom navigation bar with icons below the tablet breakpoint (768px)
 *     so the remotely-accessible dashboard works on phones (Phase 3, Task C)
 *
 * Views (Phase 3, Task B — dashboard split):
 *   - dashboard:       analytics-only KPI tiles (no tables)
 *   - recent-activity: standalone Recent Activity table
 *   - products:        global cross-store product catalogue (Task D format)
 *   - stores:          per-store inventory
 *
 * The Users view was removed in Phase 3 (Task A); there is intentionally no
 * route for it. User management remains out of scope for the web app.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, History, LayoutDashboard, Package, Warehouse, type LucideIcon } from 'lucide-react';
import { ThemeToggle } from '@invenTory/ui';
import { clearToken, getToken } from './services/apiClient';
import { LoginView } from './views/LoginView';
import { AnalyticsDashboardView } from './views/AnalyticsDashboardView';
import { RecentActivityView } from './views/RecentActivityView';
import { ProductsCatalogView } from './views/ProductsCatalogView';
import { StoreView } from './views/StoreView';
import { listStores } from './services/dashboardService';
import { SidebarFooter } from './components/SidebarFooter';
import './index.css';
import './styles/dashboard-phase4.css';

type NavView = 'dashboard' | 'recent-activity' | 'products' | 'stores';

interface NavItem {
  id: NavView;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'recent-activity', label: 'Recent Activity', icon: History },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'stores', label: 'Store Inventory', icon: Warehouse },
];

/** Below this width the sidebar is replaced by a bottom navigation bar. */
const BOTTOM_NAV_BREAKPOINT = 768;

const SIDEBAR_WIDTH = 200;
const BOTTOM_NAV_HEIGHT = 64;

function SidebarOrBottomNav({
  items,
  activeView,
  onSelectView,
  breakpointPx,
}: {
  items: NavItem[];
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  breakpointPx: number;
}): React.ReactElement {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpointPx : false,
  );

  useEffect(() => {
    const handleResize = (): void => setNarrow(window.innerWidth < breakpointPx);
    window.addEventListener('resize', handleResize);
    return (): void => window.removeEventListener('resize', handleResize);
  }, [breakpointPx]);

  return (
    <>
      {!narrow ? (
        <aside className="app-sidebar" data-testid="web-sidebar" style={{ width: SIDEBAR_WIDTH }}>
          {items.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              data-testid={`nav-${item.id}`}
              onClick={() => onSelectView(item.id)}
            >
              <item.icon size={18} aria-hidden="true" />
              <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
            </button>
          ))}
        </aside>
      ) : (
        <nav
          className="web-bottom-nav"
          data-testid="web-bottom-nav"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: BOTTOM_NAV_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '0 8px',
            gap: '4px',
            backgroundColor: 'var(--it-surface)',
            borderTop: '1px solid var(--it-border)',
            zIndex: 50,
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              data-testid={`nav-${item.id}`}
              onClick={() => onSelectView(item.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '4px 10px',
                borderRadius: 'var(--it-r-md)',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--it-text-secondary)',
                cursor: 'pointer',
                fontSize: '10px',
                minWidth: '56px',
              }}
            >
              <item.icon size={20} aria-hidden="true" />
              <span>{item.label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

interface MeData {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  assigned_store_id: string | null;
}

function App(): React.ReactElement {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [storeListLoading, setStoreListLoading] = useState(false);
  const [storeListError, setStoreListError] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const pendingSyncCount = 0;
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < BOTTOM_NAV_BREAKPOINT : false,
  );

  useEffect(() => {
    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);
    const handleResize = (): void => {
      setIsNarrow(window.innerWidth < BOTTOM_NAV_BREAKPOINT);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('resize', handleResize);
    return (): void => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const fetchMe = useCallback(async (): Promise<void> => {
    try {
      const token = getToken();
      if (!token) return;
      const base = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1').replace(
        /\/$/,
        '',
      );
      const resp = await fetch(`${base}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        setMe(await resp.json());
      }
    } catch {
      // non-fatal
    }
  }, []);

  const fetchStores = useCallback(async (): Promise<void> => {
    setStoreListLoading(true);
    setStoreListError(null);
    try {
      const stores = await listStores();
      setStoreIds(stores.map((s) => s.id));
    } catch (err) {
      setStoreListError(err instanceof Error ? err.message : String(err));
    } finally {
      setStoreListLoading(false);
    }
  }, []);

  const handleRefresh = useCallback((): void => {
    void fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchStores();
      if (!me) void fetchMe();
    }
  }, [isAuthenticated, me, fetchMe, fetchStores]);

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const renderView = (): React.ReactElement => {
    switch (currentView) {
      case 'recent-activity':
        return <RecentActivityView />;
      case 'products':
        return <ProductsCatalogView />;
      case 'stores':
        return (
          <StoreView storeIds={storeIds} loading={storeListLoading} onRefresh={handleRefresh} />
        );
      case 'dashboard':
      default:
        return <AnalyticsDashboardView />;
    }
  };

  return (
    <div className="app-container" data-testid="web-app-container">
      {/* Header */}
      <header className="app-header" data-testid="web-header">
        <div className="header-brand">
          <div className="brand-icon-glyph">
            <Box size={18} aria-hidden="true" />
          </div>
          <h1 className="brand-title">invenTory</h1>
          <span className="brand-version">v1.1.0</span>
          <span className="brand-tag">Web Dashboard</span>
        </div>

        <div className="header-controls">
          <ThemeToggle />
          <button
            className="web-logout-btn"
            onClick={() => {
              clearToken();
              setMe(null);
              setIsAuthenticated(false);
            }}
            data-testid="logout-btn"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="app-body">
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Sidebar on desktop/tablet; bottom nav below the breakpoint */}
          <SidebarOrBottomNav
            items={NAV_ITEMS}
            activeView={currentView}
            onSelectView={setCurrentView}
            breakpointPx={BOTTOM_NAV_BREAKPOINT}
          />

          {/* Sidebar footer (web only — desktop uses header indicators) */}
          {currentView === 'dashboard' && !isNarrow && (
            <SidebarFooter isOnline={isOnline} pendingCount={pendingSyncCount} onSync={null} />
          )}
        </div>

        {/* Main Content */}
        <main className="app-content" data-testid="web-main-content">
          {storeListError && (
            <div
              style={{
                padding: '12px 16px',
                marginBottom: '16px',
                backgroundColor: 'var(--it-red-surface)',
                color: 'var(--it-red-text)',
                border: '1px solid var(--it-red-border)',
                borderRadius: 'var(--it-r-md)',
                fontSize: '14px',
              }}
              data-testid="store-list-error"
            >
              {storeListError}
            </div>
          )}
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;
