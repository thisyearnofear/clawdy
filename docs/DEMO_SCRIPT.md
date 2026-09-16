# Clawdy — Two-Minute Learning Demo

**Target script, not a description of a shipped build.** Follow the accepted [plan](HACKATHON.md). Only present steps that are implemented and supported by actual training and evaluation records.

## One-Sentence Pitch

Clawdy lets you coach and train an autonomous competitor in a generated world, then watch it use what it learned when you can no longer intervene. The arena throws variables your bot was never trained on — and you find out in real time whether your coaching held.

Track: present as a **playable training league** first. Event-specific framing lives in [TRIPOTHON.md](TRIPOTHON.md) / [HACKATHON.md](HACKATHON.md).

## Presentation Sequence

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:15 | Press **Play**. Overview → follow champion. Amber valley paths and teal ridge ribbons visible; flood hits the valley. | "This is my agent, not my avatar. I develop its policy, then it competes without me." |
| 0:15–0:35 | Pause / finish → **Replay**. Scrub a bad route choice. | "When the valley floods, take the ridge — don't drown the short path." |
| 0:35–0:55 | **Coach** panel: propose/approve → **Train**. Or show a labeled prepared checkpoint. | "This correction becomes training data. A saved prompt would not be enough." |
| 0:55–1:20 | Reset → **Match**. Coaching stays off; different flood/core layout. | "Weights are frozen. This layout is outside practice. I cannot help it." |
| 1:20–1:40 | Show the outcome and any before/after banked comparison. | Describe the measured result honestly. |
| 1:40–2:00 | World Labs + Mint credit lines that are actually true; reset. | "The world is the test. Developing the competitor is the game." |

The schedule is presentation pacing, not an estimate of training latency. Benchmark the real workflow before deciding which parts run live.

## Evidence That Must Be Visible

- Which baseline or parent checkpoint is acting.
- The recorded observation and decision being corrected.
- What examples were approved and where they came from.
- A genuine new weight artifact, parent link, and training record.
- Whether the match is live or replayed and whether its scenario is held out.
- Frozen weights and disabled human intervention during the scored run.
- Actual actions and consequences, not only a natural-language decision feed.
- The arena's variables (flooding, resource layout, rival behavior) and how the bot responded to them.
- Evaluation sample count, comparison conditions, and failures alongside scores.

## Sponsor Explanation

Use only the lines corresponding to verified integrations:

- **World Labs:** generated the environment the competitor inhabits.
- **Tripo:** generated the rover or interactive objects shown.
- **Mint:** supplied functional course pieces or helped assemble the playable interaction.
- **Convex:** links approved examples, training status, checkpoint metadata, and match/replay records.

Keep the learned policy distinct from the language-model coach, authored navigation graph, shared steering controller, and physics engine. Do not attribute all of those systems to fine-tuning.

## Reliable Presentation Path

1. Pin the world, collider, route graph, rules version, baseline, and evaluated checkpoint.
2. Preload assets and test the full path on the presentation device.
3. Keep one known practice example and a separately identified held-out scenario ready.
4. Save a fallback recording of a real complete run, including training provenance and results.
5. If training is too slow or unavailable live, label the prepared checkpoint and recorded training explicitly. Do not simulate a progress bar or imply a new update happened live.
6. If a run diverges, use its real outcome or switch to the labeled recording. Never secretly steer the competitor.
7. Make reset restore all episode state and the selected checkpoint without wallet, queue, or console steps.

## Do Not Demo

The retired wallet, auction, vehicle-rental, treasury, chain, and indexer flows are not part of this product. Do not fill a missing learning step with them. Do not substitute a hand-authored route switch for a trained policy and call it learning.

Use [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) to record readiness before presenting.
