# THRONG online (M3) — protocol and how to run it

Host-run (DECISIONS D11). One player's browser — the **host** — runs the real sim and the bots
(`js/sim/**`, unchanged rules). Everyone else is a **guest**: sends steering input, receives snapshots,
and rebuilds a contract-shaped `state` (CONTRACT.md) for the renderer and HUD. The Go server
(`server/`) never simulates: it does rooms, matchmaking, relaying, host election/migration and the
leaderboards.

```
 guest ──input (5 B, ≤ 20/s)──► server ──[crowd]+input──► host (sim + bots)
 guest ◄──snapshot / keyframe── server ◄──snapshot 15 Hz── host
```

## Files

| | |
|---|---|
| `js/net/proto.js` | wire format: snapshot/keyframe encoder (host) + decoder, the shared pedestrian model, input frames, `simVersion()`, `mapVersion()` |
| `js/net/host.js` | host role: remote inputs → `sim.setInput`, autopilot for silent guests, snapshot cadence |
| `js/net/guest.js` | guest role: snapshot queue, 120 ms interpolation buffer, own-leader prediction + reconciliation, event synthesis, `restoreState()` for promotion |
| `js/net/netmatch.js` | one online match on a client (host or guest), promote / demote, late-joiner crowd pick, `buildMeta()` |
| `js/net/online.js` | websocket client (reconnect + backoff), request/reply, room state, match lifecycle, server URL rules |
| `js/ui/online.js` | Online sheet, room lobby, Online leaderboard tab |
| `server/*.go` | rooms, quick match, relay, migration, limits, SQLite boards |
| `tools/net_test.mjs`, `tools/net_client.mjs` | node harness: real server + headless protocol clients (real js/net code) |
| `tools/net_cdp.mjs` | two real Chrome tabs through a whole match |

Sim additions used by online (`js/sim/`, tested in `tools/sim_test.mjs`): `sim.serialize()` and
`createSim({ restore })` (exact continuation from a serialize, or a state-only restore that regenerates
wander targets, steal progress and the RNG — host migration), `sim.setRemote(i, on, name)` (crowd is
steered from the network), `bots.setEnabled(i, on)` (a remote crowd's bot is off; on again = autopilot),
`leaderSpeed()` / `integrateLeader()` exported so the guest's prediction runs the exact same movement code.

## Versioning

- `PROTO` (`js/net/proto.js`) = server `protocolVersion`. A hello outside `[minProtocol, protocolVersion]`
  gets `error old_client` and close **4002**; the client shows "THRONG was updated. Reload".
- Every hello carries `sim` = hash of `CONFIG.SIM` + `CONFIG.MATCH` + `SIM_REV`, and `map` = hash of the
  generated map's size/obstacles/spawns/plazas. The room key is `sim.map`: quick match only pairs equal
  keys; joining a code from another build fails with `version_mismatch`. Any balance change or map change
  therefore splits the player pool automatically. Bump `SIM_REV` when sim behaviour changes without a
  config change.

## Messages

JSON text frames for control, binary frames for the game stream. A message with `id` gets exactly one
`{t:'ok', id, …}` or `{t:'error', id, code, error}`.

### Client → server (JSON)

| t | fields | |
|---|---|---|
| `hello` | `v, sim, map, dev, cid, name` | first, within 10 s. `dev` = 32 hex device id (localStorage `throng.dev`, leaderboards), `cid` = per-tab id (sessionStorage `throng.cid`, room membership and reconnect) |
| `ping` | `c` | → `pong {c, now}` (RTT for the HUD pill) |
| `quick` | | join the fullest open quick lobby of your build, else a running quick match with > 45 s left (takes over a bot), else a new quick room → `ok {room}` |
| `create` | | private room → `ok {room}` (you host) |
| `join` | `code` | private room by code (any case). Lobby: you're in. Playing with > 45 s left: late join. Playing, less left: you wait in the room for the next round |
| `leave` / `ready {on}` / `rename {name}` | | |
| `mode` | `mode` | private-room host, lobby only: the mode pick everyone sees (`room.mode`). Only sent when `welcome.feat` has `mode` (wave 5) |
| `start` | | private host, lobby → server sends `go` |
| `begin` | `meta` | host only, after `go`: `{v, seed, duration, countdown, players:[{id, name, color, human, persona, skill, …}×8]}`; humans carry their member `id` |
| `meta` | `meta` | host: player list changed (a late joiner took a crowd) |
| `assign` | `who, crowd` | host's answer to `want` |
| `handoff` | | host's tab was hidden: please move the match to someone else |
| `result` | `mid, rows:[{crowd, count, best, kills, rank}]` | everyone, at phase `over` |

### Server → client (JSON)

| t | fields |
|---|---|
| `welcome` | `you {id, pid, name}`, `now`, `v`, `ver`, `feat` (wave 5: `['mode', 'boards-mode']`; older servers send none) |
| `room` | `room {code, quick, state lobby\|playing, host, you, members:[{id, pid, name, ready, host, crowd, online, late}], startAt, beganAt, endsAt, epoch, mid, now, max, mode?}` (`mode`: the private host's pick, once made; kept across matches and host changes) |
| `go` | to the host: build `meta` and `begin` (quick: when the 8 s lobby wait runs out or 8 humans are in) |
| `begin` | `meta, crowd (yours), epoch, mid, late, beganAt, endsAt, host` — followed by keyframe + tail for late joiners and reconnects |
| `promote` | `epoch, away:[crowds], meta, crowd, mid, why` — you are the host now; sent **after** the cached keyframe + every snapshot since |
| `want` | to the host: `who, name` — a late joiner needs a crowd |
| `away` / `back` | to the host: `crowd` — a human dropped / came back (bot drives meanwhile) |
| `meta` | relayed host update |
| `ended` | `mid, recorded, why` — the result is settled; quick rooms close, private rooms return to their lobby |
| `closed` | `code, reason` |
| `error` | `code, error` (`old_client`, `version_mismatch`, `no_room`, `room_full`, `rate_limited`, `late_failed`, `busy`, `paused`, `not_now`, `bad_request`, `bad_name`) |

### Binary

All integers big-endian. Positions in centimetres (i16, ±327 m; the city is ±120 m).

**Input** guest → server, 5 B: `[3][seq u16][ax i8][az i8]` (axis × 127). Sent when the quantised stick
changes (≥ 45 ms apart) and as a 250 ms heartbeat, so ≤ ~22/s. `seq` is the guest's local 30 Hz tick.
The server forwards `[3][crowd u8][seq][ax][az]` to the host, using the crowd **it** assigned to that
socket (a guest cannot steer someone else's crowd).

**Snapshot** (type 1, delta) / **keyframe** (type 2, full) host → server → guests, every 2 sim ticks (15 Hz),
keyframe every 240 ticks (8 s) and right after a host change:

```
u8 type, u8 epoch, u32 tick, u8 phase(0 countdown,1 play,2 over), u16 timeLeft cs, u16 countdownLeft cs, u16 duration ds,
u8 leader, u8 leadChanges, u8 nCrowds,
  per crowd (33 B): u8 flags(alive|remote), i16 x z vx vz, u16 count best, u8 kills deaths, u16 recruited stolen lost,
     u8 rank, u8 protect respawnIn fx.speed fx.magnet fx.double (1/20 s), u8 eating panic (1/400 s),
     u16 ackSeq, u8 applied, u8 heading
u8 nPickups, per pickup (7 B): u8 id, u8 kind|active<<7, i16 x z, u8 respawnIn (1/10 s)
u16 nSlots, per slot: u16 slot|state<<14, and if state≠0: i16 x z, i8 vx vz (0.1 m/s), u8 heading, i8 target, u8 look
u16 nEvents, per event: u8 type + recruit[crowd u8, slot u16, n u8] | steal[from, to, n u16] | elim[victim, by (255 = none)] |
   respawn[crowd, x i16, z i16, count u16] | pickup[crowd, id, kind] | lead[crowd] | phase[phase]
   | 8 bleed[crowd, n u16] | 9 infect[crowd, by] | 10 zone[] | 11 shrink[stage u8] | 12 emote[crowd, id u8]
[mode block — only when the mode is not Classic, so Classic snapshots are byte-for-byte what M3 sent]
u8 mode (0 classic 1 teams 2 koth 3 lcs 4 infection)
  per crowd (6 B): u8 flags(out | horde<<1), u8 team, u16 score ×10, u16 extra (LCS: outAt ×10; Infection: infections)
  koth: zone (i16 x z, u16 r cm), i8 holder, u8 hasNext [+ next zone], u16 zoneT ×10
  lcs:  circle (i16 x z, u16 r cm), next circle (same), i16 target x z, u16 shrinkIn ×10, u8 stage
  teams: u16 score per side
  u8 endReason (0 time, 1 last crowd, 2 all horde)
```

**Modes online (M4).** The host's `begin` meta carries `mode` and `events` (the live match-wide event ids:
`double`, `rush`, `market`). Everyone builds the sim config from `events` (`eventSim()`), so a guest predicts
with the same speeds and pedestrian cap as the host. Private rooms: the host picks the mode in the room lobby
(`net.roomMode`); guests see "The host picks the mode" and learn it at `begin`. Quick match: the mode comes from a
shared 10-minute UTC rotation (`QUICK_ROTATION` in `js/net/online.js`, Classic every other slot). The server knows
nothing about modes (it relays `meta` as raw JSON). `SIM_REV` is 2 and `simVersion()` hashes `CONFIG.MODES` too, so
builds with different mode rules never share a room; `PROTO` stays 1 (old clients are already kept apart by the
version key, and the server accepts `v` 1).

**Emotes (M4).** A guest's emote rides an input frame: `[3][seq][ax = -128][az = emote id]` (a real stick never
sends -128). The host turns it into an `emote` event (at most one per 1.5 s per crowd) and every client draws it
(over the crowd's pill, or on its leaderboard row when the crowd is off screen). Ids index `EMOTES` in
`js/net/proto.js`. The server forwards input frames without reading them, so no server change.

**Pedestrians (≤ 650 slots) are sent by exception.** Host and guests hold the same model per slot —
quantised position + velocity at tick `t0` — and everyone predicts `x(t) = x0 + v·(t − t0)·dt`. The host
sends a slot only when its state, target or look changes, or when a wandering pedestrian drifts more than
`NEUTRAL_EPS` = 0.35 m from the model. Pulled pedestrians (state 2) are sent once and then moved toward
their crowd on the guest. The host updates its model with the **quantised** values it sent, so both sides
stay bit-identical. A keyframe resets the model for everyone. Measured: ~18 slots and ~520 B per snapshot.

**Events** travel inside the snapshot of the tick they happened on; steals are merged per (from, to) pair.
The guest fills in positions the renderer needs (recruit = the slot's last position, steal = the sim's
contact-point formula on the crowds it shows, elim = the victim's position, pickup = the pickup's spot)
and releases them when its delayed view reaches that tick, so a recruit fires as the figure arrives.

## Timing

- Sim 30 Hz on the host (fixed step, as offline). Snapshots 15 Hz.
- **Guest clock**: `base` tracks the earliest arrival `recvTime − tick·33.3 ms` (falls at once, rises 2 % per
  snapshot, re-bases after a > 400 ms stall or a new epoch). The view shows tick
  `(now − base − 120 ms) / 33.3 ms`: other crowds interpolate between the two snapshots around it,
  pedestrians are the model at that tick (corrections eased out over ~0.2 s).
- **Own leader**: predicted every local tick with the sim's own `integrateLeader()` + collider. Each snapshot
  carries, for your crowd, the last input `seq` the host applied and how many host steps it applied it for;
  the guest resets to the host's position and replays its recorded inputs from `seq + applied`. The visual
  error is folded into an offset that decays at 10/s (snaps if > 4 m: respawn). Prediction holds still if no
  snapshot arrived for 300 ms (no running off during a host change).
- Ping: JSON `ping` every 2 s → RTT shown in the HUD pill.

## Host election and migration

- The host is the room creator (private) or the first member (quick). Lobby: if the host goes, the
  longest-standing connected member takes over.
- Mid-match the server keeps the latest **keyframe + every snapshot since** (`maxTail` 600). The new host is
  the longest-standing connected member that has the match state (got a keyframe) and a crowd. It receives
  the keyframe + tail, then `promote`. Its guest mirror flushes everything it has received and becomes a
  `createSim({ restore })`; bots are rebuilt for every crowd (off for humans), the old host's crowd and any
  dropped human's crowd get autopilot (`away`), and the first snapshot it sends is a keyframe with the new
  epoch. Guests ignore deltas from an old epoch and re-base their clock on the new keyframe.
- Triggers: host socket closed with 1000/1001 (tab closed, Leave) → at once; closed abnormally → after
  `hostGrace` 2 s (it may reconnect: it is then re-sent the replay + `promote` and carries on); no
  snapshot for `hostSilence` 3 s → migrate; host tab hidden → client sends `handoff`.
- If nobody can take over, the room waits for the host to come back (30 s), then closes.
- A page reload mid-match (guest or host) reconnects by itself: the tab keeps `throng.live` in sessionStorage while a
  match is on, and at boot that reconnects with the same per-tab `cid`, so the server hands the crowd back
  (begin + keyframe + tail; a host is re-promoted). Tested in `net_test` ([reload]) and `net_cdp` (real reload).
- Server gone for good: a guest rebuilds a local sim from its mirror and finishes the match **offline**
  (all other crowds become bots); a host just carries on. Neither is recorded.

## Late join

`join`/`quick` into a running match with > 45 s left and a free bot crowd: the server sends the host
`want`; the host picks the bot crowd nearest the bots' median size (never the leader) and sends `assign`;
the joiner gets `begin {late: true}` + keyframe + tail. The bot keeps steering until the joiner's first
input arrives, so the handover is seamless. Late joiners are not recorded on the boards (part of that
crowd was a bot's work). In Last Crowd Standing a crowd that is out is never offered. Everyone already in the match
gets the joiner's look through `renderer.updateCrowdMeta()` when the `meta` update arrives (no camera snap); a
renderer without it shows the old look until the next match.

## Leaderboards

SQLite (`throng.db`): `results` (one row per player per match, 16 days, for today / this week) and
`alltime` (best crowd, wins, matches). `pid` = sha256("throng-pid:" + device id)[:12] — the device id never
leaves the server. A match is written when the **host's** table is confirmed by another client from a
different device on every human crowd (exact match), or when there is no other human to confirm; a
disputed table waits 10 s and is dropped. Plausibility: duration 90–180 s, the match ran at least
duration + countdown − 8 s of wall time, best ≤ 6,000, count ≤ best, kills ≤ 60, ranks distinct 1–8; at most
300 rows per device per UTC day.

`GET /api/boards?period=day|week|all&kind=best|wins&mode=all|classic|teams|koth|lcs|infection&me=<pid>&limit=1..100` →
`{period, kind, mode, key, rows:[{rank, pid, name, value}], me?:{rank, value}, now}`. Days and ISO weeks are UTC. No `mode`
(clients before wave 5) or `mode=all` = every mode together, as before.

Schema 2 (wave 5): `results.mode` (default `classic`) and `alltime_mode (pid, mode)`; `alltime` stays the all-modes
total and the name lookup. The migration runs at start-up, once (`settings.schema = 2`); rows written before it are
Classic. A result's mode is the host's `begin` meta `mode` (unknown or missing → classic). Plausibility: LCS and
Infection may end early after 40 s of play (one crowd left / all horde); every other mode must run its clock.

## Limits (abuse)

Text ≤ 4 KB, 8 msg/s burst 20 · guest binary: 5 B inputs only, 30/s burst 45 · host binary ≤ 24 KB,
40/s burst 80 · dropped messages answer `rate_limited` at most once a second, > 600 drops a minute closes
the socket (4008) · 8 sockets and 60 opens a minute per IP · 600 sockets · 300 rooms · 20 private rooms per
IP per 10 min, 120 quick matches, 120 code joins (codes are 6 of 31 characters, not enumerable) · names
cleaned (control/format/invisible characters, zalgo, profanity with look-alike folding, staff
impersonation; 14 characters) · `./throng pause on` stops new rooms.

## Bandwidth (measured, `tools/net_test.mjs`, 120 s match, 3–4 humans)

| | |
|---|---|
| guest download | **7.5–7.9 kB/s** (target < 15) |
| guest upload | ~0.03 kB/s |
| host upload | one stream, same as a guest's download (~8 kB/s) |
| snapshot | ~520 B average, keyframe ~7.5 KB |
| input → acknowledged in a snapshot | median 54 ms, p95 72 ms on localhost (= snapshot cadence + host frame) |

## Running it locally

```
cd gms/3d/throng/server
THRONG_ADDR=127.0.0.1:8024 THRONG_DATA=/tmp/throng-data THRONG_ORIGINS=http://127.0.0.1:8760 go run .
# another terminal, from the site root (/Users/aaronair/cc/yru/site):
python3 -m http.server 8760 --bind 127.0.0.1
open 'http://127.0.0.1:8760/gms/3d/throng/index.html'          # localhost → ws://127.0.0.1:8024 automatically
open 'http://127.0.0.1:8760/gms/3d/throng/index.html?net=127.0.0.1:18090'   # any other server
```

The game picks its server: `?net=host:port` (or a full `ws://…` URL) wins; on `localhost`, `127.0.0.1` or
`192.168.*` it uses `ws://<same host>:8024/gms/3d/throng/api/ws`; anywhere else
`wss://games.br8t.com/gms/3d/throng/api/ws`. The Online button shows when `CONFIG.NET.ONLINE_PUBLIC` is
true, on localhost, or with `?online=1`, `?net=` or `?room=`. `THRONG_QUICK_WAIT_MS` shortens the quick
lobby wait for testing. Open a second **private window** (or another browser) for a second player: two
tabs of one profile share the device id (they still get separate seats, but count as one device for
confirmation and boards).

Tests:

```
cd server && go test ./...              # rooms, relay, late join, three migration triggers, quick timer, results + boards, limits, names
node tools/net_test.mjs                 # ~3 min: real server + 4 headless clients through a 120 s match (+ quick-match and cap checks)
node tools/net_test.mjs --break=counts|migrate|late|bytes|rate|version|emote|lobbymode|reload   # each must FAIL (mode: with --mode=koth)
node tools/net_test.mjs --mode=teams|koth|lcs|infection
~/.claude/bin/cdp start --port 9284 -- --use-angle=metal
node tools/net_cdp.mjs --cdp=9284       # two Chrome tabs: create → join → play → guest reload → host hidden 30 s → host closes → results (~3.5 min)
node tools/net_cdp.mjs --cdp=9284 --break=sync|rejoin|hidden   # each must FAIL
```
