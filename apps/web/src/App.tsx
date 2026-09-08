/**
 * Web dashboard root — unified single-page interface.
 *
 * Layout mirrors the desktop app:
 *   - 48px header with brand, online/offline badge, theme toggle
 *   - 200px left sidebar with nav items
 *   - Scrollable main content area
 *
 * Primary view: UnifiedDashboard combining recent activity + product catalog search.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, ThemeToggle } from '@invenTory/ui';
import { LayoutDashboard, Users, Warehouse } from 'lucide-react';
import { clearToken, getToken } from './services/apiClient';
import { LoginView } from './views/LoginView';
import { UnifiedDashboard } from './views/UnifiedDashboard';
import { StoreView } from './views/StoreView';
import { UsersView } from './views/UsersView';
import { listStores } from './services/dashboardService';
import './index.css';

type NavView = 'dashboard' | 'stores' | 'users';

interface NavItem {
  id: NavView;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'stores', label: 'Store Inventory', icon: <Warehouse size={18} /> },
  { id: 'users', label: 'Users', icon: <Users size={18} /> },
];

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
      case 'stores':
        return (
          <StoreView storeIds={storeIds} loading={storeListLoading} onRefresh={handleRefresh} />
        );
      case 'users':
        return <UsersView currentUserRole={me?.role} />;
      default:
        return (
          <UnifiedDashboard
            onNavigateToStores={() => setCurrentView('stores')}
            onNavigateToUsers={() => setCurrentView('users')}
          />
        );
    }
  };

  return (
    <div className="app-container" data-testid="web-app-container">
      {/* Header */}
      <header className="app-header" data-testid="web-header">
        <div className="header-brand">
          <div className="brand-icon">IT</div>
          <h1 className="brand-title">invenTory</h1>
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
