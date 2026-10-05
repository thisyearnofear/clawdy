# Clawdy — Development and Release Guide

**Accepted Direction:** Season 0: Train Your Champion.

This guide replaces retired contract and web3 deployment instructions. No wallet funding, chain deployment, indexer, or financial persistence service is a Season 0 prerequisite.

---

## Local Development & Commands

### Prerequisites
- Node.js: v20+ or v24+
- npm: v10+

### Install Dependencies
```bash
npm ci
```
*(Runs postinstall to verify `@dimforge/rapier3d-compat` version 0.19.2)*

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the interactive 3D arena.

### Orbis broadcast (optional; live video)

`REACTOR_API_KEY` is server-only and read by `app/api/reactor/token/route.ts`, which mints a one-session, 5-minute token for the browser. Set it for Production and Preview as a sensitive variable (`printf '%s' "$KEY" | vercel env add REACTOR_API_KEY production --sensitive`) and in `.env.local` for local dev. Without it, Go live reports a connection error and Storyboard mode still works. CLI deploys (`vercel --prod`) work because `prepare` tolerates a missing `.git`.

### Convex sync (optional locally; live in production)
```bash
# First time on a machine (already logged in to Convex):
npx convex project create clawdy --team <team-slug>
npx convex deployment create <team>:clawdy:season0 --type dev --select --default --region us
npx convex deployment create <team>:clawdy:production --type prod --default --region us
npx convex dev --once
npx convex deploy --yes
```

If the local `.env.local` points at an anonymous dev backend (`CONVEX_DEPLOYMENT=anonymous:*`, `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`), `npx convex deploy` errors with "developing anonymously" because it cannot resolve cloud auth. Pass the prod deployment explicitly instead:

```bash
CONVEX_DEPLOYMENT=prod:accomplished-capybara-638 npx convex deploy --yes
```

Day-to-day local development:

```bash
npx convex dev
```

Writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local`. With the URL set, the app runs an offline-first sync protocol (`services/syncEngine.ts` ⇄ `convex/sync.ts`): boot pulls the guest's full mirror (including tombstones), merges last-writer-wins with `localStorage`, restores records created on other devices, then flushes a persisted outbox (`clawdy_sync_queue_v1`). Runtime edits are diffed per record and queued; deletes propagate as tombstones; server-side caps (40 checkpoints / 200 examples / 50 matches / 40 jobs) are enforced at write time and surfaced in the Coach panel status chip with plain-language guidance (for example, that changes are saved on this device and will sync when back online, or that cloud storage is full and a JSON export remains available). Without the URL, the app stays `localStorage`-only. Players can export a checkpoint as JSON from **Coach → Brains, storage & sync** to back it up or move it to another browser. Convex is never on the physics or scored-match inference path.

**Schema changes are a two-push, reviewed procedure.** `convex/schema.ts` changes with new *optional* columns go to a **preview/dev** deployment first together with any backfill (`npx convex run sync:backfillLegacy` — idempotent; stamps owner/LWW clocks and promotes legacy `payload` blobs into the typed `doc` column, flagging rejects as `payloadRejected` instead of destroying them). Verify on the preview, then push to prod. Never deploy a schema that narrows or reinterprets existing columns without the backfill having run. `convex.json` is not required: the default deploy ships every module in `convex/`.

**Production (Vercel):** set `NEXT_PUBLIC_CONVEX_URL` to the **prod** deployment URL (e.g. `https://<deployment>.convex.cloud`) on the Vercel project, then redeploy so the client bundle inlines it. Live app: [https://clawdy.trustfall.xyz/](https://clawdy.trustfall.xyz/). Dashboard: Convex project `clawdy` on the team that owns the deployment. Sign-in needs extra Convex env vars on each deployment: see [AUTH.md](AUTH.md#deployments).

---

## Verification Commands

Every release or submission commit should pass these gates:

```bash
# 1. Run unit & integration test suites
npm test

# 2. Type checking
npx tsc --noEmit

# 3. Strict ESLint checks
npm run lint

# 4. Production Next.js static build
npm run build

# 5. Builder starter smoke test (exports a checkpoint; improvement claim requires additional held-out evaluation)
npm run starter:train
```

---

## Architecture & Deployment Notes

- **Hosting:** Production runs on Vercel ([clawdy.trustfall.xyz](https://clawdy.trustfall.xyz/)). Git pushes to `main` deploy; after changing `NEXT_PUBLIC_*` vars, redeploy so the client rebuild picks them up.
- **Convex:** system of record for the coaching lineage (checkpoints, examples, match/job history) under a browser **guest key**, or under a verified account when signed in (Convex Auth, GitHub; see [AUTH.md](AUTH.md)). Uniqueness is transactional (composite-index read-then-insert); ordering converges on the server `serverSeenAt` clock. Guest keys are exhibition-only; ranked ladder results require a signed-in account (single seam: `convex/lib/identity.ts`).
- **Client-Side Storage:** `localStorage` (`clawdy_checkpoints_v1`, `clawdy_examples_v1`) is a write-behind cache of the zustand arena store (`services/arenaStore.ts`) plus the sync outbox — instant boot, offline play, never a second source of truth when Convex is configured.
- **Import/Export:** Checkpoints are serialized to standard JSON files that can be imported and exported between browser sessions and builder CLI scripts.
- **World Assets:** Sandstone Basin terrain GLB is served statically with a SHA-256 pin in `services/arenaCourse.ts`. The Marble pipeline was retired and removed September 26, 2026 (git history holds the provenance); Spark bank bursts generate splats procedurally and load no Marble assets.
