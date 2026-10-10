# fixgame — notes (wave 4: son's feedback #1 fixes, game side). Port 9407.
Owns js/game/*, js/levels/*, js/core/*, js/ui/*, css/*, index.html, js/main.js, tools/sim/*.
Probe scripts: scratchpad fg/ (lib.mjs: start/boot/H, MUSICTRACK counts live >20 s BufferSources, override() serves
an old file via CDP Fetch for before/after repros).

## DONE
- 3 music overlap: repro'd with HEAD audio.js (2x sneak2 at L start; orphan chase after Jon+Lyman chase). Root cause
  in js/audio (load await race: duplicate music(name) calls while loading both start). fixaudio fixed audio.js;
  re-verified 1 live track at play/chase/after.
- 5 chase thought (D27): barks.js — while any human is in chase/glare, 'g_runnap' every 3.2 s (first 0.7 s in), all
  other Garfield barks dropped. lines.js g_runnap_1..3. Verified L3 + c2:1 long floor chases: only runnap x4.
- 8 D28: d_l5_bye → d_l5_bye2 "Enjoy the telly! Have a lovely evening." (c2_05, freeplay2); VO requested (fixaudio).
- 4 newspaper bowl: pickups used 'give_bowl' whose prop track attaches a bowl at t=0 → now 'pick_up' (fixcast added
  a prop-free clip) in jonAI, humanAI, l06 plate rescue.
- 6 story corner: d.walk never finished when the cat controller's depenetrate pushed him back (radius grows with
  belly; at belly 1 he jittered at 0.27,5.87 forever — repro'd 120 s hang). director.walk: arrive within 6 cm,
  stall (no 1 cm progress in 0.6 s) or 1.6x path time + 2 s → snap. All d.walk users covered. Story now 53 s @belly 1.
- 9 armchair: sulk() put root at y=0 inside the chair; now sitAt(seat object at the anchor, y 0.48) in jonAI +
  humanAI; leave()/standUp handle it; goSit/sitNow check the dining chair specifically. Verified L10, FP1, FP2.
- 7 door: Ch2 L4 intro opened the front door before Jon walked → opens after arrival + face + sfx. L5 was fine.
- 4 repro: HEAD jonAI served via CDP override → 'jon_grip_bowl' during fetchPaper; now only newspaper (L3, c2:1 Lyman).
- 2 arena (D25/D26): DIFFICULTY → OPPONENTS{odie} (+TUTORIAL tuning for Ch2 L7 only); ui.opponents() panel (Odie card +
  locked 'Play through chap four to unlock'); Arena button in .title-topleft with its unlock anim; menus test covers it.
- 1 brawl (D23): js/game/dustcloud.js createDustCloud/brawlCloud/clearSpot — tumbling puff ball, limbs/heads/tail pop
  out, stars, POW/BONK sprites, brawl sfx; actors hidden inside. Ch2 L6 + fp2 brawl event (fp2 test checks it).
- FP1 vine swing ported to fixcast's rideVine (paws on the vine tip, no pop on return). FP1 PASS.
- REGRESSION (9407): play.mjs 1-10 PASS, catch PASS, fp1 PASS, menus PASS (now incl. arena corner + opponent select),
  c2:1-10 PASS, arena (c2:7, c2:7lose, arena) PASS, selfTest 14/14, fp2 --nosoak 43-45/46 with different single
  flakes per run under load avg ~8 (lymanTrap60 / sockDrawer / shedding); those three re-run 10/10 twice in isolation.
## IN PROGRESS
- nothing
## NEXT
- fixaudio landed g_runnap_1..3 + d_l5_bye2 VO (manifest); keys already used, nothing to wire
## REQUESTS
- none open (VO landed)
