# Clawdy — Train Your Champion

**Coach an agent. Train its policy. Watch it compete without you.**

Clawdy is building an agent-training league inside a generated physical world. Conversation is the coaching interface; real training turns approved corrections into a new policy checkpoint. In a scored match, the checkpoint is frozen and the agent acts without human intervention.

> The payoff is watching your agent use something you taught it when you are no longer allowed to help.

**Direction locked September 5, 2026:** this is the sole product direction for the repository and the Spatial Intelligence + Generative 3D Hackathon, in the **Gaming & Interactive Worlds** track. The old human-driven arena and onchain-economy approach are retired, not alternative modes.

## Status: Physical Baseline Integrated

The main page now runs the new episode authority on **Cloudbank / Course 01**, an authored course grounded against the committed World Labs collider. A shared Rapier kinematic rover controller performs collision-constrained motion; arrival and collection depend on the resulting pose, not just route time. The collider is checked against a pinned SHA-256 hash before loading the course.

The interface provides safe, shortest-route, and weather-tactician reference policies; start/pause/reset; camera follow; scores and decisions; recorded-run scrubbing; and JSON export. Policy selection is locked after a run starts. The wallet provider, queue onboarding, and old event widget are no longer on the main-page path. Legacy files and API routes still exist pending retirement; they are not a second supported game.

Headless tests traverse every course edge in both directions, complete and replay a physical round, and cover the session controls. **Browser automation remains deferred at the owner's request.** Canvas appearance, splat/collider visual alignment, controls in a real browser, and responsive layout have not been verified. This is a kinematic rover, not a wheeled vehicle-dynamics simulation.

Real policy training, learned-checkpoint execution, coaching UI, the published starter, and Mint, Tripo, and Convex integrations are still pending. Existing deployment links are not verified Season 0 releases. The product experience below remains the target, not a claim that training is available.

The [canonical plan](docs/HACKATHON.md) defines scope, architecture, implementation milestones, current risks, and acceptance criteria. It supersedes every earlier pivot.

## The Target Experience

**Watch → coach → approve examples → train → compete → replay → improve.**

1. Watch your rover compete for resources in a world with a flooded shortcut and a longer safe route.
2. Select a mistake in practice or replay: the rover took the flooded passage.
3. Coach it: “When the lower passage is flooded, take the ridge, even if it is longer.”
4. Inspect and approve the proposed state/action training examples.
5. Train a new checkpoint with genuinely updated policy weights.
6. Run it hands-off on held-out scenarios with different resource placements or weather timing.
7. Compare the new checkpoint with its parent, inspect failures, and improve again.

A chat response or changed route alone is not proof of training. The artifact, approved data, and evaluation results must support the claim. Improvement is measured, not guaranteed.

## Season 0

- One compact world, one coached rover, one rival, two meaningful routes, and one weather intervention.
- A resource-collection and banking challenge supplies stakes; developing the competitor is the main activity.
- A small supported policy architecture and common starting checkpoint; fine-tuning it is allowed.
- Structured observations and high-level decisions, executed by a shared navigation and vehicle controller.
- Practice allows coaching and demonstrations. Scored matches freeze weights and disable human control and external inference.
- A planned starter gives builders the same observation/action contract, evaluation harness, baselines, and entrant format as the app.
- Initial submissions are validated weight artifacts, not arbitrary executable code.

This is an exhibition and first-season foundation, not a claim of production tournament security or arbitrary generated-world understanding.

## Sponsor Roles

| Technology | Role in the target experience | Current status |
| --- | --- | --- |
| World Labs | Generated practice and competition environment. | Splat, collider, metadata, and integration code exist; headless tests cover course traversal, but browser loading and visual rendering still require verification. |
| Tripo | Distinctive rover bodies and readable interactive objects. | Planned. |
| Mint | Functional course pieces and interaction assembly. | Planned. |
| Convex | Coaching examples, training status, checkpoint metadata, match events, and replay access. | Planned; not the physics or training-compute engine. |

Credit only integrations actually used. Generated assets are prepared before matches, not generated on the demo's critical path.

## Architecture Target

```text
Coaching UI / builder workflow
  → approved training examples
  → actual policy training
  → versioned checkpoint
  → frozen policy runner
  → common navigation/controller
  → fixed-step simulation
  → results and replay
```

The renderer displays the world; it must not own match time or determine results through frame rate. Convex connects application records and events, not per-frame physics. The training runtime and exact artifact format remain implementation decisions to validate and freeze.

## Current Local Workflow

1. Wait for the collider check and generated-world load. A failed load stops the run rather than substituting an unrelated arena.
2. Choose each competitor's reference policy while the episode is ready.
3. Start the autonomous run. Camera controls observe the rovers; they do not steer them.
4. Pause or finish, then open Review to scrub recorded state. Export saves the recording as JSON.
5. Reset to clear the episode and unlock policy selection. Backgrounding the page pauses local practice.

This is local practice, not a secure ranked service. Chat coaching and learned checkpoints are not available yet.

## Existing Development Commands

These commands operate the integrated baseline build, not a completed training league. CI currently uses Node.js 20 and npm. The main page uses committed local world assets and does not require a wallet or generation API key. Environment examples still contain retired integrations; do not copy them blindly.

```bash
npm ci
npm run dev
```

Verification commands present in `package.json`:

```bash
npm run lint
npm test
npm run build
```

`npm run start` serves a completed Next.js production build. The new foundation tests can be run without a browser:

```bash
npm test -- services/__tests__/arenaEpisode.test.ts services/__tests__/worldSurface.test.ts services/__tests__/marbleWorld.test.ts
```

See the [implementation status](docs/HACKATHON.md#current-repository-status) for verification results and limitations. Passing the headless reference tests is not evidence that the application scene, physical controller, or learning loop is complete.

Do not fund wallets, deploy contracts, or run the legacy deployment helpers to set up Season 0. See [release guidance](docs/DEPLOY.md) and the [world asset guide](public/marble/README.md) before configuring services or replacing assets.

## Repository Guide

- [Product and implementation plan](docs/HACKATHON.md): the single source of truth.
- [Agent contract and implementation instructions](AGENT.md): target protocol and consolidation rules.
- [Release guidance](docs/DEPLOY.md): current commands, planned services, and verification gates.
- [Two-minute demo](docs/DEMO_SCRIPT.md): evidence-first presentation and labeled fallback.
- [Submission draft](docs/SUBMISSION.md) and [checklist](docs/SUBMISSION_CHECKLIST.md): claims and proof required before submission.
- [World assets](public/marble/README.md): existing pipeline and collider/route validation.
- `components/environment/`, `components/vehicles/`, `hooks/useVehiclePhysics.ts`: reusable code requiring consolidation.
- `services/AgentProtocol.ts`, `services/protocolTypes.ts`, `services/gameStore.ts`: existing state/control code to reshape around the new contract.

## Inspiration and Attribution

The [AI Chessathon starter](https://github.com/advitrocks9/aichessathon-starter) demonstrates a working entrant, common agent interface, progressively stronger baselines, local match harness, and packaging. Clawdy borrows that development-loop concept, not its chess rules or its prohibition on fine-tuning published chess networks. Any source reuse must retain the applicable MIT attribution.

Organizer permission to reuse this repository was reported by the project owner. The submission must distinguish the existing foundation from new hackathon work.
