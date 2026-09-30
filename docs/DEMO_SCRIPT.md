# Clawdy — Two-Minute Learning Demo

**Target script for the shipped Season 0 build** ([plan](HACKATHON.md), [roadmap](ROADMAP.md)). Only present steps that are implemented. Live: [https://clawdy-nine.vercel.app/](https://clawdy-nine.vercel.app/).

## One-Sentence Pitch

Clawdy lets you coach and train an autonomous competitor in a physical world, then watch it use what it learned when you can no longer intervene — including when two specialized rovers contest the same ground.

Track: present as a **playable training league** first. Event framing: [TRIPOTHON.md](TRIPOTHON.md).

## Presentation Sequence

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:12 | Boot → world ready. Play control is visible before the arena. **Champion setup** stays collapsed. Press **Play**; follow green champion. Amber valley / teal ridge. | "This is my agent, not my avatar. I name it, tint it, then develop its policy." |
| 0:12–0:30 | Live race. If a **contested-ground** cue fires, note it's presentation only — routes and pickups decide the score. Flood tip or scorebug flood window. | "The rival contests resources. Floods expose whether my route choices work." |
| 0:30–0:48 | Finish → **Replay**. Scrub to a recorded decision. Pick a supported alternative road (button or the route itself) → **Draft correction** → **Approve** in Coach → **Train**. | "That correction becomes weights — not a saved prompt. Pickup and banking home are shared controller rules; what I taught is route preference." |
| 0:48–1:10 | Show the **Lesson comparison** card: parent vs trained banked, signed **Score change**, first different accepted decision. **Watch the lesson** replays the trained run with the Parent ghost. Do this BEFORE Reset — switching mode clears the comparison. Read the actual delta honestly — it may be positive, zero, or negative; it is not a guaranteed improvement. | "Same practice course, same rival, same controller — this is matched practice evidence, not a held-out ranking." |
| 1:10–1:35 | Reset → **Match**. Coaching locked. Play held-out layout. Outcome. Convex lineage strip if online. | "Weights are frozen. Different floods and cores. I cannot help it." |
| 1:35–2:00 | Credits that are true (World Labs Spark bursts / Marble provenance, Mint rover, Convex sync); print/share if time. Reset. | "The world is the test. Developing the competitor is the game." |

If no contested-ground cue fires live, do not fake one — point at the **Focus** fingerprint and say proximity cues are presentation only; score comes from routes, pickups and banking (`services/arenaEncounter.ts`).

The schedule is presentation pacing, not training latency. Benchmark the real workflow before deciding which parts run live.

## Evidence That Must Be Visible

- Which baseline or parent checkpoint is acting (Style / Active brain).
- Champion **name / look** and **focus fingerprint** when coaching data exists — it summarizes approved notes, it is not a measured competitive-strength readout.
- The recorded observation and decision being corrected.
- Recorded alternative → draft correction → approved example → Train → new checkpoint name.
- Post-train focus line when present.
- Whether the match is live or replayed and whether its scenario is held out.
- Frozen weights and disabled coaching during Match.
- Actual actions and consequences (scorebug, race feed) — not only language.
- Flood / layout variables and how the bot responded.
- Evaluation sample count / comparison when you show Train results.

## Sponsor Explanation

Use only the lines corresponding to verified integrations:

- **World Labs:** Spark bank/collect bursts live on screen; Marble world provenance in git history (assets removed Sep 26); playable ground is the authored Sandstone Basin mesh (see HACKATHON addendum).
- **Mint:** champion rover GLB in the arena (and print STL derived from it).
- **Convex:** dual-writes examples, training jobs, checkpoints, and match summaries under a browser guest key when configured.
- **Tripo:** do not claim unless a Tripo asset is actually on screen.

Keep the learned policy distinct from the language-model coach, authored navigation graph, shared steering controller, and physics engine.

## Reliable Presentation Path

1. Pin the world, collider, route graph, rules version, baseline, and evaluated checkpoint.
2. Preload on the presentation device; hard-refresh [clawdy-nine.vercel.app](https://clawdy-nine.vercel.app/) or local `npm run dev`.
3. Keep one known practice example set and Match mode ready; optional prepared checkpoint labeled as prepared.
4. Save a fallback recording of a real complete run, including training provenance and results.
5. If training is too slow live, label the prepared checkpoint and recorded training explicitly. Do not fake a progress bar.
6. If a run diverges, use its real outcome or the labeled recording. Never secretly steer the competitor.
7. Reset restores episode state and the selected checkpoint — no wallet, queue, or console steps.
8. Help drawer answers “what do I do?” without leaving the compact UI.

## Do Not Demo

The retired wallet, auction, vehicle-rental, treasury, chain, and indexer flows are not part of this product. Do not fill a missing learning step with them. Do not substitute a hand-authored route switch for a trained policy and call it learning. Do not promise ranked auth — guest-key Convex is exhibition sync only.

Use [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) to record readiness before presenting.
