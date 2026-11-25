import { useEffect, useRef, useState } from 'react';

import { request } from '@/api/client';
import { Num, PhoneInput } from '@/components/inputs';
import { ErrorAlert, Field } from '@/components/ui';
import { formatPhone, normaliseLibyanPhone, toWesternDigits } from '@/lib/numbers';
import { setToken } from '@/lib/session';

interface RequestResult {
  phone: string;
  expiresInSeconds: number;
  resendInSeconds: number;
  devCode?: string;
  channel?: 'whatsapp' | 'sms' | 'console';
}

/**
 * Back-office sign-in: Libyan mobile number → 6-digit code on WhatsApp.
 * Only numbers registered as active Stylo staff or store owners get in.
 */
export function LoginPage({ notice }: { notice?: string | null }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<RequestResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const phone = normaliseLibyanPhone(phoneInput);

  const requestCode = async () => {
    setSubmitted(true);
    if (!phone) return;
    setBusy(true);
    setError(null);
    try {
      const r = await request<RequestResult>('POST', '/auth/otp/request', { phone });
      setSent(r);
      setStep('code');
      setCode('');
      setWait(r.resendInSeconds);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!sent || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await request<{ token: string }>('POST', '/auth/otp/verify', { phone: sent.phone, code, app: 'admin' });
      setToken(r.token);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-brand">
          <img className="login-logo" src={`${import.meta.env.BASE_URL}brand/logo-primary.svg`} alt="STYLO — MORE THAN FASHION" />
          <div className="muted" style={{ textAlign: 'center' }}>
            لوحة الإدارة والمتاجر
          </div>
        </div>

        {notice && <div className="alert alert-info">{notice}</div>}

        {step === 'phone' ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void requestCode();
            }}
          >
            <Field
              label="رقم الهاتف"
              required
              error={submitted && !phone ? 'رقم ليبي غير صحيح، مثال: 0912345678' : null}
              hint="الرقم المسجّل لدى ستايلو للموظفين وأصحاب المتاجر"
            >
              <PhoneInput value={phoneInput} onChange={setPhoneInput} autoFocus />
            </Field>
            <button className="btn btn-primary" disabled={busy}>
              إرسال رمز الدخول
            </button>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <p style={{ margin: 0 }}>
              {sent?.channel === 'sms' ? 'أرسلنا رسالة نصية برمز من 6 أرقام إلى' : 'أرسلنا رمزاً من 6 أرقام عبر واتساب إلى'}{' '}
              <Num>{formatPhone(sent?.phone)}</Num>
            </p>
            {sent?.devCode && (
              <div className="alert dev-note">
                وضع التطوير — {sent.channel === 'console' ? 'واتساب غير مربوط بعد' : 'الرمز يظهر هنا أيضاً'}. الرمز:{' '}
                <Num>{sent.devCode}</Num>
              </div>
            )}
            <Field label="رمز الدخول" required>
              <input
                ref={codeRef}
                className="input otp-input"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(toWesternDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
            <button className="btn btn-primary" disabled={busy || code.length !== 6}>
              دخول
            </button>
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('phone')}>
                تغيير الرقم
              </button>
              <span className="spacer" />
              <button type="button" className="btn btn-ghost btn-sm" disabled={wait > 0 || busy} onClick={() => void requestCode()}>
                {wait > 0 ? (
                  <>
                    إعادة الإرسال بعد <Num>{wait}</Num> ث
                  </>
                ) : (
                  'إعادة إرسال الرمز'
                )}
              </button>
            </div>
          </form>
        )}
        <ErrorAlert error={error} />
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>
        ستايلو — كل ستايل في مكان واحد
      </p>
    </div>
  );
}
