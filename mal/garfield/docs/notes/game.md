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

## IN PROGRESS
- humanAI / odieAI / ch2 levels

## NEXT
- arena.js, ch2 L1–L10, freeplay2, story cutscene, play.mjs c2:1-10 / arena / fp2 / menus

## REQUESTS
- (none open)
