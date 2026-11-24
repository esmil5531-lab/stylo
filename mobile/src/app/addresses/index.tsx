import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAddresses, useDeleteAddress, useSetDefaultAddress } from '@/api/hooks';
import type { Address } from '@/api/types';
import { AddressCard } from '@/components/address/AddressCard';
import { Button } from '@/components/Button';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SignInPrompt } from '@/components/SignInPrompt';
import { ar } from '@/i18n/ar';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/theme';

const t = ar.addresses;
const MAX = 10;

/**
 * «عناويني». With `?select=1` (opened from the cart) tapping an address makes it the delivery
 * address — the default, which prices delivery — and goes back to the cart.
 */
export default function AddressesScreen() {
  const { select } = useLocalSearchParams<{ select?: string }>();
  const selecting = select === '1';
  const { signedIn } = useSession();
  const addresses = useAddresses();
  const setDefault = useSetDefaultAddress();
  const remove = useDeleteAddress();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const choose = (a: Address) => {
    if (a.isDefault) return router.back();
    setDefault.mutate(a.id, { onSuccess: () => router.back() });
  };
  const addHref = (selecting ? '/addresses/new?select=1' : '/addresses/new') as Href;
  const error = setDefault.error ?? remove.error;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={selecting ? t.chooseTitle : t.title} />
      {!signedIn ? (
        <SignInPrompt />
      ) : (
        <QueryState query={addresses} minHeight={300}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState
                icon="location-outline"
                title={t.empty}
                hint={t.emptyHint}
                action={<Button title={t.add} onPress={() => router.push(addHref)} style={styles.cta} />}
              />
            ) : (
              <ScrollView contentContainerStyle={styles.content}>
                {items.map((a) => (
                  <AddressCard
                    key={a.id}
                    address={a}
                    selected={selecting && a.isDefault}
                    onPress={selecting ? () => choose(a) : undefined}
                    footer={
                      selecting ? null : confirmDelete === a.id ? (
                        <View style={styles.confirm}>
                          <Text style={styles.confirmText}>{t.deleteConfirm}</Text>
                          <View style={styles.actions}>
                            <Button
                              title={t.deleteYes}
                              loading={remove.isPending}
                              onPress={() => remove.mutate(a.id, { onSettled: () => setConfirmDelete(null) })}
                              style={styles.flex}
                            />
                            <Button
                              title={t.cancel}
                              variant="outline"
                              onPress={() => setConfirmDelete(null)}
                              style={styles.flex}
                            />
                          </View>
                        </View>
                      ) : (
                        <View style={styles.links}>
                          <Text
                            style={styles.link}
                            accessibilityRole="button"
                            onPress={() => router.push(`/addresses/${a.id}` as Href)}
                          >
                            {t.edit}
                          </Text>
                          {!a.isDefault && (
                            <Text style={styles.link} accessibilityRole="button" onPress={() => setDefault.mutate(a.id)}>
                              {t.makeDefault}
                            </Text>
                          )}
                          <Text
                            style={[styles.link, styles.danger]}
                            accessibilityRole="button"
                            onPress={() => setConfirmDelete(a.id)}
                          >
                            {t.delete}
                          </Text>
                        </View>
                      )
                    }
                  />
                ))}
                {error && <Text style={styles.error}>{errorMessage(error)}</Text>}
                {items.length < MAX ? (
                  <Button title={t.add} variant="outline" onPress={() => router.push(addHref)} />
                ) : (
                  <Text style={styles.muted}>{t.max(MAX)}</Text>
                )}
              </ScrollView>
            )
          }
        </QueryState>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  cta: { alignSelf: 'stretch', marginTop: spacing.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xs },
  link: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 24, color: colors.primary },
  danger: { color: colors.danger },
  confirm: { gap: spacing.sm, marginTop: spacing.xs, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.sm },
  confirmText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 22, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  error: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.danger, textAlign: 'center' },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkMuted, textAlign: 'center' },
});
