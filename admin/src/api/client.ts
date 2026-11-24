import { clearToken, getToken } from '@/lib/session';

/** Same-origin `/v1` (Vite proxies it to the API in development), unless VITE_API_URL is set. */
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/v1';

/** Error with an Arabic message from the API, safe to show as-is. */
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

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'تعذّر الاتصال بالخادم. تأكدي أن الـ API يعمل على المنفذ 4000');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Expired or revoked session: back to the sign-in screen.
    if (res.status === 401 && token) clearToken();
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? 'حدث خطأ غير متوقع', e?.details);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع';
}

export function qs(params: Record<string, string | number | undefined>): string {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
}

export type UploadPurpose = 'product' | 'banner' | 'look' | 'category';
export interface UploadedImage {
  id: string;
  url: string;
  urls: { sm: string; md: string; lg: string };
  width: number;
  height: number;
}

/** Sends one photo as-is (raw body, its own content type); the API checks, resizes and stores it. */
export async function uploadImage(file: File, purpose: UploadPurpose): Promise<UploadedImage> {
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': file.type || 'application/octet-stream' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}/admin/uploads?purpose=${purpose}`, { method: 'POST', headers, body: file });
  } catch {
    throw new ApiError(0, 'network', 'تعذّر رفع الصورة، تحققي من الاتصال');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) clearToken();
    const e = data?.error;
    const fallback = res.status === 413 ? 'حجم الصورة كبير جداً' : 'تعذّر رفع الصورة';
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? fallback, e?.details);
  }
  return data as UploadedImage;
}
