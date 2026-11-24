import type { InputHTMLAttributes } from 'react';

import { formatLYD } from '@/lib/format';
import { formatBps, formatInt, formatPhone, toWesternDigits } from '@/lib/numbers';

/**
 * Inputs for numbers in an RTL form. Every numeric input is LTR inside (digits, "+218", ".")
 * with its unit on the visual left, accepts Arabic-Indic digits, and keeps the raw text in
 * state so staff can type freely; parsing happens in the form (parseLYD, parseIntInput…).
 */

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
};

function Affixed({ affix, prefix, ...props }: TextProps & { affix?: string; prefix?: string }) {
  const { value, onChange, className, ...rest } = props;
  return (
    <div className={`num-input${prefix ? ' has-prefix' : ''}${affix ? ' has-affix' : ''}`}>
      {prefix && <span className="num-prefix">{prefix}</span>}
      <input
        {...rest}
        dir="ltr"
        className={`input ${className ?? ''}`}
        value={value}
        onChange={(e) => onChange(toWesternDigits(e.target.value))}
      />
      {affix && <span className="num-affix">{affix}</span>}
    </div>
  );
}

/** Price in د.ل — e.g. "199" or "12.5". */
export function MoneyInput(props: TextProps) {
  return <Affixed inputMode="decimal" placeholder="0" autoComplete="off" {...props} affix="د.ل" />;
}

/** Libyan mobile number; the +218 prefix is shown, staff type 09… or 9… */
export function PhoneInput(props: TextProps) {
  return <Affixed inputMode="tel" placeholder="091 234 5678" autoComplete="tel" {...props} prefix="+218" />;
}

/** Whole numbers: quantities, hours. */
export function IntInput({ unit, ...props }: TextProps & { unit?: string }) {
  return <Affixed inputMode="numeric" placeholder="0" autoComplete="off" {...props} affix={unit} />;
}

/** Percentages, e.g. commission "12.5". */
export function PercentInput(props: TextProps) {
  return <Affixed inputMode="decimal" placeholder="10" autoComplete="off" {...props} affix="%" />;
}

// ---------------------------------------------------------------- display

/** Any number or code shown inside Arabic text: tabular, isolated as LTR. */
export function Num({ children }: { children: React.ReactNode }) {
  return (
    <bdi dir="ltr" className="num">
      {children}
    </bdi>
  );
}

export function Money({ value }: { value: number }) {
  // formatLYD returns "199 د.ل"; the amount stays LTR, the Arabic unit follows naturally.
  const [amount, ...unit] = formatLYD(value).split(' ');
  return (
    <span className="money">
      <Num>{amount}</Num> {unit.join(' ')}
    </span>
  );
}

export function Phone({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <a href={`tel:${value}`} className="phone">
      <Num>{formatPhone(value)}</Num>
    </a>
  );
}

export function Count({ value }: { value: number }) {
  return <Num>{formatInt(value)}</Num>;
}

export function Percent({ bps }: { bps: number }) {
  return <Num>{formatBps(bps)}</Num>;
}

/** Phone input value from a stored "+218…" number. */
export function phoneToInput(phone: string | null | undefined): string {
  if (!phone) return '';
  const local = phone.replace(/^\+218/, '');
  return local ? `0${local}` : '';
}
