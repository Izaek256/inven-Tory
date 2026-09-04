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

function _getApiBaseUrl(): string {
  const envBaseUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL
      : undefined;

  if (envBaseUrl) {
    return envBaseUrl;
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:8000/api/v1';
  }

  throw new Error('VITE_API_BASE_URL is not configured. Set it in your .env file.');
}

/** Base URL of the central API. Injected from env or falls back to default in dev only. */
const API_BASE_URL: string = _getApiBaseUrl();

const STORE_FILE = 'auth.dat';
const SESSION_KEY = 'auth_session';

// ---------------------------------------------------------------------------
// In-memory fallback for non-Tauri / test environments
// ---------------------------------------------------------------------------

let _memSession: AuthSession | null = null;

// @visibleForTesting
export function _setMemSession(session: AuthSession | null): void {
  _memSession = session;
}

// @visibleForTesting
export function _getMemSession(): AuthSession | null {
  return _memSession;
}

// ---------------------------------------------------------------------------
// Tauri secure storage helpers
// ---------------------------------------------------------------------------

async function _secureWrite(session: AuthSession): Promise<void> {
  // Always update in-memory cache first for immediate consistency
  _memSession = session;

  if (isTauriEnvironment()) {
    try {
      // Dynamic import so the module tree-shakes cleanly in web/test builds.
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: true });
      await store.set(SESSION_KEY, session);
      await store.save();
    } catch (err) {
      // _memSession is already set above
    }
  }
}

async function _secureRead(): Promise<AuthSession | null> {
  // Check in-memory cache first for immediate consistency
  if (_memSession) {
    return _memSession;
  }

  if (isTauriEnvironment()) {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: false });
      const val = await store.get<AuthSession>(SESSION_KEY);
      if (val) {
        // Cache the loaded value for future reads
        _memSession = val;
        return val;
      }
      return null;
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
 * 3. Production browser / API-only: POST to /api/v1/auth/login. If we are in
 *    Vite's *development* mode (not production) AND the server cannot be
 *    reached (fetch rejected, not a 401), fall back to a permissive local
 *    session matching the entered username so genesis-created credentials
 *    work without the API server online.
 */
export async function login(
  username: string,
  password: string,
  deviceId?: string,
  apiBaseUrl?: string,
): Promise<AuthSession> {
  // Normalize deviceId: use the passed value, otherwise fall back to a
  // stable default. App.tsx in the desktop shell always passes one, but
  // OfflineAuthBanner and other call sites may omit it in single-user mode.
  const resolvedDeviceId = (deviceId && deviceId.trim()) || 'SINGLE-USER-DEVICE';

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
        user_id: local.user_id,
        username: local.username,
        full_name: local.full_name,
        role: local.role as UserRole,
        assigned_store_id: local.assigned_store_id,
        expires_at: expiresAt,
        token_expired_offline: false,
      };

      await _secureWrite(session);

      // Fire upgrade in background without awaiting - login() resolves immediately
      void _tryUpgradeToServerToken(username, password, resolvedDeviceId, apiBaseUrl, session);
      return session;
    } catch (localErr) {
      const msg = localErr instanceof Error ? localErr.message : String(localErr);
      if (!msg.includes('Offline login not available')) {
        throw localErr;
      }
      // pin_hash not set yet — fall through to API
    }
  }

  // ── 2. Vite dev browser with DEV_DEVICE_ID set — skip the network ─────────
  // The desktop Vite dev server runs in a browser context where __TAURI_INTERNALS__
  // is absent. When VITE_DEV_DEVICE_ID is set we know we're in desktop-dev mode
  // and should not fire cross-origin preflight requests at the API.
  if (import.meta.env.VITE_DEV_DEVICE_ID) {
    return _devBrowserLogin(username, password);
  }

  // ── 3. Real API login (production or web app) ─────────────────────────────
  try {
    return await _apiLogin(username, password, resolvedDeviceId, apiBaseUrl);
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
    const isNetworkError =
      msg === 'Failed to fetch' ||
      msg.toLowerCase().includes('networkerror') ||
      /(cors|blocked|coud not|could not connect)/i.test(msg);
    const env =
      typeof import.meta !== 'undefined'
        ? ((import.meta as { env?: Record<string, string> }).env ?? {})
        : {};
    const inViteDev = Boolean(env.DEV) && env.MODE !== 'test';

    if (isNetworkError && inViteDev) {
      // API server is not running. Since we are in local Vite dev (desktop
      // preview, not the real web dashboard), accept any non-empty credentials
      // and return a local session so the genesis workflow works without the
      // API backend online.
      return _localSessionFromCredentials(username, password);
    }
    throw apiErr;
  }
}

/**
 * DEV-ONLY: browser-mode login for the desktop Vite dev server.
 * Only active when VITE_DEV_DEVICE_ID is set (apps/desktop/.env, gitignored).
 * Matches against the same credentials as the local SQLite seed so offline
 * dev works without cargo/Tauri compilation and without the API running.
 */
async function _devBrowserLogin(username: string, password: string): Promise<AuthSession> {
  const DEV_USERS: Record<string, { password: string; role: UserRole; full_name: string }> = {
    admin: {
      password: 'DevAdmin2026!',
      role: 'GLOBAL_ADMIN' as UserRole,
      full_name: 'System Administrator',
    },
    manager_alpha: {
      password: 'DevManager2026!',
      role: 'STORE_MANAGER' as UserRole,
      full_name: 'Alpha Store Manager',
    },
    clerk_alpha: {
      password: 'DevClerk2026!',
      role: 'STORE_CLERK' as UserRole,
      full_name: 'Alpha Clerk',
    },
  };

  const match = DEV_USERS[username.trim()];
  if (!match || match.password !== password) {
    throw new Error('Invalid username or password.');
  }

  const expiresAt = new Date(Date.now() + 8 * 3600_000).toISOString();
  const session: AuthSession = {
    access_token: `dev-offline:${username}:${Date.now()}`,
    refresh_token: '',
    user_id: 0,
    username: username.trim(),
    full_name: match.full_name,
    role: match.role,
    assigned_store_id: null,
    expires_at: expiresAt,
    token_expired_offline: false,
  };

  await _secureWrite(session);
  return session;
}

/**
 * Build a valid AuthSession from *any* username/password provided during
 * local Vite development mode when the central API is not reachable.
 *
 * This is the "genesis friendly" fallback: since the genesis script has
 * already set the user's real credentials in both databases, the desktop
 * Vite preview (which has no Tauri internals and cannot open the SQLite
 * file directly) still lets the developer sign in with the username and
 * password they chose during genesis rather than forcing the hardcoded
 * DEV_USERS list.
 *
 * ONLY used as a network-error fallback inside Vite DEV builds; production
 * builds always go through _apiLogin or the Rust local_login command.
 */
async function _localSessionFromCredentials(
  username: string,
  password: string,
): Promise<AuthSession> {
  const cleanUser = username.trim();
  if (!cleanUser || !password) {
    throw new Error('Invalid username or password.');
  }

  const expiresAt = new Date(Date.now() + 8 * 3600_000).toISOString();
  const session: AuthSession = {
    access_token: `dev-local:${cleanUser}:${Date.now()}`,
    refresh_token: '',
    user_id: 1,
    username: cleanUser,
    full_name: cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1),
    role: 'GLOBAL_ADMIN' as UserRole,
    assigned_store_id: null,
    expires_at: expiresAt,
    token_expired_offline: false,
  };

  await _secureWrite(session);
  return session;
}

/**
 * Call the central API login endpoint and cache the resulting session.
 */
async function _apiLogin(
  username: string,
  password: string,
  deviceId: string,
  apiBaseUrl?: string,
  timeoutMs: number = 60000,
): Promise<AuthSession> {
  const baseUrl = apiBaseUrl || API_BASE_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, device_id: deviceId }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: resp.statusText }));
    const detail = (body as { detail?: string }).detail ?? resp.statusText;
    // eslint-disable-next-line no-console
    console.error('[AuthService] API LOGIN FAILED - Status:', resp.status, 'Detail:', detail);
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
): Promise<AuthSession | null> {
  try {
    const resolvedApiBaseUrl = apiBaseUrl || API_BASE_URL;

    // Check if we're online first
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (!isOnline) {
      return null;
    }

    // Test basic connectivity first - short-circuit on failure
    try {
      const healthCheck = await fetch(`${resolvedApiBaseUrl.replace('/api/v1', '')}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      if (!healthCheck.ok) {
        return null;
      }
    } catch (healthErr) {
      // eslint-disable-next-line no-console
      console.error('[AuthService] Health check failed, skipping upgrade this cycle:', healthErr);
      return null;
    }

    const upgraded = await _apiLogin(username, password, deviceId, resolvedApiBaseUrl, 15000);
    // Merge: keep local profile data, replace token
    const mergedSession = { ...currentSession, ...upgraded };
    await _secureWrite(mergedSession);

    // Trigger a sync after successful token upgrade
    try {
      const { triggerSync } = await import('./tauriSyncService');
      void triggerSync({ apiBaseUrl: resolvedApiBaseUrl, force: true });
    } catch (syncErr) {
      // eslint-disable-next-line no-console
      console.error('[AuthService] Failed to trigger sync after upgrade:', syncErr);
    }

    return mergedSession;
  } catch (err) {
    // Network unavailable or server error — offline session stays as-is
    // eslint-disable-next-line no-console
    console.error('[AuthService] TOKEN UPGRADE FAILED:', err);
    return null;
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

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // Offline sentinel tokens cannot be validated by central API JWT middleware.
  // The background upgrade in login() handles this - don't interfere here.
  // Return null to let sync wait for the background upgrade to complete.
  if (
    session.access_token.startsWith('offline:') ||
    session.access_token.startsWith('dev-offline:') ||
    session.access_token.startsWith('dev-local:')
  ) {
    return null;
  }

  // If online and token is expired, attempt a silent refresh
  if (_isTokenExpired(session.expires_at) && !session.token_expired_offline) {
    if (isOnline) {
      const refreshed = await tryRefreshToken();
      if (refreshed && !_isTokenExpired(refreshed.expires_at)) {
        return refreshed.access_token;
      }
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
