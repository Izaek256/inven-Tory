/**
 * Tests for tauriAuthService — Issue 25.
 *
 * Coverage:
 *  - login: success stores session with correct fields.
 *  - login: network error surfaces as thrown Error.
 *  - getAccessToken: returns null when no session.
 *  - getAccessToken: returns token when session is valid (non-expired).
 *  - getAccessToken: returns null when token_expired_offline is true.
 *  - tryRefreshToken: offline + expired token sets token_expired_offline flag.
 *  - tryRefreshToken: online refresh success clears token_expired_offline.
 *  - isTokenExpiredOffline: reflects session flag.
 *  - logout: clears session.
 *
 * AT-021 / Section 21 offline behavior:
 *  - A queued transaction created while offline with an expired token is retained
 *    locally (outbox keeps queuing) and the sync is merely skipped — not the
 *    transaction.  This is verified in SyncService.test.tsx (offline branch).
 *    Here we verify that token_expired_offline is set correctly so the sync
 *    layer can make that decision.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _setMemSession,
  _getMemSession,
  getAccessToken,
  getCurrentRole,
  getSession,
  isAuthenticated,
  isTokenExpiredOffline,
  login,
  logout,
  tryRefreshToken,
} from '../services/tauriAuthService';
import type { AuthSession } from '../types/auth';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../services/tauriStoreService', () => ({
  isTauriEnvironment: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DEVICE_ID = 'DEV-TEST-001';

/** Build a valid session with non-expired token. */
function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    access_token:
      'header.eyJzdWIiOiIxIiwicm9sZSI6IlNUT1JFX01BTkFHRVIiLCJkZXZpY2VfaWQiOiJERVYtMSIsInR5cGUiOiJhY2Nlc3MiLCJleHAiOjk5OTk5OTk5OTl9.sig',
    refresh_token: 'header.eyJzdWIiOiIxIiwidHlwZSI6InJlZnJlc2giLCJleHAiOjk5OTk5OTk5OTl9.sig',
    user_id: 1, // Changed to number for FastAPI Users
    username: 'testuser',
    full_name: 'Test User',
    role: 'STORE_MANAGER',
    assigned_store_id: 'STORE-ALPHA',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), // 1 hour from now
    token_expired_offline: false,
    ...overrides,
  };
}

/** Build an expired session (expires_at in the past). */
function makeExpiredSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return makeSession({
    expires_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('tauriAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setMemSession(null);

    // Default: non-Tauri environment
    // The mock is already set up at the top of the file
  });

  afterEach(() => {
    _setMemSession(null);
    vi.unstubAllGlobals();
  });

  // ── getSession / getAccessToken before login ─────────────────────────────

  it('getSession returns null before any login', async () => {
    expect(await getSession()).toBeNull();
  });

  it('getAccessToken returns null when no session', async () => {
    expect(await getAccessToken()).toBeNull();
  });

  it('isAuthenticated returns false when no session', async () => {
    expect(await isAuthenticated()).toBe(false);
  });

  it('getCurrentRole returns null when no session', async () => {
    expect(await getCurrentRole()).toBeNull();
  });

  // ── login ────────────────────────────────────────────────────────────────

  it('login: success stores session and returns it', async () => {
    const mockTokenResp = {
      access_token:
        'header.eyJzdWIiOiJVU0VSLTEiLCJyb2xlIjoiU1RPUkVfTUFOQUdFUiIsInR5cGUiOiJhY2Nlc3MiLCJleHAiOjk5OTk5OTk5OX0.sig',
      refresh_token: 'rt.token',
      token_type: 'bearer',
      role: 'STORE_MANAGER',
      user_id: 'USER-1',
      username: 'testuser',
      full_name: 'Test User',
      assigned_store_id: 'STORE-ALPHA',
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTokenResp),
    } as unknown as Response);

    const session = await login('testuser', 'password', DEVICE_ID);

    expect(session.user_id).toBe('USER-1');
    expect(session.role).toBe('STORE_MANAGER');
    expect(session.token_expired_offline).toBe(false);
    expect(_getMemSession()).not.toBeNull();
    expect(_getMemSession()?.username).toBe('testuser');
  });

  it('login: network error surfaces as thrown Error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(login('user', 'pw', DEVICE_ID)).rejects.toThrow('Failed to fetch');
  });

  it('login: HTTP 401 from server surfaces as Error with detail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ detail: 'Incorrect username, password, or device' }),
    } as unknown as Response);
    await expect(login('user', 'wrong', DEVICE_ID)).rejects.toThrow(
      'Incorrect username, password, or device',
    );
  });

  // ── getAccessToken with valid session ─────────────────────────────────────

  it('getAccessToken returns token when session is valid (non-expired)', async () => {
    _setMemSession(makeSession());
    const token = await getAccessToken();
    expect(token).not.toBeNull();
    expect(typeof token).toBe('string');
  });

  // ── Section 21 offline token expiry ──────────────────────────────────────

  it('getAccessToken returns null when token_expired_offline is true', async () => {
    _setMemSession(makeExpiredSession({ token_expired_offline: true }));
    const token = await getAccessToken();
    expect(token).toBeNull();
  });

  it('isTokenExpiredOffline returns true when flag is set', async () => {
    _setMemSession(makeExpiredSession({ token_expired_offline: true }));
    expect(await isTokenExpiredOffline()).toBe(true);
  });

  it('isTokenExpiredOffline returns false for valid session', async () => {
    _setMemSession(makeSession());
    expect(await isTokenExpiredOffline()).toBe(false);
  });

  /**
   * AT-021 / Section 21 core test:
   * When offline and the token is expired, tryRefreshToken must set
   * token_expired_offline = true — NOT clear the session.
   * This means the outbox can keep queuing and local ops continue.
   */
  it('tryRefreshToken: offline + expired token sets token_expired_offline without clearing session', async () => {
    const expired = makeExpiredSession({ token_expired_offline: false });
    _setMemSession(expired);

    // Simulate offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await tryRefreshToken();

    // Session is NOT null — it still exists so local ops can continue
    expect(result).not.toBeNull();
    // Flag is set
    expect(result?.token_expired_offline).toBe(true);
    // Stored session also updated
    expect(_getMemSession()?.token_expired_offline).toBe(true);

    // Restore
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('tryRefreshToken: online refresh success clears token_expired_offline', async () => {
    const expiredOffline = makeExpiredSession({ token_expired_offline: true });
    _setMemSession(expiredOffline);

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    const newAccessToken =
      'header.eyJzdWIiOiJVU0VSLTEiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjo5OTk5OTk5OTk5fQ.sig';
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: newAccessToken, role: 'STORE_MANAGER' }),
    } as unknown as Response);

    const result = await tryRefreshToken();
    expect(result?.token_expired_offline).toBe(false);
    expect(result?.access_token).toBe(newAccessToken);
  });

  // ── logout ───────────────────────────────────────────────────────────────

  it('logout: clears session', async () => {
    _setMemSession(makeSession());
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);

    await logout();
    expect(_getMemSession()).toBeNull();
    expect(await getSession()).toBeNull();
  });

  // ── isAuthenticated with expired_offline session ─────────────────────────

  it('isAuthenticated returns true for expired_offline session (local ops still allowed)', async () => {
    _setMemSession(makeExpiredSession({ token_expired_offline: true }));
    // expired_offline means the user is still "logged in" locally
    expect(await isAuthenticated()).toBe(true);
  });

  it('isAuthenticated returns false after logout', async () => {
    _setMemSession(makeSession());
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: true } as Response);
    await logout();
    expect(await isAuthenticated()).toBe(false);
  });

  // ── API_BASE_URL guard (Issue 16) ────────────────────────────────────────

  it('login falls back to localhost only in dev mode when VITE_API_BASE_URL not set', async () => {
    const mockTokenResp = {
      access_token: 'test-token',
      refresh_token: 'rt.token',
      token_type: 'bearer',
      role: 'STORE_MANAGER',
      user_id: 'USER-1',
      username: 'testuser',
      full_name: 'Test User',
      assigned_store_id: 'STORE-ALPHA',
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTokenResp),
    } as unknown as Response);

    // Mock DEV mode and no VITE_API_BASE_URL
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_API_BASE_URL', undefined);

    await login('testuser', 'password', DEVICE_ID);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    vi.unstubAllGlobals();
  });

  it('login throws when API_BASE_URL is empty in production', async () => {
    // Mock production mode and no VITE_API_BASE_URL
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_API_BASE_URL', undefined);

    await expect(login('testuser', 'password', DEVICE_ID)).rejects.toThrow();

    vi.unstubAllGlobals();
  });
});
