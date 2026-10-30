# battle-1 notes — Fantasy + Halloween battle (capture) animations

## Done
- `js/themes/fantasy/battles.js` — 4 battles (+ type-biased variants via `.only/.weight`):
  - **arcane** — levitate + charge orb, side-coloured lightning, victim shatters into crystal
    shards (instanced) in its own colours. Bias: bishops/queens.
  - **clash** — 2 blade exchanges (sparks, flash, ground ring), sweeping slash arc, victim
    tumbles off the board edge. Knights gallop in; pawns shoulder-shove (no slash). Bias: n r p k.
  - **dragon** — fire breath (blue-white arcane flame for white, red-orange for black), victim
    chars black, crumbles to ash + embers, scorch decal. Bias: knights/king.
  - **smite** — rune circle locks on; holy light pillar (white) or flaming meteor (black);
    explosion, debris, shake. Bias: queens/king.
- `js/themes/halloween/battles.js` — 4 battles (+ variants):
  - **grave** — glowing grave opens, 4 bony hands drag the victim down spinning, tombstone pops
    up, attacker stomps it flat. Bias: crypt tower / king.
  - **bats** — swarm (instanced, flapping) bursts from the attacker, vortex around the victim,
    lifts it and carries it off the board edge. Bias: countess / nightmare.
  - **possession** — ghost rises from the attacker, swoops in a loop, dives in; victim shudders,
    glows, stretches into wisps. Bias: witch / countess.
  - **pumpkin** — lit pumpkin bomb lobbed with sparking fuse, bounces, explodes into seeds +
    side-coloured goo; victim blown sky-high. Bias: imp / Pumpkin King.
- `js/themes/battle_util.js` (new, shared): timing/cap (`prep`), pools, sim helper, `finish`.
- index.js in each theme: one import line + `battleAnims` (surgical).
- `tools/battle_cdp.mjs` — CDP harness (port 9519), `BT.battle/done/stats/stress` helpers.

## Timing (measured, gallery playground)
| | 1× | 2× | 5× | cap 1.2 s @1× / @2× |
|---|---|---|---|---|
| fantasy arcane / clash / dragon / smite | 2.23–2.46 s | 1.15–1.23 s | 0.33–0.40 s | 0.96–1.06 / 0.80–0.88 s |
| halloween grave / bats / possession / pumpkin | 2.31–2.48 s | 1.18–1.26 s | 0.36–0.40 s | 1.02–1.05 / 0.86–0.90 s |
`prep(ctx, measuredMs, target=2400)` scales every tween so the battle lands on ~2.4 s at 1×.
**D24**: if ctx carries `capMs` / `battleCapMs` / `timedCap` (or `online && timed`) the battle is
time-compressed to fit the cap in real time at the current speed and camera focus is skipped.
Tap-to-skip: all motion is ctx.tween/wait; pooled objects are parked in `finally`.

## Performance
- No shader compiles mid-battle: `renderer.info.programs` stays constant through 60+ battles.
  Pool objects (per FX group, shared module-level geometry/materials) are created by a
  `kit.addFxWarmup` hook inside `createFX`, parked off-frustum (or InstancedMesh count 0), so
  the board's `compileAsync` on theme load builds their programs. Kit's own flash/ring/bolt/
  scorch/tint material variants are warmed the same way.
- Stress (30 battles @2× incl. 4 skips, then 30 @5×, 360×740 mobile): scene children / node
  count constant, geometries/textures flat across the second 30 (first-run growth = first
  uploads), p99 frame 17 ms, worst 33–67 ms, console clean. One unreproduced 333 ms frame on the
  very first Halloween battle of one run (3 reruns: worst 17–33 ms).

## How to test
`~/.claude/bin/cdp start --port 9519 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist`
`CDP_PORT=9519 node tools/battle_cdp.mjs <outDir> <spec.json>` — e.g. eval
`BT.battle({fen, move:'Bxe5', anim:'arcane', speed:0.25, view:'top', cap:1200})`, shots via
`evalWait`, `BT.done()`, `BT.stress(30, 2)`. Manually: gallery `?theme=fantasy&mode=play`, Capture!.

## Requests
- **board**: pass the D24 cap into the battle ctx (`ctx.capMs = 1200` in online timed games) so
  anims compress gracefully instead of being cut by online_game.js's 1.2 s `board.skip()`.
- **kit (done here, marked battle-1)**: `addFxWarmup`, `parkFX`, `PARK`, `warmFX` in createFX.
  Board agent may want to adopt/rename. Further kit idea: pool flash/ring/bolt/scorch meshes
  instead of new material+geometry per call (GC only; programs are now warm).
- **kit**: `fadeOut` on a piece flips `transparent` → new program variant (mid-battle compile);
  my battles avoid it (shrink/sink/char instead). Consider warming that variant or documenting.

## Open issues
- White-side ghost (possession) reads mostly as a glow from Top on cream squares.
- Additive FX (bolts, slash) wash out a bit on the light squares from overhead; rings/flashes
  and board tints carry the side colour.
