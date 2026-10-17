# DECADES: "Music through the decades" + e2e tools on a local server (2026-10-17)

## Suggested set
- `js/net/suggested.js`: `{ id: 'decades', name: 'Music through the decades' }`, listed after Music Night. Seven listen
  rounds, "1960s hits" → "2020s hits", each on its own `hits-<decade>` pack with Music Night's `LISTEN` opts
  (10 s clip, artwork off, ask Mix, 4 answers) and 15 s answers / 5 s gap.
- 8 questions a round (56 in all) so it runs like Music Night (55). In a room a listen question takes at most
  answer + gap = 20 s, plus 5 s for each round card: 56 × 20 + 7 × 5 ≈ 19 min at most. Music Night works out at
  about 20 min (its hat-trick questions get an extra 10 s each).
- `js/audio/listen.js`: a round on a single `hits-<decade>` pack with ask Mix never asks "Which decade is this song
  from?" because the round title already says. It asks title (weight 6) or artist (weight 3) instead. Mixed-decade
  rounds are unchanged. (Some hits packs hold songs tagged with the decade before, so a decade question there could
  even contradict the title.)
- Removing rounds was already one tap: every round card has ✕ (no confirm; disabled only on the last round). ▲/▼ swap
  neighbours and the numbering redraws. Nothing changed in the round builder.
- Tests: `tools/suggest_test.mjs` checks the set's shape and order, that its rounds build, that 500+ decade-round
  questions contain no decade asks, and that Music Night's mixed round still does. Proven to fail: with the listen.js
  change reverted it fails 1 check. `tools/suggest_e2e.mjs` covers the set at 390x844: 7 rounds in order, ✕ removes
  a round in one tap, ▲/▼, renumbering, the summary line, and the disabled ✕ on the last round. The suggestion count
  now comes from `SUGGESTED.length`; the hardcoded 7 was already stale at 8.

## e2e tools never touch the production API
- `tools/lib/localserver.mjs`: `startLocalServer({ env, origins, tag })` builds `server/`, starts it on a free port
  with an empty temp data dir, and drops inherited `CLUED_*` env, so allowance stays off. It returns
  `{ api, query, stop }`, and stop also runs on process exit. `blockProd(send)` blocks
  `games.br8t.com/gms/2d/clued/api*` and `/api/br8t/*` through CDP, so a missed `?api=` fails instead of reaching
  production (verified: the home page's two live calls show as blocked, reason "inspector").
- Converted (local server + `?api=` + blockProd): p2p_e2e, rounds_p2p_e2e, local_e2e, suggest_e2e, sets_e2e,
  p2p_rate. hostname_e2e now uses the helper in place of its inline copy.
- Already on their own local server (left as is): allowance, pickall, s_room, s_public, s_challenge, stats_room, trio,
  dbg, applepx.
- Still reaching production read-only: every other CDP tool that loads the page without `?api=` (a_e2e, stats_e2e,
  screen_e2e, fav/fresh/diffmix/l/f/rec/hide e2es…). Home calls `rooms.listPublic()` and listen uses the Apple
  preview proxy. They don't host, so they spend no allowance. To cover them, call `blockProd` in `a_cdp.mjs open()`
  (and add `?api=` where listen audio needs the proxy).
- No allowance bypass, test pass or gift code was added anywhere.
