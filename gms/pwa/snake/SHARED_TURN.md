# Shared TURN relay for apps on the br8t box

**Audience:** an AI coding agent working on another game hosted on the br8t
server (originally written for Serpent.io, `/srv/apps/serpent`). Read all of it
before changing anything.

## What this gives you

Aaron's account has a **Cloudflare Realtime TURN** relay. TURN lets two
browsers hold a WebRTC connection even when they cannot reach each other
directly: two devices on the same home Wi-Fi, strict mobile-carrier NATs,
school networks. Cloudflare's relay is anycast, so Australian players relay
through Sydney, not the US.

You do **not** get the Cloudflare key, and must not try to obtain it. The
Snake-eee room server (`snakenet`, a Go service on this box) holds it and hands
out short-lived TURN credentials to other local apps over a loopback-only
endpoint. That keeps the key in one place and puts every app under one
spending cap.

## The endpoint

```
GET http://127.0.0.1:8014/ice
```

- Reachable **only from this box** (loopback). Not exposed through Caddy, not on
  the internet. Your server process calls it. Browsers never call it directly.
- No auth header needed.
- Response:

```json
{
  "iceServers": [
    { "urls": ["stun:stun.cloudflare.com:3478", "..."] },
    { "urls": ["turn:turn.cloudflare.com:3478?transport=udp", "..."],
      "username": "…", "credential": "…" }
  ],
  "turn": true,
  "refreshSeconds": 3600
}
```

`iceServers` is in the exact shape `new RTCPeerConnection({ iceServers })`
expects. Pass it through unchanged.

## How to use it

1. Your server fetches `/ice` and caches the result for at most
   `refreshSeconds` (1 hour). Credentials stay valid for at least 2 hours after
   you fetch them. Refetch on that schedule, never per message.
2. Send `iceServers` to a browser **only when it is about to make a WebRTC
   connection to another player** (for example, in your "joined a room/match
   with someone" message). Don't put it in a public page, a static file, a log
   line, a repo, or anything served to people who are not playing.
3. In the browser: `new RTCPeerConnection({ iceServers })`. Leave
   `iceTransportPolicy` at its default (`"all"`): direct connections are still
   tried first, and the relay is used only when needed. Forcing `"relay"`
   wastes the shared allowance.
4. Handle `"turn": false`. That means the monthly cap has been reached, or
   usage could not be checked (it fails closed). You then get STUN only. Your
   game must still work: fall back to relaying through your own server, and tell
   the player the connection is slower. Do not treat this as an error to retry
   in a loop.
5. If `127.0.0.1:8014` does not answer (snakenet restarting or not deployed),
   use plain STUN: `[{ "urls": ["stun:stun.cloudflare.com:3478"] }]`.

## Important: TURN only helps WebRTC (browser-to-browser)

TURN does nothing for a WebSocket connection to a game server. If every player
connects to a server in the US, the round trip to the US is the lag, and no
relay changes that. To benefit from TURN, a game has to be **browser-hosted**:
one player's browser runs the simulation, the others connect to it over
WebRTC data channels, and the server only introduces players. Snake-eee works
this way. Its design, the reasons for it, and its fairness rules are written up
in its project, and the code is a working reference:

- Design: `gms/pwa/snake/MULTIPLAYER.md` in the Y-R-U site repo
  (`https://github.com/Y-R-U/Y-R-U.github.io`)
- Browser networking (rooms, WebRTC mesh, relay fallback, reliable/unreliable
  lanes, chunking): `https://games.br8t.com/gms/pwa/snake/js/net.js`
- Game sync (host snapshots, follower interpolation, victim-side collisions,
  host migration): `https://games.br8t.com/gms/pwa/snake/js/netgame.js`
- Room/signalling server (Go): `gms/pwa/snake/server/` in the same repo

Copying ideas or code from these is fine. Don't change Snake-eee's own files or
services: they are a different, live game.

## Limits and etiquette

- **One shared allowance.** Snake-eee and your game share Cloudflare's free
  1,000 GB a month. An automatic cap switches TURN off for **both** games at
  800 GB, until the month resets. A relayed player uses about 5 KB/s (about
  18 MB an hour) for a snake-sized game. Keep your messages small: binary
  snapshots, 20 per second or fewer, no per-frame full-state JSON.
- This is for Aaron's family and friends while learning. If the game is ever
  published widely, ask Aaron for a separate TURN app and a per-app cap first.
- Never write the credentials anywhere persistent. Never send them to a
  third-party service.
- If you need something the endpoint does not provide, ask Aaron rather than
  working around it.

## Quick check from the box

```bash
curl -s http://127.0.0.1:8014/ice | head -c 200; echo
curl -s http://127.0.0.1:8013/gms/pwa/snake/net/health   # usage so far, and whether TURN is on
```
