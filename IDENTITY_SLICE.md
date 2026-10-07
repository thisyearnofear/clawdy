# Clash-first identity slice

**Status: landed Oct 7, 2026** — merged to `main` as stacked PRs #13 (`feat/clash-first-identity`) → #14 (`feat/clash-legibility-collapse`) → #15 (`feat/clash-steal-highlight`), in that order. Each commit was made lint/typecheck-clean before merge.

#14 collapsed the door taxonomy further than this note's original design: **player doors are Clash vs Prove only** — Tutor and Rush were removed as player-facing labels and stay internal names (`PlayerDoor = 'clash' | 'prove'` in `services/decisionCaption.ts`). It also added a `steal` decision-reason bucket (from recorded bump events and Raider steal windows) and moved the perk-moment copy into `perkTelegraphMoment`. #15 added the Raider full-load steal highlight PIP (`services/stealHighlight*.ts`, `components/workbench/StealHighlightPip.tsx`, `app/api/steal-highlight`) — presentation only, score untouched; see `docs/SCENES.md` §Steal-highlight spike.

North star: **Clash is the game; Prove is the held-out test.**

## What landed

### 1. Copy authority (Call steers)
Help / README previously claimed Call “does not steer” / “without steering the current race.” That contradicted `services/liveCall.ts` (sticky destination preference for the rest of the unranked run + Train lesson queue).

- **Truth now:** Call **steers this unranked race** and queues an approved Train lesson. Scored Prove (Match) stays locked.
- Clash-first framing: Clash first; Prove locks coaching.

### 2. Decision language
Shared mid-run caption: **planned · alternative · one plain reason** (`flood` / `rival` / `steal` / `energy` / `cargo` / `bank` — `steal` added in #14 from recorded bump events + Raider steal windows).

- Pure helper: `services/decisionCaption.ts` — uses real `lastOutcome` / transit / `availableActions` / weather / rival visibility / sim events only. No invented explainability (missing fields stay absent).
- Wired into HUD intent (`ViewportHud`) and champion `AgentCard` via `ArenaScene`.
- `describeArenaDecision` prefers the caption when data exists.

### 3. Mode collapse (player-facing doors)
**Clash vs Prove only** — Tutor and Rush were dropped as player-facing doors in the #14 legibility collapse (they remain internal play-mode names). Softened Training Grounds / Practice / Match / Skirmish pile-up where cheap:

| Door | Internal | Where |
| --- | --- | --- |
| **Clash** | unranked run (Skirmish or Season-0 ruleset, practice/rush playModes) | RulesetPicker, HUD, Build, Ladder, hero |
| **Prove** | Match / compete | Mode toggle, HUD, Help |

Season 0 eval ids, scenarios, and `eval:gate` pins are untouched.

### 4. Perk telegraph
First Skirmish minute (~ticks 40–1200): one-shot run tip naming **Hauler 4 / Raider steal / Scout 2-hop**, plus chassis-specific line — before Forge push.

Constants: `SKIRMISH_PERK_TELEGRAPH` in `services/chassis.ts`.

## Files changed

```
AGENT.md
README.md
IDENTITY_SLICE.md
components/environment/ArenaScene.tsx
components/workbench/AgentCard.tsx
components/workbench/BootScreen.tsx
components/workbench/BuildScreen.tsx
components/workbench/HelpDrawer.tsx
components/workbench/LadderDrawer.tsx
components/workbench/RulesetPicker.tsx
components/workbench/ViewportHud.tsx
components/workbench/readouts.ts
services/chassis.ts
services/decisionCaption.ts
services/workbenchRuleset.ts
services/__tests__/decisionCaption.test.ts
services/__tests__/rulesetPanels.test.ts
```

## Tests run (box)

```bash
npx vitest run \
  services/__tests__/decisionCaption.test.ts \
  services/__tests__/rulesetPanels.test.ts \
  services/__tests__/ruleLegibility.test.ts \
  services/__tests__/workbenchRuleset.test.ts \
  services/__tests__/workbenchFlow.test.ts \
  services/__tests__/liveCall.test.ts \
  services/__tests__/skirmishRules.test.ts \
  services/__tests__/workbenchPanels.test.ts \
  services/__tests__/engagement.test.ts \
  services/__tests__/presentationPacing.test.ts
```

125 passed.

## Landing record (supersedes the original push instructions)

This slice shipped as a three-PR stack rather than a single PR:

1. **#13 `feat/clash-first-identity`** — Call steers, decision captions, Clash/Tutor/Prove doors, perk telegraph (original slice above).
2. **#14 `feat/clash-legibility-collapse`** — richer captions + `steal` reason, perk teeth copy, doors collapsed to Clash/Prove.
3. **#15 `feat/clash-steal-highlight`** — Raider full-load steal PIP (storyboard + optional fal clip).

Historical note kept for provenance only — the original plan called for Clash/Tutor/Prove doors and a Tutor/Rush mode toggle; #14 superseded that.

## Residual risks

1. **Observe-on-render** — `ArenaScene` calls `session.observe('champion')` while computing the HUD caption. Read-only snapshot, but cost scales with tick rate; consider memoizing on decision ticks if profiling flags it.
2. **Reason priority** — `bank > cargo > flood > energy > rival` is a heuristic over real state flags, not the policy’s internal score. Honest buckets only; may disagree with “why the MLP moved.”
3. **Mode rename vs muscle memory** — Practice/Match/Skirmish/Training Grounds still appear in some flows, docs, and next-step strings (`workbenchFlow`). Softened primary doors only; deeper rename deferred to avoid Season 0 eval churn.
4. **Perk tip sessionStorage** — `clawdy_skirmish_perk_tip_v1` is once per browser session; refresh clears. Does not teach Forge itself.
5. **No browser QA on box** — unit/static coverage only; Mac should spot-check Call steer + HUD caption live.
6. **Ladder / Forge copy** — partially softened; some “Skirmish” remains in error codes and internal unlock helpers by design.
