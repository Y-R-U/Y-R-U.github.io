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
js/events/tower.js     THE TOWER: W/L list -> floor, TOP, gap/day limits, rivals
js/events/story.js     STORY: the three stories, month -> story, points -> chapter/circle
js/events/state.js     the events save: record, merge, prune, dailies rule
js/events/towerfight.js TowerMatch + towerLevel (the floor's opponent, scaled to the player)
js/events/storyart.js  the 18 chapter pictures + the tower prize, drawn in code (ink + ragdolls)
dev/events.html        standalone preview (fake rivals, simulated battles)
tools/eventsgate.mjs   the gate (183 checks); --falsify breaks it 43 ways and expects 43 reds
tools/eventtower.mjs   THE TOWER's balance in node (every floor × 4 saves); --check, --falsify, --climb
tools/eventsshot.mjs   the preview in headless Chrome with real touches
```

No module touches the DOM, `Date.now()` (except `today()`), or `Math.random`.

## Events and windows

| id | kind | window | access | counts |
|---|---|---|---|---|
| `vines-day` | Vines & Ladders | UTC day | free | any battle |
| `reveal-week` | Picture reveal, 1 pt/square | ISO week, Monday 00:00Z | free | any battle |
| `tower` | THE TOWER, 12 floors | ISO week, Monday 00:00Z | Pass | its own tower fights (W/L, no points) |
| `story` | STORY, 6 chapters of circles | calendar month UTC | Pass | any battle |
| `halloween` | Picture reveal, "SPOOKY WEEK" | Oct 24 – Nov 1 UTC | Pass | any battle |

`vines-month` (SCROLLS & ROPES) and `reveal-month` (MONTHLY PICTURE) were retired 2026-10-14 for
THE TOWER and STORY. Their ids no longer parse: `load()` drops them from a save (so merge, adopt
and banking never see them), the server answers 404 and deletes their rows on start.

An **event id** is `<def id>:<window key>`: `vines-day:2026-10-13`, `reveal-week:2026-W42`,
`tower:2026-W42`, `story:2026-10`, `halloween:2026`. `parseEventId` turns one back into its definition and
exact `[start, end)` window, so an id alone is enough for the server to know which battles count.

## Points

`pointsFor`: win 3; loss with the opponent more than 50% damaged (`oppDmg > 0.5`, strictly) 2;
any other loss 1. A battle counts for an event when `start <= at < end` and either the event is
`anyBattle` or the battle's `src` is `'arena'`. A best-of-3 or a Last Man Standing is ONE battle.
For LMS `oppDmg` is the most-damaged opponent; for best-of-3 the deciding round (manager's call,
2026-10-13).

**Campaign cap** (`CAMPAIGN_CAP` in calendar.js): an "any battle" event counts at most 10 campaign
fights per UTC day, each at least 60 s after the last one counted. **Paid players** (the
`ragdojo_supporter` unlock or a `br8t_pass`) get `PAID_CAP`: no daily limit, 15 s apart (anti-spam).
`capFor(paid)` picks one; `counted(def, win, battles, cap)` applies it and returns the counting
battles **in play order** (`at`, then id) with their points. The panel says "campaign fights count
(10 a day)" or "campaign fights count — unlimited, thanks for supporting". Ghost fights, tower
fights and (later) `kind: 'quick'` ghost-only quick fights all arrive as `src: 'campaign'` and
follow exactly these rules. In the game `paid` = `hasPremium()` (DEV / family / supporter / Pass;
dev hooks `?evpaid=0|1`). A merge on cloud adopt re-counts with `PAID_CAP` — a not-yet-known
entitlement must never trim fights already banked; online the server's cap is the authority.

THE TOWER takes no battle points at all (`counts()` is false for `kind: 'tower'`).

## THE TOWER (`tower`, weekly, Pass)

- A pyramid of **12 floors**. Everyone starts on floor 1. FIGHT FLOOR N starts a normal local
  fight (`TowerMatch`, through main.js's `startFight`/`endFight` hooks) against the floor's
  opponent. **Win → up one floor; loss → down one, never below 1.** A win ON floor 12 is a
  **TOP**; after it you keep defending (win: stay, loss: back to 11).
- **The floor is never stored.** A player is the ordered list `t: [[id, won 1|0, at], ...]`;
  `towerOf(t)` = `{floor, tops, best, fights, wins}`. `towerCounted(win, rows)` keeps rows in the
  week, one per id, play order, **8 s** apart (`TOWER_CAP.gapMs`: shorter than any real fight plus
  its result screen) and at most **120 a UTC day**.
- **The opponent** (`towerLevel(floor, save)` in towerfight.js) is scaled to the player's own
  body and kit (`towerPower`: punch × crit × specials owned/upgraded, and HP × second wind ÷
  armour) with a `(off·tough)^0.41` difficulty term, so the climb is the same climb for a white
  belt and a maxed player. Floors climb in HP, damage, skill (0.26 → 0.82), speed and moves;
  floors 5 and 9 are a pair; hazards from floor 7 (wind, coffee, eraser, pencil, rain); floor
  12 is a boss (`kind: 'champion'`, boss music). `node tools/eventtower.mjs` (autoplay player,
  skill 0.62) measured floor 1 100% for every save, floor 12 32% (fresh) / 63% (early) /
  83% (mid) / 53% (maxed), and 14-22 fights to reach the TOP; `--check` is the gate.
- **The TOP pays once per week**: `TOP_INK` = 600 ink and a PRIZES backdrop (`towerPicture()`:
  the pyramid with you and a flag on top). Tower fights earn no ink of their own.
- **A tower fight is a campaign fight for every other event**: its result is dispatched as
  `ragdojo:battle {id: 'tower:<device>:<at>', src: 'campaign', kind: 'tower'}`, so Vines,
  the picture, STORY and Halloween bank it under the campaign cap.
- Quitting a tower fight from pause records nothing (same as the campaign).
- **Rivals**: the server's `{rid, name, floor, tops?, friend?}` — friends first, then nearest
  floor, more TOPs first on a tie, then uid; 10 at most; players with no fight are not shown.
  They are drawn as initials on their floors. (No replay rule: a floor is not a future.)

## STORY (`story`, monthly, Pass, any battle)

- One story per calendar month, **three stories taking turns** (`storyIndex('YYYY-MM') =
  (y*12 + m-1) % 3`: THE STOLEN BANDANA, THE GREAT SPILL, THE DRAWING DRAGON). Six chapters
  each, 12-16 circles a chapter (87 / 84 / 85 in all). The text is in story.js and is not secret.
- **A point is a circle** (win 3, close loss 2, loss 1 — the normal `pointsFor`). Points carry
  over a chapter's end into the next. `progress(story, points)` = `{chapter, circle, opened,
  done}`. Reaching a chapter's last circle opens its picture and its paragraph; NEXT CHAPTER
  goes on to the next track. Opened chapters stay re-readable (the 1-6 buttons).
- The panel walks the stick man circle by circle from `seen` (circles already shown, saved) to
  the points banked; `read` is how many chapter pages have been continued past. Both only grow
  (merge takes the max).
- **Pictures** (`storyPicture(story, chapter)`, storyart.js): drawn in code with ink.js and the
  game's ragdoll fighters — posed stick fighters, ink props (dojo, pencils, erasers with faces, a
  paper crane, a coffee mug and flood, a paper boat, a biro bridge, sugar cubes, a doodle dragon…)
  and scribbles. One distinct scene per chapter; no images ship or are fetched.
- **Finishing pays once**: `STORY_INK` = 500 ink and the last chapter's picture as a PRIZES backdrop.

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
- `prune(state, now)` drops events that ended more than 7 days ago; `load()` drops events whose id
  no longer parses (the retired ones).
- THE TOWER's event holds `t` (its W/L rows, `recordTower`) and `claimed`; STORY's holds `b`
  like any points event plus `seen`, `read` and `claimed`. Ink claims (`bonus`, `top`, `end`)
  follow the cloud-adopt rule below.
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
| campaign battles `[id, pts, 'campaign', at]` (ids `camp:`, `ghost:`, `tower:`) | nothing — trusted, capped by `CAMPAIGN_CAP`, or `PAID_CAP` when the payment service says supporter or Pass | event is arena-only; over the day's cap (free: 10); under the gap after the last counted (free 60 s, paid 15 s); dated over 26 h ago or more than 10 min before the previous sync; more than 10 new in one sync (paid: 200); over 10 min in the future (a batch up to 10 min ahead is shifted back so its newest fight is "now") |
| tower fights `t: [[id, won, at]]` | nothing — trusted like a campaign claim | id not `tower:…`; `won` not 0/1; the same time rules as campaign claims; under 8 s after the last counted; over 120 that UTC day; more than 60 new in one sync |
| `rolls` | the ordered points of the accepted battles (`counted`, play order by server time) | `rolls > sum(points)` |
| position, turns (never sent) | `positionAfterRolls(board, uid, eventId, rolls)`, `turnsDone(...)` | — |
| floor, TOPs (never accepted) | `towerOf` over the stored, counted tower rows | — |
| story chapter (never sent) | `storyProgress(storyIndex(key), points)` | — |
| `open` squares | `cost * open.length <= points` | overspent, duplicate, out of 0..24 |
| a guess | the answer, which only the server holds | no guesses left; no counted battle in the event yet (`409 play first`) |
| rival list request | everyone's `{uid, name, points[], rolls}` for the event | rate limited per caller (a limited caller gets its cached list, else 429) — the server applies `rivalView` with the caller's own turns, so nobody receives a future position |

Endpoints (under the arena prefix, `/gms/2d/ragdojo/arena`; all but `GET /events` need the
player's token, and Pass events also need a `br8t_pass` entitlement from the payment service
— `ARENA_ENTITLEMENT_URL`; a LAN server treats everyone as Pass and paid):

**Entitlements** (`entitlementCheck` → `evEnt{Pass, Paid, Known}`, cached per uid: a positive
answer 5 min, a negative 1 min so a purchase shows up soon, an outage 30 s). `Paid` = `br8t_pass`
or `ragdojo_supporter`. **An outage** (no answer, 5xx, junk) is `Known: false`: Pass events stay
open (fail-open, as before) but **the campaign cap stays the free one** — an outage never grants
unlimited fights. It never loses them either: a claim refused only for that reason keeps the
"before the previous sync" watermark just before it (`p.mark`), the reply carries
`cap: {paid, known, perDay, gapMs}`, and with `known: false` a client that believes it is paid
keeps its refused campaign rows and claims them again on the next sync. Stored claims are always
re-counted with the lenient `PAID_CAP` (they already passed the cap they were claimed under), so a
lapsed entitlement keeps what was banked and only stops new fights past the free cap.

| call | does |
|---|---|
| `GET /events` | the running events and the server clock (also the client's probe) |
| `POST /events/sync {event, name, b, rolls, open, friends}` | applies the claim, answers with the recomputed state: `b` (accepted, play order), `points`, `cap`, `rolls`/`pos`/`turns` or `open`/`guesses`/`solved`/`bonus`/`guessesLeft`/`art` or `story`/`chapter`/`circle`/`done`, `closed`, and `rivals` for Vines & Ladders |
| `POST /events/sync {event: 'tower:…', name, t}` | THE TOWER: `t` (accepted rows, play order), `floor`, `tops`, `best`, `fights`, `wins`, `rid`, `closed`, `rivals` (`{rid, name, floor, tops?, friend?}`); rows in the `ev_tower` table |
| `GET /events/rivals?event=&friends=` | the rival list on its own (Vines & Ladders or THE TOWER) |
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
- `tools/eventsgofalsify.mjs` breaks events.go/eventart.go 34 ways (and the JS board once) — 35/35 red
  (2026-10-14: paid cap, outage, supporter, tower floor/TOP/gap/back-dating/no points/rivals,
  story circles and rotation, retired ids, Pass gating added; four stale mutants repaired).

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

`server/testdata/events_vectors.json` holds ~1,400 more (hashes incl. UTF-8, mulberry32 floats,
40 rolls × 16 uid/event pairs, 60 boards, 60 players' positions/turns/rival views, 260 windows
across year and ISO-week edges, bad ids incl. the retired ones, 40 messy `counted()` cases — every
fourth with the paid cap — 30 tower W/L lists through `towerCounted`/`towerOf`, 40 story
month/points cases, and the cap/tower/story constants) written by
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
