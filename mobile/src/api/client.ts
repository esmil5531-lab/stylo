import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getSession, getToken, setSession, type StoredSession } from '@/lib/session';

const API_PORT = 4000;
const TIMEOUT_MS = 15000;

/**
 * API base URL.
 * - Web (customer site): always the site's own origin (/v1) — the API serves the built site.
 *   With the Metro dev server (port 8081) the API is on the same host, port 4000.
 *   EXPO_PUBLIC_API_URL is ignored here, so a phone-only setting never leaks into the website build.
 * - Native (Expo Go / app builds), in order:
 *   1. EXPO_PUBLIC_API_URL from mobile/.env — e.g. http://10.19.26.252:4000/v1 for a phone on the
 *      same Wi-Fi, or https://<domain>/v1 for store builds. Restart Metro with `-c` after changing it.
 *   2. the computer running Metro, port 4000 (LAN mode). Not with `--tunnel`: the tunnel only
 *      carries Metro, not the API — set EXPO_PUBLIC_API_URL then.
 *   3. emulator fallbacks.
 */
export function resolveApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    return port === '8081' ? `${protocol}//${hostname}:${API_PORT}/v1` : `${origin}/v1`;
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}/v1`;
  return Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}/v1` : `http://localhost:${API_PORT}/v1`;
}

/**
 * Photo URL ready for <Image>: photos uploaded from the back office come as `/uploads/…` on the
 * API server, so the app (a different origin) needs the server's address in front.
 */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith('/')) return url;
  return resolveApiUrl().replace(/\/v1$/, '') + url;
}

if (__DEV__ && Platform.OS !== 'web') {
  const url = resolveApiUrl();
  // Shown in the Metro terminal: the first thing to check when the app says it can't reach the server.
  console.log(`[stylo] API: ${url}`);
  if (/exp\.direct|ngrok/.test(url)) {
    console.warn('[stylo] Tunnel mode does not carry the API. Set EXPO_PUBLIC_API_URL in mobile/.env.');
  }
}

/** Error with an Arabic, user-presentable message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface IssuedSession {
  token: string;
  expiresAt?: string;
  refreshToken?: string;
}

const asStored = (r: IssuedSession, guest: boolean): StoredSession => ({
  token: r.token,
  refreshToken: r.refreshToken,
  expiresAt: r.expiresAt,
  guest,
});

/** POST without the session machinery (used by refresh / guest creation themselves). */
async function rawPost<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(`${resolveApiUrl()}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

let refreshing: Promise<boolean> | null = null;

/**
 * Renews the access token with the refresh token — one request at a time (rotation: a second
 * parallel refresh with the same token would look like a stolen token). false = signed out.
 */
export function refreshSession(): Promise<boolean> {
  const current = getSession();
  if (!current?.refreshToken) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const r = await rawPost<IssuedSession>('/auth/refresh', { refreshToken: current.refreshToken });
      if (r.ok && r.data) {
        await setSession(asStored(r.data, current.guest));
        return true;
      }
      // Expired, revoked or replayed: this device signs in again (a guest simply starts over).
      if (r.status === 401 || r.status === 400) await setSession(null);
      return false;
    } catch {
      return false; // offline: keep the session, try again later
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

let creatingGuest: Promise<void> | null = null;

/** Cart and ♡ work without an account: the first use creates an anonymous guest session. */
export function ensureSession(): Promise<void> {
  if (getToken()) return Promise.resolve();
  creatingGuest ??= (async () => {
    try {
      const r = await rawPost<IssuedSession>('/auth/guest');
      if (!r.ok || !r.data) throw new ApiError(r.status, 'guest_failed', 'تعذّر بدء السلة، حاولي مرة أخرى');
      await setSession(asStored(r.data, true));
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, 'network', 'تعذّر الاتصال بالخادم، تحققي من الإنترنت وحاولي مرة أخرى');
    } finally {
      creatingGuest = null;
    }
  })();
  return creatingGuest;
}

/** Called after phone verification (the server has already merged the guest cart). */
export function startCustomerSession(r: IssuedSession): Promise<void> {
  return setSession(asStored(r, false));
}

export async function apiRequest<T>(method: Method, path: string, body?: unknown, retried = false): Promise<T> {
  // Renew a little before the access token runs out (no failed request first).
  const s = getSession();
  if (s?.refreshToken && s.expiresAt && Date.parse(s.expiresAt) - Date.now() < 60_000 && !path.startsWith('/auth/')) {
    await refreshSession();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { accept: 'application/json' };
  // Only send a JSON content-type with a body: Fastify rejects empty JSON bodies.
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${resolveApiUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // In development, say which address failed: it is almost always the wrong IP, the API not
    // running, or the firewall closing port 4000.
    const where = __DEV__ ? `\n(${resolveApiUrl()})` : '';
    throw new ApiError(0, 'network', `تعذّر الاتصال بالخادم، تحققي من الإنترنت وحاولي مرة أخرى${where}`);
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      // Expired access token: renew once with the refresh token and repeat the request.
      if (!retried && getSession()?.refreshToken && !path.startsWith('/auth/') && (await refreshSession())) {
        return apiRequest<T>(method, path, body, true);
      }
      // A guest asked for something that needs the phone: keep the guest session (and its cart).
      if (data?.error?.code !== 'sign_in_required') await setSession(null);
    }
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? 'حدث خطأ غير متوقع', err?.details);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'حدث خطأ غير متوقع';
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
};

export function query(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
