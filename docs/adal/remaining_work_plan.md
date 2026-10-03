# Remaining work: Rush, coaching, and competition

Date: 2026-10-02 (Updated: 2026-10-03)
POC: AdaL
Status: Completed. All stages implemented, tested, and landed.

## Scope and order

The current branch contains Rush simulation rules and visual event effects, but players cannot select Rush. The trained checkpoint beats the bundled starter on held-out Rush variants, yet loses more often than it wins against the safe and weather bots. The existing Convex matches table records client-supplied scores under browser-generated guest keys, so it cannot serve as a trusted public ladder.

Ship the following in stages and verify each one before starting the next. Keep the existing Haul evaluation pins and replay compatibility intact.

### 1. Make Rush playable — LANDED

- `components/environment/ArenaScene.tsx`: carries both `course` and `rushCourse` from the loader into the workbench. Added Rush mode alongside Practice and Match. Switching to Rush selects the Rush course and resets the session while ready.
- `services/arenaCourse.ts`: represents Rush as a distinct course mode with sandstone-rush-01 scenario and center core.
- `components/environment/RushEventFX.tsx`: processes newly appended events (`bump`, `core_spawn`) during normal playback using the simulation's authoritative `ArenaSimEvent`.
- Tests for mode selection, Rush replay, and event timing passing across the suite.

### 2. Make code coaching useful locally — LANDED

- Added a typed `Teacher = (observation: ArenaObservation) => ArenaAction` contract in `services/teacher.ts`.
- Local practice-only harness in `scripts/teacher-run.ts` (`npm run teacher:run`) refusing held-out boards.
- Checked-in starter teacher in `starter/teachers/ridge-runner.ts` and documentation in `starter/README.md`.
- Counts illegal choices and thrown errors explicitly; produces standard `PolicyCheckpoint` artifacts ready for import or submission.
- Unit tests: `services/__tests__/teacher.test.ts` (7 passing).

### 3. Improve training with evidence — LANDED

- Diagnosed training bottleneck: timing awareness of center core spawns and flood waves.
- Added public wave timetable to observations (38 features / 9 edge features) and `extendCheckpointForTimetable` in `services/policyModel.ts`.
- Scaled ES training (`scripts/train-es.ts`) with hub-prior warm start (1.5).
- Evaluated on 40 hidden Rush variants across both sides (80 matches per opponent) via `scripts/eval-es.ts`.
- Results: Rush champion (`starter/rush-champion.json`) beats `safe` 77-3-0 (up from 63%), `greedy` 68-6-6, `poach` 75-0-5, and starter 40-0-40. Weather remains challenging at 35-45-0.
- Re-pinned in `docs/eval-es.json`. Haul and `eval:gate` pins remain 100% untouched.

### 4. Build a trustworthy ladder in two steps — LANDED

- **Authentication:** Convex Auth (`@convex-dev/auth`) with GitHub OAuth provider, guest-compatible ownership, and `account.claimGuest` batch migration (`convex/auth.ts`, `convex/account.ts`, `convex/lib/identity.ts`).
- **Server-verified ladder:** `convex/ladderRun.ts` Node action running `services/ladderRunner.ts` against hidden Rush layouts with sha256-verified terrain geometry. Internal score writes only; client never reports ratings.
- Rate-limited to one verification per account per minute.
- UI: `components/workbench/AccountChip.tsx` (sign in, claim guest data) and `components/workbench/LadderDrawer.tsx` (standings, submission flow).
- Tests: `convex/__tests__/account.test.ts`, `convex/__tests__/ladder.test.ts`, and `services/__tests__/ladderRunner.test.ts`.

### 5. Infrastructure & Visual Enhancements — LANDED

- Visual terrain twin built with pinned Blender 4.2.3 in Docker (`infra/blender/Dockerfile`, `infra/blender/build-visual-terrain.sh`), byte-identical sha256 pinned in `arenaCourse.ts`.
- Procedural tileable grain and bump texture detail (`components/environment/terrainDetail.ts`).
- Cloud headless verification harness with Docker Playwright (`infra/verify/run.sh`, `shoot.mjs`) testing desktop, narrow, and mobile viewports with SwiftShader off-host.
- Fixed `FrameLimiter` negative-delta clock freeze on touch/narrow devices (`components/utils/FrameLimiter.tsx`).

## Rejected shortcuts and risks

- Browser-computed rated matches are forgeable. A guest key is an identifier, not authentication.
- Client-side source evaluation in the app's main thread and server-side execution of arbitrary submitted bots expose the app to untrusted code. Start with a trusted local teacher module; add a proper sandbox before pasted code.
- Replacing the graph simulation with open-space physics now would invalidate checkpoints and replays. Keep the graph for this release.
- Improving only ES hyperparameters may make the chart climb without fixing the action bottleneck. Inspect policy decisions first.
- Changing scenario or policy semantics can invalidate pinned recordings; test and version any deliberate incompatibility.

## Acceptance checkpoints

1. A user selects Rush, plays a complete match, watches both event types, and can review the recording. Existing Practice and Match still work.
2. A developer writes a local teacher, produces a validated checkpoint, imports it, and gets an honest before/after comparison on practice and held-out Rush seeds.
3. Training results report wins, draws, losses, and banked margin against starter, safe, and weather on both sides; regressions are visible.
4. Public rankings remain disabled until authenticated, server-run results and adversarial tests pass. The unranked prototype is clearly labeled.

## Review decision

Approve the staged approach before implementation. The first change is the small Rush UI and event integration; the ladder and code-coaching slices have separate safety and infrastructure requirements and should not be presented as already built.
