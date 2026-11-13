# Lane O (real online, M3) report

Go is installed locally (go1.26.4). Nothing was committed, pushed, deployed or sent to the box.

## What exists

Host-run online per D11. One player's browser runs the real sim and bots. The others send input and
draw a state rebuilt from snapshots. The Go server does rooms, matchmaking, relay, host election and
migration, late join and leaderboards. Protocol, timings, limits and local run steps are in **docs/NET.md**.

| | |
|---|---|
| `server/` (new) | `main.go` (config, routes, health, CORS), `session.go` (websocket, per-socket rate limits), `hub.go` (rooms, quick match, relay, migration, late join, results), `boards.go` + `db.go` (SQLite boards), `limits.go`, `names.go` (from SKYPUTT), `integration_test.go`, `test.sh`, `deploy.sh`, `throng.service`, `Caddyfile.fragment`, `caddy_route.py`, `README.md` |
| `js/net/` (new) | `proto.js` (binary wire format, pedestrian model, versions), `host.js`, `guest.js` (interpolation, prediction, event synthesis), `netmatch.js` (one online match: host/guest, promote/demote), `online.js` (socket, reconnect, rooms, lifecycle) |
| `js/ui/online.js` (new) | Online sheet (quick match / create room / join by code + name), room lobby (code, copy link, native share, members, host crown, ready, start), Online leaderboard tab |
| `tools/` (new) | `net_test.mjs` + `net_client.mjs` (node: real server + headless protocol clients), `net_cdp.mjs` (two real Chrome tabs) |
| `js/sim/` | `sim.serialize()`, `createSim({ restore })` (exact, or state-only for migration), `sim.setRemote()`, `bots.setEnabled()`, `rng.getState/setState`, exported `leaderSpeed`/`integrateLeader` (same code drives the sim and the guest's prediction; the sim's state hash is unchanged by the refactor: checked against HEAD). New sim_test section + `--break=restore|remote` |
| lane G files | `main.js` (online match flow, director/hints use your crowd index, hidden-host pump + handoff, cosmetics at every `setCrowds`, adaptive quality), `config.js` (`NET` block, `ONLINE_PUBLIC: false`), `ui/menu.js` (ONLINE button beside PLAY), `ui/screens.js` (Online sheet, Ladder/Online tabs, room lobby), `ui/results.js` (online mode: LIVE tags, save note, no rating), `ui/hud.js` (`setName`, network pill), `ui/locker.js`, `meta/shop.js`, `meta/save.js`, `meta/roster.js`, `sim/match.js`, `css/ui.css`, `tools/meta_test.mjs`, `tools/sim_test.mjs` |

The online flow:
- **Menu → ONLINE**: name, QUICK MATCH, CREATE ROOM, JOIN + code. If the server can't be reached, the sheet
  says so in its status line (with Retry), and PLAY still runs the ladder.
- **Quick match** joins the fullest open lobby of the same build, or a running match with more than 45 s left
  (taking over a bot), or opens a lobby. The lobby waits 8 s for more people, then bots fill the rest.
- **Private room**: a code plus a `?room=CODE` share link (Copy link, plus native Share where the browser has it).
  The link opens the Online sheet with the code filled in, the player types a name and joins. Members tap
  Ready and the host presses Start.
- **In the match**, a pill shows ping ms (or `· host`), "Host changed", "Reconnecting…", "Waiting for the host…"
  or "Offline". Pause and a hidden tab put your crowd on autopilot, as the ladder mode does (D13).
- **Results** tag real players LIVE and say whether the match was saved to the Online leaderboard. PLAY AGAIN
  goes back to the room (private) or to a new quick match.
- **Ladder sheet → Online tab**: Today / This week / All time × Best crowd / Wins, with your own row.

## Lane R items 14–19 (the manager's add-on)

- **14:** both `setCrowds` call sites (and the fallback renderer) now pass `{...cosmetics, index, name, color}`.
  - `shop.js` has five new slots (hat 11, leader 4, flag 10, trail 7, ring 4). Prices run from 300 to 3,000 coins.
  - 23 of these items are earned by climbing (a level or a league), and the Locker shows the lock.
  - The Locker has the new tabs with previews.
  - Sim-online bots get a deterministic set from `botCosmetics(key, league)`: more and fancier items in higher
    leagues, and only items that league has unlocked. Practice/attract and online bots use league 2.
  - In real online, the player's equipped set goes with `hello` and a `cos` message before quick/create/join.
    The server keeps only known keys and short clean strings. The host puts it in the match meta, so everyone
    sees it. Verified in Chrome: Bob's tab had Alice's cowboy/mascot/star/confetti/flame set and its renderer
    drew her hat and leader.
  - `meta_test` checks every shop id against the renderer's own id lists (read from `js/render/cosmetics.js`).
    It also checks free defaults, unlock gating both ways, old-save migration, that `setCrowds` gets every
    slot, and bot determinism, unlocks and the league curve. `--break=shop` and `--break=botcos` both go red.
- **15–17** need nothing from G: `crownTop()` is already used, and the camera and building changes are renderer-only.
- **18:** Settings "Auto" now calls `setAdaptive(true)`. A manual pick calls `setAdaptive(false)` then
  `setQuality(q)`. **Not done:** creating the renderer as `lite` on a device that starts slow.
- **19** is R's own (no 3D emote bubble yet).

## Verified (what I ran)

- `node tools/sim_test.mjs`: PASS (32.7 s). The online section covers four things:
  - serialize → restore continues bit-exactly to the end;
  - a state-only restore keeps counts, conserves people to the end, and leaders don't jump;
  - a remote crowd's input survives `bots.update()`;
  - re-enabling the bot takes the crowd back.

  `--break=restore` and `--break=remote` both FAIL as they should.
- `node tools/meta_test.mjs`: PASS.
- `cd server && ./test.sh`: ALL PASS. It covers gofmt, vet, 10 Go test funcs, and a binary smoke test (health,
  CORS, ws upgrade 101, foreign origin 403, data dir 700). The Go tests cover:
  - the version gate (4002), a bad hello (4001), and a version mismatch on join and on quick;
  - create/join/begin, and the relay in both directions (a guest's snapshot is not relayed; inputs carry the
    crowd the server assigned);
  - late join (a taken crowd is ignored);
  - the three migration triggers (abrupt close after the 2 s grace, a graceful close at once, 3 s of silence);
  - the quick lobby timer;
  - confirmed results reaching the boards, and a disputed result dropped;
  - plausibility caps, rate limits, the per-IP cap, names/codes, and cosmetics cleaning.

  Mutation check: removing the promotion replay, the confirmation rule, the silence trigger or the late-join
  assign each turns a test red.
- `node tools/net_test.mjs`: PASS, ~3.5 min. A 120 s match with Alice (host), Bob and Cara joining by code,
  and Lee joining late. It asserts:
  - the late joiner took over bot crowd 3 with its 65 people;
  - an input flood was rate-limited: the host got 58 in that second against a normal 11, and the flooder was told;
  - 60 pings in one go got 20 pongs plus `rate_limited`;
  - after a SIGKILL of the host process, Bob was promoted after 2.07 s and the match moved on;
  - every client reached the end;
  - the final count/best/kills/rank tables were identical on the new host and both guests;
  - 46 sampled ticks matched across clients;
  - pedestrians rebuilt from deltas matched over 45 samples, with 0 slot states wrong and a 0.36 m worst
    position error (budget 0.45);
  - the largest per-crowd change between 250 ms samples was 50;
  - the longest freeze a guest saw was 2.0 s;
  - the result was confirmed and recorded, the daily board showed Bob and Cara, and Lee (late) was not recorded;
  - the weekly wins board answered;
  - two quick-match players shared a room, the timer started them with 6 bots, and a third quick match joined
    the running room as a late joiner;
  - quick match on another sim version got its own room;
  - a fourth socket from one IP was refused.

  Each arm was run on a 60 s match and each FAILS:
  - `--break=counts` (a guest drops every 7th delta): 85 slot states wrong, 15.8 m error;
  - `migrate` (promote is a no-op): no promotion, 56 s freeze;
  - `late` (the host never assigns): the late joiner times out;
  - `bytes` (a keyframe every snapshot): 104 kB/s;
  - `rate` (server limits off): 413 inputs, 60 pongs, a 4th socket opened;
  - `version` (the mismatch clients use the right version): accepted.

  Note: a first version of the counts arm passed because snapshot crowd counts are absolute. I added the
  pedestrian reconstruction check, which is what actually depends on the deltas.
- `node tools/net_cdp.mjs --cdp=9284 --cdp2=9285`: PASS. It ran two headless Chromes with
  `--use-angle=metal`, one per player (separate profiles), each tab in front. All taps were
  `Input.dispatchTouchEvent`. In order:
  - with an unreachable server the sheet says so, and PLAY still works;
  - Alice creates a room and gets code + link;
  - Bob opens the link, gets the sheet with the code filled in, types his name and joins;
  - Bob's Ready shows on Alice's Start button ("1/1 ready");
  - Alice starts; roles are host/guest and both tabs are visible;
  - Bob has Alice's cosmetics and his renderer draws them;
  - Bob's touch drag moves his crowd 9.5 m, and the host sees it 0.06 m from Bob's prediction;
  - 20 sampled ticks have identical counts on both tabs;
  - the ping pill shows;
  - the host tab is closed; Bob is promoted 151 ms later and the match continues;
  - results say "Saved to the Online leaderboard", and the Online tab lists Bob;
  - zero console/page errors on both tabs (tab A's only errors are the deliberate unreachable-server probe).

  `--break=sync` (Bob's copy of one count off by one in every 3rd snapshot) FAILS: 1 of 25 sampled ticks differ.
  One earlier run timed out waiting 5 s for the board rows, after a "Saved" result. I could not reproduce it;
  the wait is now 10 s.
- **Screenshots**, looked at, in
  `/private/tmp/claude-501/-Users-aaronair-cc/1267ff84-dfa8-49a0-ac94-34a4b789de19/scratchpad/oshots/`:
  - Online sheet in p/l/d, the unavailable state, the join sheet;
  - the room lobby as host in p/l/d plus ready, and as guest;
  - match host (p), match guest (l), host changed (l), guest seeing the host's cosmetics;
  - results in p/l/d, the Online board in p/l/d;
  - locker hats (d), flags (p), rings (l).

  Fixed after looking: the lobby list re-animated every 250 ms (rows looked faded), and online results showed a
  league badge on your row.
- A boot check of practice and ladder matches with cosmetics equipped (`hats 2, heroes 3`), plus bots by
  league and an Auto → Medium → Auto quality round trip: zero errors.
- Every process I started is stopped: Chromes on 9284/9285/9286, the static servers, Go servers and child
  clients. **One caveat:** I once ran `~/.claude/bin/cdp stop all` while restarting my Chromes. If another
  lane had a headless Chrome open at that moment, it was killed.

## Measured numbers

| | |
|---|---|
| guest download | 7.5 kB/s (Cara), 7.9 kB/s (Lee, late joiner). Target < 15 |
| guest upload | 0.02–0.03 kB/s (5-byte inputs, ≤ ~22/s) |
| snapshot | 15 Hz, avg 520 B, ~18.5 pedestrian slots per delta; keyframe ~7.5 KB every 8 s |
| input → acknowledged in a snapshot | median 52 ms, p95 60 ms (localhost; add ~RTT on a real network) |
| own-leader prediction | 126 corrections in a 2-minute match with random steering every 1–3 s, worst 1.8 m before smoothing (wall slides) |
| host killed (no close frame) | guests frozen 2.0 s, then the next guest hosts; a graceful close hands over in ~150 ms |
| pedestrian reconstruction | 0 wrong slot states, ≤ 0.36 m position error vs the host |

## Deploy steps for the manager

1. Commit `server/`, `js/net/`, `js/ui/online.js`, the changed lane-G files, `tools/net_*.mjs`, `docs/NET.md`
   and these notes. Explicit paths only (other lanes are dirty in the tree).
2. Deploy the server: `cd gms/3d/throng/server && CONFIRM=yes RUN_TESTS=1 ./deploy.sh`. It:
   - checks loopback **8024** is free or already `throng` (8005 filestore, 8012 clued, 8016 payments,
     8019 gambit, 8023 skyputt);
   - rsyncs the source and builds on the box (1 CPU, nice), with `GOFLAGS=-mod=mod` so the box downloads
     `coder/websocket` 1.8.15 and `modernc.org/sqlite` 1.34.4 as SKYPUTT did;
   - runs `test.sh` there;
   - installs `throng.service` (`/srv/apps/throng`, data in `/srv/data/throng` with mode 700, MemoryMax 96M,
     GOMEMLIMIT 40MiB);
   - health-checks, rolling back on failure;
   - adds the Caddy route `handle /gms/3d/throng/api/*` with `caddy_route.py` (idempotent, validates, keeps a
     backup) and reloads Caddy;
   - checks public health, CORS for y-r-u.github.io and yru.br8t.com, and the websocket upgrade (101).
3. Check `https://games.br8t.com/gms/3d/throng/api/health` → `{"ok":true,…,"protocol":1}`.
4. Make the button public:
   - set `CONFIG.NET.ONLINE_PUBLIC = true` in `js/config.js`;
   - commit and push Pages;
   - deploy the static game (`STATIC=1` on deploy.sh, or the usual rsync of `git archive HEAD gms/3d/throng`
     minus docs/tools/server).

   Before step 4, the server can be tried from production with `?online=1`.
5. Real-device check:
   - phone + desktop: create a room, share the link, join, play;
   - close the host's tab mid-match; the other should carry on;
   - quick match from two devices.
6. Allowed origins default to `https://games.br8t.com,https://y-r-u.github.io,https://yru.br8t.com`. Override in
   `/srv/data/throng/throng.env` (`THRONG_ORIGINS=…`). `./throng pause on` (with `THRONG_DATA` set) stops new rooms.

## Known gaps

- Others do not see a late joiner's cosmetics until the next match. Re-calling `renderer.setCrowds` mid-match
  would snap their camera. The joiner sees its own look.
- A hidden guest gets autopilot only after its inputs go stale (2.5 s).
- The interpolation buffer is a fixed 120 ms. It is not adaptive to jitter, so Australia → US (~200 ms RTT,
  jittery mobile) may want 150–200 ms. Try on a real device.
- The server is memory-only for rooms: a restart ends every match. Guests then finish offline after ~25 s of
  retries, and the match is not recorded.
- Emotes are not relayed online. Online matches do not touch coins, XP, the rating or the daily challenge (deliberate).
- Bots in online rooms have believable names. Humans are marked LIVE on the results screen and listed in the
  lobby ("+N bots fill the city"), but not in the in-match leaderboard.
- Two tabs on one device get separate seats but count as one device for confirmation and the boards.
- A guest that reloads mid-match rejoins as a fresh guest (begin + keyframe + tail). This works but is not
  covered by an automated test. A reconnect of the host within 2 s is covered only in the Go test path (rejoin
  logic), not end to end.
- `net_test.mjs` takes ~3.5 min and `net_cdp.mjs` ~3 min, because matches run in real time.

## Abuse risks

- **The host decides everything (D11).** A modified client can report any table. The guards:
  - a second device must confirm the human rows;
  - the plausibility caps: duration 90–180 s, real elapsed time ≥ the match length − 8 s, best ≤ 6,000,
    kills ≤ 60, distinct ranks;
  - at most 300 rows per device per day.

  A cheater with two modified clients, or alone in a room, can still post a capped fake best crowd or win.
- **Device ids are self-made**, so one person can appear as many players. Each fake still has to play 2 real
  minutes per row, through per-IP limits (120 quick matches per 10 min, 8 sockets, 60 opens/min).
- Names are cleaned (profanity, look-alikes, invisible characters, staff words) but are not unique.
- Private codes are 6 of 31 characters, and joins are limited to 120 per IP per 10 min, so codes cannot be
  enumerated.
- The server never parses a snapshot. A host can send garbage (≤ 24 KB, 40/s) to the guests in its own room;
  guests decode defensively.
