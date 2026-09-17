/**
 * SettingsView.
 *
 * Displays device configuration, theme, current user identity, store management,
 * app update checker, delete all data, and backup/restore functionality.
 * The logout button calls tauriAuthService.logout() which clears
 * the secure token cache and returns to the login screen.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  LogOut,
  User,
  Plus,
  Edit2,
  Power,
  Smartphone,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
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
import {
  deleteAllData,
  wipeServerData,
  listLocalBackups,
  createLocalBackup,
  restoreFromBackup,
  type BackupInfo,
} from '../services/tauriDataService';
import { useUpdater } from '../context/UpdaterContext';

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

  // Updater state from context
  const { updateInfo, progress, isDownloading, checkForUpdates, startUpdate } = useUpdater();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Delete all data state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmStoreName, setDeleteConfirmStoreName] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Backup/restore state
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

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

  const fetchBackups = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const data = await listLocalBackups();
      setBackups(data);
    } catch {
      setBackups([]);
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStores();
    void fetchBackups();
  }, [fetchStores, fetchBackups]);

  const handleLogout = async (): Promise<void> => {
    if (!onLogout) return;
    setLoggingOut(true);
    try {
      onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  // ── Store handlers ───────────────────────────────────────────────────

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
    } catch {
      // non-fatal
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
    } catch {
      // non-fatal
    } finally {
      setDeviceModalSubmitting(false);
    }
  };

  // ── App update handlers ──────────────────────────────────────────────

  const handleCheckUpdate = async (): Promise<void> => {
    setCheckingUpdate(true);
    try {
      await checkForUpdates();
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async (): Promise<void> => {
    await startUpdate();
  };

  // ── Delete all data handlers ─────────────────────────────────────────

  const handleDeleteAllData = async (): Promise<void> => {
    if (!currentUser) return;
    setDeleteError(null);
    setDeleteLoading(true);

    try {
      // First wipe local data
      const localResult = await deleteAllData(deleteConfirmStoreName);
      if (!localResult.success) {
        setDeleteError(localResult.message);
        setDeleteLoading(false);
        return;
      }

      // Then try to wipe server data (best effort)
      try {
        const { getAccessToken } = await import('../services/tauriAuthService');
        const token = await getAccessToken();
        if (token) {
          await wipeServerData(deleteConfirmStoreName, token);
        }
      } catch {
        // Server wipe is best-effort; local wipe is the critical path
      }

      setDeleteModalOpen(false);
      setDeleteConfirmStoreName('');
      // Reload the page to reset all state
      window.location.reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Backup/restore handlers ──────────────────────────────────────────

  const handleCreateBackup = async (): Promise<void> => {
    setCreatingBackup(true);
    try {
      await createLocalBackup();
      await fetchBackups();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create backup:', err);
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string): Promise<void> => {
    setRestoringBackup(filename);
    try {
      const result = await restoreFromBackup(filename);
      alert(result);
      window.location.reload();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to restore backup:', err);
      alert(`Restore failed: ${String(err)}`);
    } finally {
      setRestoringBackup(null);
    }
  };

  // ── Store columns ────────────────────────────────────────────────────

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

  const isAdmin = currentUser?.role === 'GLOBAL_ADMIN';

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

        {/* App Update Checker */}
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
              <RefreshCw size={20} color="var(--it-green-text)" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                App Updates
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                Check for, download, and install application updates independently of the server.
              </p>

              {updateInfo?.error && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px',
                    borderRadius: 'var(--it-r-sm)',
                    backgroundColor: 'var(--it-red-surface)',
                    border: '1px solid var(--it-red-border)',
                    color: 'var(--it-red-text)',
                    fontSize: '13px',
                  }}
                >
                  <XCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Update check failed: {updateInfo.error}
                </div>
              )}

              {!updateInfo?.error && !updateInfo?.available && checkingUpdate === false && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px',
                    borderRadius: 'var(--it-r-sm)',
                    backgroundColor: 'var(--it-green-surface)',
                    border: '1px solid var(--it-green-border)',
                    color: 'var(--it-green-text)',
                    fontSize: '13px',
                  }}
                >
                  <CheckCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Your app is up to date.
                </div>
              )}

              {updateInfo?.available && !isDownloading && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px',
                    borderRadius: 'var(--it-r-sm)',
                    backgroundColor: 'var(--it-yellow-surface)',
                    border: '1px solid var(--it-yellow-border)',
                    color: 'var(--it-yellow-text)',
                    fontSize: '13px',
                  }}
                >
                  <AlertTriangle
                    size={14}
                    style={{ marginRight: '6px', verticalAlign: 'middle' }}
                  />
                  Update available!
                  {updateInfo.version && (
                    <div style={{ marginTop: '4px', fontWeight: 600 }}>
                      Version {updateInfo.version} is available.
                    </div>
                  )}
                  {updateInfo.body && (
                    <div style={{ marginTop: '4px', opacity: 0.9 }}>{updateInfo.body}</div>
                  )}
                </div>
              )}

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCheckUpdate}
                  loading={checkingUpdate}
                  disabled={isDownloading}
                >
                  <RefreshCw size={14} />
                  <span>Check for Updates</span>
                </Button>
                {updateInfo?.available && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleDownloadUpdate}
                    loading={isDownloading}
                    disabled={checkingUpdate}
                  >
                    <Download size={14} />
                    <span>Download & Install</span>
                  </Button>
                )}
              </div>

              {/* Update Progress Bar */}
              {(isDownloading || progress.stage === 'installing') && (
                <div style={{ marginTop: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                      fontSize: '12px',
                      color: 'var(--it-text-secondary)',
                    }}
                  >
                    <span>
                      {progress.stage === 'installing' ? 'Installing...' : 'Downloading...'}
                    </span>
                    <span>{progress.total ? `${progress.percent}%` : ''}</span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: 'var(--it-border)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: progress.total ? `${progress.percent}%` : '100%',
                        height: '100%',
                        backgroundColor:
                          progress.stage === 'installing' ? 'var(--it-green)' : 'var(--it-primary)',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease',
                        ...(progress.stage !== 'installing' && !progress.total
                          ? {
                              animation: 'indeterminate 1.5s infinite linear',
                              width: '30%',
                            }
                          : {}),
                      }}
                    />
                  </div>
                  {progress.stage === 'installing' && (
                    <p
                      style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: 'var(--it-text-secondary)',
                      }}
                    >
                      Update installed. The app will restart momentarily...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Automatic Daily Backup */}
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
              <Upload size={20} color="var(--it-green-text)" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                Local Backup & Restore
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                A backup is created automatically once per day at midnight while the app is running.
                You can also create one at any time with the button below. Restore from a backup if
                data is lost or corrupted.
              </p>

              <div style={{ marginTop: '12px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCreateBackup}
                  loading={creatingBackup}
                  disabled={restoringBackup !== null}
                >
                  <Download size={14} />
                  <span>Create Backup Now</span>
                </Button>
              </div>

              {backupsLoading ? (
                <div
                  style={{
                    marginTop: '12px',
                    fontSize: '13px',
                    color: 'var(--it-text-secondary)',
                  }}
                >
                  Loading backups...
                </div>
              ) : backups.length === 0 ? (
                <div
                  style={{
                    marginTop: '12px',
                    fontSize: '13px',
                    color: 'var(--it-text-secondary)',
                  }}
                >
                  No backups found. Click "Create Backup Now" to create your first backup.
                </div>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <h4
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--it-text-primary)',
                      marginBottom: '8px',
                    }}
                  >
                    Recent Backups ({backups.length})
                  </h4>
                  <div
                    style={{
                      border: '1px solid var(--it-border)',
                      borderRadius: 'var(--it-r-sm)',
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {backups.map((backup) => (
                      <div
                        key={backup.filename}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--it-border)',
                          fontSize: '13px',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontFamily: 'var(--it-font-mono)',
                              color: 'var(--it-text-primary)',
                            }}
                          >
                            {backup.filename}
                          </div>
                          <div style={{ color: 'var(--it-text-secondary)', fontSize: '12px' }}>
                            {new Date(backup.created_at).toLocaleString()} ·{' '}
                            {(backup.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestoreBackup(backup.filename)}
                          loading={restoringBackup === backup.filename}
                          disabled={restoringBackup !== null && restoringBackup !== backup.filename}
                        >
                          <Upload size={14} />
                          <span>Restore</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Delete All Data — GLOBAL_ADMIN only */}
        {isAdmin && (
          <div style={{ border: '1px solid var(--it-red-border)', borderRadius: 'var(--it-r-md)' }}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'var(--it-red-surface)',
                    border: '1px solid var(--it-red-border)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={20} color="var(--it-red-text)" />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-red-text)' }}>
                    Danger Zone — Delete All Data
                  </h3>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--it-text-secondary)',
                      marginTop: '4px',
                    }}
                  >
                    Permanently wipe all products, stock records, transactions, day books, and
                    device registrations. This also wipes the same data on the server. User accounts
                    and authentication are preserved. This action is irreversible.
                  </p>
                  <div style={{ marginTop: '12px' }}>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setDeleteModalOpen(true);
                        setDeleteConfirmStoreName('');
                        setDeleteError(null);
                      }}
                    >
                      <Trash2 size={14} />
                      <span>Delete All Data</span>
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* System info */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Settings size={24} color="var(--it-text-secondary)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--it-text-primary)' }}>
                System Information
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', marginTop: '4px' }}>
                invenTory v1.1.0 — Desktop app. Works offline; your data stays on this device.
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

      {/* Delete All Data Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete All Data — Irreversible"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--it-r-sm)',
              backgroundColor: 'var(--it-red-surface)',
              border: '1px solid var(--it-red-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <AlertTriangle size={16} color="var(--it-red-text)" />
              <span style={{ fontWeight: 600, color: 'var(--it-red-text)', fontSize: '14px' }}>
                Warning: This action is irreversible
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)', margin: 0 }}>
              This will permanently delete:
            </p>
            <ul
              style={{
                fontSize: '13px',
                color: 'var(--it-text-secondary)',
                margin: '8px 0 0 0',
                paddingLeft: '20px',
              }}
            >
              <li>All products and categories</li>
              <li>All stock balances and inventory records</li>
              <li>All day books and transactions</li>
              <li>All transfers and device registrations</li>
            </ul>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--it-text-secondary)',
                margin: '8px 0 0 0',
              }}
            >
              User accounts and stores will be preserved for authentication.
            </p>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--it-text-primary)' }}>
            Type your store name to confirm deletion:
          </p>

          {deleteError && (
            <div style={{ color: 'var(--it-red-text)', fontSize: '13px' }}>{deleteError}</div>
          )}

          <input
            type="text"
            value={deleteConfirmStoreName}
            onChange={(e) => setDeleteConfirmStoreName(e.target.value)}
            placeholder="Enter store name..."
            data-testid="delete-confirm-input"
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

          <div
            style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}
          >
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllData}
              loading={deleteLoading}
              disabled={!deleteConfirmStoreName.trim()}
              data-testid="delete-confirm-btn"
            >
              <Trash2 size={14} />
              <span>Delete Everything</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
