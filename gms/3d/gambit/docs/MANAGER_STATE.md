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
| core (rules + bots) | a67e3f75f9bd1d260 | running (9501) |
| board (three.js + anim system + classic) | a9a1a987c503eb9a8 | DONE (D26 views, D27 tags, D28 contrast; board_test 18/18 + game_test 14/14; reviewed) |
| ui (shell, ladder, auth) | ad381026021f8a456 | DONE (full game vs real bot, 0 errors; screenshots reviewed) |
| sculptor-fantasy-1 (knight + bishop) | a4583ec890eee44d0 | DONE (Warhorse 7, Wizard 6.5; 1 draw call/kind via per-vertex metal/glow; sdf.js mesher) |
| sculptor-halloween-1 (pawn + rook, cast proposal) | ae1a9e1bfc79d745d | DONE (Pumpkin Imp 7.5, Crypt Tower 7; reviewed, good) |
| sculptor-halloween-2 (n Nightmare + b Witch) | a10a062377d08ef31 | DONE (7 / 7.5) |
| sculptor-fantasy-2 (p Squire + r Watchtower) | a5ed080f8e9319654 | running (9516) |
| sculptor-halloween-3 (q Countess + k Pumpkin King + board) | a7fb25a00cc9ad998 | running (9517) |
| online (lobby/rooms/online game UI) | a9d1a88e113f7c5f8 | DONE (2-browser e2e ALL PASS 360+1440; reviewed) |
| puzzles (Lichess CC0 + classics, map, play) | a53142481a3bac366 | running (9510) |
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
