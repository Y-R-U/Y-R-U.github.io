# RAGDOJO special events — engine and server contract (2026-10-13)

The design is in `ONLINE.md` → *Special events*. This file is how the engine in `js/events/`
implements it, and what a server has to recompute so that the client never has to be trusted
with anything it could fake cheaply.

```
js/events/hash.js      hash32 (FNV-1a 32 + fmix32), mulberry32, die(uid, eventId, turn)
js/events/calendar.js  EVENT_DEFS, UTC windows, event ids, activeEvents()
js/events/points.js    pointsFor(battle), counts(), pointsIn()
js/events/vines.js     board, move, positionAt, takeTurn, THE REPLAY RULE, selectRivals
js/events/reveal.js    5×5 grid, choices, guesses, rewards
js/events/state.js     the events save: record, merge, prune, dailies rule
dev/events.html        standalone preview (fake rivals, simulated battles)
tools/eventsgate.mjs   the gate; --falsify breaks it 27 ways and expects 27 reds
tools/eventsshot.mjs   the preview in headless Chrome with real touches
```

No module touches the DOM, `Date.now()` (except `today()`), or `Math.random`.

## Events and windows

| id | kind | window | access | counts |
|---|---|---|---|---|
| `vines-day` | Vines & Ladders | UTC day | free | any battle |
| `reveal-week` | Picture reveal, 1 pt/square | ISO week, Monday 00:00Z | free | any battle |
| `vines-month` | Scrolls & Ropes theme | calendar month UTC | Pass | arena only |
| `reveal-month` | Picture reveal, 2 pt/square | calendar month UTC | Pass | arena only |
| `halloween` | Picture reveal, "SPOOKY WEEK" | Oct 24 – Nov 1 UTC | Pass | any battle |

An **event id** is `<def id>:<window key>`: `vines-day:2026-10-13`, `reveal-week:2026-W42`,
`vines-month:2026-10`, `halloween:2026`. `parseEventId` turns one back into its definition and
exact `[start, end)` window, so an id alone is enough for the server to know which battles count.

## Points

`pointsFor`: win 3; loss with the opponent more than 50% damaged (`oppDmg > 0.5`, strictly) 2;
any other loss 1. A battle counts for an event when `start <= at < end` and either the event is
`anyBattle` or the battle's `src` is `'arena'`. A best-of-3 or a Last Man Standing is ONE battle.
For LMS `oppDmg` is the most-damaged opponent; for best-of-3 the deciding round (manager's call,
2026-10-13).

**Campaign cap** (`CAMPAIGN_CAP` in calendar.js): an "any battle" event counts at most 10 campaign
fights per UTC day, each at least 60 s after the last one counted. `counted()` applies it and
returns the counting battles **in play order** (`at`, then id) with their points.

## Vines & Ladders

- **A TURN IS A BATTLE.** Each counted battle banks a batch of rolls equal to its points, in
  play order. A turn is consuming one battle's batch. Aaron's example, battles worth 1, 3, 2:
  turn 1 ends after roll 1, turn 2 after roll 4, turn 3 after roll 6 (`turnEnds`). There is no
  free starting roll.
- **Dice**: `die(uid, eventId, n) = 1 + hash32("die|" + uid + "|" + eventId + "|" + n) % 6`, where `n`
  is the player's 0-based ROLL index across the whole event (not the turn index). So
  re-ordering battles moves turn boundaries but never changes a roll. Reloading cannot re-roll.
- **Board**: `makeBoard(eventId)` — 8 ladders, 8 vines, seeded by `hash32("board|" + eventId)`
  through mulberry32. No square is the end of two links, 1 and 100 are never used, every link
  is 8+ squares long and drifts at most 3 columns (so it crosses at least one row).
- **Movement**: overshooting 100 bounces back. Reaching 100 ends the turn it happens in, and
  no further rolls are taken.
- **A player** is `{ uid, points: [ordered battle points], rolls }`. Their position is
  `positionAfterRolls(rolls)`; their turns are `turnsDone` (batches fully rolled).
- **THE REPLAY RULE**: a rival who has finished M turns is shown where they stood at the end of
  THEIR turn `min(M, myTurns)` — after their own first k batches, with their own dice. Nobody
  moves while you are mid-turn; everyone moves when you finish a turn. You leave at turn 7 while
  others have at most 4: they show at their 4. They play on: they show at their turn 7 and no
  further until you finish turn 8. `shownTurns()` + `positionAtTurn()` are the whole rule.
- **Rivals** (`selectRivals`): only players with at least one turn; friends first (nearest
  first), then everyone else nearest on the board, ties broken by uid; 10 in all.

## Picture reveal

25 squares. Opening one costs `cost` points from the event's total, and squares stay buyable
after a right guess (the whole picture is only ever sent at 25 open). **No answer ships with the
game** (2026-10-13 F3): the code-drawn practice picture has no choices and no guess bonus; real
art takes four choices from the public manifest and only the arena server can check a guess —
offline there is no guess bonus at all. (A salted hash was the alternative and was rejected: with
four public choices, hashing each one finds the answer in four tries whatever the salt.)
A guess needs real art (`canGuess(st, art)`) and at least one battle in the event: one guess to
start, one more per five squares opened. A right guess solves the picture and pays `guessBonus`
INK per square still covered. A solved or fully opened picture owes `arenaBackground`; a solved
one also owes the ink (`{ kind: 'ink', amount }`). `rewardsOwed()` lists what is unpaid; a reward
is claimed by adding its id to `claimed`. Pass events bank every battle but pay, show and sync
only with the Pass.

## The save (`save.events` inside the run save, so cloud sync carries it; `save.eventPrizes` holds unlocked backgrounds)

```
{ v: 1, seenDay: 'YYYY-MM-DD',
  ev: { 'vines-day:2026-10-13': { b: [[battleId, pts, src, at], ...], rolls: 13 },
        'reveal-week:2026-W42': { b: [...], open: [0, 12], guesses: ['A TEA PARTY'],
                                  solved: false, bonus: 0, claimed: [] } } }
```

- **Dailies rule** (games/CLAUDE.md): `seenDay` is a UTC date and "already today" is
  `seenDay >= today`, never `===`. Event membership is by UTC window, never local dates.
- Only **finished, agreed** battles are recorded (`recordBattle` after the result screen).
  In-progress match state never enters this save, so it never syncs.
- `b` is kept in play order — for Vines & Ladders it IS the list of turns. `recordBattle` applies
  the campaign cap.
- `recordBattle` banks into EVERY running event the battle counts for, Pass events included
  (a Pass holder whose entitlement is briefly unknown loses nothing); the Pass gates display,
  rewards and sync. Battles are stamped on the server's clock (`Date.now() + net.skew`).
- `merge(a, b)` for cloud sync: battles union by id, re-sorted into play order and put back
  through `counted()` (two devices' 10 campaign fights a day are still 10, 60 s apart), `rolls` max
  (capped at what the merged battles bank), squares union then clamped to
  what the merged points pay for, guesses union, `solved` or, `claimed` union, `seenDay` max.
- `prune(state, now)` drops events that ended more than 7 days ago.
- In the game an event may also hold `uid` — whose dice these are (the server's uid once synced,
  else the account / LAN device / `local:<device>`). Signing in mid-event can move the stick man
  once, to where that account's dice put it.
- NEW GAME keeps `events` and `eventPrizes`; adopting a cloud save merges this device's events
  into it (`mergeEventsInto` → `adoptMerge`): an ink reward stays claimed only if the adopted
  save had claimed it too, otherwise it is paid again into that save.

## Server contract (built 2026-10-13: `server/events.go`)

The client **claims**; the server **recomputes**. Everything below is derivable from data the
server already has, so the only thing a client can lie about is campaign fights.

| client sends | server recomputes from | rejects when |
|---|---|---|
| `eventId` | `parseEventId` | unknown, or window not open (allow ~10 min grace after `end`) |
| arena battle ids in `b` | its own agreed match results (`won`, `oppDmg`, `at`) | id unknown, not this uid's, result void/mismatched |
| campaign battles `[id, pts, 'campaign', at]` | nothing — trusted, capped by `CAMPAIGN_CAP` | event is arena-only; over 10 that UTC day; under 60 s after the last counted; dated over 26 h ago or more than 10 min before the previous sync; more than 10 new in one sync; over 10 min in the future (a batch up to 10 min ahead is shifted back so its newest fight is "now") |
| `rolls` | the ordered points of the accepted battles (`counted`, play order by server time) | `rolls > sum(points)` |
| position, turns (never sent) | `positionAfterRolls(board, uid, eventId, rolls)`, `turnsDone(...)` | — |
| `open` squares | `cost * open.length <= points` | overspent, duplicate, out of 0..24 |
| a guess | the answer, which only the server holds | no guesses left; no counted battle in the event yet (`409 play first`) |
| rival list request | everyone's `{uid, name, points[], rolls}` for the event | rate limited per caller (a limited caller gets its cached list, else 429) — the server applies `rivalView` with the caller's own turns, so nobody receives a future position |

Endpoints (under the arena prefix, `/gms/2d/ragdojo/arena`; all but `GET /events` need the
player's token, and Pass events also need a `br8t_pass` entitlement from the payment service
— `ARENA_ENTITLEMENT_URL`, fails open like the allowance; a LAN server treats everyone as Pass):

| call | does |
|---|---|
| `GET /events` | the running events and the server clock (also the client's probe) |
| `POST /events/sync {event, name, b, rolls, open, friends}` | applies the claim, answers with the recomputed state: `b` (accepted, play order), `points`, `rolls`/`pos`/`turns` or `open`/`guesses`/`solved`/`bonus`/`guessesLeft`/`art`, `closed`, and `rivals` for Vines & Ladders |
| `GET /events/rivals?event=&friends=` | the rival list on its own |
| `POST /events/guess {event, pic, choice}` | checked against `ARENA_EVENT_ANSWERS` (art) or the placeholder's answer (bonus 0; the client never offers it); `pic` must match what the server has (`409 picture changed`, the guess is kept) |
| `GET /events/art/tile?event=&cell=` | a JPEG of that one square, cut from the server-only picture (`ARENA_EVENT_ART`), only if the CALLER's stored state has it open (else 403); `server/eventart.go` |
| `GET /events/art/full?event=` | the whole picture, only once the caller has all 25 open (a right guess is not enough) |

- **Agreed arena results count by themselves.** `store.afterMatch` (one hook in `recordMatch`)
  writes every verified seat to `ev_arena`; every event's battle list is the player's accepted
  campaign claims plus those rows in the window, through `counted()`. A void never reaches it.
  `oppDmg` IS part of the agreed result: every round report carries each fighter's damage and
  must agree, and the deciding round's sets `close` (a 2-point loss). Arena entries in a sync's
  `b` are ignored entirely — a client cannot claim a close loss. Early forfeits (before the first
  agreed round or in the first 10 s) and results past the 3-a-day pair cap earn no event points.
- **Rivals** carry `{rid, name, pos, turns (= shown), friend, home}` only — no uid, batches, rolls
  or real turn count, so nothing in the reply can rebuild a later position. `rid` is a stable,
  opaque per-event id (salted hash of event + uid, the salt kept in the DB); the sync reply
  carries the caller's own `rid`. `friend` = an account the caller finished a friend-link match
  with (server-side `friends` table); the `friends` names a client sends are ignored. One
  caller's list is cached 5 s (while their turn count is unchanged), at most 4 scans run at once.
  The caller's turn count is the server's own, from stored battles and rolls; query parameters
  cannot raise it.
- **Guesses**: one at a time per player and event (a lock around load-check-save, plus a 250 ms
  limiter). The placeholder picture's answer is public, so solving it pays NO bonus. A client
  showing approved art the server has no answer for gets `200 {guessable: false, guessesLeft: 0}`
  (nothing recorded, logged once), not an endless 409.
- **Rolls never go backwards** (`MAX` on write) and are clamped to the points banked.
- Claims are accepted from `start` to `end + 10 min`; campaign fights may not be dated more than
  2 min ahead of the server clock. Later syncs still return the (closed) state read-only.
- `tools/eventsgofalsify.mjs` breaks events.go 12 ways (and the JS board once) — 13/13 red.

To keep the port honest, these vectors must match on the server (they are in the gate):

```
hash32('')                          = 2872998923
hash32('ragdojo')                   = 2596282342
die('uid-aaron', 'vines-day:2026-10-13', roll 0..19) = 2 1 5 3 3 2 2 2 6 6 6 1 4 3 3 4 6 1 5 6
turnEnds([1, 3, 2])                 = 1 4 6
makeBoard('vines-day:2026-10-13')
  ladders [57,83] [48,56] [42,63] [19,39] [32,51] [12,33] [84,99] [14,28]
  vines   [55,27] [68,54] [50,29] [60,41] [85,75] [25,2]  [98,66] [91,70]
```

`hash32` hashes UTF-8 bytes; uids are Firebase UIDs (ASCII). All arithmetic is uint32
(`Math.imul` = Go's `uint32` multiply).

`server/testdata/events_vectors.json` holds ~1,300 more (hashes incl. UTF-8, mulberry32 floats,
40 rolls × 16 uid/event pairs, 60 boards, 60 players' positions/turns/rival views, 260 windows
across year and ISO-week edges, bad ids, 30 messy `counted()` cases) written by
`node tools/eventsvectors.mjs` from the JS engine; `--check` fails when the file is stale.

## Images

Picture-reveal art is generated with local Flux (ink on notebook paper) and reviewed by Aaron
before anything ships: `node tools/eventart/server.mjs` (see CLAUDE.md, "Event art review").
Approving writes the picture to `~/.ragdojo/eventart/approved/<event-id>.jpg` (server-only;
`server/deploy.sh` copies it to `/srv/data/ragdojo-arena/event_art/`, a LAN server reads the
folder directly) and a public `assets/events/manifest.json` entry `{w, h, choices, overlay?}` —
four shuffled choices, no image, no answer. The answer goes only to answers.json. The panel shows
a picture square by square from the server's tiles; with no server every event shows the
code-drawn practice picture. `tools/eventsecretgate.mjs` fails on any answer in the bundle or
any picture in the repo or the builds.
