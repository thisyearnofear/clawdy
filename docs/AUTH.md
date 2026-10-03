# Sign-in (Convex Auth, GitHub)

Signed-out play is unchanged: a browser-minted guest key owns its rows. Signing in adds an
account on top without breaking that.

## How ownership works

- Guest: `guestKey` from the browser (`guest-<uuid>`), owner `guest:<key>`.
- Signed in: the server derives the row key from the verified identity (`user-<convex user id>`,
  owner `user:<id>`). The client's `guestKey` argument is ignored for signed-in calls.
- A guest call that presents a `user-` key is rejected, so account rows cannot be reached by guessing.
- `convex/lib/identity.ts` is the single seam; every public sync function runs its args through
  `withCaller`. `account.claimGuest` moves this browser's guest rows onto the account (the account
  wins duplicate ids). The header chip does it once per sign-in.
- Tests: `convex/__tests__/account.test.ts`.

## One-time setup (per Convex deployment)

1. Create a GitHub OAuth app. Homepage: your site URL. Authorization callback URL:
   `https://<deployment>.convex.site/api/auth/callback/github` (the `.convex.site` URL, not `.convex.cloud`).
2. Set on the deployment (dev and prod separately):

   ```
   npx convex env set AUTH_GITHUB_ID <client id>
   npx convex env set AUTH_GITHUB_SECRET <client secret>
   npx convex env set SITE_URL <where the app is served, e.g. http://localhost:3000>
   ```
3. Generate the JWT keys headlessly (do not use the interactive wizard) and set `JWT_PRIVATE_KEY` and
   `JWKS` with the `NAME=VALUE` form, e.g. `npx convex env set "JWT_PRIVATE_KEY=$KEY"`:

   ```
   node -e 'import("jose").then(async({generateKeyPair,exportPKCS8,exportJWK})=>{const k=await generateKeyPair("RS256",{extractable:true});const priv=await exportPKCS8(k.privateKey);const pub=await exportJWK(k.publicKey);process.stdout.write(JSON.stringify({JWT_PRIVATE_KEY:priv.trimEnd().replace(/\n/g," "),JWKS:JSON.stringify({keys:[{use:"sig",...pub}]})}))})'
   ```
4. `npx convex dev` (or `convex deploy`) to push `auth.ts`, `auth.config.ts`, `http.ts` and the schema.

The Sign in chip only appears when `NEXT_PUBLIC_CONVEX_URL` is set.

## Server-verified ladder

`ladderRun.submit` (a Node action) validates the submitted checkpoint, fetches and hash-checks the
pinned terrain, and replays the brain on fresh hidden Rush layouts (both sides) against every house
bot (`services/ladderRunner.ts`). Scores are written by internal mutations only, keeping each
account's best; the client never supplies one. One verification per account per minute.

Extra deployment variable: `ASSET_BASE_URL`, a publicly reachable origin that serves
`/terrain/sandstone-basin.glb` (falls back to `SITE_URL`, which is not reachable from Convex when it
is `localhost`). Tests: `convex/__tests__/ladder.test.ts`, `services/__tests__/ladderRunner.test.ts`.
