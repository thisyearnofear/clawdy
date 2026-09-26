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

### Convex sync (optional locally; live in production)
```bash
# First time on a machine (already logged in to Convex):
npx convex project create clawdy --team <team-slug>
npx convex deployment create <team>:clawdy:season0 --type dev --select --default --region us
npx convex deployment create <team>:clawdy:production --type prod --default --region us
npx convex dev --once
npx convex deploy --yes
```

Day-to-day local development:

```bash
npx convex dev
```

Writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local`. With the URL set, the app runs an offline-first sync protocol (`services/syncEngine.ts` ⇄ `convex/sync.ts`): boot pulls the guest's full mirror (including tombstones), merges last-writer-wins with `localStorage`, restores records created on other devices, then flushes a persisted outbox (`clawdy_sync_queue_v1`). Runtime edits are diffed per record and queued; deletes propagate as tombstones; server-side caps (40 checkpoints / 200 examples / 50 matches / 40 jobs) are enforced at write time and surfaced in the Coach panel status chip (`offline · 3 queued`) instead of swallowed warnings. Without the URL, the app stays `localStorage`-only. Convex is never on the physics or scored-match inference path.

**Schema changes are a two-push, reviewed procedure.** `convex/schema.ts` changes with new *optional* columns go to a **preview/dev** deployment first together with any backfill (`npx convex run sync:backfillLegacy` — idempotent; stamps owner/LWW clocks and promotes legacy `payload` blobs into the typed `doc` column, flagging rejects as `payloadRejected` instead of destroying them). Verify on the preview, then push to prod. Never deploy a schema that narrows or reinterprets existing columns without the backfill having run. `convex.json` is not required: the default deploy ships every module in `convex/`.

**Production (Vercel):** set `NEXT_PUBLIC_CONVEX_URL` to the **prod** deployment URL (e.g. `https://<deployment>.convex.cloud`) on the Vercel project, then redeploy so the client bundle inlines it. Live app: [https://clawdy-nine.vercel.app/](https://clawdy-nine.vercel.app/). Dashboard: Convex project `clawdy` on the team that owns the deployment.

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

- **Hosting:** Production runs on Vercel ([clawdy-nine.vercel.app](https://clawdy-nine.vercel.app/)). Git pushes to `main` deploy; after changing `NEXT_PUBLIC_*` vars, redeploy so the client rebuild picks them up.
- **Convex:** system of record for the coaching lineage (checkpoints, examples, match/job history) under a browser **guest key** — exhibition trust, not Convex Auth. Uniqueness is transactional (composite-index read-then-insert); ordering converges on the server `serverSeenAt` clock. Guest keys are exhibition-only; ranked identity needs Convex Auth later (single seam: `convex/lib/identity.ts`).
- **Client-Side Storage:** `localStorage` (`clawdy_checkpoints_v1`, `clawdy_examples_v1`) is a write-behind cache of the zustand arena store (`services/arenaStore.ts`) plus the sync outbox — instant boot, offline play, never a second source of truth when Convex is configured.
- **Import/Export:** Checkpoints are serialized to standard JSON files that can be imported and exported between browser sessions and builder CLI scripts.
- **World Assets:** Sandstone Basin terrain GLB is served statically with a SHA-256 pin in `services/arenaCourse.ts`. The Marble pipeline was retired and removed September 26, 2026 (git history holds the provenance); Spark bank bursts generate splats procedurally and load no Marble assets.
