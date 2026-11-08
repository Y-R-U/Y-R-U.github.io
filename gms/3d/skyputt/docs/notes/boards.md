# boards — online leaderboards (Daily Challenge + course rounds)

Owner: `boards` agent. Status: **done and tested locally** (:8098). **Server changed → games.br8t.com needs a
server redeploy + client sync** before the Online tabs appear there (an older server has no `boards` in its health,
so the new client simply hides the tabs). Nothing committed or deployed.

## What it does
- **Daily page**: "Today's board" gets **Ghosts | Online** tabs. Online = real players on *your* hole today
  (Everyone / Friends), your rank, ✓ when they cleared the twist. Each finished try is submitted automatically.
- **Ladder page**: **Your tier | Online rounds** tabs. Online rounds = best full round per player for a course or
  nine (Sky front / back, Festival, Woods, Sugar, Reef), **This week / All time**, Everyone / Friends. A full round
  (a nine, or a whole course without nines) is submitted when its scorecard shows.
- **Friends** = people you finished an online room with (`round_players`), plus you. No new friend system.
- **Names** = the rooms' names: the client sends `settings.netName || story.name`, the server cleans it exactly like
  `hello` (`displayName`: cleaned/profanity-filtered name → Firebase display name → `Golfer XXXX`) and stores it in
  `players`, so a rename in a room shows on the boards too. Rows carry `pid` (public hash), never uid or email.
- **Identity**: the websocket's token (Firebase ID token, anonymous users included — every visitor has one through
  /lib/auth — or a dev token with `SKYPUTT_DEV_AUTH`), sent as `Authorization: Bearer`. Reading needs no token
  (no "me" row then). If the client can't get a token it doesn't submit; the board still shows.

## Endpoints (HTTP JSON, CORS like the rest; POST now allowed)
| | |
|---|---|
| `GET /api/health` | now has `boards: 1` — the client's feature switch |
| `POST /api/daily` | `{day, hole, twist, try 1-3, strokes, gems, ms, name}` → `{ok, improved, dup, met, n, name}` |
| `GET /api/daily?day=&hole=&scope=all\|friends&limit=` | `{day, hole, par, scope, total, rows[], me, signedIn}`; `hole` defaults to the global pick |
| `POST /api/ladder` | `{course, round (nine id or all), week (Monday), scores[] per hole, name}` → `{ok, strokes, par, improved, best}` |
| `GET /api/ladder?course=&round=&week=YYYY-MM-DD\|all&scope=&limit=` | same shape; `week` defaults to the server's UTC week |

Rows: `{rank, name, pid, strokes, par?, tries? (daily), met? (daily), rounds? (ladder), at, you?}`. Ranks are
competition ranks (ties share a rank, earlier result listed first); `me` is your row even below the top `limit`
(default 50, max 100). Errors: `bad_token` 401, `rate_limited` 429, 400 `bad_day bad_hole bad_twist bad_try
bad_strokes bad_gems bad_round bad_week bad_scores bad_request`, 409 `hole_changed`.

## Schema (additive: `CREATE TABLE/INDEX IF NOT EXISTS` in `boardsSchema`, run after the base schema)
- `daily_results(day, uid, hole, twist, strokes, met, gems, ms, tries bitmask, best_try, first, at)`, PK (day, uid),
  index (day, hole, strokes, at). Kept 120 days.
- `ladder_results(course, round, week, uid, strokes, par, scores JSON, rounds, at)`, PK (course, round, week, uid),
  index (course, round, week, strokes, at). Each submission upserts the week row **and** a `week='all'` row, so
  all-time survives the sweep of weekly rows after 400 days.

## Sanity rules (D11: client-reported, these are cheap checks only)
- **Daily attempt rule (checked against js/daily)**: the game gives **3 tries, best counts**, and a day's hole is
  frozen once a try starts. The online board matches that rather than "first attempt counts": one row per player per
  day holding the best, at most one result per try number (`tries` bitmask, so ≤ 3 per day; a resend of a try is
  an idempotent `dup`, the first report of a try stands), and a later result for a *different* hole that day is
  refused (`hole_changed`). Quit / picked-up tries are never sent.
- **Day**: valid `YYYY-MM-DD`, ≥ Daily #1, and a local "today" somewhere on Earth now: from UTC−12 minus a 3 h grace
  (a try started before midnight is recorded on the day it started) to UTC+14. That is "today/yesterday across time
  zones": at most 3 dates are open at once.
- **Hole + twist**: the server recomputes the daily pick in Go (`server/daily.go`, a port of `dailyFor`, incl.
  rendezvous picking, the 28-day no-repeat walk, the locked-course fallbacks and `dailyFrom`) for **every** open-course
  set (2^3 lockable courses) and accepts exactly those holes, each with its own twist. Chosen over a client-named
  allowlist because the pick is deterministic and small to port (~250 lines), so a forged hole can't open its own
  board. Boards are keyed by (day, hole): fallback players see their own board.
- **Strokes** 1..par+4 (D10 pickup), **gems** 0..crystals on the hole; `met` is computed server-side.
- **Round**: course + nine must exist, one score per hole, each 1..par+4; `week` must be a Monday that is the
  local week of a date in the day window (so Sunday-night players in the Americas still post to last week on Monday).
- **Rate limits**: 20 daily / 30 round submissions per uid per 10 min, 120 submissions and 240 board reads per IP per
  10 min (plus the existing 600 HTTP/min per IP), body ≤ 4 KB.

## Keeping Go and JS in step (IMPORTANT)
`server/dailypool.json` (embedded) is the hole/theme data the Go port uses; `server/testdata/daily_picks.json` is
the JS's own picks for 460 days from Daily #1 and every open-course set. Both come from `node tools/daily_pool.mjs`.
`TestDailyPicksMatchJS` (Go) compares the port with the fixture; `tools/boards_test.mjs` runs `daily_pool.mjs
--check` so a stale pool fails a test. **After adding/changing a course, hole par / crystals, a theme or a
`dailyFrom`: run `node tools/daily_pool.mjs`, `server/test.sh`, and redeploy the server** — until then the server
refuses daily results on days the change affects (the client just doesn't get a row; nothing breaks).

## Client
- `js/net/boards.js` — API (`available`, `submitDaily`, `submitRound`, `dailyBoard`, `roundBoard`), `roundIdFor`,
  `roundList`. Base = `defaultBase()` (so `ONLINE_PUBLIC=false` / `?server=none` → no network, tabs hidden).
  `available()` = health has `boards ≥ 1` (re-probed a minute after a miss); any 404 turns it off. A submission
  that fails on the network / 5xx / 429 / no token waits in `localStorage['skyputt.local.boards']` (≤ 12, ≤ 36 h)
  and is retried when a board tab next appears; 4xx refusals are dropped.
- `js/net/boardsui.js` — the tab row (hidden until `available()`), Everyone/Friends, week/all-time, course select.
  The panel waits for an in-flight submission so your new result is on the board it loads.
- `css/boards.css`; `index.html` links it.
- Small edits: `js/net/net.js` (`authToken()`), `js/daily/screen.js` (tabs + submit after `daily.finish`, try time
  in `ms`), `js/meta/screens.js` (tabs on the ladder page), `js/app/main.js` (boards wiring; course rounds wrap
  `showScorecard` — play.js untouched).

## Server files
New `server/boards.go`, `server/daily.go`, `server/dailypool.json`, `server/testdata/daily_picks.json`,
`server/boards_test.go`, `server/daily_test.go`; edits `server/db.go` (run `boardsSchema`, sweep), `server/deploy.sh` (ships `dailypool.json` + `testdata/` — the build needs the embed), `server/main.go`
(routes, POST in CORS, `boards` in health, `stats`). New tools: `tools/daily_pool.mjs`, `tools/boards_test.mjs`.

## Tests (2026-11-08)
- `server/test.sh`: ALL PASS (39 Go test funcs incl. 13 new: submit/board/rank/ties/limit, best-of-3 + dup + try 4,
  every sanity refusal, date window at 09:59/10:00/11:00/14:30/15:30 UTC, locked fallback board, friends, names +
  rename via hello, rate limit, ladder week/all-time/Monday rollover/sanity, health + CORS preflight, migration on an
  old-schema DB, sweep; `TestDailyPicksMatchJS` 460 days × 8 open sets).
- `node tools/boards_test.mjs` (vs :8098): 26/26 (fixture fresh, daily + round submit/board, refusals not queued,
  offline queue + flush, friends, no server / old server / 404 → hidden).
- Migration against a real old DB: built the committed server (`git archive HEAD`), let it create its DB + a player
  via hello, added a finished round; ran the new binary on a copy → boards tables added, all old rows identical
  (only `players.seen` moved, from the new hello), `PRAGMA integrity_check` ok, submit + friends board worked, and
  the **old binary still runs on the migrated DB** (rollback is safe).
- Browser (headless Chrome, 412×915 touch, no console errors): `?server=none` → no tabs; Daily → Online, a real try
  through Play → hole card → back (auto-submitted, my row shown), Friends; Sky front nine to the scorecard → Ladder →
  Online rounds (my row), All time, an empty course.
- Existing suites: physics 25/25, story, daily 79/79, events, meta, store, ballhit 41/41, online 30/30, holes (0 FAIL).

## Known / notes
- The ladder page's tier grid overflows horizontally at 412 px (`.lad-tiers` cards) — pre-existing, not from the tabs.
- `?eventdate=` days far from today are refused by the server (bad_day): those results just stay local.
- Weekly boards use each player's local Monday (as the local ladder does); a week board read by `week=` is whatever
  key the client sends.
- Anonymous Firebase players can post (same as rooms). If that gets abused, gate `submitAuth` on `!id.Anon`.

## Deploy (Aaron's OK; bundle with the pending ballhit server change)
Same as usual: `CONFIRM=yes RUN_TESTS=1 STATIC=1 server/deploy.sh` from a clean `git archive HEAD`. No env/Caddy
change (the existing `handle /gms/3d/skyputt/api/*` route covers the new paths). The migration runs on start.
