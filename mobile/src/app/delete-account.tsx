import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, errorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SignInPrompt } from '@/components/SignInPrompt';
import { ar } from '@/i18n/ar';
import { setSession, useSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/theme';

const t = ar.deleteAccount;

/** «حذف حسابي»: explains what is erased, asks for an explicit confirmation, then signs out. */
export default function DeleteAccountScreen() {
  const { signedIn } = useSession();
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/me');
      await setSession(null);
      qc.clear();
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t.title} />
      {!signedIn ? (
        <SignInPrompt />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.icon}>
            <Ionicons name="trash-outline" size={30} color={colors.danger} />
          </View>
          <Text style={styles.h}>{t.heading}</Text>
          <Text style={styles.p}>{t.erased}</Text>
          {t.items.map((i) => (
            <Text key={i} style={styles.li}>
              • {i}
            </Text>
          ))}
          <Text style={styles.p}>{t.kept}</Text>
          <Text style={styles.p}>{t.activeOrders}</Text>

          <Pressable
            style={styles.check}
            onPress={() => setAgreed((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <Ionicons
              name={agreed ? 'checkbox' : 'square-outline'}
              size={24}
              color={agreed ? colors.danger : colors.inkMuted}
            />
            <Text style={styles.checkText}>{t.confirm}</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button title={t.button} disabled={!agreed} loading={busy} onPress={() => void remove()} />
          <Button title={ar.common.back} variant="outline" onPress={() => router.back()} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  h: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 28,
    color: colors.ink,
  },
  p: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 24,
    color: colors.inkSecondary,
  },
  li: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 24,
    color: colors.ink,
    paddingStart: spacing.sm,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.sm,
  },
  checkText: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 20,
    color: colors.danger,
  },
});
