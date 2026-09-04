/**
 * Authentication types for Issue 25.
 *
 * These types mirror the Pydantic schemas in services/api/app/api/v1/auth.py.
 * JWT transport: Bearer tokens stored in Tauri secure storage.
 */

/** Response from POST /api/v1/auth/login */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  role: string;
  user_id: string | number;
  username: string;
  full_name: string | null;
  assigned_store_id: string | null;
}

/** Response from POST /api/v1/auth/refresh */
export interface AccessTokenResponse {
  access_token: string;
  token_type: 'bearer';
  role: string;
}

/** Response from GET /api/v1/auth/me */
export interface UserProfile {
  id: string | number;
  username: string;
  email: string | null;
  full_name: string | null;
  role: string;
  assigned_store_id: string | null;
  is_active: boolean;
}

/**
 * Locally-cached auth session.
 *
 * Stored in Tauri's secure storage (tauri-plugin-store) alongside the
 * device identity.  Never written to plain SQLite.
 *
 * Offline behavior (Section 21 / AT-021):
 * - token_expired_offline is set to true when the access token expires while
 *   the device is offline.  In this state the outbox keeps queuing and local
 *   operations continue; new sync attempts are blocked until re-auth.
 */
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  user_id: string | number;
  username: string;
  full_name: string | null;
  role: string;
  assigned_store_id: string | null;
  /** ISO timestamp when the access token expires */
  expires_at: string;
  /** True when the token expired while offline — blocks sync but not local ops */
  token_expired_offline: boolean;
}

/** Available SRS §4 roles */
export type UserRole =
  'GLOBAL_ADMIN' | 'INVENTORY_MANAGER' | 'STORE_MANAGER' | 'STORE_CLERK' | 'AUDITOR' | 'SYNC';
