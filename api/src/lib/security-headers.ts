import { createHash } from 'node:crypto';

/**
 * Content-Security-Policy for the two websites. Scripts only from this server: the customer
 * site's single inline script (Expo Router's `__EXPO_ROUTER_HYDRATE__` flag) is allowed by its
 * SHA-256, computed from the page being sent — never 'unsafe-inline' for scripts. Styles need
 * 'unsafe-inline' (React Native Web and React style attributes). Images: this server, data/blob
 * (upload previews) and https (Supabase Storage, external product photos).
 */
export function contentSecurityPolicy(html: string, opts: { production: boolean }): string {
  const hashes = inlineScriptHashes(html).map((h) => `'sha256-${h}'`);
  const directives = [
    "default-src 'self'",
    `script-src 'self'${hashes.length ? ` ${hashes.join(' ')}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${opts.production ? '' : ' http:'}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (opts.production) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** SHA-256 (base64) of every inline script that runs (JSON-LD data blocks never run). */
export function inlineScriptHashes(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? '';
    if (/\ssrc\s*=/i.test(attrs) || !m[2]) continue;
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    out.add(createHash('sha256').update(m[2], 'utf8').digest('base64'));
  }
  return [...out];
}

/** Headers for every response; HTML pages also get the CSP above. */
export function securityHeaders(
  url: string,
  contentType: string,
  payload: unknown,
  opts: { production: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  };
  if (url.startsWith('/v1') || url.startsWith('/admin')) headers['x-robots-tag'] = 'noindex, nofollow';
  if (contentType.includes('text/html')) {
    const html = typeof payload === 'string' ? payload : Buffer.isBuffer(payload) ? payload.toString('utf8') : '';
    headers['content-security-policy'] = contentSecurityPolicy(html, opts);
  } else if (url.startsWith('/v1')) {
    // JSON is never a document: nothing may run or embed it.
    headers['content-security-policy'] = "default-src 'none'; frame-ancestors 'none'";
  }
  return headers;
}
