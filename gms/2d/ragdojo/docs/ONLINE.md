# RAGDOJO online arena + special events — design (2026-10-13)

Aaron's brief, plus the manager's defaults where he left a choice open. Defaults are marked
**(default)** and can be changed by Aaron without redesign.

## Netcode (locked)

- **Browser-hosted, like Snake-eee.** The server only introduces players. WebRTC data channels
  between browsers, ICE from the shared TURN relay (`gms/pwa/snake/SHARED_TURN.md`): the arena
  server fetches `http://127.0.0.1:8014/ice` and hands `iceServers` only to matched players.
  Handle `turn:false` (STUN only) and an unreachable 8014 (plain STUN). If no peer link forms,
  fall back to relaying through the arena server's WebSocket and say "slower connection".
- **The sim is NOT deterministic** (verlet ragdoll + `Math.random` in hazards/ai/fx), so no
  lockstep. **The master runs the real fight**; other clients send inputs (stick + gestures) and
  render the snapshots the master streams (11 ragdoll points per fighter + HP/state). Guests
  predict their own movement for feel.
- **Input-delay equalisation**: the master's own inputs are delayed by ~half the RTT, so hosting
  is not an advantage.
- **Master selection (1v1 best of 3)**: server coin flip picks round 1's master, round 2 swaps,
  round 3 goes to the player who lost round 2.
- **Results**: every client reports the outcome; stats only count when reports agree. Mismatch =
  void + logged. Hacking risk is accepted over bad ping (Aaron's call).
- **Matching**: by ping. Where the exact ping is not known yet, show **signal bars** (Aaron, 2026-10-13):
  5 green = good, 2-3 yellow = average, 1 red = bad. Once a direct link exists, show the measured
  ping in ms on the connect screen (and keep the bars beside it).
- **A master dropping must not kill the result** (Aaron: a losing master rage-quitting is the case
  to beat). 1v1: the leaver gets a short reconnect window (~10 s) with their fighter standing idle;
  no return = **forfeit loss**, never void. Last Man Standing / multi-player modes: **host migration** —
  the best-ping remaining client rebuilds the Match from the last snapshot and carries on; the
  leaver is eliminated. Running the JS sim in node on the server is a possible later fallback.
- Accounts: Firebase ID tokens verified credential-free (copy the approach of
  `~/cc/ionos/ragdojo-payments/idtoken.go`). Anonymous users may play friend links but don't
  appear on leaderboards **(default)**.

## Modes

1. **1v1 best of 3.** A player waits with their preferred game type; another can join them or
   invite them to theirs.
2. **Challenge a friend by link** (like Clued rooms). Same match code as 1v1.
3. **Last Man Standing**, up to 8. Countdown starts when 4 are waiting; joins allowed until it
   ends or 8 is reached. Master = best ping; if the master drops, host migration hands the fight to the best-ping remaining player (built 2026-10-13).
4. **Ghost fights (approved)**. Fight an AI using a real player's name and unlocked specials. The
   arena lists players' ghosts you can challenge any time, not only when nobody is waiting. Always
   labelled GHOST, never passed off as live, no ranked stats.
5. **Steal the Bandana** (capture the flag), 2–8: one golden bandana, holding it scores seconds, a
   hard hit knocks it loose. **Build now** (Aaron, 2026-10-13).
6. **King of the Hill**, 2–8: a paper ledge/zone; time standing on it alone scores. **Build now.**
7. Later ideas: 2v2 tag, daily-rule fights (low gravity / big heads / one-hit).

**Free allowance:** 3 online battles per day free, **10 per day with the A$1.99 supporter unlock**,
unlimited with the Pass (Aaron, 2026-10-13). The payment service's free-allowance API needs the
supporter tier added. A best-of-3 or one Last Man Standing counts as one.
Friend links count too **(default)**.

## Leaderboards (stats only)

Daily battles (any type), arena battles overall and per type, wins, losses, best win streak,
knockouts. Agreed results only. Typed display names with a profanity filter (reuse Clued's
approach).

## Special events

Limited time: daily / weekly / monthly. Points per battle: **1 = loss, 2 = loss but opponent
damaged > 50%, 3 = win.** Campaign fights count for events marked "any battle" **(default: some
events allow them, so free players can join in)**. Some events free, some Pass-only
**(default: the daily and weekly ones free, monthly/seasonal ones Pass)**.

### Picture reveal
5×5 grid over an image; spend points to uncover squares (player picks which). Bonus for
guessing the picture early. Completed image unlocks as an arena background (reward).

### Vines & Ladders (snakes and ladders)
- A stick man walks the board. Each battle banks its points as dice rolls.
- **Others** who played that day are shown, replayed only **up to your own turn count**: after
  each of your turns, everyone else advances to the same turn index (if they have played that
  many). Leave at turn 7, come back later, and others are still shown no further than turn 7.
- Dice are fixed per account + date + turn index (seeded, server-verifiable), so reloading can't
  re-roll.
- Show ~10 rivals: friends first, then nearest on the board.
- Alternate themes: Ink & Ladders, paper-ninja scrolls & ropes.

### Other event ideas
Community boss (everyone's damage vs one weekly HP bar), weekend bracket, seasonal themes
(Halloween monsters, Christmas snow sheet, Easter egg hunt in arenas, origami week, comic week).

### Event images
Generated with local Flux (`mflux-queue :7867`), **ink-on-paper** style to match the game.
Aaron reviews on an admin page (vpstats): 4 candidates per event, pick / regenerate / approve;
nothing goes live unapproved.

## Phases

1. Arena server + net layer + 1v1 best-of-3 + friend link + real ping + stats.  
   In parallel: event engine (pure logic + preview page) and first Flux image candidates.
2. Last Man Standing, ghost fights, leaderboards UI.
3. Event wiring in-game, picture reveal live, image review page.
4. Vines & Ladders live.
5. Steal the Bandana and King of the Hill (approved for now — right after the arena works), then other modes.

Aaron's go-ahead (2026-10-13): build the full list in order until usage runs out. His kids are
waiting for it.

Nothing in this plan deploys to the br8t box without Aaron approving the named steps.

## Home network play (Aaron, 2026-10-13)

Served from a `192.*` address (the family setup, like the purchase skip), the arena is fully
playable with no internet services: it uses an arena server running on that LAN machine,
peers connect directly on LAN candidates (no TURN), no sign-in, no daily limit, and stats stay
in the local server's own database. A start script launches site + arena server on the LAN.
LAN results may later upload to the production stats under the player's account (Aaron: fine,
low priority, whenever): the local DB keeps an optional uid + an uploaded flag per result.

**LAN results upload (hook only, not built).** `server/lan.sh` runs the arena with `ARENA_LAN=1`.
Every agreed LAN result is a row in that server's `lan_results` (match, device id, optional
`firebase_uid`, name, type, won, KOs, forfeit, `uploaded`). A device becomes linked when its
hello carries `link` = a Firebase ID token (`hub.linkAccount` → `store.linkDevice`); the LAN page
does not send one yet, because the account layer only loads on games.br8t.com. A later job calls
`store.uploadLanResults(n)`, which returns linked, un-uploaded rows plus a `mark` function: POST
the batch to a new production endpoint (not built) that adds them to that account's arena stats
only — never to daily battles, allowance or free-limit counts — then call `mark()`. Batched, run
whenever convenient; re-sending a match id must be idempotent on the production side.

## Server rules added after the hostile reviews (F1, 2026-10-13)

Wire additions (client → server unless noted):

| message | meaning |
|---|---|
| `{t:"stall", match, ms}` | a guest has had no master snapshot for `ms` (sent after 3 s, every 2 s while it lasts; `ms:0` = recovered). Counted when ms ≥ 2000, fresh for 3 s. A strict majority of the other seats in play = the master is away NOW: a room eliminates it (`out` why `stall`) and hands over; a 1v1 starts its away grace. |
| `{t:"rematch", match, tok}` | a rematch pays with this fresh token; without one a ranked rematch is cancelled (`signin`). |
| WS close code **4001** | the page hid its tab on purpose: a deliberate away. A room master hands over at once (`out` why `away`); a 1v1 seat's grace starts as usual. |
| server → `result` | a 1v1 forfeit also carries `by` (the seat that forfeited) and `why`: `left`, `gone`, `silent`, `lagging`, or `stall` (the guest quit after ≥10 s of its stall reports: the MASTER forfeits). |
| server → `err` / `cancel` | new codes/reasons: `signin` (a ranked seat without its own verified token, or a payment-service 4xx), `slow` (name/wait/unwait or failed joins too fast). |

Rules: no pong for 8 s (two pings) = away (same path as a closed socket); no `hello` in 10 s =
dropped; a room master migrates after 5 s of WebSocket downtime (a shorter blip is not a
hand-over) or at once on a stall majority / 4001. At the report timeout every seat with no
report forfeits (1v1) or is out (rooms) and the rest finish with what they agree on; each
round also has a hard deadline (3 min duel, 5 min room). Room reports are compared only on the
seats still in at the first report, and a winner who leaves after it does not void. A
disagreement is a per-account dispute; an account with a record of them loses its next
disputed match and is hidden from the boards. Forfeits before the first agreed round (rooms:
the first 10 s) pay the stayer nothing; one pair of accounts counts at most 3 results a day.
