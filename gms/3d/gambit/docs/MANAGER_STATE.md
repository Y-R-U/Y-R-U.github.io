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
| board (three.js + anim system + classic) | a9a1a987c503eb9a8 | running (9502) |
| ui (shell, ladder, auth) | ad381026021f8a456 | DONE (full game vs real bot, 0 errors; screenshots reviewed) |
| sculptor-fantasy-1 (knight + bishop) | a4583ec890eee44d0 | running (9511) |
| sculptor-halloween-1 (pawn + rook, cast proposal) | ae1a9e1bfc79d745d | running (9512) |
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
