/**
 * SettingsView.
 *
 * Displays device configuration, theme, current user identity, and store management.
 * The logout button calls tauriAuthService.logout() which clears
 * the secure token cache and returns to the login screen.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, LogOut, User, Plus, Edit2, Power, Smartphone } from 'lucide-react';
import { Card, ThemeToggle, Badge, Button, EmptyState, Modal } from '@invenTory/ui';
import { DataTable, type ColumnDef } from '@invenTory/ui';
import type { AuthSession } from '../types/auth';
import { Store, CreateStoreInput, UpdateStoreInput } from '../types/store';
import {
  getStores,
  createStore,
  updateStore,
  toggleStoreActive,
  registerDevice,
} from '../services/tauriStoreService';

interface SettingsViewProps {
  currentUser?: AuthSession | null;
  onLogout?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser, onLogout }) => {
  const [loggingOut, setLoggingOut] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);

  // Store modal state
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [storeModalMode, setStoreModalMode] = useState<'create' | 'edit'>('create');
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeForm, setStoreForm] = useState({ code: '', name: '', address: '' });
  const [storeModalError, setStoreModalError] = useState<string | null>(null);
  const [storeModalSubmitting, setStoreModalSubmitting] = useState(false);

  // Device modal state
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [deviceStoreId, setDeviceStoreId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [deviceModalSubmitting, setDeviceModalSubmitting] = useState(false);

  const fetchStores = useCallback(async () => {
    setStoresLoading(true);
    setStoresError(null);
    try {
      const data = await getStores();
      setStores(data);
    } catch (err) {
      setStoresError(err instanceof Error ? err.message : String(err));
    } finally {
      setStoresLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStores();
  }, [fetchStores]);

  const handleLogout = async (): Promise<void> => {
    if (!onLogout) return;
    setLoggingOut(true);
    try {
      onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleAddStore = (): void => {
    setStoreModalMode('create');
    setEditingStore(null);
    setStoreForm({ code: '', name: '', address: '' });
    setStoreModalError(null);
    setStoreModalOpen(true);
  };

  const handleEditStore = (store: Store): void => {
    setStoreModalMode('edit');
    setEditingStore(store);
    setStoreForm({ code: store.code, name: store.name, address: store.address || '' });
    setStoreModalError(null);
    setStoreModalOpen(true);
  };

  const handleStoreModalSubmit = async (): Promise<void> => {
    setStoreModalError(null);
    setStoreModalSubmitting(true);

    try {
      if (storeModalMode === 'create') {
        const input: CreateStoreInput = {
          code: storeForm.code,
          name: storeForm.name,
          address: storeForm.address,
        };
        await createStore(input);
      } else if (storeModalMode === 'edit' && editingStore) {
        const input: UpdateStoreInput = {
          id: editingStore.id,
          name: storeForm.name,
          address: storeForm.address,
        };
        await updateStore(input);
      }
      setStoreModalOpen(false);
      await fetchStores();
    } catch (err) {
      setStoreModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setStoreModalSubmitting(false);
    }
  };

  const handleToggleStore = async (store: Store): Promise<void> => {
    try {
      await toggleStoreActive(store.id, !store.is_active);
      await fetchStores();
    } catch (err) {
      // Error could be shown in a toast, but for now just log
      // console.error('Failed to toggle store:', err);
    }
  };

  const handleRegisterDevice = (storeId: string): void => {
    setDeviceStoreId(storeId);
    setDeviceName('');
    setDeviceModalOpen(true);
  };

  const handleDeviceModalSubmit = async (): Promise<void> => {
    if (!deviceStoreId) return;

    setDeviceModalSubmitting(true);
    try {
      await registerDevice(deviceStoreId, deviceName);
      setDeviceModalOpen(false);
      setDeviceName('');
    } catch (err) {
      // console.error('Failed to register device:', err);
    } finally {
      setDeviceModalSubmitting(false);
    }
  };

  const storeColumns: ColumnDef<Store>[] = [
    {
      key: 'code',
      header: 'Code',
      accessor: (s: Store) => s.code,
      render: (s: Store) => (
        <span style={{ fontFamily: 'var(--it-font-mono)', fontSize: '13px' }}>{s.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      accessor: (s: Store) => s.name,
    },
    {
      key: 'address',
      header: 'Address',
      accessor: (s: Store) => s.address,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (s: Store) => (s.is_active ? 'Active' : 'Inactive'),
      render: (s: Store) => (
        <Badge
          status={s.is_active ? 'ACTIVE' : 'INACTIVE'}
          label={s.is_active ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (s: Store) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditStore(s)}
            data-testid={`edit-store-btn-${s.id}`}
          >
            <Edit2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleStore(s)}
            data-testid={`toggle-store-btn-${s.id}`}
          >
            <Power size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRegisterDevice(s.id)}
            data-testid={`register-device-btn-${s.id}`}
          >
            <Smartphone size={14} />
          </Button>
        </div>
      ),
      accessor: (s: Store) => s.id,
    },
  ];

  return (
    <div className="settings-view" data-testid="settings-view">
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Settings size={24} color="var(--it-green)" />
          <div>
            <h2 className="view-title">System Settings</h2>
            <p className="view-subtitle">Device configuration, sync rules, and store parameters</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Current User */}
        {currentUser && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: 'var(--it-green-surface)',
                  border: '1px solid var(--it-green-border)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <User size={20} color="var(--it-green-text)" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                  {currentUser.full_name ?? currentUser.username}
                </h3>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--it-text-secondary)',
                    marginTop: '2px',
                    fontFamily: 'var(--it-font-mono)',
                  }}
                >
                  @{currentUser.username}
                </p>
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Badge status="SENT" label={currentUser.role} />
                  {currentUser.assigned_store_id && (
                    <Badge status="ACTIVE" label={`Store: ${currentUser.assigned_store_id}`} />
                  )}
                  {currentUser.token_expired_offline && (
                    <Badge status="INACTIVE" label="Session expired (offline)" />
                  )}
                </div>
              </div>
              {onLogout && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleLogout}
                  loading={loggingOut}
                  data-testid="logout-btn"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Store Management */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Store Management
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                Add, edit, and manage store locations
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddStore}
              data-testid="add-store-btn"
            >
              <Plus size={14} />
              <span>Add Store</span>
            </Button>
          </div>

          {storesLoading ? (
            <EmptyState
              variant="loading"
              heading="Loading stores..."
              body="Fetching store data from local database"
            />
          ) : storesError ? (
            <EmptyState
              variant="error"
              heading="Failed to load stores"
              body={storesError}
              action={
                <Button variant="primary" onClick={fetchStores}>
                  Retry
                </Button>
              }
            />
          ) : stores.length === 0 ? (
            <EmptyState heading="No stores configured" body="Add your first store to get started" />
          ) : (
            <DataTable
              columns={storeColumns}
              rows={stores}
              rowKey={(s) => s.id}
              data-testid="stores-table"
            />
          )}
        </Card>

        {/* Theme */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Interface Theme
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                Toggle between light and dark presentation modes.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </Card>

        {/* System info */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Settings size={24} color="var(--it-text-secondary)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                System Information
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                invenTory v1.1.0 — Desktop Tauri client. SQLite local engine. Authentication:
                FastAPI JWT (Bearer transport).
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Store Modal */}
      <Modal
        isOpen={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
        title={storeModalMode === 'create' ? 'Create New Store' : 'Edit Store Location'}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          data-testid="store-modal"
        >
          {storeModalError && (
            <div
              style={{ color: 'var(--it-red-text)', fontSize: '13px' }}
              data-testid="store-modal-error"
            >
              {storeModalError}
            </div>
          )}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '4px',
                color: 'var(--it-text-primary)',
              }}
            >
              Store Code
            </label>
            <input
              type="text"
              value={storeForm.code}
              onChange={(e) => setStoreForm({ ...storeForm, code: e.target.value })}
              disabled={storeModalMode === 'edit'}
              data-testid="store-code-input"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-sm)',
                fontSize: '14px',
                color: 'var(--it-text-primary)',
                backgroundColor: 'var(--it-card)',
                ...(storeModalMode === 'edit' ? { opacity: 0.6 } : {}),
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '4px',
                color: 'var(--it-text-primary)',
              }}
            >
              Store Name
            </label>
            <input
              type="text"
              value={storeForm.name}
              onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
              data-testid="store-name-input"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-sm)',
                fontSize: '14px',
                color: 'var(--it-text-primary)',
                backgroundColor: 'var(--it-card)',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '4px',
                color: 'var(--it-text-primary)',
              }}
            >
              Address
            </label>
            <input
              type="text"
              value={storeForm.address}
              onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
              data-testid="store-address-input"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-sm)',
                fontSize: '14px',
                color: 'var(--it-text-primary)',
                backgroundColor: 'var(--it-card)',
              }}
            />
          </div>
          <div
            style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}
          >
            <Button variant="ghost" onClick={() => setStoreModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleStoreModalSubmit}
              loading={storeModalSubmitting}
              data-testid="store-modal-submit"
            >
              {storeModalMode === 'create' ? 'Create Store' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Device Registration Modal */}
      <Modal
        isOpen={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        title="Register Device (FR-STORE-003 Stub)"
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          data-testid="device-modal"
        >
          <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)' }}>
            Register a new device for this store location.
          </p>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '4px',
                color: 'var(--it-text-primary)',
              }}
            >
              Device Name
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              data-testid="device-name-input"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--it-border)',
                borderRadius: 'var(--it-r-sm)',
                fontSize: '14px',
                color: 'var(--it-text-primary)',
                backgroundColor: 'var(--it-card)',
              }}
            />
          </div>
          <div
            style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}
          >
            <Button variant="ghost" onClick={() => setDeviceModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleDeviceModalSubmit}
              loading={deviceModalSubmitting}
              data-testid="device-modal-submit"
            >
              Register Device
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
