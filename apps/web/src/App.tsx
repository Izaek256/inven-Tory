/**
 * Web dashboard root — Issue 16.
 *
 * Layout mirrors the desktop app exactly:
 *   - 48px header with brand, online/offline badge, theme toggle
 *   - 200px left sidebar with nav items (same active-state styling)
 *   - Scrollable main content area
 *
 * Views:
 *   search  — Global product search + inventory + history (FR-SRCH-001–005)
 *   stores  — Store inventory list with freshness badges (Section 14.1)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, ThemeToggle } from '@inven-tory/ui';
import { LayoutDashboard, Package, Users, Warehouse } from 'lucide-react';
import { clearToken, getToken } from './services/apiClient';
import { LoginView } from './views/LoginView';
import { SearchView } from './views/SearchView';
import { StoreView } from './views/StoreView';
import { UsersView } from './views/UsersView';
import { getStoreInventory, listStores } from './services/dashboardService';
import './index.css';

type NavView = 'dashboard' | 'search' | 'stores' | 'users';

interface NavItem {
  id: NavView;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'search', label: 'Product Search', icon: <Package size={18} /> },
  { id: 'stores', label: 'Store Inventory', icon: <Warehouse size={18} /> },
  { id: 'users', label: 'Users', icon: <Users size={18} /> },
];

// ---------------------------------------------------------------------------
// Dashboard overview (landing page — summary of stores)
// ---------------------------------------------------------------------------

interface DashboardOverviewProps {
  storeIds: string[];
  onNavigate: (view: NavView) => void;
}

function DashboardOverview({ storeIds, onNavigate }: DashboardOverviewProps): React.ReactElement {
  const [storeCount, setStoreCount] = useState(storeIds.length);
  const [staleCount, setStaleCount] = useState(0);

  useEffect(() => {
    setStoreCount(storeIds.length);
    if (storeIds.length === 0) return;

    let cancelled = false;
    let stale = 0;
    let settled = 0;

    storeIds.forEach((id) => {
      getStoreInventory(id)
        .then((data) => {
          if (!cancelled && (data.freshness === 'STALE' || data.freshness === 'VERY_STALE')) {
            stale++;
          }
        })
        .catch(() => {
          // ignore
        })
        .finally(() => {
          settled++;
          if (!cancelled && settled === storeIds.length) {
            setStaleCount(stale);
          }
        });
    });

    return (): void => {
      cancelled = true;
    };
  }, [storeIds]);

  return (
    <div className="web-view" data-testid="dashboard-overview">
      <div className="web-view-header">
        <div>
          <h2 className="web-view-title">
            <LayoutDashboard size={18} aria-hidden="true" /> Remote Dashboard
          </h2>
          <p className="web-view-subtitle">INVENTORY Tory — global visibility across all stores</p>
        </div>
      </div>

      <div className="web-stat-row" style={{ marginBottom: '24px' }}>
        <div className="it-card it-stat-card">
          <div className="it-stat-card__label">Registered Stores</div>
          <div className="it-stat-card__value">{storeCount}</div>
        </div>
        <div className="it-card it-stat-card">
          <div className="it-stat-card__label">Stale / Very Stale</div>
          <div
            className={`it-stat-card__value ${staleCount > 0 ? 'it-stat-card__value--red' : 'it-stat-card__value--green'}`}
          >
            {staleCount}
          </div>
        </div>
      </div>

      <div className="web-quick-nav">
        <button
          className="web-quick-nav-card"
          onClick={() => onNavigate('search')}
          data-testid="nav-to-search"
        >
          <Package size={28} color="var(--it-green)" aria-hidden="true" />
          <span className="web-quick-nav-card__title">Global Search</span>
          <span className="web-quick-nav-card__desc">
            Search products by name, SKU, barcode or brand across all stores.
          </span>
        </button>
        <button
          className="web-quick-nav-card"
          onClick={() => onNavigate('stores')}
          data-testid="nav-to-stores"
        >
          <Warehouse size={28} color="var(--it-accent)" aria-hidden="true" />
          <span className="web-quick-nav-card__title">Store Inventory</span>
          <span className="web-quick-nav-card__desc">
            View per-store stock totals, freshness badges, and last-sync timestamps.
          </span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

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
        const data = (await resp.json()) as MeData;
        setMe(data);
      }
    } catch {
      /* ignore; me stays null -> views degrade gracefully */
    }
  }, []);

  const handleLoginSuccess = useCallback(
    (_role: string): void => {
      setIsAuthenticated(true);
      void fetchMe();
    },
    [fetchMe],
  );

  const handleLogout = useCallback((): void => {
    clearToken();
    setMe(null);
    setIsAuthenticated(false);
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
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const renderView = (): React.ReactElement => {
    switch (currentView) {
      case 'search':
        return <SearchView />;
      case 'stores':
        return (
          <StoreView storeIds={storeIds} loading={storeListLoading} onRefresh={handleRefresh} />
        );
      case 'users':
        return <UsersView currentUserRole={me?.role} />;
      default:
        return <DashboardOverview storeIds={storeIds} onNavigate={setCurrentView} />;
    }
  };
  return (
    <div className="app-container" data-testid="web-app-container">
      {/* ── Header ── */}
      <header className="app-header" data-testid="web-header">
        <div className="header-brand">
          <div className="brand-icon">IT</div>
          <h1 className="brand-title">INVENTORY Tory</h1>
          <span className="brand-version">v1.1.0</span>
          <span className="brand-tag">Web Dashboard</span>
        </div>

        <div className="header-controls">
          <ThemeToggle />
          <div data-testid="online-badge">
            <Badge status="ONLINE" label="Connected" />
          </div>
          <button
            className="web-logout-btn"
            onClick={handleLogout}
            data-testid="logout-btn"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="app-body">

        {/* Sidebar */}
        <aside className="app-sidebar" data-testid="web-sidebar">
          {NAV_ITEMS.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setCurrentView(item.id)}
                data-testid={`nav-${item.id}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

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
