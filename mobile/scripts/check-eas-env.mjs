#!/usr/bin/env node
/**
 * Runs on EAS before a build (npm hook `eas-build-post-install`). A store/preview build has no
 * Metro server to fall back on, so it must be told where the API is — an https address:
 *   EAS dashboard → project → Environment variables → EXPO_PUBLIC_API_URL = https://<domain>/v1
 * (environment "preview" and/or "production"). Stops the build early instead of shipping an app
 * that cannot reach the server.
 */
const profile = process.env.EAS_BUILD_PROFILE;
if (!profile) process.exit(0); // not on EAS
const url = process.env.EXPO_PUBLIC_API_URL ?? '';
if (!/^https:\/\/[^/]+\/v1\/?$/.test(url)) {
  console.error(
    `\n✗ EXPO_PUBLIC_API_URL must be https://<domain>/v1 for the "${profile}" build (got "${url || 'nothing'}").\n` +
      '  Set it in the EAS dashboard → Environment variables (environment: ' + profile + '), then build again.\n',
  );
  process.exit(1);
}
console.log(`✓ ${profile} build talks to ${url}`);
