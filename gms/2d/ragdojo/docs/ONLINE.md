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
- **Matching**: by ping. The lobby shows a rough estimate; tapping a player opens the direct link
  and shows the **real** ping before both accept.
- Accounts: Firebase ID tokens verified credential-free (copy the approach of
  `~/cc/ionos/ragdojo-payments/idtoken.go`). Anonymous users may play friend links but don't
  appear on leaderboards **(default)**.

## Modes

1. **1v1 best of 3.** A player waits with their preferred game type; another can join them or
   invite them to theirs.
2. **Challenge a friend by link** (like Clued rooms). Same match code as 1v1.
3. **Last Man Standing**, up to 8. Countdown starts when 4 are waiting; joins allowed until it
   ends or 8 is reached. Master = best ping; if the master drops the match is void.
4. **Ghost fights (default: yes)**. When nobody is waiting, fight an AI using a real player's name
   and unlocked specials. Always labelled GHOST, never passed off as live, no ranked stats.
5. **Steal the Bandana** (CTF variant), 2–8: one golden bandana, holding it scores seconds, a hard
   hit knocks it loose. Later phase.
6. Later ideas: King of the Hill, 2v2 tag, daily-rule fights (low gravity / big heads / one-hit).

**Free allowance:** 3 online battles per day free (`BR8T_FREE_PER_DAY=ragdojo=3`, already in the
payment service), the Pass is unlimited. A best-of-3 or one Last Man Standing counts as one.
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
(Halloween skeletons, Christmas snow sheet, Easter egg hunt in arenas, origami week, comic week).

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
5. Steal the Bandana, other modes.

Nothing in this plan deploys to the br8t box without Aaron approving the named steps.
