import React from 'react';
import { Store } from '../types/store';
import { Store as StoreIcon } from 'lucide-react';

interface DashboardViewProps {
  stores: Store[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stores,
  loading,
  error,
  onRetry,
}) => {
  const activeCount = stores.filter((s) => s.is_active).length;

  return (
    <div className="dashboard-view" data-testid="dashboard-view">
      <div className="view-header">
        <h2 className="view-title">Dashboard</h2>
        <p className="view-subtitle">
          SQLite Database Smoke Test — Seeded store locations loaded from local storage
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid-stats">
        <div className="stat-card">
          <div className="stat-label">Total Stores</div>
          <div className="stat-value" data-testid="stat-total-stores">
            {loading ? '...' : stores.length}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Stores</div>
          <div
            className="stat-value"
            style={{ color: 'var(--status-online)' }}
            data-testid="stat-active-stores"
          >
            {loading ? '...' : activeCount}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Local Engine</div>
          <div className="stat-value" style={{ fontSize: '18px', paddingTop: '6px' }}>
            SQLite (Issue 03)
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="table-card">
        <div className="table-header-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StoreIcon size={20} color="var(--accent-primary)" />
            <h3 className="table-title">Registered Store Locations</h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            IPC Command: get_stores
          </span>
        </div>

        {loading ? (
          <div className="loading-state" data-testid="loading-state">
            <div className="spinner"></div>
            <p>Reading store database from local SQLite file...</p>
          </div>
        ) : error ? (
          <div className="error-state" data-testid="error-state">
            <p style={{ color: 'var(--status-error)', marginBottom: '8px', fontWeight: 600 }}>
              {error}
            </p>
            <button type="button" className="btn-retry" onClick={onRetry}>
              Retry Load
            </button>
          </div>
        ) : stores.length === 0 ? (
          <div className="empty-state" data-testid="empty-state">
            <p>No stores found in local SQLite database.</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>
              Run python seed script: <code>python -m storage.seed</code>
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table" data-testid="stores-table">
              <thead>
                <tr>
                  <th>Store Code</th>
                  <th>Store Name</th>
                  <th>ID</th>
                  <th>Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id} data-testid={`store-row-${store.id}`}>
                    <td style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                      {store.code}
                    </td>
                    <td style={{ fontWeight: 500 }}>{store.name}</td>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {store.id}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{store.address || 'N/A'}</td>
                    <td>
                      <span
                        className={`badge ${store.is_active ? 'badge-active' : 'badge-inactive'}`}
                      >
                        {store.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
