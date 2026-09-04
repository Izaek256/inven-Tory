/**
 * UsersView — Admin-only user management for the web dashboard.
 *
 * Wires to:
 *   GET    /api/v1/auth/users        (list)
 *   POST   /api/v1/auth/register     (create — requires GLOBAL_ADMIN, AT-011)
 *   PATCH  /api/v1/auth/users/:id    (update)
 *   DELETE /api/v1/auth/users/:id    (delete)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus, RefreshCw, Shield, Trash2, UserCog, Users } from 'lucide-react';
import {
  Badge,
  BadgeStatus,
  Button,
  Card,
  ColumnDef,
  DataTable,
  Modal,
  Select,
  Spinner,
  TextInput,
} from '@inven-tory/ui';
import {
  createUser as apiCreateUser,
  deleteUser as apiDeleteUser,
  listUsers,
  updateUser as apiUpdateUser,
} from '../services/dashboardService';
import type { UserCreate, UserRead, UserRole } from '../types/dashboard';

const ROLE_OPTIONS: { value: UserRole | string; label: string; hint: string }[] = [
  { value: 'GLOBAL_ADMIN', label: 'Global Admin', hint: 'Full system access' },
  { value: 'INVENTORY_MANAGER', label: 'Inventory Manager', hint: 'Cross-store inventory' },
  { value: 'STORE_MANAGER', label: 'Store Manager', hint: 'Single-store management' },
  { value: 'STORE_CLERK', label: 'Store Clerk', hint: 'Counter + stock ops' },
  { value: 'AUDITOR', label: 'Auditor', hint: 'Read-only audits' },
  { value: 'SYNC', label: 'Sync Service', hint: 'Device sync worker' },
];

const ROLE_BADGE_VARIANT: Record<string, BadgeStatus> = {
  GLOBAL_ADMIN: 'CANCELLED',
  INVENTORY_MANAGER: 'STALE',
  STORE_MANAGER: 'RECENT',
  STORE_CLERK: 'FRESH',
  AUDITOR: 'TRANSFER',
  SYNC: 'TRANSFER',
};

interface UsersViewProps {
  currentUserRole?: string;
}

export function UsersView({ currentUserRole }: UsersViewProps): React.ReactElement {
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserRead | null>(null);

  const isAdmin = currentUserRole === 'GLOBAL_ADMIN';

  const loadUsers = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await listUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === 'Failed to fetch' ? 'Cannot reach API server.' : msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreate = useCallback(
    async (payload: UserCreate): Promise<void> => {
      setError(null);
      setSuccess(null);
      try {
        const created = await apiCreateUser(payload);
        setSuccess(`User "${created.username}" created.`);
        setCreateOpen(false);
        await loadUsers(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg === 'Failed to fetch' ? 'Cannot reach API server.' : msg);
      }
    },
    [loadUsers],
  );

  const handleToggleActive = useCallback(
    async (user: UserRead): Promise<void> => {
      setError(null);
      setSuccess(null);
      try {
        await apiUpdateUser(user.id, { is_active: !user.is_active });
        setSuccess(`User "${user.username}" ${user.is_active ? 'deactivated' : 're-activated'}.`);
        await loadUsers(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg === 'Failed to fetch' ? 'Cannot reach API server.' : msg);
      }
    },
    [loadUsers],
  );

  const handleEditSave = useCallback(
    async (
      id: number,
      patch: Partial<Pick<UserRead, 'full_name' | 'role' | 'assigned_store_id'>>,
    ): Promise<void> => {
      setError(null);
      setSuccess(null);
      try {
        await apiUpdateUser(id, patch);
        setEditing(null);
        setSuccess('User updated.');
        await loadUsers(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg === 'Failed to fetch' ? 'Cannot reach API server.' : msg);
      }
    },
    [loadUsers],
  );

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!confirmDelete) return;
    setError(null);
    setSuccess(null);
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await apiDeleteUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      setSuccess(`User "${target.username}" deleted.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === 'Failed to fetch' ? 'Cannot reach API server.' : msg);
    }
  }, [confirmDelete]);

  const columns: ColumnDef<any>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', width: '60px' },
      { key: 'username', header: 'Username' },
      { key: 'full_name', header: 'Full Name' },
      { key: 'email', header: 'Email' },
      { key: 'role', header: 'Role' },
      { key: 'assigned_store_id', header: 'Store' },
      { key: 'is_active', header: 'Status' },
      { key: 'created_at', header: 'Created' },
      { key: 'actions', header: 'Actions', width: '160px' },
    ],
    [],
  );

  const rows = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        username: <code style={{ fontFamily: 'var(--it-font-mono)' }}>{u.username}</code>,
        full_name: u.full_name ?? <span style={{ color: 'var(--it-text-tertiary)' }}>—</span>,
        email: u.email,
        role: (
          <Badge
            status={ROLE_BADGE_VARIANT[u.role] ?? 'TRANSFER'}
            label={
              ROLE_OPTIONS.find((r) => r.value === u.role)?.label ??
              String(u.role)
                .replace(/_/g, ' ')
                .toLowerCase()
                .replace(/\b\w/g, (c) => c.toUpperCase())
            }
          />
        ),
        assigned_store_id: u.assigned_store_id ? (
          <code style={{ fontFamily: 'var(--it-font-mono)', fontSize: '12px' }}>
            {u.assigned_store_id}
          </code>
        ) : (
          <span style={{ color: 'var(--it-text-tertiary)' }}>global</span>
        ),
        is_active: (
          <Badge
            status={u.is_active ? 'ACTIVE' : 'INACTIVE'}
            label={u.is_active ? 'Active' : 'Deactivated'}
          />
        ),
        created_at: new Date(u.created_at).toLocaleDateString(),
        actions: isAdmin ? (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(u)}
              title="Edit user"
              data-testid={`user-edit-${u.id}`}
            >
              <UserCog size={14} />
            </Button>
            <Button
              size="sm"
              variant={u.is_active ? 'secondary' : 'primary'}
              onClick={() => void handleToggleActive(u)}
              title={u.is_active ? 'Deactivate' : 'Re-activate'}
              data-testid={`user-toggle-${u.id}`}
            >
              <Shield size={14} />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmDelete(u)}
              title="Delete user"
              data-testid={`user-delete-${u.id}`}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ) : null,
      })),
    [users, isAdmin, handleToggleActive],
  );

  return (
    <div className="web-view" data-testid="users-view">
      <div className="web-view-header">
        <div>
          <h2 className="web-view-title">
            <Users size={18} aria-hidden="true" /> User Management
          </h2>
          <p className="web-view-subtitle">
            {isAdmin
              ? 'Create, edit, and deactivate system users.'
              : 'View registered users (read-only).'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadUsers()}
            disabled={loading}
            data-testid="users-refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </Button>
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="users-create-btn"
            >
              <Plus size={14} />
              New User
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="it-toast it-toast--error"
          style={{ marginBottom: '16px' }}
          role="alert"
          data-testid="users-error"
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          className="it-toast it-toast--success"
          style={{ marginBottom: '16px' }}
          role="status"
          data-testid="users-success"
        >
          {success}
        </div>
      )}

      <Card>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Spinner />
            <div style={{ marginTop: '12px', color: 'var(--it-text-secondary)' }}>
              Loading users…
            </div>
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Users
              size={36}
              aria-hidden="true"
              style={{ color: 'var(--it-text-tertiary)', marginBottom: '8px' }}
            />
            <div style={{ fontWeight: 600 }}>No users yet</div>
            <div style={{ color: 'var(--it-text-secondary)', marginTop: '4px' }}>
              {isAdmin
                ? 'Click "New User" to create the first account.'
                : 'Contact your administrator.'}
            </div>
          </div>
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} data-testid="users-table" />
        )}
      </Card>

      {createOpen && (
        <CreateUserModal onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />
      )}

      {editing && (
        <EditUserModal user={editing} onClose={() => setEditing(null)} onSubmit={handleEditSave} />
      )}

      {confirmDelete && (
        <Modal
          isOpen
          title="Delete user?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDelete()}
                data-testid="confirm-delete-btn"
              >
                Delete
              </Button>
            </>
          }
          data-testid="delete-user-modal"
        >
          <p>
            Permanently delete user{' '}
            <strong>
              {confirmDelete.username} ({confirmDelete.full_name ?? confirmDelete.email})
            </strong>
            ? This cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// Create User Modal
// ============================================================================

interface CreateModalProps {
  onClose: () => void;
  onSubmit: (payload: UserCreate) => Promise<void>;
}

function CreateUserModal({ onClose, onSubmit }: CreateModalProps): React.ReactElement {
  const [form, setForm] = useState<UserCreate>({
    username: '',
    email: '',
    password: '',
    full_name: null,
    role: 'STORE_CLERK',
    assigned_store_id: null,
  });
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const update = <K extends keyof UserCreate>(k: K, v: UserCreate[K]): void =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = (): string | null => {
    if (!form.username.trim()) return 'Username is required.';
    if (!form.email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Invalid email format.';
    if (!form.password || form.password.length < 8) return 'Password must be >= 8 characters.';
    if (form.password !== passwordConfirm) return 'Passwords do not match.';
    return null;
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormErr(err);
      return;
    }
    setFormErr(null);
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        username: form.username.trim(),
        email: form.email.trim(),
        full_name: form.full_name?.trim() || null,
        assigned_store_id: form.assigned_store_id?.trim() || null,
      });
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      title="Create New User"
      onClose={onClose}
      data-testid="create-user-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-user-form" loading={submitting}>
            Create User
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <TextInput
            label="Username *"
            value={form.username}
            onChange={(e) => update('username', e.target.value)}
            autoComplete="username"
            required
            data-testid="cu-username"
          />
          <TextInput
            label="Full name"
            value={form.full_name ?? ''}
            onChange={(e) => update('full_name', e.target.value)}
            autoComplete="name"
            data-testid="cu-fullname"
          />
        </div>
        <div style={{ marginTop: '12px' }}>
          <TextInput
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            autoComplete="email"
            required
            data-testid="cu-email"
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginTop: '12px',
          }}
        >
          <TextInput
            label="Password *"
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            autoComplete="new-password"
            hint="Min 8 characters."
            required
            data-testid="cu-password"
          />
          <TextInput
            label="Confirm password *"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            required
            data-testid="cu-password2"
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginTop: '12px',
          }}
        >
          <Select
            label="Role"
            value={form.role ?? 'STORE_CLERK'}
            onChange={(e) => update('role', e.target.value)}
            options={ROLE_OPTIONS.map((r) => ({
              value: r.value,
              label: `${r.label} — ${r.hint}`,
            }))}
            data-testid="cu-role"
          />
          <TextInput
            label="Assigned Store ID"
            value={form.assigned_store_id ?? ''}
            onChange={(e) => update('assigned_store_id', e.target.value)}
            hint="Blank for global roles (GLOBAL_ADMIN, AUDITOR)."
            placeholder="e.g. STORE-MAIN"
            data-testid="cu-store"
          />
        </div>
        {formErr && (
          <div
            className="it-toast it-toast--error"
            style={{ marginTop: '16px' }}
            role="alert"
            data-testid="cu-error"
          >
            <AlertCircle size={14} />
            <span>{formErr}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ============================================================================
// Edit User Modal
// ============================================================================

interface EditModalProps {
  user: UserRead;
  onClose: () => void;
  onSubmit: (
    id: number,
    patch: Partial<Pick<UserRead, 'full_name' | 'role' | 'assigned_store_id'>>,
  ) => Promise<void>;
}

function EditUserModal({ user, onClose, onSubmit }: EditModalProps): React.ReactElement {
  const [fullName, setFullName] = useState(user.full_name ?? '');
  const [role, setRole] = useState(user.role);
  const [storeId, setStoreId] = useState(user.assigned_store_id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setFormErr(null);
    setSubmitting(true);
    try {
      await onSubmit(user.id, {
        full_name: fullName.trim() || null,
        role,
        assigned_store_id: storeId.trim() || null,
      });
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      title={`Edit user: ${user.username}`}
      onClose={onClose}
      data-testid="edit-user-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-user-form" loading={submitting}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={submit} noValidate>
        <div style={{ marginBottom: '12px' }}>
          <TextInput
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            data-testid="eu-fullname"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={ROLE_OPTIONS.map((r) => ({
              value: r.value,
              label: `${r.label} — ${r.hint}`,
            }))}
            data-testid="eu-role"
          />
          <TextInput
            label="Assigned Store ID"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            hint="Blank = global (no store)"
            placeholder="e.g. STORE-MAIN"
            data-testid="eu-store"
          />
        </div>
        {formErr && (
          <div className="it-toast it-toast--error" style={{ marginTop: '16px' }} role="alert">
            <AlertCircle size={14} />
            <span>{formErr}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}

export default UsersView;
