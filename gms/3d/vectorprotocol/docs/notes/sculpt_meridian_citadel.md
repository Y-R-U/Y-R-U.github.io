# sculptor-11 — MERIDIAN + CITADEL (corporate epics; bosses STORMCROW + DREADNOUGHT)

Owns: `js/actors/models/meridian.js`, `js/actors/models/citadel.js`, `js/fx/units/meridian.js`, `js/fx/units/citadel.js`, this file,
one line each in `js/actors/models/index.js` and `js/fx/units/index.js` (all four registered).
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt11/`. It holds working copies of
both models, sculptor-8's drivers (`shot.mjs`, `multi.mjs`, `sheet.mjs`, `evt.mjs`) and three of mine:
- `probe.mjs "gallery.html?..."`: quick boot and error check.
- `ta.mjs`: runs testAll.
- `q.mjs`: evaluates an expression on a page.

Set CDP_PORT=9421. To change a model: edit it in scratch, run `node --check`, copy it into the tree, then run probe (it must print `ready:true err:[]`).

## Checkpoint 2: both units complete
DONE
- **MERIDIAN** is a hover unit, authored in design units and scaled by G = 1.15 (1.73 m).
  - Body: a white armoured hull over a navy pod. An ultra-long twin-rail barrel slide (footR) runs through two vertical stabiliser rings
    (aux2 front, aux3 rear). The rings are navy bands with cyan glow strips and white/silver clamps, and they spin round the barrel axis.
  - Head: a red-optics targeting head (big scope lens, laser emitter, scope tube).
  - Other parts: an orbital-uplink parabolic dish on a mast (aux0) with ribs and a feed horn, swept canards (clav), and hover pods with
    flickering plumes (thigh/shin).
  - Palette: white `paint`, navy `accent`, silver `metal`, amber `trim`, cyan `glow`, red `eye`.
  - Ranks:
    - R0: the left canard is snapped, the dish is dented with a missing wedge, and the rings are dull.
    - R1: bare.
    - R2: second flank layer, ventral fins, sensor spine, scope tube, 12 ring clamps.
    - R3: light segments on the rings and barrel, and a second ring on the dish.
    - R4: holo scope readouts (footL) and hardlight canard blades (silhouette change).
    - R5: a third gyro ring (aux1) and a hover particle trail (rings fall under the pods on foreArm/hand).
  - **STORMCROW (legendary)**: a dark gunship.
    - Colours: the slots swap, so navy is the main armour and white is the insert colour. The kit adds gold trim.
    - Added parts: broad wings with ducted lift fans that spin on upArm, under-wing missile pods (red tips), a chin twin autocannon,
      an armoured canopy, canted tail fins and a bigger dish.
  - The 10 anims, all bespoke:
    - idle: bob, dish scan and a head sweep.
    - advance: nose down, pods tilt.
    - attack (Long Shot): settle, then fire at 0.32 with recoil and barrel slide.
    - attack_alt: double tap at 0.30 and 0.55.
    - cast: the designate sweep locks at 0.5.
    - overdrive: climbs about 1 board metre while the rings race forward along the barrel. Cast at 0.03 starts the paint, the release
      is at 0.23 (0.6 s), then a large recoil.
    - hit.
    - die: sputters and crashes; the rings slump. `down` at 0.56.
    - victory: barrel roll every 4 s.
    - deploy: folded drop-in, retro burst, rings bloom.
- **MERIDIAN FX**:
  - attack: accelerator-coil ring flashes along the barrel, a muzzle shock ring, and a white-cyan slug.
  - impact: a star plus a spark spray.
  - `shot`: index 0 of the overdrive starts the orbital paint. It draws a red tracking laser from the muzzle to the target, a red
    reticle with a hex closing on the plate, and an uplink beam from the `dish` socket into the sky.
  - overdrive (release): the rail shot and a thick sky lance land together, plus three converging lances, a white flash, a fire column,
    a shock ring and a scorched glowing hex that lingers.
- **CITADEL** is tracked, also at G = 1.15 (2.24 m).
  - Hull: a wide tread hull (38 links per side; sprockets roll on aux0/aux1) with navy fenders, and a hazard-striped dozer plough.
  - Turret: a raised white turret on a pedestal (spine traverses), a mantlet (neck) and twin flak barrels with recoil (footL/R).
  - Cupola: a commander's cupola (head) with a machine gun.
  - The signature hex dome emitter: white hex tiles over a glowing core (aux2). It rises in cast and in the overdrive, and has an
    R4 halo on aux3.
  - Shield walls: two hinged walls on the turret flanks (clav/upArm) carrying point-defence emplacements (foreArm mount, hand gun that
    tracks the sky).
  - Rear legs: two stabiliser legs that fold up the back (thigh/shin) and plant in the overdrive.
  - Ranks:
    - R0: the left wall's outer plate is missing, the plough has a patch, and dome tiles are missing.
    - R1: plain plough, no emplacements.
    - R2: hazard band, emplacements, wall plates, cupola machine gun.
    - R3: side skirts, whip antenna, barrel glow rings.
    - R4: emitter halo, glowing wall edges and hardlight wall fins.
    - R5: chasing cyan track lights on the sprockets, a thin hardlight skirt and a second halo ring.
  - **DREADNOUGHT (legendary)**: a vertical-launch missile battery on the turret rear, a long siege rail over the mantlet, a wider plough
    with ram horns, a sensor mast with lamps, and gold trim and seams.
  - The 10 anims, all bespoke:
    - idle: turret scan, flank check every 8.4 s, emplacements track.
    - advance.
    - attack (Flak Cannon): fires at 0.35 (right barrel) and 0.47 (left). The hull rocks.
    - attack_alt: a four-round salvo.
    - cast: the dome lifts and pulses at 0.5.
    - overdrive (Fortress Mode): the legs slam at 0.17 (impact event), the walls flare out about 60°, the dome rises, release at 0.23.
    - hit.
    - die: dome sinks, barrels droop, walls fall open, hull lists. `down` at 0.55.
    - victory: turret pirouette while the walls drum.
    - deploy: legs and walls fold in after landing (`land` at 0.42).
- **CITADEL FX**:
  - attack and shot: each barrel fires with a fire-flash, a smoke ring and a casing, then a tracer and a three-puff black flak airburst
    with shrapnel and a hex splash.
  - `shot` index 1 of the overdrive is the leg slam: quake rings, dust and shake.
  - overdrive (release): beam from the `dome` socket. A squad dome (raw bubble pool, radius capped at 3.4, flattened) inflates with
    26 hex panels locking in plus flashes. Each ally gets its own ward bubble and ring. A hex area field and a red taunt pulse off
    the unit follow.
  - shield: a hex ring plus a star on the target.
- Named sockets: meridian `dish`, citadel `dome`.
- testAll: 0 fails (whole roster).
- Stats at high quality, dc / tris:
  - meridian by rank R0–R5: 9.2k 10.3k **13.8k (R2, dc 7)** 14.5k 15.0k 16.0k. STORMCROW at R5 legendary: dc 8, 17.1k. q=low about 7.1k.
  - citadel by rank R0–R5: 17.2k 17.4k **18.4k (R2, dc 7)** 19.1k 20.0k 22.0k. DREADNOUGHT at R5 legendary: dc 8, 23.4k
    (legendary budget). q=low about 9.2k.
- Screens (scratch `shots/`):
  - final_battle.png
  - bossfight.png (STORMCROW and DREADNOUGHT in battle_test)
  - bosses.png (legendary R5 close-ups)
  - ranks2.png, meridian_tiers.png, citadel_tiers.png
  - msh1.png, msh2.png, csh1.png, csh2.png, csh3.png (anim sheets)
  - mod_sheet.png (Orbital Designator)
  - cod2_sheet.png (Fortress Mode)
  - m4.png, c12.png (3/4 views)

OPEN / NEXT
1. **DREADNOUGHT at ×1.9** crosses the centre line and overlaps the front player units. That comes from the battle scale hint and
   layout, not the model. The battle might nudge raid bosses back or cap them at about 1.6.
2. Citadel flak airbursts are small at battle size. They could be bigger, or fire a third puff cluster.
3. The rank steps R1 → R3 on Meridian are subtle at battle size. The ring light segments only show up close.
4. The legs' folded pose at the back reads as stubs from behind. A cover plate on the shins would tidy it.
5. Meridian's long barrel crosses into the neighbouring hex when units face each other. It is fine for an archer, but it may poke
   through the front-row unit in the same lane.
6. With `charge=1` in battle_test the overdrive fires during the drop-in. Use `charge=p<slot>:0.9` to capture it.

## Requests (kit)
- none blocking. The model/FX contract was enough. Named sockets and `shot()` replaced the bone lookups I would otherwise have needed.
