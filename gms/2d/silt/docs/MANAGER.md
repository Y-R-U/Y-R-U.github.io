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
| P6 | ALCHEMY levels (107, all validated) | **done** |
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

- `hourglass.until` and `alchemy.left` are SECONDS, not ticks, and neither is in
  CONTRACTS.md. The HUD renders them as seconds.
- `alchemy.stars` is the count earned, not the thresholds, so `js/ui/modehud.js`
  reaches into `levelById` to show which star is still on offer. The mode
  publishing them would remove that reach-in.
- ALCHEMY tops out as often as it times out. The result card names both, but
  whether that is the intended fail mix is a balance question.
- **Three slag levels are tight on the CLOCK, not the target**: ids 17, 20 and
  42 have a median completion of 86-99% of their limit, and 20 is in act I. The
  HEADROOM rule cannot see them — a purge target is a level to reduce TO, so its
  margin is structurally 0.6 of progress and the tightness lives in `limitS`.
  A human is likely faster than the bot at a purge, so this is a playtest
  question before it is a generator question. If it needs fixing, the rule
  belongs in the same acceptance path and the lever is `limitS`.
- **Quench is down to 4 levels.** Six of its seven were rejected for no
  headroom, correctly: crystal saturates at 32-38 against a floor of 32, because
  crystal permanently seals the lava body that makes it. Quench needs a
  different objective, not a different number.
- The cool tint reads slightly greener in flight than settled. With three tints
  and one cool, the mapping stays unambiguous.
- ZEN and FLOW/JELLY share a HUD shape by declaration, not by accident.

## Next session

Playtest first, then tune. The build has never been played by a human — every
balance number in here comes from the bot, which is a proxy and not a player.
