import { router, usePathname } from 'expo-router';
import { useCallback } from 'react';

import { useSession } from './session';

/**
 * Wraps actions that need an account (add to cart, ♡, checkout…): signed-out customers go to
 * the sign-in screen and come back to the same page afterwards.
 */
export function useRequireSignIn() {
  const { signedIn } = useSession();
  const pathname = usePathname();
  return useCallback(
    (action: () => void) => {
      if (signedIn) action();
      else router.push({ pathname: '/login', params: { next: pathname } });
    },
    [signedIn, pathname],
  );
}
