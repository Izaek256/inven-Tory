/**
 * SettingsView — redesigned to match inven-Tory___Redesign.html v1.2.0 artifact (01:40:00).
 *
 * Layout follows artifact exactly:
 *   - grid-2 equal : user card (avatar + sign out) + Interface theme switch
 *   - sheet: Store management table
 *   - info-bar: App updates
 * Additional sheets (backup/restore, danger zone, system info) kept but styled as artifact sheets.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  LogOut,
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
import { Badge, Button, EmptyState, Modal, Skeleton, SkeletonTable } from '@invenTory/ui';
import { DataTable, type ColumnDef } from '@invenTory/ui';
import { useTheme } from '@invenTory/ui';
import type { AuthSession } from '../types/auth';
import { Store } from '../types/store';
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
  clearLocalBusinessCaches,
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

function initials(name?: string | null, username?: string | null): string {
  const src = (name || username || '??').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return src.slice(0, 2).toUpperCase();
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser, onLogout }) => {
  const [loggingOut, setLoggingOut] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [storeModalMode, setStoreModalMode] = useState<'create' | 'edit'>('create');
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeForm, setStoreForm] = useState({ code: '', name: '', address: '' });
  const [storeModalError, setStoreModalError] = useState<string | null>(null);
  const [storeModalSubmitting, setStoreModalSubmitting] = useState(false);

  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [deviceStoreId, setDeviceStoreId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [deviceModalSubmitting, setDeviceModalSubmitting] = useState(false);

  const { updateInfo, progress, isDownloading, checkForUpdates, startUpdate } = useUpdater();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion] = useState<string>(import.meta.env.VITE_APP_VERSION || '');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmStoreName, setDeleteConfirmStoreName] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

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
        await createStore({
          code: storeForm.code,
          name: storeForm.name,
          address: storeForm.address,
        });
      } else if (storeModalMode === 'edit' && editingStore) {
        await updateStore({
          id: editingStore.id,
          name: storeForm.name,
          address: storeForm.address,
        });
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
      // eslint-disable-next-line no-console
      console.error('Failed to toggle store:', err);
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
      // eslint-disable-next-line no-console
      console.error('Failed to register device:', err);
    } finally {
      setDeviceModalSubmitting(false);
    }
  };

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

  const handleDeleteAllData = async (): Promise<void> => {
    if (!currentUser) return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const localResult = await deleteAllData(deleteConfirmStoreName);
      if (!localResult.success) {
        setDeleteError(localResult.message);
        setDeleteLoading(false);
        return;
      }
      let serverWipeError: string | null = null;
      try {
        const { getAccessToken } = await import('../services/tauriAuthService');
        const token = await getAccessToken();
        if (token) {
          try {
            await wipeServerData(deleteConfirmStoreName, token);
          } catch (err) {
            serverWipeError = err instanceof Error ? err.message : String(err);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to wipe server data:', err);
      }
      if (serverWipeError) {
        setDeleteError(
          `Local data wiped, but server wipe failed: ${serverWipeError}. Server data was NOT deleted and would reappear after the next sync.`,
        );
        setDeleteLoading(false);
        return;
      }
      setDeleteModalOpen(false);
      setDeleteConfirmStoreName('');
      clearLocalBusinessCaches();
      window.location.reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteLoading(false);
    }
  };

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

  const storeColumns: ColumnDef<Store>[] = [
    {
      key: 'code',
      header: 'Code',
      accessor: (s: Store) => s.code,
      render: (s: Store) => (
        <span style={{ fontFamily: 'var(--it-font-mono)', fontSize: '13px' }}>{s.code}</span>
      ),
    },
    { key: 'name', header: 'Name', accessor: (s: Store) => s.name },
    { key: 'address', header: 'Address', accessor: (s: Store) => s.address },
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
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="icon-btn"
            title="Edit"
            onClick={() => handleEditStore(s)}
            data-testid={`edit-store-btn-${s.id}`}
            type="button"
          >
            <Edit2 size={14} />
          </button>
          <button
            className="icon-btn"
            title={s.is_active ? 'Deactivate' : 'Activate'}
            onClick={() => handleToggleStore(s)}
            data-testid={`toggle-store-btn-${s.id}`}
            type="button"
          >
            <Power size={14} />
          </button>
          <button
            className="icon-btn"
            title="Register device"
            onClick={() => handleRegisterDevice(s.id)}
            data-testid={`register-device-btn-${s.id}`}
            type="button"
          >
            <Smartphone size={14} />
          </button>
        </div>
      ),
      accessor: (s: Store) => s.id,
    },
  ];

  const isAdmin = currentUser?.role === 'GLOBAL_ADMIN';

  return (
    <div className="settings-view" data-testid="settings-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">System settings</h2>
          <p className="view-subtitle">Device configuration, sync rules, and store parameters</p>
        </div>
      </div>

      {/* ── Top row — artifact grid-2 equal: user card + theme toggle ── */}
      <div className="grid-2 equal">
        <div
          className="sheet"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div className="user-card">
            <div className="avatar">{initials(currentUser?.full_name, currentUser?.username)}</div>
            <div>
              <div className="uname">{currentUser?.full_name ?? currentUser?.username ?? '—'}</div>
              <div className="uhandle">@{currentUser?.username ?? 'unknown'}</div>
              <span className="tag teal">{currentUser?.role ?? '—'}</span>
            </div>
          </div>
          {onLogout && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleLogout}
              data-testid="logout-btn"
              type="button"
              disabled={loggingOut}
            >
              <LogOut size={14} />
              Sign out
            </button>
          )}
        </div>
        <div className="sheet" style={{ display: 'flex', alignItems: 'center' }}>
          <div className="toggle-row" style={{ width: '100%' }}>
            <div className="toggle-copy">
              <strong>Interface theme</strong>
              <span>Light or dark presentation</span>
            </div>
            <label className="switch" data-testid="theme-switch-label">
              <input
                type="checkbox"
                checked={isDark}
                onChange={toggleTheme}
                data-testid="theme-switch"
                aria-label="Toggle theme"
              />
              <span className="track" />
            </label>
          </div>
        </div>
      </div>

      {/* ── Store management — artifact sheet ── */}
      <div className="sheet" style={{ marginTop: 16 }}>
        <div className="sheet-head">
          <div>
            <h2>Store management</h2>
            <p>Add, edit, and manage store locations</p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAddStore}
            data-testid="add-store-btn"
            type="button"
          >
            <Plus size={14} /> Add store
          </button>
        </div>
        {storesLoading ? (
          <div role="status" aria-label="Loading stores">
            <SkeletonTable rows={4} columns={3} />
          </div>
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
      </div>

      {/* ── App updates — artifact info-bar ── */}
      <div className="info-bar" style={{ marginTop: 16 }}>
        <RefreshCw size={18} />
        <div className="ib-copy">
          <strong>App updates</strong>
          <span>Check for and install updates independently of the server</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleCheckUpdate}
            type="button"
            disabled={checkingUpdate || isDownloading}
          >
            {checkingUpdate ? 'Checking…' : 'Check for updates'}
          </button>
          {updateInfo?.available && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDownloadUpdate}
              type="button"
              disabled={isDownloading}
            >
              <Download size={14} /> Download & Install
            </button>
          )}
        </div>
      </div>

      {/* Update status lines (kept but inside sheet for artifact flatness) */}
      {(updateInfo?.error ||
        updateInfo?.available ||
        isDownloading ||
        progress.stage === 'installing' ||
        !updateInfo?.available) && (
        <div className="sheet" style={{ marginTop: 12, padding: 12 }}>
          {updateInfo?.error && (
            <div
              style={{
                padding: 10,
                background: 'var(--red-tint)',
                border: '1px solid var(--it-red-border)',
                color: 'var(--red)',
                fontSize: 13,
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <XCircle size={14} /> Update check failed: {updateInfo.error}
            </div>
          )}
          {!updateInfo?.error && updateInfo?.available && !isDownloading && (
            <div
              style={{
                padding: 10,
                background: 'var(--amber-tint)',
                border: '1px solid var(--amber)',
                color: 'var(--amber-ink)',
                fontSize: 13,
              }}
            >
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={14} /> Update available!
                {updateInfo.version ? ` Version ${updateInfo.version} is available.` : ''}
              </span>
              {updateInfo.body && (
                <div style={{ marginTop: 4, opacity: 0.9 }}>{updateInfo.body}</div>
              )}
            </div>
          )}
          {!updateInfo?.error &&
            !updateInfo?.available &&
            !checkingUpdate &&
            !isDownloading &&
            progress.stage !== 'installing' && (
              <div
                style={{
                  padding: 10,
                  background: 'var(--green-tint)',
                  border: '1px solid var(--green)',
                  color: 'var(--green)',
                  fontSize: 13,
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <CheckCircle size={14} /> Your app is up to date.
              </div>
            )}
          {(isDownloading || progress.stage === 'installing') && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  fontSize: 12,
                  color: 'var(--it-text-secondary)',
                }}
              >
                <span>{progress.stage === 'installing' ? 'Installing…' : 'Downloading…'}</span>
                <span>{progress.total ? `${progress.percent}%` : ''}</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 6,
                  background: 'var(--it-border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: progress.total ? `${progress.percent}%` : '100%',
                    height: '100%',
                    background: progress.stage === 'installing' ? 'var(--green)' : 'var(--amber)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              {progress.stage === 'installing' && (
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--it-text-secondary)' }}>
                  Update installed. The app will restart momentarily…
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Backup & Restore — kept as sheet to stay consistent */}
      <div className="sheet" style={{ marginTop: 16 }}>
        <div className="sheet-head">
          <div>
            <h2>Local backup &amp; restore</h2>
            <p>
              A backup is created automatically once per day at midnight. Create one manually below.
            </p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleCreateBackup}
            disabled={creatingBackup || restoringBackup !== null}
            type="button"
          >
            <Download size={14} /> {creatingBackup ? 'Creating…' : 'Create Backup Now'}
          </button>
        </div>
        {backupsLoading ? (
          <div role="status" aria-label="Loading backups">
            <Skeleton height={14} width="100%" count={3} />
          </div>
        ) : backups.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: 'var(--it-text-secondary)',
              border: '1px dashed var(--line-strong)',
              padding: 16,
              textAlign: 'center',
            }}
          >
            No backups found.
          </div>
        ) : (
          <div style={{ border: '1px solid var(--it-border)', maxHeight: 200, overflowY: 'auto' }}>
            {backups.map((b) => (
              <div
                key={b.filename}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--it-border)',
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontFamily: 'var(--it-font-mono)' }}>{b.filename}</div>
                  <div style={{ color: 'var(--it-text-secondary)', fontSize: 12 }}>
                    {new Date(b.created_at).toLocaleString()} · {(b.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleRestoreBackup(b.filename)}
                  disabled={restoringBackup !== null}
                  type="button"
                >
                  <Upload size={14} /> Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="sheet" style={{ marginTop: 16, borderColor: 'var(--red)', borderWidth: 1 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 40,
                height: 40,
                background: 'var(--red-tint)',
                border: '1px solid var(--red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Trash2 size={18} color="var(--red)" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', margin: 0 }}>
                Danger Zone — Delete All Data
              </h3>
              <p style={{ fontSize: 13, color: 'var(--it-text-secondary)', margin: '4px 0 0' }}>
                Permanently wipe products, stock records, transactions, day books, and device
                registrations. User accounts are preserved.
              </p>
              <button
                className="btn btn-danger btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setDeleteModalOpen(true);
                  setDeleteConfirmStoreName('');
                  setDeleteError(null);
                }}
                type="button"
              >
                <Trash2 size={14} /> Delete All Data
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="sheet"
        style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'center' }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            background: 'var(--it-bg)',
            border: '1px solid var(--it-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <RefreshCw size={16} color="var(--it-text-secondary)" />
        </div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>System Information</h3>
          <p style={{ fontSize: 13, color: 'var(--it-text-secondary)', margin: '2px 0 0' }}>
            invenTory v{appVersion} — Desktop app. Works offline; your data stays on this device.
          </p>
        </div>
      </div>

      <Modal
        isOpen={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
        title={storeModalMode === 'create' ? 'Create New Store' : 'Edit Store Location'}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          data-testid="store-modal"
        >
          {storeModalError && (
            <div style={{ color: 'var(--red)', fontSize: 13 }} data-testid="store-modal-error">
              {storeModalError}
            </div>
          )}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
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
                fontSize: 14,
                background: 'var(--it-card)',
                color: 'var(--it-text-primary)',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
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
                fontSize: 14,
                background: 'var(--it-card)',
                color: 'var(--it-text-primary)',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
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
                fontSize: 14,
                background: 'var(--it-card)',
                color: 'var(--it-text-primary)',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
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

      <Modal
        isOpen={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        title="Register Device (FR-STORE-003 Stub)"
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          data-testid="device-modal"
        >
          <p style={{ fontSize: 13, color: 'var(--it-text-secondary)' }}>
            Register a new device for this store location.
          </p>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
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
                fontSize: 14,
                background: 'var(--it-card)',
                color: 'var(--it-text-primary)',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
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

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete All Data — Irreversible"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{ padding: 16, background: 'var(--red-tint)', border: '1px solid var(--red)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={16} color="var(--red)" />
              <span style={{ fontWeight: 600, color: 'var(--red)', fontSize: 14 }}>
                Warning: This action is irreversible
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--it-text-secondary)', margin: 0 }}>
              This will permanently delete products, stock, transactions, day books, and device
              registrations. User accounts and stores are preserved.
            </p>
          </div>
          <p style={{ fontSize: 13, color: 'var(--it-text-primary)' }}>
            Type your store name to confirm deletion:
          </p>
          {deleteError && <div style={{ color: 'var(--red)', fontSize: 13 }}>{deleteError}</div>}
          <input
            type="text"
            value={deleteConfirmStoreName}
            onChange={(e) => setDeleteConfirmStoreName(e.target.value)}
            placeholder="Enter store name…"
            data-testid="delete-confirm-input"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--it-border)',
              fontSize: 14,
              background: 'var(--it-card)',
              color: 'var(--it-text-primary)',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
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
              <Trash2 size={14} /> Delete Everything
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
