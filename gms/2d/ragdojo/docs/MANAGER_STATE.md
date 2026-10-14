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


### C status (2026-10-13)
Done, local only, NOT deployed: Last Man Standing, Steal the Bandana, King of the Hill (2-8 players,
rooms with a 20 s countdown at 4, joins until it ends or 8; friend rooms with a host START), master
picked from MEASURED pings, host migration (master's socket down 1.5 s -> eliminated, best-ping seat
rebuilds from keyframe + newest snapshot and carries on), leavers eliminated never void, agreed
results with placings (`matches.score = "place 2,3,1"`), practice vs objective-aware bots
(`?mode=bandana&bots=3`, PRACTICE buttons), panel modes flipped live (minimal hunks in D's panel.js:
room view, room result, practice, out/master events, `go` resync on a resumed socket).
Files: js/net/modes.js, js/net/objective.js, server/rooms.go (+rooms_test.go), fight.js, wire.js,
client.js, match.js (ffa / onLand / fitAll), hub.go hooks; panel.js + arenagate (one check) + main.js /
index.html cache-bust touched minimally.
Agreed round reports now carry per-fighter damage; the server derives oppDmg (deciding round, most-
damaged opponent) into seatRow.OppDmg -> ev_arena.close (one-line edits in store.go / events.go).
Gates: go test (rooms_test.go, 10 mutants red), tools/modegate.mjs (61, --falsify 26/26 red),
tools/modesim.mjs --check, tools/arenamulti.mjs (lms x4, bandana x4, hill x3, kill-the-master x3;
--falsify 6/6 red). Measured: 30 snapshots/s, 0% underruns, hand-over gap ~1.7 s; balance numbers in CLAUDE.md.
Not done / open for Aaron: the ONLINE.md line "if the master drops the match is void" for LMS is
superseded by host migration (Aaron's later call); `oppDmg` for events in rooms still undefined;
bandana at 8 players nearly always goes to time (first-to-20 rarely reached) — fine, or scale the target;
public rooms of 2-3 start after 45 s (my default, not in the brief).
Deploy: same steps as phase 1 (server/deploy.sh, unchanged Caddy fragment, games/deploy.sh); no new
env needed (ARENA_ROOM_MS / ARENA_MIGRATE_MS are test-only overrides).

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

### F3 status (events review fixes, 2026-10-13)
Done, local only, NOT deployed. R3's H3/M1/M2/M4/L1/L4/L5/L7/L10 fixed (see CLAUDE.md "Event secrets"):
approved art is server-only (`server/eventart.go` serves a tile per square the caller opened, the whole
picture only at 25; the review tool writes `~/.ragdojo/eventart/approved/`, the public manifest keeps
`{w,h,choices,overlay}`; the six committed pictures removed); no answers in the bundle (reveal.js
`PICTURES` gone, no offline guess bonus, no guess on the practice picture, a guess needs a battle);
Halloween retitled SPOOKY WEEK; new decoys set in Aaron's tool data and republished; Pass events bank
every battle; battles stamped on server time; merge re-caps; cloud adopt re-pays unpaid ink; Hindi
names; panel refresh after a guess; 40 px guess buttons; rivals keyed by `rid`.
For F1/manager: `server/events.go` `placeholderAnswer` (and events_test/abuse_test) held the W43
picture's real answer in public source (since replaced: F4 gave every approved picture new wording) — the client no longer offers placeholder guesses,
so it can go. Restart Aaron's review tool on 8023 (it still runs the old code, which would write
approved pictures into assets/events).
Deploy additions: `server/deploy.sh` now rsyncs `~/.ragdojo/eventart/approved/*.jpg` to
`/srv/data/ragdojo-arena/event_art/` (the server's default art dir next to event_answers.json).

### F1 status (arena server hostile-review fixes, 2026-10-13)
All 15 R1 items, R2's 5 server halves, and R3's server items are done in server/. Every exploit is
ported inverted into `server/abuse_test.go`, and each fix has a revert mutant that turns its test
red (57/57). Gates green: `go test -race ./...`, arenaserver, arenagate (+ `--lan` via the real
lan.sh), arenamulti (hand-over 3.0 s), boardsgate, ghostgate, modegate. eventsgame was not stable
while F3's client work was in progress. Deploy steps unchanged (deploy.sh / unit / Caddy fragment).

### F2 status (online client fixes + payment kick, 2026-10-13)
Done, local only, NOT deployed. Money: R3 H1 (re-checks kicked paying players out of CYBER/DEITIES mid-fight),
M3 (Pass-first upsell from Pass events / the arena allowance), M6 (live mode ignored) fixed and pushed in
73806d0c. Netcode: R2 H1 (hidden master hangs up with 4001; guests send `{t:"stall", match, ms}`; forfeit copy
from F1's `by`/`why`), H3 (first over-snapshot; no eliminations after the end), M1 (online hit-stop is a held
picture, 150 ms strike buffer both sides, reconcile on `F.ack`), M2 (no panel pop, X/DONE hang up, idle client
closed), M4 (bandana + next hill in the camera fit, edge arrow), and the low items (practice pauses, `?bots=0` = 1,
shared first on ties, hill = grounded pelvis, bandana rolls clear of the stick, no N LEFT in respawn modes,
`_connecting` after a throwing WebSocket). Also F1's rematch `tok` and signin/slow copy.
Measured (t_predict, 5 runs each, attack sequences guest vs master): before 44 / 37 mismatched of ~215 matched
(0 / 140 ms); after 9 / 4 of ~280. t_rules: loose bandana off screen 12-20% -> 0%, next hill 18-46% -> <0.5%.
Gates: `tools/netfixgate.mjs` (35, --falsify 21/21), `tools/arenafix.mjs` (20, --falsify 7/7; needs F1's
4001/stall server), `tools/upsellgate.mjs`, accountgate + services.test extended. Deploy: client only —
`npm run build` then `games/deploy.sh` (the payment fix is the urgent one; it is LIVE-affecting).

### F4 status (R4 review fixes, 2026-10-13)
Done, local only, NOT deployed. R4's four repro tests ported inverted into `server/abuse_test.go` (R4 section) plus
tests for each rule; each fix has a revert mutant (F4 scratchpad `mutants.py`, 13/13 red).
1. Forged stall: the silence is timed by the server from the first report; a 1v1 guest's quit after 10 s of
   reports is the master's forfeit only if the server saw the master go quiet (away, or a pong >2 s late);
   both sockets healthy = void `stall` + a dispute for both; a flagged guest's claims are ignored. `flagged()`
   is now an absolute count (3 in 24 h or 6 in 7 days) so honest losses or alt-account matches cannot
   dilute it. Rooms: a stall majority hands over; it eliminates only with the server's own evidence.
2. A 1v1 stall report never disconnects the master (its 4001 or a pong timeout decides).
3. Early forfeit is time-only (first 10 s); a round-1 quit/silence after that is a counted win.
4. A hidden room master hands over but stays in; it resumes as a guest (client: `NetFight.suspend()` on hide,
   `resync` un-suspends, `unrecord()` on demotion).
5. Event answers: every approved picture has new wording + sibling decoys set through the review tool's API
   (Aaron's answers.json, state.json themes and approved/ republished; manifest committed). Answer strings
   scrubbed from the tree; `eventsecretgate` now scans server/docs/tools/CLAUDE.md and the git history and
   checks no current choice was offered before.
6. Owner poll settles at 2 min; art 403 is identical for "no art" and "not opened"; `/health` lists every live
   mode; per-IP cap 64, IPv6 per /64.
7. vpstats: RAGDOJO arena section (its own repo, committed and built, not deployed).

### QF status (QUICK FIGHT + ghost players, 2026-10-14)
Done, local only, NOT deployed. Every arena mode (1v1 included) has QUICK FIGHT beside FIND A FIGHT and FRIEND
LINK; the PRACTICE button is gone (the `?mode=..&bots=` hook stays). QUICK FIGHT opens a waiting view inside the
sheet (mode, 10 s countdown, who has joined with you first, CANCEL, footnote "*unfilled slots are filled by ghost
players"). Server (`server/quick.go`): one quick window per mode, joiners inside it share it; at the deadline the
match is 2 (duel) / 4 (rooms) fighters, all humans up to 8, the rest ghosts. The server picks each ghost
(personality, name + "*", seed, skill, loadout) and reveals them one per tick across the last 3 s; a late human
drops unshown ghosts first, then the last-revealed one. 1 human: `quickgo`, played on the device (LocalFight; 1v1
is a best of 3). 2+ humans: a normal online room with ghost seats after the people's (the master runs their
brains; a new master takes them over from the keyframe); two humans in a 1v1 window = a plain best of 3.
Personalities on the existing Brain (style params): BRICK, ZIPPY, RUMBLE, INKSLINGER, SNEAK (lurks, picks off the
hurt, camps the next hill), RANDOM (~40%, a realistic name, style changes every 12-25 s, a pure function of seed +
clock). Sign-in + allowance as FIND A FIGHT (the token rides on `{t:"quick"}`); never ranked (`recordQuick`:
`matches` row tagged "quick", no players/by_type/daily rows, a separate pair-cap counter); events: 2+ humans via
`store.afterMatch` with people ranked among themselves (`hwin`), 1 human via `ragdojo:battle` `{src:'campaign',
kind:'quick'}`. Typed names can no longer contain `*` (names.go).
Gates: `go test -race ./...` (quick_test.go, 11 tests), `tools/quickgate.mjs` (35 checks; `--falsify` 32/32 red:
17 JS + 15 Go mutants), `tools/quickbrowser.mjs` (60 checks, REAL touch, landscape + rotated portrait, two Chromes
over WebRTC, offline; `--falsify` 9/9 red); arenaserver 18, arenagate 25, arenamulti, boardsgate 45, arenafix 26,
modegate 61, netfixgate 45, ghostgate 29, panelgate 18, portraitgate, modesim --check green; `npm run build` ok.
Shared hunks left for the manager: main.js (panel import `?v=20261014-qf`), index.html (`main.js?v=20261014-qf`),
css/style.css (3 rules after `#arenaBody .lname small`), this section, CLAUDE.md "Quick fight" section, ONLINE.md.
Deploy: `server/deploy.sh` (no new env, route or table; `ARENA_QUICK_MS` is test-only), then the client build.
Open for Aaron: ghost name style (named ones show as "Brick*", "Zippy*"…; RANDOM uses a typed-looking name);
SNEAK is the weakest style in a 4-way LMS (avg place 3.4 of 4 vs 2.8 plain) — fine or tune.

### EV status (THE TOWER, STORY, paid campaign cap, 2026-10-14)
Done, local only, NOT deployed; committed + pushed (84d32388, 3710b75c, 667835e9). SCROLLS & ROPES and MONTHLY
PICTURE are gone (client defs, server defs, docs, tests; `load()` drops them from saves, the server 404s their ids and
deletes their rows on start). New Pass events: **THE TOWER** (`tower`, ISO week): 12-floor ink pyramid, FIGHT FLOOR N
runs a real local fight (`TowerMatch`, main.js `startFight`/`endFight` hooks), win up / loss down / never below 1,
winning floor 12 = TOP (600 ink + "TOP OF THE TOWER" backdrop prize, once a week), then defend; opponent scaled to
the player's own body and kit (tools/eventtower.mjs: floor 1 100%, top 27-77% across a fresh/early/mid/maxed save,
14-22 fights to the TOP); server stores the W/L list (`ev_tower`), recomputes the floor, 8 s gap, 120 a day, the
campaign-claim time rules; tower rivals (floor, tops) from the sync. **STORY** (`story`, month, any battle): three
original stories (THE STOLEN BANDANA / THE GREAT SPILL / THE DRAWING DRAGON) by month, 6 chapters of 12-16 circles,
a point = a circle, the last circle opens the chapter's code-drawn picture + paragraph, NEXT CHAPTER, re-readable,
finishing = 500 ink + the last picture as a backdrop. **Paid cap**: supporter or Pass = no daily limit, 15 s gap,
client and server agree (golden vectors); payment outage = free cap but nothing lost. Solo quick fights (`quick:`)
are accepted as campaign claims.
Gates: `go test -race ./...` green (115 s); eventsgate 183 (--falsify 43/43), eventsvectors --check, eventsgofalsify
36/36, eventsgame 134 (--falsify 18/18; 3 stale mutants fixed), eventtower --check (+--falsify 2/2), eventsecretgate
9, eventsshot, accountgate, services.test 28, panelgate 18, portraitgate, bootgate, `npm run build` ok.
Shared hunks left for the manager: js/main.js (`events/ui.js?v=20261014-ev`; mountEvents gains `paid`, `startFight`,
`endFight`, `currentMatch` — 6 lines), CLAUDE.md (new section "THE TOWER, STORY and the paid campaign cap"), this
section. index.html needs `main.js?v=` bumped (QF's `-qf` bump covers it if it lands after my main.js hunk).
Deploy: `server/deploy.sh` as before — no new env/route; `ev_tower` is created on start; the payment service must
return `entitlements.ragdojo_supporter` / `br8t_pass` on GET /api/br8t/entitlement (it does) for the paid cap.
Open for Aaron: TOP reward (600 ink + backdrop) and story reward (500 ink + backdrop) amounts; tower opponent
difficulty (a fresh save tops out ~27%, a mid one ~77%); quitting a tower fight from pause records nothing.
