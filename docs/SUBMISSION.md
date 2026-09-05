# Clawdy — Submission Draft

**Event:** Spatial Intelligence + Generative 3D Hackathon, September 5, 2026.

**Track:** Gaming & Interactive Worlds.

**Status:** target narrative; the learning loop is not yet implemented as of this documentation consolidation. Replace status statements with verified evidence before submitting. The [canonical plan](HACKATHON.md) governs scope.

## Pitch

Clawdy is an agent-training league inside a generated physical world. You coach a competitor through conversation, approve examples, train a new policy checkpoint, and watch it compete without your help. The world tests what the agent learned; developing the competitor is the game.

## Problem and Interaction

Agent behavior is often hidden behind chat responses or scripted demonstrations. Clawdy makes it physical and inspectable: an agent chooses a route, encounters flooding, spends limited game energy, and either completes its objective or fails.

The target interaction is **watch → coach → approve examples → train → compete → replay → improve**. A player corrects a recorded route-choice mistake, trains an actual weight update, and evaluates the resulting frozen checkpoint on scenarios excluded from training.

## What Must Be Demonstrated

- A complete autonomous episode in a generated environment with validated collision and navigation.
- A coaching correction connected to reviewable state/action examples.
- A genuine checkpoint update with parent and training provenance.
- A hands-off run and version comparison on held-out scenarios.
- A replay showing physical consequences and failures, not only text explanations.
- A minimal starter/export path using the same policy contract as the application.

A small learned policy selects decisions; shared navigation and steering execute them. The language-model coach proposes corrections but does not control the scored match. Authored navigation is disclosed. Improvement is measured, not assumed from one selected replay.

## Technology Contributions

| Technology | Intended contribution | Evidence at this docs update |
| --- | --- | --- |
| World Labs | Generated environment for practice and matches. | Existing splat, collider, metadata, and loading/generation code; playability still requires verification. |
| Tripo | Champion body and readable interactive assets. | Planned; no integrated output claimed. |
| Mint | Functional course pieces and interaction assembly. | Planned; no integrated output claimed. |
| Convex | Coaching records, job status, checkpoint metadata, and match/replay records. | Planned; no implementation claimed. |

Update this table with actual asset provenance, source paths, and demonstrated integrations. Do not claim all sponsor technologies merely because they appear in the plan.

## Existing Foundation and New Work

The pre-existing repository contains a Next.js/React Three Fiber scene, Rapier vehicle physics, weather and collection systems, local bots, and World Labs assets. It also contains retired financial infrastructure that is not part of this submission's direction.

The owner reports organizer approval to reuse this repository. New hackathon work must be identified by the actual implementation diff: simulation consolidation, coaching data, real training, checkpoint evaluation, the starter, and sponsor integrations. Do not claim existing work was built during the event.

## Submission Fields to Complete

- Verified Season 0 app URL: **pending**.
- Public repository URL and submitted commit: **pending**.
- Two-minute demo and fallback recording: **pending**.
- Entrant/author details for the submission form: **pending**.
- Training record, parent/new checkpoint identifiers, and approved example provenance: **pending**.
- Evaluation scenario set, version comparison, run count, and failures: **pending**.
- Starter/export artifact and verification instructions: **pending**.
- Actual sponsor asset/integration attribution: **pending**.

An old deployment is not a verified Season 0 release. Use [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) and [DEMO_SCRIPT.md](DEMO_SCRIPT.md) before finalizing this draft.

## Scope Disclosure

Season 0 is a controlled learning-focused exhibition, not a production-grade tournament sandbox. Initial entrants are validated weights for a supported architecture. Arbitrary executable uploads, hosted-inference competitors, human intervention during scored matches, and the retired wallet/auction product are out of scope.
