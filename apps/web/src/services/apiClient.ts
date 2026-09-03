/**
 * Thin API client for the INVENTORY Tory central API.
 *
 * All requests include the Bearer token stored in sessionStorage.
 * Unauthorized responses (401) clear the token and reload so the login
 * screen is shown — simple SPA auth without a router dependency.
 */

function _getBaseUrl(): string {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (envBaseUrl) {
    return envBaseUrl;
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:8000/api/v1';
  }

  throw new Error('VITE_API_BASE_URL is not configured. Set it in your .env file.');
}

const BASE_URL = _getBaseUrl().replace(/\/$/, '');

const TOKEN_KEY = 'it_access_token';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };

  const resp = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (resp.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Session expired — please log in again.');
  }

  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  return resp.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
