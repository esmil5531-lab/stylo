import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMe, useUpdateName } from '@/api/hooks';
import { Button } from '@/components/Button';
import { QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SignInPrompt } from '@/components/SignInPrompt';
import { ar } from '@/i18n/ar';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/theme';

const t = ar.profile;

/** «تعديل الاسم». The phone number is the account itself and is not editable here. */
export default function ProfileScreen() {
  const { signedIn } = useSession();
  const me = useMe();
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t.title} />
      {!signedIn ? (
        <SignInPrompt />
      ) : (
        <QueryState query={me}>{(user) => <NameForm initial={user.fullName} />}</QueryState>
      )}
    </KeyboardAvoidingView>
  );
}

function NameForm({ initial }: { initial: string }) {
  const save = useUpdateName();
  const [name, setName] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const tooShort = name.trim().length < 2;

  const submit = () => {
    setSubmitted(true);
    if (tooShort) return;
    save.mutate(name.trim(), { onSuccess: () => router.back() });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>
        {t.fullName}
        <Text style={styles.star}> *</Text>
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={submit}
        autoComplete="name"
        autoFocus
        maxLength={80}
        style={[styles.input, submitted && tooShort && styles.inputError]}
        accessibilityLabel={t.fullName}
      />
      <Text style={submitted && tooShort ? styles.error : styles.hint}>{submitted && tooShort ? t.tooShort : t.hint}</Text>
      {save.error && <Text style={styles.error}>{errorMessage(save.error)}</Text>}
      <Button title={t.save} loading={save.isPending} onPress={submit} style={{ marginTop: spacing.sm }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  label: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 22, color: colors.ink },
  star: { color: colors.danger },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.ink,
    writingDirection: 'rtl',
  },
  inputError: { borderColor: colors.danger },
  hint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.inkMuted },
  error: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.danger },
});
