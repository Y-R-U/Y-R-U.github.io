# Snake-eee multiplayer (rooms)

Read this before touching `js/net.js`, `js/netgame.js`, `js/rooms.js` or `server/`.

## Why it is built this way

The only server (games.br8t.com) is in the US. Aaron's family is in Australia,
and a US-hosted snake game (his son's Serpent.io) already showed the problem:
~180 ms each way makes bots "pass through you" and you die after visibly
getting in front of someone. So the server only **introduces** players; the
game runs in a player's browser and traffic goes browser to browser (WebRTC).

- **Room server** (`server/`, Go, `127.0.0.1:8013`, Caddy `/gms/pwa/snake/net/*`):
  room list, join order, WebRTC signalling, a relay for pairs that cannot
  connect directly, and the referee for host changes. It never runs the game.
- **Host** = first in line. Its browser runs the arena exactly as single
  player does (bots, food, power-ups, deaths), plus `NetGame.host*` hooks.
- **Followers** steer their own snake locally (no input lag) and draw everyone
  else from host snapshots, interpolated ~80 ms in the past.
- **Full mesh** of WebRTC links, so a new host already has its wires up.
  Every link starts on the server relay and moves to direct when it opens.

## Fairness rules (what players notice — do not undo)

1. **Your own head is judged by your own browser**, against what is on your
   screen. The host never decides that a follower's head hit a body
   (`snake.remote` → skipped in `checkSnakeCollisions` and boundary deaths).
2. Everything else is the host's call: bots' heads, head-on clashes, eating,
   power-ups. Followers apply those events at their host timestamp on the
   delayed view, so a bot dies when it visibly reaches you.
3. A follower's position is its own, except while the host was steering for
   it (autopilot, flag 32) or right after the tab was hidden (`resumePending`).

## Timings

| | |
|---|---|
| Snapshots host → followers | 20/s (`NG.SNAP_MS`), ~220 B each ≈ 4–5 KB/s per follower |
| Inputs follower → host | 20/s, 12 B |
| Interpolation delay | 80 ms, deeper on jittery links (max 400) |
| Host hidden / tab closed | immediate handoff (`visibilitychange`, `pagehide`) |
| Host silent (crash, network) | replaced after **2.5 s**, only by a *ready* member (synced, beating) |
| Player silent | autopilot after 2.5 s; snake removed when they leave the room |
| Socket to the room server drops | place kept **10 s** (`reconnectGrace`); the browser reconnects quietly (backoff 250 ms → 2 s, gives up after 9 s) |
| Room server restarts | for 60 s (`rebuildWindow`) browsers may rebuild their rooms: same ids, code, line order, epoch |

Beats come from the **game loop**, not a timer, so a hidden tab stops beating.
1.5 s was tried first: on a loaded machine the host stalled 1.6–1.9 s and
was replaced for nothing. If nobody else is fresh, the host is kept (no thrash).

## Reconnecting (2026-10-11)

A dropped WebSocket no longer throws the player to the menu. The game itself
runs over WebRTC, so `Net` keeps the room, the members and every `NetLink`
as they are, shows a small "Reconnecting…" pill, and reopens the socket with
`?id=&tok=` (the resume token arrives in `welcome`). The server held the
member's place for `reconnectGrace`, so nobody else sees anything happen; the
browser then sends `rejoin` and gets its room message back.

- **Goodbye vs. blip.** A close with status 1000/1001 (tab closed, page left)
  leaves at once, exactly as before; anything else (network drop, 1006, the
  test hook's 4000) gets the grace.
- **Server restart.** Rooms live in memory, so after a restart the first
  member to `rejoin` rebuilds the room from what its browser remembers (id,
  code, name, settings, member order, epoch). Members not back yet become
  placeholders that the right id adopts when it reconnects; they expire after
  the grace like any dropped member. Ids are only re-grantable inside the
  60 s rebuild window (first come, first served — there is nothing left to
  check a token against after a restart).
- **Old server.** A `welcome` without `grace` (pre-2026-10-11 server) turns
  reconnecting off: a drop goes back to the menu as it always did.
- A reconnect attempt that comes back with a different id, an `err`, or no
  room message within 9 s gives up into that same old behaviour.
- `NET_SERVER` is read once at load: the share-link code strips the query
  later, and a reconnect read from `location.search` went to the live server.
- Old clients against the new server: their drops get the grace too, so a
  vanished old client's snake lingers up to 10 s on autopilot.

## Room settings

Private rooms can switch off Base Speed, Magnet Range, Starting Size, Boost
Duration and the BOOST button (`Upgrades.ROOM_TOGGLES`). Coin Bonus only
changes your own payout, so it is never a room setting. Public (AUTO JOIN)
rooms are a free-for-all. Client-side cheating is accepted for now (Aaron's
call); the plan if it ever matters is silent detection into "cheater rooms".

## Same Wi-Fi / strict NATs

Two phones on one Wi-Fi often cannot connect directly (no hairpinning,
mDNS-only candidates). Without TURN that pair stays on the **US relay** —
it works, but it is laggy, and the in-game pill turns amber with a tip
(one player on mobile data fixes it). With a **Cloudflare TURN key** the
server hands out TURN credentials and the pair relays through Cloudflare's
nearest city instead (Sydney for Australians). Free tier: 1,000 GB/month.
Put `CF_TURN_KEY_ID` / `CF_TURN_KEY_TOKEN` in `/srv/data/snakenet/snakenet.env`
on the box and restart `snakenet`. **Never commit them.**

**Live since 2026-10-09** (Cloudflare app `snake-eee`, Aaron's account, card on
file, usage-billed past 1,000 GB). Because TURN credentials work for whoever
holds them, the server only sends them in `room` messages once a room has two
or more players, and they live 4 hours (refreshed every 2, shared).

**Automatic spending cap (`server/cap.go`).** Cloudflare has no hard spending
limit, so every hour the server reads month-to-date TURN egress (the billed
figure) from Cloudflare's GraphQL analytics (`callsTurnUsageAdaptiveGroups`)
and stops handing out TURN once it passes `SNAKENET_TURN_CAP_GB` (default
800 of the free 1,000). It **fails closed**: no TURN without a working cap, and
none if usage hasn't been readable for 6 hours. Players then fall back to the
US relay. Needs `CF_ACCOUNT_ID` + `CF_ANALYTICS_TOKEN` (Cloudflare account
token `snakenet-turn-usage-read`: Account Analytics Read only, IP-locked to
the br8t box) in the env file. `/gms/pwa/snake/net/health` shows usage and
whether TURN is on. A $5 billing budget alert emails Aaron as a second line.

Other apps on the box (Aaron's son's Serpent.io) get TURN credentials from a
loopback-only `http://127.0.0.1:8014/ice` endpoint, under the same cap. Their
guide is `SHARED_TURN.md`, copied to `/srv/apps/snakenet/SHARED_TURN.md`.

## Tests

- `cd server && go test ./...` — rooms, codes never listed, region grouping,
  ready-only promotion, no thrash, handoff, relay stays inside the room.
- `node gms/pwa/snake/tools/mpgate.mjs` (repo root) — real server + 4 headless
  Chromes: sw.js ASSETS vs index.html, create/share/join, victim-side death,
  host correction, a dropped socket reconnecting quietly (same id, P2P link
  untouched), AUTO JOIN, relay-only player, host vanishing, planned handoff,
  the room server being killed and restarted mid-room, leaving, solo intact.
  Every key check was falsified (broken on purpose → fails). It is sensitive to
  machine load: at load avg 50+ the browsers stall and a run can fail.
- `node gms/pwa/snake/tools/perfbench.mjs [baselineRoot] [root]` — frame cost
  of a late-game arena in GPU Chrome, split by pass.

## Performance notes

Simulation is < 1 ms a frame even at 10k mass. Drawing was the cost, and the
single biggest item was the arena edge: a radial gradient filling the whole
8,000 px world circle every frame (13 ms on a phone, 31 ms on a 2x laptop),
almost always off screen. It now draws only when visible, as a stroked band.
A pattern-filled grid and a cached grid canvas were both tried and were
*slower* than the plain hairlines — measure before "optimising" the grid.

## Deploy

`server/deploy.sh` (server + Caddy route), `STATIC=1` for the client too.
Commit first, then deploy.
