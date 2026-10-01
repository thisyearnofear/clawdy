# Dev B experience progress

Date: 2026-10-02
POC: Dev B
TL;DR: The first visual pass is built locally. Rush effects are scaffolded against the agreed snapshot contract, but the Rush branch has not been integrated or demonstrated in this checkout.

## Built in this branch

- `components/environment/ArenaWorldView.tsx`: warmer low-angle sun, cooler fill, gradient sky, ACES tone mapping and a 2048px desktop shadow map. Idle route ribbons are less prominent. Rover models render at 1.35× visual scale and their chassis lean slightly with turns; physics poses and terrain geometry are unchanged.
- `components/environment/RoverFX.tsx`: two bounded tyre marks replace the colored center strip. Marks clear on reset, replay rewind or a large position jump. Dust remains on its existing bounded sprite pool.
- `components/workbench/experienceMocks.ts`: illustrative ladder entries, training points and Rush events for UI development. These fixtures are not displayed as live standings. Event-log comparison handles cloned snapshot objects.
- `components/environment/RushEventFX.tsx`: a bounded, presentation-only effect for `core_spawn` and `bump` events, mounted in the arena. It reads optional `episode.events`; the current Haul snapshot has no events, so the effect stays inactive. Dev A's Rush event producer is still in a separate worktree.

## Verified and open

A local production preview showed clearer rock shadows, less prominent idle routes, a larger rover, and two tyre marks during a match. After fixing an out-of-range trail buffer read, the match advanced past tick 400 without browser errors. Typecheck, lint, production build and five new focused tests passed before the Rush effect scaffold was added. The latest Rush effect has not yet had a build, test or browser check, per the current request to defer those checks.

The full suite last reported 313 passing tests and five failures: four existing `workbenchPanels` assertions and one `starterCheckpoint` result that has both passed and failed in isolated reruns. No service or training code was changed in this branch. The Rush spawn and bump effects have not been visually verified against a real Rush match.

## Next integration steps

1. Bring in Dev A's Rush services when its branch is ready. Compare the merged `ArenaSnapshot.events` and `rushCourse` types against `docs/adal/contracts.md`, then run an actual Rush match and inspect spawn and bump cues. The current effect only animates events whose tick equals the observed snapshot tick; fast-forward or skipped ticks need a deliberate policy.
2. Add an explicit Rush selection path and score presentation in `ArenaScene.tsx`; the existing Play/Practice controls still start the Haul experience.
3. Connect training progress and ladder UI to real browser-safe and Convex APIs when Dev A publishes them. Keep preview ratings labeled as examples.
4. Before shipping the visuals, run the full regression suite and check frame rate on the demo machine. The existing browser session has emitted recurring WebGL texture/sampler warnings whose source is still unknown.

The current work is local only until the commit is pushed; it has not been deployed.
