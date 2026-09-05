# Clawdy Builder Starter: Train Your Champion

This directory provides the **Builder Entry Path** for Season 0 of Clawdy.

In Clawdy, there are **two entry paths, one entrant format**:
1. **Player Path:** Use the interactive 3D web application to watch your rover, scrub replays, coach through conversation and quick actions, approve examples, and train in-browser.
2. **Builder Path:** Use standalone TypeScript/JavaScript scripts or local models to inspect scenario observations, collect training data, optimize policy weights, evaluate against baselines, and export standard checkpoint JSON artifacts.

Both paths produce identical, strictly-validated `PolicyCheckpoint` artifacts (`clawdy-checkpoint-v1`) that can run headlessly or inside the 3D Gaussian Splatting + Rapier physics arena.

---

## Quick Start

Run the builder starter training script:

```bash
npm run starter:train
```

This will:
1. Initialize the official Season 0 Course 01 practice scenario.
2. Evaluate the baseline policy checkpoint (`champion-baseline-s0`).
3. Run an episode rollout and collect training examples for high-ridge routing during active flood conditions and core harvesting.
4. Backpropagate cross-entropy loss with momentum SGD to update the 2-layer MLP weights ($24 \to 32 \to 16 \to 8$).
5. Compute deterministic SHA-256 weight hashes and validate against the Season 0 schema.
6. Run an evaluation match against the house rival.
7. Export the trained checkpoint to `starter/champion-checkpoint.json`.

---

## Deploying to the Live Web Arena

Once you have generated `starter/champion-checkpoint.json`:
1. Start the web application: `npm run dev` and open [http://localhost:3000](http://localhost:3000).
2. Scroll to the **Coach & Train Studio** at the bottom of the arena.
3. Click the **Import JSON** button in the Checkpoint controls.
4. Select `starter/champion-checkpoint.json`.
5. The arena will load your checkpoint, verify its cryptographic hash and layer dimensions, and activate it for your Champion rover!
6. Click **Start autonomous run** to watch your trained policy navigate the physical world with 3D Gaussian splatting and Rapier physics.

---

## Architecture Specifications

- **Observation Feature Vector:** 24-dimensional normalized float array encoding:
  - Rover normalized position $(x, y, z)$ and grounding state
  - Cargo ratio and remaining energy ratio
  - Flooding state and active drain status
  - Nearest rival distance and rival cargo ratio
  - Relative distance to champion base, resource bank, and ridge station
  - Available legal actions bitmask
- **Policy Network:**
  - Layer 1: $24 \to 32$ with LeakyReLU
  - Layer 2: $32 \to 16$ with LeakyReLU
  - Action Head: $16 \to 8$ logits with Softmax masking over legal actions
- **Action Classes (8 discrete outputs):**
  - 0: `wait`
  - 1: `bank`
  - 2: `drain`
  - 3: `move: champion-base -> low-pass`
  - 4: `move: champion-base -> ridge-center`
  - 5: `move: low-pass -> resource-bank`
  - 6: `move: ridge-center -> resource-bank`
  - 7: `collect: resource-bank core`
