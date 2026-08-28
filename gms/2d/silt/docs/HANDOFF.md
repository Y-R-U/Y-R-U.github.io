# SILT — handoff log

Append-only. Newest at the bottom.

## P0+P1 (manager)
Sim core, bot, oracle, boot gate, main.js integration seam all landed and green.
Key finding is D3 in DECISIONS.md: the clear mechanic only works at 3 tints with
mono-coloured pieces, and that is percolation maths rather than tuning.

## Checkpoint 1 (manager)
Committed and pushed as 5e4a625. Deliberately NOT in projects.js yet — the card
screenshot is the game's first impression and must come from the real renderer.

## Lane E audio — done
Six procedural Web Audio cues (land/chain/dissolve/rotate/drop/fail) built from
noise grains, pitch-glided blips and resonant sweeps through a shared generated
reverb. Magnitude is real, not just volume: a 2000-cell chain measurably
outweighs a 200-cell one.

Four SUNO beds (dune/abyss/kiln/zen), cut into seamless loops by crossfading each
segment's head onto its own tail, loudness-matched to -20 LUFS so biomes do not
jump. Compressed mono 64kbps/32kHz: 14.57 MB -> 1.72 MB (12.4%).

Two gotchas recorded by that lane, worth keeping:
- Headless Chrome has no output device, so a real-time AudioContext advances
  ~5 ms then suspends. The engine takes an injected context so it can be verified
  through an OfflineAudioContext instead.
- The visibility handler ramps master to 0 on document.hidden. If a mode ever
  wants audio to continue backgrounded, that is the line to change.

## Cloud save (manager)
js/cloud.js wired to /lib/auth/localsync.js over silt.best / silt.settings /
silt.stats only — never board state. canPester is false while playing, so the
sign-in nudge only appears on attract, menus and results, and it is a callout
pill rather than a modal.

## Lane D jelly + reactions — done, wired by manager
Blobs are an area-preserving ellipse (a = R/q, b = R*q, so pi*a*b === n for every
q) rasterised each tick as the n nearest admissible cells. The rasteriser IS the
collision solver: cells inside terrain are not admissible, so a body moulds
around what it lands on and its centroid is pushed out. |target| = |current| = n
means entering and exiting cell counts are equal by construction, so blob motion
provably cannot move g.count.

Verified in a real 3000-tick JELLY world: 16 blobs, q spanning 0.34 at the bottom
(pancaked under overburden) to 0.89 at the top (resting), ledger exact throughout.

Reactions moved to a dense MAT_COUNT^2 table. The seven original rules are
byte-identical — independently confirmed here, because tools/sim.mjs produced the
exact same 12-game score (747473) after the swap.

Two bugs that lane's own gates caught, both worth remembering:
- One tick of gravity is 0.055 cell, BELOW lattice quantisation. A contact test
  of "asked to descend vs actually descended" therefore fires every tick for a
  symmetric blob and hangs it in mid-air. Fixed with a free-integrated position
  tethered to the rasterised centroid: sub-cell disagreement is quantisation,
  larger is contact.
- Load as a per-column average is wrong for a press — weight on 16 columns of a
  50-column pancake averages to nothing. It is total overburden vs body mass.

## Lane B shell — done
Attract screen, mode sheet, HUD, pause, results, settings, events. The SILT
wordmark is a thresholded noise mask over stroked SVG paths (no webfont, nothing
to fetch): a vertical grey ramp plus fractal noise through a slope-9 transfer, so
sliding the intercept makes grains land from above, hold, then blow away.
Controls are anchored to the letterboxed board rect mirrored into CSS vars, with
two deliberate exceptions found by screenshot — the bottom edge follows the safe
area rather than the board, and the column has a 430px floor.

## Integration bugs lane B found in the MANAGER's files, now fixed
1. onChain was passed world.lastChainSize (a NUMBER) where CONTRACTS.md section C
   and every mode expect `cells` (an ARRAY). A number is truthy, so
   `cells ? cells.length : ...` produced undefined, chainPoints(undefined) was
   NaN, and world.score stayed NaN for the rest of the run. Now passes
   clears.lastChain.slice() — sliced because that array is reused on the next
   detection. The play gate now also fails loudly if score goes non-finite.
2. AUDIO was local to main.js so the settings sliders could not reach it. Exposed
   as __game.audio, and saved volumes are applied at boot.
3. save.settings.quality was never read; ?q= now overrides it rather than
   replacing it.
4. Added __game.pour(x,y) so the attract-screen sand poke goes through the
   sanctioned grid.set path.
5. silt.lastmode added to SAVE_KEYS so the cloud layer mirrors it.

## Scoring lives in the mode, not the engine
score.js records the score each tick and REPLACES the engine's own award when a
chain fires, so there is no double count. Consequence: tools/sim.mjs was
measuring the engine's fallback formula and reported 747473 for work the real
FLOW mode scores at 276. The play gate now drives the shipping FLOW mode through
its real hooks; it reports 6.3 chains and ~1265 points per game over a 117s life.

## Renderer polish — done
Piece tint legibility was neither a palette nor a lighting bug but both. An
airborne piece is the only object in the scene with no occlusion beneath it, so
it takes the entire light rig at once and lands on the ACES shoulder where every
hue flattens toward cream — and dune's third tint was "bone", a warm grey of the
same hue as the key light. Measured: dune piece (211,184,138) vs abyss
(120,168,228).

Fixed with a third MRT carrying the piece's own tint (chosen over encoding
piece-ness in a spare bit: the negative-flash trick dies on the RGBA8 fallback
and the split-range trick breaks under bilinear filtering), plus airborne-specific
lighting that pushes chroma away from grey, pulls luma down off the shoulder and
rims the piece in its OWN hue rather than the key's. Palettes now separate by
HUE, not lightness — dune gold/vermilion/verdigris, kiln ember/quench/sulphur.
Kiln had the identical bug and was fixed too.

Dune's roof term is now negative so its light comes from above, and the red
corner smear was the key glow itself: retuned gold, tighter, and falling off
consistently with the key direction so it reads as sun over the lip.

It got FASTER despite the extra attachment — 3.48 -> 2.72 ms gpu p95 high tier —
because removing the old emissive "live piece" marker stops the piece region
entering the expensive fbm3 + vein-noise branch. Budget is 11 ms.

Gate note worth keeping: the flip gate first dropped 88.6% -> 70.6% after the
brighter backdrop, NOT a flip regression — animated haze and grain between the
two grabbed frames was diluting the diff. Pinning the renderer clock with ?t=
made captures bit-identical run to run, so image diffs mean something again.
Now 100.0%, mean row 852/900, and re-falsified after the change.

## Known nit, not a blocker
The cool tint reads green in flight and bluer once settled. With three tints and
only one cool, the mapping stays unambiguous, so it is polish rather than a
legibility failure.

## Lane C modes — done. It falsified the manager's TIDE fix.
My "make the rising tide untinted" instruction DOES NOT WORK, and lane C proved
it rather than implementing it: clears.detect() reads `t = tint[start]` with no
zero guard, so a wall-to-wall band of tint 0 spans and clears exactly like a
coloured one — and untinting makes it WORSE, one uniform body instead of a
mosaic. What ships is the same idea in an index the engine already honours:
brine tints 4-7, above the piece range, so no piece can ever match them. Four
rather than five because lane A's TINT_SLOTS is 8. Gate B2 checks this across
both lanes and `--break slots` proves it red.

D4 survives intact: TIDE's piece sequence is [SAND, SAND, WATER], so a dropped
blue water piece spreads sideways to finish a run of blue sand. Gated three ways
— bare tide flooding to the ceiling clears 0 chains; tint-1 water bridging
tint-1 sand clears 336 cells; the same board with mismatched water clears 0,
which is the control that stops the first two passing on a detector that clears
everything.

Balance after rebalancing FLOW from fallRate 22/0.55 (189s, 1.24M pts) to
34/0.9/max 120: FLOW 131s, TIDE 110s, JELLY 89s, HOURGLASS 120s, ALCHEMY 36s per
level, no stalls anywhere.

ALCHEMY ships 96 levels from 140 candidates (18 unreachable, 13 trivial, 13 too
few wins). The generator stopped guessing targets: it runs each level once with
an unreachable target, watches how far the bot gets, then sets the objective to
0.6 of that. Hand-set targets were wrong in both directions at once.

## Three sim findings from lane C, two fixed by the manager
1. FIXED: collides() treated gas as solid. The CA lets liquids sink through
   steam, but the piece is not in the grid, so a steam cap from quenching lava
   topped the board out within seconds. collides() now ignores KIND === GAS.
2. NOT FIXED, deliberately: HOURGLASS does not use the gravity vector. World
   .spawn always enters at the top and World.tick always moves the piece down,
   so under GRAV_UP the pile pours onto the ceiling and the next piece tops out.
   Measured: vector path 32.6s / 0.5 chains, rotate-180 path 158.6s / 10 chains.
   It ships as a 180-degree content rotation, which is a permutation so the
   ledger stays exact. HOURGLASS_CFG.useGravityVector flips it over the day
   piece spawn and fall follow world.grav. The rotation is arguably the better
   implementation anyway.
3. FIXED by lane C: world.combo only ever incremented, so it was a chain counter
   rather than a combo. score.js owns a real one with a 150-tick window and
   writes it back so the HUD stays honest.

## Host loop
main.js now delegates to the modes lane's stepMode(): world.tick -> onChain ->
onTick. onTick LAST is what lets the scorer diff world.score across a tick
boundary, so mode scoring cannot rot when the engine's own award is retuned.

## Lane B mode HUDs — done, and it found that EVERY MODE WAS DUNE
The biome system was dead. main.js read `mode.worldCfg.biome`, but modes declare
`biome` at the TOP level, so it resolved undefined and fell through to the
settings default — and it ran AFTER startMode, overwriting the api.biome() call
the mode had just made. Every mode rendered and played music as dune.

Fixed: biomeFor(mode) prefers an explicit player override and otherwise follows
the mode; applyBiome runs BEFORE startMode so a mode's own call wins; and
api.biome now drives music as well as the renderer. Settings biome default is
now 'auto' rather than 'dune'. VERIFIED per mode rather than assumed — tide now
renders abyss and alchemy renders kiln, where before both were dune.

quartz (HOURGLASS) and lumen (JELLY LAB) exist in js/data/biomes.js but not in
js/gfx/biomes.js, so they still fall back — applyBiome catches an unknown name
and falls back to dune rather than throwing. The renderer lane is adding both.

Also fixed from lane B's list:
- ALCHEMY win results: a completed level and a timed-out one showed the identical
  card. results() now carries won/stars/bestStars/alchemy, and a win records
  stars to save.
- ALCHEMY levels past 1 were unreachable — play() only ever passed {seed}. Level
  now flows through, __game.startLevel(n) exists, and per-level stars live in
  save.recordLevel/starsFor/unlockedUpTo. Stars only ever go up, so a replay
  cannot cost a rating already earned.
- __game.input exposed so the shell can use the sanctioned onPaint route.

Still open from lane B's report, for the modes lane if it is ever revisited:
hourglass.until and alchemy.left are SECONDS not ticks (undocumented in the
contract), and alchemy.stars is the earned count rather than the thresholds, so
modehud.js reaches into levelById to read them.

## Phone playtest pass (Aaron, 2026-08-28)
Six items from real device use. Five fixed here, jelly width with the modes lane.

THE BOARD RECT WAS COMPUTED TWICE. js/core/viewport.js fitted it inside the safe
area with a top bias; js/gfx/renderer.js independently fitted the whole canvas
with a 0.985 shrink. Measured at 390x844: FLOW viewport {0, 22.4, 390x780} vs
renderer {2.9, 37.9, 384.1x768.3} — a ~16px vertical offset. Input converts
touches through the VIEWPORT rect, so every touch was off from what was drawn
(worst in ZEN painting), and the shell's controls framed a board the renderer
did not draw. view.board is now the single source of truth and opts.view is a
REQUIRED renderer input, recorded in CONTRACTS.md section A.

The new gate fills every cell, finds each drawn edge from the row/column diff
plateau, and asserts it matches view.board within 2px — at TWO viewport shapes,
390x844 and 900x520, because one shape leaves two edges untested and both were
wrong. Falsified by handing the renderer the old shrunk rect: red, with
left +3.0 right -3.0 top +5.6 bottom -6.4.

Material overlapped the vessel because LIGHT_FS ran over a +/-0.02 margin outside
u_rect on a clamped lookup, smearing the edge row outward — 15.6px under the
floor and 4.8px through each wall. The RESOLVE_FS clamp that keeps piles flush
is untouched; wall pixel values are unchanged, so no thinning came back.

TIDE's water had two causes. Abyss's brine tints 4-7 were four DIFFERENT colours
where every other biome uses four near-identical shades, so the flood was a
mosaic of lozenges; and the subsurface term was INVERSELY proportional to
thickness, making the thinnest flood the palest thing on screen. Now depth-aware:
six taps measure the fluid column above each pixel and scale composite alpha.
Isolating spec/rim/sss/refraction individually changed nothing — the water was
past the ACES shoulder — so only the composite could move it. See
[[isolate-before-tuning]].

## The boot gate was green on a completely broken renderer
Found by lane A, and it is the manager's bug. main.js falls back to the Canvas2D
placeholder whenever js/gfx/renderer.js fails to load, so a syntax error in the
renderer produced eight green checks and exit 0 while the game drew the exact
pixel look this project exists to avoid. MANAGER.md documented "check the
placeholder flag first" — documenting was not enough. boot.mjs now ASSERTS
!__state.placeholder, with a --falsify placeholder arm proven to go red. This is
also why a whole set of shell-lane screenshots came back pixelated: they were
captured while lane A was mid-edit and the page had silently fallen back.

## JELLY LAB widened: 64x224 -> 88x192
Aaron: "jelly is a very narrow board (the only one of this narrow size?)". It was
241px of a 390px screen — 62%. Now 387px, 99%, matching the other modes to 3px.

TRIMMING ROWS WAS THE LEVER, NOT WIDENING COLUMNS. The player sees the aspect,
not the column count. Width alone is fatal here: at shipping feel and fall,
64 cols gives 12.8 chains/game and 80 gives 4.8, 96 gives 2.1. Going 224 -> 192
rows lets an 88-cell span fill the screen where 88x224 still letterboxes to 85%,
and it means the fall rate never had to move — every 112-wide tuning needed the
tempo roughly doubled and still played worse.

Chosen 88x192 with qMin 0.38 / loadSquash 0.42, decided over 60 games in five
seed families: 12.5 chains/game, exactly matching the old board, with a LOWER dud
rate (5/60 vs 9/60).

Methodology note worth keeping: THREE SEED FAMILIES IS THE FLOOR for this mode.
A 112x224 tuning measured 11.6 and 12.2 chains/game on two families and was
nearly shipped; the third gave 6.5 with 9/24 duds.

ALCHEMY stays 64x168 — it renders 322px of 390 (83%), nowhere near jelly's old
62%, and its cols/rows are baked into all 96 level records with scene rects in
those coordinates, so widening it means a full regeneration and revalidation.

## Attract eligibility is judged on ASPECT, not column count
My first version of this filter keyed on cols, which excluded the widened JELLY
(88 vs 112) for a difference nobody can see — it fills 99% of the width because
it is also shorter. Now compares fitted aspect against the widest mode with a
15% tolerance, so all five endless modes demo on the title screen and none of
them letterbox.

## ALCHEMY re-boarded to a 0.500 aspect — 2026-08-28, lane C

Aaron, on a phone: "I do want alchemy to match the game boards of the others
otherwise it doesn't look right." He is right, and the reason is the one JELLY
already taught: `js/core/viewport.js` letterboxes the grid preserving aspect, so
what the player sees is `cols/rows`, not the column count.

### Before / after, measured through the viewport's own fit at 390x844

| board | cols x rows | cols/rows | fitted width | % of 390 |
|---|---|---|---|---|
| FLOW / TIDE / HOURGLASS / ZEN | 112x224 | 0.500 | 390px | 100% |
| JELLY LAB | 88x192 | 0.458 | 387px | 99% |
| ALCHEMY **was**, act I | 64x168 | 0.381 | 322px | 82% |
| ALCHEMY **was**, act V | 88x216 | 0.407 | 344px | 88% |
| ALCHEMY **was**, narrowest shipped | 64x181 | 0.354 | 298px | 77% |
| ALCHEMY **now**, act I | 80x160 | 0.500 | 390px | 100% |
| ALCHEMY **now**, act V | 104x208 | 0.500 | 390px | 100% |

All 100 shipped levels are now exactly 0.500. The old set ranged 0.354-0.431 and
**every one of the 96 was below the 0.46 floor** — see the falsification note
below, where that is what proves the new gate works.

### The formula

`js/data/levelgen.js` now carries a `BOARD` object rather than two independent
expressions:

```
cols    = snap(80 + d*24, 8)      // 80 -> 104
rows    = cols * 2                // DERIVED. rows is never chosen.
fallRate= 18 * (cols*rows^2) / (64*168^2)   +/- 2
fallMax = fallRate * (3.2 - d*0.6)
```

Three things changed and each was measured, not assumed.

**1. rows is derived from cols.** That is the whole fix: an aspect cannot drift
if only one of the two numbers is free.

**2. The `rng.range(-4,4)` jitter on cols is gone.** At BLK=8 it only ever moved
cols by one block, and because rows did not move with it, it was the thing that
walked the aspect around inside a band (0.354 to 0.431 on boards that were
nominally the same size). Variety still comes from the scene, the fall jitter and
the calibrated objective.

**3. Tempo is now DERIVED FROM THE BOARD, and this is the change beyond board
dims that the brief asked me to declare.** A piece deposits ~256 grains and takes
`rows/fallRate` seconds to arrive, so a board fills at `256*fallRate/(cols*rows^2)`
of itself per second. Holding that constant means fallRate must scale with
`cols*rows^2` — and the shipped campaign already did, by accident: 64x168 ->
88x216 is a factor of 2.27 on `cols*rows^2` while its hand-written ramp went
18 -> 38, a factor of 2.11. **The ramp WAS the board compensation, not a
difficulty ramp on top of it.** Reshaping the board without re-deriving the
tempo therefore silently changes how fast every act plays. New range 19-47
grains/s against the old 18-38, which is the same fill time on a board that is
14% larger at act V. `fallMax` is now expressed as a multiple of `fallRate`
(3.2x easing to 2.6x) — the exact ratio the old hand-written 58->100 held — so it
survives any future reshape too.

### Why 80->104 and not the suggested 88->112

Four formulas were swept at aspect 0.500 against the old board, 30 candidates
each, through the shipping modules. Keep rate barely moved, but the archetypes
did:

| formula | act I - act V | kept /30 (3 seed families) | med/limit | span kept |
|---|---|---|---|---|
| old (shipped) | 64x168 - 88x216 | 25 / 19 / 23 | 0.48-0.51 | 6 / 3 / 5 |
| 72 -> 96 | 72x144 - 96x192 | 23 / 21 | 0.42-0.51 | 5 / 5 |
| **80 -> 104** | 80x160 - 104x208 | 22 / 22 | 0.47-0.51 | 4 / 4 |
| 88 -> 112 | 88x176 - 112x224 | 21 / 24 | 0.50-0.54 | 3 / 5 |

88->112 is the widest and it is span (the chain-objective archetype) that pays,
exactly as D3 predicts — a spanning chain is percolation, and percolation gets
harder with width no matter what the tempo is. 72->96 keeps span best but puts
act I at 5.4 css px per cell, coarser than any other mode. 80->104 sits between
JELLY's 88 and FLOW's 112 and matched the shipped campaign's difficulty most
closely, so it is the one that shipped. THREE SEED FAMILIES, per the JELLY rule —
and it was needed: the OLD formula alone swung 25 / 19 / 23 across families, so
any single-family comparison here would have been noise.

Final three-family check on the shipping implementation (`--gen-levels 30
--gen-seed`): 23 / 20 / 21 kept, against the old formula's 25 / 19 / 23.
Indistinguishable.

### THE FLOOR WAS BEING ENFORCED ON THE WRONG NUMBER

The first regenerated campaign came out with **"Clear 1 chains" on level one**,
and four more like it. `FLOOR` (chains 2, dissolve 900, crystal 32) was checked
against the calibrator's `reach` and never against the target the level actually
ships with — and the target is 0.6 of reach, so a level that only just clears the
floor ships at 0.6 of the floor. This was always wrong; the old narrow board
merely hid it for chains, and even there two crystal levels shipped under their
floor (ids 10 and 73, targets 20 and 24 against a floor of 32). Widening the
board made spanning chains scarcer, reach fell to exactly 2 on five span levels,
and the bug walked into the first level of the game.

`FLOOR` is now applied to the shipped target for chains/dissolve/crystal (not
purge, where the target is a level to reduce TO, so a bigger number is easier and
the floor means something else). If the floor is then out of reach, the 2-of-3
win rule throws the level out, which is the right answer.

**This turned out to be what quench was waiting for.** Clamping crystal targets
up to 32 pushes them past the 6-second triviality threshold that had been
rejecting nearly every quench candidate: quench goes from **2 levels of 96 to 7
of 100**, at a healthy med/limit of 0.43. It does not fix the saturation
described above — quench still earns most of its crystal in the first fifteen
seconds — but it is an archetype again rather than a rounding error.

### The regenerated campaign

145 candidates -> **100 kept, 45 rejected** (the old set was 96 from 140).

| rejected | why |
|---|---|
| 17 | trivially complete (bot finished the calibrated target inside 6s) |
| 15 | unreachable (bot never reached the objective floor) |
| 10 | only 1/3 wins |
| 3 | only 0/3 wins |

Acts after renumbering: **20 / 21 / 20 / 20 / 19** — even.
Board sizes: 80x160 x16, 88x176 x36, 96x192 x32, 104x208 x16.
Levels shipping below their objective floor: **0**, against 2 before.

`node tools/modesim.mjs --levels` replays the shipped file rather than the
generator's own candidates: **100/100 levels beaten by the bot on at least 2 of 3
seeds**, aspect 0.500-0.500, zero below the floor.

Difficulty, from the generator's own measured runs:

| archetype | before (96) | | after (100) | |
|---|---|---|---|---|
| | n, med win, med/limit | 3/3 wins | n, med win, med/limit | 3/3 wins |
| span | 15, 45.1s, 0.62 | 9 | 12, 38.4s, 0.50 | 5 |
| excavate | 28, 55.2s, 0.66 | 28 | 29, 54.4s, 0.68 | 29 |
| quench | 2, 17.4s, 0.27 | 2 | 7, 33.2s, 0.43 | 4 |
| crucible | 28, 37.2s, 0.44 | 23 | 29, 36.2s, 0.43 | 29 |
| slag | 23, 20.4s, 0.26 | 19 | 23, 23.4s, 0.29 | 18 |
| **all** | **p50 0.53, p90 0.73, max 0.89** | 81/96 | **p50 0.48, p90 0.73, max 0.83** | 85/100 |

The campaign is if anything slightly EASIER than the one it replaces: the median
level is finished in 48% of its limit against 53% before, the worst level now
needs 83% of its limit where the worst before needed 89%, and 85% of levels are
beaten on all three validation seeds against 84%.

**The one honest regression: span is more seed-sensitive.** It wins faster when
it wins (med/limit 0.62 -> 0.50) but only 5 of 12 win all three seeds against 9
of 15 before. Percolation again — a wider board makes the wall-to-wall chain a
coin toss more often. It is inside the shipping bar (2 of 3) and the median got
easier, but if span ever needs strengthening, narrowing is the lever, not tempo.

### QUENCH SATURATES — measured, and only half fixed

Before the floor fix below it shipped 1 level of 99, where the old set shipped 2
of 96: a rounding error on an archetype that gets 1/5 of the candidate slots. So
I measured why rather than guessing. Crystal-over-time on three quench candidates, objective
target removed so the run shows the ceiling:

```
lv13 88x176 lava0=436  crystal 0s:0  5s:30  10s:48  15s:48 ... 75s:69   lava consumed: 19 of 436
lv14 88x176 lava0=416  crystal 0s:0  5s:18  10s:18  15s:32 ... 75s:33   lava consumed: 16 of 416
lv15 88x176 lava0=331  crystal 0s:0  5s:16  10s:16  15s:37 ... 75s:37   lava consumed: 29 of 331
```

**Quench saturates in the first 15 seconds and then nothing happens for the
remaining minute.** Only the exposed lava SURFACE ever converts — about 4% of the
lava on the board — because crystal is permanent and the first water to touch a
body seals it forever. So `reach` is roughly "total exposed lava width", it is
achieved almost instantly, and a target of 0.6 x reach is therefore hit inside
the 6-second triviality threshold. The `shelves()` design was meant to prevent
exactly this and it does not: staggering the heights spreads the first contact
over ten seconds, not over the level.

This is a mode-design problem, not a board problem — the same saturation is
visible at 64, 72, 80 and 88 columns — so I have not touched the quench content.
The objective-floor fix below raises quench to 7 shipped levels by asking for
enough crystal that the level cannot end in six seconds, which is a real
improvement, but the underlying shape is unchanged: the crystal still all arrives
in the first fifteen seconds and the rest of the level is the clock running out.
Whoever picks it up: the objective has to stop being "how much crystal" and start
being something the crust does not end. Re-exposing buried lava is the only
mechanism on the board that could do it.

### The new permanent gate: A4-aspect

`tools/modesim.mjs` now asserts `cols/rows >= 0.46` on **every** shipped level
(never the sample — it costs no simulation) and on every generated candidate.
0.46 rather than 0.50 so JELLY's 0.458 stays legal; it is the narrowest board
anyone has judged acceptable on a phone.

Nothing else in the suite would ever have caught this. Every one of those 96 old
levels was winnable, non-trivial, correctly starred and completely wrong.

Falsified three ways, all red:
- `--break aspect` in the shipped path: `A4-aspect: shipped levels: 1/100 board(s)
  letterbox below 0.46 — 1 80x256=0.313`
- `--break aspect` in the generation path: `1/30 board(s) ... 10 88x282=0.312`
- **and against the real artifact**: dropping the OLD `levels.js` back in and
  running the gate gives `board aspect: 0.354-0.431 across 96 levels, floor 0.46
  (96 below)` and `A4-aspect: 96/96 board(s) letterbox`. The gate catches the
  actual bug it was written for, not just a synthetic one.

`--gen-seed` was added at the same time, because "three seed families" is not a
rule you can follow against a hardcoded seed.

### A gate that was green by luck, and went red on a good level

An intermediate regeneration turned `A1-levels` red on its level 81 (a slag
level, 96x192) with "unbeatable by the bot". It was not. Its own record said
`measured.wins: 2`, and playing it at the three validation seeds gave seed 900
lose, 1213 win at 51.2s, 1526 win at 21.0s. (That campaign was superseded, so
level 81 in the shipped file today is a different level — the point is the gate,
not the level.)

The default sampled check played ONE seed (900) and demanded a win. **That is a
stricter property than any level was ever guaranteed to have** — the shipping bar
is two wins out of three, so an accepted level is allowed to lose one seed. The
old campaign contained fifteen 2/3 levels and two of them (ids 1 and 91) sat in
the sampled positions; the gate was green only because both happened to win on
seed 900. Regeneration re-rolled that coin.

Fixed by asserting the bar the generator actually shipped under: `validateLevel(lv, 3)`
and `wins >= 2`, in both the sampled and the `--levels` path. A gate that fires on
a level meeting its contract is a false alarm, and a false alarm is how a real one
gets ignored.

### Considered and deliberately not changed

`ALCHEMY_CFG.ventRows / corridorPad / corridorDepth` are in cells and the board
did change size, but all three are sized against the PIECE and the ceiling, not
the board: the spawn crown is 6 rows regardless of width, and the corridor is 6
cells either side of a piece whose size did not change. Top-outs did not move
enough to justify touching them (1 -> 2-3 per 30 candidates in the sweep, noise at
that n). Left alone.

`js/modes/alchemy.js` still says "Ninety graded problems" in its blurb. It was
already wrong at 96 and it is wrong at 100; it is a shell-visible string and not
part of this job, so it is flagged rather than edited.

### FOLLOW-UP: the FLOOR fix manufactured a second defect, and HEADROOM resolves both

The manager ran `tools/uishot.mjs --win`, which plays a real ALCHEMY level in a
browser, and it went red: the bot could not solve **level 1** on seed 4242. The
gate was pinned to one seed and has been fixed to try three, because 2-of-3 is
the bar the campaign ships against — the same false-alarm shape as the A1 sample
described above. But it pointed at something real in the data.

**Level 1 shipped `target 2` against `reach 2` — 100% of the bot's measured
ceiling, on the first level a human will ever play.** Ten of the 77 non-purge
levels were above 0.8 x reach: four span at exactly 1.00, six quench at crystal
32 against reaches of 32 to 38.

They were all made by my own FLOOR fix. Measured, not assumed: the ORIGINAL
96-level table has **0** tight levels and **2** below-floor ones; the table after
the FLOOR clamp had **0** below-floor and **10** tight. The clamp
`target = max(FLOOR, 0.6 x reach)` fires exactly when reach is small, and the
smaller the reach the closer to 100% of it the floor sits. Enforcing one rule
then the other in either order just moves the defect.

`tools/modesim.mjs` now resolves them together in `resolveTarget()`: cap the
target at `HEADROOM (0.8) x reach`, then take the floor; if the cap is below the
floor there is no target satisfying both and the level is rejected. The
"lower the target to the cap" branch cannot fire while the calibrator asks for
0.6 and the cap is 0.8 — it is written out anyway so raising the calibration
fraction can never quietly bring tight levels back.

Result on the shipped table: **0 tight, 0 below floor**, max target/reach 0.80,
and level 1 is now `target 4 / reach 6` (0.67) finishing in 55% of its limit
where it used to need 74%.

### Regenerated under both rules

160 candidates -> **107 kept, 53 rejected**. Acts **21 / 20 / 22 / 22 / 22**,
ids contiguous, aspect 0.500 throughout.

| rejected | why |
|---|---|
| 33 | **no headroom** (the new rule) |
| 14 | trivially complete |
| 3 | only 1/3 wins |
| 2 | unreachable |
| 1 | only 0/3 wins |

Those 33 rejections are the acceptance path demonstrably working on real data
rather than on an injected fault.

`node tools/modesim.mjs --levels`: **107/107 beaten by the bot on at least 2 of 3
seeds**, aspect 0.500-0.500, 0 tight, 0 below floor.

Keep rate across three seed families at 30 candidates: **22 / 20 / 19**, tight 0
in all three, against 23 / 20 / 21 before the rule — the rule costs about one
level in thirty.

| archetype | before (100) | after (107) |
|---|---|---|
| span | 12 (5 at 3/3) | **10** (4 at 3/3) |
| excavate | 29 | 32 |
| quench | 7 | 4 |
| crucible | 29 | 32 |
| slag | 23 | 29 |
| tight levels | 10 | **0** |
| below-floor targets | 0 | 0 |
| 3/3 wins | 85/100 | 96/107 |
| med/limit p50 | 0.48 | 0.51 |

**span is 10, above the 8 the manager set as the stop line**, and its median
target now sits at 0.67 of reach rather than 1.00. Quench falls 7 -> 4 because
six of its seven levels were the tight ones: crystal saturates around 32-38 (see
the saturation measurement above) and a 32 floor leaves no room in that. Losing
them is correct — a quench level asking for 32 when the bot can only ever make 35
is not a level — but it is more evidence that quench needs a different objective,
not a different number.

### One level still runs the clock down, and it is NOT a headroom case

`id 20` (act 1, slag/purge) has a median completion of **66.2s against a 67s
limit — 0.99**. It wins 3/3 seeds and its fastest run is 49s, so it is beatable,
but the median player has no room. Two more purge levels sit at 0.86-0.87. All
three are `purge`, which is the one objective type HEADROOM does not cover: its
target is a level to reduce TO, so margin there is structurally 0.6 of the
progress the bot made and the tightness is in the CLOCK, not the target.

I have not invented a second rule for this — a time-margin rule on
`measured.med / limitS` was not asked for and would change what ships. Flagging
it: if it wants fixing, the lever is `limitS` for purge levels, and the rule
would be a cap on `measured.med / limitS` in the same acceptance path.

### Verified in a real browser, not only in node

The board rect is computed in `js/core/viewport.js`, which node never runs, so
the aspect claim was checked end to end on a true 390x844 headless viewport via
`tools/cdp.mjs`, at all three board sizes the campaign uses:

```
level  1   80x160   board {x:0, y:22.4, w:390, h:780}   "Clear 2 chains"
level 40   88x176   board {x:0, y:22.4, w:390, h:780}   "Reduce sand to 379"
level 99  104x208   board {x:0, y:22.4, w:390, h:780}   "Dissolve 20690 grains"
```

That is byte-identical to the FLOW rect recorded earlier in this file
(`FLOW viewport {0, 22.4, 390x780}`). ALCHEMY now frames exactly like the rest of
the game at every act, and `placeholder` was false on all three, so it was the
real renderer drawing it.

Note for whoever tries to reproduce this: **`?level=` is not a URL hook.** The
page always starts ALCHEMY on level 1; use `window.__game.startLevel(n)` after
boot. My first pass at this check passed `&level=99` and got three identical
readings of level 1, which looked like a pass and proved nothing.

### Gates, all run against the shipped artifact

| gate | result |
|---|---|
| `node tools/sim.mjs` | PASS, 0.078 ms/tick |
| `node tools/jellysim.mjs` | PASS |
| `node tools/modesim.mjs` | PASS, aspect 0.500-0.500 across 107, 0 below floor, 0 tight |
| `node tools/modesim.mjs --levels` | PASS, 107/107 beaten on >= 2 of 3 seeds |
| `node tools/boot.mjs` | PASS, 12 checks, real renderer |
| `--break trivial` | red, arm confirmed |
| `--break unwinnable` | red, arm confirmed |
| `--break span` | red, arm confirmed |
| `--break aspect` (shipped path) | red, `1/107 board(s) letterbox` |
| `--break aspect` (generation path) | red, `1/30 board(s) letterbox` |
| `--break headroom` (shipped path) | red, `1/107 level(s) ship a target above 0.8` |
| A4 vs the real old `levels.js` | red, `96/96 board(s) letterbox` |
| A5 vs a real artifact | the 10 tight levels it removed were measured with ids and ratios, but that intermediate table was overwritten by the regeneration, so the standing evidence is the arm plus the 33 live rejections |

Not run, and not claimed: `tools/gfx_shot.mjs --check` and `tools/uishot.mjs
--probe` / `--win`. Both belong to lanes editing concurrently; the manager ran
them and reported the `--win` result acted on above.


## Review pass: the gates that could not fail — 2026-08-28, manager

A read-only review agent went over the whole tree with instructions to
distrust the gates as much as the code. Nine confirmed findings; the shape of
almost all of them is the same, and it is the shape D9 warns about.

### What was actually broken

1. **A lost GPU context was terminal, silent and invisible.** `js/gfx/renderer.js`
   sets `lost = true` on `webglcontextlost` and there is no
   `webglcontextrestored` handler anywhere — so a backgrounded tab, a recycled
   GPU process or a driver reset left the canvas black FOREVER while the sim
   kept ticking at 60Hz, the HUD kept updating and the score kept climbing on a
   board nobody could see. `js/main.js` now rebuilds the renderer through the
   same factory boot() uses; the renderer holds its GL resources in closure
   state, so there is nothing to restore piecemeal.

   **Every check in the boot gate was green through this**, because
   `renders frames` reads main.js's requestAnimationFrame counter and a rAF
   counter has nothing to do with pixels. There is now a real pixel count and
   the recovery is asserted: `0 lit while lost, 3843 of 4096 lit after,
   1 rebuild`. `--falsify context` (`?ctxbug=1`) proves it can go red.

2. **One bad value in localStorage bricked the game permanently.** `read()` in
   `js/core/save.js` was `v ? JSON.parse(v) : d`, and the string "null" is
   TRUTHY — so it returned null and `save.settings.quality` threw inside boot()
   on every subsequent visit, with no in-game way to clear it. SILT never writes
   null itself, but `lib/auth/localsync.js` mirrors a remote payload into these
   keys unvalidated. Now shape-checked: a save that cannot be read is a save
   that resets.

3. **The Biome setting was a one-way door.** Default is `auto`, meaning "follow
   the mode's own biome" — and `auto` was not one of the options. The segment
   opened with nothing lit, and one tap pinned every mode to one biome forever,
   silently undoing the whole per-mode biome fix. Auto is now the first option.

4. **Screen shake was wired to nothing.** Six modes call `api.shake()`,
   CONTRACTS.md lists it in both the api and the draw opts, and the renderer
   implements it fully — but main.js stubbed the api out AND never passed
   `shake` to draw(). It looked wired because `dev/gfx.html` drives it
   correctly; the only host that never did was the game. Same for the
   interpolation `alpha`, which shipped hardcoded to 1.

5. **The Haptics setting did nothing.** The only `vibrate()` call in the tree
   was the toggle's own confirmation buzz and nothing ever read the flag. Now
   fired on landing and on a chain — and the row is hidden where
   `navigator.vibrate` does not exist, which includes every iPhone. A switch
   that cannot do the thing it names is worse than an absent one.

6. **`shatter()` never counted a destruction.** A cell overwritten from
   non-EMPTY is destroyed, and it was not counted, so
   `count === start + created - destroyed` was false whenever a piece landed
   into gas — which is most of ALCHEMY, since `collides()` deliberately ignores
   GAS. `g.count` stayed correct throughout because `set()` guards it on its
   own, which is exactly why no gate noticed. `tools/sim.mjs` now checks the
   IDENTITY as a delta across each game, with a `--break identity` arm that
   reproduces the old behaviour rather than fabricating a number.

7. **`boot.mjs`'s "mass ledger sane" was a bounds check wearing a ledger's
   name.** `cells >= 0 && cells <= 112*224` stayed green with `g.count` set to 7
   on a live 512-cell board, and 112x224 is not even the board any more. It now
   asks the grid to recount itself, with a `--falsify ledger` arm.

8. **Seventeen of ZEN's eighteen controls were under 44px** — a 16px tint dot,
   in the one mode whose entire interaction IS the palette. Nothing could catch
   it: `el.click()` does not care how big an element is. `tools/uishot.mjs --hit`
   now measures the REAL tappable extent by probing `elementFromPoint` outward
   from each control's centre, which sees pseudo-elements, overlap by later
   siblings, and anything invisible sitting on top. Bar is 32x44 (an iOS
   keyboard key) across five screens; `--hitbug` collapses the targets and all
   five go red.

   Three things that fix taught: `inset` is relative to the PADDING box, so a
   1px border quietly eats 2px off every span; abutting hit boxes are won by the
   LATER sibling, so a row of controls can only ever be as wide as its pitch;
   and the chip row wraps at 390px, so its row-gap has to carry a full target
   height or the two lines eat each other.

9. `?seed=0` was silently ignored (`+q.get('seed') || undefined`). A test hook
   that quietly does something else is worse than one that is missing.

### Two hazards closed, no bug attached

`js/modes/index.js` passed the live `clears.lastChain` array to `onChain`; main.js
had been changed to `.slice()` it because that array is reused on the next
detection, and routing the host loop through `stepMode` dropped the copy. No
shipped mode holds it past the call, so nothing was broken — the copy is back
because the hazard it exists for is real. And `createSandTouch`'s predicate named
three of the four sheets; it now calls `sheetsOpen()`, which is the one list.

### The pattern

Seven of the nine were invisible to a green suite, and in five cases the check
that should have caught it was measuring an adjacent quantity that cannot fail:
a rAF counter for pixels, a bounds test for a ledger, a click for a touch target,
a DOM query for what a player can see. CLAUDE.md's rule holds per GATE and not
per CHECK, and that gap is what a lost context cost. Every gate added in this
pass has an arm, and every arm was watched going red.


## The opening grace, honest stars, and a masher — 2026-08-28, lane C

The build was finally played by a human. Two reports, and the second one turned
out to be about the mechanic that had just been added to fix it.

### (a) The opening was too hard, and the reason is structural

"I've failed a bunch of times, the first level I think I got 3 stars, and since
then I've had 3 one-stars and a single two-star mixed with failures. Maybe after
you have played 10 levels or more it should be around that difficulty? So maybe
reduce the points needed for the first 10 levels or so by 10 to 20%."

He is describing a campaign with no allowance in it, and the allowance was
missing for a reason worth naming rather than tuning around: **every target is
0.6 of what `js/ai/bot.js` reached, and every star time is a multiple of what
the BOT took.** The bot has played the game a thousand times. Level 1 therefore
opened at the bot's own pace with nothing subtracted for not yet knowing what
sand does.

Measured, on the table he actually played and with the span bonus switched off
because it did not exist yet — first ten levels, three seeds each, thirty runs:

| | fail | 1-star | 2-star | 3-star |
|---|---|---|---|---|
| what he played | 2 | 2 | 13 | 13 |

That is the BOT's result. He is slower than the bot, which is why his own run of
the same ten levels was worse than this — failures plus three 1-stars.

### The curve: ONE number, applied to both halves

Two complaints are hiding in his sentence and they need different levers. A
level you FAIL is a target problem; a level you 1-STAR is a threshold problem.
He reported both, so both are eased, by the same fraction `g`:

```
target  = round(reach * 0.6 * (1 - g))      ask for less
2-star  = med  * 1.15 * (1 + g)             rate more generously
3-star  = fast * 1.05 * (1 + g)
```

```
levels 1-9    g = 0.20     the full allowance
levels 10-18  g tapers linearly 0.18 -> 0.02
level 19+     g = 0        the measured baseline, unchanged
```

Top of the asked-for 10-20% band rather than the middle, because 10% would not
have moved a failure and he reported failures. Linear taper rather than a step
so no level is visibly harder than the one before it, reaching baseline at 19 —
inside the "roughly 15 to 20" the job asked for. The two halves compound on
purpose: a shorter level is also a faster one, so the clock relief lands on
times that have already come down.

`hold` and `zero` index the KEPT list, not the candidate list — `graceAt(kept.length)`
is evaluated as each candidate is accepted, so a rejection slides the ramp along
instead of punching a hole in it.

**After, same measurement, same ten positions on the regenerated table:**

| | fail | 1-star | 2-star | 3-star | mean |
|---|---|---|---|---|---|
| what he played | 2 | 2 | 13 | 13 | 2.23 |
| now | **0** | 1 | 8 | 21 | **2.67** |

All ten now win 3 of 3 seeds; nine of the ten sit at target/reach 0.48 where the
campaign baseline is 0.60.

### (b) Mashing beat thinking — and the fix for it was making that WORSE

"The way to get points faster is to swipe down around the board fast. Not
strategy." A star is a pure time threshold, so thinking cost wall-clock and
bought nothing. The answer already shipped was `ALCHEMY_CFG.spanSeconds`:
`min(8, n^2/1.2e6)` for every chain over 900 cells, summed, quadratic so that
one 4,000-grain span would beat four 1,000-grain ones.

Nothing in this suite could tell whether it worked, because every gate is played
by the bot, which places deliberately. So `tools/modesim.mjs --masher` now plays
three ABLATIONS of the same bot, changing one thing at a time:

| | placement | drop |
|---|---|---|
| `bot` | chain-building | soft |
| `swift` | chain-building | HARD |
| `masher` | flattest landing only | HARD |

`masher` deletes the two terms in `Bot._score` that encode intent — same-tint
adjacency and wall contact — and keeps only "do not build a tower". It is not a
bad player, it is a player with no plan.

**The first masher picked a column at random. Throw that instrument away:** it
lost 26 of 36 runs by topping the board out, which made the mechanic look like a
triumph and proved nothing, because a masher who cannot finish a level is not
the player who filed the report. Its ten wins were all three-star. A weak
adversary is a believable wrong metric.

Against the fair one, on the shipped table, 18 runs:

| | drops/s | chains/run | median chain | best-of-run share | bonus/run |
|---|---|---|---|---|---|
| bot | 2.25 | 3.9 | 1199 | 0.577 | **6.3s** |
| masher | 10.42 | **103.3** | **1537** | 0.648 | **260.7s** |

**Mashing does not make smaller chains. It makes bigger ones**, because chain
size is a function of how much sand is standing on the board and throughput is
what puts it there — and it makes twenty-six times as many. A per-chain bonus
times 26x the chances is a mashing amplifier however superlinear it is in size.
The mechanic added to beat mashing was paying a masher 41x what it paid a
deliberate player, and was the strongest reason to mash in the game.

### The bonus, rebuilt: paid ONCE, on a SHARE

Two changes, each aimed at one of those two numbers.

**Paid once.** The bonus is your WIDEST span, not the sum — you are paid the
improvement each time you beat your own best. 26x the chances then buys 26x of
nothing and the count advantage is gone outright.

**Paid on a share.** The unit is the fraction of the standing board the span
took, not its raw cell count, so a full board does not pay more than a clean one
for the same act. Best-of-run share is bot 0.577 against masher 0.648 — 1.12x,
where raw cells gave 1.84x.

`spanShare: (f) => min(8, max(0, f - 0.30) * 17.8)`. Nothing below 0.30 of the
board, full 8s at 0.75, and the 900-cell floor still keeps incidental chains
from paying. Measured after: **bot 3.6s/run, masher 3.1s/run — 0.88x, from 41x.**

### What that does NOT fix, said plainly

**It stops the bonus rewarding mashing. It does not make thinking beat mashing,
and no time bonus can.** On the regenerated table, 12 levels x 3 seeds:

| | wins | mean stars | stars per WIN | 3-star |
|---|---|---|---|---|
| bot | 35/36 | 2.33 | 2.40 | 15 |
| swift | 30/36 | 2.50 | 3.00 | 30 |
| masher | 30/36 | **2.50** | **3.00** | **30** |

Head to head over 12 levels: strategy 2, mashing 9, tie 1. **The masher
three-stars every single level it finishes.** Its only price is the fail rate,
6 in 36 against the bot's 1.

The reason is not the bonus and not the floor. It is that **every objective in
this campaign is a volume race** — clear N chains, dissolve N grains, forge N
crystal, reduce sand to N — and volume is exactly what throughput buys. `swift`
is the control that proves the placement heuristic is not the variable: give the
deliberate bot a hard drop and it scores identically to the masher.

The lever that would actually settle it is an objective volume cannot buy, or a
piece economy that charges for the drop (which would make `elapsed` count pieces
as well as seconds — entirely inside `alchemy.js`, but it changes what the HUD
clock means and is a design call, not a regeneration pass). **Not invented here.**

### A measurement fault that was quietly recording losses as wins' opposite

`playLevel` capped a run at `limitS + 5`. That was correct while the effective
clock and the wall clock were the same thing and became wrong the moment a span
started buying seconds back. Level 8 on the old table, seed 1213, earns 26.1s of
bonus and legitimately runs to 68.4s against a 63s limit — the cap cut it off at
68.0 and recorded a LOSS on a level the bot had won. Now `limitS * 2 + 30`,
which costs nothing because the mode ends the level itself.

### New gates, both armed

**A6-grace** — the ramp has to be in the TABLE, not just in the generator, and
it checks two things because they fail separately. That `lv.grace` matches the
documented curve catches a table generated by an older tool. That a graced
level's 2-star is actually at least `1.15 * (1 + g)` of its recorded median
catches the worse case: the annotation surviving while the relief does not, so
the table LOOKS eased and is not. `--break grace` injects one fault of each kind
into two different levels and both must be reported.

0.2s of slack on the second half, and it is arithmetic not judgement: `med` and
`stars` are both stored to one decimal, so re-deriving the threshold can
overshoot by up to 0.12s. Five levels tripped on exactly that. The relief being
looked for is 0.23 x med, which is 6-8s.

**A7-masher** — opt-in, and it does NOT assert that strategy wins, because
measurement says it does not and a gate that is red by design is a gate nobody
reads. It asserts the property the mechanic actually promises and the first
version violated 41x: the bonus may not be bought with throughput. `--break masher`
restores `min(8, n^2/1.2e6)` summed, verbatim.

### Regenerated

190 candidates -> **119 kept, 71 rejected**. Acts **18 / 28 / 26 / 23 / 24**,
ids contiguous, aspect 0.500 throughout, 0 tight, 0 below floor, max
target/reach 0.780, med/limit p50 0.42, 104/119 at 3 of 3 wins.

| rejected | why |
|---|---|
| 32 | no headroom |
| 23 | trivially complete |
| 9 | only 1/3 wins |
| 4 | only 0/3 wins |
| 3 | unreachable |

Keep rate 63%, against 67% before the grace. Three more seed families at 30
candidates: **20 / 17 / 22 kept**, 0 tight in all three.

| archetype | before (107) | after (119) |
|---|---|---|
| span | 10 | 12 |
| excavate | 32 | 38 |
| quench | 4 | 4 |
| crucible | 32 | 38 |
| slag | 29 | 27 |

A first pass at 165 candidates kept only 95, one short of the 96 floor. That is
the grace costing levels — 26 trivial rejections against 14 before — and it is
the honest cost of asking for less.

### THE CAMPAIGN NO LONGER OPENS ON A SPAN LEVEL, and it is not a bug

`archetypeFor` teaches chains in candidates 1-6. All six were culled:

```
candidate 1 span: no headroom: a 2 floor is 1.00x the bot's reach of 2
candidate 2 span: only 1/3 wins
candidate 3 span: no headroom: a 2 floor is 1.00x the bot's reach of 2
candidate 4 span: no headroom: a 2 floor is 2.00x the bot's reach of 1
candidate 5 span: only 1/3 wins
candidate 6 span: no headroom: a 2 floor is 2.00x the bot's reach of 1
```

Four of them top the board out at ~41s against a 60s limit and reach one or two
chains. The old table shipped candidate 5 at 2/3 wins; it is a coin flip and it
came up tails. **The early span boards are structurally fragile** — an 80-wide
board, three tints and a single crystal pillar is a hard first chain — and the
campaign now opens on `excavate` ("Dissolve 7,228 grains", target/reach 0.48,
med 30.7s of a 61s limit, 3/3 wins), which is a gentler opening but not the
ladder `levelgen.js` intends. **If the chain-teaching opening matters, the lever
is `pillars()` and the span scene at d≈0, not the acceptance path.**

### Gates

| gate | result |
|---|---|
| `node tools/sim.mjs` | PASS, 0.088 ms/tick |
| `node tools/jellysim.mjs` | PASS |
| `node tools/modesim.mjs` | PASS, aspect 0.500-0.500, 0 tight, 0 grace faults |
| `node tools/modesim.mjs --levels` | PASS, 119/119 beaten on >= 2 of 3 seeds |
| `node tools/boot.mjs` | PASS, 14 checks, real renderer |
| `node tools/gfx_shot.mjs --check` | PASS, board-rect 0.4px worst edge |
| `node tools/uishot.mjs --probe` | PASS |
| `node tools/uishot.mjs --hit` | PASS, 54 controls, 0 too small |
| `node tools/uishot.mjs --win --only=none` | **1 RED — see below** |
| `--break ledger / score / stall / rng / tide / zen / slots` | all red, arms confirmed |
| `--break trivial / unwinnable / span` (gen path) | all red, arms confirmed |
| `--break aspect` (shipped) | red, `1/119 board(s) letterbox` |
| `--break aspect` (gen path) | red, `1/30 board(s) letterbox` |
| `--break headroom` | red, `1/119 level(s) ship a target above 0.8` |
| `--break grace` | red, BOTH halves: `1 2-star 35.3s not eased to 42.4s` and `2 grace -1 want 0.20` |
| `--break masher` | red, `11.7x` |

### The one red, and why it is the tool and not the table

`uishot.mjs --win`: *"the results card opens the campaign with the new stars
already on the tile — 119 tiles, lv 1 shows 2 of 1"*. Reproducible.

`drive()` (uishot.mjs:399) constructs **its own Bot** and steps the world with
`__game.step(1)` while the page's own `?auto` bot is also running `bot.update()`
in the rAF loop. Two bots on one world is a race, and it is the only
nondeterminism in the browser: an independent CDP probe of the same URL, seed
and viewport that does NOT add a second bot wins level 1 at `t 31.8, elapsed
26.36, 3 stars` on both of two consecutive loads, banking `{"1":3}`.

The `--win` section wins level 1 twice — once for the card, once after
re-loading `wonUrl` — and captures `earned` from the FIRST. `save.recordLevel`
banks the MAXIMUM. So the tile legitimately shows the better of two runs while
`earned` holds the worse, and line 1224 compares them with `===` where its
sibling at line 1181 already, correctly, uses `>=`.

**Why now:** on the old table every level-1 run landed 3 stars, because the
thresholds were generous by the entire span bonus, so the two runs always
agreed. Honest thresholds make level 1 land at 1, 2 or 3 depending on how the
two bots interleave, and the latent equality assertion surfaced.

`tools/uishot.mjs` belongs to lane B and was not touched. The fix is `onTile >= earned`,
or capture `earned` after the final win. **Not verified beyond the above** — I
did not edit the tool to confirm the second run's star count directly.

### Also flagged, not acted on

- **Quench is still 4 levels** and its median win is 14.0s against limits of
  60-100s. Same finding as before: crystal saturates and the objective is wrong,
  not the number.
- **span is 12**, above the 8 the manager once set as a stop line.
- `world.alchemy.bonus` is now always equal to the widest span, not a running
  total. Nothing reads it but the HUD and the gates.


## The campaign, regenerated on a piece budget — 2026-08-29, lane C

The manager replaced the clock with a piece economy in `js/modes/alchemy.js`:
a level is a number of PIECES, `starsFor` takes pieces used, and `limitS` is
gone. This is the campaign rebuilt in that currency — 119 levels, and the masher
comparison is now the acceptance test rather than a curiosity.

**Headline: mashing lost.** On all 119 shipped levels, 3 agents x 3 seeds:

| | wins | mean stars/run | stars per WIN | fails |
|---|---|---|---|---|
| bot | 341/357 | **2.32** | **2.43** | 16 |
| swift | 252/357 | 1.56 | 2.21 | 105 |
| masher | 265/357 | **1.68** | **2.27** | 92 |

Head to head over 119 levels: **strategy 71, mashing 25, tie 23.** The clock
campaign measured 2.33 against 2.50 stars a run and strategy 2 to mashing 9,
with the masher three-starring every level it finished. It is a reversal on
every column, including the one the old design could never win: stars per WIN,
2.43 against 2.27, where it used to be 2.40 against 3.00.

### The budget, and its headroom

```
CAL_PIECES  = 56     calibrate the objective inside this many drops
target      = round(reach * 0.6 * (1 - g))          unchanged, in the new reach
budget      = max(TRIVIAL+2, ceil(med(uses) * 1.6), max(uses))
```

`uses` is how many pieces each WINNING validation run cost. Shipped spread:
13-87 pieces, median 58, and the budget sits at a median **1.61x** the median
winning spend (max 1.92x).

**Why 1.6, and why it is not really free.** It is the allowance for a human
being worse at placement than a machine that has played the level a thousand
times — but the grace pins it from below. A graced level's 2-star threshold is
`med * 1.15 * 1.20 = 1.38 * med`, and the budget has to sit above it or the
1-star band collapses into the 2-star one. So anything under about 1.55 is
structurally illegal while the opening grace exists, and 1.6 is the first round
number above that floor. The `max(uses)` term is a separate promise: the budget
can never sit below the most expensive run the generator's own validation
counted as a win.

**Why the validation still holds after the budget is written.** The runs are
played at CAL_PIECES, which is more generous than the budget that gets written
afterwards — but a budget only ever ENDS a run, it never changes one, and the
sim is deterministic, so a run at the shipped budget is identical to the
validation run right up to the drop that would have overrun it. `--levels`
replays all 119 at their shipped budgets and reproduces 119/119.

**Why CAL_PIECES is 56.** Swept at 30 candidates: 40 / 56 / 72 / 96 kept
19 / 21 / 22 / 23 and gave median winning spends of 27-29 / 32-35 / 34-43 /
41-58 pieces. It is the campaign's length dial. 96 makes an excavate level cost
58 drops, which is a long sit on a phone; 40 costs a span level in act I. 56
sits where a level is 30-40 deliberate drops.

### Star thresholds: same shape, new unit

```
3 stars   ceil(fastest * 1.05 * (1 + g))     economical
2 stars   ceil(median  * 1.15 * (1 + g))     competent, capped at the budget
1 star    the budget                          you finished
```

Integers, rounded UP in the player's favour, with `three < two` enforced so the
bands cannot collapse on a short level. The grace ramp survives unchanged in
shape and is expressed in the new currency: target eased by `(1 - g)`, both
thresholds by `(1 + g)`.

**The ramp is now indexed on the CAMPAIGN, not on this table.** Three
hand-authored tutorial levels are prepended and renumbered in front of these, so
`graceAt` is called with `PRELUDE + index`, `PRELUDE` read from `tutorial.js`
itself. The player still meets the full 20% allowance for levels 1-9 and
baseline by 19; in this file that is ids 1-6 and 16. A6 checks the same offset,
so a table generated against the wrong origin goes red.

### SPAN IS BACK IN ACT I, and level 1 is a span level

Under the clock all six chain-teaching candidates were culled — four for no
headroom, at a reach of one or two chains against a floor of two. Under a piece
budget candidate 2 survives, so **the campaign's first generated level is
`span`, "Clear 2 chains", reach 5, budget 79.** Span overall is 12 levels, same
as the clock table.

The reason is worth recording because it was not obvious: a span level's reach
is not limited by topping out, it is limited by how many drops it is given. The
sweep proves it — span kept 3 / 4 / 5 / 5 of six early candidates at CAL_PIECES
40 / 56 / 72 / 96. The clock was the constraint all along, because a spanning
chain is percolation and percolation wants attempts, not seconds.

**Two honest caveats on it.** Level 1 wins 2 of 3 seeds, which is the shipping
bar but is the weakest place in the campaign to spend it. And its median win is
49 pieces of a 79 budget, so it is one of the longer levels in the game sitting
at the front. Both are survivable because the hand-authored `First Span` now
teaches the verb before it, but if the opening needs to be gentler the lever is
`pillars()` and the span scene at d≈0, not the acceptance path.

### Regenerated

195 candidates -> **119 kept, 76 rejected** (61%). Acts **23 / 23 / 22 / 24 / 27**,
ids contiguous, aspect 0.500 throughout, 0 tight, 0 below floor, 0 budget faults.

| rejected | why |
|---|---|
| 40 | no headroom |
| 18 | trivially complete (bot finished inside 8 drops) |
| 11 | only 1/3 wins |
| 5 | unreachable |
| 2 | only 0/3 wins |

The generation report now prints rejections BY ARCHETYPE, because a keep rate is
an average and the average hides the only thing worth knowing — which archetype
the acceptance path is quietly emptying:

```
span      lost 27: 20 no headroom, 6 only 1/3 wins, 1 only 0/3 wins
quench    lost 36: 15 trivially complete, 20 no headroom, 1 only 1/3 wins
slag      lost 13: 3 trivially complete, 5 unreachable, 4 only 1/3, 1 only 0/3
```

| archetype | clock table (119) | piece table (119) |
|---|---|---|
| span | 12 | 12 |
| excavate | 38 | 39 |
| quench | 4 | **3** |
| crucible | 38 | 39 |
| slag | 27 | 26 |

Three seed families at 30 candidates: **18 / 21 / 21 kept**, 0 tight in all
three, against 20 / 17 / 22 before.

**Quench is 3 and it is the same finding for the fourth time.** Crystal
saturates: fifteen of its candidates finish inside eight drops and twenty more
cannot clear the crystal floor with headroom. The piece economy does not touch
it, because a level that is over in six seconds is over in six drops. The
objective has to stop being "how much crystal".

### The falsification arm that was green against a broken campaign

`--break masher` first scaled every budget AND every star threshold by four —
"the campaign as it would ship if the budgets were set with no regard for what
they cost". **It stayed green.** Not a wiring bug: the fault simply is not the
fault. Scaling the budget hands everybody three stars and leaves the deliberate
bot ahead on the fail rate.

Chasing it produced the most useful measurement in this pass. **A generous
budget alone does not bring mashing back.** It converts a masher's losses into
ONE-STAR wins, because the star thresholds are counted in pieces and a masher
cannot hit them — and most of a masher's losses are not budget exhaustion at
all, it tops the board out (10 of 36 losses survive a 4x budget). So the
load-bearing half of the piece economy is **the CURRENCY, not the cap**: stars
denominated in pieces are what make thinking pay, and the budget is the fail
state that charges for running the board into the ground.

The arm now restores the design this pass replaced — four times the pieces so a
drop costs nothing, and stars scored on the WALL CLOCK against thresholds
calibrated from the bot's own runs. It goes red on both bars, and it reproduces
the original measurement almost exactly: masher 3.00 stars per win against the
bot's 2.37, head to head strategy 3 mashing 8. The historical numbers were 3.00
against 2.40, strategy 2 mashing 9.

### What A7 asserts now, and the one thing it deliberately does not

Mean stars per RUN with a 0.25 margin, and the head-to-head count. Both were
lost under the clock and both are won under the budget.

**Stars per WIN is reported and not asserted.** On the full table the bot is
ahead (2.43 to 2.27) so it would pass — but on the 12-level sample the default
run uses it is a dead heat (2.48 to 2.27 today; 2.41 to 2.42 on an earlier
table, i.e. it can land either side). That is survivorship, not generosity:
conditioning on a win throws away every run the masher lost and keeps the boards
where its gamble came off, and on a volume objective a lucky masher really has
spent its pieces as well as a thoughtful player. Asserting a statistic that
flips sign on a 36-run sample would give the suite a gate that goes red for
reasons nobody can act on.

### A8-budget — the new permanent gate

`pieces` is the fail condition, so it is the most load-bearing number on a level
and it is derived rather than authored. A8 re-derives it from `measured.spend`
at no simulation cost and catches both ways it can rot:

- **too tight** — a budget under the most expensive run the generator itself
  counted as a win, which turns a recorded win into a loss. That is the fault
  this project has already paid for once in the other direction, when a
  wall-clock cap cut off a winning run and logged a defeat.
- **too generous** — over 2.4x the median winning spend. Nothing else in the
  suite can see this: such a level is still winnable, non-trivial, correctly
  shaped, inside its headroom and correctly graced.

It also asserts `stars` is three descending piece counts ending at the budget.
`--break budget` doubles one level's budget in a copy: red, `budget 158 is 3.22x
the 49 pieces the bot spent`.

### A measurement fault found in the gates themselves, and fixed

The mode's ACTIVE list is now the CAMPAIGN — the tutorial prepended to this
table and RENUMBERED across the join — so `levelById(1)` is a tutorial level and
`levels.js` entry 1 answers to id 4. Every gate here addresses a level by
`lv.id` taken from `levels.js`. **The whole suite would have been validating a
table three places out of step with the one it reported on**: the sampled level
checks, the masher comparison and every star threshold would have measured a
different level from the one they named, and all of it would have been green.
`tools/modesim.mjs` now calls `setLevels(SHIPPED)` at startup, the way the
generator already does with its candidates. The tutorial is lane C's own file
and is held to its own bar by `tools/tutgate.mjs`.

### Everything that read a clock, and what it reads now

| was | now |
|---|---|
| `capFor = limitS * 2 + 30` | `budget * (rows / fallRate) + 60` — the slowest a piece can fall, per piece it is allowed. A safety net that cannot end a run before the mode does. |
| `calibrate(capS: limitS + 2)` | `capFor(lv)`, with `lv.pieces = CAL_PIECES` set before the call |
| `playLevel().at` (effective clock) | `.used` (pieces). Renamed deliberately — a field named for a moment in time holding a count is how a masher got recorded as a three-star player. |
| trivial: bot won inside 6s | inside 8 drops |
| `starsFrom(times, limitS, g)` | `starsFrom(uses, budget, g)`, integers |
| A6 `min(limitS, med*1.15*(1+g))` with 0.2s slack | `min(budget, ceil(...))`, exact — piece counts are integers, so the slack the rounded seconds needed is gone |
| A7 "the bonus may not be bought with throughput" | "deliberate play must out-star mashing" |
| `levelgen: limitS = 60 + d*40` | `pieces = CALIBRATION_PIECES`, provisional, overwritten by the measured budget |

### Gates, all run against the shipped artifact

| gate | result |
|---|---|
| `node tools/sim.mjs` | PASS, 0.079 ms/tick |
| `node tools/jellysim.mjs` | PASS |
| `node tools/modesim.mjs` | PASS, aspect 0.500-0.500, 0 tight, 0 grace faults, 0 budget faults |
| `node tools/modesim.mjs --levels` | PASS, **119/119** beaten on >= 2 of 3 seeds |
| `node tools/modesim.mjs --masher` | PASS, bot 2.28 vs masher 1.64, head to head 7-2-3 |
| `node tools/modesim.mjs --masher --levels` | PASS, bot 2.32 vs masher 1.68, head to head 71-25-23 |
| `node tools/boot.mjs` | PASS, real renderer |
| `node tools/gfx_shot.mjs --check` | PASS, 0.4px worst edge |
| `node tools/uishot.mjs --probe` / `--hit` | PASS |
| `node tools/uishot.mjs --win --only=none` | PASS — including `a level whose budget runs out says OUT OF PIECES`, and 122 tiles (3 tutorial + 119) |
| `--break ledger / score / stall / rng / tide / zen / slots` | all red, arms confirmed |
| `--break trivial / unwinnable / span` (gen path) | all red, arms confirmed |
| `--break aspect` (shipped) | red, `1/119 board(s) letterbox` |
| `--break aspect` (gen path) | red, `1/30 board(s) letterbox` |
| `--break headroom` | red, `1/119 level(s) ship a target above 0.8` |
| `--break grace` | red, BOTH halves: `1 2-star 57 pieces not eased to 68` and `119 grace -1 want 0.00` |
| `--break budget` | red, `1 budget 158 is 3.22x the 49 pieces the bot spent` |
| `--break masher` | red, BOTH bars: `2.17 vs 2.31 stars/run` and `strategy 3, mashing 8` |

### Not verified, said plainly

- **No human has played a piece-budget level.** Every number here is the bot's,
  and the 1.6x headroom is an argument about a human, not a measurement of one.
  It is the first thing to check on a phone: whether 58 drops is a level or a
  chore, and whether running out of pieces reads as fair.
- The masher is an ablation of the same bot, not a person. It is the best
  adversary this suite has and it is still a proxy.
- Level 1's 2-of-3 win rate was measured, not fixed. It ships at the bar.
- A5 has still never fired on a real artifact, only on its arm and on live
  rejections — 40 of them this time.

---

## S+9 — the built world was not being drawn

Reported from a phone, and phrased as a question about difficulty rather than a
bug: *"am I meant to see the dividers or whatever is separating the sections?
because I don't see them until water hits them."*

They were meant to be seen. A 2-cell WALL was not dim, it was **absent**.

The resolve pass builds a gaussian density field and blurs it separably — that
blur is what rounds a heap into a dune, and it is the right thing for poured
material. But `cover = smoothstep(0.42, 0.62, d)`, and the peak smoothed density
at the centre of a static column runs 0.178 / 0.338 / 0.502 / 0.675 / 0.864 at
widths 1 / 2 / 3 / 4 / 6. At two cells `cover` is exactly zero: `LIGHT_FS`
returned the backdrop and the wall was never covered by a single pixel.

Isolation, not argument, is what settled it: driving the wall albedo to 4.0
(24x shipped) moved a 3-cell wall by 124 brightness units and the 2-cell wall by
**0.2**, the noise floor. No albedo can light a pixel that is never covered.

**The fix is a fourth MRT attachment carrying crisp static coverage.** WALL, ICE
and CRYSTAL accumulate through a bilinear tent — a partition of unity, so the
interior is exactly 1.0 at any thickness down to one cell and the silhouette
falls off over one cell at its true extent. Sand and liquids never enter it.
`cover = max(smoothstep(0.42,0.62,d), sCov)`. The static list comes from the
sim's own `KIND` table, not a hand-kept copy.

Albedo was a real second cause, but only on kiln and lumen, and it was **hue,
not value**: a warm grey wall in the same hue family as a hot vessel reads at
16.5/255 even once covered. Both walls were rolled at the same value. This is
dune's old "bone" finding a third time.

2-cell WALL against a bare board, per-channel mean, before -> after:
kiln 3.5 -> 23.6, lumen 4.0 -> 31.3, abyss 2.2 -> 54.3, quartz 5.1 -> 39.3,
dune 3.6 -> 40.0. CRYSTAL goes 4.0 -> 57.5 on kiln.

### Scope: this was never about one level

`pillars()` in `js/data/levelgen.js` builds scenery **2 to 5 cells wide** across
the generated campaign, and the falsification arm shows 3-cell scenery scoring
7.0 on kiln — below the bar too. Every ALCHEMY level with thin structure has
been shipping obstacles the player could not see. Any level that felt
arbitrarily hard is now suspect for this reason and not for its numbers.

### Gates

- **thin-scenery** — `thin` / `thinbare` scenes (width ladder 1/2/3/4/6 WALL plus
  2-cell CRYSTAL and ICE, and the tutorial's x=26 / x=53 dividers verbatim),
  diffed per-channel per pixel column. Bar **18**, calibrated rather than picked:
  10.4 is the best score of any structure a human cannot find in the
  before-captures, ~20 the worst of one nobody misses. Also >= 3x the measured
  bloom-spill floor. Five biomes, both tiers on kiln and lumen — the low tier
  compiles a different resolve shader (R=1) and had to be covered separately.
- **sand-untouched** — five scenes with no static material must render
  bit-identically to the old path. 0 of 1,134,000 subpixels differ.
- Arms: `--falsify=thin` sets `?staticbug=1`, which does not imitate the old
  renderer, it **is** the old renderer, and reproduces the original numbers
  (kiln WALL2 = 3.5) with all five biomes red. `--falsify=sand` puts a wall into
  the sand scenes so the identity legitimately breaks.

Verified independently of the lane that did the work: same capture pipeline,
`?staticbug=1` on and off, tutorial 2 on a 390x844 viewport. Off: one unbroken
lava band, no dividers at all. On: two stone ribs, three obvious pits.

### What it costs, honestly

- Sand costs nothing, and that is now gated rather than asserted.
- **Static scenery is hard-edged now.** Wide WALL and CRYSTAL blocks used to have
  soft rounded corners from the blur and are now cut rectangles with a lit bevel.
  Masonry should read as built — but this changes every ALCHEMY level, not only
  the thin ones.
- A 6-cell quartz wall scores 24.5 where it scored 29.0: the rim band on its
  outer cell went from a full cell to the half-cell cut face. Still over bar.
- gpuP95 2.78 ms of an 11 ms budget; A/B with the branch off was inside noise.

### A gotcha worth more than the fix

**`?t=` does NOT make captures bit-identical on any frame with a live dissolve.**
Motes are seeded from `Math.random` and stepped by real dt, so an image gate over
a dissolving board compares noise. `opts.motes = 0` closes it. The claim that
`?t=` pins a frame has been in this document since P2 and was false for a whole
class of frame the entire time.
