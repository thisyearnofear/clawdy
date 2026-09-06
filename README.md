# Clawdy — Train Your Champion

**Coach an agent. Train its policy. Watch it compete without you.**

Clawdy is an agent-training league inside a generated physical world. Conversation and replay scrubbing are the coaching interface; real supervised backpropagation turns approved corrections into a versioned neural policy checkpoint. In a scored match, the checkpoint is frozen and the agent acts without human intervention.

> The payoff is watching your agent use something you taught it when you are no longer allowed to help.

**Direction locked September 5, 2026:** this is the sole product direction for the repository and the Spatial Intelligence + Generative 3D Hackathon, in the **Gaming & Interactive Worlds** track.

---

## The Season 0 Loop

**Watch → Coach → Approve Examples → Train Checkpoint → Compete → Replay → Improve**

1. **Watch:** Observe your champion rover compete for energy cores on **Cloudbank / Course 01** against an autonomous house rival.
2. **Coach:**
   - Use natural language guidance (e.g. *"Climb the ridge in floods to avoid submerged routes"*) or one-click tactical rules.
   - Scrub any frame in the replay viewer and click **"Coach this frame (Tick T)"** to correct specific mistakes in context.
3. **Approve:** Review proposed state/action corrections in the queue; inspect rationale, state vectors, and preferred actions before approving.
4. **Train Checkpoint:** Run supervised backpropagation with momentum SGD directly in the browser or via CLI. Weights update into a new checkpoint with a deterministic weight digest and parent lineage.
5. **Compete:** Activate your newly trained checkpoint and start an autonomous hands-off run under frozen competitive rules.
6. **Replay & Export:** Inspect physical consequences in replay scrub, export run recordings, or export your trained checkpoint as JSON.

---

## Two Entry Paths, One Entrant Format

Clawdy supports two symmetrical ways to build and train competitors:

1. **Player Path (Interactive Web Application):**
   - Open the web application at [http://localhost:3000](http://localhost:3000).
   - Scrub runs, coach frames, approve examples in the studio, and train checkpoints with instant feedback.
   - Checkpoints persist automatically in browser `localStorage` and can be exported as `.json` or imported at any time.

2. **Builder Path (Standalone Starter Kit):**
   - Run the headless trainer:
     ```bash
     npm run starter:train
     ```
   - Executes offline roll-outs, extracts state/action training tuples, trains an MLP checkpoint, evaluates against baselines, and generates `starter/champion-checkpoint.json`.
   - Click **Import JSON** in the web app to upload and run your builder checkpoint in the 3D physics arena.

Both entry paths produce identical `PolicyCheckpoint` artifacts (`clawdy-checkpoint-v1`) adhering to the same 24-dimensional observation vector and 8-action discrete output space.

---

## Physical Challenge & Simulation Architecture

- **Generated World:** World Labs Gaussian Splat (`public/marble/arena.spz`) and collision mesh (`public/marble/collider.glb`) verified with pinned SHA-256 digest (`25f82036...`).
- **Physical Dynamics:** Rapier 3D 0.19.2 character controller with grounding, slope limits, and recovery mechanics.
- **Fixed-Step Clock:** Fixed 50ms (20Hz) simulation steps decoupled from display frame rate. Decisions are locked on a 4-tick cadence.
- **Strategic Tradeoff:** A fast low-pass valley route and an elevated ridge route. When floods hit, the low route suffers a 4× travel penalty. Rovers can spend finite energy to drain water, opening the low route for both rovers.

```text
Coaching UI or Builder CLI
  → Reviewed state/action examples (ArenaTrainingExample)
  → Supervised Momentum SGD Backpropagation
  → Validated checkpoint + deterministic weight digest
  → Frozen policy runner (createLearnedPolicy)
  → Bounded 4-tick decisions
  → Shared Rapier kinematic controller & course topology
  → Results & replay records
  → 3D Splat World & Frame-level Review UI
```

---

## Development & Verification

### Prerequisites
- Node.js 20+ or 24+
- npm 10+

### Setup & Dev Server
```bash
npm ci
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### Builder Starter Training
```bash
npm run starter:train
```

### Full Verification Suite
```bash
# Unit & integration tests (80 tests across 9 suites)
npm test

# Type checking
npx tsc --noEmit

# Strict ESLint checks
npm run lint

# Production Next.js static build
npm run build

# Builder starter smoke test
npm run starter:train
```

### Current Status and Limitations
- The physical episode, MLP training pipeline, checkpoint I/O, and Coach & Train UI are wired and pass code-level tests.
- The default builder starter (`npm run starter:train`) now trains on three practice scenarios and reports `Baseline 0 → Trained 12` on practice and `0 → 12` across three held-out scenarios (4/4 on each).
- Browser rendering, controls, and responsive layout have not been verified; visual QA is deferred until the project owner approves browser automation.

---

## Technology Attribution

- **World Labs:** Gaussian splat scene (`arena.spz`) and 3D collider (`collider.glb`) providing the physical environment for Course 01.
- **Rapier Physics:** Deterministic 3D character controller and collision queries (@dimforge/rapier3d-compat 0.19.2).
- **React Three Fiber & Three.js:** 3D scene composition and rendering pipeline.
- **Next.js & React 19:** Application shell, state management, and static build export.
