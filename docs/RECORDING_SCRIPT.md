# Walkthrough recording script (2:30 target)

Record on a real GPU at 1080p, one take per section, browser at 100% zoom. This is a walkthrough, not a trailer: show it working, including the loss to `weather`.

Before you start: open https://clawdy.trustfall.xyz in a fresh window, sign in with GitHub once, and keep a spare checkpoint ready. Turn sound on if you want the rover audio.

| Time | Do | Say |
|---|---|---|
| 0:00 | Landing view, canvas loaded | "This is Clawdy. You never drive. You coach a rover, train it, and then you're not allowed to help." |
| 0:12 | Press **Play** in Practice. Let it run about 15 seconds. | "Two rovers race for energy cores in a flooding desert. The orange hauler is the house rival, generated with Tripo. The cores are Tripo too." |
| 0:30 | When the **Call the next route** card appears, pick a route | "At a junction I can call a route. It saves a lesson. It doesn't steer this race, so I can't cheat a scored result." |
| 0:45 | Let the round finish, click **Watch replay**, scrub to a bad turn | "The replay is the receipt. I scrub to the moment it went wrong." |
| 1:00 | Open **Coach**, approve an example, click **Train** | "I approve what it should learn. Training is a real gradient update on real weights." |
| 1:20 | Show the "what your brain changed" card | "It tells me how many decisions moved and which routes swapped, not just a score." |
| 1:35 | Switch to **Match**, press Play | "Now the held-out layout. Coaching is locked. This is the part I care about." |
| 1:55 | Switch to **Rush**, press Play. Point at a core spawn and a bump effect | "Rush adds scheduled core drops and contact. The Spark splat bursts on every bank are World Labs' renderer." |
| 2:10 | Open **Ladder** and submit | "Signed in with GitHub, I can submit this brain to a ladder. The server replays it on hidden layouts, so scores can't be faked from the browser." |
| 2:25 | Show the asset board or the evidence chart | "Trained champion beats `safe` 77-3, but loses to `weather` 35-45. I'm leaving that on the board." |
| 2:35 | End on the result panel with **Print your champion** visible | "And you can print the rover. Heygears print kit. Thanks." |

## Tips
- If a section goes wrong, cut and redo only that section; the sections are independent.
- Do one phone pass at 375x812 for the last 15 seconds if time allows: Play, then the result panel.
- Don't narrate numbers you can't see on screen.
- Known limit to mention if asked: the ladder has had little live use.
- Skirmish is not playable and has no trained brains. Do not show or describe it as a feature; if asked, call it roadmap (see `docs/SUBMISSION_COPY.md`). The script above only covers what is live.
