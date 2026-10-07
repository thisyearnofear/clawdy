# Clash-first identity slice

Branch: `feat/clash-first-identity` (local only — **do not push from the box**).

North star: **Clash is the game; Tutor is depth.**

## What landed

### 1. Copy authority (Call steers)
Help / README previously claimed Call “does not steer” / “without steering the current race.” That contradicted `services/liveCall.ts` (sticky destination preference for the rest of the unranked run + Train lesson queue).

- **Truth now:** Call **steers this unranked race** and queues an approved Train lesson. Scored Prove (Match) stays locked.
- Clash-first framing: Clash first; Tutor optional; Prove locks coaching.

### 2. Decision language v1
Shared mid-run caption: **planned · alternative · one plain reason** (`flood` / `rival` / `energy` / `cargo` / `bank`).

- Pure helper: `services/decisionCaption.ts` — uses real `lastOutcome` / transit / `availableActions` / weather / rival visibility only. No invented explainability (missing fields stay absent).
- Wired into HUD intent (`ViewportHud`) and champion `AgentCard` via `ArenaScene`.
- `describeArenaDecision` prefers the caption when data exists.

### 3. Mode collapse (player-facing doors)
Prefer **Clash vs Prove**; Tutor for coaching depth. Softened Training Grounds / Practice / Match / Skirmish pile-up where cheap:

| Door | Internal | Where |
| --- | --- | --- |
| **Clash** | `rulesetId: 'skirmish'` | RulesetPicker, HUD, Build, Ladder, hero |
| **Tutor** | Season 0 / practice | RulesetPicker, mode toggle, HUD |
| **Prove** | Match / compete | Mode toggle, HUD, Help |
| Rush | rush playMode | Softened label on mode toggle |

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

## How to push / PR from Mac

User closed Mac and deferred GitHub access — do this on the Mac when ready:

```bash
cd /path/to/clawdy   # or pull the branch artifact onto the Mac clone

# Confirm remote (expected):
git remote -v
# origin  https://github.com/thisyearnofear/clawdy.git (fetch)
# origin  https://github.com/thisyearnofear/clawdy.git (push)

# If this branch only exists on the box, fetch/copy the commit first, then:
git checkout feat/clash-first-identity
git push -u origin feat/clash-first-identity

gh pr create \
  --base main \
  --head feat/clash-first-identity \
  --title "feat: Clash-first identity (Call steers, decision captions, doors, perk telegraph)" \
  --body "$(cat <<'PR'
## Summary
Clash-first identity slice: Call copy authority (steers unranked + queues Train), mid-run decision captions from real intent data, Clash/Tutor/Prove door labels, first-minute Skirmish perk telegraph.

## Test plan
- [ ] Unranked Clash: Call a route → rover follows sticky preference; lesson appears in Lessons
- [ ] HUD/AgentCard show planned · alt · reason during live run (no fake reasons)
- [ ] RulesetPicker doors read Clash / Tutor; mode toggle Tutor / Rush / Prove
- [ ] First Skirmish minute shows Hauler/Raider/Scout perk tip once
- [ ] npm test (or vitest files listed in IDENTITY_SLICE.md)
- [ ] Prove (Match) still locks coaching
PR
)"
```

## Residual risks

1. **Observe-on-render** — `ArenaScene` calls `session.observe('champion')` while computing the HUD caption. Read-only snapshot, but cost scales with tick rate; consider memoizing on decision ticks if profiling flags it.
2. **Reason priority** — `bank > cargo > flood > energy > rival` is a heuristic over real state flags, not the policy’s internal score. Honest buckets only; may disagree with “why the MLP moved.”
3. **Mode rename vs muscle memory** — Practice/Match/Skirmish/Training Grounds still appear in some flows, docs, and next-step strings (`workbenchFlow`). Softened primary doors only; deeper rename deferred to avoid Season 0 eval churn.
4. **Perk tip sessionStorage** — `clawdy_skirmish_perk_tip_v1` is once per browser session; refresh clears. Does not teach Forge itself.
5. **No browser QA on box** — unit/static coverage only; Mac should spot-check Call steer + HUD caption live.
6. **Ladder / Forge copy** — partially softened; some “Skirmish” remains in error codes and internal unlock helpers by design.
