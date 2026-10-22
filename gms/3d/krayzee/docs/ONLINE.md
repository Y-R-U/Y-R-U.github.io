# Krayzee online rooms: architecture (lane ONLINE, 2026-10-21)

Status (2026-10-22, lane NET): **O1–O5 done, local only** (LAN mode deferred, D5). Nothing is deployed. `js/main.js`
carries the §15 wiring (O4 and O5 needed none; `tools/net/gen-main.mjs` skips patches already applied, by marker). O4 = §17,
O5 = §18.
`server/` is the real `krayzeenet` (snakenet fork + RAGDOJO ID tokens + the Krayzee rules); `js/net/` is the browser
client (links, clock, plane stream, lobby, `session.js` = the net game, `podium.js`). Tests: `go test ./...` (13 tests),
`server/test.mjs` (39 protocol checks over real sockets, incl. a server restart), `tools/net/test-interp.mjs` (10),
`tools/net/test-mp.mjs` (sandbox: two Chrome windows, direct + relay + falsification, 23 checks each; game: two real game
pages, 35 checks + a falsification run; O5: 29 checks incl. podium layout at 4 sizes + a falsification), `tools/net/test-mp4.mjs`
(O4: four real game pages, 27 checks + a falsification run that breaks five mechanisms). How to run: §16. GAMEPLAY wiring:
§15. O4 details: §17. O5: §18.

Prior art this copies:
- `gms/pwa/snake/MULTIPLAYER.md`: browser-hosted rooms, WebRTC full mesh, relay fallback, reconnect grace, host handoff
  and server-restart rebuild. The Go server is `snakenet`, port 8013.
- `gms/2d/ragdojo/docs/ONLINE.md`: the same model for a fighting game, plus host migration, Firebase ID-token checks and
  abuse rules. Its server is the arena, port 8017.
- `gms/2d/clued/server`: deploy shape (`deploy.sh` builds on the box with a health check and rollback,
  `caddy_route.py`, a hardened systemd unit, and secrets kept in `/srv/data/<app>/<app>.env`). Clued's rooms are
  HTTP+SSE because trivia is turn-based. That model does not fit flight.
- `/games/CLAUDE.md`: the shared Firebase account layer. One origin is one login, so the game is served at
  `games.br8t.com/gms/3d/krayzee/`.

---

## 1. Decision: browser-hosted rooms with a small Go room server

**The host's browser runs the shared world: ATC, AI traffic, scoring, the radio and the Court. Each player's browser
flies its own plane. The Go server (`krayzeenet`) only introduces players, keeps the list of who is in each room,
hands out voice claims and callsign numbers, enforces the room options, and relays traffic for pairs that cannot
connect directly.** Game traffic goes browser to browser over WebRTC.

Why not a Go server that runs the game itself:

1. **There is one simulation, and it is JavaScript.** Flight model, autopilot, ATC sequencing and infraction detection
   live in `js/flight`, `js/atc` and `data/rules.js`. A Go server that ran the game would need all of that written a
   second time, and the two copies would drift. Running node on the box per room is possible, but it puts real CPU
   load on a small shared VPS (Clued is capped at `MemoryMax=128M`) to buy almost nothing (point 2).
2. **Authority over your own plane has to be local anyway.** A plane you steer through a server 180 ms away (the box is
   in the US and Aaron's family is in Australia) feels like steering through treacle. Snake found the same thing and
   wrote it into its fairness rules. Once each player owns their plane, what is left to share (ATC clearances, AI
   traffic, points) tolerates 100–300 ms easily. The tower already waits 0.6–1.2 s before it scolds you (DESIGN §5.5).
3. **The pattern is proven twice on this box.** Snake and RAGDOJO already handle the hard parts: the WebRTC mesh,
   Safari's SCTP size limit, TURN under a spending cap, reconnects and host handoff. Krayzee forks that code; it does not
   invent new code.
4. **Cheating is accepted, as in Snake and RAGDOJO (Aaron's call).** Online PP only feeds your own career and a
   room-local Court, so a cheater mostly cheats themselves. The host still runs plausibility caps (§8).

What this costs: the host's phone does more work. ATC and about 20 AI planes on autopilot are cheap; uploading to 7
followers is about 25 KB/s. Host migration is mandatory, so **ATC state must be serialisable** (§10, a requirement on
the ATC lane).

> Note for DESIGN: §3.3 says "Host-authoritative ATC sim on the server". Please read that as **"in the host's
> browser"**, with the Go server holding only membership, claims and the relay.

## 2. Who owns what

| thing | owner | sent as |
|---|---|---|
| your plane: flight model, ground and world collisions, rubber bounce, hull % | **your browser** | `S` state, 15 Hz, unreliable, peer to peer to everyone |
| player vs player contact | **each victim's browser**, against what it sees (Snake rule 1) | `hit` event → host |
| your own rule-breaks (cut-in, queue-jump, uncleared takeoff, buzz…) | **your browser**, checked against its copy of ATC state | `inf` event → host, which checks it is plausible |
| ATC sequences and clearances, per-player outrage, tower lines | **host** | `atc` 5 Hz reliable delta, plus a 1 Hz keyframe |
| AI traffic | **host** (it flies the AI on autopilot) | `T` snapshot, 10 Hz, unreliable |
| radio timeline: who speaks when, which clip | **host** (the single "floor controller") | `radio`, reliable |
| room PP ledger, Court ranks, crown changes, session timer | **host** | inside the `atc` keyframe; `crown` event |
| membership, host line, voice claims, callsign numbers, room options, kicks | **Go server** | WebSocket JSON |
| your career and lifetime PP | **your browser**, cloud-saved by `/lib/auth` | no network traffic |

The full mesh (Snake's design) means players' own states reach each other in one hop instead of going through the host.
The host is also always the right peer to take over, because it already has a link to everyone.

## 3. Tick and snapshot rates, interpolation

**Plane state packet**, about 32 bytes:
- position: 3 × f32
- orientation: smallest-three quaternion, 4 bytes
- velocity: 3 × i16 at 0.05 m/s
- angular rate: 3 × i8
- control surfaces and throttle: 4 × i8
- flags (on ground, overriding, gear, crashed, parachute): 1 byte
- flaps and hull %: 1 byte each
- room-time milliseconds: u16, wrapping

| stream | rate | per follower | notes |
|---|---|---|---|
| own plane → every peer | **15 Hz** | 7 × 0.5 KB/s | 30 Hz was considered: planes are inertial, and 15 Hz with Hermite interpolation looks the same |
| AI traffic, host → all | **10 Hz** | 20 planes ≈ 6.5 KB/s | only planes inside 3 km of the receiver get the full rate; farther ones get 2 Hz |
| ATC delta / keyframe | 5 Hz / 1 Hz | < 1 KB/s | reliable, ordered |
| radio, barks, events | on demand | tiny | reliable |

That is about **10 KB/s down and 4 KB/s up for a follower, and about 50 KB/s up for the host**: roughly 35–180 MB an
hour. `?lite=1` and a "data saver" setting halve the AI rate and drop far planes to 1 Hz.

**Room time.** Every peer runs Snake's ping/pong clock to the host and keeps an offset, so all timestamps are in host
milliseconds. Joust touchdowns are judged by these timestamps, not by what anyone's screen showed.

**Drawing other planes.** Other planes are drawn **100 ms in the past** using cubic Hermite interpolation of position
with the sent velocity, and slerp for rotation. The buffer grows with measured jitter, up to 300 ms (Snake does the
same, with 80–400 ms). If the buffer runs dry, the plane is **dead-reckoned forward with its velocity and angular rate
for up to 600 ms**, blending back over 200 ms when packets resume. After 600 ms a faint "signal lost" ghost holds
position. After 2.5 s the host's autopilot flies that plane (§9).

At 120 kt a 100 ms delay is about 6 m of lag. That is fine for rubber bumps and near-misses, and fairness does not depend
on it because each victim judges its own contact. Formation flying between Australia and the US will look loose. That
is accepted.

## 4. ATC and AI traffic on the host

- The host runs the same `js/atc` sim as single player, with every human plane fed in as a "remote" plane whose state
  arrives in `S` packets. AI planes are local to the host.
- Followers keep a **replica** of ATC state: sequences, clearances, outrage and the PP ledger. They use it to
  - show their own clearance,
  - detect their own infractions with no round trip, and
  - be ready to become host.
- Infractions: your browser raises them (`inf {rule, victim, pp, t}`). The host applies the outrage, picks the tower's
  scold and schedules it on the radio. The host may reject an `inf` (§8). Scolds land 0.6–1.2 s later anyway, so the
  round trip is hidden.
- **Authority-only crimes.** A cut-in that forces a spacing go-around, and the go-around itself, only happen inside the
  host's sequencing (a follower's replica issues nothing, and the victim is already gone from its sequence after the next
  snapshot). The host's `session.js` spots them for remote humans (new `cutDone` keys, new `goAround` commands whose
  `cause` is a human), logs them on its ATC, sends the culprit `hinf {rule, victim, severity, data}` and the tower scold.
  The culprit's replica `report()`s it, its own game scores it, and it comes back as an ordinary `inf`, which the host
  accepts without the geometry checks (it saw it itself) but with the rate and PP caps. A crime both sides detect is
  counted once (ATC's per-pair cooldown on the follower, `hostDet` on the host).
- Remote humans are players to ATC: `session.js` wraps `atc.update` so `remote` states with `p:` ids carry
  `isPlayer: true` (player spacing, cut-in memory, taxi release), and turns on `outragePerPlayer`. (ATC lane: the bridge
  could do this itself; then the wrap can go.)
- AI density comes from the room's `traffic` option. AI voices are only voices no human holds (DESIGN §3.3). If a human
  claims a voice an AI is using, the host re-voices that AI from its next transmission.

## 5. Radio over the network

**No audio is ever sent.**
- Barks go as `{voice, intent, variant, target}`, exactly as DESIGN §5.3 sets out.
- Tower lines go as `{tower, line, callsign:[titleWord, d1, d2], rwy}`. Every client already has the clips cached.

**Floor control.** The radio is one frequency, so the host orders transmissions. A player's bark is sent to the host
and also **played at once on their own device**, so it feels immediate. The host stamps it into the timeline, and
others play it at that time. If two people talk at once, the later one is queued, up to 1.5 s, then dropped. The host
gives the tower priority.

**Response windows.** These are opened by the host for the target, at most one inbound window per 8 s per player
(DESIGN).

**Clip loading.** Clips are fetched only for voices in use. A voice claim (§6) triggers a preload on every peer.

## 6. Voices: first to pick gets it

The Go server owns voice claims, in its single hub goroutine, so **a claim is atomic**. Two players tapping the same
card in the same millisecond produce exactly one winner. The loser is told who holds it (`claim {ok:false, by}`).
Prototype checks: "simultaneous claim", "loser is told who holds it".

- On join, the client sends its **starred favourites**: up to 3 in the profile, with the saved voice first (DESIGN
  §3.3). The server gives the first free one, otherwise the first free voice in roster order. There are 15 voices and
  at most 8 players, so there is always one free.
- In the lobby, a taken voice card shows the holder's name, greyed. You can claim any free card. Your profile's saved
  voice is never overwritten by what the room gave you.
- **Late joiners** see the same greyed cards and get their first free favourite automatically.
- During a session, a voice can be changed only while landed or parked. That stops a mid-air voice swap that would
  confuse the radio.
- A dropped player **keeps their voice during the reconnect grace** (10 s). It is freed when they leave or the grace
  runs out (prototype checks).
- Room option `voices: duplicates_allowed` turns claims off (DESIGN host option).
- The server also assigns each member a **callsign number from 11 to 99, unique in the room, never ending in 0**, for
  the tower's "Baroness Four-Two" splice. Doing it there makes it atomic too.

## 7. Points and the Court

Ranks follow DESIGN §1.6 exactly. **The host computes them; nobody else does.**

- **Room PP** = PP banked this session. Pending PP does not count until banked, so a crash still costs you. The host
  keeps the ledger from accepted `inf` events and `bank` events.
- Players are sorted by room PP. Ties go to whoever reached the total first, by host room time.
  - 1st holds the **Crown**: King or Queen; **Emperor or Empress** only if that player has already earned Emperor in
    their career (DECISIONS D4, no points-ratio rule). Then 2nd is King/Queen and everyone steps down a rung per place.
    The server passes each member's `emp` flag (on trust) so the host can apply this.
  - Otherwise 2nd is Crown Prince or Princess, 3rd is Prince or Princess, and so on down one rung per place: Archduke,
    Duke, Marquess, Earl, Viscount, Baron. 11th and below are all Baron.
  - Anyone on 0 PP is Baron.
  - AI never holds Court rank.
- The ledger and ranks go out in every `atc` keyframe. When the Crown changes hands, the host emits `crown {id}`. Every
  client plays the fanfare and the tower's `crown_change` line, and the new monarch gets a response window.
- When a session ends, the host sends `end {court}` and every client shows the podium.
- Room types with a target (Coronation, first to 5 000) or rounds (Joust) are judged by the host on room time.
- Your banked online PP goes into **your own career save** as you bank it ("Online all count", DESIGN §1.5).
- **Public room list.** The host sends the server a tiny `meta {crown: name, left: seconds}` every 10 s, so the list can
  show "♛ Baroness Dirk, 4:12 left".

## 8. Anti-grief basics

- **No free-text chat. Barks only.** This removes most abuse in one decision.
- Names are typed but limited to 14 characters (the livery limit), with Clued's profanity filter (`server/names.go`
  there). Room names allow 24 characters. Nothing from the network reaches `innerHTML`.
- **Kick.** In a private room the creator can kick, and that uid is barred from the room for its lifetime. In a public
  room the host is just first in line, so kicking needs a **vote: a majority of the other humans**.
- **Bark spam.** At most 1 bark per 3 s per player at the host, and the host's 8 s response-window limit. Each listener
  can mute any player locally.
- **Ramming in Realistic.** The protected spawn lasts 5 s, and stands are no-collision zones. Hitting the same player 3
  times in 60 s while overriding is a Royal Scandal (DESIGN), with PP forfeited. Blame for a `hit` goes to whoever was
  overriding; if neither was, nobody is blamed.
- **Host plausibility caps.** The host drops an `inf` for a rule needing state the reporter could not have been in, for
  example a cut-in when the reporter is not in the arrival sequence. It caps PP to the rule's per-minute ceiling from
  `data/rules.js`. A `bank` without a landing in the ledger is ignored.
- **Inactive players.** An idle player is simply flown by autopilot, which is the game's normal state. In a public
  room, a player with no input for 5 minutes is removed.
- **Server-side limits** come from Snake and RAGDOJO: a relay budget per client, 32 KB messages, sockets per IP (IPv6
  counted per /64), and a room cap. Identity rate limits (§11) key on uid.

## 9. Room lifecycle, reconnects, mobile realities

**Lifecycle**

```
create (options) ──► LOBBY (claim voices, see options, host taps Start or Quick countdown when n ≥ 2)
     ▲                 │
     │                 ▼
  rematch ◄── PODIUM ◄── IN FLIGHT (session timer / target / rounds, per room type)
```

- **Create.** The client sends `create {name, priv, set}` and gets a 6-character code (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`,
  with no 0/O/1/I/L). The share link is `…/krayzee/?room=CODE`.
- **Join.** By code (case-insensitive), from the public list, or with **Quick join**. Quick join picks the busiest public
  room in your region that has space, otherwise it creates a public Court Session.
- **Joining mid-session** is allowed, except in Joust. You spawn at a free stand as a Baron on 0 room PP.
- **Public list.** It shows name, type, players/max, protection, traffic and the meta line. Private rooms are never
  listed and codes never appear in the list (prototype checks). The list is sorted by your region first (Snake's
  timezone regions), then by the busiest room.
- **End of a room.** A room dies when its last member leaves or their grace runs out.
- **Options.** Only the host can change them (prototype check), in the lobby or between sessions. The host's game
  applies the room type's fixed values. The server only checks shape and range.

**Reconnects** (Snake's design, already proven)
- A dropped socket keeps its seat, voice, callsign and room PP for **10 s**. The browser reconnects quietly with
  `?id=&tok=`.
- While it is away, **the host's autopilot flies the player's plane**. This is the game's own mechanic, so nobody
  notices a hiccup. When the player returns, control goes back to them.
- WebRTC links survive a short WebSocket drop.
- After a server restart, browsers rebuild their rooms within 60 s (Snake's `rebuildWindow`).
- krayzeenet has the grace, resume token, voice holding, immediate host handoff on a drop, silence handoff, and the
  60 s rebuild window (the rebuilt room keeps its code, options, phase, line order, voices and callsigns), with tests.

**The host leaving**
- A **goodbye** (tab closed, page left) or a **hidden tab** (`visibilitychange`) hands off at once.
- **Silence** for 2.5 s of game-loop beats hands off too. Snake tried 1.5 s first, and stalls replaced hosts for no
  reason.
- The new host is the next connected player who is in sync. It rebuilds ATC, AI and the ledger from its replica and
  the last keyframe, and continues. The epoch goes up, so two browsers can never both act as host.

**Mobile realities**
- iOS Safari freezes background tabs, so a hidden tab is treated as away.
- A switch from Wi-Fi to 4G changes IP, so the client runs an ICE restart. Until the new link is up, traffic goes
  through the relay.
- Two phones on the same home Wi-Fi often cannot connect directly. Cloudflare TURN fixes that through Sydney.
  Credentials come from snakenet's loopback `127.0.0.1:8014/ice` under its shared 800 GB cap (`SHARED_TURN.md`).
  Without TURN, that pair goes through the US relay, and an amber pill suggests one player switch to mobile data.
- Being host drains battery. The client sends `ready` beats only when it is not in lite mode and has had a stable frame
  rate for 5 s. Promotion prefers ready members.

## 10. Requirements on other lanes

- **ATC.** All state must be plain JSON, through `serialize()` and `restore(json)`. `step(dt, roomTime)` must take an
  injected clock: no `Date.now` or `performance.now` inside. Any plane must be a "remote" (state fed in) or "local"
  (autopilot-driven) plane, switchable at runtime. Infraction checks must run per plane against a given state. The
  rule-break detector should be callable on the follower's replica.
- **FLIGHT.**
  - `packState(plane) → Uint8Array(32)` and `applyRemote(plane, samples)` for the interpolator.
  - The autopilot can take over any plane from any state (already in the brief).
  - Collision callbacks must say whether the other plane is remote.
- **RADIO.** Play a clip sequence at a given room time (`schedule(at, clips)`), and play your own bark at once and
  locally without waiting for the network. Preload by voice id.
- **UI.**
  - Lobby screens: create (room type + options), join by code, public list, quick join.
  - A voice picker with greyed taken cards showing the holder's name, and up to 3 starred favourites in the profile.
  - A Court ladder in the HUD (top 3 + you, DESIGN §6).
  - A connection pill (relay or direct, ping bars), a "Reconnecting…" pill and a kick-vote sheet.
- **DESIGN.**
  - `data/modes.js` ROOM_TYPES ids: the prototype uses `court rumble coronation strict garden joust open`. Please use
    those ids or tell ONLINE.
  - The §3.3 wording note in §1.
  - Plausibility ceilings, as PP per minute per rule.

## 11. Identity: reuse of the account layer

- `hello` carries `idToken` from `/lib/auth` (`auth.getIdToken()`, the RAGDOJO addition). The server verifies it
  without credentials, using Google's x509 certs and the `br8t-games` audience. It copies RAGDOJO's `idtoken.go`
  (Clued's `firebase.go` is the same approach).
- **Anonymous users can play.** A token is still sent, and it is a uid. The uid is used to:
  - give one seat per uid per room (a second tab replaces the first),
  - make kick bans stick,
  - apply per-account rate limits, and
  - (later) a ranked-room gate.
- Display name, title and gender come from the Krayzee profile (`ui.getProfile()`), not from the Google account.
- As built: `/lib/auth` `getIdToken()` returns null for anonymous users, so they send no token and get no uid; their
  seat and kick bans key on the socket id instead. Signed-in players get the per-uid rules.
- No server database is needed for v1. Rooms are in memory, and career PP lives in each player's own cloud save.

## 12. Server: shape and deployment (when approved)

- Fork `gms/pwa/snake/server` into `gms/3d/krayzee/server`, as module `br8t/krayzeenet`, keeping:
  - the hub goroutine,
  - WebRTC `sig` and `rl` relay with budgets,
  - TURN through `:8014/ice`,
  - reconnect grace and the rebuild window,
  - regions.
- Add the Krayzee pieces from the prototype: voices, callsigns, options, the host-only `set` command, the `meta`
  message, kick/vote and the ID token.
- Listen on `127.0.0.1:8018`. Caddy routes `handle /gms/3d/krayzee/net/*`, and the page uses
  `wss://games.br8t.com/gms/3d/krayzee/net/ws`, with a `?net=` override for local testing.
- Copy Clued's `deploy.sh` (build on the box, health check, rollback) and `caddy_route.py`. Use a systemd unit like
  `clued.service` with `MemoryMax=64M`. **Commit first, then deploy**, and only after Aaron approves the named steps.
- Tests:
  - `go test ./...`
  - `server/test.mjs`, the protocol test that exists now
  - later, a `tools/mpgate.mjs` with 4 headless Chromes, like Snake's: create, join, voice claim, the host vanishing,
    the server killed mid-room. Every key check must be falsified.

### Wire protocol (what `server/` speaks)

Text frames are JSON. Binary frames are the relay: `[len][to id][lane 'u'|'r'][payload]` in, `[len][from id][lane][payload]` out.

| client → server | |
|---|---|
| `hello {name, title, rank, g, emp, voices[≤3], tz, tok?}` | profile; `rank` = data/ranks.js id (hosting gates on trust); `voices` = favourites in order; may be resent |
| `auth {tok}` | Firebase ID token (or `dev:<uid>` with `KRAYZEE_DEV_AUTH=1`); one seat per uid per room, kick bans stick |
| `b {r, pk}` | heartbeat from the game loop, every 500 ms: `r` = fit to host, `pk` = landed/parked (may change voice) |
| `list` · `quick` · `create {name, priv, set}` · `join {code}` / `join {id}` · `leave` · `rejoin {rj}` | `rejoin` rebuilds the room after a server restart |
| `claim {voice}` | atomic; refused in flight unless parked (D5) |
| `set {set}` · `phase {p: lobby\|flight\|podium}` · `meta {crown, left}` · `handoff` | host only; `set` not in flight |
| `rdy {on}` | lobby ready tick |
| `kick {id}` · `vote {id}` | private room: the creator kicks; public room: `kick` counts as a vote, majority of the others removes |
| `sig {to, d}` | WebRTC offer/answer/candidate to one peer |
| `rl {to?, d}` | JSON relay to one member or (no `to`) the room |

| server → client | |
|---|---|
| `welcome {id, tok, ice, voices, grace, resumed}` | reconnect with `/ws?id=&tok=` within `grace` ms keeps the seat |
| `rooms {rooms[], players, online, region}` | public only, never codes; each `{id, name, region, n, max, set, phase, meta, open}` |
| `room {room, you, ice?, joined?}` | `room = {id, code, name, priv, region, n, max, set, phase, meta, host, owner, epoch, members:[{id, name, title, rank, g, emp, voice, call, away, rdy, kv}]}`; TURN only when n > 1 |
| `claim {ok, voice, by?, byName?, why?}` | `why: "airborne"` when refused in flight |
| `auth {ok, ranked}` · `kicked {code: kicked\|replaced\|banned, msg}` · `err {code: full\|nocode\|joust\|banned\|gone\|slow, msg}` | |
| `sig {from, d}` · `rl {from, d}` | |

Server limits: 500 clients, 200 rooms, 8 per room, 32 KB messages, 64 sockets per address (IPv6 per /64), relay budget
400 msgs/s and 512 KB/s per client, 20 control msgs/s (burst 40). Names: 14 chars, rooms 24, profanity filtered (Clued's
list). Settings are cleaned against `data/modes.js` HOST_OPTIONS; joust is forced to 2 players; Royal Decrees need a King+
host, ranked rooms a Duke+ host (both on trust). Codes skip 0/O/1/I/L.

## 13. Build phases and effort

| phase | what | effort |
|---|---|---|
| O0 ✅ | this design, prototype broker, protocol test (26 checks, 2 falsified) | done |
| O1 ✅ | krayzeenet: snakenet fork + prototype pieces, ID token (dev bypass), kick/vote, meta, phase, rank gates, rebuild window, per-IP cap; go tests; deploy scripts **written, not run** | done 2026-10-22 |
| O2 ✅ | `js/net/`: links (Snake port: chunking, reconnect, relay fallback), room clock, plane stream + interpolation buffer, options from modes.js, lobby screen; two-window CDP test | done 2026-10-22 |
| O3 ✅ | `js/net/session.js`: remote human rigs (type + livery) as remote Traffic entries (ATC, markers, collisions), own state at 15 Hz, host AI snapshots (10 Hz binary `TRAFFIC` + 1 Hz roster), ATC keyframe 1 Hz + delta 5 Hz, follower replica with own-plane detection → `inf`, authority-only crimes → `hinf`, `bank` validation, Court + crown, radio floor (`schedule(at, clips)`), account token, podium → `career.addOnlineWin`; two-real-page CDP test | done 2026-10-22 (main.js wiring left to GAMEPLAY, §15) |
| O4 ✅ | host migration from the replica (AI adopted, ATC + ledger + Court kept, unacked reports resent and de-duplicated), host autopilot for silent players with hand-back, ICE restart, idle removal (5 min, public), pvp `hit` with room protection + Realistic ramming Scandal, `tools/net/test-mp4.mjs` 4-page gate with falsification | done 2026-10-22 (§17) |
| O5 ✅ | polish: podium layout, quick join, public list meta, data saver, kick-vote sheet, Reconnecting… / autopilot state for the HUD pill (ping bars: UI4's pill). LAN mode deferred (D5) | done 2026-10-22 (§18) |

That is about 6 agent sessions, and online fits after P2 gameplay works in single player. The longest pole is O3,
which depends on ATC being serialisable and clock-injected. Asking for that **now**, in P2, costs nothing.

## 14. Open questions for Aaron

1. **Browser-hosted, like Snake and RAGDOJO**, with client-side cheating accepted? The alternative, a server running
   the game, means a second copy of the flight and ATC code, or node processes on the box.
2. **Ranked rooms:** DESIGN gates hosting by career rank (Duke+ for ranked rooms, King+ for Royal Decree). Career PP
   lives in each player's own save, so the gate is on trust unless the server reads Firestore. That needs a service
   account on the box. Is trust OK?
3. **Changing voice:** lobby and while parked only, or free at any time?
4. **Join mid-session:** allowed, except in Joust?
5. **Limits:** any daily online limit like RAGDOJO's 3 a day, or free and unlimited?
6. **Home LAN mode** like RAGDOJO's (no internet, local server, no sign-in) for family play?
7. **Deploy:** port 8018 on the br8t box (8012–8014, 8016 and 8017 are taken in repo configs; 8015 is unaccounted for),
   sharing Snake's TURN cap. The box has to be checked before deploy.

## 15. Client API for GAMEPLAY (`js/net/index.js`)

```js
import { createNet } from './net/index.js';
import { createLobby } from './net/lobby.js';
const net = createNet({ profile: () => ui.getProfile(), getToken: () => account.auth.getIdToken() });
// server: ?net=ws://127.0.0.1:8018/gms/3d/krayzee/net overrides wss://games.br8t.com/gms/3d/krayzee/net; ?p2p=0 forces relay
const lobby = createLobby({ net, profile: () => ui.getProfile(), onStart: (room) => startOnline(room), onClose: () => showMenu() });
lobby.show(true);                       // ?room=CODE in the URL joins straight away
```

| call | what |
|---|---|
| `net.tick(now, {ready, parked})` | **every frame**. Heartbeats (a hidden tab stops → hands off), pings, room clock. `ready` = in sync with stable fps (host candidate); `parked` = landed/parked (voice change allowed) |
| `net.sendPlane(ac, {hull, overriding, parachute})` | own plane to every peer, unreliable, self-limited to 15 Hz; uses `ac.packState` with room time |
| `net.applyRemote(peerId, ac)` | draws a peer's plane into an `Aircraft` 100–300 ms in the past (Hermite/slerp, dead-reckons ≤ 600 ms): `'interp' \| 'reckon' \| 'lost' \| 'empty'` |
| `net.track(peerId).health(net.roomTime())` | `'live' \| 'lost'` (> 600 ms, ghost) `\| 'autopilot'` (> 2.5 s: host flies it, O4) |
| `net.hold(peer, on)` · `net.held(peer)` · `net.pushState(peer, st)` | O4: while the host's autopilot flies `peer`, drop its own packets and take the host's relayed states |
| `net.restartIce(why)` | O4: ICE restart on every link (also fired by `online` / `navigator.connection` change); events `iceRestart(peer, why)`, `iceRestarted(peer)` |
| `net.roomTime()` | host milliseconds (ping/pong clock to the host; continuous across host handoff) |
| `net.send(to, obj)` · `net.broadcast(obj)` · `net.toHost(obj)` | reliable ordered JSON (`atc`, `inf`, `bank`, `radio`, `crown`… in O3) |
| `net.create({name, priv, set})` · `join(code \| {id})` · `quick()` · `list()` · `leave()` | membership |
| `net.claim(voice)` · `setOptions(set)` · `setPhase('lobby'\|'flight'\|'podium')` · `ready(on)` · `kick(id)` · `vote(id)` · `meta(crownName, secondsLeft)` · `handoff(why)` | lobby / host |
| getters | `id, room, members, me, isHost, hostId, phase, connected, voices, linkSummary()` |
| `net.status()` | O5, one word for the HUD pill: `'off' \| 'reconnecting' \| 'autopilot' \| 'solo' \| 'relay' \| 'mixed' \| 'direct'` (null outside a room) |
| `net.linkSummary()` | `{relayed, total, rtt}` or `{alone}`, plus (O5) `reconnecting`, `autopilot`, `saver` flags when true |
| `net.reconnecting` · `net.autopilot` · `net.saver` · `setSaver(on)` | O5. `setAutopilot(on)` is session.js's (the host's autopilot holds our plane) |

Events (`net.on(ev, fn)` returns an unsubscribe): `connected`, `rooms`, `joined(room)`, `room(room, prev)`, `host({host,
prev, epoch, me})`, `phase(p, prev)`, `claim(m)`, `error(m)`, `kicked(m)`, `left({why})`, `peerLeft(id)`,
`plane(peerId, state, track)`, `msg(from, obj)`, `link(peer, direct)`, `linkLost(peer)`, `reconnecting(bool)`, `auth(m)`,
`disconnected`; O5: `autopilot(bool)`, `saver(bool)`.

Options: `js/net/options.js` (`defaultsFor(type)`, `normalise(set, hostRank)`, `fixedKeys`, `summary`) applies each
room type's fixed values from `data/modes.js`; the host's game should read `net.room.set` through `normalise` too.

UI asks (not built, UI lane): up to 3 starred favourite voices in the profile (`profile.favourites`, the lobby already
sends them), an Online button on the menu (currently SOON) that opens `createLobby`, the in-flight connection pill and
Court ladder.

### main.js wiring for the net game (O3, for GAMEPLAY to apply)

Five edits to `js/main.js`, exactly what `tools/net/gen-main.mjs` applies to its generated copy (the test fails loudly if
an anchor stops matching, so keep them in step):

```js
// 1. module state
let net = null, lobby = null, session = null;

// 2. inside onOnline(), replacing the createNet/createLobby lines
const [{ createNet, accountToken }, { createLobby }, { createSession }] = await Promise.all([import('./net/index.js'), import('./net/lobby.js'), import('./net/session.js')]);
net = createNet({ profile: () => ui.getProfile(), getToken: accountToken });
session = createSession({ net, scene, traffic, wiring, attract, createPlane, applyEnv, env, career, ui, hud, fx, log,
  onExit: () => { quitPlay(); ui.showMenu(); lobby.show(true); } });
lobby = createLobby({ net, profile: () => ui.getProfile(), onStart: async () => { lobby.show(false); ui.enterGameplay(); await onPlay('online'); if (S.player) session.attach(S.player); }, onClose: () => ui.showMenu() });

// 3. in the frame loop, right after net.tick(...)
if (session) try { session.update(dt); } catch (e) { console.warn('[net]', e); }

// 4. first line of quitPlay(), after `if (!S.player) return;`
session?.detach();

// 5. onQuit()
function onQuit() { session?.detach({ leave: true }); quitPlay(); /* … */ }
```

What `session` needs from the objects it is handed: `wiring.{atc, radio, game, link, pilots, idOf, removeAI, activeEnd,
refreshProfile, flightNo}`, `attract.{ai, update, seedRivals, despawn, clearAround}`, `traffic.{add, remove, modeOf, list}`,
`createPlane({type, livery, quality, cockpit})`, `env.groundHeightAt`, `career.addOnlineWin/addOnlineRoom`,
`ui.getProfile/getLivery`, `hud.flash`, `fx.track/untrack`. It owns, while attached: the follower's `attract` (no local
AI), ATC `configure({authority, detectRemote:false, outragePerPlayer:true})`, `radio.setMode('host'|'follower')`, and
the player's stand (spawned at a per-member stand). `detach()` gives all of it back.

`session` API: `attach(player)`, `update(dt)`, `detach({leave})`, `endRound()` (host), `role`, `attached`, `court`,
`standings()`, `state()` (test/debug snapshot: humans, ai, ledger, court, infs, acks, banks, barks, radioIn, crowns,
hostDet, sentInf). Messages it adds on the reliable lane: `hi` (type + livery + name/title/voice), `atk`/`atd` (ATC
keyframe/delta), `ai` (roster), `court {s, end}`, `crown {id, emperor}`, `radio {at, msg}`, `inf`/`infAck`,
`hinf`, `bank`/`bankAck`, `bark`, `end {res}`; binary `KIND.TRAFFIC` for AI states. O4 adds: `inf`/`bank` carry `n`
(acks echo it), `court` carries `led` (ledger incl. seen `n`s) and `hd` (host detections), `ap {id, on}`, `back`,
`apBack {s: 32-byte pose | null}`, `apAck`, `hit {other, kt, ov, res}`, `scandal {why, victim}`; `KIND.TRAFFIC` also
carries `p:<id>` entries for planes the host's autopilot holds. `session.debug = {noAdopt, noAp, noResend, noDedupe}`
are test switches for the falsification run only.

## 16. Running it locally

```sh
cd gms/3d/krayzee/server
go test ./...                                   # hub rules with a fake clock + ID-token verifier
node test.mjs                                   # builds krayzeenet, 39 checks over real sockets
KRAYZEE_DEV_AUTH=1 KRAYZEE_ICE_URL=off go run . # serves ws://127.0.0.1:8018/gms/3d/krayzee/net/ws
```

With the site on `http://localhost:8888` (repo root), open two windows of
`/gms/3d/krayzee/tools/net/sandbox.html?net=ws://127.0.0.1:8018/gms/3d/krayzee/net&name=Dirk&uid=a` (second: `&name=Mo&uid=b`;
also `&voices=toff,bubba&rank=king&g=f&p2p=0`). Each member flies a fake circle once the host taps Start.
`node tools/net/test-mp.mjs` does all of that headless on CDP port 9561 (own krayzeenet on 8738, and its own static
server for the repo on 8739: the shared python one on 8888 stalled module loads for 30 s with two pages open), with
screenshots in `docs/shots/net/`. `--only=game` runs the two real game pages from `tools/net/gen/` (A creates and hosts, B
joins by code): each sees the other's plane rig in-world, B gets the host's AI and ATC, B's cut-in on A scores on the
host, B banks and takes the Crown, B's bark goes through the floor, podium + `addOnlineWin`, then A closes and B takes
over (Court kept, own AI). Its falsification drops B's reports: "the cut-in by B scores on the host" must fail while B
still learns of it. `--trace` prints the cut-in approach every 3 s and skips the falsification run. Headless Chrome needs `--disable-features=WebRtcHideLocalIpsWithMdns` for two windows to connect
directly (Snake's mpgate does the same).

`node tools/net/test-mp.mjs --only=o5` (also part of the default run, first) is the O5 suite on sandbox pages: the podium at
390×844, 844×390, 1280×800 and 667×300 (card on screen, button fully visible by hit-test and focused, SVG crown, serif
heading, pop-in; the list scrolls at 667×300), Escape closes it once; falsified by removing the flex column (the 667×300
button check must fail). Then quick join ×3 into one public court, the list's lobby meta line, the kick-vote sheet (Escape
cancels; one vote shows "Voted 1/2" and "1 vote to remove you"; a second removes), the in-flight meta line with crown and a
local countdown, the data-saver switch, and a socket drop (`net.status()` / `linkSummary().reconnecting` / the lobby pill say
Reconnecting…, then clear). The game run also checks the saver halves the host's AI packets to B, and the in-game podium.

`node tools/net/test-mp4.mjs` (O4) runs four real game pages on CDP 9561 with its own krayzeenet on 8740 (grace 30 s,
idle removal off) and static server on 8741: ICE restart on D, a Rubber head-on bump C×D, C frozen with
`Page.setWebLifecycleState` (host AP flies it; woken with focus emulation, control comes back where the AP left it),
C's two reports (ack lost / never seen), then A closes on final and B takes over. The falsification run breaks ICE
restart, D's impact handler, the host's AP, B's ATC replica and B's dedupe, and requires exactly those checks to fail
while the resend and handoff checks still pass. `--real` skips it, `--trace` prints detail. Screenshots `docs/shots/net/mp4-*`.

Deploy (**not done; needs Aaron**): `server/deploy.sh` refuses without `CONFIRM=1` and refuses if port 8018 is taken on the
box; `server/krayzeenet.service` (MemoryMax 64M), `server/caddy_route.py` adds `handle /gms/3d/krayzee/net/*`. TURN comes
from snakenet's loopback `:8014/ice` (shared 800 GB cap).

## 17. O4: robustness (2026-10-22)

**Host migration from the replica.** A follower that becomes host (`session.js` `setRole('host')`):
- applies the newest pending ATC keyframe/delta, then switches ATC to authority. Strips, sequences, clearances (with
  their `cmdSeq` numbers), cooldowns and per-player outrage are the old host's; the counter continues.
- **adopts the replica's AI planes**: each remote AI entry becomes a local one with a new `Autopilot` on a route for
  its ATC intent (circuits / arrival / departure; parked at a stand → board 8 s, then depart), keeps its id, strip,
  rig, radio voice and marker, and joins `attract.ai`. The page's Aircraft id counter is moved past the adopted ids so
  a new AI never reuses one.
- **takes the ledger** from the 1 Hz `court` replication (`led`: acc, infs, landed, banked and the report numbers it
  has seen) and the host-detection list (`hd`). The Court was already replicated.
- Followers keep every `inf`/`bank` until acked; on a host change they resend them to the new host 400 ms later. The
  host drops a report whose `n` it (or the old host, via `led`) already saw, and acks it as `dup`: a report is
  credited exactly once whether the old host took it, never saw it, or took it and lost the ack.
- A new host's first messages can beat the server's room update; followers keep them for the `host` event.
- `hostDetect` starts fresh (first pass only records), so old cut-ins are never scored again.

**Autopilot for silent players (§9).** On the host, a human plane with no packets for 2.5 s (`AUTOPILOT_MS`) becomes
local: an `Autopilot` on its ATC intent's route, ATC commands it, `aiImpactHandler(room protection)`. The host
broadcasts `ap {id, on:true}` and relays its pose in `KIND.TRAFFIC` as `p:<id>`; followers `net.hold` that peer.
When the player's own game loop runs again (a frame gap > 2.5 s, or the `ap on` message) it stops sending, asks
`back`, gets `apBack` with the pose, puts its plane there, replans and acks; the host releases and gives the stream
2.5 s before it could take over again. A page that is hidden (no loop) never asks, so control is not flapped back
and forth. Chrome's `freeze` event closes the socket as "away" (4001), not "going away" (a goodbye), so the seat is
held for the grace; a reconnect deadline that fires late after a freeze gets one more 4 s chance.

**ICE restart.** `Link.iceRestart`: on `online`, `navigator.connection` change, ICE `disconnected` for 1.5 s or
`failed`, the offerer restarts ICE on the same `RTCPeerConnection` (`restartIce` + `createOffer({iceRestart:true})`,
signalled with `ir2`); the other side asks with `{ir:true}`. Traffic goes through the relay until ICE is back
(`direct` false while `restarting`), at most 3 restarts per link, then the old fallback.

**Idle removal (§8).** Beats carry `i: 1` after any pointer/key/touch/wheel input; every control message counts too.
`expireIdle` removes a non-away member of a **public** room after `KRAYZEE_IDLE_MS` (default 5 min) without input,
with `kicked {code:'idle'}`. The session flashes the message and returns to the lobby. Go test `TestIdleRemoval`.

**Player vs player contact.** The session wraps the local plane's `_impact` for contacts with `p:` planes:
- no contact in the first 5 s after spawning or within 18 m of a stand (either plane);
- otherwise the game's own impact handler decides, with the **room's** protection: the session restores the game
  state with the room's `protectionMode` / partial start (wiring creates the game with Free Flight's), and the host
  sets the AI protection to match;
- each real contact goes to the host as `hit {other, kt, ov, res}`. Blame goes to the other plane if it was
  overriding (each side's report blames the other, so both are blamed only if both were overriding; nobody if neither
  was). In **Realistic** rooms, 3 blamed hits on the same victim within 60 s = Royal Scandal for the rammer
  (`scandal` → the game's scandal: 25 % pending forfeited, 60 s frozen; host ledger acc ×0.75; tower `scandal` line).

**For other lanes / open points**
- GAMEPLAY (`js/core/wiring.js`, optional): `startPlay('online')` creates the game with Free Flight's protection and
  no room type, so Strict Tower's −500 room PP crash penalty is not applied. Passing the room type and protection
  (`createGame({ mode: set.type, protection: set.protection, partialStartPct: set.partialStart })`) would let the
  session drop its protection override. No main.js change is needed for O4.
- FLIGHT: `Autopilot._taxi` throws when a taxi leg's path has one point (the plane is already at the leg's end, e.g. a
  plane adopted at the hold). `session.flyLocal` pads the path; the autopilot should guard it itself.
- Aaron: ramming → Royal Scandal is applied in **Realistic rooms only** (§8 lists it under "Ramming in Realistic";
  DESIGN.md has no ramming rule). Say if Partial/Rubber rooms should count rams too.

**O5 (left):** quick join polish, public list meta, data saver, ping bars + the in-flight connection pill, kick-vote
UI, LAN mode if wanted; a "Reconnecting…" pill and a toast when the host's autopilot has your plane.

## 18. O5: polish (2026-10-22)

- **Podium** (`podium.js`): the card is a flex column; heading and "Back to the lobby" stay fixed, the standings scroll
  between them (compact under 460 px tall). Gold SVG crown (UI4's) on the crest and the winner's row, no ♛ glyph; heading in
  Krayzee Serif italic (the module declares the font-face itself, so the sandbox gets it too); 0.34 s pop-in (none with
  reduced motion); the button takes focus, Tab stays on it, Escape closes (= the button). A podium removed from the DOM by
  someone else drops its key listener on the next key.
- **Quick join**: the button shows "Finding a court…" until `joined` / `err` (8 s timeout message). Server behaviour unchanged
  (busiest public room in your region with a seat, else a new public Court).
- **Public list**: refreshes every 10 s while the lobby home is on screen; header shows "N online"; each room's meta line
  is `roomMeta(r, age)` (exported): lobby "In the lobby · join now", flight with a holder "crown + Baroness Dirk · 4:12 left"
  counted down locally between refreshes, "In flight · join mid-session", "Crowning the winner", and for closed rooms
  "Full" / "Joust under way" / "Closed to you".
- **Data saver**: a switch on the lobby home and room views (`krayzee.netSaver`; `?lite=1` / `?saver=1` force it on,
  `?saver=0` off). The follower tells everyone (`hi.sv`, then `sv {on}` on change) so any future host knows. The host now
  sends AI states **per follower**: 10 Hz for planes within 3 km of that follower's plane, 2 Hz beyond; saver halves it (5 Hz,
  far 1 Hz). Planes the host's autopilot holds go at the near rate. `session.state().aiTx` counts packets per follower.
- **Kick vote**: "Vote out" / "Remove" opens an in-lobby confirmation sheet (no browser dialog; Escape / backdrop / Cancel
  close it) stating the majority needed and votes so far. After voting the button reads "Voted k/n" (disabled); the target
  sees "k votes to remove you" on their own row. Server rules unchanged.
- **Reconnecting / autopilot state** for the HUD pill, without new DOM: `net.status()`, `linkSummary().reconnecting /
  .autopilot / .saver`, events `autopilot(on)`. The session flashes (via `hud.flash`) "RECONNECTING TO THE ROOM…" / "BACK IN
  THE ROOM" on a socket drop, and "CONNECTION HICCUP · THE TOWER AUTOPILOT HAS YOUR PLANE" / "YOU HAVE CONTROL AGAIN" when
  the host's autopilot takes and returns your plane (`session.state().apToasts`).
- **main.js**: no new wiring. `ghud.online.sync(session, net)` (already in main.js) feeds UI4's pill from `net.linkSummary()`.

**Ask for UI4 (`js/hud/online.js`, not this lane's file):** `linkQuality(link, connected)` shows "OFFLINE" whenever
`connected` is false, but mid-room that is always a reconnect (the WebRTC game links keep running). Please read
`link.reconnecting` → label "RECONNECTING" (amber, not red), and `link.autopilot` → label "AUTOPILOT" (the host is flying
your plane); `net.status()` gives the same in one word.

**Deferred:** LAN / home-wifi mode (D5).

