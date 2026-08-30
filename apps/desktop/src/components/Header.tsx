import React, { useEffect, useState } from 'react';
import { Store } from '../types/store';
import { getPendingOutboxCount } from '../services/tauriTransactionService';

interface HeaderProps {
  stores: Store[];
  activeStoreId: string | null;
  onSelectStore: (storeId: string) => void;
  interactiveTimeMs?: number | null;
}

export const Header: React.FC<HeaderProps> = ({
  stores,
  activeStoreId,
  onSelectStore,
  interactiveTimeMs,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

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

    return (): void => {
      isMounted = false;
      clearInterval(interval);
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
        {/* Offline / Online Status Badge */}
        <div
          className={`status-pill ${isOnline ? 'status-online' : 'status-offline'}`}
          title={isOnline ? 'Network connection active' : 'Operating in offline mode'}
          data-testid="status-indicator"
        >
          <span className="status-dot"></span>
          <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
        </div>

        {/* Pending Sync Count Badge */}
        <div
          className="pending-sync-badge"
          title={`Pending sync outbox events: ${pendingSyncCount}`}
          data-testid="pending-sync-badge"
        >
          <span>Pending Sync:</span>
          <span className="sync-count" data-testid="pending-sync-count">
            {pendingSyncCount}
          </span>
        </div>

        {/* Active Store Selector */}
        {stores.length > 0 && (
          <div className="store-selector-box">
            <select
              className="status-pill"
              value={activeStoreId || ''}
              onChange={(e) => onSelectStore(e.target.value)}
              data-testid="store-selector"
              style={{ cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-main)' }}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Startup Performance instrumentation badge */}
        {interactiveTimeMs != null && (
          <div className="perf-timer-badge" data-testid="perf-timer">
            Interactive: {interactiveTimeMs.toFixed(0)}ms
          </div>
        )}
      </div>
    </header>
  );
};
