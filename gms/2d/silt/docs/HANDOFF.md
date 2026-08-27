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
