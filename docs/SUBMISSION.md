# Clawdy — Hackathon Submission

**Event:** Spatial Intelligence + Generative 3D Hackathon, September 5, 2026.  
**Track:** Gaming & Interactive Worlds.  
**Accepted Direction:** Agent-training league in a generated physical world.

---

## Pitch

Clawdy is an agent-training league inside a generated physical world. You coach an autonomous competitor through conversation and replay scrub frames, approve proposed state/action corrections, train a new neural policy checkpoint via in-browser backpropagation, and watch it compete hands-off under frozen match rules. The physical world provides consequences, constraints, and a visible test of competence: developing the competitor is the game.

---

## The Problem & Innovation

Most "AI agent" games rely on either hidden prompt-injection, unconstrained LLM steering, or scripted state machines. The user never actually trains a model.

Clawdy introduces **true hands-off agent development**:
- **Watch → Coach → Approve Examples → Train → Compete → Replay → Improve**
- The user coaches via natural language or one-click tactical rules.
- The coaching engine inspects the exact physical situation and proposes legal state/action training tuples.
- The user reviews and approves each example in an explicit queue.
- Training performs real supervised backpropagation with momentum SGD on a 2-layer MLP ($24 \to 32 \to 16 \to 8$).
- Weights update into a new checkpoint with a deterministic weight digest and parent lineage; the checkpoint is validated for shape, finite values, and schema version.
- Scored matches freeze weights: no prompt interventions, no human driving, no external network calls.

---

## Two Entry Paths, One Entrant Format

1. **Player Path:** Use the interactive 3D web application. Scrub recorded runs, coach mistakes at specific frames, approve examples, and train in-browser. Checkpoints persist in browser `localStorage` and can be exported as JSON.
2. **Builder Path:** Use the standalone builder starter script:
   ```bash
   npm run starter:train
   ```
   Inspects observations, collects training tuples, trains an MLP checkpoint, evaluates against baselines, and exports `starter/champion-checkpoint.json` which can be uploaded directly into the web app via **Import JSON**.

---

## What Is Demonstrated & Verified

1. **Playable Autonomous Episode in a Generated World:**
   - Authored course on World Labs Gaussian Splat (`arena.spz`) and collision mesh (`collider.glb`) checked with SHA-256 digest (`25f82036...`).
   - Rapier 3D kinematic rover controller running fixed 50ms steps (20Hz) with grounding, slope limits, and recoveries.
   - Dynamic flooding and drain ability changing physical traversal costs.
2. **Frame-Level Coaching & Review:**
   - Scrub through 1,200-tick recordings.
   - "Coach this frame (Tick T)" extracts exact state vectors, agent positions, and flood conditions to propose structured corrections.
3. **True Weight Updates via Backpropagation:**
   - Supervised backpropagation with momentum SGD.
   - New checkpoint with a deterministic weight digest, parent lineage, and explicit training summary (loss, epochs, sample count).
   - Runtime validation rejects invalid tensor shapes, NaNs, and malformed data.
4. **Offline Evaluation & Validation:**
   - `evaluatePolicyCheckpoint` runs a champion checkpoint against a reference rival on a scenario.
   - Strict runtime validation rejecting invalid tensor shapes, NaNs, or malformed data.
   - The default `starter/train.ts` scenario currently yields 0 banked for both baseline and trained checkpoints; the pipeline is wired but the default training data has not yet been hardened to demonstrate a measured improvement.
5. **Builder Starter Kit:**
   - Standalone CLI trainer in `starter/train.ts` runnable with `npm run starter:train`.
   - Generates importable `starter/champion-checkpoint.json`.

---

## Technology Attribution

- **World Labs:** Generated 3D Gaussian Splat (`public/marble/arena.spz`) and collider mesh (`public/marble/collider.glb`) defining the competition environment (Cloudbank Course 01).
- **Rapier 3D:** Collision detection, raycasting surface queries, and kinematic character controller (@dimforge/rapier3d-compat 0.19.2).
- **Three.js & React Three Fiber:** 3D rendering pipeline and camera management.
- **Next.js 16 & React 19:** Application shell, state synchronization, and static deployment build.

---

## Repository & Verification Evidence

- **All Unit & Integration Tests:** 9 test suites, 80 tests passing (100% green in < 2s).
- **Type Checking:** 0 TypeScript errors (`npx tsc --noEmit`).
- **Linter:** 0 ESLint errors or warnings (`npm run lint`).
- **Production Build:** Next.js static build clean (< 2s).
