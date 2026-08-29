import React, { useEffect, useState } from 'react';
import { Store } from '../types/store';

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
  // TODO(issue-12): Real online status detection and WebSocket/Sync server state
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // TODO(issue-12): Real pending sync outbox count from outbox_events table
  const pendingSyncCount = 0;

  useEffect(() => {
    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return (): void => {
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
        {/* Offline / Online Status Badge — TODO(issue-12) */}
        <div
          className={`status-pill ${isOnline ? 'status-online' : 'status-offline'}`}
          title="TODO(issue-12): Real sync status monitoring"
          data-testid="status-indicator"
        >
          <span className="status-dot"></span>
          <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
        </div>

        {/* Pending Sync Count Badge — TODO(issue-12) */}
        <div
          className="pending-sync-badge"
          title="TODO(issue-12): Pending outbox sync event count"
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
