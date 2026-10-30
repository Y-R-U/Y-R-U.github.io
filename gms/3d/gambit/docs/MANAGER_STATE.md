# GAMBIT — Manager State

Read this first when resuming, then DECISIONS.md, TEAM_BRIEF.md, docs/notes/*.md.

## Run protocol
- Cap: **6 agents** max (Aaron, 2026-10-31, raised from 4). Rule: once at 6, start NO new agent until
  running count is back down to 4, then refill (to ≤6). If Aaron sends a new number, follow it.
- "continue" after a usage limit = the limit reset: check each running agent below (SendMessage
  "status?"), resume dead ones via SendMessage to their id, else relaunch with
  "continue from docs/notes/<role>.md". Don't ask Aaron first.
- Manager makes game decisions; collect non-obvious ones under "Questions for Aaron".
- Git: manager commits + pushes on major milestones (D22), staging only gambit paths. Add the
  projects.js entry + screenshot once a nice board can be shown. No VPS deploy without Aaron's OK.
  Local: http://192.168.0.236:8888/gms/3d/gambit/
- Refs: Aaron's images go in `refs/` (pending — he said he'd send some, incl. an over-the-top
  battle animation one).

## Agents
| Agent | id | Status |
|---|---|---|
| core (rules + bots) | a67e3f75f9bd1d260 | DONE (perft all match; 20 bots 125→3300, SF-anchored; SF19 lite for The Machine only; top-3 labels rough) |
| board (three.js + anim system + classic) | a9a1a987c503eb9a8 | DONE (D26 views, D27 tags, D28 contrast; board_test 18/18 + game_test 14/14; reviewed) |
| ui (shell, ladder, auth) | ad381026021f8a456 | DONE (full game vs real bot, 0 errors; screenshots reviewed) |
| sculptor-fantasy-1 (knight + bishop) | a4583ec890eee44d0 | DONE (Warhorse 7, Wizard 6.5; 1 draw call/kind via per-vertex metal/glow; sdf.js mesher) |
| sculptor-halloween-1 (pawn + rook, cast proposal) | ae1a9e1bfc79d745d | DONE (Pumpkin Imp 7.5, Crypt Tower 7; reviewed, good) |
| sculptor-halloween-2 (n Nightmare + b Witch) | a10a062377d08ef31 | DONE (7 / 7.5) |
| sculptor-fantasy-2 (p Squire + r Watchtower) | a5ed080f8e9319654 | DONE (7 / 8; reviewed, good; squire has baked 3/4 yaw — accepted) |
| sculptor-halloween-3 (q Countess + k Pumpkin King + board) | a7fb25a00cc9ad998 | DONE (q 7, k 7.5, board 6.5–7; HALLOWEEN SET COMPLETE; reviewed) |
| online (lobby/rooms/online game UI) | a9d1a88e113f7c5f8 | DONE (2-browser e2e ALL PASS 360+1440; reviewed) |
| ui-2 (shared board, portrait layout, online offline-state, move review) | abd147e4f6019db1a | DONE (1 WebGL ctx, all suites pass; puzzles hooked; ONLINE_PUBLIC=false in net.js — flip at deploy) |
| battle-1 (fantasy + halloween battles, 4 each) | a7576b524d1e83742 | DONE (8 battles, no leaks, warm shaders; reviewed: works but too SMALL from Top view vs ref) |
| sculptor-scifi-1 (concept + p + r) | a10763d1cd754a3ff | DONE ("Aegis vs Nova"; Drone 7.5, Bastion 7; reviewed, good) |
| battle-2 (BIG battles from Top, classic battles, kit FX housekeeping) | ac63a47fb05a1fe85 | DONE (before/after reviewed: much bigger; pooled FX; sfx wired) |
| battle-3 (sci-fi battles) | af72d3e214f34a53b | running (9532) |
| board-2 (facing, glow flicker, kit adoption, halloween env, perf pass) | ae9ab876383b1ff7f | DONE (all tests pass; 60 fps at 4× throttle; Halloween night sky reviewed: great) |
| sculptor-scifi-2 (n Strider + b Psi Oracle) | a45993e7f5b3af467 | DONE (Strider 7.5, Oracle 6.5–7; reviewed) |
| qa (playthrough, bug list, ui-3 items) | acfa57929d253287a | running (9528) |
| audio | a6b881a23e46068d6 | DONE (procedural sfx all themes, sfx() battle API, 3 ACE-Step loops ~0.5–0.65 MB; models unloaded verified; NEEDS Aaron listen-check) |
| sculptor-scifi-3 (q AI Core + k Commander + station board + sounds) | acf7e1f8f39903d53 | DONE (q 7, k 7.5, board 7.5, env 7; SCI-FI COMPLETE; reviewed) |
| learn (course map, lessons, drills) | a6cf292ca55789272 | running (9531) |
| sculptor-fantasy-polish (wizard rebuild, faces, fantasy squares, island life) | af0f22136d01c2ccc | DONE (wizard 7.5, q 7.5, k 8, board 8, island 8; castle visible over far edge; reviewed) |
| puzzles (Lichess CC0 + classics, map, play) | a53142481a3bac366 | DONE (618 puzzles, 4760 checks pass; map+play reviewed, great; hook → ui-2) |
| sculptor-fantasy-3 (q Sorceress + k High King + island env) | a18ad162b144a5b7e | DONE (q 7, k 7.5, island 7; FANTASY SET COMPLETE; reviewed) |
| server-2 (lag credit, queued moves, prov, allowance race) | a7456397fcdd35eae | DONE (all tests pass; told to switch credit to full RTT) |
| server (Go lobby/relay/ratings, net.js) | abc9067d1e0062fbb | DONE (test.sh ALL PASS + net 24/24 verified; local :8094 via tools/server_run.sh; deploy steps in notes/server.md) |

## Queue (as slots free)
1. Sculptors: classic polish, fantasy (2 pieces per agent), halloween, sci-fi
2. Battle-animation agents per theme
3. Puzzles agent: Lichess puzzle DB (CC0) subset by rating + mate-in-N, plus classic problems; map UI
4. Online integration + server tests; deploy only with Aaron's OK
5. Audio (sfx per theme), QA pass, phone perf pass
6. Learn mode (LAST)

## Questions for Aaron

## Log
- 2026-10-31: scaffolded, DECISIONS D1–D22 + TEAM_BRIEF written. Phase 0: core, board, ui, server.
- 2026-10-31: Aaron's 3 refs saved to refs/ (+ refs/README.md). Art direction: Classic = gold vs black-chrome on polished marble (ref_gold_black); Fantasy = figurines on a floating-island diorama, ivory/gold+blue vs black/red (ref_fantasy_island); battles = over-the-top fire/magic/explosions (ref_battle). Sent to board (env-map reflections, environment-diorama hook, battle FX toolkit) and ui (crest plates, gold-bordered dark panels, Cinzel titles, adapt to portrait).
- 2026-10-31: server DONE, verified. D23/D24 written. Open for server-2 later: lag credit per D24, auth.getIdTokenAnyUser in /lib/auth (net.js shims it), double-start race on last allowance. Slot -> puzzles agent.
- 2026-10-31: Aaron raised cap to 6 (no new starts until back to 4). Launched sculptor-fantasy-1 (n+b) and sculptor-halloween-1 (p+r + cast). Remaining fantasy p/r/q/k + board/environment, halloween n/b/q/k + board, sci-fi all, battle anims per theme queued.
- 2026-10-31: ui DONE, reviewed screenshots (good). D25 written. Polish list for a ui-2: portrait 412x915 has a big empty band above/below the board (centre it / bigger player bars), tap move list to review, premoves, nicer heraldic lion. Online screens agent still to do (net.js ready).
- 2026-10-31: MILESTONE 1 commit (playable vs bots). refs converted to jpg; tools/*.jsonl gitignored; server/.run ignored.
- 2026-10-31: Aaron: lock top-down or a view toggle → D26; sent to board agent as priority (it may edit game.js/settings.js for the View button).
- 2026-10-31: Aaron: name tags on tap/hover → D27, sent to board agent after D26.
- 2026-10-31: Aaron: black pawns hard to see on dark squares → D28, board agent request #3 (after D26 view, D27 tags).
- 2026-10-31: halloween-1 DONE (reviewed close-ups: charming, dark side reads). Back to 4 running → refilled to 6: halloween-2 (n+b), online UI.
- Kit/board request queue (for board agent or a board-2): kit.refine/wrapDecal, kit.colorize, kit.noise3, per-type facing override (face pawns toward opponent), cheap shared glow flicker. Halloween board (graveyard flagstones, iron rail, moon/fog) still to build; queen+king after n+b.
- 2026-10-31: fantasy-1 DONE, reviewed: knight good; wizard robe too cone-like, slot wedge; overall more toy than the refs' detailed figurines → fantasy touch-up later. Next fantasy: p Squire + r Watchtower (heights p .8, r .95, q 1.25, k 1.4), then q+k, board island diorama. Kit request: move per-vertex metal/glow material (fantasy/common.js) into kit.js; fx.trail.
- Running 5 (core, board, puzzles, halloween-2, online) → wait for 4 before new starts.
- 2026-10-31: halloween-2 DONE (reviewed lineup: good). Back to 4 → launched fantasy-2 (p+r) and halloween-3 (q+k+board). Kit request adds: loft(), flameTongue(). Gotcha: dev server has no cache headers → Network.clearBrowserCache in CDP tests.
- 2026-10-31: online UI DONE (verified screenshots). Manager decisions: (a) ONE WebGL board shared by bot/online/puzzle screens (phones can't afford 2 contexts) → ui-2 task, after board agent finishes game.js edits; (b) Home "online game in progress" card from a local hint net.js writes (no boot connection); (c) phone Online home: Quick match above the fold (compact ratings row, warning lower/collapsible).
- server-2 queue: keep queued moves until next welcome (no drop after 10 s), `end` should update prov, gambit return page in payments checkout, lag credit D24.
- Hold milestone-2 commit until board agent hands back (it is mid-edit in game.js/camera).
- 2026-10-31: board DONE, contrast + tags reviewed (good). MILESTONE 2 commit: views/tags/contrast, online UI, halloween p/r/n/b, fantasy n/b (puzzles + in-progress sculptor files excluded until handed back).
- 2026-10-31: refilled to 6: ui-2 and battle-1. Queue next: server-2 (queued moves, prov, lag credit), sci-fi sculptor (concept + p/r), fantasy q/k + island board, fantasy touch-up (wizard robe), classic battle polish, audio, QA, learn (last).
- 2026-10-31: fantasy-2 DONE (reviewed: tower excellent, squire good). Running 5 → wait. Next fantasy: q Sorceress + k High King, then island diorama board. Gallery request: ?anim=<name> to force a move anim.
- 2026-10-31: puzzles DONE (reviewed). ui-2 told to enable PLUGINS hook + shared board for puzzles. core told to cap tourney parallelism (load ~47 slowed everyone). Refilled to 6: fantasy-3, server-2.
- 2026-10-31: halloween-3 DONE → Halloween has all 6 pieces + graveyard board + env. Env reads murky/plain (brown-green hill) → later env polish (moonlit sky gradient, more silhouettes). Running 5 → wait. Board-2 queue: per-type facing, idle glow flicker, kit.boardLooks.graveyard, instanced fog cards, ?anim= in gallery, kit adoption of loft/flameTongue/per-vertex metal-glow material.
- 2026-10-31: core status: killed 10-thread tourney, now ≤3 workers; 20 bots, Stockfish-anchored calibration up to 2700; ETA hand-back ~30–40 min.
- 2026-10-31: server-2 DONE. Decision: lag credit = full RTT (bounded by 1000 ms + quota). Also fixed ping blocking writer goroutine. Running 4 → refill: sci-fi sculptor-1, audio.
- 2026-10-31: battle-1 DONE. My review of Top-view strips: correct and clean but underwhelming vs ref_battle (FX tiny at overhead scale, fire stream thin). → battle-2: make them BIG from Top (camera push-in/zoom on the fight even when locked, then return; FX 2–3× scale, screen-wide flash/vignette, debris flying past camera, victim reactions larger, slow-mo beat at impact), classic battles to match, sci-fi battles later. capMs request sent to ui-2. Kit requests for board-2: adopt addFxWarmup/parkFX, fadeOut transparent-shader compile, pool flash/ring/lightning/scorch.
- 2026-10-31: core DONE. Refilled to 6: battle-2 (owns kit FX section) + board-2 (owns board/*.js + kit materials/looks). ui-3 queue: show expectedMoveMs on bot cards, "re-test this device" setting, humanDelay, dispose bots; ambientAnim setting UI.
- 2026-10-31: scifi-1 DONE. Next sci-fi: n Strider + b Psi Oracle, then q AI Core + k Commander + station board, then battles. Running 5 → wait.
- 2026-10-31: ui-2 DONE. MILESTONE 3 committed+pushed (d4b71276). Refilled to 6: scifi-2, qa (+ui-3 items). DEPLOY CHECKLIST addition: set ONLINE_PUBLIC=true in js/app/net.js.
- 2026-10-31: fantasy-3 DONE → Fantasy complete + floating island env (bright, cute, simpler than ref). env.update(dt) hook sent to board-2. Later fantasy polish: animate env (flames/waterfalls/clouds), richer islands/trees, gold-inlaid fantasy squares, wizard robe touch-up, faces.
- 2026-10-31: audio DONE; sfx API relayed to battle-2. Refilled to 6: scifi-3, fantasy-polish. Open: online game has no "illegal" sound; slider styles inline. Questions for Aaron: listen-check sounds + music.
- 2026-10-31: scifi-2 DONE. Oracle helmet egg-ish → sci-fi polish later. Running 5 → wait.
- 2026-10-31: board-2 DONE. Running 4; holding the 2 free slots deliberately (next work depends on battle-2 / scifi-3 landing: sci-fi battles, then learn mode). Sculptors may switch to kit.vertexMaterial + flicker later.
- 2026-10-31: scifi-3 DONE → all 4 themes complete. Started LEARN (D14) since the game is feature-complete. Remaining: sci-fi battles (after battle-2), board requests (camera to env.update, ambientMinPhi), sci-fi music loop, projects.js entry + screenshot, deploy (needs Aaron).
- 2026-10-31: battle-2 DONE. MILESTONE 4 committed+pushed (4e5fdaeb; learn WIP excluded). Started battle-3 (sci-fi). Running 4: qa, fantasy-polish, learn, battle-3. Scratch note: agents must use unique scratch subfolders (battle-2 rm -rf in shared b2/out).
- 2026-10-31: fantasy-polish DONE. Running 3 (qa, learn, battle-3); holding. Next: projects.js entry + screenshot (manager).
