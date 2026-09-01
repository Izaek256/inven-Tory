import React, { useEffect, useState } from 'react';
import { Store } from '../types/store';
import { getPendingOutboxCount } from '../services/tauriTransactionService';
import { getLastSyncTimestamp } from '../services/tauriSyncService';
import { Badge, ThemeToggle, Select, Button } from '@inven-tory/ui';
import { LogOut, User } from 'lucide-react';
import type { AuthSession } from '../types/auth';

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
  interactiveTimeMs,
  currentUser,
  onLogout,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = (): void => setIsOnline(true);
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
    const interval = setInterval(fetchPendingCount, 1000);

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

    return (): void => {
      isMounted = false;
      clearInterval(interval);
      clearInterval(syncInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="app-header" data-testid="app-header">
      <div className="header-brand">
        <div className="brand-icon">IT</div>
        <h1 className="brand-title">INVENTORY Tory</h1>
        <span className="brand-version">v1.1.0</span>
      </div>

      <div className="header-controls">
        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Offline / Online Status Badge */}
        <div data-testid="status-indicator">
          <Badge
            status={isOnline ? 'ONLINE' : 'OFFLINE'}
            label={isOnline ? 'Online' : 'Offline Mode'}
          />
        </div>

        {/* Pending Sync Count Badge */}
        <div
          className="pending-sync-badge"
          title={`Pending sync outbox events: ${pendingSyncCount}`}
          data-testid="pending-sync-badge"
        >
          <Badge status="PENDING" label={`Pending Sync: ${pendingSyncCount}`} />
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

        {/* Active Store Selector */}
        {stores.length > 0 && (
          <div className="store-selector-box">
            <Select
              value={activeStoreId || ''}
              onChange={(e) => onSelectStore(e.target.value)}
              data-testid="store-selector"
              options={stores.map((store) => ({
                value: store.id,
                label: `${store.name} (${store.code})`,
              }))}
            />
          </div>
        )}

        {/* Startup Performance instrumentation badge */}
        {interactiveTimeMs != null && (
          <div className="perf-timer-badge" data-testid="perf-timer">
            Interactive: {interactiveTimeMs.toFixed(0)}ms
          </div>
        )}

        {/* Current user identity */}
        {currentUser && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--it-text-secondary)',
            }}
            data-testid="current-user-indicator"
          >
            <User size={14} aria-hidden="true" />
            <span>{currentUser.full_name ?? currentUser.username}</span>
            <Badge status="SENT" label={currentUser.role} />
          </div>
        )}

        {/* Logout button */}
        {onLogout && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            title="Sign out"
            data-testid="header-logout-btn"
          >
            <LogOut size={14} aria-hidden="true" />
            <span>Sign Out</span>
          </Button>
        )}
      </div>
    </header>
  );
};
