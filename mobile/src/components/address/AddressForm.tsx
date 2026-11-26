import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useCities } from '@/api/hooks';
import type { Address, AddressInput } from '@/api/types';
import { Button } from '@/components/Button';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

const t = ar.addresses;

const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** "0912345678" / "+218…" / Arabic digits → "+2189…" or null. */
export function libyanPhone(input: string): string | null {
  const local = toWestern(input)
    .replace(/[^\d+]/g, '')
    .replace(/^\+?218/, '')
    .replace(/^0/, '');
  return /^9[1-5]\d{7}$/.test(local) ? `+218${local}` : null;
}

/** "+218912345678" → "0912345678" for editing. */
const phoneToInput = (p: string | null | undefined) => (p ? p.replace(/^\+218/, '0') : '');

interface Props {
  /** Editing an existing address, or defaults for a new one (the customer's name and phone). */
  initial?: Partial<Address>;
  /** Show «اجعليه العنوان الأساسي» (new addresses that are not the first). */
  showDefaultToggle?: boolean;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (input: AddressInput) => void;
}

export function AddressForm({ initial, showDefaultToggle, submitting, error, onSubmit }: Props) {
  const cities = useCities();
  // Served cities first (Tripoli at launch); the others can be saved but not ordered to yet.
  const served = cities.data?.served ?? [];
  const cityChoices = [...served, ...(cities.data?.items ?? []).filter((c) => !served.includes(c))];
  const servedText = served.length <= 1 ? (served[0] ?? '') : `${served.slice(0, -1).join('، ')} و${served.at(-1)}`;
  const [f, setF] = useState({
    label: initial?.label ?? '',
    recipientName: initial?.recipientName ?? '',
    phone: phoneToInput(initial?.phone),
    city: initial?.city ?? '',
    district: initial?.district ?? '',
    street: initial?.street ?? '',
    building: initial?.building ?? '',
    landmark: initial?.landmark ?? '',
    isDefault: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const phone = libyanPhone(f.phone);
  const errors = {
    recipientName: f.recipientName.trim().length < 2 ? t.required : null,
    phone: !f.phone.trim() ? t.required : !phone ? t.phoneInvalid : null,
    city: !f.city ? t.chooseCity : null,
    street: f.street.trim().length < 2 ? t.required : null,
  };
  const show = (e: string | null) => (submitted ? e : null);

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean) || !phone) return;
    onSubmit({
      label: f.label.trim() || null,
      recipientName: f.recipientName.trim(),
      phone,
      city: f.city,
      district: f.district.trim() || null,
      street: f.street.trim(),
      building: f.building.trim() || null,
      landmark: f.landmark.trim() || null,
      ...(showDefaultToggle && f.isDefault ? { isDefault: true } : {}),
    });
  };

  return (
    <View style={styles.form}>
      <Label text={t.labelField} />
      <View style={styles.chips}>
        {t.labelPresets.map((p) => (
          <Chip key={p} text={p} selected={f.label === p} onPress={() => set('label', f.label === p ? '' : p)} />
        ))}
      </View>

      <Label text={t.city} required />
      {servedText ? <Text style={styles.hint}>{t.servedHint(servedText)}</Text> : null}
      <View style={styles.chips}>
        {cityChoices.map((c) => (
          <Chip key={c} text={c} selected={f.city === c} onPress={() => set('city', c)} />
        ))}
      </View>
      {show(errors.city) && <Text style={styles.error}>{errors.city}</Text>}
      {f.city && served.length > 0 && !served.includes(f.city) ? (
        <Text style={styles.warning}>{t.notServed(f.city, servedText)}</Text>
      ) : null}

      <Field label={t.district} value={f.district} onChangeText={(v) => set('district', v)} placeholder={t.districtPlaceholder} />
      <Field
        label={t.street}
        required
        value={f.street}
        onChangeText={(v) => set('street', v)}
        placeholder={t.streetPlaceholder}
        error={show(errors.street)}
      />
      <Field label={t.building} value={f.building} onChangeText={(v) => set('building', v)} />
      <Field
        label={t.landmark}
        value={f.landmark}
        onChangeText={(v) => set('landmark', v)}
        placeholder={t.landmarkPlaceholder}
        hint={t.landmarkHint}
      />
      <Field
        label={t.recipientName}
        required
        value={f.recipientName}
        onChangeText={(v) => set('recipientName', v)}
        autoComplete="name"
        error={show(errors.recipientName)}
      />

      <Label text={t.phone} required />
      {/* LTR inside: "+218 | 091 234 5678" */}
      <View style={[styles.phoneBox, show(errors.phone) && styles.inputError]}>
        <Text style={styles.prefix}>+218</Text>
        <TextInput
          value={f.phone}
          onChangeText={(v) => set('phone', toWestern(v))}
          placeholder="091 234 5678"
          placeholderTextColor={colors.inkMuted}
          keyboardType="phone-pad"
          autoComplete="tel"
          style={styles.phoneInput}
          accessibilityLabel={t.phone}
        />
      </View>
      {show(errors.phone) && <Text style={styles.error}>{errors.phone}</Text>}

      {showDefaultToggle && (
        <Pressable
          style={styles.toggle}
          onPress={() => set('isDefault', !f.isDefault)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: f.isDefault }}
        >
          <Ionicons name={f.isDefault ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
          <Text style={styles.toggleText}>{t.setDefault}</Text>
        </Pressable>
      )}

      {error && <Text style={styles.errorBox}>{error}</Text>}
      <Button title={t.save} loading={submitting} onPress={submit} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {text}
      {required && <Text style={styles.star}> *</Text>}
    </Text>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; required?: boolean; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Label text={label} required={required} />
      <TextInput
        {...input}
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, error && styles.inputError]}
        accessibilityLabel={label}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Chip({ text, selected, onPress }: { text: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  label: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 22, color: colors.ink, marginTop: spacing.xs },
  star: { color: colors.danger },
  hint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.inkMuted },
  error: { fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 18, color: colors.danger },
  warning: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  errorBox: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 20,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    writingDirection: 'rtl',
  },
  inputError: { borderColor: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.inkSecondary },
  chipTextOn: { color: colors.white },
  phoneBox: {
    flexDirection: 'row',
    direction: 'ltr',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    height: 48,
  },
  prefix: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.inkSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    lineHeight: 48,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.ink,
    writingDirection: 'ltr',
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  toggleText: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.ink },
});
