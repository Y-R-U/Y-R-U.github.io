# sculptor-23: touch-up round 2 (ARBITER, WISP, NEEDLE, ORACLE, HALO, ELF_RANGER, ELF_SAGE, HUSK; then PATCH, SPECTER)

Owns for this pass: `js/actors/models/{arbiter,wisp,needle,oracle,halo,elf_ranger,elf_sage,husk,patch,specter}.js` and their `js/fx/units/*.js`.
CDP port 9436. Scratch: `<scratchpad>/t2/`: `shot.mjs` (gallery driver), `vs.sh out model rank extra` (single 3/4 arena + back +
battle crop with the unit x3 in the player front column at R=rank/R0/R5; `P3=` / `EN=` env override the rest of the squads, fantasy uses
`P3=knight,treant,wolf EN=minotaur,shaman,wolf,knight,treant,elf_ranger` + `&theme=fantasy`), `rk.sh out model extra` (battle view, six
copies at R0..R5: front col R0,R1,R2, back col R3,R4,R5), `ta.mjs [ids]` (testAll, prints fails + default-rank dc/tris rows).
`before/` holds `<id>.png` screens and `<id>.js.orig` copies of all ten files as they were when this pass started.

## Checkpoint 1 (in progress)
- ARBITER DONE: bodyScale [1.12,1.03,1.12] -> [1.3,1.04,1.24], head x1.2, broader chest/lapels, shoulder boards x1.3, thicker sleeves,
  legs w 0.72 -> 0.9, longer/wider coat tails + front skirt, coat navy 0x24407e -> 0x2b4d96 (white 0xeef2f8). Rank ladder: R1 smaller
  drones (x1.4) with trim rotors; R2 white mantle capelet (top + back slab + gold edge) + glowing rotors + drones x1.6; R3 drones x1.75,
  **hardlight orbit ring** (glow torus on aux2), glowing coat hems + chest emblem; R5 a second outer ring. testAll 0 fails.
  dc/tris high: c 6/12.4k r 6/13.9k e 7/15.0k l 7/15.9k.
- WISP DONE: bodyScale 1.22 -> 1.5; eyes 1.5x bigger, wider apart (ax 0.5) and higher (ay 0.2) with an always-on dark rim + bigger
  catch-light; acorn cap smaller (polar 0.24 -> 0.2 PI) in violet `paint` (was black `accent`, it hid the orb from the 49 deg camera),
  cap rim ring glows R1+; ears ~1.6x; sprout mote bigger; ring glow bands thicker; core glow2 ei 2.5 -> 2.0 and lilac 0xe6c0ff so the
  dark eyes are not swallowed by bloom. In battle it now reads as a glowing orb with a face. dc/tris c 6/9.7k.
- NEEDLE DONE: lens x1.35 (built in a scope round the head joint; aux1 iris moved to [0,0.027,0.3], muzzle socket -> [0,0.027,0.38],
  lens socket -> 0.31, so the projectile still leaves the lens face), lens core eye ei 6 at every rank, violet facet inlays 0.66 -> 0.8
  of each facet (the diamond reads violet, not black), paint 0x6a2ee0 -> 0x7a3cf0, bodyScale 1.18. The robots' -0.6 head pitch was
  not enough by itself: the bigger lens is what makes it read. dc/tris c 6/7.6k.
- ORACLE DONE: faceplate `accent` (black) -> `trim` (pale lilac), bigger (0.144 wide) and further forward, tilted to the camera;
  visor slits sit in a dark `accent` recess, small dark mouth line, brow ridge -> violet; cranium black -> grey metal. dc/tris r 6/12.1k.
- HALO DONE: dark `accent` mask between the compound eyes with two glow brow slashes, ocellus moved forward; R0 keeps a torn second
  wing pair (0.62 length) and its stasis ring now glows (the frame stays dull metal); every body part x1.12 round its own joint, head
  x1.15 -> 1.25, ring glow tube 0.005 -> 0.008. dc/tris e 7/14.2k (7 = 6 + aura bubble).
- testAll 0 fails (checked after the five units above).
- ELF_RANGER DONE: dark `accent` (leather) lining shell just inside the cloak (shows at the open front edges), a dark dyed hem band
  (0.15 tall, 0.08 at R0) under the leaf hem, every other fold ridge -> `accent`, and a local `FOLDS` detail texture on `paint`
  (soft vertical drape bands + creases; scale 2.4, albedo 0.75). From behind the cloak now has value: folds + a dark hem.
  dc/tris r 6/13.4k.
- ELF_SAGE DONE: same `FOLDS` texture on the robe (replaces 'grime'; scale 2.2, albedo 0.8) + six raised drape ridges per robe
  panel; crystal wild glow 0x3aa0ff -> 0x1e64ff with a fixed `mats.wild.glow.ei` 1.9 (the rank ramp drove it to white-blue under
  bloom; pure 0x1238ff tonemaps violet, so keep a little green). Eyes/gem/runes share the slot and go sapphire too. dc/tris e 7/13.5k.
- HUSK DONE: cause = kit finish ladder: R0 (HUSK's default) desaturates paint x0.78 -> lavender, plus clearcoat/env picked up the
  blue rig. Fix: `mats.experimental.paint.color` 0x4116b4 (slot colours set in mats bypass the ladder), paint rough 0.5 / coat 0.15 /
  env 0.35, and a dark 'grime' detail instead of the bright R0 scuff chips. Other factions keep the ladder. dc/tris c 6/7.8k.
- testAll 0 fails.
- PATCH DONE (R0 vs R1): R0 now has a glitching holo-cross (x0.72, tilted, one arm missing, no scan frame), a dark scrap
  replacement panel (`metal` sphere patch) bolted over the shell with five red bolts and a mint tape strip. R1+ unchanged.
  dc/tris c 6/9.2k.
- SPECTER DONE (R3 shimmer): overlay base 0.28 -> 0.6 at R3+, a glint that rolls over every ~3 s (+0.45 strength, +fill), fill
  0.06 -> 0.16, scan-band discard 0.35 -> 0.12 at rest. Cloak/stealth/ghost-trail logic untouched. dc/tris e 7/14.7k.

## Final (all ten units): DONE
- Full-tree `__gallery.testAll()`: **0 fails**. Browser on 9436 closed.
- No sockets/events/durations/API changed, except NEEDLE's `muzzle`/`lens` sockets + aux1 offset, which moved forward with the bigger
  lens (same relative spot: the lens face).
- Screens (scratch `t2/`): `before/<id>.png` + `after/<id>.png` (single 3/4 arena + back + battle crop at 412x915), `*_rk.png`
  (battle view R0..R5), `*_face.png` (head close-ups: oracle, halo).

## Honest battle-size scores (before -> after)
ARBITER 5.5 -> 6.5 · WISP 5.5 -> 6.5 · NEEDLE 5 -> 6.5 · ORACLE 6.5 -> 7 · HALO 6 -> 6.5 · ELF_RANGER 6.5 -> 7 · ELF_SAGE 6.5 -> 7 ·
HUSK 6 -> 6.5 · PATCH 6.5 -> 7 (ladder) · SPECTER 6 -> 6.5.

## NEXT (if anyone continues)
- ARBITER: the R2 mantle is a flat slab; a curved capelet (lathe) would read better close up.
- PATCH: the R0 scrap panel sits on the front-right flank, not the top; rotate the sphere patch (phi) toward +y/top if wanted.
- ELF_SAGE: the fixed wild glow ei (1.9) flattens the rank ramp for eyes/runes; a separate crystal slot would need a 7th dc.
- HALO: R0 still sits inside a large bubble; per-rank aura radius would need a kit change (request: `aura` as fn(rank)).
