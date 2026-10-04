# Round 6: playtest 2 + critic r5 blockers (manager, 2026-10-04)

Inputs: `docs/review/PLAYTEST_2.md` (PT2#1–12 and §4 comedy) and `docs/art/critic/r5/REPORT.md` (C#1–9).

New rulings:
- **R6a.** Ambient, unrewarded ejections from Pomfrey's saloon run from minute 1. Mabel throws drunks out before you own it (proposal §4.1), so the first 10 minutes are funny. The "And STAY out!" opening bark must play: queue it until audio is ready.
- **R6b.** Drop "Colonel" from player-facing text; he is just "Pomfrey".
- **R6c.** Ghosts don't spawn until the Ghosts tab is revealed.

| Lane | Port | Scope |
|---|---|---|
| **A** | 9331 | **C#3** peach skin, not orange-red. **C#4** find the translucent or ghosted big character at night (material opacity/depthWrite, or ghost material leaking). **C#6** break up the visible hex tiling with large-scale ground variation. **C#8** crisp warm lamp pools on boards and walls, not fog smears. **C#9** bevels/seams/shingles where cheap. |
| **P** | 9341 | **C#2** the saloon-card ejectee goes back to ~1.1×, cleanly silhouetted, landing in open dirt and not over the doors. **C#5** the foreground cactus is smaller, darker or blurred, at the frame edge (≤ 6% of the frame). **C#7** build-site red rocks become sawdust, offcuts and planks. **PT2#12** every card's building sits centred in the card (no sky-and-desert-only first card at rest). Light the saloon interior. |
| **S** | 9351 | **C#1** dust puffs become soft alpha billboard sprites that spread and fade (fx/particles), used everywhere. **PT2#7** duel: the over-shoulder shot has the hat at ≤ 20% of the frame; the eye close-up must read as eyes (brows, whites, squint) or switch to a cleaner close-up; DRAW within ~5–7 s of start; the result card waits until "DRAW!" clears. **PT2#8** no camera inside heads after the duel. **PT2#9** fling: Mabel isn't a giant back in the foreground; the held drunk is ≥ 120 px; the jail landing is on screen. **PT2#11** cutscene framing: Fake Your Death shows the coffin, the Deed shows the sign coming down, the stagecoach shows the coach and readable passengers. **R6a** ambient Pomfrey-saloon ejections from minute 1 in the hero (unrewarded; they don't use E's eject/fling unless the saloon is owned). |
| **U** | 9361 | **PT2#1** the opening "Tap the mud" ring is invisible: the `tapring` animation overrides the transform, so fix the positioning. **PT2#2** "⤒ Watch" closes any open sheet or Town and goes to the hero. **PT2#3** goal hint points at Deeds (`kind:'deed'`) and the gate. **PT2#4** enforce W5 (one sentence bark per 30–45 s globally, per-character no-repeat for 10 min, prefer unplayed lines, the wordless layer in between). **PT2#5** queue the opening bark until the manifest and audio are ready. **PT2#10** text overlaps (bubbles clamp inside the viewport, toasts avoid bubbles and chips). Crew captions ≥ 12 px. **R6b**. Ghost tab reveal (with E's R6c). |
| **E** | 9321 | **R6c**: gate ghost spawn on the Ghosts reveal condition (second Deed, a grave, or 10 min played), as pure state. Anything else in PLAYTEST_2 that's yours: Tubs at 1:41 against the 1:30 casual target, so check with the sim. |
