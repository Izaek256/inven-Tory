/**
 * Dashboard API service — wraps the Issue 16 endpoints.
 *
 * FR-SRCH-001: global product search
 * FR-SRCH-002/003: per-store quantities and global total
 * FR-SRCH-004: movement history
 * FR-SRCH-005: last-sync timestamp per store (returned in StoreInventoryResponse)
 */

import { api } from './apiClient';
import type {
  ProductHistoryResponse,
  ProductInventoryResponse,
  ProductSearchResponse,
  StoreInventoryResponse,
  UserCreate,
  UserRead,
} from '../types/dashboard';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1').replace(
  /\/$/,
  '',
);

function _authHeader(): HeadersInit {
  const token =
    typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('it_access_token') ?? '') : '';
  return { Authorization: `Bearer ${token}` };
}

export async function searchProducts(query: string, limit = 50): Promise<ProductSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return api.get<ProductSearchResponse>(`/products/search?${params.toString()}`);
}

export async function getProductInventory(productId: string): Promise<ProductInventoryResponse> {
  return api.get<ProductInventoryResponse>(`/products/${productId}/inventory`);
}

export async function getProductHistory(
  productId: string,
  storeId?: string,
  limit = 100,
): Promise<ProductHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (storeId) params.set('store_id', storeId);
  return api.get<ProductHistoryResponse>(`/products/${productId}/history?${params.toString()}`);
}

export async function getStoreInventory(storeId: string): Promise<StoreInventoryResponse> {
  return api.get<StoreInventoryResponse>(`/stores/${storeId}/inventory`);
}

export async function login(
  username: string,
  password: string,
  deviceId: string,
): Promise<{ access_token: string; role: string }> {
  return api.post<{ access_token: string; role: string }>('/auth/login', {
    username,
    password,
    device_id: deviceId,
  });
}

// ---------------------------------------------------------------------------
// User management (GLOBAL_ADMIN only — AT-011)
// ---------------------------------------------------------------------------

/** List all users via FastAPI Users /auth/users. */
export async function listUsers(): Promise<UserRead[]> {
  return api.get<UserRead[]>('/auth/users');
}

/** Get a single user by ID. */
export async function getUser(userId: number): Promise<UserRead> {
  return api.get<UserRead>(`/auth/users/${userId}`);
}

/**
 * Create a new user via our custom admin-only /auth/register endpoint.
 * Requires caller role == GLOBAL_ADMIN.
 */
export async function createUser(payload: UserCreate): Promise<UserRead> {
  return api.post<UserRead>('/auth/register', {
    username: payload.username,
    email: payload.email,
    password: payload.password,
    full_name: payload.full_name ?? null,
    role: payload.role ?? 'STORE_CLERK',
    assigned_store_id: payload.assigned_store_id ?? null,
    is_active: true,
    is_superuser: payload.role === 'GLOBAL_ADMIN',
    is_verified: true,
  });
}

/** Patch an existing user (FastAPI Users PATCH /auth/users/{id}). */
export async function updateUser(
  userId: number,
  patch: Partial<Pick<UserRead, 'full_name' | 'role' | 'assigned_store_id' | 'is_active'>>,
): Promise<UserRead> {
  const resp = await fetch(`${BASE_URL}/auth/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ..._authHeader(),
    },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<UserRead>;
}

/** Delete a user (FastAPI Users DELETE /auth/users/{id}). */
export async function deleteUser(userId: number): Promise<void> {
  const resp = await fetch(`${BASE_URL}/auth/users/${userId}`, {
    method: 'DELETE',
    headers: _authHeader(),
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
}
