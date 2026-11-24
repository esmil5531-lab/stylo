import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getToken, setSession } from '@/lib/session';

const API_PORT = 4000;
const TIMEOUT_MS = 15000;

/**
 * API base URL, in order:
 * 1. EXPO_PUBLIC_API_URL (set this for staging/production builds)
 * 2. web: the site's own origin (/v1) — the API serves the built site; with the Metro dev
 *    server (port 8081) the API is on the same host, port 4000
 * 3. native dev: the machine running Metro (works for Expo Go on a phone in the same Wi-Fi)
 * 4. emulator fallbacks
 */
export function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    return port === '8081' ? `${protocol}//${hostname}:${API_PORT}/v1` : `${origin}/v1`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}/v1`;
  return Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}/v1` : `http://localhost:${API_PORT}/v1`;
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

export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
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
    throw new ApiError(0, 'network', 'تعذّر الاتصال بالخادم، تحققي من الإنترنت وحاولي مرة أخرى');
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Expired or revoked session: sign out locally; screens then offer «تسجيل الدخول».
    if (res.status === 401 && token) await setSession(null);
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
