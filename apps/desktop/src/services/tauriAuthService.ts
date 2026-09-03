/**
 * tauriAuthService — Issue 25 auth consolidation.
 *
 * Responsibilities:
 *   - Post credentials to the central /api/v1/auth/login endpoint.
 *   - Cache the returned JWT securely via Tauri's store plugin
 *     (tauri-plugin-store writes to the OS-managed app data directory,
 *     not to the plain SQLite database).
 *   - Expose the current session (user, role, token) to all consumers.
 *   - Handle offline token expiry per Section 21:
 *       "Authentication expired → re-authenticate without deleting queued
 *       transactions."
 *     When the access token expires while offline, `token_expired_offline`
 *     is set; the outbox continues queuing but sync is blocked until
 *     re-authentication succeeds.
 *   - Provide `getAccessToken()` so tauriSyncService can attach auth headers.
 *
 * Storage key layout (Tauri Store, file: auth.dat):
 *   auth_session  — JSON-encoded AuthSession (includes token + profile)
 *
 * In non-Tauri environments (browser / Vitest) the module falls back to an
 * in-memory store so tests stay in-process.
 */

import { isTauriEnvironment } from './tauriStoreService';
import type { AuthSession, TokenResponse, UserRole } from '../types/auth';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Base URL of the central API. Injected from env or falls back to default in dev only. */
const API_BASE_URL: string =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) ||
  (import.meta.env.DEV ? 'http://localhost:8000/api/v1' : '');

const STORE_FILE = 'auth.dat';
const SESSION_KEY = 'auth_session';

// ---------------------------------------------------------------------------
// In-memory fallback for non-Tauri / test environments
// ---------------------------------------------------------------------------

let _memSession: AuthSession | null = null;

// ---------------------------------------------------------------------------
// Tauri secure storage helpers
// ---------------------------------------------------------------------------

async function _secureWrite(session: AuthSession): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      // Dynamic import so the module tree-shakes cleanly in web/test builds.
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: true });
      await store.set(SESSION_KEY, session);
      await store.save();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AuthService] Secure write failed, falling back to memory:', err);
      _memSession = session;
    }
  } else {
    _memSession = session;
  }
}

async function _secureRead(): Promise<AuthSession | null> {
  if (isTauriEnvironment()) {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: false });
      const val = await store.get<AuthSession>(SESSION_KEY);
      return val ?? null;
    } catch {
      return _memSession;
    }
  }
  return _memSession;
}

async function _secureClear(): Promise<void> {
  _memSession = null;
  if (isTauriEnvironment()) {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: true });
      await store.delete(SESSION_KEY);
      await store.save();
    } catch {
      // Best-effort; session already cleared from memory
    }
  }
}

// ---------------------------------------------------------------------------
// Token expiry helpers
// ---------------------------------------------------------------------------

/**
 * Parse the `exp` claim from a JWT without verifying the signature.
 * Verification is the server's job; the client only reads the claim to manage
 * the local token_expired_offline flag.
 */
function _parseTokenExpiry(token: string): Date | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp === 'number') {
      return new Date(payload.exp * 1000);
    }
  } catch {
    // Malformed token — treat as no expiry info
  }
  return null;
}

function _isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Authenticate — offline-first strategy:
 *
 * 1. Tauri app: invoke local_login Rust command (bcrypt against SQLite).
 *    Works with zero network. Background-upgrades to a real JWT when online.
 * 2. Dev browser (VITE_DEV_DEVICE_ID set, not Tauri): use a local mock
 *    session so the dev server never needs the API running.
 * 3. Production browser / API-only: POST to /api/v1/auth/login.
 */
export async function login(
  username: string,
  password: string,
  deviceId: string,
  apiBaseUrl?: string,
): Promise<AuthSession> {
  // ── 1. Tauri native app — local SQLite bcrypt check ───────────────────────
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const local = await invoke<{
        user_id: string;
        username: string;
        full_name: string | null;
        role: string;
        assigned_store_id: string | null;
      }>('local_login', { username, password });

      const offlineToken = `offline:${local.user_id}:${Date.now()}`;
      const expiresAt = new Date(Date.now() + 8 * 3600_000).toISOString();

      const session: AuthSession = {
        access_token: offlineToken,
        refresh_token: '',
        user_id: parseInt(local.user_id, 10) || 0,
        username: local.username,
        full_name: local.full_name,
        role: local.role as UserRole,
        assigned_store_id: local.assigned_store_id,
        expires_at: expiresAt,
        token_expired_offline: false,
      };

      await _secureWrite(session);
      // Background: try to get a real server JWT for sync
      void _tryUpgradeToServerToken(username, password, deviceId, apiBaseUrl, session);
      return session;
    } catch (localErr) {
      const msg = localErr instanceof Error ? localErr.message : String(localErr);
      if (!msg.includes('Offline login not available')) {
        throw localErr;
      }
      // pin_hash not set yet — fall through to API
    }
  }

  // ── 2. Real API login (production or web app) ─────────────────────────────
  return _apiLogin(username, password, deviceId, apiBaseUrl);
}

/**
 * Call the central API login endpoint and cache the resulting session.
 */
async function _apiLogin(
  username: string,
  password: string,
  deviceId: string,
  apiBaseUrl?: string,
): Promise<AuthSession> {
  const baseUrl = apiBaseUrl || API_BASE_URL;
  const resp = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, device_id: deviceId }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: resp.statusText }));
    const detail = (body as { detail?: string }).detail ?? resp.statusText;
    throw new Error(detail);
  }

  const data: TokenResponse = (await resp.json()) as TokenResponse;

  const expiryDate = _parseTokenExpiry(data.access_token);
  const expiresAt = expiryDate
    ? expiryDate.toISOString()
    : new Date(Date.now() + 3600_000).toISOString();

  const session: AuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user_id: data.user_id,
    username: data.username,
    full_name: data.full_name,
    role: data.role,
    assigned_store_id: data.assigned_store_id,
    expires_at: expiresAt,
    token_expired_offline: false,
  };

  await _secureWrite(session);
  return session;
}

/**
 * After a successful local login, attempt to upgrade to a real server session
 * in the background.  Replaces the offline sentinel token with a real JWT so
 * sync can work immediately.  Failures are silently ignored.
 */
async function _tryUpgradeToServerToken(
  username: string,
  password: string,
  deviceId: string,
  apiBaseUrl: string | undefined,
  currentSession: AuthSession,
): Promise<void> {
  try {
    const upgraded = await _apiLogin(username, password, deviceId, apiBaseUrl);
    // Merge: keep local profile data, replace token
    await _secureWrite({ ...currentSession, ...upgraded });
  } catch {
    // Network unavailable or server error — offline session stays as-is
  }
}

/**
 * Attempt to refresh the access token using the cached refresh token.
 *
 * Per Section 21 offline behavior:
 * - If the network is unavailable, set token_expired_offline = true.
 * - The outbox keeps queuing; sync attempts are blocked until this is cleared.
 * - Transactions already in the outbox are NEVER discarded.
 */
export async function tryRefreshToken(): Promise<AuthSession | null> {
  const session = await _secureRead();
  if (!session) return null;

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline) {
    // Mark token as expired-offline so the UI can prompt re-auth on reconnect,
    // without blocking local operations or discarding queued transactions.
    if (_isTokenExpired(session.expires_at)) {
      const updated: AuthSession = { ...session, token_expired_offline: true };
      await _secureWrite(updated);
      return updated;
    }
    return session;
  }

  try {
    const resp = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!resp.ok) {
      // Refresh token is invalid/expired — user must log in again
      const expired: AuthSession = { ...session, token_expired_offline: false };
      await _secureWrite(expired);
      return expired;
    }

    const data = (await resp.json()) as { access_token: string; role: string };
    const expiryDate = _parseTokenExpiry(data.access_token);
    const expiresAt = expiryDate
      ? expiryDate.toISOString()
      : new Date(Date.now() + 3600_000).toISOString();

    const refreshed: AuthSession = {
      ...session,
      access_token: data.access_token,
      role: data.role,
      expires_at: expiresAt,
      token_expired_offline: false,
    };

    await _secureWrite(refreshed);
    return refreshed;
  } catch {
    // Network error while trying to refresh — treat as offline
    if (_isTokenExpired(session.expires_at)) {
      const updated: AuthSession = { ...session, token_expired_offline: true };
      await _secureWrite(updated);
      return updated;
    }
    return session;
  }
}

/**
 * Clear the cached session.  The server's stateless JWT remains valid until
 * its exp claim; device revocation is the mechanism for immediate invalidation.
 */
export async function logout(): Promise<void> {
  const session = await _secureRead();
  if (session) {
    // Best-effort server notification (fire-and-forget)
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => undefined);
  }
  await _secureClear();
}

/**
 * Return the current cached session, or null if not authenticated.
 */
export async function getSession(): Promise<AuthSession | null> {
  return _secureRead();
}

/**
 * Return the current access token for use in API requests.
 *
 * Returns null when:
 *   - not logged in
 *   - token is expired AND we are offline (Section 21 offline behavior)
 *
 * The caller (tauriSyncService) must check for null and skip sync if
 * token_expired_offline is true — but must NOT drop pending transactions.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await _secureRead();
  if (!session) return null;

  // If online and token is expired, attempt a silent refresh
  if (_isTokenExpired(session.expires_at) && !session.token_expired_offline) {
    const refreshed = await tryRefreshToken();
    if (refreshed && !_isTokenExpired(refreshed.expires_at)) {
      return refreshed.access_token;
    }
    // Could not refresh — return null to block sync (but not local operations)
    return null;
  }

  // If token_expired_offline is set, block sync but don't error loudly
  if (session.token_expired_offline) {
    return null;
  }

  return session.access_token;
}

/**
 * True if the user has an active (non-expired) session.
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await _secureRead();
  if (!session) return false;
  // Allow expired-offline sessions — user is still "logged in" locally
  return !_isTokenExpired(session.expires_at) || session.token_expired_offline;
}

/**
 * Return the current user's role, or null if not authenticated.
 */
export async function getCurrentRole(): Promise<UserRole | null> {
  const session = await _secureRead();
  return (session?.role as UserRole) ?? null;
}

/**
 * True when the access token has expired while offline.
 * Sync must be blocked; local operations must continue.
 */
export async function isTokenExpiredOffline(): Promise<boolean> {
  const session = await _secureRead();
  return session?.token_expired_offline ?? false;
}

/**
 * Clear the token_expired_offline flag after successful re-authentication.
 * Called by the login flow after a successful online login.
 */
export async function clearOfflineExpiry(): Promise<void> {
  const session = await _secureRead();
  if (session?.token_expired_offline) {
    await _secureWrite({ ...session, token_expired_offline: false });
  }
}

// ---------------------------------------------------------------------------
// Mock helpers for Vitest
// ---------------------------------------------------------------------------

// @visibleForTesting
export function _setMemSession(session: AuthSession | null): void {
  _memSession = session;
}

// @visibleForTesting
export function _getMemSession(): AuthSession | null {
  return _memSession;
}
