import GitHub from '@auth/core/providers/github'
import { convexAuth } from '@convex-dev/auth/server'

/**
 * GitHub sign-in. Needs AUTH_GITHUB_ID / AUTH_GITHUB_SECRET plus the JWT_PRIVATE_KEY,
 * JWKS and SITE_URL deployment variables (docs/AUTH.md). Signed-out play stays
 * fully functional on guest keys; see convex/lib/identity.ts for how the two share rows.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub],
})
