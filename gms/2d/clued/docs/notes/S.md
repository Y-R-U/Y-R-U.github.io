# Lane S — server + multiplayer (notes)

Status 2026-10-05: **server live** at `https://games.br8t.com/gms/2d/clued/api/` (systemd `clued`, 127.0.0.1:8012,
data `/srv/data/clued` 700, Caddy route added with a Caddyfile backup). Client (`js/net/`) done: online hub with public
list, join-by-name, host setup, lobby with QR, synced questions through A's runner, scoreboards, podium, server
challenges, serverless link challenges, admin page. All tests green (below).

## Files
```
server/                Go 1.26 + modernc sqlite (CGO off). main/rooms/roomhttp/scoring/names/limits/firebase/
                       challenges/protect/stats/alerts/admin.go, server_test.go, test.sh, deploy.sh,
                       clued.service, caddy_route.py
js/net/index.js        entry points (below); importing it registers the screens
js/net/transport.js    room transport interface + server transport + P2P hook
js/net/api.js          base URL, JSON fetch, server clock, SSE→long-poll subscription
js/net/room.js         'room' screen: lobby, runner wiring, scoreboards, podium
js/net/join.js         'online' hub (+ public list), 'join', 'host' screens
js/net/challenge.js    server challenges: create from results, 'challenge' screen
js/net/linkchallenge.js serverless #lc= link challenges ('linkchallenge' screen)
js/net/share.js        share sheet: navigator.share → clipboard, QR
js/net/board.js        scoreboard / podium / timing chips
js/net/signin.js       protection-level sign-in asks (inline, opens the br8t account panel)
js/net/ident.js        name prefill (remembered name, then br8t display name) + optional ID token
js/net/util.js, net.css, admin.js
js/vendor/qr.js        own QR encoder (byte mode, ECC M, v1–20, MIT), verified against jsQR
admin.html             admin page (noindex)
tools/s_room_e2e.mjs, s_challenge_e2e.mjs, s_public_e2e.mjs, s_qr_test.mjs
```

## Entry points (A calls these; all wired in main.js / home.js / results.js already)
`joinRoom(code, ctx)` (?join=), `openChallenge(id, ctx)` (?c=), `openLinkChallenge(hash, ctx)` (#lc=), `openOnline(ctx)`,
`createChallenge(ctx, { spec, questions, score, answers })` (results button), plus `linkChallenge(ctx, same)` (serverless
send), `hostRoom(spec, { title })` (host a prepared spec, e.g. a pub quiz), `createLinkChallenge(out, name)`,
`registerTransport`, `getTransport`, `fallback`, `routeFromUrl()`.
Seats (playerKey per room) live in sessionStorage `clued.room.CODE` = `{ key, id, via }`; refresh → A routes `?join` (room.js
keeps `?join=CODE` in the URL while you're in a room) → silent rejoin.

## Server API (final; base `/gms/2d/clued/api`, `/api/...` also works)
All JSON. Errors `{ error, code }` (+ `level` on gate refusals). CORS: `https://y-r-u.github.io`, `http://localhost:8888`,
`https://games.br8t.com`, `https://yru.br8t.com` (env `CLUED_ORIGINS`); other Origins get 403. Optional
`Authorization: Bearer <Firebase ID token>` on create/join/challenges attaches the uid (anonymous Firebase users don't count).

| | |
|---|---|
| `GET /health`, `GET /time` | `{ ok, now, rooms }` · `{ now }` (clock sync) |
| `GET /status` | `{ level, levelName, publicFree, maxPlayers }` |
| `POST /rooms` | `{ hostName, spec, title, questions (≤200, ≤512 KB), answerSec 3/5/10/15/20/30, gapSec 3/5/10/0(=host taps Next), public, startIn 60/120/300/0, lateJoin }` → `{ code, hostKey, playerKey, playerId, room }` |
| `GET /rooms/public` | `{ now, max, rooms: [{ code, title, formats, packs, kids, difficulty, host, players, phase, q, total, answerSec, startAt }] }` (memoised 2 s, `max-age=3`) |
| `GET /rooms/{code}` | peek `{ code, phase, players, host, title, total, q }` |
| `POST /rooms/{code}/join` | `{ name, key? }` → `{ playerId, playerKey, room, rejoined? }` (key = rejoin; same signed-in uid also rejoins) |
| `GET /rooms/{code}/events?k=` | SSE: `event: state` (full state), `kicked`, `gone`; `: ping` every 15 s |
| `GET /rooms/{code}/state?k=&since=V` | long-poll fallback (returns at once if ver > V, else waits ≤ 20 s) |
| `GET /rooms/{code}/q/{i}?k=` | `{ i, game, question }` — only up to current+1 (prefetch) |
| `POST /rooms/{code}/answer` | `{ key, q, given, correct, points?, ms }` → `{ correct, points, ms, score, streak, state }` |
| `POST /rooms/{code}/leave` | `{ key }` |
| `POST /rooms/{code}/vote` | `{ key, q }` → state (vote to reveal more) |
| `POST /rooms/{code}/{start,next,end,kick,host,settings,again}` | host only, `{ key (or hostKey), playerId?, answerSec?, gapSec?, public?, startIn?, lateJoin?, spec+questions (again) }` → state |
| `POST /challenges` | `{ name, title, spec, questions, score, correct, ms }` → `{ id }` (8 chars) |
| `GET /challenges/{id}` | `{ name, title, spec, questions, total, score, plays, scores[top 50] }` |
| `GET/POST /challenges/{id}/scores` | post `{ name, score, correct, ms }` → `{ id, rank, plays, scores }` |
| `GET /admin/overview`, `POST /admin/level {level}`, `POST /admin/rooms/{code}/close`, `POST /admin/test-alert` | admin token only |

**Room state** (`room`, SSE data): `{ code, ver, now, phase: lobby|question|reveal|final, q, total, game, qStart, qDeadline,
limitMs, revealAt, auto, answerSec, gapSec, kids, difficulty, public, startAt, lateJoin, title, spec, hostId, answered,
players: [{ id, name, score, correct, streak, best, online, host, answered, late, signed, last? }], you: { id, name, host,
joinedQ, kicked, last?, rank }, expired? }`. Players are score-sorted in reveal/final; `last` (this question's result) is
only shown in reveal/final.

**Timing/scoring (server-authoritative; 2026-10-08 changes — Next bound to `q`, media-ready hold, ms clamp, breakdown, listen factors, streak setting — in TIMING.md):** start/next → `qStart = now + 3 s` lead-in, `qDeadline = qStart + answer time`
(host choice for every question; long formats like connect/blitz60/ladder keep their minimum). Answers accepted until
**deadline + 500 ms** (server clock); client ms used if ≤ server-measured ms + 300, else server ms; clamped to [0, limit].
Ends early when every online, non-late player answered. Reveal → auto-next after the gap (or host taps Next). Scoring per
DESIGN: `100 + round(400·remaining/limit)`, cap 500, streak +10%/answer after the first (cap +50%); partial formats
(ladder, pin-drop, number, blitz60, match, connect, sort, neighbours, order, chain) send their own points (clamped 0–500).
mc (index) and tf (bool) correctness is re-checked server-side. Kids rooms: flat 100/correct, default answer time 20 s.
Rooms: 5 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (profanity-checked), expire after 6 h idle (clock-driven
transitions aren't activity); an empty public lobby expires after 10 min. Rooms persist (write-behind to SQLite every 2 s)
and survive restarts/deploys. Host away > 30 s or leaving → earliest-joined online player becomes host. Late joiners play
from the next question (unless `lateJoin:false`). Names: ≤ 20 runes, control/format chars and `<>` stripped, profanity
filter (substring + whole-word lists with exceptions: Hancock, Dickens, Sussex pass), case-insensitive dedupe "Sam 2".

## Vote to reveal more (progressive questions) — added 2026-10-05
- **Server:** a question with `stages: N ≥ 2` is progressive. `POST /rooms/{code}/vote { key|playerKey, q }` → state
  (409 `locked` / `last_stage` / `cannot_vote` / `not_open` are harmless). needed = connected players who can still answer
  and haven't; when every one of them has voted, stage +1 for everyone and votes reset. A disconnected player drops out of
  `needed` (re-checked every tick). The first answer locks voting. Kids rooms auto-advance a stage every 4 s.
  Timing: initial deadline = answer time × 1.5 (min 10 s); each advance extends to max(deadline, now + max(5 s,
  answer/2)); capped at 90 s from question start; +500 ms grace on the final deadline. Points = base × (1 − 0.6·stage/(N−1))
  using the server's stage at receive time, then the streak bonus. Answers record their stage (`you.stage`).
- **State fields** (no separate messages; the transport carries them in room state): `stage, stages, votes, needed,
  locked`, with `qDeadline`/`limitMs` updated on each advance, and `you.voted`, `you.stage`. For P2P: a "stage" event =
  `stage` went up (with the new `qDeadline`), "lock" = `locked` became true, "vote" = `votes/needed` changed.
  Transport method: `vote(code, key, q)`.
- **Runner (`js/structures/runner.js`, A's file, edited by S):** `api.stage`, `api.stages`, `api.stageLocked`,
  `api.onStage(cb) → unsubscribe`, `api.requestMore()`, `api.moreButton` (true when the runner draws the shared button, so
  formats hide their own). The runner draws "Show more 👀 (votes/needed)" in the HUD row with Locked 🔒 / All shown states.
  Solo: requestMore advances at once (kids: auto every 4 s) and extends the local timer by the same rule, with a "+5s"
  flourish on the ring. Online: `cfg.requestMore(i, q, stage)` sends the vote; the room calls `run.setStage(stage,
  deadline, limitMs)`, `run.setVotes(votes, needed, voted)`, `run.lockStages()`. Answer records carry `stage`/`stages`; the
  multiplier lives in `js/core/scoring.js` (`stageMultiplier`, `progressiveLimit`, `stageExtendMs`, `PROGRESSIVE_CAP`).
- **Other runner changes (lane AU requests):** the previous format's `ctrl.destroy()` runs before each new question; the
  HUD row is shown when a question is progressive. `session.js` gained `prepareFormats(questions)` (calls `fmt.prepare?.(qs)`
  before preflight); rooms also call it per fetched question. Online rooms put `online: true` into every round's `opts`.
- **Async progressive scoring (challenges):** Show more is free to use (points still follow the multiplier). Both challenge
  kinds store per-question `detail = [[correct, stage, ms], …]` (server column `challenge_scores.detail`, link payload
  `c[].d`). The results show a "Question by question" panel: the winner of each question is correct with the lowest stage,
  ties by time, with the stage used shown per player ("clue 2", "step 2/4" or the question's `stageLabels[s]`).

## Protection, caps, stats, alerts
- Caps (env): public 5 `CLUED_MAX_PUBLIC`, private 20 active (touched < 20 min, not final) `CLUED_MAX_PRIVATE`, 16
  players/room `CLUED_MAX_PLAYERS`, 200 SSE `CLUED_MAX_SSE` (+120/IP), 300 challenges/day `CLUED_CHALLENGES_PER_DAY`,
  3000 rooms total, body caps 16 KB / 600 KB, per-IP rate limits (limits.go). Refusals → friendly UI text
  ("Clued is busy…"); a full public cap offers "Create a private game" inline.
- Levels 0–3 in `settings` table; `/status` exposes it. Auto-escalate to 1 at > 30 rooms/hour or ≥ 3 cap refusals/hour
  (`CLUED_ESCALATE_*`), never auto-lowers. Admins (`CLUED_ADMINS`, verified email) are exempt. Client: sign-in needed →
  inline panel + button that opens the br8t account panel (or Google sign-in), then retries; paused/busy → message plus
  "Host from your device instead" when a P2P transport is registered.
- Stats: `stats_daily(day,key,value)` (rooms_public/private, joins, challenges, challenge_plays, refusals, refusal_<cap>,
  hosts_signed/anon, peak_rooms/players/sse), `stats_ips` (salted SHA-256 per day, pruned 30 d), rolling hour in memory.
- Alerts: logged + `alerts` table always; ntfy push (`CLUED_NTFY_TOPIC`, Title "Clued: kind", Click → admin page,
  escalation = Priority high + rotating_light) and optional SMTP (`CLUED_SMTP_HOST/PORT/USER/PASS/FROM`, 465 = TLS,
  else STARTTLS). One per kind per hour. Kinds: escalation, cap, digest (daily, only if unusual), test, level/admin events.
  Secrets live in `/srv/data/clued/clued.env` (600, `EnvironmentFile=-`); deploy.sh never writes it.
  **Verified:** `clued test-alert` on the box → "delivered via: ntfy".
- Admin page `admin.html` (Google sign-in via /lib/auth; server checks the token): KPIs, 14-day SVG chart, live rooms with
  Close, level switcher, alerts + "Send test alert". Box CLI: `clued test-alert`, `clued level N`.
- Memory: RSS **10–12 MB** idle on br8t; **28 MB** locally with 20 rooms × 10 players and 180 SSE streams.
  Unit: `GOMEMLIMIT=48MiB`, `MemoryMax=128M`.

## Transport interface (for the wave-2 P2P lane)
`js/net/transport.js` documents it: `create, peek, join, subscribe(code,key,{onState,onEnd,onLink}), question, answer,
host(code,key,action,extra), leave, now, syncClock`, all using the server's room state shape above. room.js only talks
to `getTransport(via)`; seats remember `via`. To add P2P: `registerTransport({ id: 'p2p', ... })` and set
`fallback.host = opts => …` (opts = the create body: hostName, spec, title, questions, answerSec, gapSec); join.js then
shows "Host from your device instead" on busy/paused refusals. P2P join links/routing are the P2P lane's call
(suggest `?p2p=ID` → its own join screen, then `go('room', { code, key, st, via: 'p2p' })`).

## Link challenges (serverless)
`#lc=` + `z` + base64url(deflate-raw(JSON)) (or `j` + plain JSON without CompressionStream). Payload
`{ v:1, b: BUILD, t: title, s: GameSpec (with seed), f: fingerprint of question ids, tm: timer, c: [{ n, s, r }] ≤ 8 }`.
Receiver regenerates via `prepare(spec)` (same sparesRatio as solo play), warns on BUILD mismatch or fingerprint
difference, plays through the runner, then gets a reply link with the chain appended. ~250 chars for a 4-question set.
The server challenge path falls back to offering a link challenge when refused (sign-in level, daily cap, paused).

## Deploy
`server/deploy.sh` (server only: build on box, unit, health check + rollback, Caddy route). `RUN_TESTS=1` runs
test.sh on the box first; `STATIC=1` also rsyncs the client (excluding docs/server/tools/*.md) to
`/srv/apps/br8tgames/site/gms/2d/clued/`; `ROLLBACK_DRILL=1` proves rollback. Verified: public `/api/health`, CORS
preflight from `https://y-r-u.github.io` returns `access-control-allow-origin`, SSE streams through Caddy unbuffered,
`/api/admin/overview` → 401 without a token.

## How to test
- `server/test.sh` — gofmt, vet, 21 Go test funcs (now also: unanimous vote advance, lock on first answer, a disconnected
  player not blocking, the stage multiplier, deadline extension + 90 s cap + 10 s minimum, kids auto-advance, challenge
  detail; the multiplier and cap tests were checked to fail when broken) (rooms flow, scoring, mc/tf verification, kids, grace 499/501 ms,
  early end, host-chosen timing, kick/leave/handover, Firebase uid, rate limits, body caps, expiry, persistence, SSE,
  CORS, challenges + 90-day expiry, public cap + listing + auto-start + abandonment, caps/levels/escalation, alert
  rate-limit, admin auth), then smoke-tests the real binary. Falsified: breaking CORS, timed scoring or the grace
  constant makes them fail.
- `node tools/s_room_e2e.mjs [--poll]` — local server + 3 headless Chromes (9406/9436/9446): host creates via real clicks,
  2 joiners open the share link, 10 questions, a refresh/rejoin mid-game, a silent player on the last question,
  identical final scores on all screens, then a progressive round: everyone sees "Show more 👀 (0/3)", 2/3 → 3/3 advances
  everyone, the first answer locks the button for all, the server applies the stage multiplier; host leave → handover.
  36 checks, passes with SSE and with `--poll`. Runs have an 8-minute hard timeout and 20 s per CDP call; screenshots are
  skipped (not failed) when Chrome is too loaded to capture.
- `node tools/s_unit_test.mjs` — async winners (lowest stage, then time), detail ordering, multiplier and timing helpers.
- `node tools/s_challenge_e2e.mjs` — challenge from A's results screen, ?c= play + leaderboard + comparison; #lc= play +
  reply chain + comparison.
- `node tools/s_public_e2e.mjs` — public list card (host, players, countdown) and public cap → private fallback.
- `node tools/s_qr_test.mjs` — QR output decoded by jsQR (v1–13).

## Open issues
- Other lanes share this scratchpad and the box's Chrome budget: use a private log path for e2e runs.
- Local reveal points (runner card) use the server formula but can differ by a few points from the server's (scoreboards use server).
- Profanity filter is English-only and basic.
- Public-room titles come from the format title; there's no free-text title input (deliberately, less to moderate).
- The ?api= local override is read from the navigation entry / sessionStorage because the shell strips the query.
- SMTP untested (no credentials yet); ntfy verified.

## Requests
- **A:** in `route()`, please strip only `join`/`c` (not the whole query): other params (`api`, `netpoll`, `noauth`) are
  lost today. Lane S works around it via `performance.getEntriesByType('navigation')`.
- **A:** `__cluedReload` drops `?join=CODE`; harmless (seats rejoin via the kept URL) but `location.search` could be kept.
- **Manager:** commit `admin.html` (game root) with the lane; it's linked from alert pushes. Static deploy is yours
  (`STATIC=1 ./deploy.sh` if you want this script to do it).
