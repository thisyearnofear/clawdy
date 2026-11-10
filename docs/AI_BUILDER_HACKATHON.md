# Victoria VR AI Builder Hackathon 2026 — Clawdy Plan

> **Event:** AI Builder Hackathon 2026 (Victoria VR).
> **Source (build-period brief):** https://victoriavr.com/news/ai-builder-hackathon-2026-the-building-period-2042daf3
> **Build period:** Sep 11 – Nov 11, 2026. **Submission deadline:** Nov 11, 2026, 16:30 CEST.
> **Winners:** Nov 25, 2026. **Prize pool:** €20,000 (1st €10k, 2nd €5k, 3rd €3k, 4th €1.5k, 5th €500).
> **Status:** ACTIVE — this is the only open external opportunity. [TRIPOTHON.md](TRIPOTHON.md) is closed and archived.
> **Registration:** the registration period closed; early-benefit participants were contacted by email. Confirm our registered/eligible status before submitting.

## The challenge, in their words

Turn plain language into interactive 3D scenes and working logic. The official rule: "submitted projects [must] turn plain language into 3D scenes and working logic." A system should understand what the user wants, create something meaningful from that input, and let the user interact with or keep shaping the result. Browser-based; any 3D stack (R3F is explicitly listed); backend may be hosted separately as long as the experience stays accessible through judging.

Named directions include: prompt-to-world creation, AI-assisted 3D editing, **intelligent NPCs or autonomous agents**, procedural environments, **AI-generated gameplay systems**, interactive storytelling, collaborative creation tools, multimodal workflows.

## Why Clawdy fits — and the honest read

Clawdy's spine is literally natural language → working logic → observable behavior in a live 3D scene:

1. **Coach in plain language.** The user types tactical guidance (or picks a quick rule); `proposeCorrection` turns it into structured training examples the user approves or rejects.
2. **Real weight update.** Approving examples runs a genuine training pass (momentum SGD) on the policy's MLP — the words change the weights.
3. **The 3D scene behaves differently.** The trained brain drives a rover in the Rapier-physics arena; the lesson card shows which decisions moved. Then Prove locks coaching out and the held-out board shows whether the coaching held.
4. **Plain language → 3D asset.** *Forge your champion*: a signed-in player's text prompt generates a one-of-a-kind rover body server-side via Tripo, live in the arena (verified end to end against the real API).
5. **Keep shaping the result.** The loop is iterative by design — Call a route, scrub the replay, coach the frame, retrain, re-race. The world is the data; the policy is what the human trained.

**Honest gaps (do not oversell in the write-up):**

- The NL understanding is keyword/rule-matched, not an open-ended LLM parser. Frame it as a bounded coaching contract, not "prompt-to-anything."
- The arena terrain is authored, not prompt-generated (the Marble-generated first arena was retired Sep 26; see git history). What plain language *does* create here is behavior — and, via Forge, the champion's body.
- Judge-facing risk: "autonomous agents" + "AI-generated gameplay systems" are named directions; we lead with those rather than with prompt-to-world.

**Positioning line:** *an AI-native training league where plain language becomes working logic — you coach a rover in words, its weights actually change, and you watch the 3D arena prove whether your coaching held.*

## Submission packet (their required list)

| Deliverable | Status |
| --- | --- |
| Public code repository | ✅ https://github.com/thisyearnofear/clawdy — keep public and stable through judging |
| Hosted browser demo | ✅ https://clawdy.trustfall.xyz — must stay up and functional through Nov 25 |
| Demo video **under 3 minutes** | ☐ **OPEN — the critical path.** Script exists at [DEMO_SCRIPT.md](DEMO_SCRIPT.md); record the plain-language → train → visible behavior-change beat first |
| Short written description (what you built, problem/opportunity, how AI is used) | ☐ **OPEN.** Draft below; honesty rules from the Tripothon era still apply — claim only what is on screen |
| Chosen focus category | ☐ **OPEN.** The building-period post does not enumerate the categories — pull the exact list from the registration flow / Terms & Conditions and pick (candidate framing: autonomous agents / AI-generated gameplay systems) |

## Draft description beats

- **What we built:** Clawdy, a browser league where you never drive — you coach. A physical 3D arena (Blender-authored terrain shared by renderer and Rapier collider), autonomous rovers with real learned policies, server-authoritative matches with hidden held-out layouts, and a public, re-simulatable replay for every contest.
- **The opportunity we explored:** making machine learning *legible* to a player. The skill is curation — which corrections to approve, when to train — and the payoff is watching your agent use what you taught it after you are no longer allowed to help.
- **How AI is used:** a trained MLP policy updated by the player's own approved corrections; Tripo text-to-3D for the generated chassis bodies and Forge; Spark (World Labs) Gaussian splats for celebration effects; Mint-generated champion rover; LLM-adjacent coaching surfaces. Every tool named here is on screen in a live run or credited in the repo.

## Remaining timeline (deadline Nov 11, 16:30 CEST)

| When | Milestone |
| --- | --- |
| Now | Confirm registration eligibility + exact focus-category list from the organizer form / T&Cs |
| Before freeze | Record <3-min demo (desktop, plus 375×812 mobile pass); final check that prod runs the coaching loop end to end without a console error |
| Deadline − 2h | Written description + category finalized; repo pinned (submission commit SHA recorded); demo uptime confirmed |
| Nov 11, 16:30 CEST | Submit via the organizer channel |
| Nov 11 → 25 | Keep repo + demo accessible through judging; no force-pushes, no breaking deploys |

## Risks

| Risk | Mitigation |
| --- | --- |
| Deadline is the day this plan was written | The product already ships and is live; this is a packaging exercise (video + copy + category), not a build sprint. Cut scope ruthlessly — nothing new in prod before submission |
| Registered status unconfirmed | Check email from the organizers / hackathon login before anything else |
| Focus categories unknown from the public post | Read the T&Cs / submission form; choose the closest named direction, do not invent a category |
| Claiming more NL-magic than exists | The rubric rewards innovation *and* functionality; the verifiable-coaching-loop framing above is fully evidenced in-repo (eval gates, server re-simulation). Keep the honesty discipline from [TRIPOTHON.md](TRIPOTHON.md) |
| Demo must stay up through judging (Nov 25) | Vercel + Convex prod are already live; note the uptime obligation in [DEPLOY.md](DEPLOY.md) operations |

## What changed from the Tripothon plan

- Tripothon S1 closed Oct 5 (winners announced Oct 25) — [TRIPOTHON.md](TRIPOTHON.md) is retained as historical record (track claims, tool-use evidence, provenance), not as an active plan.
- No tool-track constraint here: "the tool itself is not the point. What matters is what you build with it." Tripo / Mint / Spark / Marble remain credited, not scored.
- New hard requirement Tripothon did not have: **plain language must be the input surface**. The coaching loop and Forge are the answer — lead the demo with them.
