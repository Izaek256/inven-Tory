import React, { useEffect, useState } from 'react';
import { Store } from '../types/store';
import { getPendingOutboxCount } from '../services/tauriTransactionService';
import { getLastSyncTimestamp, triggerSync } from '../services/tauriSyncService';
import { Badge, useTheme } from '@invenTory/ui';
import {
  Box,
  LogOut,
  Store as StoreIcon,
  ChevronDown,
  Moon,
  Sun,
  Search,
  UserRound,
  Download,
  Loader2,
  Database,
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
  importProgress?: {
    running: boolean;
    done: number;
    total: number;
    errors: number;
  } | null;
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
  importProgress,
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
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  // Updater state
  const { progress, isDownloading } = useUpdater();

  // Theme — delegates to the app-wide ThemeProvider so changes are reflected
  // across the whole app immediately (data-theme on <html> element).
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

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

    // Fetch last sync timestamp on mount and every 5 s
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

        {/* Import Progress Bar — visible whenever a bulk import is running,
            including the file-parsing phase before the row count is known */}
        {importProgress && importProgress.running && (
          <div
            className="import-progress-container"
            data-testid="import-progress-container"
            title={
              importProgress.total > 0
                ? `Importing products: ${importProgress.done}/${importProgress.total} (${importProgress.errors} errors)`
                : 'Reading import file…'
            }
          >
            <div className="import-progress-bar">
              {importProgress.total > 0 ? (
                <div
                  className="import-progress-fill"
                  style={{
                    width: `${Math.min(100, (importProgress.done / importProgress.total) * 100)}%`,
                  }}
                />
              ) : (
                <div className="import-progress-fill import-progress-fill--indeterminate" />
              )}
            </div>
            <span className="import-progress-label">
              {importProgress.total > 0 ? (
                <>
                  {importProgress.done}/{importProgress.total}
                  {importProgress.errors > 0 && ` (${importProgress.errors} errors)`}
                </>
              ) : (
                'Reading file…'
              )}
            </span>
          </div>
        )}

        {/* Restore Progress Bar — non-blocking, shown in header while restore runs in the background */}
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
                    background: 'var(--it-warning, #f59e0b)',
                  }}
                />
              ) : (
                <div
                  className="import-progress-fill import-progress-fill--indeterminate"
                  style={{ background: 'var(--it-warning, #f59e0b)' }}
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

        {/* Restore complete flash */}
        {restoreProgress && restoreProgress.totalComplete && (
          <div
            className="import-progress-container"
            data-testid="restore-complete-container"
            style={{ minWidth: 120 }}
          >
            <span
              className="import-progress-label"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--it-success, #10b981)',
              }}
            >
              <Database size={11} />
              Restore complete!
            </span>
          </div>
        )}

        {/* Update Download Progress Bar — visible when downloading/installing update */}
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
                  <Loader2 size={12} className="animate-spin" />
                  Installing...
                </span>
              ) : progress.total ? (
                `${progress.percent}%`
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={12} />
                  Downloading...
                </span>
              )}
            </span>
          </div>
        )}

        {/* Pending Sync Count Badge — clickable to trigger manual sync */}
        <div
          className="pending-sync-badge"
          title={
            isSyncing
              ? 'Sync in progress...'
              : pendingSyncCount > 0
                ? `Pending changes to sync: ${pendingSyncCount}. Click to sync now.`
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

        {/* Last sync timestamp */}
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
                  {stores.map((store: Store) => (
                    <option key={store.id} value={store.id} data-store-color={storeColor(store.id)}>
                      {store.name}
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
