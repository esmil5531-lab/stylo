import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAddresses, useSaveAddress } from '@/api/hooks';
import { AddressForm } from '@/components/address/AddressForm';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SignInPrompt } from '@/components/SignInPrompt';
import { ar } from '@/i18n/ar';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/theme';

/** Edit one address (sends every field; the API keeps what didn't change). */
export default function EditAddressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { signedIn } = useSession();
  const addresses = useAddresses();
  const save = useSaveAddress();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={ar.addresses.editTitle} />
      {!signedIn ? (
        <SignInPrompt />
      ) : (
        <QueryState query={addresses}>
          {(items) => {
            const address = items.find((a) => a.id === id);
            if (!address) return <EmptyState icon="location-outline" title={ar.addresses.empty} />;
            return (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <AddressForm
                  initial={address}
                  submitting={save.isPending}
                  error={save.error ? errorMessage(save.error) : null}
                  onSubmit={(input) => save.mutate({ id: address.id, ...input }, { onSuccess: () => router.back() })}
                />
              </ScrollView>
            );
          }}
        </QueryState>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
});
