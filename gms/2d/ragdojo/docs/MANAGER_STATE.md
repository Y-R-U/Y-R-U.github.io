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

## Phase 3 (started 2026-10-13)
- **E — events in game + image review**: EVENTS panel, battle feed, server/events.go, rewards, art review tool.
  Owns js/events/*, server/events.go (+test), tools/event*. Touched shared files minimally (main.js, index.html,
  panel.js hunks, store.go hook, main.go route line, build.mjs, lan.sh/deploy.sh/unit).

### E status (2026-10-13)
Done, local only, NOT deployed: EVENTS button + panel (tabs per running event with time left, FREE/PASS and
ANY BATTLE/ARENA ONLY tags; Vines & Ladders with the walking stick man, die and server rivals; picture reveal
with tap-to-open and the 4-choice guess; PRIZES; Pass events visible but locked with a SUPPORT / PASS button,
no modal). Battles feed events: campaign `finishFight` emit, arena `result` emit (panel.js, oppDmg = the
most-damaged opponent of the deciding round — this also defines it for LMS/rooms), ghosts; "+N event points"
on the results, ghost and arena cards. Saved in the run save (`S.events`, `S.eventPrizes`) so cloud sync
carries it; works offline. Server: `server/events.go` (Go port matching ~1,300 JS golden vectors; claims
capped/clamped/recomputed; agreed arena results counted automatically via `store.afterMatch`; rivals with the
replay rule on the caller's stored turns, nothing leaks; server-only answers; Pass via the payment service's
entitlement, fail-open; LAN = everyone Pass, own DB). Rewards: the guess bonus pays ink; a finished picture
unlocks a faint arena/menu backdrop (PRIZES / USE IT). Art review: `tools/eventart/` (LAN page, key in URL,
approve → webp/jpg + manifest, answers to ~/.ragdojo/eventart/answers.json, regenerate through mflux-queue),
seeded with the 12 phase-1 candidates. NOTHING APPROVED — the game shows the drawn placeholder.
Gates: go test (events_test.go), eventsvectors --check, eventsgofalsify (13/13 red), eventsgame (58, real touch,
landscape + rotated portrait, offline + online; --falsify 4/4 red), eventartgate (26 incl. a real Flux
regeneration; --falsify 3/3 red); dev/events.html now draws through js/events/render.js (eventsshot green).
Added (coordinator request): the player's name written into art (`overlay` in the manifest,
js/events/overlay.js, review-page NAME ON IT editor with live preview; dojo_2's scroll box set);
`tools/overlaygate.mjs` 10 checks, --falsify 3/3; eventartgate 27, --falsify 4/4. Incident: my
`pkill -f eventart/server.mjs` killed the manager's review server on 8023 — gates now only ever kill
their own PIDs on 9500-9549 with temp data dirs.
Open for Aaron: pick the art (recommended heroic_2, halloween_1, dojo_2; heroic → reveal-week W43, dojo → W44,
halloween → halloween:2026 by default — change on the page); arena `oppDmg` is client-claimed (≤ +1 point per
agreed loss) until hub.go's round report carries HP (C's file); signing in mid-event re-seats the stick man on
that account's dice once.
Deploy (needs approval; nothing run): approve art → commit `assets/events/`; `server/deploy.sh` (now also
rsyncs answers.json to /srv/data/ragdojo-arena/event_answers.json; unit gains ARENA_ENTITLEMENT_URL +
ARENA_EVENT_ANSWERS); `npm run build` (copies assets/events) then `games/deploy.sh`; no Caddy change (routes sit
under /gms/2d/ragdojo/arena/). The payment service must answer GET /api/br8t/entitlement for Pass events to lock.
