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
import { LayoutDashboard, Package, Warehouse } from 'lucide-react';
import { clearToken, getToken } from './services/apiClient';
import { LoginView } from './views/LoginView';
import { SearchView } from './views/SearchView';
import { StoreView } from './views/StoreView';
import { getStoreInventory } from './services/dashboardService';
import { api } from './services/apiClient';
import './index.css';

type NavView = 'dashboard' | 'search' | 'stores';

interface StoreListItem {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

interface NavItem {
  id: NavView;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'search', label: 'Product Search', icon: <Package size={18} /> },
  { id: 'stores', label: 'Store Inventory', icon: <Warehouse size={18} /> },
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

function App(): React.ReactElement {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [storeListLoading, setStoreListLoading] = useState(false);
  const [storeListError, setStoreListError] = useState<string | null>(null);

  // Fetch store list when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchStores = async (): Promise<void> => {
      setStoreListLoading(true);
      setStoreListError(null);
      try {
        const stores = await api.get<StoreListItem[]>('/stores');
        setStoreIds(stores.map((s) => s.id));
      } catch (err) {
        setStoreListError(err instanceof Error ? err.message : 'Failed to load store list');
      } finally {
        setStoreListLoading(false);
      }
    };

    void fetchStores();
  }, [isAuthenticated]);

  const handleLoginSuccess = useCallback((_role: string): void => {
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback((): void => {
    clearToken();
    setIsAuthenticated(false);
  }, []);

  const handleRefresh = useCallback((): void => {
    // no-op: StoreView manages its own refetch
  }, []);

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
        {/* Store list error banner */}
        {storeListError && (
          <div
            className="it-toast it-toast--error"
            data-testid="store-list-error"
            style={{ margin: '16px' }}
          >
            <svg
              aria-hidden="true"
              className="lucide lucide-alert-circle"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            <span>{storeListError}</span>
          </div>
        )}

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

        {/* Main content */}
        <main className="app-content" data-testid="web-main-content">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;
