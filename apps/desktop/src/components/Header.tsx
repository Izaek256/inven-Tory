import React, { useEffect, useState } from 'react';
import { Store } from '../types/store';
import { getPendingOutboxCount } from '../services/tauriTransactionService';
import { getLastSyncTimestamp, triggerSync } from '../services/tauriSyncService';
import { Badge } from '@invenTory/ui';
import {
  Box,
  LogOut,
  Store as StoreIcon,
  ChevronDown,
  Moon,
  Sun,
  Search,
  UserRound,
} from 'lucide-react';
import type { AuthSession } from '../types/auth';
import { storeColor } from '../utils/storeColors';
import { GlobalSearchModal } from './GlobalSearchModal';

interface HeaderProps {
  stores: Store[];
  activeStoreId: string | null;
  onSelectStore: (storeId: string) => void;
  interactiveTimeMs?: number | null;
  currentUser?: AuthSession | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  stores,
  activeStoreId,
  onSelectStore,
  onLogout,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  // Theme state — reads from localStorage to match app-wide theme
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    try {
      const stored = localStorage.getItem('it-theme');
      if (stored) return stored === 'dark';
    } catch {
      // ignore
    }
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  const toggleTheme = (): void => {
    setIsDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('it-theme', next ? 'dark' : 'light');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const triggerManualSync = async (): Promise<void> => {
    try {
      setIsSyncing(true);
      setSyncStatus('SYNCHING...');
      const envBaseUrl =
        typeof import.meta !== 'undefined'
          ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
          : undefined;
      const apiBaseUrl = (envBaseUrl ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
      await triggerSync({ apiBaseUrl, force: true });
      const count = await getPendingOutboxCount();
      setPendingSyncCount(count);
      const ts = await getLastSyncTimestamp();
      setLastSyncAt(ts);
      setSyncStatus('SYNCHED');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch {
      setSyncStatus('SYNC FAILED');
      setTimeout(() => setSyncStatus(''), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleOnline = (): void => {
      setIsOnline(true);
      void triggerManualSync();
    };
    const handleOffline = (): void => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let isMounted = true;
    const fetchPendingCount = async (): Promise<void> => {
      try {
        const count = await getPendingOutboxCount();
        if (isMounted) {
          setPendingSyncCount(count);
        }
      } catch {
        // Ignore background polling errors
      }
    };

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 5000);

    // Fetch last sync timestamp on mount and every 5 s (SYNC-009)
    const fetchLastSync = async (): Promise<void> => {
      try {
        const ts = await getLastSyncTimestamp();
        if (isMounted) {
          setLastSyncAt(ts);
        }
      } catch {
        // Ignore errors
      }
    };
    fetchLastSync();
    const syncInterval = setInterval(fetchLastSync, 5000);

    // Refresh pending count and last sync immediately after a sync cycle completes
    const handleSyncComplete = (): void => {
      void fetchPendingCount();
      void fetchLastSync();
    };
    window.addEventListener('inventory-sync-complete', handleSyncComplete);

    return (): void => {
      isMounted = false;
      clearInterval(interval);
      clearInterval(syncInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('inventory-sync-complete', handleSyncComplete);
    };
  }, []);

  return (
    <header className="app-header" data-testid="app-header">
      <div className="header-brand">
        <div className="brand-icon-glyph">
          <Box size={18} aria-hidden="true" />
        </div>
        <h1 className="brand-title">invenTory</h1>
        <span className="brand-version">v1.1.0</span>
      </div>

      <div className="header-controls">
        {/* Global cross-store product search (Task G) */}
        <button
          className="header-global-search-btn"
          onClick={() => setIsGlobalSearchOpen(true)}
          data-testid="global-search-btn"
          aria-label="Global product search across all stores"
          title="Global product search across all stores"
        >
          <Search size={15} aria-hidden="true" />
          <span>Search All Stores</span>
        </button>

        {/* User menu: groups theme toggle + sign out (Task J) */}
        <div className="header-user-menu">
          <button
            className="header-user-trigger"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            data-testid="header-user-trigger"
            aria-label="User settings"
          >
            <UserRound size={15} aria-hidden="true" />
          </button>
          {userMenuOpen && (
            <div className="header-user-dropdown" data-testid="header-user-dropdown">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  toggleTheme();
                }}
                data-testid="header-theme-toggle"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
                <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
              </button>
              <div className="divider" />
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onLogout?.();
                }}
                data-testid="header-logout-btn"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Offline / Online Status Badge */}
        <div data-testid="status-indicator">
          <Badge
            status={isOnline ? 'ONLINE' : 'OFFLINE'}
            label={isOnline ? 'Online' : 'Offline Mode'}
          />
        </div>

        {/* Pending Sync Count Badge — clickable to trigger manual sync */}
        <div
          className="pending-sync-badge"
          title={
            isSyncing
              ? 'Sync in progress...'
              : pendingSyncCount > 0
                ? `Pending sync outbox events: ${pendingSyncCount}. Click to trigger manual sync.`
                : 'All events synced. Click to force a sync.'
          }
          data-testid="pending-sync-badge"
          onClick={triggerManualSync}
          style={{ cursor: 'pointer' }}
        >
          {isSyncing ? (
            <Badge status="PENDING" label={syncStatus || 'SYNCHING...'} />
          ) : syncStatus ? (
            <Badge status={syncStatus === 'SYNCHED' ? 'ACTIVE' : 'INACTIVE'} label={syncStatus} />
          ) : pendingSyncCount > 0 ? (
            <Badge status="PENDING" label={`Pending Sync: ${pendingSyncCount}`} />
          ) : (
            <Badge status="ACTIVE" label="SYNCHED" />
          )}
          <span style={{ display: 'none' }} data-testid="pending-sync-count">
            {pendingSyncCount}
          </span>
        </div>

        {/* Last sync timestamp (SYNC-009) */}
        <div
          className="last-sync-badge"
          data-testid="last-sync-timestamp"
          title={lastSyncAt ? `Last synced: ${lastSyncAt}` : 'Not yet synced'}
        >
          {lastSyncAt ? (
            <span className="last-sync-label">
              Synced: {new Date(lastSyncAt).toLocaleTimeString()}
            </span>
          ) : (
            <span className="last-sync-label last-sync-none">Not synced</span>
          )}
        </div>

        {/* Active Store Selector — redesigned: name only + color badge (Task H) */}
        {stores.length > 0 &&
          ((): React.ReactElement => {
            const currentStore = stores.find((s) => s.id === activeStoreId) || stores[0];
            const currentStoreColor = storeColor(currentStore?.id ?? '');
            return (
              <div className="store-switcher-wrapper" data-testid="store-switcher-wrapper">
                <div className="store-switcher-pill" title={`Active Store: ${currentStore?.name}`}>
                  <div className="store-switcher-icon-wrap">
                    <StoreIcon size={14} className="store-switcher-icon" />
                  </div>
                  <div className="store-switcher-info">
                    <span className="store-switcher-name">
                      <span
                        className="store-switcher-badge"
                        style={{ backgroundColor: currentStoreColor }}
                      />
                      {currentStore?.name}
                    </span>
                  </div>
                  <span className="store-switcher-dot" aria-hidden="true" />
                  <ChevronDown size={14} className="store-switcher-chevron" />
                </div>
                <select
                  className="store-switcher-native-select"
                  value={activeStoreId || ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>): void =>
                    onSelectStore(e.target.value)
                  }
                  data-testid="store-selector"
                  aria-label="Active Store Location"
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      <span className="store-switcher-dropdown-option">
                        <span
                          className="store-switcher-badge"
                          style={{ backgroundColor: storeColor(store.id) }}
                        />
                        {store.name}
                      </span>
                    </option>
                  ))}
                </select>
              </div>
            );
          })()}
      </div>

      {/* Read-only all-stores lookup; never changes the active store (Task G) */}
      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        stores={stores}
      />
    </header>
  );
};
