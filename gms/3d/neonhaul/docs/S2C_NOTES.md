# S2-C — vehicles: silhouettes, edge lighting, the reflective read, road transports

Aaron, having flown the shipped build:

> *"The cars/vehicles have little variation from what I can see. They look ok as-is, but no
> variation, i mention possible lights highlighting some edges that could be varied per vehicle,
> and some different height/length vehicles? Maybe 2 or 3 other shapes as well, But I am not
> seeing one of the main goals of making them look reflective/glassy/futuristic atm."*

and, separately:

> *"for now I just want a few longer vehicles that could represent buses/trams/long transports -
> but traveling on the roads..."*

`shots/s2c/before_family.png` is the state he was describing: nine near-identical lozenges, no
visible canopy on any of them, and — with the reflection switched off, which is what the shipped
material effectively was — flat coloured decals. Compare `shots/s2c/c1_city_refl_off.png` against
`shots/s2c/c1_city_refl_on.png`; that pair is the whole phase in two frames.

---

## The diagnosis, and why the colour pass did not fix it

The per-craft colour variety Aaron asked for in pass 1 **did** land — three seeded bytes per craft
at `traffic.js:_derive`, and `gates_p5` measures 8/8 body colours, 8/8 trim colours, 6/6 trim runs
and 21.8 % of the fleet carrying no trim at all. It was working. It was painting **two shapes**,
because `TYPES` held exactly `taxi_ai` and `hauler_ai` plus `patrol`.

And the material could not read as reflective for a reason this file's own comments already
recorded without following through: **the envMap is a PMREM of a four-stop sky gradient.** It
contains no edges. A material reflecting it gets a smooth wash at any roughness, and a wash on a
0.005-linear hull is indistinguishable from flat paint. Turning the roughness or the intensity up
does not add structure; it just makes the hull the colour of the sky, which is how the first three
passes ended up with red craft.

So the two missing axes were **silhouette** and **structure in the reflection**, and neither is a
tuning number.

---

## What changed

### `js/craft.js`

**Two more integer options on §5.1's family, by §5.1's own mechanism.** `kit` (0–3) selects a
bolt-on module group on a flying hull; `road` (0–3) selects a road form. Both are per-instance
selectors over parts baked into the **same** body geometry and collapsed to a degenerate point in
the vertex shader, exactly as `nac` and `fin` have always been. There is still one body geometry,
one canopy geometry and one draw call each.

- `aPart` 21–23 — module kits: dorsal spine rail · flank sponsons · cargo stack.
- `aPart` 31–33 — road forms: bus · articulated bus · three-car tram/transport.
- Kits and road forms match on **equality**, not on a count. A cargo stack is not a superset of a
  spine rail and a tram is not a bus with a box added, so nesting them would impose an ordering
  that does not exist.
- `aPart` 0 (the flying hull core, its caps and its belly plate) now collapses when `road > 0`.

**`aCT` widened from vec2 to vec4** — `(shoulder, station t, keel, spine)`. Widening an existing
attribute costs no additional attribute slot, which is why the two new edge channels went there
rather than into a second attribute (this shader's slot pressure is what the header's blank-frame
bug is about). On a road form the spine channel is reused as the **lit window band mask**: a bus
has no dorsal spine and does have windows.

**One new instanced attribute, `iVar`** = `(kit, road, edgeMode, pulseRate)`.

**Six edge-light modes** over the three baked channels — shoulder · shoulder+spine · keel ·
spine · shoulder+keel · keel+spine — plus an optional travelling bead along the run. Both are
per-instance, seeded in `traffic.js` from their own hash so the existing colour bytes did not
move.

**The procedural city reflection** (`cityRefl` in the fragment shader, on both the hull and the
canopy). The world-space reflection vector is reconstructed with three's own
`inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix)` — the same two
lines `envmap_physical_pars_fragment` uses — and fed to a procedural night city: vertical slabs of
window light in a tight band around the horizon, a rarer saturated sign among them, warm sodium
below. Fresnel-weighted, so it lands as a bright rim around the silhouette and a slide across the
crown rather than as a coat of paint. **No texture, no probe, no render target, no draw call.**

The **world-position term is the load-bearing half**. Without it the pattern is fixed in world
direction and only moves when the craft turns; with it, flying two blocks changes which slab a
given direction picks up — which is what "a sign going past" is.

**The canopy was rebuilt.** It carried a constant `opacity: 0.55` over a near-black metal, which is
a slightly grey patch on a black hull from every angle — hence no visible windscreen anywhere in
`before_family.png`. Its alpha now rides the fresnel (0.24 head-on → 0.92 at grazing), it takes the
same city at 3.4× the hull's gain, and it has a rim term so there is a pane fitted rather than a
gradient.

**The six player hulls got their own kits and edge modes**, because they are the craft Aaron looks
at most: `nocturne` a dorsal spine rail with a travelling bead on it, `drayman` flank sponsons and
a keel underglow, `mammoth` the cargo stack and a shoulder+spine run, `lance` shoulder+keel. Those
are `kit` / `edge` / `pulse` fields on the def, and `gates_p5`'s "no def carries a geometric field
beyond L/W/H and the integer options" check was extended for `kit`/`road` (geometric) and
`edge`/`pulse` (lighting, in the same class as the existing `trim` and `run`).

**`CAP` 40 → 56** on the craft fields: the road transports share them with the flying population,
which is what keeps the vehicle layer at five draws.

### `js/traffic.js`

- `TYPES` 3 → 6: `taxi_ai` · `hauler_ai` · `pod_ai` (4.8 m, stubby, tall) · `limo_ai` (11.2 m,
  long, low) · `van_ai` (7.6 m, tall, boxy) · `patrol`. Length-to-width now spans **2.18:1 to
  5.6:1** and height **1.10 m to 2.55 m**.
- Two more seeded bytes per craft — edge mode and pulse — from their own hash.
- **A second analytic population: the road transports.** Same tiling arithmetic as the flying
  lanes, on the 51.2 m road lattice with a ±3.3 m lane offset, at half the vehicle's own height
  above the y = 0 deck. It shares the streak `InstancedMesh` (its instances live at
  `[N, N + rN)`), the craft fields, and nothing else — so every existing gate that walks the
  flying population still measures exactly what it measured before.
- `state()` reports `road`, `roadNear`, `roadMeshes`, `roadLanes` and `streakTotal` separately from
  `n`/`streaks`, deliberately: `gates_p5`'s "all N craft are also in the streak field" is a claim
  about the **flying** population and must keep being one.
- `hash()` covers the road population too, so a change that makes street traffic non-deterministic
  is visible to the determinism gate rather than to a second gate somebody might not run.

### `tools/gates_p5.mjs` — updated, with its teeth checked

Two checks were rewritten and **both were proved still able to fail before being accepted**:

- *"all N craft are ONE geometry"* — 9 → 15, and the canopy count is asserted as *everything that
  is not a road form* rather than as a second copy of the craft count. Falsified by removing the
  `!road` guard on the canopy write: it went red (`15 canopies for 15 bodies`).
- *"variation is L/W/H plus the … integer options and NOTHING else"* — three options → five.
  Falsified by adding `bulge: 0.3` to `taxi_ai`: it went red (`extras: taxi_ai.bulge`).

### A P5 bug this phase found and fixed — every headlight in the game

`_lampCone` places a cone apex-first so the beam starts **at** the lamp and widens forward. It
passed the length **negative**, and the comment on it — *"so the apex lands back on the lamp"* —
described the intent rather than the arithmetic. Measured on the live instance matrix at yaw 0,
where the craft's forward is exactly world −Z:

| | lamp station z | cone mouth z | cone apex z |
|---|---|---|---|
| `kestrel` (nose at −3.10) | −2.73 | −16.73 | **−30.73** |
| `kestrel`, fixed | −2.73 | −16.73 | **−2.73** |

So every forward lamp cone in the game was a beam floating between **13.6 m and 27.6 m in front of
the craft that owns it**, never touching it. It survived since P5 because a faint additive cone in
fog reads as haze. S2-C found it only because a road transport is a slab and the detached wedge
beside it was obvious in `shots/s2c/bus_close.png`.

One character changed (`-len` → `len`). `gates_s2c` B3 now asserts the apex against the lamp
station — two independently derived numbers, so it fails on any sign or scale error rather than on
a tolerance around zero. Its first version assumed one lamp cone per craft and went red on
`patrol`, which also carries decision 6's sweep at t = 0.30; the gate was right and the expectation
was wrong, which is the correct way round.

### `tools/gates_s2c.mjs` — new, 17 checks

| | what it measures |
|---|---|
| **A1** | five civilian silhouettes are **spawned**, spread 2.18:1–5.6:1 and 1.10–2.55 m |
| **A2** | all six flying types and all three road forms are live in the seeded fleet |
| **A3** | FALSIFIED — forcing `iVar.x = 3` on three kit-0 craft moves the worst cell 0.0138 |
| **B1** | 6/6 edge modes live; the travelling bead is on 12–34 % of the fleet |
| **B2** | FALSIFIED — three identical kestrels on modes 0/1/2 vs all-0 moves 0.0055 |
| **B3** | the forward lamp cone's apex lands on its lamp station (the P5 bug above) |
| **C1** | FALSIFIED **+ CONTROLLED** — `uCity.x` 0.46→0 moves 0.0179; the same toggle with the craft hidden moves **0.00000** |
| **C2** | the reflection changes 12 of 96 cells, not all of them — a highlight, not paint |
| **C3** | FALSIFIED — the canopy's fresnel alpha driven to (0,0) moves 0.0088 |
| **D1** | FALSIFIED — every transport is ≤ 3.30 m from a road centreline; a 12.8 m-offset control reads 16.10 m and fails |
| **D2** | they sit 1.50–1.70 m up, on the deck, not in the 30 m lane |
| **D3** | 12 / 22 / 32 m against a 10.5 m longest flying craft; all three forms live |
| **D4** | FALSIFIED — forcing `iVar.y = 0` swaps the box bodies for flying hulls, 0.0801 |
| **E1** | the vehicle layer is still 5 draws |
| **E2** | the sim still fits the frame budget |
| **F1** | FALSIFIED — same seed same hash, different seed different hash, **and** nudging one transport's phase moves the hash (so street traffic is genuinely in it) |
| **F2** | console clean |

**Three of the non-falsified checks were themselves proved able to fail**, by cutting `TYPES` back
to the two silhouettes Aaron complained about and putting the transports at y = 40 m: A2 and D2
went red — and **A1 did not**, because its first version read the def table while its detail line
claimed it read the live pool. It now reads `palette().shape`, and with the same break applied it
goes red. A declared type that nothing spawns is exactly what that check exists to catch.

---

## The numbers

### Gates

| suite | before | after |
|---|---|---|
| `gates_p5` | 16/16 (re-run on the pre-S2-C tree at the start of this phase) | **16/16** |
| `gates_p5 --lite` | 16/16 (from the ship record; not re-run before) | **16/16** |
| `gates_s2c` | — | **17/17** HIGH · **17/17** LOW |
| `determinism` | 9/9, golden `f29beaf9`, 25,039 buildings | **9/9, `f29beaf9`, 25,039** |
| `gates_wire` | 11/11 | **11/11** (re-run against the finished tree; all eleven check names present in `shots/wire/_gates.json`, not a partial) |

### Cost, measured not estimated

| | before | after |
|---|---|---|
| vehicle-layer draws (HIGH) | 5 | **5** |
| vehicle-layer draws (LOW) | 5 | **5** |
| body geometry | 392 tris | **868 tris** |
| vehicle-layer tris (HIGH, `canyon_dive`) | 16,296 | **33,924** |
| vehicle-layer tris (LOW) | — | **13,690** |
| frame total, `canyon_dive` HIGH | 50 draws / 144.8k tris | **50 draws / 162.4k tris** |
| frame total, LOW | — | **36 draws / 60.2k tris** |
| traffic + craft write, CPU | 0.3 ms | **0.1–0.4 ms** |
| headless `hero_craft` frame mean | 3.70 ms | **4.06 ms** |

**Draw calls did not move.** Everything new — three module kits, three road forms, the road
population's meshes, lights and streaks — went into geometry and instance buffers that already
existed. §3.8's budget is ≤ 90 draws and 260k tris; the frame sits at 50 and 162k.

**The triangle cost is honest and it is the price of the five-draw promise.** The body geometry
carries every part of every option, and ~476 of its 868 triangles are collapsed to a point on any
given instance. At 32 near instances that is ~15k degenerate triangles a frame: vertex-shader work
only, no rasterisation, no fill. The alternative — a second `InstancedMesh` for the road forms —
would have cost one draw call and saved most of those, and can be revisited if a phone says so.

### `budget.mjs --headed`, on a real GPU, after

844×390 at dpr 2 — a phone-shaped viewport. **All gates pass** (≤ 90 draws, ≤ 260k tris,
mean ≤ 6 ms, worst ≤ 12 ms).

| shot | draws | tris | mean ms | worst ms |
|---|---|---|---|---|
| `fog_city` | 55 | 150.1k | 1.66 | 3.40 |
| `canyon_dive` | 50 | 163.4k | 1.98 | 3.50 |
| `hero_craft` | 50 | 163.1k | 1.57 | 3.70 |
| `wet_street` | 50 | 162.3k | 1.82 | 3.40 |
| `cockpit` | 55 | 162.5k | 1.93 | 4.30 |
| `day_smog` | 50 | 152.6k | 1.93 | 3.70 |
| `?auto=1`, 60 s | 56 | 177.1k | 1.97 | 7.50 |

And the LOW preset, `shots/_budget_s2c_low.json` — also all green:

| shot | draws | tris | mean ms | worst ms |
|---|---|---|---|---|
| `fog_city` | 37 | 55.4k | 1.53 | 3.50 |
| `canyon_dive` | 36 | 60.2k | 1.81 | 3.40 |
| `hero_craft` | 36 | 60.1k | 1.40 | 3.50 |
| `wet_street` | 36 | 59.1k | 1.66 | 3.50 |
| `cockpit` | 41 | 59.4k | 1.84 | 3.60 |
| `day_smog` | 36 | 54.3k | 1.63 | 3.40 |
| `?auto=1`, 60 s | 42 | 70.9k | 1.68 | 8.30 |

`shots/_budget_s2c_high.json`. I do **not** have a clean headed BEFORE run to difference against:
the committed `shots/_budget_headed.json` predates S2-A, so its 42–47 draws are missing the whole
rebuilt cabin and it is not a S2-C control. The clean before/after comparison is the headless pair
in the table above, taken on this machine in this session.

### The reflection's GPU cost: below what I could measure, and I had to work to say that honestly

The first attempt A/B'd `canyon_dive` with `setCityRefl(0.46)` and `setCityRefl(0)`, three arms
each, alternating. It came back **−0.26 ms** — the expensive arm *faster* than the cheap one. That
is not a result, it is an instrument reading its own noise: a craft covers ~2 % of that frame.

So the subject was amplified rather than the null trusted. A `mammoth` parked 7.5 m from a frozen
camera at 60° fov covers roughly half the viewport (`shots/s2c/cover_check.png` — checked, because
an amplification that did not amplify would make the second null as worthless as the first). At
844×390 dpr 2, three alternating arms:

- reflection **ON**: medians 1.666 / 1.200 / 1.527 ms
- reflection **OFF**: medians 1.583 / 1.526 / 1.538 ms

The spread *within* an arm (0.47 ms) is five times the difference *between* them, and the sign is
still negative. **Conclusion: on this GPU, with the hull material covering half the frame at dpr 2,
the procedural city reflection costs less than a ±0.25 ms measurement noise floor.** That is not
the same statement as "it is free", and it is not a phone.

---

## What I looked at with my own eyes

Rendered before and after, and compared them:

- `shots/s2c/before_family.png` vs `shots/s2c/after_family.png` — the whole fleet.
- `shots/s2c/before/*.png` vs `shots/s2c/after/*.png` — `hero_craft`, `fog_city`, `canyon_dive`,
  `wet_street`, `cockpit`.
- `shots/s2c/c1_city_refl_off.png` vs `c1_city_refl_on.png` — the reflection, isolated.
- `shots/s2c/street_probe.png` — the road transports on an actual street at 34 m.
- `shots/s2c/after_hero_low.png` — the LOW preset, where there is no bloom and no MSAA to carry
  anything. The reflection still reads: an amber sweep across the crown, a bright rim, a visible
  canopy. It arguably matters more there.
- `shots/s2c/bus_close.png`, `shots/s2c/cover_check.png` — the two diagnostic renders.

**Three defects the renders caught that no gate would have, and one it did:**

1. **The first cut of the reflection produced nine chrome craft.** A slab fired on 66 % of
   reflection directions over a broad elevation band, which is a wash again — just an expensive
   one. Fixed by making the *gaps* wide: `step(0.52, h)` and a tighter horizon band, plus a lower
   fresnel floor. `gates_s2c` C2 now guards it: the reflection must change no more than half the
   probe cells, or it is paint.
2. **Whole box faces were being lit as "edges".** Marking a face with an edge channel makes every
   fragment on it read 1, and the chine term is `pow(edge, 2.2) × 4.2 × RIM_DIM` — on the loft that
   interpolates to a hairline, but on a flat panel it is a coat of solid neon. The first road
   render had a bus with an orange roof and a sponson that was a bar of light. An edge light on a
   flat form has to be actual thin geometry, so `stripUp`/`stripSide` exist.
3. **And then the strips came back as dotted lines of red specks.** The first version of `strip()`
   emitted each one TWICE with opposite winding so it would be visible from either side — two
   coincident planes z-fighting, which at a glance reads as aliasing and is not. A strip now faces
   one way and the caller says which.

**And one seeding bug a gate caught**, which is the only reason it is a comment and not shipped:
the pulse gate read `(h4 >>> 17) & 0xffff` — fifteen bits against a 65536 divisor, i.e. uniform
over [0, 0.5) — which doubled every threshold taken against it and put a travelling bead on 43 %
of the fleet instead of 22 %. `gates_s2c` B1 has a band on that fraction and went red. A
wrong-range hash produces a perfectly plausible-looking fleet.

---

## Known issues and things left undone

- **A large flat panel takes one reflection colour across a whole face at a grazing camera.** In
  `shots/s2c/after_family.png` the transports' roof caps read as maroon / pink / green slabs. That
  IS the reflection behaving correctly — over a 32 m vehicle at 62 m the view direction swings ~30°,
  so different parts of the roof pick up different slabs of the procedural city, and the transitions
  happen to land near the carriage joints. It reads as paint rather than as a mirror because the
  surface is flat and the camera is on the horizon. **At the altitudes the game is played from, the
  roofs are seen from above and go dark** — `shots/s2c/street_probe.png`, shot from 34 m, has dark
  roofs and only the window bands reading. If it turns out to matter on a real device, the lever is
  `uCity.w`: raising it makes the reflection vary faster across a large surface.
- **The road transports' keel band is only lit on two of the three road edge modes** (2 and 4), so
  about a third of them carry no visible side trim at all. That is deliberate — Aaron's standing
  spec includes "some cars may only have partial trim" and some none — but it is worth knowing it
  is a choice and not a bug.
- **No quality gating on the reflection.** It is ~30 ALU on the few hundred pixels a craft covers,
  it measured below the noise floor at 50 % frame coverage, and LOW measured 36 draws / 60.2k tris
  / 3.24 ms mean — so nothing was spent to buy it back. The
  lever exists if a real phone disagrees: `craftFields.setCityRefl(0)` drives it to zero, and
  wiring that to `Q` needs one line in `main.js` (which S2-C does not own) — see below.
- **The road transports do not stop, turn or queue.** They run straight down a carriageway at
  8–17 m/s and pass through junctions. At the altitudes the player flies this is invisible; it
  would not survive S2-H's street level.
- **They are not in the minimap.** `minimap.js` reads `traffic.nearList()`, which is the flying
  near set. `roadList()` exists if S2-D or later wants them.
- **`shots/_budget.json` was overwritten** by a `--headed` HIGH run (it held a `--lite --headed`
  run from 18 Aug). It matches `shots/_*.json` in `.gitignore`, so nothing committed changed — but
  if anyone was reading that file as the LOW record, it is not that any more. The S2-C runs are
  kept separately in `shots/_budget_s2c_high.json` and `shots/_budget_s2c_low.json`.
- **Every render in this phase is under `shots/s2c/`, which `.gitignore`'s `shots/*/` excludes.**
  The evidence is local only, as the convention intends; `docs/S2C_NOTES.md` is the committed
  half.
- **Nobody has flown this on a phone.** Every ms number here is `--use-angle=metal` on an M-series
  GPU, which `budget.mjs` itself calls a proxy with ~2.5× headroom. §1's shipping requirement is
  ticked by a device pass, never by this tool.

## Pending wiring (none required)

S2-C touched only `js/craft.js`, `js/traffic.js`, `tools/gates_p5.mjs`, the new
`tools/gates_s2c.mjs` and this file. `js/materials.js` — the third file S2-C owns — was **not**
modified; it was only imported from. **No change to `main.js` was needed or made.** The gate reaches S2-C's
material controls through `__game.craftFields.u` and `__game.craftFields.setCityRefl()`, which are
methods on an object `main.js` already exposes.

The one thing a future phase might want wired: `Q.craftRefl` in `js/config.js` driving
`craftFields.setCityRefl()` on a quality change, if a real device pass says the reflection is too
expensive on LOW. It is deliberately not done, because the measurement does not currently support
doing it.
