# sculptor-22 — touch-up pass (ORACLE, HALO, AEGIS, ELF_RANGER, then EXECUTOR, SPECTER)

Owns now (their sculptors are done): `js/actors/models/{oracle,halo,aegis,elf_ranger,executor,specter}.js` and their `js/fx/units/*.js`.
Do NOT touch knight, monolith, seraph, needle, wolf, meridian (robots kit round 4 is on them + shared kit files).
CDP port 9433. Scratch: `<scratchpad>/touchup/` — `shot.mjs` (gallery driver), `vs.sh out.png model rank` = single 3/4 (arena) +
back view + battle crop (unit x3 in the player front column at R=rank / R0 / R5), `before/` (screens + `*.js.orig` copies of the
six files as they were when this pass started), `after/`.

## Checkpoint 1 — DONE
- ORACLE: 7 -> **6 slots** (visor slits + chest lamps moved from `eye` to `glow`; orbs stay on glow2). Upper body scaled up:
  head x1.16, horns k 1.42/1.72 (R2), pauldrons x1.38 with a second dark vane layer + lilac ring + glow strip (R1+), wider
  bodice + layered breastplate + trim bar, new standing **fan collar** behind the head (7 blades, glow ridges R3+), bigger back blades.
- HALO: real detail + mass. Wings longer/wider and splayed into a fan (membrane inset, metal cross veins, leading-edge spar,
  thin R3 glow vein), carapace layering (dorsal shell, flank ribs, pectoral second layer, collar spikes, studs), abdomen 6
  segments with tergite plates + spiracle lamps, wider raptorial blades + inner layer, upper-arm layered plate + ring + extra vane,
  thigh guards, knee rings, head x1.15. `bodyScale` [1.28, 1.05, 1.2] and `radius` 0.6 -> 0.54 (tighter bubble so the body fills it).
- AEGIS: kit `legs()` replaced by own `lower()`: rounded PATCH-style thigh shells + blue front panel + band + outer plate,
  round knee caps with blue ring + bezel lamp, calf bulge, layered greave, ankle + thigh pistons, rounded toe/heel caps.
  Legendary red lamp: the ear discs were `glow` (gold glow blooms orange-red) -> `eye`; plus `mats.legendary.glow` = 0xffd98a.
  Head dome/lens segments trimmed to pay for the legs.
- ELF_RANGER: head x1.34 (was 1.22), warmer skin 0xd99b74 (was pale 0xf0c4a2), dark warpaint band across the eyes + darker
  brows + bigger glowing eyes, hood opened wider/pushed back. Legs: thicker thighs, quilted outer thigh guard, two buckled straps,
  knee cops, folded boot cuffs, front greave with leaf. Cloak fold ridges. **Victory** rewritten: wide stance, chest back, bow
  thrust high-out, draw hand flung wide, bow sweep flourish every 4.2 s, cloak billows.
- testAll: **0 fails** (whole tree). dc/tris at high (default rank c/r/e/l):
  oracle 6/11.3k 6/11.9k 7/13.2k 7/13.8k · halo 7/12.3k 6/13.4k 7/14.0k 7/15.4k · aegis 6/15.2k 6/15.7k 7/15.8k 7/16.0k ·
  elf 6/12.1k 6/13.0k 7/13.5k 7/13.8k.

## Checkpoint 2 — DONE (all six units)
- EXECUTOR: the flat extruded jacket halves are now **lathed curved shells** round the chest (profile radii 0.168 at the hem ->
  0.245 at the chest -> 0.212 at the shoulder = real waist taper), the V opening cut by remapping each vertex's angle (`deform`),
  lapels deformed to hug the curve, piping / buttons / pocket square placed on the curved surface (`zf(x, y)`), black waist-cinch
  band under the hem. Gotcha: the lathe profile must run inner-down / outer-up or the faces point inward and get culled.
- SPECTER: darker and less thin: shoulder base plates -> black-glass `accent` (two layers + lilac edge line; the long pale swept
  blade stays as the read-shape), thighs bulkier with `accent` guards, thigh fin -> `accent` + trim line, experimental paint
  0xa896dc -> 0x8a72cc, chrome struts 0x7d8494 -> 0x4c5264 (rough 0.3), bodyScale [1.2, 1, 1.12].
- testAll **0 fails** (whole tree, after all edits). dc/tris high (default rank c/r/e/l):
  oracle 6/11.3k 6/11.9k 7/13.2k 7/13.8k · halo 7/12.3k 6/13.4k 7/14.0k 7/15.4k · aegis 6/15.2k 6/15.7k 7/15.8k 7/16.0k ·
  elf 6/12.1k 6/13.0k 7/13.5k 7/13.8k · specter 6/12.7k 6/14.6k 7/14.7k 7/14.8k · executor 5/17.8k 5/17.9k 6/18.3k 7/18.7k.
  (+1 dc at epic/legendary = kit motes; HALO's +1 = its aura bubble.) AEGIS common is over the 12k common budget (it was 12.9k
  before; AEGIS only ships as rare, where 15.7k is in budget).
- Screens (scratch `touchup/`): `before/<id>.png`, `after/<id>.png` (single 3/4 arena + back + battle crop at 412x915), stacked
  `after/<id>_ba.png`; anim sheets `shots/sh_or.png`, `shots/sh_ha.png`, `shots/el_v.png` (new ELF victory).

## Honest scores at battle size (before -> after)
ORACLE 6 -> 6.5 (upper body holds its own now; head still reads as a dark box from the front) · HALO 5.5 -> 6 (fills its bubble
better, real wing fan; the R0 one is still dim) · AEGIS 6.5 -> 7 (legs) · ELF 5.5 -> 6.5 (face reads, victory is big) ·
EXECUTOR 6.5 -> 7 · SPECTER 5.5 -> 6.

## NEXT (if anyone continues)
1. ORACLE: a more sculpted face (the head is a violet cap over a black mask; a pale lilac faceplate would read better).
2. HALO: the head is mostly two glowing eye balls; a darker face plate between them would add value contrast.
3. ELF: the cloak is still one saturated green from behind; a darker lining / dyed hem band would add value.
