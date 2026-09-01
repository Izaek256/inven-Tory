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
import { Button, Badge, StatCard, DataTable, EmptyState, ColumnDef } from '@inven-tory/ui';
import { Store as StoreIcon, Plus, Edit2, Power, Smartphone, AlertTriangle } from 'lucide-react';

interface DashboardViewProps {
  stores: Store[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Current user's role from the auth session (Issue 25). */
  userRole?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stores,
  loading,
  error,
  onRetry,
  userRole = 'ADMIN',
}) => {
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [targetDeviceStore, setTargetDeviceStore] = useState<Store | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const activeCount = stores.filter((s) => s.is_active).length;
  const isAuthorized =
    userRole === 'GLOBAL_ADMIN' || userRole === 'INVENTORY_MANAGER' || userRole === 'STORE_MANAGER';

  const handleOpenCreateModal = (): void => {
    setActionError(null);
    setEditingStore(null);
    setStoreModalOpen(true);
  };

  const handleOpenEditModal = (store: Store): void => {
    setActionError(null);
    setEditingStore(store);
    setStoreModalOpen(true);
  };

  const handleOpenDeviceModal = (store: Store): void => {
    setActionError(null);
    setTargetDeviceStore(store);
    setDeviceModalOpen(true);
  };

  const handleCreateStore = async (input: CreateStoreInput): Promise<void> => {
    await createStore(input);
    onRetry();
  };

  const handleUpdateStore = async (input: UpdateStoreInput): Promise<void> => {
    await updateStore(input);
    onRetry();
  };

  const handleToggleActive = async (store: Store): Promise<void> => {
    try {
      setActionError(null);
      await toggleStoreActive(store.id, !store.is_active);
      onRetry();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRegisterDevice = async (storeId: string, deviceName: string): Promise<void> => {
    await registerDevice(storeId, deviceName);
  };

  const columns: ColumnDef<Store>[] = [
    {
      key: 'code',
      header: 'Store Code',
      sortable: true,
      render: (s) => (
        <span
          style={{
            fontWeight: 600,
            color: 'var(--it-green-text)',
            fontFamily: 'var(--it-font-mono)',
          }}
        >
          {s.code}
        </span>
      ),
      accessor: (s) => s.code,
    },
    {
      key: 'name',
      header: 'Store Name',
      sortable: true,
      render: (s) => <span style={{ fontWeight: 500 }}>{s.name}</span>,
      accessor: (s) => s.name,
    },
    {
      key: 'id',
      header: 'ID',
      render: (s) => (
        <span
          style={{
            fontFamily: 'var(--it-font-mono)',
            fontSize: '12px',
            color: 'var(--it-text-secondary)',
          }}
        >
          {s.id}
        </span>
      ),
      accessor: (s) => s.id,
    },
    {
      key: 'address',
      header: 'Address',
      render: (s) => (
        <span style={{ color: 'var(--it-text-secondary)' }}>{s.address || 'N/A'}</span>
      ),
      accessor: (s) => s.address,
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <Badge status={s.is_active ? 'ACTIVE' : 'INACTIVE'} />,
      accessor: (s) => (s.is_active ? 'Active' : 'Inactive'),
    },
    {
      key: 'actions',
      header: 'Actions',
      numeric: true,
      render: (s) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            title="Register Local Device Stub (FR-STORE-003)"
            onClick={() => handleOpenDeviceModal(s)}
            disabled={!isAuthorized}
            data-testid={`register-device-btn-${s.id}`}
          >
            <Smartphone size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            title="Edit Store"
            onClick={() => handleOpenEditModal(s)}
            disabled={!isAuthorized}
            data-testid={`edit-store-btn-${s.id}`}
          >
            <Edit2 size={14} />
          </Button>
          <Button
            variant={s.is_active ? 'destructive' : 'primary'}
            size="sm"
            iconOnly
            title={s.is_active ? 'Deactivate Store' : 'Activate Store'}
            onClick={() => handleToggleActive(s)}
            disabled={!isAuthorized}
            data-testid={`toggle-store-btn-${s.id}`}
          >
            <Power size={14} />
          </Button>
        </div>
      ),
    },
  ];

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
          {!isAuthorized && <Badge status="INACTIVE" label={`Restricted Role (${userRole})`} />}
          <Button
            variant="primary"
            onClick={handleOpenCreateModal}
            disabled={!isAuthorized}
            data-testid="add-store-btn"
          >
            <Plus size={16} /> Add Store
          </Button>
        </div>
      </div>

      {actionError && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          data-testid="dashboard-action-error"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div data-testid="stat-total-stores">
          <StatCard label="Total Stores" value={loading ? '...' : stores.length} />
        </div>
        <div data-testid="stat-active-stores">
          <StatCard
            label="Active Stores"
            value={loading ? '...' : activeCount}
            valueColour="green"
          />
        </div>
        <StatCard label="Local Engine" value="SQLite (Issue 03)" />
      </div>

      {/* Table Section */}
      <div
        className="it-summary-card"
        style={{
          border: '1px solid var(--it-border)',
          borderRadius: 'var(--it-r-lg)',
          backgroundColor: 'var(--it-card)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--it-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StoreIcon size={20} color="var(--it-green)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
              Registered Store Locations
            </h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
            FR-STORE-001 Store Management
          </span>
        </div>

        {loading ? (
          <EmptyState
            variant="loading"
            heading="Loading store database"
            body="Reading store database from local SQLite file..."
            data-testid="loading-state"
          />
        ) : error ? (
          <EmptyState
            variant="error"
            heading="Failed to load stores"
            body={error}
            action={
              <Button variant="primary" onClick={onRetry}>
                Retry Load
              </Button>
            }
            data-testid="error-state"
          />
        ) : (
          <DataTable
            columns={columns}
            rows={stores}
            rowKey={(s) => s.id}
            data-testid="stores-table"
            emptySlot={
              <EmptyState
                heading="No stores found"
                body="No stores found in local SQLite database."
                action={
                  <Button variant="primary" onClick={handleOpenCreateModal}>
                    Create First Store
                  </Button>
                }
                data-testid="empty-state"
              />
            }
          />
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
