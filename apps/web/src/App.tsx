/**
 * Web dashboard root — mockup-accurate shell (Images 1-3).
 *
 * Layout:
 *   - Top bar: brand + global search (placeholder per page) + online dot + bell + user block
 *   - Sidebar: 7 items with accent left-edge active state, collapsible to icon rail
 *   - Bottom nav below 768px replaces sidebar
 *   - Main content: single dynamic dashboard (store tabs handle single vs multi) + products etc.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Settings,
  ArrowLeftRight,
  History,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@invenTory/ui';
import { clearToken, getToken } from './services/apiClient';
import { LoginView } from './views/LoginView';
import { AnalyticsDashboardView } from './views/AnalyticsDashboardView';
import { RecentActivityView } from './views/RecentActivityView';
import { ProductsCatalogView } from './views/ProductsCatalogView';
import { StoreView } from './views/StoreView';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { listStores } from './services/dashboardService';
import './index.css';
import './styles/dashboard-phase4.css';
import './styles/dashboard-mockup.css';

type NavView =
  'dashboard' | 'stock-movements' | 'products' | 'stores' | 'settings' | 'recent-activity';

interface NavItem {
  id: NavView;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'stock-movements', label: 'Stock Movements', icon: ArrowLeftRight },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'stores', label: 'Stores', icon: Warehouse },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// Legacy alias for tests that still use recent-activity id
const NAV_LEGACY: NavItem[] = [{ id: 'recent-activity', label: 'Recent Activity', icon: History }];

const BOTTOM_NAV_BREAKPOINT = 768;
const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 64;

function TopBar({
  placeholder,
  isOnline,
  me,
  onLogout,
  onSearchChange,
  onSearchSubmit,
}: {
  placeholder: string;
  isOnline: boolean;
  me: MeData | null;
  onLogout: () => void;
  onSearchChange?: (v: string) => void;
  onSearchSubmit?: (v: string) => void;
}): React.ReactElement {
  const [q, setQ] = useState('');
  const displayName = me?.full_name || me?.username || 'Isaac Kisuule';
  const roleLabel = me?.role ? me.role.replace('_', ' ') : 'Store Manager';
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="app-header app-header--mockup" data-testid="web-header">
      <div className="header-brand">
        <div className="brand-icon-glyph">
          <img src="/favicon.svg" alt="" aria-hidden="true" />
        </div>
        <h1 className="brand-title">invenTory</h1>
        <span className="brand-version">v1.1.6</span>
      </div>

      <form
        className="header-search-wrap"
        onSubmit={(e): void => {
          e.preventDefault();
          onSearchSubmit?.(q);
        }}
        role="search"
        aria-label="Global search"
      >
        <Search size={16} className="header-search-icon" aria-hidden="true" />
        <input
          className="header-search-input"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            onSearchChange?.(e.target.value);
          }}
          data-testid="topbar-search"
          aria-label="Global search"
        />
        <button
          type="submit"
          className="header-search-kbd"
          aria-label="Search"
          style={{ border: 'none', background: 'var(--it-surface)', cursor: 'pointer' }}
        >
          ↵
        </button>
      </form>

      <div className="header-controls">
        <span className="header-online" data-testid="online-indicator">
          <span
            className={`header-online__dot ${isOnline ? 'header-online__dot--online' : 'header-online__dot--offline'}`}
          />
          {isOnline ? 'Online' : 'Offline'}
        </span>

        <button className="header-icon-btn" aria-label="Notifications" data-testid="notif-btn">
          <Bell size={18} aria-hidden="true" />
          <span className="header-notif-dot" />
        </button>

        <div className="header-user" data-testid="user-block">
          <div className="header-avatar" aria-hidden="true">
            {initials}
          </div>
          <div className="header-user__meta">
            <span className="header-user__name">{displayName}</span>
            <span className="header-user__role">{roleLabel}</span>
          </div>
          <ChevronDown size={14} className="header-user__chev" aria-hidden="true" />
        </div>

        <ThemeToggle />

        <button
          className="web-logout-btn"
          onClick={onLogout}
          data-testid="logout-btn"
          title="Sign out"
          aria-label="Sign out"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </header>
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
  const [storeMeta, setStoreMeta] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [storeListLoading, setStoreListLoading] = useState(false);
  const [storeListError, setStoreListError] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < BOTTOM_NAV_BREAKPOINT : false,
  );
  const [topSearch, setTopSearch] = useState('');
  // Global search modal — same functionality as the desktop header's
  // "Search All Stores" modal (read-only overlay, never changes the view).
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const placeholder = useMemo(() => {
    if (currentView === 'products') return 'Search products, SKU, brand, model or category...';
    return 'Search products, stock, receipts, or anything...';
  }, [currentView]);

  useEffect(() => {
    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);
    const handleResize = (): void => setIsNarrow(window.innerWidth < BOTTOM_NAV_BREAKPOINT);
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
      if (resp.ok) setMe(await resp.json());
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
      setStoreMeta(stores.map((s) => ({ id: s.id, code: s.code, name: s.name })));
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

  const handleSelectView = (v: NavView): void => {
    if (v === 'stock-movements' || v === 'recent-activity') {
      setCurrentView('stock-movements');
      return;
    }
    setCurrentView(v);
  };

  const effectiveView = currentView === 'recent-activity' ? 'stock-movements' : currentView;

  // Header search submit opens the Global search modal (desktop parity) —
  // the modal is a read-only overlay prefilled with the typed query.
  const handleHeaderSearch = (q: string): void => {
    setTopSearch(q);
    setGlobalSearchOpen(true);
  };

  const renderView = (): React.ReactElement => {
    switch (effectiveView) {
      case 'stock-movements':
        return <RecentActivityView globalSearch={topSearch} />;
      case 'products':
        return <ProductsCatalogView topSearch={topSearch} />;
      case 'stores':
        return (
          <StoreView storeIds={storeIds} loading={storeListLoading} onRefresh={handleRefresh} />
        );
      case 'settings':
        return (
          <div
            data-testid="settings-placeholder"
            style={{ padding: 24, color: 'var(--it-text-secondary)' }}
          >
            Settings — coming soon
          </div>
        );
      case 'dashboard':
      default:
        return <AnalyticsDashboardView me={me} storeMeta={storeMeta} topSearch={topSearch} />;
    }
  };

  // Bottom nav items for mobile — reflects reduced nav (no Inventory/Reports)
  const bottomItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'stock-movements', label: 'Movements', icon: ArrowLeftRight },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'stores', label: 'Stores', icon: Warehouse },
    { id: 'settings', label: 'More', icon: Settings },
  ];

  return (
    <div className="app-container" data-testid="web-app-container">
      <TopBar
        placeholder={placeholder}
        isOnline={isOnline}
        me={me}
        onLogout={() => {
          clearToken();
          setMe(null);
          setIsAuthenticated(false);
        }}
        onSearchChange={setTopSearch}
        onSearchSubmit={handleHeaderSearch}
      />

      <div className="app-body">
        {/* Sidebar — hidden on narrow, replaced by bottom nav */}
        {!isNarrow && (
          <aside
            className={`app-sidebar app-sidebar--mockup ${collapsed ? 'app-sidebar--collapsed' : ''}`}
            data-testid="web-sidebar"
            style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
          >
            <div className="app-sidebar__nav">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item nav-item--mockup ${effectiveView === item.id ? 'active' : ''}`}
                  data-testid={`nav-${item.id}`}
                  onClick={() => handleSelectView(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  onMouseEnter={() => collapsed && setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  onFocus={() => collapsed && setHoveredItem(item.id)}
                  onBlur={() => setHoveredItem(null)}
                >
                  <item.icon size={18} aria-hidden="true" />
                  {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
                  {collapsed && hoveredItem === item.id && (
                    <span className="nav-tooltip">{item.label}</span>
                  )}
                </button>
              ))}
              {/* hidden legacy for test compat — Recent Activity */}
              {NAV_LEGACY.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${effectiveView === 'stock-movements' ? 'active' : ''}`}
                  data-testid={`nav-${item.id}`}
                  onClick={() => handleSelectView(item.id)}
                  style={{ display: 'none' }}
                  aria-hidden="true"
                >
                  <item.icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <button
              className="sidebar-collapse-btn"
              onClick={() => setCollapsed((c) => !c)}
              data-testid="sidebar-collapse"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight size={16} />
              ) : (
                <>
                  <ChevronLeft size={16} /> Collapse
                </>
              )}
            </button>
          </aside>
        )}

        {/* Main Content */}
        <main className="app-content app-content--mockup" data-testid="web-main-content">
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

      <GlobalSearchModal
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        stores={storeMeta}
        initialQuery={topSearch}
      />

      {isNarrow && (
        <nav className="web-bottom-nav web-bottom-nav--mockup" data-testid="web-bottom-nav">
          {bottomItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${effectiveView === item.id ? 'active' : ''}`}
              data-testid={`nav-${item.id}`}
              onClick={() => handleSelectView(item.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '4px 8px',
                borderRadius: 'var(--it-r-md)',
                border: '1px solid transparent',
                background: 'transparent',
                color:
                  effectiveView === item.id ? 'var(--it-green-text)' : 'var(--it-text-secondary)',
                cursor: 'pointer',
                fontSize: '10px',
                minWidth: '56px',
              }}
            >
              <item.icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default App;
