import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, ApiError, errorMessage, startCustomerSession } from '@/api/client';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { BRAND } from '@/constants/brand';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

interface Sent {
  phone: string;
  resendInSeconds: number;
  devCode?: string;
  channel?: 'whatsapp' | 'sms' | 'console';
}

const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** "0912345678" / "+218…" / Arabic digits → "+2189…" or null. */
function libyanPhone(input: string): string | null {
  const local = toWestern(input)
    .replace(/[^\d+]/g, '')
    .replace(/^\+?218/, '')
    .replace(/^0/, '');
  return /^9[1-5]\d{7}$/.test(local) ? `+218${local}` : null;
}

function prettyPhone(p: string) {
  const m = /^\+218(\d{2})(\d{3})(\d{4})$/.exec(p);
  return m ? `+218 ${m[1]} ${m[2]} ${m[3]}` : p;
}

/** Sign in with a Libyan mobile number + 6-digit code. New numbers add their name once. */
export default function LoginScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const phone = libyanPhone(phoneInput);

  const requestCode = async () => {
    setTouched(true);
    if (!phone) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Sent>('/auth/otp/request', { phone });
      setSent(r);
      setStep('code');
      setCode('');
      setNeedsName(false);
      setWait(r.resendInSeconds);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!sent || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      // A guest's bearer token goes with this request: the server moves the guest cart and ♡ into
      // the account.
      const r = await api.post<{ token: string; refreshToken?: string; expiresAt?: string; user: { role: string } }>(
        '/auth/otp/verify',
        {
          phone: sent.phone,
          code,
          app: 'customer',
          fullName: needsName ? name.trim() : undefined,
        },
      );
      await startCustomerSession(r);
      // Drivers land on their own panel («لوحة المندوب»).
      const home = r.user.role === 'driver' ? '/driver' : '/';
      router.replace((next && next.startsWith('/') && next !== '/login' ? next : home) as Href);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'name_required') {
        setNeedsName(true);
        setError(null);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={ar.auth.title} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Image source={FABRIC} style={StyleSheet.absoluteFill} contentFit="cover" />
          <Image
            source={LOGO}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel={`${BRAND.wordmark} — ${BRAND.descriptorEn}`}
          />
          <Text style={styles.tagline}>{BRAND.taglineAr}</Text>
        </View>

        {step === 'phone' ? (
          <View style={styles.form}>
            <Text style={styles.sub}>{ar.auth.subtitle}</Text>
            <Text style={styles.label}>{ar.auth.phone}</Text>
            <View style={styles.phoneBox}>
              <Text style={styles.prefix}>+218</Text>
              <TextInput
                value={phoneInput}
                onChangeText={(t) => setPhoneInput(toWestern(t))}
                onSubmitEditing={() => void requestCode()}
                placeholder="091 234 5678"
                placeholderTextColor={colors.inkMuted}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                style={styles.phoneInput}
                autoFocus
                accessibilityLabel={ar.auth.phone}
              />
            </View>
            <Text style={touched && !phone ? styles.error : styles.hint}>
              {touched && !phone ? ar.auth.phoneInvalid : ar.auth.phoneHint}
            </Text>
            <Button title={ar.auth.sendCode} loading={busy} onPress={() => void requestCode()} />
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.sub}>
              {sent?.channel === 'sms' ? ar.auth.codeSentToSms : ar.auth.codeSentTo} <Text style={styles.ltr}>{sent ? prettyPhone(sent.phone) : ''}</Text>
            </Text>
            {sent?.devCode && (
              <View style={styles.dev}>
                <Text style={styles.devText}>{ar.auth.devCode(sent.devCode, sent.channel === 'whatsapp')}</Text>
              </View>
            )}
            <Text style={styles.label}>{ar.auth.code}</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(toWestern(t).replace(/\D/g, '').slice(0, 6))}
              onSubmitEditing={() => void verify()}
              placeholder="••••••"
              placeholderTextColor={colors.inkFaint}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              style={styles.otp}
              autoFocus
              accessibilityLabel={ar.auth.code}
            />
            {needsName && (
              <>
                <Text style={styles.welcome}>{ar.auth.welcomeNew}</Text>
                <Text style={styles.label}>{ar.auth.fullName}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                  autoComplete="name"
                  autoFocus
                  accessibilityLabel={ar.auth.fullName}
                />
              </>
            )}
            <Button
              title={needsName ? ar.auth.createAccount : ar.auth.verify}
              loading={busy}
              disabled={code.length !== 6 || (needsName && name.trim().length < 2)}
              onPress={() => void verify()}
            />
            <View style={styles.row}>
              <Button title={ar.auth.changePhone} variant="outline" onPress={() => setStep('phone')} style={styles.small} />
              <Button
                title={wait > 0 ? ar.auth.resendIn(wait) : ar.auth.resend}
                variant="outline"
                disabled={wait > 0 || busy}
                onPress={() => void requestCode()}
                style={styles.small}
              />
            </View>
          </View>
        )}
        {error && <Text style={styles.errorBox}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const FABRIC = require('../../assets/brand/navy-fabric-wide.jpg');
const LOGO = require('../../assets/brand/logo-reversed.png');

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.lg },
  // Navy fabric + the reversed STYLO logo (brand/), the Arabic tagline under it.
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: { width: 150, height: 172 },
  tagline: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 24, color: colors.white },
  form: { gap: spacing.sm },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, color: colors.inkSecondary },
  ltr: { writingDirection: 'ltr', fontFamily: fonts.bold, color: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, marginTop: spacing.xs },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
  error: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.danger },
  // The phone box is LTR inside: "+218 | 91 234 5678".
  phoneBox: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    height: 50,
  },
  prefix: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.inkSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    textAlignVertical: 'center',
    lineHeight: 50,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    fontFamily: fonts.semiBold,
    fontSize: 17,
    color: colors.ink,
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  otp: {
    height: 58,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    letterSpacing: 10,
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: colors.ink,
    writingDirection: 'ltr',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  welcome: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary, marginTop: spacing.sm },
  dev: { backgroundColor: colors.warningSoft, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.warning, borderRadius: radius.sm, padding: 10 },
  devText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.warning },
  row: { flexDirection: 'row', gap: spacing.sm },
  small: { flex: 1, minHeight: 42 },
  errorBox: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: 12,
    borderRadius: radius.md,
    textAlign: 'center',
  },
});
