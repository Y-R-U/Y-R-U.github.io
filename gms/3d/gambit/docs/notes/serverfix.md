# serverfix — notes (2026-11-01)

Fixes for the adversarial server review. Tests: `server/review_test.go` (each finding; the
reviewer's original repros failed on the old code and pass on the new, except the squat repro,
which now stops at the per-IP cap by design).

## Fixed
1. **Stale token = unlimited (HIGH).** Payments (`ragdojo-payments/main.go authorize`) answers
   **401** to any missing/expired/invalid/anonymous bearer (404 unknown game, 503 DB). Now:
   `fbIdentity.Exp` is kept on the user (`TokExp`); gated actions by a payments user with a token
   expiring within 2 min, or one payments refused (401/403 → `tokBad`), fail `stale_token`.
   Spends: 401/403 → `spendStale` → the spend is **owed** (reserved in `pending`, `authNeeded`
   pushed, throttled 1/min) and resent on the next `auth`; a spend whose token is already stale
   is never sent. Passive parties (room host, seek partner, rematch partner) are not refused for
   a stale token (an offline Unlimited host always has one): their spend just waits as owed.
   Fail-open remains for network errors, 5xx and other unexpected statuses (404 = config error).
   net.js: `stale_token` → force-refresh token, `auth`, resend once; `authNeeded` → refresh;
   reconnects ask Firebase for a forced-fresh token (falls back to the cached one);
   `firebaseToken(true)` now really forces for signed-in users (auth.getIdToken() could not).
2. **Lobby squat (MEDIUM).** Rooms close when the host has been offline 60 s (Unlimited: 24 h,
   was never); rooms of offline hosts are not listed (still joinable by code); max 3 open public
   rooms per creator IP (`too_many_rooms`); per user it stays 2 rooms.
3. **peekRoom enumeration (MEDIUM).** peekRoom shares joinRoom's `join` bucket (60/10 min per
   uid) plus a new `joinip` bucket (200/10 min per IP, both join and peek). Codes are 6 chars
   (31^6); normCode still takes 5 (none survive a restart anyway). Client input allows 8.
4. **Sign-in doesn't upgrade the session (MEDIUM).** `auth` now applies the full identity
   (anon, admin, token), rewrites the players row (leaderboard eligibility), resets the payments
   cache and pushes `identity {you, allowance}`. net.js `_watchAuth` sends a fresh token when the
   account layer flips anon on the same uid; `identity` updates `net.me`; online.js re-renders.
5. **Phantom pending after restart (LOW).** `countGame` runs before `persist` at ply 2.
6. **Double-escaped toasts (LOW).** online_game.js toasts use the raw name (toast is textContent).
7. **Names (LOW).** Blank-looking runes (Hangul fillers, braille blank, variation selectors…)
   count as space; a name needs a letter/number/symbol; ≤ 2 combining marks per char; profanity
   check folds Cyrillic/Greek look-alikes, fullwidth and combining marks; whole words admin(s),
   administrator, moderator, mod(s), staff, official, gambit, br8t, sysop (+ leet) and "br8t"
   anywhere are refused.
- Certs: Google unreachable with an expired cache → keep the old certs, retry in 1 min.
- Timeout rule (`CanMate`): FIDE 6.9 with helpmates (K+N vs K+P, K+N+N vs K, K+B vs K+B
  opposite colours = win on time; K, K+N, K+B vs bare K or same-colour bishops only = draw).
- `ratings`, `leaderboard`, `rename` DB work runs outside the hub lock.
- `tools/online_cdp.mjs`: `--server=<base>` and `--ports=A,B` to test a scratch instance.

## Verified
`server/test.sh` all pass, `go test -race` clean, `tools/server_net_test.mjs` and
`online_cdp.mjs quick|friend|allowance` all pass vs a scratch instance on :8196 (fake allowance);
:8094 rebuilt + kickstarted, health ok.

## Deploy notes
- No DB schema change. In-memory only: owed spends (a restart forgives them).
- Users will see: 6-char room codes; offline hosts' rooms gone from the lobby; some names now
  refused (existing stored names are not re-checked); rare "your sign-in needs refreshing"
  if a token refresh fails twice; flags vs a lone minor piece + pawns now lose instead of draw.
- If payments ever 401s valid tokens (misconfigured project), signed-in players are blocked
  (fail closed) — that is deliberate now.

## Open (not done)
- Rating farming / collusion detection.
- Per-IP limits treat each IPv6 address separately (no /64 grouping).
- Owed spends are not persisted.
