# Clawdy Builder Starter: Train Your Champion

This directory provides the **Builder Entry Path** for Season 0 of Clawdy.

In Clawdy, there are **two entry paths, one entrant format**:
1. **Player Path:** Use the interactive 3D web application to watch your rover, scrub replays, coach through conversation and quick actions, approve examples, and train in-browser.
2. **Builder Path:** Use standalone TypeScript/JavaScript scripts or local models to inspect scenario observations, collect training data, optimize policy weights, evaluate against baselines, and export standard checkpoint JSON artifacts.

Both paths produce identical, strictly-validated `PolicyCheckpoint` artifacts (`season-0.checkpoint.v1`) that can run headlessly or inside the 3D Gaussian Splat + Rapier physics arena.

---

## Quick Start

Run the builder starter training script:

```bash
npm run starter:train
```

This will:
1. Initialize a synthetic practice scenario for the builder pipeline.
2. Evaluate the baseline policy checkpoint (`champion-baseline-s0`).
3. Run an episode rollout and collect training examples for high-ridge routing during active flood conditions and core harvesting.
4. Backpropagate cross-entropy loss with momentum SGD to update the 2-layer MLP weights ($24 \to 32 \to 16 \to 8$).
5. Compute a deterministic weight digest and validate the checkpoint against the Season 0 schema.
6. Run an evaluation match against the house rival.
7. Export the trained checkpoint to `starter/champion-checkpoint.json`.

> **Current status:** The default synthetic scenario now demonstrates a real improvement (`Baseline Banked: 0` → `Trained Banked: 4`). The starter still uses a single scenario for the builder smoke test; held-out evaluation and multi-seed generalization are the next steps.

---

## Deploying to the Live Web Arena

Once you have generated `starter/champion-checkpoint.json`:
1. Start the web application: `npm run dev` and open [http://localhost:3000](http://localhost:3000).
2. Scroll to the **Coach & Train Studio** at the bottom of the arena.
3. Click the **Import JSON** button in the Checkpoint controls.
4. Select `starter/champion-checkpoint.json`.
5. The arena will load your checkpoint, validate its layer dimensions and finite weights, and activate it for your Champion rover.
6. Click **Start autonomous run** to watch your trained policy navigate the physical world with 3D Gaussian splatting and Rapier physics.

---

## Architecture Specifications

- **Observation Feature Vector:** 24-dimensional normalized float array encoding:
  - Normalized cargo and energy ratios
  - Flooding state and active drain status
  - Remaining episode time, transit state, and transit progress
  - Whether the rover is at its base, grounded, recovering, or on a blocked edge
  - Availability of `collect`, `bank`, and `drain` actions
  - Presence of floodable/non-floodable outgoing edges and whether the floodable edge is currently slowed
  - Resource availability at neighboring nodes
  - Rival cargo, rival banked, and relative advantage
  - A bias constant
- **Policy Network:**
  - Layer 1: $24 \to 32$ with Tanh
  - Layer 2: $32 \to 16$ with Tanh
  - Action Head: $16 \to 8$ logits with Softmax, masked to legal actions at inference
- **Action Classes (8 discrete outputs):**
  - 0: `wait`
  - 1: `bank`
  - 2: `collect`
  - 3: `drain`
  - 4: `move-low` — move along a floodable edge
  - 5: `move-high` — move along a non-floodable edge (e.g. the ridge)
  - 6: `move-resource` — move toward a node with an available resource
  - 7: `move-home` — move toward the champion base
