import type { MessagingConfig } from '../config.js';
import type { Queryable } from '../db.js';
import { AppError } from './errors.js';

/**
 * Outgoing messages to customers, staff and drivers.
 *
 * Main channel: **WhatsApp Business Cloud API** (Meta Graph API). Business-initiated messages must
 * use pre-approved templates, so we use two:
 *  - WHATSAPP_OTP_TEMPLATE   — an *Authentication* template: body {{1}} = code, plus the
 *                              "copy code" URL button that Meta requires for this category.
 *  - WHATSAPP_ORDER_TEMPLATE — a *Utility* template: {{1}} name, {{2}} order number, {{3}} status, {{4}} store.
 *
 * Providers:
 *  - console  : development. Nothing leaves the server; the OTP is echoed on screen (devCode).
 *  - whatsapp : POST https://graph.facebook.com/{version}/{phoneNumberId}/messages (Bearer WHATSAPP_TOKEN).
 *  - sms_http : optional fallback. POSTs { to, text } to SMS_HTTP_URL.
 *
 * Every send is written to `message_log` (never the code itself).
 */

export type Channel = 'whatsapp' | 'sms' | 'console';

export interface OrderStatusMessage {
  customerName: string;
  orderNumber: number;
  statusAr: string;
  storeName: string;
}

export interface Messenger {
  readonly channel: Channel;
  /** Throws AppError(503) when the provider refuses: the customer must know the code did not go out. */
  sendOtp(to: string, code: string): Promise<void>;
  /** Never throws: order notifications must not break the order flow. */
  sendOrderStatus(to: string, msg: OrderStatusMessage, orderId?: string): Promise<void>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** E.164 without the plus, as WhatsApp expects: +218912345678 → 218912345678. */
export function waRecipient(phone: string): string {
  return phone.replace(/^\+/, '');
}

export function buildWhatsAppOtpPayload(cfg: { otpTemplate: string; templateLang: string }, to: string, code: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: waRecipient(to),
    type: 'template',
    template: {
      name: cfg.otpTemplate,
      language: { code: cfg.templateLang },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        // Authentication templates carry a "copy code" button whose parameter is the code.
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  };
}

export function buildWhatsAppOrderPayload(
  cfg: { orderTemplate: string; templateLang: string },
  to: string,
  msg: OrderStatusMessage,
) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: waRecipient(to),
    type: 'template',
    template: {
      name: cfg.orderTemplate,
      language: { code: cfg.templateLang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: msg.customerName },
            { type: 'text', text: `#${msg.orderNumber}` },
            { type: 'text', text: msg.statusAr },
            { type: 'text', text: msg.storeName },
          ],
        },
      ],
    },
  };
}

export function orderStatusText(msg: OrderStatusMessage): string {
  return `ستايلو: مرحباً ${msg.customerName}، طلبك ⁦#${msg.orderNumber}⁩ من «${msg.storeName}» أصبح «${msg.statusAr}».`;
}

interface Deps {
  db?: Queryable;
  log: (msg: string) => void;
  fetch?: FetchLike;
}

export function createMessenger(cfg: MessagingConfig, deps: Deps): Messenger {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));

  async function record(row: {
    channel: Channel;
    purpose: 'otp' | 'order_status';
    to: string;
    template?: string | null;
    orderId?: string;
    ok: boolean;
    providerId?: string | null;
    error?: string | null;
  }) {
    if (!deps.db) return;
    try {
      await deps.db.query(
        `INSERT INTO message_log (channel, purpose, to_phone, template, order_id, status, provider_id, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.channel,
          row.purpose,
          row.to,
          row.template ?? null,
          row.orderId ?? null,
          row.ok ? 'sent' : 'failed',
          row.providerId ?? null,
          row.error?.slice(0, 500) ?? null,
        ],
      );
    } catch (err) {
      deps.log(`[messaging] could not write message_log: ${(err as Error).message}`);
    }
  }

  async function post(url: string, token: string | undefined, body: unknown) {
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status} ${text.slice(0, 300)}` };
      let providerId: string | null = null;
      try {
        providerId = (JSON.parse(text) as { messages?: { id?: string }[] }).messages?.[0]?.id ?? null;
      } catch {
        /* not JSON (SMS adapters) */
      }
      return { ok: true as const, providerId };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  }

  if (cfg.provider === 'whatsapp' && cfg.whatsapp) {
    const wa = cfg.whatsapp;
    const url = `${wa.apiBase}/${wa.apiVersion}/${wa.phoneNumberId}/messages`;
    return {
      channel: 'whatsapp',
      async sendOtp(to, code) {
        const r = await post(url, wa.token, buildWhatsAppOtpPayload(wa, to, code));
        await record({ channel: 'whatsapp', purpose: 'otp', to, template: wa.otpTemplate, ...r });
        if (!r.ok) {
          deps.log(`[whatsapp] OTP to ${to} failed: ${r.error}`);
          throw new AppError(503, 'message_failed', 'تعذّر إرسال الرمز عبر واتساب، حاولي بعد قليل');
        }
      },
      async sendOrderStatus(to, msg, orderId) {
        const r = await post(url, wa.token, buildWhatsAppOrderPayload(wa, to, msg));
        await record({ channel: 'whatsapp', purpose: 'order_status', to, template: wa.orderTemplate, orderId, ...r });
        if (!r.ok) deps.log(`[whatsapp] order update to ${to} failed: ${r.error}`);
      },
    };
  }

  if (cfg.provider === 'sms_http' && cfg.smsHttp) {
    const sms = cfg.smsHttp;
    return {
      channel: 'sms',
      async sendOtp(to, code) {
        const r = await post(sms.url, sms.token, {
          to,
          text: `رمز الدخول إلى ستايلو: ${code}\nصالح لمدة 5 دقائق. لا تشاركيه مع أحد.`,
        });
        await record({ channel: 'sms', purpose: 'otp', to, ...r });
        if (!r.ok) throw new AppError(503, 'message_failed', 'تعذّر إرسال الرسالة، حاولي بعد قليل');
      },
      async sendOrderStatus(to, msg, orderId) {
        const r = await post(sms.url, sms.token, { to, text: orderStatusText(msg) });
        await record({ channel: 'sms', purpose: 'order_status', to, orderId, ...r });
      },
    };
  }

  return {
    channel: 'console',
    async sendOtp(to) {
      // The code itself is shown on screen in development (devCode); keep it out of the logs.
      deps.log(`[messaging:console] OTP for ${to} (shown on screen in development)`);
      await record({ channel: 'console', purpose: 'otp', to, ok: true });
    },
    async sendOrderStatus(to, msg, orderId) {
      deps.log(`[messaging:console] to=${to} ${orderStatusText(msg)}`);
      await record({ channel: 'console', purpose: 'order_status', to, orderId, ok: true });
    },
  };
}
