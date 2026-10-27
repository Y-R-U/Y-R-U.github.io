# PLANES lane: more aircraft (D7)

Two new procedural aircraft on the **same PlaneRig API as the C172** (docs/PLANE.md): exterior, cockpit, livery,
3 LOD levels, a low-tier shadow proxy, `viewEye`, a pilot and a passenger. There are no external assets.

```js
const rig = await createPlane({ type: 'tiger' | 'bathtub' | 'c172', quality, cockpit, livery, pilot, view, ... });
```

`js/plane/index.js` only gained a dispatch: `opts.type` selects a builder through a dynamic `import()`, so a C172-only
boot loads nothing extra. `'c172'` is still the default. `PLANE_TYPES` lists the valid ids.
Test page: `tools/plane.html?type=tiger|bathtub` (there is a Type picker in the panel; the bathtub adds a "Gold taps" toggle).
Extra test params: `level=1` (datum level, no 3-point stance), `cockpit=0`, `pilot=0`, `p=/s=/a=` livery hex, `gold=1`.

## Files (`js/plane/types/`)
| file | what |
|---|---|
| `rig.js` | `assembleRig(def, opts)`: the generic PlaneRig. It holds the LOD (far levels baked to 1 mesh with the shared `farlod.js`), the shadow proxy, light glows, the prop disc, `viewEye`, the control easing, the stick pivot and `dispose`. |
| `kit.js` | Tessellation tiers (`high/low/lod/lod2`) and `pbrMaterial`, a vertex-colour PBR material that takes roughness/metal **per vertex** from `uv`, so gold, chrome, rubber and leather share one draw call. Also hinge helper, fan caps, canvas atlas + text layout, the royal `crest()`. |
| `aviator.js` | Seated royal for open cockpits / the tub. One CPU-posed mesh: head look, 2-bone arm IK (stick + throttle), a **streaming purple scarf** that flaps with airspeed (scarf physics), corgi and rubber-duck passengers. |
| `tiger.js` | DH.82A Tiger Moth: spec, livery atlas, materials, exterior, `createTiger()`. |
| `tiger_cockpit.js` | Rear-cockpit panel (period black plywood, brass bezels), P-compass, stick, throttle quadrant, rudder bar. |
| `bathtub.js` | Royal Flying Bathtub: spec, livery (colour + metal/rough atlas), exterior, the bath-caddy "cockpit", `createBathtub()`. |

## API additions (additive; everything in PLANE.md still holds)
- `rig.type`: `'tiger'` or `'bathtub'`.
- `dims.groundPitch` (rad, nose up) and `dims.restHeight` (m) are set on taildraggers only. `dims.gearHeight` keeps its
  meaning, the CG height above the main-wheel contact **with the datum level**. A tailwheel aircraft at rest sits at
  `root.position.y = ground + restHeight; root.rotation.x = groundPitch` (Tiger: 0.194 rad = 11.1°, restHeight 1.13).
  `plane.html` does this. `js/ui/preview.js` and `js/story/intro.js` place parked rigs level at `gearHeight`. With a
  Tiger they would float its tail about 0.9 m up and need that one-line change (not in my lane).
- `livery.goldTaps: true` (bathtub): chrome taps become gold. DESIGN: gold taps at Emperor.
- Open types show the pilot **even with `cockpit:false`** (an empty open cockpit looks broken). `pilot:false` removes them.
  The dials are also visible in chase, because you can see into an open cockpit.
- `setView('cockpit')` hides the pilot's head and torso (and the scarf). You still see your arms on the stick and throttle.
  `'center'` is the same seat, 5–6 cm higher and slightly aft (tandem / single seat, so there is no between-the-seats view).

## Tiger Moth ("Grandfather's Moth")
Real dimensions: span 8.94, length 7.29, height 2.68, prop Ø1.98, wing area 22.2 m², 3-point attitude 11.1°.
- Build frame: the datum is level, the mains are on y = 0, z = station aft of the prop face, CG at station 2.2 / 1.25 m.
- **Fuselage:** flat slab sides with a rounded turtle-deck. The two cockpit openings are real geometric holes, each with
  a padded leather coaming roll, an inner tub, bulkheads, a bucket seat and a small curved windscreen. The cowl is metal
  (secondary colour) with louvres, cylinder bulges and Dzus fasteners, plus the long exhaust down the left side and a
  carb intake.
- **Wings:** staggered, with swept outer panels and raked rounded tips. Ailerons are on the lower wing only and
  differential (up-going 1.0, down-going 0.55). The fuel-tank bulge sits on the centre section, with a sight gauge
  under it and a filler cap. There are rib tapes and fabric-sag shading.
- **Bracing:** N-pair interplane struts, cabane struts and streamline rigging wires: doubled flying wires, landing,
  incidence and tail wires. Wires are dropped at lod2.
- **Tail:** a small fin and a big rounded DH rudder with a horn balance, carrying the royal crest.
- **Gear:** split-axle main gear, disc-covered wheels and a leaf-spring tailwheel. The prop is laminated varnished
  wood with brass tipping and a bolted boss.
- **Pilot:** rear seat. Leather helmet with ear pads, chin strap, brass goggles on the eyes and a crown on top. Brown
  coat with a fleece collar, royal sash, gold epaulettes and a purple silk scarf that streams aft. The right hand is on
  the stick and the left on the throttle lever.
- **Passenger:** at high quality only, a corgi in goggles and a red neckerchief in the front cockpit.
- **Cockpit:** a period black plywood panel with grain, brass bezels and placards ("BY ROYAL WARRANT / NO LOOPS WITHOUT
  A HAT", "FUEL: LOOK UP"). Four live dials (ASI, turn & slip, ALT, RPM) come from the shared instrument atlas, with
  static oil and clock dials, mag switches and the P-type compass. The stick, throttle quadrant and rudder bar animate.
  The eye is (0, 1.93, 3.30) with pitch −0.18, so the panel sits in the lower third at about a 66° vertical FOV. Portrait
  uses `viewEye`.
- **Livery** (`company || name`, `registration`):
  - The **name** goes large on both aft fuselage sides and on top of the left upper wing.
  - The **registration** goes small on the fuselage sides (aft), on top of the right upper wing and under both lower wings.
  - Primary is the fabric. Secondary covers the cowl, metal panels, centre section, wingtips, rudder and wheel covers.
  - Accent is the longeron cheat line and pinstripes.

## Royal Flying Bathtub
A cast-iron clawfoot slipper tub (2.48 × 1.06 m, rim 1.43 rising to 1.63 at the back) on four gilt cabriole legs with
ball-and-claw feet. **The rubber balls are the wheels.**
- **Tub:** a rolled gilt rim, white enamel inside, and water with soap foam.
- **Wings and tail:** stubby low wings (5.5 m) with gilt root fairings and finials. A twin towel-rail boom (gilt, with
  rungs, and a striped towel draped over it) carries the tail. The fin carries the crest, the name and a beacon.
- **Nose:** a telephone mixer tap with porcelain HOT/COLD cross-heads. The chrome gooseneck spout carries the brass
  three-blade propeller with a rose spinner and a gilt collar. `goldTaps` turns the taps gold.
- **Antenna:** a bath-plug chain stands up from the back rim like a whip, with the plug on top.
- **Co-pilot:** a big rubber duck in a leather cap and goggles, floating at the tap end, with a bobbing head.
- **Bather:** striped Victorian costume, frilly pink shower cap, crown and gold goggles. The right hand holds the
  back-brush control column and the left hand holds the red-knobbed gilt throttle lever on the rim.
- **'Cockpit':** a gilt bath caddy across the tub, with a tilted walnut instrument board carrying five brass-bezelled
  live dials (AIRSPEED / ALTITUDE / HORIZON / PROP REVS / BATHWATER), a bar of soap and a candle. The eye is
  (0, 1.77, 2.45) with pitch −0.17: the caddy is in the lower third, and the duck and taps are ahead.
- **Livery:**
  - Tub sides: primary enamel with a secondary band under the rim, gilt bands, a double gilt coachline panel with
    curled corners, the crest, the name in gilt italic serif and the registration under it.
  - Wings: secondary with primary tips; registration on top of the right wing and under the left.
  - Fin: the crest and the name.
  - The gilt is real metal: a metalness/roughness atlas drawn alongside the colour atlas.

## Budgets (measured with `__measure` + LOD traversal; whole rig incl. pilot; headless Chrome, ANGLE Metal)
| | Tiger high | Tiger low | Bath high | Bath low | C172 low (ref) |
|---|---|---|---|---|---|
| chase calls (no culling) | 16 | 16 | 17 | 17 | 20 |
| cockpit / center calls | 12 | 12 | 11 | 11 | 16 |
| chase tris, whole rig | 35.6k | 13.2k | 37.6k | 14.5k | 27.9k |
| exterior tris (9 meshes) | 24.8k | 9.2k | 29.0k | 11.1k | 14.0k |
| far (`plane-far`, 1 call) | 4.1k | 4.1k | 3.2k | 3.2k | 4.7k |
| far2 (`plane-far2`, 1 call) | 3.1k | 3.1k | 2.4k | 2.4k | 2.7k |
| shadow proxy at low (1 call) | n/a | 3.1k | n/a | 2.4k | 2.7k |
| LOD distances (m) | 240 / 840 | 140 / 490 | 220 / 770 | 130 / 455 | 150 / 525 |

Low-tier target: ≤ 25 calls and ≤ 30k exterior tris. Both types meet it (16–17 calls; 9.3k and 11.1k exterior tris).
Build time is 30–80 ms per rig after the first module load. `setLivery` takes 1–3 ms (the bathtub draws two canvases).
Textures:
- Livery atlas: 2048² (high) or 1024² (low). The bathtub adds a 1024² metal/rough atlas.
- Panel canvas: 1024 or 512 wide.
- Instrument atlas: the shared one.

## Flight model (`data/aircraft.js` → `AIRCRAFT.<id>.flight`)
Each `flight` block is in exactly the shape of `TYPES.c172` in `js/flight/aircraft.js` (SI units; speeds in m/s via KT).
TRAFFIC can do `TYPES.tiger = AIRCRAFT.tiger.flight`. Roster `status` is `'model'` (model built, flight model pending),
so the score HUD still shows "(soon)".

I verified both blocks in node against the unmodified `Aircraft` class by injecting `TYPES` from a scratch harness. The
same harness gives the C172 667 fpm, close to the book 730.

| | stall (idle, held level) | max level | 75 % level | climb @Vy full | glide @Vapp |
|---|---|---|---|---|---|
| tiger | 40.8 kt | 90+ kt | 82 kt | 580 fpm @ 62 kt | 8.5 : 1 |
| bathtub | 37.3 kt | 70 kt | 59 kt | 568 fpm @ 51 kt | 4.8 : 1 |

The bathtub's `wingArea: 15` is a game value. The visible stubby wings are about 5.4 m²; the tub "lifts by decree".

## What `js/flight/aircraft.js` must change (TRAFFIC owns it; I did not edit it)
**1. Per-wheel heights (taildragger).**
- Today every wheel sits at `y = -(gearHeight + preload)` and the third wheel is assumed to be a nose wheel.
- Use `gear.mainY` / `gear.tailY` (body-frame y of the contact points) when present.
- Static load split from geometry: `tailShare = |main.z| / (tail - main.z)` (about 0.11 for the Tiger), not the fixed 0.2.
- I prototyped this as a subclass in node:
  - It rests at 11.6° with wheel loads 3195 / 3195 / 1238 N.
  - With full power and forward stick from 25 kt, the tail comes up at 37 kt.
  - With back stick at 42 kt it lifts off at 44 kt after 126 m (book about 160 m).
  - It records no events.
- With the current code it sits level, has no AoA on the roll, and only gets airborne at 80 kt after 618 m.

**2. Tailwheel steering.** The wheel is aft of the CG, so steering must turn the other way from the nose wheel
(`steer = +rudder * maxSteer`). It should also castor freely beyond `maxSteer` when the rudder is neutral or the load
is light.

**3. Ground loop.** With the mains ahead of the CG, the existing lateral wheel friction is directionally *unstable*,
and ground loops will appear on their own. Tune the lateral grip, or add yaw damping on the ground, so it is lively
but survivable (the DESIGN note says "ground-loops if you let it").

**4. `place()` on the ground.** When `P.groundPitch` is set, use `pitch = P.groundPitch` and `y = ground + P.restHeight`
(Tiger 0.194 rad and 1.13 m; the sim settles at 1.11). The rig's `dims` carries the same numbers.

**5. `tailSkid` and `hardPoints`.**
- The generic `tailSkid (0, −0.2·gh, 0.5·L)` lies below ground in the 3-point attitude, so the tailstrike event fires
  every frame. Use `P.tailSkid` (Tiger `[0, −0.09, 4.7]`, the rudder bottom; clearance at rest is about 8 cm).
- Use `P.hardPoints` when given. They hold:
  - the Tiger's lower wingtips (it scrapes a lower tip at about 13° of bank on the ground);
  - the prop tips (nose-over or prop strike when braking hard in the 3-point attitude);
  - the bathtub's low wingtips (about 20°).
- `tailstrike` should be suppressed while the tailwheel is the thing touching.

**6. Flags.** `noseDown` becomes `tailDown` for taildraggers. A 3-point touchdown (mains and tail together) should still
grade from the main gear.

**7. Bathtub feet.** The front pair is two wheels (`gear.noseTrack: 0.43`), not one centred nose wheel, and they castor.
The current single-nose code works as a fallback.

**8. Bathtub roll wobble.** Add `tz += P.rollWobble.amp * sin(2π·hz·t) * eff` in the air (`{ amp: 0.22, hz: 0.45 }`).
DESIGN says it "wobbles in roll".

**9. RPM.** `instruments().rpm = 600 + eng·2100 + …` is specific to the C172. Use `AIRCRAFT[type].engine.idleRpm/maxRpm`
(Tiger 650–2350, bathtub 700–2700). The rig spins the prop and drives the tach from it.

**10. Autopilot (`autopilot.js`).**
- Taildragger takeoff: hold the stick slightly forward to lift the tail at about 0.8·Vr, then rotate gently.
- Landing: flare to about `groundPitch` for a 3-point touchdown, not the C172's flare attitude.
- Use the per-type `vr/vy/vapp/vcruise`; `circuitScale` and `patternAltM` are set in the roster.
- There are no flaps (`flapNotches: [0]`).

**11. `fuelCap`.** This is per tank, as for the C172: Tiger 43, bathtub 40.

Until 1–5 land, a Tiger flown on the fallback fields (`gear.nose`) works but takes off level and late.

## Not in this lane / for GAMEPLAY
- `main.js`, `attract.js` and `preview.js` all hard-code `type: 'c172'`. Picking a plane only needs `type` passed through.
  The rig API is identical.
- Parked or preview placement of a Tiger needs `restHeight` and `groundPitch` (see API additions).

## Known gaps / next
- **Tiger dials:** they reuse the C172 atlas, so the airspeed indicator is in knots with coloured arcs and the turn &
  slip is a modern turn coordinator. Period faces (mph, needle and ball, no Kollsman window) would need a few extra
  faces in `instruments.js` (PLANE C172 file, not touched).
- **Bathtub:** the claws on the ball feet are thin talons. A sculpted paw would read better. The candle has no glow.
  The towel is a single folded sheet.
- **Fabric surfaces:** there is no normal map, and rib tapes are texture only.
- **Far LOD:** the bath has no pilot or duck.
- **Animation gaps:**
  - Feet and legs don't follow the rudder bar.
  - The tailwheel doesn't steer visually.
  - The plug chain doesn't sway.
- **Blind critic (2026-10-22):**
  - Tiger 5/10, bathtub 4/10 against Nintendo-level polish.
  - Fixed after it: matte doped fabric, no "radiator grille" cowl, a narrower cowl, smaller windscreens without side
    posts, a thinner coaming, a bigger duck, a thicker boom and spout, and a gilt prop collar.
  - Still open: period dials, sculpted paws, foam volume, a stronger bathtub silhouette for the boom and fin, and
    spoked wheels.

## Screenshots (`docs/shots/planes/`)
- **Tiger:** `tiger_34_{1280x800,390x844}`, `tiger_side_{1280x800,390x844}`, `tiger_top_1280x800` (top-wing livery),
  `tiger_cockpit_{1280x800,390x844}`, `tiger_center_1280x800`, `tiger_pilot_close_1280x800`, `tiger_low_34_1280x800`.
- **Bathtub:** `bathtub_34_{1280x800,390x844}`, `bathtub_side_{1280x800,390x844}`, `bathtub_cockpit_{1280x800,390x844}`,
  `bathtub_gold_close_1280x800`, `bathtub_low_34_1280x800`, `bathtub_default_livery_1280x800`.
- **Test page:** `tool_ui_1280x800`.
- Cockpit shots use a 66° FOV (landscape) and `viewEye` (portrait).

## Jets geometry (JETMODELS-A: `jumbo`, `herc`) — FINAL 2026-10-27
Same conventions as the Tiger/Bathtub `flight` blocks: **root-local, origin on the CG, x right, y up, z aft (+z = toward
the tail), metres, real sizes**. `gear.main = [halfTrack, z]`, `gear.nose = z`, `mainY` / `noseY` = y of the **wheel
bottoms** relative to the CG (unloaded; add your own preload). Both are tricycles that sit level:
`groundPitch: 0`, `restHeight = gearHeight`. Inside the rig files the build frame is y = height above ground with the
wheels on y = 0 and z = station aft of the nose tip; local = build − CG. Every number below is read off the built
model (tail-strike angles computed from the section tables against the rearmost main-wheel contact).

### `jumbo` — Royal Jumbo (747-400-ish)
| | |
|---|---|
| dims | **length 70.6, span 64.4 (winglets incl.), height 19.4** to the fin tip (the gold crown on top reaches 20.6); wing area 525 m²; fuselage width 6.5 |
| CG (build) | station 32.6, 4.8 m above ground → `gearHeight: 4.8`, `restHeight: 4.8`, `groundPitch: 0` |
| gear for the 3-point code | `gear: { main: [3.65, 2.4], mainY: -4.8, nose: -23.8, noseY: -4.8 }` — averaged main pair, wheelbase 26.2 m, nose share ≈ 9 % |
| real gear layout | 18 wheels, r 0.62 (nose r 0.60). Nose: 2 wheels, z −23.8, x ±0.38. Wing-gear bogies x ±5.4, axles z 0.27 / 1.73. Body-gear bogies x ±1.9, axles z 3.07 / 4.53. Each axle has wheels at bogie x ±0.56. Rearmost contact z 4.53 |
| eye (captain) | `eye: [-0.55, 4.25, -27.1]`, pitch −0.12 rad · `eyeCenter: [0, 4.3, -26.95]`, pitch −0.10 |
| tailSkid | `[0, -1.88, 19.55]` — aft belly at station 52.2; strikes at **11.0° nose-up** on the rear body gear |
| hardPoints | `nose: [0, -0.2, -32.6]`, `tail: [0, 2.9, 38.0]`, `wingL: [-31.2, 1.94, 17.5]`, `wingR: [31.2, 1.94, 17.5]`, `engL1: [-11.9, -3.45, -4.2]`, `engR1: [11.9, -3.45, -4.2]` (inboard pod bottoms), `engL2: [-21.0, -2.35, 4.0]`, `engR2: [21.0, -2.35, 4.0]` (outboard pod bottoms — strike at ≈ 9.4° bank on the ground, wingtip ≈ 15°), `belly: [0, -2.87, 0]` (fairing bottom) |
| engines (FX / sound) | fan-face centres `[±11.9, -1.95, -4.42]` (inboard) and `[±21.0, -0.85, 3.78]` (outboard); core exhaust 5.6 m and plug tip 6.65 m aft of each inlet lip (lips at z −5.2 / +3.0) |
| flaps / surfaces | inboard + outboard Fowler flaps per side (rotate to 30° and run 0.9 m aft), outboard ailerons, split elevators, one rudder |

### `herc` — Royal Hercules (C-130H-ish)
| | |
|---|---|
| dims | **length 29.8, span 40.4, height 11.66** (crown on the fin tip to 12.4); wing area 162 m²; fuselage width 4.3 |
| CG (build) | station 13.2, 2.6 m above ground → `gearHeight: 2.6`, `restHeight: 2.6`, `groundPitch: 0` |
| gear for the 3-point code | `gear: { main: [2.175, 1.1], mainY: -2.6, nose: -8.6, noseY: -2.6 }` — wheelbase 9.7 m, nose share ≈ 11 % |
| real gear layout | mains: tandem pair each side in the sponsons, r 0.7, x ±2.175, axles z 0.4 / 1.8 (rearmost contact z 1.8). Nose: twin, r 0.48, x ±0.28, z −8.6 |
| eye (pilot, left) | `eye: [-0.6, 1.35, -10.3]`, pitch −0.10 · `eyeCenter: [0, 1.4, -10.15]`, pitch −0.08 |
| tailSkid | `[0, -1.99, 4.6]` — the aft end of the sponsons hits first, at **12.4° nose-up** (the ramp hinge corner `[0, -1.67, 5.5]` follows at ≈ 14°) |
| hardPoints | `nose: [0, -0.1, -13.2]`, `tail: [0, 1.88, 16.6]`, `wingL: [-20.2, 2.62, -0.1]`, `wingR: [20.2, 2.62, -0.1]`, `belly: [0, -2.08, 1.1]` (sponson bottoms), `tankL: [-14.8, 0.71, -0.7]`, `tankR: [14.8, 0.71, -0.7]` (external tank bottoms), `propTipL: [-4.95, -0.455, -6.2]`, `propTipR: [4.95, -0.455, -6.2]` (lowest inboard blade tips — the four 4.11 m props sit at x ±4.95 / ±10.2, hub y +1.6, prop plane z −6.2) |
| props (FX / sound) | 4 × 4-blade, all turning the same way, hubs `[±4.95, 1.6, -6.2]`, `[±10.2, 1.6, -6.2]`; nacelle exhaust stacks on the outboard side ≈ 3.5 m aft of each hub |
| surfaces | 2 Fowler flaps per side (36°, 0.5 m aft), ailerons, split elevators, rudder, and the **rear ramp** (`setRamp`) |

### Changed since the provisional numbers (data/aircraft.js still has the provisional ones)
- jumbo: `eye [-0.55, 4.25, -27.1]` (was −26.9), `eyeCenter [0, 4.3, -26.95]` (was −26.75), `tailSkid [0, -1.88, 19.55]`
  at 11.0° (was 19.4 / 9.8°), `nose` y −0.2, `wingL/R` y 1.94, `engL1/R1 [∓11.9, -3.45, -4.2]` (z was −2.6),
  `belly [0, -2.87, 0]` (was −2.6: the wing-root fairing hangs lower than the fuselage).
- herc: `eye [-0.6, 1.35, -10.3]` (was −10.6), `eyeCenter [0, 1.4, -10.15]`, `tailSkid [0, -1.99, 4.6]` at 12.4° (the
  sponson tails strike before the ramp hinge, which is `[0, -1.67, 5.5]`), `nose [0, -0.1, -13.2]`, `tail [0, 1.88, 16.6]`,
  `wingL/R [∓20.2, 2.62, -0.1]`, `belly [0, -2.08, 1.1]` (sponson bottoms), new `tankL/R [∓14.8, 0.71, -0.7]`; height 11.66.
- Gear contacts, CGs, gearHeight/restHeight and the prop positions are unchanged.

### Rig API additions for the big types (additive; `js/plane/types/jetkit.js` `finishBig`)
- `rig.setGear(v, instant?)` — 1 = down, 0 = up; travel ≈ 7 s; also `rig.setControls({ gear })`. `rig.gear()` returns the
  shown position (0..1). Gear telescopes into the belly / sponsons and is hidden (0 calls) when up. Far LODs carry their
  own unmerged gear so AI traffic on approach still shows wheels. `createPlane({ ..., gear: 0 })` starts it up.
- `rig.setStairs(bool)` (jumbo) — the royal airstair with a red carpet at the L1 door (left, station 9.3). Off by default.
- `rig.setRamp(0..1)` (herc) — lowers the cargo ramp (≈ 5 s, 30°) onto the royal crate in the hold.
- `rpm`: **jumbo = N1 %** (JETCORE's convention, idle 22 .. 100); values above 120 are taken as fan rpm (÷ 33). Fans spin
  visibly at 0.5–6 rev/s across N1 15–100 and the EICAS shows the same N1. **Herc = prop rpm** (735 idle .. 1020): the blades
  are always drawn and spin at a readable 0.6–3.2 rev/s (a true 17 rev/s 4-blade prop strobes at 60 fps); a blur disc
  fades in over them from ≈ 500 rpm (the herc owns this curve; the rig's is tuned for 2700-rpm pistons). EICAS shows
  rpm/1020 as %. With no `rpm` sent the rig maps throttle 0..1 to N1 22..100 (jumbo) / 600..1020 rpm (herc).
- The glass flight deck shows `airspeed/altitude/heading/pitch/roll/rpm/flaps/fuelL/fuelR` from `updateInstruments`
  and the gear position from the rig; PFD + ND + EICAS + status page (it reads `GEAR DOWN/UP/IN TRANSIT`).

## JETMODELS-A: the big types (`jumbo`, `herc`)
Same PlaneRig as the other `types/` (`assembleRig`), plus the additive gear / stairs / ramp API above. Viewer:
`tools/jetview.html?type=jumbo|herc` (big-scene version of `plane.html`: shadow box and orbit scale with `dims`;
params `view=chase|cockpit|center`, `az/el/dist/fov/tx/ty/tz`, `q=low`, `gear=0..1`, `stairs`, `ramp=0..1`,
`throttle/flaps/aileron/elevator/rudder`, `rpm`, `ias/alt`, `shot`, `spin`; `__measure(view, level?)` and `__lodTris()`).
`tools/plane.html?type=jumbo|herc` also works (its camera and shadow box are C172-sized).

### Files
| file | what |
|---|---|
| `types/jetkit.js` | Polar fuselage sections: superellipse body **soft-unioned** with an upper-deck hump ellipse and a belly-fairing / sponson ellipse (`sectionTable`, `secR`, `secPt`, `secHalfWidth`), `loftFuselage`, `skinPatch` (glass panes standing 2 cm proud of the skin), `wingPanel`, the **spin shader** (`spinPatch` + `spinMesh`: every fan/prop of a type in ONE mesh, each vertex rotating about its own `hub` attribute), `propProxy` (inert stand-ins for the rig's propGroup/propMesh/disc), `wheel`, and the shared rig glue `animateBig` / `finishBig` / `COCKPIT_STICK`. |
| `types/glass_cockpit.js` | Shared airliner/transport flight deck, parametric on the type's section function: inner shell that follows the skin with the windows as **real holes** (knots on every window edge, rubber reveals), purple carpet, glareshield deck + MCP, main panel (atlas), **live glass displays** (PFD, ND, EICAS, status; 4 cells in one texture, per-cell `texSubImage2D` like `instruments.js`, redrawn only when the quantised reading changes and only while drawn), pedestal with 4 thrust levers + flap lever, overhead panel, purple velvet seats with gold piping, two yokes (the captain's rides the rig's stick pivot, the F/O's copies it), a gold crown "compass" and a royal teacup. `glassPilot` = the Tiger's aviator in the left seat, both hands on the yoke horns, only drawn from inside (the glass is opaque from outside). |
| `types/jumbo.js` | Royal Jumbo: sections, wing/tail planforms, livery atlas (+ metal/rough atlas for the gold), exterior, `createJumbo()`. |
| `types/herc.js` | Royal Hercules: same structure, plus the hinged ramp and the herc's own prop blur. `createHerc()`. |
| `livery.js` | additive `ROYAL` palette export (purple, gold, military greens). |
| `index.js` | two lines in `TYPE_BUILDERS`: `jumbo`, `herc`. |
| `tools/jetview.html` | the viewer above. |

### Royal Jumbo
- **Fuselage:** one closed loft, 44 points round (24 low). The hump is a separate ellipse soft-unioned onto the main
  section, so the 747 hump has its concave waist where it meets the body and runs down into the nose and windscreen.
  The belly fairing is the third ellipse over the wing root. Tail cone sweeps up to the APU exhaust (11.0° tailstrike).
- **Wings:** 40° LE sweep, trailing-edge kink at x = 12 (yehudi), 7° dihedral, washout, thickness 13.5 → 8.5 %;
  canted purple winglets with gold caps; four flap-track canoes per side; inboard + outboard Fowler flaps, outboard
  ailerons. Split elevators (swept hinges), single rudder.
- **Engines:** purple nacelles with **gold inlet lips** and a gold cowl band, dark inlet duct, titanium core cowl,
  exhaust plug, pylons. Fans: 22 wide-chord twisted titanium blades (16 low) and a spinner with a **white swirl** so you
  can see it turn; all four fans are one draw call through the spin shader.
- **Gear:** 18 wheels — twin nose gear, two 4-wheel wing-gear bogies and two body-gear bogies, chrome legs, braces.
- **Royal touches:** a 3D **gold crown on the fin tip** (velvet cap, pearls, ruby, cross); purple fin with a gold
  crest and sunburst; "ROYAL" in gold on the hump; gold crown + gold-outlined L1 door, crest under the cockpit;
  `setStairs(true)` rolls out a purple airstair with a **red carpet** and gold handrails onto a red carpet on the ground.
- **Livery:** the player's primary is the upper fuselage, their name goes over the wing in italic caps, their
  registration aft and under the left wing (faint on top of the right), their accent is a pinstripe on the cheat
  line. Purple belly, gold cheat line, grey wings and tail are fixed (`ROYAL`), so it always reads royal.
- **Flight deck:** upper deck at y 7.95; eye 9.05 (≈ 8.7 m in the real thing); windows 1/2/3 per side as real holes.

### Royal Hercules
- **Fuselage:** blunt C-130 nose with the black radome low and the windscreen above it; sponsons (third ellipse)
  hold the tandem main gear; the wing centre section sits on top under a fairing (second ellipse); upswept tail.
  The lower aft fuselage between stations 18.7 and 24.6 is a separate hinged **ramp** with a cargo floor on its
  inside; behind it there is a dark hold with a cargo floor and a **royal crate with a gold crown** on it.
- **Wing:** high, straight, constant-chord inner panel then taper, 2.5° outer dihedral, Fowler flaps, ailerons; the
  classic **external fuel tanks** on pylons. **HF wire** from the cockpit roof to the fin.
- **Engines:** deep T56-style nacelles with oil-cooler scoops and outboard exhaust stacks; **purple spinners with
  gold collars** (static in the trim mesh — bodies of revolution need no spin) and four broad paddle blades per
  prop, black with **gold tips**, all 16 blades in one spin-shader mesh; prop disc = all four discs in one mesh.
- **Livery (royal-military):** grey-green with a grey belly, black radome, purple-gold-(player secondary) **royal
  roundels** with a crown on the fuselage and wing tops, a **fin flash** in purple / gold / player-secondary with a
  gold crown above it, "ROYAL AIR FARCE" along the cabin, the player's name under the cockpit, the registration as
  the serial on the fin and rear fuselage, a crest as nose art, and a gold crown on the fin tip.
- **Flight deck:** the same glass cockpit with C-130 glazing: front panes, lower-front side panes, side windows and
  the eyebrow windows overhead are all real holes; chin windows are exterior only (they are below the flight-deck floor).

### Budgets (`tools/jetview.html`, `__measure` + LOD traversal; headless Chrome, ANGLE Metal; rig only, no shadow pass)
| | Jumbo high | Jumbo low | Herc high | Herc low | C172 low (ref) |
|---|---|---|---|---|---|
| chase calls (default camera) | 14 | 14 | 17 | 17 | 18 |
| cockpit / center calls (from the seat, frustum-culled) | 9 / 11 | 9 / 11 | 10 / 13 | 10 / 13 | 22 |
| chase tris | 35.8k | 18.1k | 26.3k | 11.3k | 34.8k |
| near level, everything (cockpit + pilot incl., stairs hidden) | 50.5k | 29.2k | 37.8k | 19.1k | — |
| near level, `cockpit:false` (AI / preview) | — | 22.6k (1.9k of it the hidden stairs) | — | 12.7k | 14.1k |
| far (`plane-far`: 1 merged call + 1 gear call while down) | 3.7k | 3.7k | 1.8k | 1.8k | 5.0k |
| far2 (`plane-far2`) | 2.7k | 2.7k | 1.5k | 1.5k | 2.9k |
| shadow proxy at low (1 call) | — | 2.1k | — | 1.2k | 2.6k |
| LOD distances (m) | 900 / 3150 | 520 / 1820 | 520 / 1820 | 300 / 1050 | 150 / 525 |
| build time (after module load) | ~200 ms | ~160 ms | ~190 ms | ~120 ms | |

Low-tier target (≤ 25 calls, ≤ 30k exterior tris): met by both. The jumbo is the AI-traffic type: past 520 m (low) it
is 3.7k tris in 2 calls, past 1820 m 2.7k; with the gear up the far gear call disappears. Far levels drop the
control-surface splits, canoes, nacelle internals, fan blades, crown detail and use 6–8-sided cylinder wheels.
Textures: livery atlas 2048² high / 1024² low + a 1024² metal/rough atlas each; flight deck: panel atlas 1024²/512²,
display texture 1536×384 (high) / 1024×256 (low).

### Screenshots (`docs/shots/jets/`)
- **Jumbo:** `jumbo_34_{1280x800,390x844}`, `jumbo_side_1280x800`, `jumbo_chase_{1280x800,390x844}` (close chase from
  behind), `jumbo_cockpit_{1280x800,390x844}` (portrait uses `viewEye`), `jumbo_center_1280x800`, `jumbo_low_34_1280x800`,
  `jumbo_far_1280x800` (far LOD), `jumbo_inflight_1280x800` (gear up), `jumbo_stairs_1280x800`, `jumbo_engine_1280x800`,
  `jumbo_flaps_1280x800` (flaps 30°, full aileron/elevator/rudder).
- **Herc:** `herc_34_{1280x800,390x844}`, `herc_side_1280x800`, `herc_chase_{1280x800,390x844}`,
  `herc_cockpit_{1280x800,390x844}`, `herc_center_1280x800`, `herc_low_34_1280x800`, `herc_far_1280x800`,
  `herc_inflight_1280x800`, `herc_ramp_1280x800` (ramp down, crate), `herc_props_1280x800` (≈ 730 rpm: blades + faint disc),
  `herc_props_spin_1280x800` (1020 rpm, disc over the blades).

### Known gaps / next (JETMODELS-A)
- The game's `FLYABLE` list (main.js) and the hangar picker do not include `jumbo`/`herc` yet (MSGFIX / JETCORE), so
  `?plane=jumbo` still boots a C172; the models were verified in `jetview.html`, `plane.html` and in the game page's
  own module context (create → controls → cockpit view → livery → dispose, both types, both qualities, no errors).
- Gear retraction is a telescoping squash into the belly (no doors, no leg folding).
- No passenger cabin interior behind the painted windows; the herc's upper aft cargo door does not open.
- Herc prop disc uses the shared C172 disc texture (2.2× opacity); a broad-blade disc texture would read better.
  Far LODs drop prop blades and discs (as the C172 does), so a distant herc shows spinners only.
- The windscreen frames inside are plain shell strips; no wipers moving, no HUD (C-130J) and no sun visors.

### `f35` — Royal Tantrum (F-35B-ish) — JETMODELS-B, measured on the built model
Same conventions as above (root-local, CG origin, x right, y up, +z aft, metres). Build frame in `js/plane/types/f35.js`:
y = height above ground (wheels on y = 0, datum level), z = station aft of the radome tip; local = build − (0, 2.0, 8.6).
- dims: **length 15.6, span 10.7, height 4.25** (fin tips; real 4.36); wing area 42.7 m² (planform built to 42.5).
- CG (build frame): station 8.6, 2.0 m above ground → `gearHeight: 2.0`, `restHeight: 2.0`, `groundPitch: 0` (tricycle,
  sits level; the rig's `dims` carries all three).
- Gear: single nose wheel r 0.27 at station 3.75, main wheels r 0.42 at station 9.55, track 3.3:
  `gear: { main: [1.65, 0.95], mainY: -2.0, nose: -4.85, noseY: -2.0 }` (wheelbase 5.8 m, nose share ≈ 16 %).
- eye: `eye: [0, 1.09, -3.9]` (pitch −0.12 rad), `eyeCenter: [0, 1.14, -3.84]` (pitch −0.1). Single seat on the centreline.
- `tailSkid: [0, -0.48, 7.0]` — bottom of the nozzle lip (nozzle aft). Tailstrike ≈ 14° nose-up on the mains.
- hardPoints:
  `nose: [0, 0.01, -8.6]`, `tail: [0, -0.02, 7.0]` (nozzle exit centre),
  `wingL: [-5.35, 0.09, 1.98]`, `wingR: [5.35, 0.09, 1.98]` (tip mid-chord; strike at ≈ 29° bank on the ground),
  `stabL: [-3.35, 0.0, 7.0]`, `stabR: [3.35, 0.0, 7.0]` (stabilator tip trailing edge),
  `finL: [-1.85, 2.24, 5.3]`, `finR: [1.85, 2.24, 5.3]` (canted fin tips, for upside-down scrapes),
  `belly: [0, -0.8, 0.2]`, `nozzle: [0, -0.48, 7.0]` (nozzle aft, same as tailSkid),
  `nozzleDown: [0, -1.03, 6.13]` (lowest point of the nozzle swivelled fully down, 95°; 0.97 m above the ground).
- Engine points (for sound / FX / ground blast): intakes x ±1.1, y 0.3, z −3.2; nozzle exit centre `[0, -0.02, 7.0]`
  pointing +z when aft, `[0, -0.99, 6.13]` pointing `(0, -0.996, -0.087)` at 95° (use `rig.exhaust()` at runtime, it
  follows the swivel); lift-fan hub `[0, 0.3, -1.875]`, blowing straight down (`rig.liftFanPos()`). Nozzle bearings at
  z 5.92 and 6.32, y −0.02.
- **Differences from the provisional `f35.flight` in `data/aircraft.js`** (JETCORE's file, not edited): gearHeight 1.9 → 2.0,
  `main [1.7, 1.0]` → `[1.65, 0.95]`, `nose -4.7` → `-4.85`, eye `[0, 0.95, -4.5]` → `[0, 1.09, -3.9]`, tailSkid
  `[0, -0.52, 7.5]` → `[0, -0.48, 7.0]`, hardPoints nose `y -0.8` → `0.01` (the radome tip is at CG height), wings
  `[±5.35, -0.5, 2.5]` → `[±5.35, 0.09, 1.98]`, stabs `[±3.3, -0.3, 6.5]` → `[±3.35, 0, 7.0]`, belly `y -1.3` → `-0.8`,
  `tail [0, 2.5, 7.2]` is above the nozzle in empty air (fin tips are `finL/finR`), height 4.4 → 4.25.

## F-35B-ish `f35` — "Royal Tantrum" (JETMODELS-B, 2026-10-27)
`createPlane({ type: 'f35', ... })` → the standard PlaneRig (`types/rig.js`) plus the jet hooks below. Files:
`js/plane/types/f35.js` (spec, livery atlas, materials, exterior, hooks, `createF35`) and `js/plane/types/f35_cockpit.js`
(cockpit). `js/plane/index.js` gained one `TYPE_BUILDERS` line. Test: `tools/plane.html?type=f35` (the Type dropdown has
no f35 entry, the URL works); `window.__plane.setNozzle(1)` etc. from the console.

**Model.** Chined lofted fuselage (superellipse sections, crisp chine: upper and lower halves are separate lofts), caret
intakes with gold lip rims, dark mouths and DSI bumps; 34° swept wing with forward-swept trailing edge and flaperons;
all-moving stabilators; twin fins canted 24° with rudders; one-piece bubble canopy in gold-tinted (ITO-style) glass
with a gold rail and aft arch; single-wheel nose gear and trailing-link mains with gear doors; EOTS window under the
chin; blade antennas; wingtip nav/strobes, tail light, spine beacon. The skin has real openings for the cockpit and the
lift-fan well (triangles cut by centroid; a sill band that follows the curved skin covers the cut edge).
- **Pilot:** the shared `aviator.js` royal (leather helmet, goggles, crown, sash), seated on a Martin-Baker-ish seat,
  right hand on the sidestick, left hand on the throttle inceptor, legs forward. The scarf is held tucked (closed
  canopy: the rig feeds the aviator airspeed 0). `cockpit:false` (AI) rigs keep the pilot; their skin is not cut, so
  only head and crown show through a darker canopy.
- **Livery** (grey base whatever the player picks; the player's `primary` tints it 12 %):
  RAM grey with lighter/darker coating patches and sawtooth access panels; gold chine stripe with an `accent` pinline;
  gold leading edges on wings, stabs and fins; `secondary` tail flash; **royal crest and "HRH" tail code** on the outer
  fin faces with the `registration` in the flash; `display` name in gilt italic serif under the canopy; low-vis
  registration on the intakes; royal roundels (gold/purple/white/red with a crown) on the aft fuselage, left wing top and
  right wing bottom; gold crown + "HOVER DOOR - DO NOT SIT" on the lift-fan door; "ROYAL EJECTION" triangle. Colour atlas
  2048² (high) / 1024² (low) plus a metal/rough atlas 1024² / 512² so the gold is real metal.
- **Cockpit:** tub, side consoles, ejection seat with the yellow handle, one wide "HIS MAJESTY'S PANORAMIC DISPLAY"
  glass panel (canvas: flight window with live ASI / attitude / altimeter dials from the shared instrument atlas, a
  royal-estate moving map with a live heading dial, status lines STEALTH: MODEST / TEA: 2 CUPS / CORGI: SECURE,
  soft keys MAP ENG FUEL HOVER TEA WAVE), glareshield, gold HUD frame. HUD: a conformal pitch ladder that is only
  uv-scrolled/rotated by `pitch`/`roll` (no redraw) plus fixed symbology with speed/altitude/heading boxes redrawn at
  ≤ 5 Hz and only while the HUD is drawn. Sidestick on the rig's stick pivot, throttle slides with `throttle`.
  Hidden in chase: dials, HUD, stick, throttle. Both `cockpit` and `center` hide the pilot's head and torso (single seat:
  the centre eye is inside the helmet otherwise).

**Controls (`setControls`).** aileron → flaperons ±22° plus ±6° differential stabilators; elevator → stabilators ±18°
(+1 = TE up); rudder → both rudders ±25°; flaps → flaperons down 30° (mixed with roll). `throttle` moves the inceptor and
drives the automatic afterburner. `rpm` is accepted but unused (no propeller).

### Visual hooks (for the STOVL / flight / sound lanes)
All are on the rig object; targets are eased inside `rig.update(dt)`, so a lane just sets the state it wants.
| hook | meaning | travel |
|---|---|---|
| `rig.setNozzle(a, immediate = false)` | 0 = aft (CTOL, default) … 1 = 95° down (hover). Two swivel segments each turn half the angle (smoothstep). | ≈ 2.2 s full travel |
| `rig.setLiftFan(o, immediate = false)` | 0 = closed (default) … 1 = open: rear-hinged top door 0→72°, auxiliary inlet doors 0→32° (between 15 % and 85 % of the travel), two belly doors 0→86° (fully open at 80 %). The fan rotor in the well spins ∝ o². | ≈ 1.6 s |
| `rig.setAfterburner(v)` | `null` (default) = automatic, smoothstep of throttle 0.95 → 1.0; a number 0..1 overrides until `null` is passed again. Additive flame (two cones + exit glow, shock diamonds, flicker) that follows the nozzle. | ≈ 0.1 s |
| `rig.setGear(d, immediate = false)` | 1 = down (default), 0 = up. Near: telescopes into the belly and hides. Far LODs and the low-tier shadow proxy drop the gear when d < 0.5. | ≈ 2.4 s |
| `rig.jetState()` | `{ nozzle, nozzleDeg, liftFan, gear, afterburner, auto }` — current eased values (0..1, deg). | |
| `rig.exhaust(pos?, dir?)` | `{ pos, dir }` root-local (CG origin) at the nozzle exit, following the swivel. | |
| `rig.liftFanPos()` | root-local Vector3 of the fan hub (blows −y). | |

Cost: door and nozzle meshes are posed on the CPU only while their value changes (a few thousand vertices, no work when
settled). The far LODs show nozzle aft and doors closed. Values outside 0..1 are clamped.

### Budgets (`__measure` + LOD traversal; whole rig incl. pilot; headless Chrome, ANGLE Metal)
| | f35 high | f35 low | f35 low AI (`cockpit:false`) |
|---|---|---|---|
| chase calls (default camera) | 18 | 18 | 16 |
| chase tris, whole rig | 30.4k | 14.1k | 11.8k |
| cockpit / center calls, tris | 13, 25.0k | 13, 12.0k | n/a |
| exterior tris (14 meshes) | 24.0k | 11.5k | |
| far (`plane-far`, 1 call) | 2.9k | 2.9k | |
| far2 (`plane-far2`, 1 call) | 2.1k | 2.1k | |
| shadow proxy at low (1 call) | n/a | 2.1k | |
| LOD distances (m) | 340 / 1190 | 200 / 700 | |
Extra while active: afterburner +1 call (≈ 260 tris high / 60 low, additive, depthWrite off, no texture upload),
lift fan open +1 call (the rotor; hidden and free while the doors are shut). Low tier stays under the ≤ 25 calls / ≤ 30k exterior tris target.

### Screenshots (`docs/shots/jets/`)
`f35_34_{1280x800,390x844}`, `f35_side_1280x800`, `f35_rear34_1280x800`, `f35_top_1280x800`, `f35_chase_1280x800`,
`f35_afterburner_{1280x800,390x844}` (auto AB at full throttle, gear up), `f35_nozzle_down_1280x800`,
`f35_liftfan_open_1280x800`, `f35_stovl_hover_1280x800` (nozzle down + lift fan open, in the air), `f35_gear_up_1280x800`,
`f35_cockpit_{1280x800,390x844}` (portrait uses `viewEye`), `f35_center_1280x800`, `f35_pilot_close_1280x800`,
`f35_low_34_1280x800`, `f35_far_lod_1280x800` (far level forced), `f35_night_1280x800`, `f35_red_livery_1280x800`
(player colours on the royal grey).

### Not done / for other lanes
- `main.js` `FLYABLE` lists only c172/tiger/bathtub, so `?plane=f35` boots the C172 until integration adds `'f35'`.
- `tools/plane.html` Type dropdown has no f35 option (URL param works).
- No weapons-bay doors, refuelling probe, roll-post nozzles or DAS windows (painted panel lines only).
- The nozzle and lift-fan doors are neutral on the far LODs.

## Jets — flight side (JETCORE, 2026-10-27)
How `jumbo`, `herc` and `f35` fly; the full write-up is docs/FLIGHT.md "Jets". Same recipe as the Tiger/Bathtub: a
`flight` block in `data/aircraft.js` (now `status: 'ready'`) that `js/flight/aircraft.js` registers as `TYPES[id]`.
- **Geometry reconciled** with the built models (this file's "Jets geometry"): gearHeight jumbo 4.8 / herc 2.6 /
  f35 2.0, `gear.main/mainY/nose/noseY`, eye/eyeCenter, `tailSkid`, hardPoints (engine pods `engL1/engR1/engL2/engR2`,
  props `propL1..propR2`, F-35 `finL/finR`, `stabL/stabR`). Jets take these from the block, not from `rig.dims`.
- **Jet fields** (all optional; light types unaffected): `engineKind`, `jet`, `noField`, `thrustLapse`, `spool`,
  `abThrust/abFrom`, `reverse`, `spoilers`, `speedbrake`, `vWall/CDwall`, `aoaLimit`, `flapRate`, `burnLph`, AP tuning
  `rotPitch/toFlaps/flareAgl/brakeAP/apBankScale/maxPitchAP`.
- **Rig hooks main.js should drive** (integration): `rig.setGear(ac.gear)` (automatic gear: up climbing away > 40 m,
  down below 250 m slow/descending, 7 s travel), `rig.setAfterburner(ac.ab)` (f35; or null = from throttle),
  engine voice `setRPM(ac.n1 * 100)` + `setAfterburner(ac.ab)` with `ac.engineKind` (docs/AUDIO.md). The herc's props:
  `instruments().rpm` is prop rpm (735–1020).
- Roster: Royal Jumbo (king, ppMult 0.8, wake super), **The Royal Wardrobe** (Hercules, duke, 0.9: "carries the King's
  spare crowns"), **Royal Tantrum** (F-35, prince, 0.85). STOVL (D35) is modelled now: hover, vertical
  takeoff and vertical landing from the LAND slot's context button; the flight core drives `setNozzle/setLiftFan`.
  Controls, thresholds and difficulty: docs/STOVL.md.

