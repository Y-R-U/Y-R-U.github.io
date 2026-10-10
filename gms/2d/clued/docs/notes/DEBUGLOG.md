# DEBUGLOG — remote client debug logging (2026-10-10)

Why: Aaron hears only the FIRST clip of a music (`listen`) round on Windows Edge and Android; it doesn't reproduce in
headless Chrome. So the client can log back to the server, switched **only on the server** (Aaron: "just have the client
auto-log based on the server setting"). There is no client setting, toggle or UI in the game.

## Turn it on / off

**Admin page** (`https://games.br8t.com/gms/2d/clued/admin.html`, Google sign-in with a `CLUED_ADMINS` account):
panel **Debug logs** at the top → tick **Collect debug logs**. It shows the row count, devices, last line time, a
**Download last 24 h** button, **Clear logs**, and the latest 60 lines. Untick it when done.

**ssh fallback (no admin UI needed)**, run on the box as `deploy`:
```sh
ssh br8t 'cd /srv/apps/clued && CLUED_DATA=/srv/data/clued ./clued debuglog on'      # or: off | status | clear
```
The running service re-reads the setting every 5 s, so no restart. (Raw equivalent if the binary is ever unusable:
`sqlite3 /srv/data/clued/clued.db "INSERT INTO settings(key,value) VALUES('debugLogs','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value"`, `'0'` for off.)

**curl with an admin token** (any admin Firebase ID token, e.g. from the admin page's devtools: `(await import('/lib/auth/auth.js')).auth.getIdToken()`):
```sh
curl -X POST https://games.br8t.com/gms/2d/clued/api/admin/debuglog -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"on":true}'
#   {"on":false} to stop, {"clear":true} to delete all rows (both may be combined)
```

**How clients pick it up:** `GET /api/status` now carries `debugLogs: true|false`. A client checks it at boot, on
visibilitychange→visible / pageshow, on every screen change and at the start of every game or room question set
(`createRunner`), at most once a minute; while logging it re-checks every minute. Any POST answered 204 (flag off)
also stops it at once. So a phone that loaded while the flag was off starts logging within a minute of the next
game/screen change without a refresh, and one that is logging stops within ~3 s of the flag going off.
Developer-only override (undocumented to players): `?debug=1` forces logging in that tab (sessionStorage), `?debug=0`
clears it. The server still ignores the posts unless the flag is on.

**Test recipe for Aaron's bug:** flag on → on the phone, open Clued (or just go back to the home screen if it's open),
play a music round of 4+ questions → flag off → read the logs (below).

## Read the logs

```sh
ssh br8t 'cd /srv/apps/clued && CLUED_DATA=/srv/data/clued ./clued debuglog dump --since 1h'
#   --since 15m|2h|3d|<epoch ms>   --device ID   --session ID   --tag listen (also matches listen.*)   --limit N   --json (one row per line)
ssh br8t 'cd /srv/apps/clued && CLUED_DATA=/srv/data/clued ./clued debuglog dump --since 1h --json' > logs.jsonl
```
Text output groups by device/session (with build, room and user agent), then one line per event:
`client-time device/session perf-ms level tag msg {data}`. `perf` is the page's `performance.now()`, so gaps between
lines are exact.

Admin API: `GET /api/admin/debuglog?since=1h&device=&session=&tag=&after=<id>&limit=` → `{ on, rows, devices, last,
cap, days, lines: [{ id, ts, cts, perf, device, session, build, ua, room, level, tag, msg, data }] }` (oldest first;
the newest `limit` matches, default 2000). sqlite: `sqlite3 /srv/data/clued/clued.db "SELECT * FROM debug_logs ORDER BY id DESC LIMIT 50"`.

### What a healthy question looks like (from the local e2e)
```
run      question      {"i":1,"q":"title:hits-1980s/...","format":"listen",...}
listen   destroy       {"r":1,...,"why":"runner"}               ← previous question torn down
clip     stopHandle    {"id":1,"why":"listen-destroy"}
listen   render        {"r":2,...,"st":"running","ac":"ac1-x","m":"<ctx instance>","n":1,"len":3,...}
listen   builds        {"build":...,"byV":{...},"mixed":undefined}
busy     begin         {"tag":"listen:...","n":1,"total":1}
listen   prepare → clip load → clip fetch → fetch.ok {bytes,ms} → decode.ok {dur,ms} → slice → listen prepare.ok
listen   autoplay → listen start {"why":"autoplay"} → clip play {"id":2,...} → clip start {"dur":3,"ac":...,"master":0.8}
listen   start.playing → status "Listening…" → (3 s) clip ended {"played":3.05} → busy end → listen clipDone → status "Pick your answer"
listen   answer → clip stop {"why":"listen-answer","by":"at finish (listen.js:…)"}
```
Every listen/clip/ctx line carries `st` (AudioContext state), `t` (its currentTime), `ac` (which AudioContext), `m`
(which ctx.js module instance) and `n` (AudioContexts created in the page). Things to look for in the failing case:
- `start.exit {"reason":"ctx-not-running"}` + `playButton {"why":"ctx-not-running"}` → the context was suspended and the
  autoplay couldn't resume it (look at `ctx statechange`, `unlock`/`unlock.fail`, `resume.fail`, `act` = user activation).
- `clip start` present but `t` not advancing between lines / no `ended` → a stalled context.
- `clip ended {"played": ~0}` or `stop` right after `start` with a `by` you don't expect → something stopped it.
- `ac`/`m` changing between questions, `n > 1`, `module loaded.again`, `listen builds` with `mixed`/`notBuild` → a second
  copy of ctx.js (a page open across a deploy, DEADTAP.md) made a second, never-unlocked AudioContext.
- `busy` totals that never return to 0, `end.unmatched`, `bgm unpause.unmatched` → leaked busy counters.
- `decode.fail` / `fetch.bad` / `apple preview.none` → loading, not playback.

## What is logged
| tag | where | events |
|---|---|---|
| `page` | debuglog.js | boot (url, size, dpr, memory, cores), builds (module scripts + js/css `?v=` histogram, `mixed`, `notBuild`, module instance counts), visibility, pagehide (+ beacon), pageshow, focus, blur |
| `nav` | debuglog.js | screen changes (MutationObserver on `body[data-screen]`, set by app.js) |
| `console` / `window` | debuglog.js | every console.warn/error, window error, unhandledrejection |
| `module` | each audio module | `loaded` / `loaded.again` (warn) with instance id + URL incl. `?v=` (ctx, clip, listen, piano, apple, bgm; bgm loads on the first tap) |
| `ctx` | ctx.js + debuglog.js | AudioContext.new (id, count, creating stack; warn if > 1), create, statechange, unlock / unlock.ok / unlock.fail (with user activation), resume (visibility return), keepAlive (iOS) |
| `busy` | ctx.js | begin/end with per-tag and total counts, end.unmatched (warn), duck.begin/end |
| `media` | ctx.js | every HTMLMediaElement.play() (tag, src) |
| `clip` | clip.js | load / load.cached / load.retry / load.fail, fetch / fetch.ok (status, bytes, type, ms) / fetch.bad / fetch.fail, decode.ok / decode.fail, slice, play (id), resume.ok/fail, play.superseded, replace (old handle), start (scheduled time, duration, gains), ended (seconds played), stop (why + caller), stopHandle, stopAll, stream |
| `listen` | listen.js | render (r = render number, q, len, start, kind, track, mode), builds, prepare / prepare.ok / prepare.fail, autoplay, start (why) + start.exit (every early return: dead, ctx-not-running, dead-after-unlock, dead-after-play, superseded) / start.unlock / start.playing / start.fail, status (every text change), playButton (why shown), clipDone, tap.play / tap.again, answer, timeout, destroy (why: runner or detached), detached, preload / preload.ok / preload.fail (rooms), prepareAll |
| `apple` | apple.js | json (lookup/search, ms), json.bad/fail, jsonp, head, preview.refresh, preview.none, search, refresh |
| `bgm` | bgm.js | play, stop, start, halt (reasons), resume, pause/unpause with counts (+ unpause.unmatched), duck/unduck |
| `run` | runner.js | create (run id, n, mode, formats), question (i, q, limit, timer, vis), destroyPrev, destroy.fail, render.fail, answer, timeout, deadline, timeUp, finish |
| `applenet` / `probe` | applenet.js / probe.js | Apple direct-vs-proxy decisions and the per-round Apple connectivity probe, see APPLEPROXY.md |
| `debug` | debuglog.js | on (why, history length), off, beacon |

Every batch carries device id (random, `localStorage clued.dbg.dev`), session id (per page load), BUILD, user agent and
room (from `?join=`/`?p2p=`).

## Server (`server/debuglog.go`)
- Setting `debugLogs` in `settings` ('1'/'0', absent = off), cached 5 s. Changes are recorded as admin events.
- `POST /api/debuglog` body `{ device, session, build, ua, room, lines: [{ t, p, lvl, tag, msg, data }] }` (any
  content type; the client sends `text/plain` so cross-origin posts from the Pages copy need no preflight). Flag off →
  **204, body not read, nothing stored**. On: per-IP limit 120/min (`limits.go` "debuglog"), ≤ 64 KB (413), ≤ 400
  lines (extra dropped), fields truncated (tag 64, msg 500, data 4000, ua 300) → `200 {stored}`. Not written to the
  journal request log.
- Table `debug_logs(id, ts server ms, cts client ms, perf, device, session, build, ua, room, level, tag, msg, data)`,
  indexes on ts and (device, id). After every insert and in the hourly sweep: keep the newest 50 000 rows, drop rows
  older than 7 days.
- `GET/POST /api/admin/debuglog` (admin token), `/api/admin/overview` gains `debug: { on, rows, devices, last, cap, days }`,
  CLI `clued debuglog on|off|status|clear|dump`.

## Client (`js/core/debuglog.js`)
`dlog(tag, msg, data, lvl)` snapshots `data` as JSON at call time (≤ 2 KB, errors serialised) into a 200-line ring. Off:
nothing else happens (no timers, no network beyond the throttled status check). On: the ring is queued first (so the
lines from before the flag was seen, e.g. boot, are included), a 3 s interval posts batches (≤ 300 lines / 56 KB, fetch
`keepalive`, `credentials: 'omit'`), failed posts retry on the next tick (queue capped at 3000), `pagehide` sends the
queue with `sendBeacon`. Exports `dlog`, `debugOn`, `debugCheck`, `modLoaded`, `buildsSeen`, `createDebugLog` (factory
for tests); one instance per page on `globalThis.__cluedDbg` even if the module is evaluated twice. Node-safe (no DOM
imports), so the audio modules still load in `au_test`. Uses the same API base as js/net/api.js (local `?api=` override,
cross-origin to games.br8t.com from Pages/localhost); a `?test`/`?soak` page without `?api=` skips the boot status check.

## Edits in other lanes' files (DEADTAP was working in app.js / main.js / popup / update.js at the same time)
- `js/main.js`: **one line** after the BUILD import: `import './core/debuglog.js?v=…';` (loads it before everything else).
- `js/ui/app.js`, `popup.js`, `update.js`: **not touched** (navigation is observed through `body[data-screen]`).
- `js/structures/runner.js` (A): import + `debugCheck()` at `createRunner`, `R(...)` log calls at create, ask, render
  failure, timeout, record, finish, setDeadline, timeUp. No behaviour change.
- `js/audio/*.js` (AU): log calls only. Small signature extensions, all backwards compatible: handle `stop(f, why)`,
  `stopHandle(h, f, why)`, `stopAll(why)`, listen's ctrl `destroy(why)`, internal `start(isReplay, why)`; `ctx.js`
  exports `ctxInfo()`; clip handles carry `id`. `duckEnd` still always emits.
- `js/net/admin.js` + `admin.html`: the Debug logs panel and its CSS.

## Tests
- Go `server/debuglog_test.go`: gating (off → 204 + nothing stored, even for a broken body; on → stored with all
  fields; off again → stops), 64 KB → 413, 400-line cap + field truncation, per-IP rate limit, 50k cap (oldest first)
  and 7-day prune (on insert and in `sweepDB`), admin auth / on / off / clear / filters / overview, a setting written
  by another process is picked up, `parseSince`. Falsified: removing the flag check fails `TestDebugLogGating`,
  removing the cap delete fails `TestDebugLogCapAndPrune`. `server/test.sh` ALL PASS.
- Node `tools/dbg_test.mjs` (36): ring keeps 200, nothing queued/posted/timed while off, switching on sends history
  first then live lines on the 3 s timer with the envelope, data snapshot, big/circular/error data, ≤ 300 lines /
  56 KB batches with nothing lost, retry after a network error, 204 switches off + clears timers, minute re-check
  switches off, unforced checks throttled to once a minute, beacon, `?debug` force.
- E2E `tools/dbg_e2e.mjs` (29/0; CDP 9510 with `--autoplay-policy=no-user-gesture-required`, site on :8888, a LOCAL
  server binary with its data dir — see the header): solo 4-question listen round, every clip played to "Pick your
  answer"; rows arrived with session/build/ua/client time; boot line from before the flag was known; 4 × question,
  render, autoplay, clip start + ended, fetch + decode, destroy; busy, nav, ctx lines; each audio module's instance id
  and `?v=` URL, one AudioContext named on every clip start, a build report at boot and per question; each render
  tells render → prepare.ok → autoplay → start.playing → clipDone → answer → destroy; flag off → client switches
  itself off and no rows arrive; flag on again → the next game start switches it back on without a reload.
- Room path (ad-hoc, same local server): a hosted 3-question listen room; rows carry the room code, 3 × run question,
  render, preload/preload.ok, clip start/ended. `s_room_e2e --timing` 22/0 after the changes. `a_test` 467/0,
  `s_unit_test`, `au_test`, `p2p_test` 141/0, `fav_test` 52/0 pass.
- Duplicate-module probe: importing `ctx.js?v=999` in a live page logs `module loaded.again` (warn) with both URLs,
  `buildsSeen().mixed = ["js/audio/ctx.js@202610100431|999"]`, and a second `AudioContext.new` (warn, n=2) tagged with
  the second instance's id.

## State
- **Server deployed 2026-10-10** (`deploy.sh`, healthy). Flag **OFF** on production: `/api/status` →
  `debugLogs:false`, a production `POST /api/debuglog` → 204 with 0 rows stored, `/api/admin/debuglog` → 401 without a
  token, `clued debuglog status` on the box → off · 0 rows.
- **Client not shipped, BUILD not bumped** (manager's call). Until the static files go out (with a BUILD bump), phones
  don't send anything even with the flag on. Older clients ignore the new `debugLogs` field.
