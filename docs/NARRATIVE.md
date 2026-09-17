# Clawdy — One-Pager

> The shortest version of the story. Read this first if you want to know what we are submitting, why it counts as a "world as a gift", and where the proof lives.

---

## One sentence

Clawdy lets you coach an autonomous competitor inside a generated world, then watch it use what you taught when you can no longer intervene.

## What is the gift

The gift is not the world. The gift is the loop.

A child you once were could never quite master a hard arena. You grew up and built a game where you do not play the arena at all — you coach the agent that plays it. Then you withdraw, and the game tells you whether your coaching was the bottleneck.

The world you hand over is a real, navigable 3D environment with rules, resources, and a rival. The agent you hand over is a small policy network with a real weight update behind it. The replay you leave behind is the receipt that proves whether the gift worked.

## The loop

```
play → replay → coach → train → compete
```

1. **Play** — watch two rovers race for cores in a generated arena. The champion learns nothing on its own.
2. **Replay** — when the round ends, scrub the recording to find the moment it went wrong.
3. **Coach** — point at that moment and say what the careful collector would have done. Approve the correction.
4. **Train** — the approved notes become a real weight update on the champion's brain. Loss and accuracy are reported.
5. **Compete** — the trained brain faces a held-out scenario (different flood timing, different resource layout) with coaching and training off. You watch.

## What makes the claim credible

- The training is a real gradient update on real weights, not a saved prompt and not a hand-authored route switch.
- The held-out scenarios are a separate file (`HELD_OUT_SCENARIOS` in `services/arenaScenarios.ts`). They are never imported into the training set. The split is enforced by the codebase.
- The numbers are reproducible. Re-running `npm run eval:holdout` writes a JSON artifact (`docs/eval-holdout.json`) keyed to a weightsHash. Same hash, same numbers.
- The submission shows two comparisons: safe-collector (the rule-based fallback) vs trained champion, both against the same greedy rival. Where the trained champion beats the greedy rival, it is the coaching, not the routing, that did the work.

## Where the world came from

The arena is a **World Labs** Marble-generated Gaussian splat with an HQ textured mesh underlay and a validated Rapier collider. The renderer is **World Labs Spark**. The rival rover and the energy-core collectible are procedural meshes plumbed through the same asset registry that holds the **Mint**-generated champion rover. None of the sponsor claims are aspirational — every named tool is wired into the running build.

See [`docs/TRIPOTHON.md`](TRIPOTHON.md) for the event plan, [`docs/HACKATHON.md`](HACKATHON.md) for the product plan, and [`docs/eval-holdout.json`](eval-holdout.json) for the held-out numbers.

## The headline image

If the asset board gets one still, it is this: the champion (green) and the rival (orange) crossing paths in the middle of the arena, with a teal ribbon glowing along the safe-baseline edge under a flood. The world is the test. Developing the competitor is the game.
