import React, { useState } from 'react';
import { Store, CreateStoreInput, UpdateStoreInput } from '../types/store';
import {
  createStore,
  updateStore,
  toggleStoreActive,
  registerDevice,
} from '../services/tauriStoreService';
import { StoreModal } from '../components/StoreModal';
import { DeviceRegistrationModal } from '../components/DeviceRegistrationModal';
import { Store as StoreIcon, Plus, Edit2, Power, Smartphone, AlertTriangle } from 'lucide-react';

interface DashboardViewProps {
  stores: Store[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  userRole?: string; // Provisional role restriction — TODO(issue-13)
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stores,
  loading,
  error,
  onRetry,
  userRole = 'ADMIN', // Default to ADMIN for dev, editable in settings
}) => {
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [targetDeviceStore, setTargetDeviceStore] = useState<Store | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const activeCount = stores.filter((s) => s.is_active).length;

  // Provisional role restriction check (TODO issue-13)
  const isAuthorized = userRole === 'ADMIN' || userRole === 'MANAGER';

  const handleOpenCreateModal = () => {
    setActionError(null);
    setEditingStore(null);
    setStoreModalOpen(true);
  };

  const handleOpenEditModal = (store: Store) => {
    setActionError(null);
    setEditingStore(store);
    setStoreModalOpen(true);
  };

  const handleOpenDeviceModal = (store: Store) => {
    setActionError(null);
    setTargetDeviceStore(store);
    setDeviceModalOpen(true);
  };

  const handleCreateStore = async (input: CreateStoreInput) => {
    await createStore(input);
    onRetry();
  };

  const handleUpdateStore = async (input: UpdateStoreInput) => {
    await updateStore(input);
    onRetry();
  };

  const handleToggleActive = async (store: Store) => {
    try {
      setActionError(null);
      await toggleStoreActive(store.id, !store.is_active);
      onRetry();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRegisterDevice = async (storeId: string, deviceName: string) => {
    await registerDevice(storeId, deviceName);
  };

  return (
    <div className="dashboard-view" data-testid="dashboard-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">Dashboard & Store Locations</h2>
          <p className="view-subtitle">
            Local SQLite multi-store management and device assignment (FR-STORE-001–003)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isAuthorized && (
            <span
              className="badge badge-inactive"
              title="Client-side role restriction (provisional) — TODO(issue-13)"
            >
              <AlertTriangle size={12} /> Restricted Role ({userRole})
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreateModal}
            disabled={!isAuthorized}
            data-testid="add-store-btn"
          >
            <Plus size={16} /> Add Store
          </button>
        </div>
      </div>

      {actionError && (
        <div className="alert alert-danger" style={{ marginBottom: '16px' }} data-testid="dashboard-action-error">
          <span>{actionError}</span>
        </div>
      )}

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
            FR-STORE-001 Store Management
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
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '12px' }}
              onClick={handleOpenCreateModal}
            >
              Create First Store
            </button>
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
                  <th style={{ textAlign: 'right' }}>Actions</th>
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
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn-action"
                          title="Register Local Device Stub (FR-STORE-003)"
                          onClick={() => handleOpenDeviceModal(store)}
                          disabled={!isAuthorized}
                          data-testid={`register-device-btn-${store.id}`}
                        >
                          <Smartphone size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-action"
                          title="Edit Store"
                          onClick={() => handleOpenEditModal(store)}
                          disabled={!isAuthorized}
                          data-testid={`edit-store-btn-${store.id}`}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          className={`btn-action ${store.is_active ? 'active-on' : 'active-off'}`}
                          title={store.is_active ? 'Deactivate Store' : 'Activate Store'}
                          onClick={() => handleToggleActive(store)}
                          disabled={!isAuthorized}
                          data-testid={`toggle-store-btn-${store.id}`}
                        >
                          <Power size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <StoreModal
        isOpen={storeModalOpen}
        store={editingStore}
        onClose={() => setStoreModalOpen(false)}
        onSubmitCreate={handleCreateStore}
        onSubmitUpdate={handleUpdateStore}
      />

      <DeviceRegistrationModal
        isOpen={deviceModalOpen}
        store={targetDeviceStore}
        onClose={() => setDeviceModalOpen(false)}
        onRegisterDevice={handleRegisterDevice}
      />
    </div>
  );
};

