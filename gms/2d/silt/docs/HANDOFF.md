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
| `node tools/sim.mjs` | PASS, 0.076 ms/tick |
| `node tools/jellysim.mjs` | PASS |
| `node tools/modesim.mjs` | PASS, aspect 0.500-0.500 across 100, 0 below floor |
| `node tools/modesim.mjs --levels` | PASS, 100/100 beaten on >= 2 of 3 seeds |
| `node tools/boot.mjs` | PASS, 12 checks, real renderer |
| `--break trivial` | red, arm confirmed |
| `--break unwinnable` | red, arm confirmed |
| `--break span` | red, arm confirmed |
| `--break aspect` (shipped path) | red, `1/100 board(s) letterbox` |
| `--break aspect` (generation path) | red, `1/30 board(s) letterbox` |
| A4 vs the real old `levels.js` | red, `96/96 board(s) letterbox` |

Not run, and not claimed: `tools/gfx_shot.mjs --check` and `tools/uishot.mjs
--probe`. Both belong to lanes editing concurrently and neither reads level data.
