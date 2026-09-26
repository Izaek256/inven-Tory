/**
 * Thin API client for the invenTory central API.
 *
 * All requests include the Bearer token stored in memory (optionally
 * set via httpOnly cookie from the server).
 * Unauthorized responses (401) clear the token and reload so the login
 * screen is shown — simple SPA auth without a router dependency.
 *
 * Features: request timeout (default 30s), in-flight request deduplication,
 * response caching with TTL, and response compression detection.
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

import { get, set, del } from 'idb-keyval';

let _token: string | null = null;

export async function initToken(): Promise<string | null> {
  const token = await get('auth_token');
  if (typeof token === 'string') {
    _token = token;
  }
  return _token;
}

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string): void {
  _token = token;
  void set('auth_token', token);
}

export function clearToken(): void {
  _token = null;
  void del('auth_token');
}

const DEFAULT_TIMEOUT_MS = 30_000;
const inFlightRequests = new Map<string, Promise<unknown>>();
const cacheMap = new Map<string, { data: unknown; expiresAt: number }>();

function getCacheKey(path: string, init: RequestInit): string {
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(init.body as string) : undefined;
  return `${method}:${path}${body ? `:${JSON.stringify(body)}` : ''}`;
}

function getCacheTTL(): number {
  return Number(import.meta.env.VITE_API_CACHE_TTL_MS ?? 30_000);
}

export function clearCache(): void {
  cacheMap.clear();
}

export function clearInFlight(): void {
  inFlightRequests.clear();
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal ? combineSignals(init.signal, controller.signal) : controller.signal;

  const cacheKey = getCacheKey(path, init);
  const now = Date.now();
  const cached = cacheMap.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const inflightKey = cacheKey;
  const existingInFlight = inFlightRequests.get(inflightKey);
  if (existingInFlight) {
    return existingInFlight as Promise<T>;
  }

  const promise = (async (): Promise<T> => {
    let resp: Response;
    try {
      resp = await fetch(`${BASE_URL}${path}`, { ...init, headers, signal });
    } catch (err) {
      inFlightRequests.delete(inflightKey);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    const encoding = resp.headers.get('Content-Encoding');
    if (encoding) {
      // Response was compressed; body decompression is handled by fetch automatically
    }

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
      inFlightRequests.delete(inflightKey);
      throw new Error(detail);
    }

    const data = (await resp.json()) as T;
    const ttl = getCacheTTL();
    cacheMap.set(cacheKey, { data, expiresAt: now + ttl });
    inFlightRequests.delete(inflightKey);
    return data;
  })();

  inFlightRequests.set(inflightKey, promise);
  return promise;
}

function combineSignals(...signals: (AbortSignal | null)[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig) {
      sig.addEventListener('abort', () => controller.abort());
    }
  }
  return controller.signal;
}

export const api = {
  get: <T>(path: string, timeoutMs?: number): Promise<T> => request<T>(path, {}, timeoutMs),
  post: <T>(path: string, body: unknown, timeoutMs?: number): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, timeoutMs),
  request,
};

export function abortAll(): void {
  inFlightRequests.clear();
}
