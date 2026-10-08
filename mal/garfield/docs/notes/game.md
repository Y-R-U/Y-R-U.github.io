# game — notes (wave 3)
Owns js/game/*, js/levels/*, js/core/*, js/main.js, index.html, js/ui/*, css/*, tools/sim/*, tools/play.html,
tools/ui_kit.html, docs/LEVELS2.md. CDP port 9407 (`node tools/sim/play.mjs ... --port=9407`).

## DONE
- docs/LEVELS2.md (full Ch1 FP / Ch2 story / L1–L10 / arena / FP2 event table / unlock ladder)
- js/game/lines.js wave-3 block (265 keys) → sent to media; cast + world requests sent
- save.js additive migration (ch1FreeSeen, ch2MenuSeen, ch2IntroSeen, ch2FreeSeen, ch2{}, arena*); markDone2
- ui/menu.js: title chapters support fromTitle ('Coming Soon' → 'Chapter Two: Odie and Lyman'), arena button,
  chapter screen side button (Free Play / Coming Soon w/ unlock anim) + ▶ Story; hud.js: freePlay tag, arenaScore, hold ring
- core/game.js: level ids 1..10 | 'c2:N' | fp1 | fp2 | arena (levelInfo), chapter(1|2), story(), arenaMenu(), win2(),
  world.setChapter(1|2) per level
- js/game/cast2.js: lazy Odie/Lyman/delivery/mice loader with placeholders; castUpdate in main.js frame loop
- js/levels/index.js imports wave-3 modules defensively (top-level await + try) so Ch1 can't break
- js/levels/freeplay1.js (Ch1 Free Play) — `play.mjs fp1` PASS (chair fall/recover, vine face→fall, eat, fridge,
  bed→trap→door frees, vase→slip→faceplant→recover)
- Ch1 regression: play.mjs 1-10 all PASS after the changes

- js/game/humanAI.js (jonAI generalised: who/seat/line prefix, sofa seats, pair chase D18; Lyman scratch target),
  js/game/odieAI.js (pet nav, flee, arc, knockout, scratch target), js/levels/ch2/common2.js (defineLevel2 runtime),
  ch2/story.js (Ch2 opening story, verified frames), ch2/index.js (defensive per-level loading)
- C2 L1–L6 written; `play.mjs c2:1..6` each PASS (skip=1); key beats screenshotted + reviewed
- core: CH2_READY gate (false) + ?ch2=1; input.interactHeld; director say falls back to lines.js text

- C2 L7–L10 + js/game/arena.js + js/levels/arena.js (menu Arena w/ difficulty popup, Rematch/Menu)
- Intro cutscenes for all Ch2 levels watched at skip=0 (scratchpad intros.mjs); fixes: Ch2 open-floor spawn
  (livingCentre), L4 shots, L5 delivery on the threshold + box hidden until handed over
- FULL REGRESSION (2026-10-09): Ch1 1-10 PASS, catch PASS, selfTest 14/14, fp1 PASS, menus PASS, c2:1-10 PASS,
  arena (L7 win, L7 lose, menu arena) PASS
- freeplay2 handed to helper 'fp2' (owns js/levels/freeplay2.js + tools/sim/fp2.mjs only)

- Ch2 LIVE (manager 71ff204a, CH2_READY=true); menus test reads CH2_READY
- touch pass (scratchpad touchpass.mjs, real CDP touch on the HUD buttons) at 1024x768 + 844x390: carpet, spit-ball,
  sock drawer hop, glare HOLD, arena scratch — all PASS. Found+fixed: getter labels were frozen by core interact's
  spread (now live via labelFn) + isHint muted pills
- audio: Ch2 music falls back (arena→chase, sneak2→sneak) until media's tracks land; L2 Odie pant loop (sfxLoop)
- regression after all that: Ch1 1-10, catch, fp1, c2:1-10, arena all PASS

## IN PROGRESS
- nothing mid-edit

## NEXT
- support helper 'fp2' (owns js/levels/freeplay2.js, tools/sim/fp2.mjs)
- polish: sock-drawer camera jams into the dresser; L5 mice hard to see; Lyman hair reads brown in warm light

## REQUESTS
- none open
