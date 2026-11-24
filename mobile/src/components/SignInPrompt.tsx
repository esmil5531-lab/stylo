import { router, usePathname } from 'expo-router';

import { ar } from '@/i18n/ar';

import { Button } from './Button';
import { EmptyState } from './QueryState';

/** Shown on account screens (cart, ♡, orders, حسابي) to signed-out visitors. */
export function SignInPrompt() {
  const pathname = usePathname();
  return (
    <EmptyState
      icon="person-circle-outline"
      title={ar.auth.signInPromptTitle}
      hint={ar.auth.signInPromptHint}
      action={
        <Button
          title={ar.auth.signIn}
          onPress={() => router.push({ pathname: '/login', params: { next: pathname } })}
          style={{ alignSelf: 'stretch', marginTop: 16 }}
        />
      }
    />
  );
}
