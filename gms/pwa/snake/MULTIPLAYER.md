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

Beats come from the **game loop**, not a timer, so a hidden tab stops beating.
1.5 s was tried first: on a loaded machine the host stalled 1.6–1.9 s and
was replaced for nothing. If nobody else is fresh, the host is kept (no thrash).

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

## Tests

- `cd server && go test ./...` — rooms, codes never listed, region grouping,
  ready-only promotion, no thrash, handoff, relay stays inside the room.
- `node gms/pwa/snake/tools/mpgate.mjs` (repo root) — real server + 4 headless
  Chromes: create/share/join, victim-side death, host correction, AUTO JOIN,
  relay-only player, host vanishing, planned handoff, leaving, solo intact.
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
