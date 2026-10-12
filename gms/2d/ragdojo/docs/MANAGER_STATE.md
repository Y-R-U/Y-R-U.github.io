# RAGDOJO online — manager state

Design: `docs/ONLINE.md`. Shared agent rules: the manager's BRIEF (scratchpad, not in repo).
Nothing deploys to the br8t box without Aaron approving the named steps.

## Phase 1 (started 2026-10-13)
- **A — arena**: Go arena server `server/`, net layer `js/net/`, 1v1 best of 3, friend link, real ping, stats recording.
  Owns main.js / ui.js / index.html / css for this phase.
- **B — events engine**: `js/events/` pure logic (picture reveal, Vines & Ladders with the turn-replay rule,
  seeded dice, points), `dev/events.html` preview, gates, first Flux image candidates (not committed until Aaron approves).

### B status (2026-10-13)
Done: `js/events/` (hash, calendar, points, vines, reveal, state), `docs/EVENTS.md` (engine + server
contract + golden vectors), `dev/events.html` preview, `tools/eventsgate.mjs` (132 checks, `--falsify`
16/16 red), `tools/eventsshot.mjs` (Chrome, real touches, 0 console errors). 12 Flux candidates in the
manager's scratchpad (`ragdojo-online/B/images/contact.html`), NOT in the repo, awaiting Aaron.
Not done: in-game wiring (phase 3/4, main.js/ui.js belong to A), server endpoints, image review page.
Open for Aaron: what `oppDmg` means for LMS / best-of-3; campaign-fight cap per day for any-battle events;
the guess bonus currency (engine returns `guessBonus` points; game decides ink).

### B rework (2026-10-13, manager's correction)
A Vines & Ladders turn is now a BATTLE (a batch of rolls = its points), not one roll; no starting roll.
The save stores ordered battle points + a roll count; dice are indexed by roll. Rivals move only when you
finish a turn, to the end of THEIR k-th batch. Campaign cap 10/UTC day, 60 s apart; guess bonus = ink.
Gate 136 checks, `--falsify` 22/22 red; eventsshot asserts nobody moves mid-turn (and goes red with the
rule removed). Dojo images regenerated with a blank scroll.

### A status (2026-10-13)
Done, local only, NOT deployed: Go `server/` (ragdojo-arena: lobby with game type, challenge, friend
codes, offer → real ping → accept, coin-flip master / swap / round 3 to the round-2 loser, agreed-only
results, void on disagreement, resume + 10 s away window → FORFEIT LOSS (never void), SQLite stats +
`/leaderboard` + `/ghosts`, loopback `/internal/stats`, `/ice` from 8014 cached, allowance via
`claimArenaBattle` → payment service, LAN mode + `lan.sh`). `js/net/` (client, wire, fight, panel).
ARENA button on the hub, hidden unless `/health` answers. Gates: `go test ./...` (server/),
`tools/arenaserver.mjs` (18), `tools/arenastate.mjs` (9), `tools/arenagate.mjs` (24, also `--lan` and
`LAG=140`); all falsified. Measured: 30 snapshots/s, 52-70 ms interp buffer, 0-0.3% underruns,
opponent shown 66 ms after the master simulated it (155 ms at 140 ms RTT).
Not done: Steal the Bandana / KotH / LMS / ghost fights (listed "coming soon"; `RULES` + `/ghosts` are the
hooks), host migration (keyframes are complete, `applyState` rebuilds exactly), LAN→prod upload job,
leaderboard UI, browser-side spend (the server spends with the player's own token instead).
Deploy steps: see CLAUDE.md "Online arena".

## Phase 2 (started 2026-10-13)
- **C — multiplayer modes**: Last Man Standing (2–8, countdown at 4), Steal the Bandana, King of the Hill,
  host migration for multi-player. Owns match.js, js/net/fight.js, js/net/wire.js, js/net/client.js,
  server/hub.go (+ its tests).
- **D — ghosts + leaderboards + stats UI**: ghost fights (Brain with a real player's loadout, labelled GHOST),
  leaderboard/stats panels. Owns js/net/panel.js, ai.js, server/store.go, server/names.go, new js/net/ghost.js
  and js/net/boards.js. Exposes `openMode(id)`-style hooks; C flips its modes from "coming soon" by calling them.

### D status (2026-10-13)
Done, local only, NOT deployed: ghost fights (`js/net/ghost.js`: real loadout via `moveStats` + perks +
record-derived skill, labelled GHOST in list/fight/HUD, offline, never ranked, no allowance; snapshot
uploaded on every arena match via `POST /ghost`), leaderboards + your stats card (`js/net/boards.js`,
`GET /leaderboard` extended, `GET /me`), PLAY/GHOSTS/BOARDS tabs, `MODES` table for C (`live: true`).
Ghost results exposed as a `ragdojo:battle` event (`src: 'campaign', kind: 'ghost'`), not wired to events.
Gates: go test (ghosts_test.go), `tools/ghostgate.mjs` (+`--falsify` 11/11 red), `tools/boardsgate.mjs`
(45, real touch, landscape + portrait), arenagate ghost check; every existing gate re-run green.
Not done: ghost wiring into events (phase 3), a GHOST label on the HUD's "ENEMY" bar caption (ui.js; the
name under it already reads GHOST · NAME), sim autoplay byKind for non-light worlds (left alone on purpose).
Deploy: same as phase 1 (server/deploy.sh, Caddy fragment unchanged — new routes sit under the same
prefix; the new `ghosts` table is created on start), then the client via games/deploy.sh.

