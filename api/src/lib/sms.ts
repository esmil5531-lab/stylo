import type { SmsConfig } from '../config.js';
import { AppError } from './errors.js';

export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

/**
 * SMS delivery for one-time codes.
 * - console: development; the code is printed in the API log (and echoed in the response).
 * - http: POSTs JSON { to, text } with `Authorization: Bearer SMS_HTTP_TOKEN` to SMS_HTTP_URL.
 *   Point it at the Libyan SMS gateway (or a small adapter in front of it).
 */
export function createSmsSender(cfg: SmsConfig, log: (msg: string) => void): SmsSender {
  if (cfg.provider === 'http' && cfg.httpUrl) {
    const url = cfg.httpUrl;
    return {
      async send(to, text) {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(cfg.httpToken ? { authorization: `Bearer ${cfg.httpToken}` } : {}),
          },
          body: JSON.stringify({ to, text }),
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null);
        if (!res?.ok) throw new AppError(503, 'sms_failed', 'تعذّر إرسال الرسالة، حاولي بعد قليل');
      },
    };
  }
  return {
    async send(to, text) {
      log(`[sms:console] to=${to} text=${text}`);
    },
  };
}
