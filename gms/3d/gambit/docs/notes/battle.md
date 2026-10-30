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

---
# battle-2 — BIG battles (Top-view spectacle) + Classic battles + kit FX housekeeping

## Done
- **Spectacle layer** in `js/themes/battle_util.js` (all themes use it):
  - `stage(c, body)` replaces `focus`: the camera pushes in on attacker+victim (zoom
    `clamp((dist+2.3)/8.4, 0.4, 0.86)` ≈ 2.5–3 squares for an adjacent capture) with a dramatic tilt
    (≈26° from Top, less from Tilt/3D), and a **fight spotlight** dims the board around the fight;
    afterwards focus eases to f=0, i.e. exactly the locked pose. Skipped when capped (D24) or at 5×.
  - `camTo` / `punch`: re-frame mid-fight (follow the victim, zoom kick on impact).
  - `slowmo(c)`: time-scale dip at impact (rate × 0.18 for ~130 ms real, ramps back by ~210 ms)
    via `ctx.tl.rate` — tweens, particles and debris all slow; restored in `finally` (skip-safe).
  - `impact(c, pos, o)`: the standard beat — flashes, shockwave across ~5 squares (dark outer ring
    + bright ring + fast ring + ground dust), board tint, coloured screen vignette, shake, debris
    thrown up toward the camera, zoom punch, slow-mo, sound.
  - `fling(c, V, dir)`: victim bounces across the board spinning (dust + ring + thud each bounce)
    and flies off the edge. `shards(c, V, colors)`: ~90–110 instanced shards up toward the camera.
  - `sound(c, name)`: audio agent's `sfx()` loaded with a dynamic `import('../audio/index.js')` at
    module load (so the first battle has it) and wrapped in try/catch: missing audio never throws.
    Every battle calls it at wind-up / travel / impact / aftermath (`whoosh, swing, clash, hit,
    zap, thunder, fire, roar, explosion, spell, laser, bats, wail, hex, poof, creak, pop, stone,
    topple, slide, stomp, thud`). `audioReady()` for tests.
- **Fantasy**: arcane = 3-bolt branching barrage under a rune circle, lifts + shatters (100 shards);
  clash = bigger exchanges, 3-square slash arc, fling; dragon = layered breath (smoke under-layer,
  flames, white core, embers), victim chars then bursts (ash shards + inferno + scorch); smite =
  2.5-square rune circle, beam / 2× meteor, explosion + victim blasted sky-high.
- **Halloween**: grave (bigger grave, 6 big hands, eruption shockwave, tombstone stomp impact),
  bats (40 bats, wisp tornado, camera follows the carry-off), possession (2.6× ghost, impact,
  victim bursts into wisps + shards), pumpkin (2× pumpkin, huge lob, impact + explosion, fling).
- **Classic** (`js/themes/classic/anims.js`, battle part rewritten, move anims untouched):
  `clash` (3 escalating clashes → fling), `topple` (teeter, topple, shatters like porcelain
  (gold/ivory) or obsidian (black chrome) — 110 shards), `duel` (gold-vs-chrome lightning beam
  struggle; the junction is driven into the victim; `.only` b/q/k variant), `stomp` (high leap,
  slam, flatten + shards + shockwave).
- **kit FX section** (`createFX` and helpers; surgical, nothing else in kit touched):
  - Pools for flash sprites (10), rings (10), lightning (4), scorches (6) — created in createFX,
    parked (so the theme-load compile builds them), reused; no material/geometry is created
    mid-battle any more. Lightning writes into a preallocated buffer (3000 verts/layer) and has a
    dark normal-blended under-ribbon + bright additive core (material groups) → reads on cream.
  - New: `fx.shockwave`, `fx.inferno` (layered fire with dark smoke under-layer), `fx.spotlight`
    (fight dim / vignette plane), `fx.vignette` (DOM coloured edge pulse), `ring({thick, dark,
    alpha})`, `lightning({branchP, dark, light, lightStrength, flashRadius})` (lights the board),
    `debris({size, upVar, life})` (bigger; bounces only on the board), `burst({flat})`.
    Particle caps 1600/900 → 3200/2000; debris 96 → 180. `explosion` is bigger and layered.
  - `kit.fadeOut` is now a dissolve that keeps the material (thin + stretch + flicker); no
    `transparent` flip → no mid-anim shader compile. (No current callers.)
  - battle-1's `addFxWarmup` / `parkFX` / `PARK` kept; `warmFX` now just runs the hooks (the
    pools replace its dummy warm meshes).
- `tools/battle_cdp.mjs`: `BT.raw(true)` → prep doesn't normalise (measure raw lengths).
  `globalThis.__BATTLE_RAW` is the only dev hook in prep.

## Timing (gallery, Top, 360×740; `prep(ctx, rawMs)` targets 2.5 s + slow-mo beat)
| | 1× | 2× | 5× | cap 1.2 s @1× / @2× |
|---|---|---|---|---|
| fantasy arcane / clash / dragon / smite | 2.68–2.96 s | 1.36–1.50 s | 0.35–0.40 s | 1.05–1.18 / 0.83–0.90 s |
| halloween grave / bats / possession / pumpkin | 2.60–2.73 s | 1.33–1.38 s | 0.35–0.38 s | 0.98–1.15 / 0.76–0.90 s |
| classic clash / topple / duel / stomp | 2.53–2.76 s | 1.31–1.43 s | 0.35–0.38 s | 0.96–1.06 / 0.75–0.88 s |
Stress (30 random battles incl. 4 skips, per theme, at 1×, 2× then 5×): 1× max 2.68–2.78 s.

## Perf (headless Chrome, ANGLE/Metal, 360×740 dpr 2)
- `renderer.info.programs` constant through every run (fantasy 30, halloween 32, classic 21):
  no mid-battle compiles. Scene children / nodes / geometries / textures flat after the first
  uses (first run = first uploads), across 90 battles per theme. p99 frame 17 ms, worst 17 ms
  in every stress run. Console clean.

## Verify
Strips/composites: scratchpad `battle2/final/` (`BA_*` = battle-1 top row vs battle-2 bottom row).
`~/.claude/bin/cdp start --port 9525 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist`;
`CDP_PORT=9525 node tools/battle_cdp.mjs <out> <spec.json>` — spec generators in the battle-2
scratchpad (`mk.py` strips, `mkt.py` timings).

## Open issues / ideas
- Holy smite's beam is still the brightest thing in the game from Top (toned down 25%).
- Spotlight dims the board's highlight overlays too during the fight (by design).

---
# battle-3 — Sci-fi battles ("Aegis vs Nova": cyan vs magenta)

## Done
- `js/themes/scifi/battles.js` (new) + one import line and `battleAnims` in `scifi/index.js`
  (sci-fi no longer falls back to Classic battles). No changes to battle_util.js or kit.js. All four
  use battle-2's layer (`stage` push-in + spotlight, `impact`, `slowmo`, `punch`, `camTo`, `fling`,
  `shards`, `sound`).
  - **strafe** — lift-off (thruster ring + wash), flies a pass across the victim with twin guns
    walking 14 side-coloured bolts over the deck and into it (ground hits: sparks/ring/smoke; body
    hits: flash, recoil, 3 **armour panels** blown off each), swings round, charges (motes sucked
    into the muzzle) and fires one fat bolt: impact + inferno + 22 panels + 90 shards.
  - **stomp** — crouch, jump-jets ignite (inferno in jet colours + smoke wash), launch to y 2.7
    toward the camera with an exhaust trail, slam down **beside** the victim: impact + **EMP
    hex dome** + second shockwave; the victim **short-circuits** (arcs crawl over it, its
    light-lines flicker via emissive, it shudders), then sags and glows orange, bursting into
    **glowing scrap** (shards + embers + panels + scorch). Attacker steps onto the square.
  - **orbital** — uplink sparkles, a **designator laser** paints the victim, a two-layer
    **targeting reticle** (ring + brackets, 3.4 squares wide) spins down and blinks locked, pilot
    beam, then the **beam slams in from the sky**: impact + explosion + **mushroom of light**
    (cap rising toward the camera, torus, stem) and the victim is flung sky-high off the board.
  - **tractor** — emitter flare, a striped scrolling **tractor cone** lifts the victim spinning
    toward the camera, a **force-field cube** closes and **crushes** it into a scrap cube (panel
    map + glowing seams in the victim's colours), slow-mo snap, the beam flicks the cube bouncing
    off the board, and the attacker **teleports** onto the square (column of light out / in).
- Weighting: Drone/Bastion → strafe (w3), Strider → stomp (w4), Psi Oracle/AI Core → tractor
  (w4), Commander → orbital (w4), rooks/kings may stomp, queens/rooks may orbital; every type also
  gets all four at weight 1. Stress pick counts over 90 random captures covered all 10 entries.
- Pooled FX (`U.definePool`, prefix `s.`): instanced lasers (halo+core, 72) + a dark
  under-ribbon (36, vertex alpha) so bolts read on pearl tiles, instanced armour plates (48),
  reticle, beam, mushroom, EMP dome (hex texture), tractor cone, force field, scrap cube. A battle
  only changes colours/opacity/map offset/transforms; everything is parked in `finally`.
  A small `runner()` integrates lasers/plates every frame on the battle timeline (skip-safe).

## Timing (gallery, Top, 360×740) — `prep` nominals = measured raw
| | 1× | 2× | 5× | cap 1.2 s @1× / @2× |
|---|---|---|---|---|
| strafe (w p / b p) | 2.51–2.56 s | 1.33–1.35 s | 0.38–0.40 s | 0.98–1.01 / 0.80 s |
| stomp (w n) | 2.68 s | 1.33 s | 0.35 s | 1.06 / 0.88 s |
| orbital (w k / b q) | 2.66–2.88 s | 1.35–1.46 s | 0.36–0.38 s | 1.05–1.08 / 0.85–0.86 s |
| tractor (w b) | 2.56 s | 1.33 s | 0.38 s | 1.03 / 0.79 s |
Stress 30 random @1×: 2.50–2.81 s (skips 0.25 s).

## Perf (headless Chrome ANGLE/Metal, 360×740 dpr 2)
- `programs` 35 before, during and after every run (Top and 3D view): no mid-battle compiles.
- 30 battles each at 1×, 2×, 5× (incl. 4 skips each): scene children 7, nodes 110,
  geometries 82, textures 19 identical before/after the 2× and 5× runs (1× = first uploads);
  worst frame 17 ms, p99 17 ms in all three. Console clean.

## Verify
Strips: scratchpad `battle3/final/` (`top_<anim>_<side+piece>.jpg` 10 frames at 0.25×, board
crop; `D3_*.jpg` 6 frames at 1440×900 Angle view). Spec generators `battle3/mk.py` (strips:
`python3 mk.py strafe:wp,orbital:bq top 360 740 1 <times>`), `mkt.py` (timings), `st.json`
(stress + pick counter). Chrome: `~/.claude/bin/cdp start --port 9532 -- --use-angle=metal
--use-gl=angle --ignore-gpu-blocklist`; `CDP_PORT=9532 node tools/battle_cdp.mjs <out> <spec>`.
Note: `BT.battle` with K vs K+N FENs reports "illegal" in the browser (probably the K-vs-K
insufficient-material end); add a pawn per side.

## Open issues
- Orbital impact is the brightest beat in the set (board washes cyan/magenta ~150 ms); toned
  down once (halo 0.7, cap 0.75, tint 0.18) — Aaron may want it even louder or quieter.
- The flung scrap cube is small from Top once it leaves the push-in frame.
- Sounds use the shared vocabulary (laser, zap, hit, explosion, stomp, thunder, fire, whoosh,
  topple, stone, poof); a dedicated scifi `emp` / `tractor hum` would suit (audio request).
