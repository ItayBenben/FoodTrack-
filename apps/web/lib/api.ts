/** API client. Access token in memory; refresh via the HttpOnly cookie; problem+json errors. */
import { deviceId } from './db/local';

export class ApiError extends Error {
  constructor(public status: number, public problem: { type?: string; title?: string; detail?: string; errors?: { path: string; code: string; message?: string }[]; [k: string]: unknown }) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`);
  }
  get offline() { return this.status === 0; }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(authed: boolean) => void>();
export function onAuthChange(fn: (authed: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setAccessToken(t: string | null) { accessToken = t; listeners.forEach((l) => l(Boolean(t))); }
export function hasToken() { return Boolean(accessToken); }
export function getAccessToken() { return accessToken; }

export async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' });
        if (!r.ok) { if (r.status === 401) setAccessToken(null); return false; }
        setAccessToken((await r.json()).access_token);
        return true;
      } catch { return false; } finally { setTimeout(() => { refreshing = null; }, 0); }
    })();
  }
  return refreshing;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; auth?: boolean } = {}): Promise<T> {
  const go = async () => {
    const headers: Record<string, string> = { 'x-device-id': await deviceId() };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (accessToken && init.auth !== false) headers.authorization = `Bearer ${accessToken}`;
    return fetch(`/api/v1${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), credentials: 'same-origin', signal: init.signal });
  };
  let r: Response;
  try { r = await go(); } catch { throw new ApiError(0, { title: 'offline', detail: 'No connection.' }); }
  if (r.status === 401 && init.auth !== false && (await tryRefresh())) {
    try { r = await go(); } catch { throw new ApiError(0, { title: 'offline' }); }
  }
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!r.ok) throw new ApiError(r.status, body ?? { title: r.statusText });
  return body as T;
}
