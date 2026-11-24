import { router, useLocalSearchParams, type Href } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMe, useSaveAddress } from '@/api/hooks';
import { AddressForm } from '@/components/address/AddressForm';
import { QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SignInPrompt } from '@/components/SignInPrompt';
import { ar } from '@/i18n/ar';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/theme';

/** New address. Opened from the cart (`?select=1`) it becomes the delivery address and returns to the cart. */
export default function NewAddressScreen() {
  const { select } = useLocalSearchParams<{ select?: string }>();
  const selecting = select === '1';
  const { signedIn } = useSession();
  const me = useMe();
  const save = useSaveAddress();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={ar.addresses.newTitle} />
      {!signedIn ? (
        <SignInPrompt />
      ) : (
        <QueryState query={me}>
          {(user) => (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <AddressForm
                // The customer usually receives their own parcel: start from their name and phone.
                initial={{ recipientName: user.fullName, phone: user.phone ?? '' }}
                showDefaultToggle={user.addressesCount > 0 && !selecting}
                submitting={save.isPending}
                error={save.error ? errorMessage(save.error) : null}
                onSubmit={(input) =>
                  save.mutate(selecting ? { ...input, isDefault: true } : input, {
                    // Back to the cart already open underneath (navigate would open a second one).
                    onSuccess: () => (selecting ? router.dismissTo('/cart' as Href) : router.back()),
                  })
                }
              />
            </ScrollView>
          )}
        </QueryState>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
});

