import React, { useEffect, useState, useRef } from 'react';
import { Store } from '../types/store';
import { getPendingOutboxCount } from '../services/tauriTransactionService';
import { getLastSyncTimestamp, triggerSync } from '../services/tauriSyncService';
import { useTheme } from '@invenTory/ui';
import {
  LogOut,
  ChevronDown,
  Moon,
  Sun,
  Search,
  UserRound,
  Download,
  Loader2,
  Database,
  Check,
} from 'lucide-react';
import type { AuthSession } from '../types/auth';
import { storeColor } from '../utils/storeColors';
import { GlobalSearchModal } from './GlobalSearchModal';
import { useUpdater } from '../context/UpdaterContext';

interface HeaderProps {
  stores: Store[];
  activeStoreId: string | null;
  onSelectStore: (storeId: string) => void;
  interactiveTimeMs?: number | null;
  currentUser?: AuthSession | null;
  onLogout?: () => void;
  restoreProgress?: {
    phase: string;
    currentStep: string;
    progressPercent: number;
    criticalComplete: boolean;
    canUseApp: boolean;
    totalComplete: boolean;
  } | null;
}

export const Header: React.FC<HeaderProps> = ({
  stores,
  activeStoreId,
  onSelectStore,
  onLogout,
  restoreProgress,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const storeMenuRef = useRef<HTMLDivElement>(null);
  void useTheme;

  const { progress, isDownloading } = useUpdater();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  // Close user dropdown on outside click / Esc – reference hidden menu behavior
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent): void => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  // Close store dropdown on outside click / Esc
  useEffect(() => {
    if (!storeMenuOpen) return;
    const onDocClick = (e: MouseEvent): void => {
      if (storeMenuRef.current && !storeMenuRef.current.contains(e.target as Node)) {
        setStoreMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setStoreMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [storeMenuOpen]);

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
        if (isMounted) setPendingSyncCount(count);
      } catch {
        // ignore
      }
    };
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 5000);

    const fetchLastSync = async (): Promise<void> => {
      try {
        const ts = await getLastSyncTimestamp();
        if (isMounted) setLastSyncAt(ts);
      } catch {
        // ignore
      }
    };
    fetchLastSync();
    const syncInterval = setInterval(fetchLastSync, 5000);

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

  const currentStore =
    stores.length > 0 ? stores.find((s) => s.id === activeStoreId) || stores[0] : null;
  const currentStoreColor = currentStore ? storeColor(currentStore.id) : '#62685f';

  return (
    <header className="app-header" data-testid="app-header">
      {/* Left balance — keeps search optically centered without overlapping controls */}
      <div className="header-balance" aria-hidden="true" />

      {/* Search — reference .search (opens global modal) */}
      <button
        className="search"
        onClick={() => setIsGlobalSearchOpen(true)}
        data-testid="global-search-btn"
        aria-label="Global product search across all stores"
        title="Search all stores — name, SKU, barcode…"
        type="button"
        style={{ cursor: 'pointer', textAlign: 'left' }}
      >
        <Search size={14} aria-hidden="true" />
        <span
          style={{
            fontFamily: 'var(--it-font-mono)',
            fontSize: '12.5px',
            color: 'var(--it-text-disabled)',
          }}
        >
          Search all stores — name, SKU, barcode…
        </span>
      </button>

      <div className="header-controls">
        {/* Restore / updater progress — keep existing but styled as chips */}
        {restoreProgress && !restoreProgress.totalComplete && restoreProgress.phase !== 'idle' && (
          <div
            className="import-progress-container"
            data-testid="restore-progress-container"
            title={`Restoring data: ${restoreProgress.currentStep} (${restoreProgress.progressPercent}%)`}
            style={{ minWidth: 160 }}
          >
            <div className="import-progress-bar">
              {restoreProgress.progressPercent > 0 ? (
                <div
                  className="import-progress-fill"
                  style={{
                    width: `${Math.min(100, restoreProgress.progressPercent)}%`,
                    background: 'var(--amber)',
                  }}
                />
              ) : (
                <div
                  className="import-progress-fill import-progress-fill--indeterminate"
                  style={{ background: 'var(--amber)' }}
                />
              )}
            </div>
            <span
              className="import-progress-label"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Database size={11} />
              {restoreProgress.progressPercent > 0
                ? `Restoring… ${restoreProgress.progressPercent}%`
                : 'Restoring…'}
            </span>
          </div>
        )}

        {restoreProgress && restoreProgress.totalComplete && (
          <div
            className="import-progress-container"
            data-testid="restore-complete-container"
            style={{ minWidth: 120 }}
          >
            <span
              className="import-progress-label"
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}
            >
              <Database size={11} />
              Restore complete!
            </span>
          </div>
        )}

        {(isDownloading || progress.stage === 'installing') && (
          <div
            className="import-progress-container"
            data-testid="update-progress-container"
            title={
              progress.stage === 'installing'
                ? 'Installing update...'
                : progress.total
                  ? `Downloading update: ${progress.percent}%`
                  : 'Downloading update...'
            }
          >
            <div className="import-progress-bar">
              {progress.stage === 'installing' ? (
                <div className="import-progress-fill import-progress-fill--indeterminate" />
              ) : progress.total ? (
                <div className="import-progress-fill" style={{ width: `${progress.percent}%` }} />
              ) : (
                <div className="import-progress-fill import-progress-fill--indeterminate" />
              )}
            </div>
            <span className="import-progress-label">
              {progress.stage === 'installing' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Loader2 size={12} className="animate-spin" /> Installing...
                </span>
              ) : progress.total ? (
                `${progress.percent}%`
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={12} /> Downloading...
                </span>
              )}
            </span>
          </div>
        )}

        {/* Online chip — reference .status-chip */}
        <div className="status-chip" data-testid="status-indicator">
          <span
            className="dot"
            style={{ background: isOnline ? 'var(--green)' : 'var(--amber)' }}
            aria-hidden="true"
          />
          {isOnline ? 'Online' : 'Offline'}
        </div>

        {/* Sync chip — reference .status-chip */}
        <div
          className="status-chip"
          data-testid="pending-sync-badge"
          onClick={triggerManualSync}
          style={{ cursor: 'pointer' }}
          title={
            isSyncing
              ? 'Sync in progress...'
              : pendingSyncCount > 0
                ? `Pending changes to sync: ${pendingSyncCount}. Click to sync now.`
                : 'All events synced. Click to force a sync.'
          }
        >
          <span
            className="dot"
            style={{ background: pendingSyncCount > 0 ? 'var(--amber)' : 'var(--green)' }}
            aria-hidden="true"
          />
          {isSyncing
            ? syncStatus || 'Syncing…'
            : syncStatus
              ? syncStatus
              : pendingSyncCount > 0
                ? `Pending: ${pendingSyncCount}`
                : 'Synced'}
        </div>
        <span style={{ display: 'none' }} data-testid="pending-sync-count">
          {pendingSyncCount}
        </span>

        {/* Sync time chip — dashed */}
        <div
          className="status-chip sync-time"
          data-testid="last-sync-timestamp"
          title={lastSyncAt ? `Last synced: ${lastSyncAt}` : 'Not yet synced'}
        >
          {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'Not synced'}
        </div>

        {/* User menu — hidden dropdown (reference .header-user-dropdown) */}
        <div className="header-user-menu" ref={userMenuRef}>
          <button
            className={`header-user-trigger ${userMenuOpen ? 'open' : ''}`}
            onClick={() => {
              setUserMenuOpen(!userMenuOpen);
              setStoreMenuOpen(false);
            }}
            data-testid="header-user-trigger"
            aria-label="User settings"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            type="button"
          >
            <UserRound size={15} aria-hidden="true" />
          </button>
          {userMenuOpen && (
            <div className="header-user-dropdown" data-testid="header-user-dropdown" role="menu">
              {/* Theme toggler — redesigned as switch row (reference .switch) */}
              <button
                className="header-dropdown-item header-theme-row"
                onClick={() => toggleTheme()}
                data-testid="header-theme-toggle"
                type="button"
                role="menuitem"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <span className="header-dropdown-icon">
                  {isDark ? <Sun size={14} /> : <Moon size={14} />}
                </span>
                <span className="header-dropdown-label">{isDark ? 'Light mode' : 'Dark mode'}</span>
                <span
                  className="header-theme-switch"
                  aria-hidden="true"
                  data-active={isDark ? 'true' : 'false'}
                >
                  <span className="header-theme-thumb" />
                </span>
              </button>
              <div className="header-dropdown-divider" />
              <button
                className="header-dropdown-item header-logout-row"
                onClick={() => {
                  setUserMenuOpen(false);
                  onLogout?.();
                }}
                data-testid="header-logout-btn"
                type="button"
                role="menuitem"
              >
                <span className="header-dropdown-icon">
                  <LogOut size={14} />
                </span>
                <span className="header-dropdown-label">Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Store tag — reference .store-tag (ink + amber code) + custom dropdown */}
        {currentStore && (
          <div
            className="store-switcher-wrapper"
            ref={storeMenuRef}
            data-testid="store-switcher-wrapper"
          >
            <button
              className={`store-tag ${storeMenuOpen ? 'open' : ''}`}
              type="button"
              aria-label={`Active Store: ${currentStore.name}`}
              title={`Active Store: ${currentStore.name}`}
              aria-expanded={storeMenuOpen}
              aria-haspopup="listbox"
              onClick={() => {
                setStoreMenuOpen((v) => !v);
                setUserMenuOpen(false);
              }}
              data-testid="store-tag-trigger"
            >
              <span className="code" style={{ background: currentStoreColor, color: '#fff' }}>
                {currentStore.code}
              </span>
              <span className="name">{currentStore.name}</span>
              <ChevronDown size={13} className="store-tag-chevron" aria-hidden="true" />
            </button>

            {/* Visually hidden native select — keeps value for tests / a11y */}
            <select
              className="store-switcher-native-select"
              value={activeStoreId || ''}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>): void =>
                onSelectStore(e.target.value)
              }
              data-testid="store-selector"
              aria-label="Active Store Location"
              tabIndex={-1}
              aria-hidden="true"
            >
              {stores.map((store: Store) => (
                <option key={store.id} value={store.id} data-store-color={storeColor(store.id)}>
                  {store.name}
                </option>
              ))}
            </select>

            {storeMenuOpen && (
              <div
                className="store-dropdown"
                role="listbox"
                aria-label="Switch store"
                data-testid="store-dropdown"
              >
                <div className="store-dropdown-caption">Switch store</div>
                {stores.map((store: Store) => {
                  const isActive = store.id === (activeStoreId || currentStore.id);
                  const color = storeColor(store.id);
                  return (
                    <button
                      key={store.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`store-dropdown-item ${isActive ? 'active' : ''}`}
                      data-testid={`store-option-${store.id}`}
                      onClick={() => {
                        onSelectStore(store.id);
                        setStoreMenuOpen(false);
                      }}
                    >
                      <span className="swatch" style={{ background: color }} aria-hidden="true" />
                      <span className="code" style={{ background: color }}>
                        {store.code}
                      </span>
                      <span className="name">{store.name}</span>
                      {isActive && <Check size={14} className="check" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        stores={stores}
      />
    </header>
  );
};
