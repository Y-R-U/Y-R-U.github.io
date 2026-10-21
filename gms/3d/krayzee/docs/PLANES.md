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
