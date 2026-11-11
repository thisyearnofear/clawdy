# Walkthrough recording script (1:50, event limit is 1 to 2 minutes)

## v2 cut — delivered Nov 11, 14:02 UTC (this is the file to submit)

`~/Downloads/clawdy-walkthrough-v2.mp4`, md5 `e6ff94342db67aed4c97984271378a05`, 1:34.90,
same 1920x1080/30/AAC. v1 stays in Downloads untouched in case it was already uploaded.

One segment changed. The material pass (`7cc61bc`) landed after the race acts were shot, so
the reveal — segment 4 — was re-recorded against the local build at `/tmp/pw/film-v2/reveal`
and cut to the **same 16.500 s** (source 200.0 s, `-frames:v 495`) before re-running
`assemble.sh`. Identical duration is the point: every narration offset and every caption time
in `clawdy-walkthrough.ass` still lands, so nothing else in the cut had to move.

What that buys: the canyon the judge first sees is the cracked basalt with slope-driven
roughness, not a flat colour. What it does not buy: segments 5–8 are still the pre-material
take, so the ground loses its texture once the rovers start racing. A full re-shoot of the
race acts was attempted at 14:05 and abandoned — the translator upstream 502'd, the forge
fell back to the authored basin, and the footage showed the wrong world. The fallback chain
worked; the take was useless.

## v1 cut — delivered Nov 11, 10:33 UTC

`~/Downloads/clawdy-walkthrough-v1.mp4` (1:34, 1920x1080, 30 fps, AAC narration) +
`~/Downloads/clawdy-walkthrough.srt`. This replaces the prod assumption below: **it was
recorded against the local build at `c99db5c`**, because the deploy was held. Re-shoot any
beat on prod after a deploy and the cut list still applies.

Headless Chromium is not usable for this: with SwiftShader the scene renders at ~2 fps and
Playwright's screencast does not capture the WebGL layer at all. Record **headed, with the
real GPU** (`chromium.launch({ headless: false, args: [] })` → ANGLE Metal on the M3, ~56 fps,
captured at 25 fps). Harness: `/tmp/pw/film.mjs` (`ACT=forge-race|preset-race`, `DESC=...`),
cut list `/tmp/pw/build/cut.sh`, assembly `/tmp/pw/build/assemble.sh`, captions
`/tmp/pw/build/caps.mjs`.

| # | Source | In–out | Rate | What it proves |
|---|---|---|---|---|
| 1 | title card | — | — | "Say a world. Watch it get built. Race it." |
| 2 | basalt take | 29.0–33.6 | 1x | the sentence is typed, then Build world |
| 3 | basalt take | 33.6–51.5 | 2.6x | `Translating your words…` → `Building the heightfield and certifying…` |
| 4 | basalt take | 51.5–68.0 | 1x | the canyon lands, camera orbited by hand |
| 5 | basalt take | 60.0–64.0 | 1x | receipt punched in: `23/23 stations grounded · 38/38 routes cleared` |
| 6 | basalt take | 76.0–100.0 | 1.2x | the rovers race the generated ground, flood fires on it |
| 7 | copper take | 92.0–110.0 | 1.3x | `Call the next route` with three legal options |
| 8 | basalt take | 112.0–124.0 | 1.2x | round complete, 3-3 |
| 9–10 | `docs/assets/asset-board.png` | full, then the bottom band | — | the measured results, wins and losses |

Narration is macOS `say -v Samantha -r 172`; captions are the same sentences, burned from the
`.ass` over a translucent band so they read on both the cream UI and the dark basalt.

Known blemish, deliberately not re-shot: the first-run hint card is still on screen during the
receipt punch-in in v1 (it re-arms when a new world loads). It explains the controls, so it is
not a lie. In v2 the reveal is clean — `7cc61bc` made the card step aside on its own after 10 s
and stay gone — and the punch-in segment was left alone because re-shooting it meant re-shooting
the race.

A walkthrough of the world, not a trailer. The event requires a screen recording of the world itself. Show it working, including the loss to `weather`.

**Record:** 1080p, browser at 100% zoom, a real GPU, one take per section (sections are independent, so redo only the one that went wrong). Keep the proverb toggle in Help **off** unless you want it. Open https://clawdy.trustfall.xyz in a fresh window and sign in with GitHub once beforehand. Dismiss the first-run hint before you start.

**Reference files**
- `docs/SUBMISSION_COPY.md`: the exact claims you can say, and the "Known limits" to say out loud.
- `docs/assets/asset-board.png`: end the video on this (evidence chart and tool list).
- `docs/CHASSIS_RESULTS.md`: numbers for Clash (Skirmish) if you mention them.
- `docs/PRINT_KIT.md` and `public/prints/*.stl`: only if you show the print file; say "print-ready, not printed".

| Time | Do | Say |
|---|---|---|
| 0:00 | Landing view, canvas loaded | "I was the kid who kept losing and wished someone would teach instead of taking over. Clawdy is that gift: you never drive. You coach." |
| 0:10 | **Clash** (Skip to Clash if needed), press **Play**, let it run about 8 s | "Two rovers race for cores in a flooding desert. Clash is the game — chassis perks live. The cores, rival and chassis bodies are Tripo-generated." |
| 0:22 | When **Call the next route** appears, pick a route | "At a junction I call a route. Call steers this unranked race for the rest of the run and queues a Train lesson." |
| 0:32 | Round ends, **Watch replay**, scrub to a bad turn | "The replay is the receipt. I scrub to the mistake." |
| 0:44 | **Lessons**: approve, **Train**, then the "what your brain changed" card | "Each approval is a real gradient update on a small neural policy. It shows how many decisions moved." |
| 1:00 | Switch to **Prove**, press Play, pause on the banner | "Prove locks coaching. Held-out layout. It walks through alone. This is the part I care about." |
| 1:15 | Prove result | "The replay shows whether my teaching held." |
| 1:22 | Build screen: pick a chassis on **Clash**, press Play — watch the first-minute perk tip | "Teach to the student: Hauler carries 4, Raider steals a whole load on bump, Scout sees two hops. It's unbalanced, the Hauler leads, and I say so." |
| 1:38 | Show `asset-board.png` | "My champion beats the safe bot 77-3 but loses to the weather bot 35-45. I'm leaving that on the board." |
| 1:50 | End | "Thanks." |

Cut for length: the Ladder submit and Print. Mention the ladder only in the written description. Player doors are Clash vs Prove only — do not demo a Practice/Rush taxonomy.

## Tips
- Say only numbers you can see on screen or on the board.
- Known limit to say if asked: the ladder and league have had little live use, and no human has run a challenge on production yet.
- If Clash with Scout or Raider misbehaves, record the Hauler (verified once) or skip that section.
- Optional phone pass at 375x812 for the last 10 seconds: Play, then the result panel.
- If you are running over 2:00, drop the chassis perk beat first.
- Never say Call "does not steer" — Call steers the unranked Clash and queues Train; Prove stays locked.
