# Tripothon S1 — Clawdy Submission Plan

> **Event:** Tripothon S1 — The 1st World-Building Hackathon (Tripo3D).
> **Source:** https://developers.tripo3d.ai/en/events/tripothon-s1
> **Submission window:** Sep 15 – Oct 5, 2026 (online; closes AoE / UTC-12).
> **Demo Days:** Oct 5–20, 2026 across seven cities. Winner announcement Oct 25, 2026.
> **Theme:** Build a world as a Gift — for the kid I used to be.
> **Status:** active. Owner is the project lead. Update this file as work progresses.

## Why Clawdy fits

- The product is a *generated physical world with rules and a learning loop*. The hackathon's frame is to build a world.
- The arena's playable ground is a Blender-authored mesh (Sep 18 pivot for collider truth and readability). World Labs is live on screen where it earns its place: the bank-burst celebration is Gaussian splats rendered with Spark (programmatic, credit-free), and the Marble cloud-arena origin (`public/marble/`, world id + caption in `world.json`) is retained and credited. A full Marble splat world is deferred pending API credits — see risk register. That maps onto the **Best Use of World Labs** tool track with a claim that matches the pixels.
- The replay → coach → train → compete loop is the synergy. The world is the data the policy learns from, and the policy is what the human trains. That is the strongest argument for "tool synergy" (25% of the tool-track score).
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

## Tier 1 sponsor integration picks

Four concrete integrations, chosen for visible demo payoff inside the 19-day window. They are sequenced into the timeline below.

| # | Pick | Tool | Code surface | Effort | Payoff |
| - | - | - | - | - | - |
| 1 | Distinct rival rover | **Mint** model generation (via existing Mint MCP) | Same sync path as the champion rover, routed through `.devin/skills/mint-threejs-skills/scripts/sync-mint-assets.mjs` (the actual `npm run mint:sync` target). Prompt Mint for a visually distinct rival (low crawler, tracked cargo bot, bipedal scavenger), sync the GLB into `public/assets/mint/rival-rover.glb`, and update the `rivalRover` entry in `mint-assets.json` so it no longer shadows the champion. | ~half a day | High (removes the twin-rover read in the demo) |
| 2 | Energy core / collectible prop | **Mint** model generation OR a hand-authored compound mesh | Either prompt Mint for a stylized core mesh and wire it through the same registry, or replace the procedural octahedron at `components/environment/ArenaWorldView.tsx` `Resource` with a hand-authored crystal + ring + glow mesh for zero external dependency. | ~2 hours (procedural) or ~half a day (Mint) | Medium-High (sharper "what is being collected" moment) |
| 3 | Spark coach-trail overlay | **World Labs Spark** (already mounted in `MarbleWorldLayer.tsx`) | A new `CoachTrailLayer` component inside `<World>`. Reads the `currentMistake.suggested` edgeId from `ArenaScene.tsx` and emits a thin colored splat strip along `course.scenario.edges[edgeId].path`. | 1–2 days | High (World Labs judge sees their renderer doing something new; a coach ghost-path is a unique overlay) |
| 4 | Gift card share image | Built-in `<canvas>.toDataURL()` over the Spark renderer | A new "Share your world" button on the match-complete UI. Captures the current frame plus path ribbons and rover poses, then exports a PNG. | ~1 day | High for theme fit (20%) and viral potential (15%). The "world as a gift" framing becomes a real shareable artifact. |

External surfaces in play:

- **Mint** is the active generative model source. We already have the `mint-threejs-skills` tooling wired, an asset sync script, and a project ID in `mint-assets.json`. A new distinct rival (Pick 1) and the energy core (Pick 2) follow the same path the champion rover took, with new prompts. No new credit cost.
- **Spark** is built by World Labs and is already imported by `MarbleWorldLayer.tsx`. Its Dyno stdlib and procedural splat APIs are documented on sparkjs.dev. The coach trail is a small additional `SplatMesh` placed alongside the world splat, no new dependencies.
- **Tripo** key stays in `.env.local` for any one-off asset we decide we cannot avoid; we do not plan to buy credits.
- **Pre-flight finding**: `mint-assets.json` currently lists `championRover` and `rivalRover` with the **same** asset ID and filename. Pick 1 is as much a registry bug fix as it is a new asset.

## Broader sponsor reach

Tripothon runs each tool track independently and judges each on its own merits. We are committing to **Best Use of World Labs** as our primary sponsor bet, with **Mint** powering the rival rover and energy core. Here is the honest read on every other sponsor's tool track for a solo builder in 19 days, including the ones we are not entering.

| Sponsor | Tool / surface | Reach for Clawdy | Ship-ability in 19 days |
| - | - | - | - |
| **World Labs** | Marble world generator + Spark splat renderer | Primary sponsor bet. The arena is a World Labs splat, the collider pipeline sits on top of it, and Spark (a World Labs product) is our renderer. The coach-trail overlay (Pick 3) and the gift-card capture (Pick 4) both lean on Spark at demo time. | High. Already shipped. Picks 3 and 4 strengthen the synergy score. |
| **Mint** | AI 3D model generation via Mint MCP | Active source for the rival rover (Pick 1) and the energy core (Pick 2). Continues to be the source for the champion rover. The `mint-threejs-skills` skill stays wired. | High. Tooling already wired, just new prompts and registry entries. |
| **Heygears** | 3D printing hardware (UltraCraft, Reflex series) + AI design software ("AI Box") | **Shipped (Sep 24).** `public/prints/champion-rover.stl` (4,745 tris, exported from the in-game Mint champion GLB via `npm run print:stl`), profile in `docs/PRINT_KIT.md`, "Print your champion" download button on the match-complete UI next to the share button. The "world as a gift" theme lands literally: judges can print the rover. | Done. AI Box auto-repair pass is the judges' step, documented as such. |
| **PICO** | WebXR browser on PICO 4 / PICO 4 Ultra headsets (`developer.picoxr.com`) | Stretch only. WebXR with R3F is well-trodden via `@react-three/xr`, but the splat world plus Rapier physics step at stereo framerates is a real blocker. A PICO build would need aggressive splat LOD and a simplified physics step. | Low in 19 days (perf + stereo + on-headset validation, all of which eat days). Documented as a stretch goal for the next iteration. |
| **Jupiter** | Solana DeFi / onchain swap aggregator (`jup.ag`) | **Explicitly out of scope.** Clawdy's binding direction (per `AGENT.md`) retired all wallet / chain / financial-provider integrations. Trying to enter the Jupiter tool track would directly contradict the project's onchain-retirement directive. | Not pursued. Documented here so the choice is on the record. |
| TapNow, Monolith, VitalBridge, ZhenFund | Sponsors without an obvious tool track per the prize breakdown | Not in scope. They appear under the sponsor banner but no separate tool-track prize is listed. | Not pursued. |

**Why we focus on World Labs first**

- World Labs is the only sponsor whose tool we already ship, whose renderer (Spark) we already lean on, and whose generator (Marble) already produced our arena. We claim the full 25% synergy slot on a single sponsor instead of splitting it across three.
- The judging panel includes a World Labs adjudicator. A coherent World Labs submission reads as "we built this on top of your stack and it shows."
- Mint is the cheapest path to a visually distinct rival. Zero new dependencies, just a new prompt and a few lines of registry wiring. They are now the secondary sponsor we actually lean on.

**Why we are deliberate about PICO and Heygears**

- PICO's WebXR stack is feasible, but framerate budgeting for in-headset splats + physics is the kind of perf work that takes days to debug with no shipped guarantee. We list it as a stretch goal so the door is open for an offline Demo Day pitch instead.
- Heygears is honest-effort cheap. STL export plus printer-profile notes is a one-evening job and aligns with the tripothon theme as a tangible physical artifact. It is a credible entry into the Best Use of Heygears tool track and a real "physical gift" deliverable. Worth shipping if Day 11-17 polish time opens up.

## 19-day timeline

| Day | Date | Milestone |
| --- | --- | --- |
| 0 | Sep 16 | Repo reset: README trimmed, this plan live. Tripo key lives in `.env.local` if we ever need it; Mint is the active generative source for picks 1 and 2. |
| 1 | Sep 17 | Lock the contribution narrative (one-pager). Capture hero stills. **Pick 1 + 2 setup**: prompt Mint for a distinct rival rover and an energy core, queue generation jobs. |
| 2 | Sep 18 | Freeze held-out evaluation suite and the baseline-vs-trained table. **Pick 1 + 2 wiring**: download Mint GLBs into `public/assets/mint/`, update the `rivalRover` entry in `mint-assets.json`, replace the procedural `Resource` octahedron (or wire the Mint core prop). |
| 3 | Sep 19 | Browser QA pass on the full coach → train → compete → replay round-trip. **Pick 1 + 2 smoke test**: confirm the rival rover renders distinctly and the new core prop loads. |
| 4 | Sep 20 | Capture coaching loop + trained-checkpoint replay in 1080p desktop. **Pick 3 prototype**: read Spark Dyno overview, place a secondary `SplatMesh` inside `MarbleWorldLayer` and confirm it renders. |
| 5 | Sep 21 | Capture mobile (375×812) replay. **Pick 3 wiring**: when the coach selects a frame and `currentMistake` is set, light up a colored splat strip along the suggested edge path. |
| 6 | Sep 22 | Asset board (4–6 stills + rover turnarounds + collider overlay). **Add Mint rival rover turnaround and Mint energy core stills**. |
| 7 | Sep 23 | Build log post #1 — track reveal + theme framing. **Disclose the Mint rival + energy core and the Spark coach-trail integration** in the post body. |
| 8 | Sep 24 | Build log post #2 — held-out baseline vs trained numbers. **Add a short clip showing the coach ghost-path overlay in action**. |
| 9 | Sep 25 | Voice-over pass + final demo master. **Pick 4 wiring**: add the gift-card share button on the match-complete UI, wired to `gl.domElement.toDataURL()`. |
| 10 | Sep 26 | Buffer / dry run on the demo path. Verify the gift card renders cleanly on both desktop and mobile. |
| 11 – 17 | Sep 27 – Oct 3 | Polish, iterate on QA findings, fix any visual issues with the integration overlays. |
| 18 | Oct 4 | Submission packet ready, recording re-checked, asset board freeze. |
| 19 | Oct 5 | Submit before AoE (UTC-12) close. |

Buffer absorbs a lost day to a CI hiccup or a frame refactor without slipping the deadline.

## Risk register

| Risk | Mitigation |
| --- | --- |
| Browser round-trip on the full coach → train → compete → replay flow is still being hardened (per project plan). | Day 3 is the hard checkpoint. If not green by Day 4, we fall back to a clearly-labeled prepared recording and surface that label on screen. |
| "World as a gift" theme fit is narrative, not automatic. | Bake the framing into the splash and the coach UI before the asset board is captured (Day 1). |
| Held-out generalization has to be measured, not implied. | Replay one annotated held-out success alongside the numbers on the asset board. |
| Soft / cloudy arena readability | Path ribbons + landmarks shipped; regenerate solid dual-route world via `npm run marble:rebuild` when credits allow ([IMMERSIVE_REBUILD.md](../public/marble/IMMERSIVE_REBUILD.md)). |
| Tool-track disqualification if we imply use of tools we don't have. | Enter only the World Labs and Heygears tool tracks (both live on screen); never claim Tripo / PICO / Jupiter. |
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
- [x] Pre-flight survey complete and Tier 1 picks seeded into the timeline.
- [x] Sponsor reach scoped across World Labs, Mint, Heygears, PICO, Jupiter. Primary sponsor bet is Best Use of World Labs.
- [x] Pick 1: distinct rival rover shipped as a hand-authored tracked cargo hauler (TS / tests / build green; browser smoke test still pending).
- [x] Pick 2: hand-authored compound energy core shipped (crystal + dual rotating rings + glow), replacing the procedural octahedron (TS / tests / build green; browser smoke test still pending).
- [x] Pick 3: Spark coach-trail overlay wired — `CoachTrailLayer` reads `currentMistake.suggested.edgeId` from the Workbench and emits a translucent `TubeGeometry` ribbon along the suggested edge during replay scrub (TS / tests / build green; browser smoke test still pending).
- [x] Pick 4: gift-card share button rendered on the match-complete UI — second button next to "Watch replay" calls `canvas.toDataURL('image/png')` (with `preserveDrawingBuffer: true` on the R3F Canvas) and downloads a PNG keyed to scenario id + tick (TS / tests / build green; browser smoke test still pending).
- [x] Bank-burst celebration (Sep 24): Spark-rendered Gaussian-splat puff at the banking base on every banked-total increase — programmatic `constructSplats` (no downloads, no credits, no asset files), pooled 2 meshes × ~160 splats per entrant, agent-colored, lite-mode gated off, scrub/reset safe via tick-regression re-baseline, failures swallowed so effects can never break Play. Pure `detectBankDeltas` helper pinned in `services/arenaPresentation.ts` + tests. Live in `ArenaWorldView` (TS / 143 tests / lint / build green). Browser smoke 9/24: full practice round runs clean (tick 1200/1200, no console errors, Spark chunks load, banks observed firing with zero warnings); the 0.55s puff itself not freeze-framed — capture during demo recording.
- [x] Collect-puff (Sep 24): smaller neutral-gold Spark puff at the resource node on every collect, reusing the burst pool (3 slots × 90 splats, 0.4s life). Pure `detectCollectEvents` helper + tests. Same smoke coverage as bank-burst.
- [x] Heygears print kit (Sep 24): `public/prints/champion-rover.stl` via `npm run print:stl` (stdlib-only `scripts/export-print-stl.py`, refuses Draco rather than guessing), profile in `docs/PRINT_KIT.md`, "Print your champion" button on the match-complete UI. Browser smoke 9/24: button renders correctly on the ROUND COMPLETE panel; STL serves HTTP 200 at the exact byte size.
- [x] v1 checkpoint quarantine (Sep 24): stored v1 brains no longer crash page load (`checkpoint-execution-mismatch` uncaught in hydration). They stay in the list as view-only (`(view-only)` suffix, lineage intact, storage never rewritten); hydration, dropdown select, import, and bracket all refuse execution with the re-train upgrade message. Proven in-browser with a seeded v1 (no crash, notice shown, Play runs to tick 244+). The Rapier `init()` deprecation warning is upstream inside rapier3d-compat 0.19.2's wasm glue (version pinned by postinstall guard) — documented noise, not actionable.
- [x] Live race feed (Sep 24): banks, flood flips, drains, and full-time score as transient viewport toasts (throttled to decision cadence, cap 3, 4.5s expiry, reduced-motion safe). Proven in-browser over a live run ("Rival banks +3", "Flood on the valley", "Waters recede — valley open").
- [x] Souvenir clip export (Sep 24 / perf pass Sep 26): opt-in "Record" arms a low-cost WebM encode (12 fps / VP8 / ~0.9 Mbps) while Play runs; "Save clip" appears on the match-complete panel. Auto-encode-every-run was retired — it hitch the GPU next to `preserveDrawingBuffer`.
- [x] Convex cloud + Vercel (Sep 26): project `clawdy` (dev + prod deployments), functions pushed, `NEXT_PUBLIC_CONVEX_URL` on Vercel Production, live at https://clawdy-nine.vercel.app/. Guest-key exhibition sync only — not ranked auth.
- [x] Play smoothness (Sep 26): visual catch-up capped at 3 ticks/frame; clip Record is opt-in.
- [x] Hero stills: 3 screenshots captured (home page, match-complete with share button, replay view with coach panel). `docs/assets/`.
- [x] Held-out evaluation suite, oracle-routed consequence supervision (Sep 23): `scripts/eval-lib.ts` routes each practice tick to the honest teacher (weather/patience/safe) across the 6-board syllabus, verifies every label by 120-tick counterfactual rollout, trains with consequence weights. Abstract safe 23 / trained 11; grounded practice trained 3→9 (beats safe on the physical course). Results in `docs/eval-holdout.json`, gate pin in `docs/eval-gate.json`, migration log in `docs/COMPATIBILITY.md`.
- [x] Sep 24 pin (`122f676a3d4f`): timing-first syllabus + anti-oscillation / bank-at-base executor — grounded trained 33 (was 29), abstract dual-side 36 (was 20), heldout-02 normal 5 (was 0). Compete open-loop gap (9 vs safe 12) diagnosed via safe-trajectory shadow; two-pass student mine surfaces the t400 valley/ridge contrast but route-only consequence vetoes it (forcing regresses practice).
- [x] Sep 24 evening pin (`86f3dbeb3d2f`): practice-deep student mine + hollow class-5 ridge alias + energy patience (play floor 400) + soft on-node collect — grounded trained **36** (practice 10/8, compete **12**/6), abstract dual-side **36**. See `docs/COMPATIBILITY.md`.
- [x] Browser QA round-trip verified: play → replay scrub → coach panel (rule buttons, propose/approve flow) → share button ("Saved share card" message confirmed). Training from replay is correctly locked until reset.
- [ ] Desktop + mobile walkthrough captured.
- [ ] Asset board assembled.
- [ ] Build log posts #1 and #2 live with `#Tripothon` and `@TripoAI`.
- [ ] Submission packet submitted before Oct 5 AoE.
