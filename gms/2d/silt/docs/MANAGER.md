# SILT — manager state

Mobile-first falling-sand puzzle. `/gms/2d/silt/`. Vanilla JS + WebGL2, no build
step, no CDN, no dependencies.

**Read order:** this file -> `CONTRACTS.md` (frozen interfaces) -> `DECISIONS.md`
-> `HANDOFF.md` (append-only, most current truth).

## Phase state

| Phase | What | State |
|---|---|---|
| P0 | Skeleton, viewport, input, main.js, test hooks, boot gate | **done** |
| P1 | Sim core: grid, materials, chunks, step, clears, pieces, bot, oracle | **done** |
| P2 | WebGL2 density-field renderer | **done** |
| P3 | FLOW playable and balanced | **done** |
| P4 | Jelly soft-body, TIDE, JELLY LAB | **done** |
| P5 | Reactions, HOURGLASS, ZEN | **done** |
| P6 | ALCHEMY levels (3 authored + 118 generated, all validated) | **done** |
| P7 | Shell, attract screen, audio, ship | **done** |

## Lanes

| Lane | Owns | Status |
|---|---|---|
| manager | `js/main.js`, `js/core/**`, `js/sim/{grid,step,clears,pieces,world,materials}.js`, `tools/{sim,boot,cdp}.mjs`, `docs/**`, git | P0+P1 done |
| A renderer | `js/gfx/**`, `dev/gfx.html`, `tools/gfx_shot.mjs` | **done** |
| B shell/ui | `index.html`, `css/**`, `js/ui/**` | **done** |
| C modes | `js/modes/**`, `js/data/**`, `tools/modesim.mjs` | **done** |
| D jelly | `js/sim/blobs.js`, `js/sim/reactions.js`, `tools/jellysim.mjs` | **done** |
| E audio | `js/audio/**`, `assets/audio/**` | **done** |

## Gates

```
node tools/sim.mjs                    sim oracle: mass, ledger, determinism, play, perf
node tools/sim.mjs --break ledger     falsification arm (also: rng, clears, mass)
node tools/boot.mjs                   boot + soak on a true 390x844 viewport
node tools/boot.mjs --falsify boot    also: freeze, error
node tools/boot.mjs --gpu             the only honest timings
```

All green as of P1. `tools/sim.mjs` reports 0.25 ms/tick against a 4 ms budget.

## Shipped

Listed in `projects.js` with `wip: true`, screenshot at
`assets/screenshots/silt.jpg`. Added to the games.br8t.com hub as `soon: true`
with its path already in `games/deploy.sh`, so bringing it across is a one-line
change once it has actually been played. That hub is curated and three finished
games are held back for the same reason.

`js/core/debugdraw.js` is retained deliberately: it is the Canvas2D fallback
`main.js` uses only when `js/gfx/renderer.js` fails to load, and
`__state.placeholder` reports when it is live. It draws the pixel look this
project exists to avoid, so if a screenshot ever looks like cells, check that
flag first.

## Known open items

- `hourglass.until` is SECONDS, not ticks, and is not in CONTRACTS.md. The HUD
  renders it as seconds.
- **`alchemy.left` is PIECES**, not seconds — the mode has no clock any more.
  It publishes `left` / `budget` / `used` in pieces and `seconds` as wall-clock
  for information only. `starsFor(lv, used)` takes pieces; `lv.stars` is three
  piece counts, fewest last.
- `alchemy.stars` is the count earned, not the thresholds, so `js/ui/modehud.js`
  reaches into `levelById` to show which star is still on offer. The mode
  publishing them would remove that reach-in.
- ALCHEMY tops out as often as it times out. The result card names both, but
  whether that is the intended fail mix is a balance question.
- The clock-tight slag levels are moot: `limitS` no longer exists in ALCHEMY.
  Whether the same shape recurs in the piece budget is an open question for the
  regenerated table.
- **Quench is down to 2 levels**, and this is the FIFTH pass to record it.
  Sixteen candidates finish inside eight drops and twenty more cannot clear the
  crystal floor with headroom, because crystal permanently seals the lava body
  that makes it. The objective has to stop being "how much crystal" — it is not
  a number that needs tuning, and no further regeneration will fix it. The hand
  authored First Quench is currently carrying the whole archetype.
- **Browser gates must not share the machine with the sim fleet.** boot.mjs and
  gfx_shot came back red under six concurrent node sims — WebGL fell back to the
  placeholder tier — and both passed cleanly alone. A contention red there is
  indistinguishable from a real renderer regression.
- **Static scenery below three cells used to be invisible**, campaign-wide, not
  merely dim: see S+9 in HANDOFF. Any level whose difficulty was judged before
  2026-08-29 was judged with some of its obstacles unrendered.
- The cool tint reads slightly greener in flight than settled. With three tints
  and one cool, the mapping stays unambiguous.
- ZEN and FLOW/JELLY share a HUD shape by declaration, not by accident.

## Next session

Playtest first, then tune. The build has never been played by a human — every
balance number in here comes from the bot, which is a proxy and not a player.
