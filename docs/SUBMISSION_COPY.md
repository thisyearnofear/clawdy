# Tripothon S1 submission copy

Live demo: https://clawdy.trustfall.xyz · Repo: https://github.com/thisyearnofear/clawdy

## Entry tracks
- Direction: **Game**
- Tool tracks: **Tripo**, **World Labs**, **Heygears**

## Title
Clawdy: Train Your Champion

## One-liner
A world you give someone and then step back from: you coach a rover, train real weights, and watch whether your teaching held.

## Description (short)
Clawdy is a train-then-compete rover league inside a flooding desert arena. You never drive. You watch a practice run, call a route at a junction, scrub the replay to a mistake, approve what the rover should learn, and train a small neural policy on those lessons. Then the coaching controls go dark and your champion plays a held-out layout alone. The replay is the receipt that shows whether the gift worked.

The theme, "a world as a gift for the kid I used to be": the kid who could never master a hard arena grows up and builds a game where you coach instead of play, then finds out whether the coaching was the bottleneck.

## What is real
- The training is a real gradient update on real weights, not a saved prompt.
- The held-out layouts are a separate registry that is never used for training or checkpoint selection.
- Rush champion, 40 hidden layouts played from both sides (80 matches per opponent): 77-3-0 vs `safe`, 75-0-5 vs `poach`, 68-6-6 vs `greedy`, 40-0-40 vs the starter. It **loses to `weather`, 35-45-0**. Results are pinned in `docs/eval-es.json`.
- Sign-in with GitHub keeps guest play working. A signed-in player can submit a brain to a ladder the server runs itself on hidden layouts; the browser never reports a score.
- Brains can be published to a league (checkpoint + chassis build, versioned). Challenges run server-side on fresh hidden seeds, both sides, replay-verified before they are stored; every match gets a public `?replay=<shareId>` link that reloads the recording with event markers (bumps, core spawns, battery-outs, recoveries, banks). A scheduled round pairs listed brains by rating every six hours. Deployed to prod; the two-account challenge path is verified in Convex tests and awaits a live run.
- Code coaches can write a teacher function and train a checkpoint with `npm run teacher:run`.

## Tool use
- **Tripo**: the house rival hauler rover and the amber energy core were generated with Tripo P1 text-to-model (`scripts/tripo-generate.mjs`, task IDs in `mint-assets.json`). Both are on screen in every run. Three chassis bodies (scout, hauler, raider) were generated the same way, and **Forge your champion** lets a signed-in player have Tripo build a custom rover body server-side with a per-account limit and a global credit cap. Verified: the Forge ran end to end against the real Tripo API on a local Convex deployment, its backend is deployed to prod, and on the live app the "Forge your champion" panel renders in the Coach panel and the champion loads its chassis body (`chassis-hauler.glb` requested and rendered, checked Oct 5). Not yet verified: a real player forging on prod — that needs a signed-in GitHub account.
- **World Labs**: the Spark renderer draws the Gaussian-splat bursts on every bank and collect. (Marble generated the first arena; that world was retired in favour of a Blender terrain with an exact collider, and lives in git history.)
- **Heygears**: "Print your champion" downloads an STL of the rover with a print profile (`docs/PRINT_KIT.md`).
- Also: Mint (champion rover), Blender (terrain and textured visual twin, pinned Docker build), Convex (sync, auth, ladder), Vercel.

## Known limits (say them before a judge finds them)
- The trained champion does not beat the `weather` bot.
- The ladder is verified in tests and the sign-in works on production, but it has had little live use. The league paths (publish, challenge, share-link replay) are on prod and covered by Convex tests — including a real two-account match — but no human has run a challenge on production yet.
- The GPU look of the terrain texture was only checked under software rendering.

## Build log drafts

**Post 1 (reveal)**
I'm building a game where you never drive. You coach a rover, approve what it learns, train it, then take your hands off and watch. For #Tripothon: "a world as a gift for the kid I used to be." Playable now: https://clawdy.trustfall.xyz @TripoAI

**Post 2 (Tripo props)**
The house rival in Clawdy is now a rust-orange tracked hauler, generated with Tripo from one text prompt (40 credits). So is the amber energy core the rovers race for. Same prompt-to-prop path I used for the champion, now with Tripo. #Tripothon @TripoAI

**Post 3 (honest results)**
Trained rover vs the house bots on 40 hidden layouts, both sides: beats `safe` 77-3, `poach` 75-0, `greedy` 68-6. Loses to `weather` 35-45. I'm leaving that number on the board. Next job: teach it the weather. #Tripothon

**Post 4 (bug story)**
My cloud test harness found it before a player did: on phones the canvas went blank and the match clock froze. Cause: the frame limiter left the render clock running while paused, so the next frame had a negative time step and the camera turned to NaN. One fix, plus layout bugs a phone judge would have seen. #Tripothon

**Post 5 (the league)**
Clawdy is a league now. Publish your trained brain with its chassis build, challenge another player's brain, and the server races both on a fresh hidden seed — then re-simulates the whole match before it counts. You can't fake a result from the browser. Every match gets a public replay link with event markers (bumps, battery-outs, banks). #Tripothon

**Post 6 (Tripo chassis + Forge)**
Three Tripo chassis bodies — scout, hauler, raider — now render in the arena, and your pick actually changes the sim (speed, battery, bump strength). Forge goes further: a signed-in player can have Tripo build a one-of-a-kind rover body server-side, credits reserved atomically and refunded on any failure. Verified end to end against the real API — including the day a scheduled poll died silently and stranded a forge. (Convex doesn't retry failed scheduled actions; now a 2-minute sweep rescues them.) #Tripothon @TripoAI

**Post 7 (balance honesty)**
Trained chassis vs chassis on 80 hidden Rush variants: scout beat hauler 71–9 before a retune. Speed was overtuned — an inert-stat handicap wasn't enough to slow it down. We're iterating on the coefficient in public and the bench script is in the repo. #Tripothon
