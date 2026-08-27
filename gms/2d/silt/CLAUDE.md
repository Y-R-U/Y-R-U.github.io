# SILT

A mobile-first falling-sand puzzle. Drop single-coloured pieces, they shatter
into grains, the sand flows — and when one colour reaches from the left wall to
the right wall the whole chain dissolves.

**Read these first, in this order:**
1. `docs/MANAGER.md` — phase state, lanes, how to run the gates
2. `docs/CONTRACTS.md` — frozen module interfaces
3. `docs/DECISIONS.md` — the decisions that would otherwise be re-litigated
4. `docs/HANDOFF.md` — append-only log; the most current truth lives here

## The rules of this codebase

- **Vanilla JS + WebGL2. No build step, no CDN, no dependencies, no importmap.**
  With nothing to fetch there is nothing to hang on a failed fetch.
- **The sim is CPU, the renderer is GPU, and the renderer is a pure function of
  the grid.** Never let gameplay read from the renderer.
- **Anything that mutates a cell goes through `grid.set` or `grid.swap`**, or the
  dirty-chunk scheduler never wakes it and the sand freezes in mid-air.
- **All randomness in `js/sim/**` goes through the injected rng.** Determinism is
  what makes daily seeds, replays and the node oracle possible. Never
  `Math.random()` below `js/sim/`.
- **Scoring lives in the mode, not the engine.** `js/modes/score.js` diffs
  `world.score` across a tick and replaces the engine's own award, so it cannot
  rot when `world.tick` is retuned.

## Gates

```
node tools/sim.mjs                 mass, ledger, determinism, play (drives the SHIPPING mode), perf
node tools/jellysim.mjs            blob ledger, merge, split, wobble, reactions
node tools/modesim.mjs             per-mode balance + ALCHEMY level validation
node tools/boot.mjs                boot + soak on a true 390x844 viewport
node tools/gfx_shot.mjs --check    v-flip regression
node tools/uishot.mjs --probe      real button clicks
```

**Every gate has a `--break` / `--falsify` arm, and each one is proven to go
red.** Do not trust a gate you have not seen fail — the boot gate's first
falsification arm assigned to `window.__state`, which is an accessor property,
so the assignment silently did nothing and all eight checks stayed green against
a deliberately broken page.

## Traps already paid for

- **Page.captureScreenshot hangs forever** — no error, no timeout — on an
  animating WebGL canvas under headless. Capture via `canvas.toDataURL`, which is
  why `?preserve=1` exists. Always pass `?dpr=1` headless.
- **The V-flip convention is fixed in ONE place**: `RESOLVE_FS` in
  `js/gfx/shaders/field.js`. There is no `UNPACK_FLIP_Y_WEBGL` anywhere. Do not
  add a second flip.
- **A wall-to-wall band of one tint IS a chain** and clears on the first tick.
  Anything seeding such a board needs `step()` directly, mixed tints, or the
  brine tints 4-7 that no piece can match.
- **4+ tints kills the game.** See D3 — it is percolation maths, not tuning.
- **Headless Chrome has no audio output device**, so a real-time AudioContext
  advances ~5 ms then suspends. Verify audio through an OfflineAudioContext.

## Test hooks

`?auto` bot plays · `?mode=` · `?seed=` · `?q=high|low` · `?preserve=1` · `?dpr=1`
`window.__state` (lazy getter, never stale) · `window.__game`
Under `?auto` the account layer is never imported, so soak runs stay hermetic.
