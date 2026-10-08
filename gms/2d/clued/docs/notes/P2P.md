# Lane P2P — device-hosted rooms (notes)

Status 2026-10-05: **built and tested.** The host's browser tab is the room server. Players join over WebRTC data channels
with a `?p2p=CODE` share link/QR plus a name, the same as server rooms. It uses S's lobby, runner wiring, timers,
scoreboards and podium unchanged. Signalling uses the free PeerJS cloud broker. Our br8t server is never contacted, so
there are no caps or protection levels, and it works on GitHub Pages.

## Files
```
js/net/p2p_room.js   pure room logic: a port of server/rooms.go + scoring.go (stage multiplier / progressive timing /
                     streak come from js/core/scoring.js) (timing, grace, early end, kids, votes/stages/lock,
                     names, late join, kick, again, snapshot/restore). No DOM, so it is node-testable.
js/net/p2p.js        transport 'p2p' (S's interface): host side (PeerJS peer + P2PRoom + 250 ms tick + broadcast) and
                     client side (data-channel RPC, state push, clock sync, reconnect). Registers itself and fallback.host.
js/net/p2p_ui.js     "Hosting from this device" / "Device room" lobby notes, host back-from-background toast
js/vendor/peerjs.js  PeerJS 1.5.5 dist (MIT) vendored unmodified, plus a 2-line ES-module export at the end
tools/p2p_test.mjs   node: 96 checks on the room logic (parity with js/core/scoring.js, grace, votes…)
tools/p2p_rate.mjs   connection success rate / time via the real broker
tools/p2p_e2e.mjs    3 headless Chromes (9411–9413) via the real broker: full game, refreshes, vote round, host leave
```

## How it works
- **Ids:** room code = 5 chars from S's alphabet. The host registers the PeerJS id `clued-p2p-CODE` with 0.peerjs.com
  (a clash with another room gives `unavailable-id`, and we pick a new code). Joiners get a random id and `connect()`
  to that id. ICE uses Google STUN (`stun.l.google.com:19302`, `stun1…`). There is **no TURN**.
- **Protocol** (JSON over one reliable data channel per player): `{t:'req', id, op, a}` → `{t:'res', id, ok, d|e}`, and
  the host pushes `{t:'state', s}` (that player's view, in the server's room-state shape plus `p2p:true`, and `closed`
  once the room ends) or `{t:'kicked'}`. The ops are `time, peek, join, sub, q, answer, vote, host, leave`, mirroring
  S's HTTP API. The host's own UI calls the same `dispatch()` directly, with no network.
- **Host-authoritative:** P2PRoom runs S's rules: 3 s lead-in, the host-picked answer time (3–30 s) and gap
  (3/5/10 s or host taps Next), answers accepted to **deadline + 500 ms** on the host clock, client ms trusted only if
  ≤ host-measured + 300, early end when every connected non-late player has answered, streak bonus, partial-credit
  formats, mc/tf re-checked, kids = flat 100 and a 20 s default, long-format minimum times, late joiners from the next
  question, and dedupe of names ("Sam 2").
- **Vote to reveal more:** this matches S's final shape (no separate messages: state fields + `vote(code,key,q)` returning
  state; runner wiring unchanged) and the server exactly (rooms.go `voteNeed/setStage/checkVotes/vote`). Needed =
  connected players who joined before this question and haven't answered. When all of them have voted, the stage goes
  up and the deadline becomes `min(start + 90 s, max(deadline, now + max(5 s, answer/2)))`. The initial deadline is
  `max(limit, 10 s, answer × 1.5)`. The first answer locks voting. Points use the stage multiplier `1 − 0.6·stage/(N−1)`,
  scored against the initial limit. In kids rooms the stage auto-advances every 4 s. The state carries
  `stage, stages, votes, needed, locked`, plus `you.voted` and `you.stage`, and `limitMs` follows the extended
  deadline. A refused vote is a 409, which room.js ignores silently.
- **Clocks:** joiners sync to the host clock with `time` pings (lowest-RTT sample, re-pinged every 4 s), so the
  runner's `now()` and deadlines are host time, just as they are server time in server rooms.
- **Joiner refresh/rejoin:** the seat (`clued.room.CODE` with `via:'p2p'`) is in sessionStorage. room.js keeps `?p2p=CODE`
  in the URL. After a refresh, A's `route()` goes to the join screen with `via:'p2p'`, which rejoins silently by key.
  A dropped channel stays "online" for 6 s, then stops holding up early-end and votes.
- **Host refresh:** every second the host saves a snapshot to sessionStorage. A host reload within 2 min restores the room,
  reclaims the same peer id (`pagehide` destroys the old peer; broker/id failures retry for 45 s) and joiners reconnect on their own.
  The `beforeunload` prompt only shows while other players are in a running game.
- **Host leaves:** the room closes and every joiner gets a final state (podium, plus "The host closed the room"). If the host
  just vanishes (closed tab, phone asleep), joiners retry for 75 s and then end on the last known scores
  ("Lost the host's device"), rather than showing a dead screen.
- **Keeping the host alive:** a Screen Wake Lock is held while hosting. The lobby shows a "Hosting from this device… keep it
  open and on screen" note. On returning from the background after ≥ 3 s, a toast warns that players may have dropped.

## Entry points and edits to other lanes' files (minimal, all marked)
- **A `js/main.js` `route()`:** adds `p2p` beside `join`/`c` (read the param, strip it, call `net.openP2P`). 4 lines.
- **S `js/net/index.js`:** `import './p2p.js'` (registers the transport + `fallback.host`), `openP2P(code)`, and
  `?p2p=` in `routeFromUrl()`.
- **S `js/net/join.js`:**
  - the join screen takes `via` and uses `getTransport(via)` for peek/join/seat;
  - a server `room_not_found` retries as a device room, so a typed code works for both;
  - the host screen takes `via:'p2p'` (title "Host from this device", device note, no Public/start options, no server status);
  - the Online hub gets **"📡 Host from this device (no server)"** under "Host a game".
- **S `js/net/room.js`:**
  - `setQuery('p2p'|'join')` by `via`, and the share URL is `p2pUrl` for p2p;
  - the lobby gets `T.lobbyNote` (the host/joiner note) and a "📡 Device room" badge instead of Private/Public;
  - the final screen says "The host closed the room" when `st.closed`;
  - the leave confirm tells the host that the game ends for everyone.
- **S `js/net/util.js`** `setQuery` also clears `p2p`. **S `js/net/share.js`** adds `p2pUrl`.
- S's "Host from your device instead" hook (busy/paused refusals) now works: `fallback.host(opts)` creates a device
  room from the already-prepared create body and opens it.
- On the Pages origin both are offered (server rooms through the cross-origin API, and device rooms). On br8t the same.

## Testing
- `node tools/p2p_test.mjs` → 96 passed. Falsified by setting the grace to 0, removing the first-answer lock,
  breaking the stage extension, or never letting a dropped player go offline: each makes it fail.
- `node tools/p2p_rate.mjs [N] [--mdns]`: connection success rate and time through the real broker (2 Chromes, 9411/9412).
- `node tools/p2p_e2e.mjs [--shots DIR] [--peerhost host:port] [--mdns]`. It needs internet. The flow:
  - the host creates through real clicks (Online → Host from this device → mc → 15 s/3 s), and two joiners open the `?p2p=` link;
  - 10 questions with a joiner refresh at Q2 and a host refresh at Q3, then a silent player on the last question;
  - all screens must show identical final scores;
  - Play again with a 3-stage question: vote counts shown, all vote → stage 1 together, the first answer locks, stage-scored points;
  - the host leaves → both joiners see the final podium.
  Screenshots are portrait, plus the lobby in landscape and on desktop.

## Reliability notes (measured 2026-10-05, one Mac, home NAT, real 0.peerjs.com broker)
- `node tools/p2p_rate.mjs 20`: **20/20 connected (100 %)**, median 3.3 s, max 6.5 s from a fresh page + peer to the
  first RPC answer. Host registration with the broker took 1.2–8.9 s, and the slow end was while the machine was at
  load average 40–57 from other lanes' tests. Opening a share link to reaching the join form took 7–13 s, including the
  game's own boot.
- The full e2e passes: **39/39 (run5)**. In the e2e the host refresh took 20 s until *joiners* were back, because a joiner that
  hits the host mid-restart can wait out its 15 s connect timeout before retrying. A shorter reconnect timeout is a possible tweak.
- **Host refresh:** the room comes back with the same code, seats and scores. At first this took 22–29 s, because the
  broker still held the old id, and a broker hiccup during resume could lose the seat. Now the host destroys its peer
  on `pagehide` (the id frees at once) and retries broker/id failures for up to 45 s. A 6-reload probe came back in
  **0.9–5.1 s every time**. Joiners reconnect by themselves.
- **mDNS finding (important):** with Chrome's default mDNS-hidden local IPs (`--mdns`), two headless instances on the
  same machine connected **0/10**. Both had a STUN srflx candidate (the public IP), but this router doesn't hairpin,
  and the headless instances don't resolve each other's `.local` names. The test therefore runs with
  `--disable-features=WebRtcHideLocalIpsWithMdns`. For real players:
  - **Same Wi-Fi:** this relies on mDNS host candidates. Normal Chrome, Android and iOS Safari resolve these on a LAN.
  - **Guest or "client isolation" Wi-Fi without hairpin NAT:** this will fail with the `no_direct` message, which
    suggests switching one device to mobile data.
  - **Different networks:** these connect through STUN srflx unless both ends are symmetric NAT.
- Without TURN, the pairs that fail are symmetric NAT on both ends (some mobile carriers, CGNAT, strict corporate or school
  networks). Commonly quoted STUN-only success rates are around 80–90 % of pairs. We couldn't measure across real
  carriers or phones here: **Aaron, a two-phone test (same Wi-Fi, then one on 4G) is the remaining check.**
- Mobile browsers suspend background tabs within seconds to minutes. A backgrounded host freezes the room until it returns
  (the deadlines keep running, so questions may time out). Joiners keep retrying for 75 s and then end on the last scores.
  The wake lock and warnings reduce this but don't solve it.

## Limits
- 8 players (`MAX_PLAYERS`). A data channel per player from one tab is fine at this size.
- No public listing, no host handover (the host *is* the server), and no profanity filter (private, family games; the host can kick).
- Anti-cheat is the same trust level as the server, and a little weaker: the host could edit their own tab. That is fine among friends.
- The room lives only as long as the host tab (plus a 2 min refresh window).

## Requests
- **S:** please keep the small P2P hooks in room.js/join.js/util.js/share.js listed above when you edit those files, and
  update the `vote` line in transport.js if its return shape changes (P2P returns room state, like the server).
- **A:** `route()` now handles `?p2p=`. If you rework routing, keep `p2p` → `net.openP2P(code)`.
- **Manager:** commit `js/vendor/peerjs.js` (87 KB, MIT header kept). No server deploy is needed for this lane.
- **Later (optional):** a TURN relay would close the NAT gap, but needs a server or a paid service. `?peerhost=host:port`
  already lets a self-hosted PeerJS server replace the cloud broker if 0.peerjs.com ever becomes unreliable.

> **2026-10-08 (SIMPLE.md):** P2PRoom mirrors the server change: no voting from the current client; stages auto-advance on the `autoStages` schedule for everyone, the deadline stays fixed (kids keep the 4 s + extension rule), answers don't lock; the `vote` op stays for old clients. p2p_e2e `--ports` added.
