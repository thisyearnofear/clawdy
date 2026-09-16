# Tripothon S1 — Clawdy Submission Plan

> **Event:** Tripothon S1 — The 1st World-Building Hackathon (Tripo3D).
> **Source:** https://developers.tripo3d.ai/en/events/tripothon-s1
> **Submission window:** Sep 15 – Oct 5, 2026 (online; closes AoE / UTC-12).
> **Demo Days:** Oct 5–20, 2026 across seven cities. Winner announcement Oct 25, 2026.
> **Theme:** Build a world as a Gift — for the kid I used to be.
> **Status:** active. Owner is the project lead. Update this file as work progresses.

## Why Clawdy fits

- The product is a *generated physical world with rules and a learning loop*. The hackathon's frame is to build a world.
- The arena is built on World Labs output: Gaussian splat, HQ textured mesh (~600k triangles, World Labs CDN), validated collider. That maps directly onto the **Best Use of World Labs** tool track, which is the only tool track whose required tool is one we already ship.
- The replay → coach → train → compete loop is the synergy. The world is the data the policy learns from, and the policy is what the human trains. That is the strongest argument for "tool synergy" (25% of the tool-track score).
- Two rovers compete on a real 3D physics arena with multiple resources, multiple routes, multiple floodable zones, an energy-budgeted drain, and a held-out evaluation split. That is the kind of playable, complete world a Game-track judge can run.

## Track selection

| Track | Enter? | Reason |
| --- | --- | --- |
| Direction 01 — **Game** | **Yes (primary direction track)** | Playable arena with rules, mechanics, AI opponent, and replay. Game-track has dedicated judges (Rockstar AP plus independent game creators). |
| Direction 02 — Film / VFX | No | Wrong medium; no cinematic output. |
| Direction 03 — VR / XR / AR | No | No VR build. |
| Direction 04 — App | Optional secondary | The Coach panel is a creative-tool web surface, but Game is the better home for the entry. |
| Direction 05 — Physical Design | No | Nothing is being printed. |
| **Best Use of World Labs** tool track | **Yes (additive tool track)** | World Labs is the primary environment source. World Labs is also on the judge panel. |
| Tripo tool track | **No** | We do not use Tripo; tool-track entries that don't actually use the named tool are disqualified. |
| PICO / Heygears / Jupiter tool tracks | No | Not used. |

## Theme fit — "Build a world as a Gift"

Theme fit is 20% of the direction-track score. The frame we will land:

- Clawdy is a world you can give someone and watch them get better at it.
- The gift is not the world itself — it is the loop. A coach hands over a world and then withdraws, and you watch what the recipient's agent does with what it was taught.
- "For the kid I used to be": a kid who could never quite master a hard arena grows up and builds a game where you coach an agent instead of playing one, then finds out whether your coaching was the bottleneck.

Visible in entry assets: keep the voice that already lives in the splash copy and the coach UI — *a world that plays with you, then lets you train it* — on the asset board and the screen recording.

## Required deliverables

| Deliverable | Required? | How we produce it |
| --- | --- | --- |
| Complete playable demo | Yes | `npm run dev` (player path) and `npm run starter:train` (builder path). Both produce the same checkpoint and run under the same match rules. |
| Screen recording (walkthrough, not trailer) | Yes | Real interactive recording on desktop and at 375×812 mobile. No marketing-style cuts. |
| Visual asset board | Yes | Splat stills + HQ mesh stills + collider overlay + Mint rover turnarounds + trained-vs-baseline score chart. |
| Public build log | Optional but amplified by judges | Devlog posts on X / Discord tagged `#Tripothon` and `@TripoAI`. |

Judges weight inventive use of the named tool (35%) and tool synergy (25%) for tool-track entries, so the screen recording and the asset board should make the World Labs origin visible on screen, not only in code or README.

## 19-day timeline

| Day | Date | Milestone |
| --- | --- | --- |
| 0 | Sep 16 | Repo reset: README trimmed, this plan live. |
| 1 | Sep 17 | Lock the contribution narrative (one-pager). Capture hero stills. |
| 2 | Sep 18 | Freeze held-out evaluation suite and the baseline-vs-trained table. |
| 3 | Sep 19 | Browser QA pass on the full coach → train → compete → replay round-trip. |
| 4 | Sep 20 | Capture coaching loop + trained-checkpoint replay in 1080p desktop. |
| 5 | Sep 21 | Capture mobile (375×812) replay. |
| 6 | Sep 22 | Asset board (4–6 stills + rover turnarounds + collider overlay). |
| 7 | Sep 23 | Build log post #1 — track reveal + theme framing. |
| 8 | Sep 24 | Build log post #2 — held-out baseline vs trained numbers. |
| 9 | Sep 25 | Voice-over pass + final demo master. |
| 10 | Sep 26 | Buffer / dry run on the demo path. |
| 11 – 17 | Sep 27 – Oct 3 | Polish, iterate on QA findings. |
| 18 | Oct 4 | Submission packet ready, recording re-checked. |
| 19 | Oct 5 | Submit before AoE (UTC-12) close. |

Buffer absorbs a lost day to a CI hiccup or a frame refactor without slipping the deadline.

## Risk register

| Risk | Mitigation |
| --- | --- |
| Browser round-trip on the full coach → train → compete → replay flow is still being hardened (per project plan). | Day 3 is the hard checkpoint. If not green by Day 4, we fall back to a clearly-labeled prepared recording and surface that label on screen. |
| "World as a gift" theme fit is narrative, not automatic. | Bake the framing into the splash and the coach UI before the asset board is captured (Day 1). |
| Held-out generalization has to be measured, not implied. | Replay one annotated held-out success alongside the numbers on the asset board. |
| Soft / cloudy arena readability | Path ribbons + landmarks shipped; regenerate solid dual-route world via `npm run marble:rebuild` when credits allow ([IMMERSIVE_REBUILD.md](../public/marble/IMMERSIVE_REBUILD.md)). |
| Tool-track disqualification if we imply use of tools we don't have. | Enter only the World Labs tool track; never claim Tripo / PICO / Heygears / Jupiter. |
| Replay-state equality is not cross-platform determinism. | Cite the held-out evaluation table; do not promise device-portable results. |

## Out of scope for this submission

- A second course or a non-World Labs world. We use the existing Course 01 to keep the held-out story defensible.
- Connecting Tripo, PICO, Heygears, or Jupiter — and we will not imply that we have.
- Offline Demo Day travel. We compete for the global online pool, which is open to all entrants.

## Reference

- Hackathon brief (source of truth): https://developers.tripo3d.ai/en/events/tripothon-s1
- Project plan and architecture: [`docs/HACKATHON.md`](HACKATHON.md)
- Demo script: [`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md)
- Release checklist: [`docs/SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md)
- Implementation contract: [`AGENT.md`](../AGENT.md)

## Status

- [x] Tripothon S1 plan and framing documented (this file).
- [ ] Hero stills captured for the asset board.
- [ ] Held-out evaluation suite frozen with measured baseline-vs-trained table.
- [ ] Browser QA round-trip verified.
- [ ] Desktop + mobile walkthrough captured.
- [ ] Asset board assembled.
- [ ] Build log posts #1 and #2 live with `#Tripothon` and `@TripoAI`.
- [ ] Submission packet submitted before Oct 5 AoE.
