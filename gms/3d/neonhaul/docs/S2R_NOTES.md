# §S2-R — the obsidian deck, and traffic that knows the city is there

Aaron, on the shipped build, 2026-08-25:

> 1. I've not noticed this previously - but cars are now flying through buildings? they did not
>    seam to do this before? or at least I never noticed. they should be flying between buildings.
> 2. Trains look good going through buildings, but sometimes the train going into the very edge of
>    the building. This doesn't work then … it doesn't look good it going into an edge.
> 3. Roads are part of the problem, they don't match up to buildings so look silly. We shouldn't
>    draw them like this, it should look like a cool black surface/futuristic … in this cyber city
>    we can imagine everything is auto-driven/most things fly and the only thing currently on the
>    ground are some auto-trains, so why would road lines exist.
>    … the black road could be a black partly reflecting surface perhaps, obsidian kind of look?

All three are one defect wearing three hats: **an analytic lattice that has never known where the
buildings are.** The lanes, the street corridors and the road paint are all derived from a clean
51.2 m grid. The city is not on that grid — it jitters inside it, and `split` masses are thrown
clear of their own lot and over the street line.

---

## What was measured first, and what it cost to measure it

**Every number below is from a falsifiable probe, and three of the first four attempts were wrong.**
They are recorded because the ways they were wrong are the useful part.

### 1 · the flying-craft avoidance was a no-op, and counted itself a success

`traffic.js` pushed an intersecting craft **straight up** by `min(14, hit.top + 4.5 - wy)`.

The masses that actually sit on a lane are **160–450 m tall**. A 14 m push lifts a craft from 55 m
to 69 m and leaves it ninety to four hundred metres inside the tower — and increments
`stats.avoided` on the way past. Measured on the shipped build: **six of the twenty-six mesh-drawn
craft were inside a mass, and all six were still inside after the push ran.**

Only the ~26 promoted craft were checked at all. That turns out to be the right scope and not a
bug: streaks are `depthWrite: false` but **depth-TESTED**, so a wall already hides one.

### 2 · "the tunnel layer made trains worse" — WRONG, and instructively so

A 40-moment sweep reported 32 vehicles visibly inside a mass on the shipped build against 13 with
the tunnel layer unhooked, i.e. a regression. **It was not.** `solidAt` reports a mass solid
because its AABB has no hole in it, so a transport driving through a lit, doored bore — the thing
Aaron says looks good — counted as a defect. Separating the two: **99 of the in-mass cases are
dressed bores working correctly**, and the genuine undressed residue was **1 in 1,779**.

### 3 · `roadList(0, t)` reads two clocks, and one sweep believed it

An earlier sweep read `hidden` alongside positions at 40 different `t` values and concluded **83
vehicles were driving unsuppressed through walls**. None were. `x/y/z` are recomputed at the `t`
you pass; `hidden`, `drawn` and `streak` are frame state written by the last `_updateRoad` at the
live vehicle clock and know nothing about it.

**Fixed at the source, not in the probe:** `roadList` now returns `null` for every frame-state
field when an explicit `t` is given, so the mistake produces an obviously missing value instead of
a plausible wrong one. To sample them at a moment: `stepVehicles(t)`, then `roadList()` with no `t`.

### 4 · gates_p11 P1 — the nineteenth silent zero, and the first whose CONTROL was fooled too

P1 asserted that no seeded footprint stands on the painted carriageway. It reported zero and passed
for two phases.

```js
const enc = Math.min(half - (dx - b.w / 2), half - (dz - b.d / 2));   // min
```

A building encroaches if it crosses the corridor on **either** axis. `Math.min` demands **both at
once**, which a lot-bound mass essentially never does.

The real figure, with `max`, over the same 13×13 chunk block:

| | |
|---|---|
| seeded footprints | 4,132 |
| **on the painted carriageway** | **502 — 12.15 %** |
| worst encroachment | **8.36 m** |
| past the street centreline outright | 89 |

**The falsification arms passed the whole time.** They widened the road to 26.4 m and 38.0 m, and at
those widths every mass encroaches on both axes, so both arms went red exactly as required. *A
control that only exercises the extreme can sail over a bug that lives in the ordinary case.* That
is a sharper lesson than the eighteen before it, because here the control existed, ran, and passed.

P1 now measures the true figure and uses **the operator itself as its falsification**: the same
probe with `min` still reads zero, printed beside the number it hid.

### 5 · where the lanes actually cross things (`tools/probe_lm.mjs`, node-side, 17×17 chunks)

| | |
|---|---|
| lane crossings | 196 |
| **through ordinary seeded masses** | **146** (widest span 38 m) |
| **through landmarks** | **50**, over 8 of them (spans 80–210 m, up to 470 m tall) |

This split decided the design. A 38 m mass can be steered round inside a street's width. A 190 m
landmark cannot, and no climb that keeps §3.10 #2's altitudes can go over one.

---

## What was built

### The deck (`js/materials.js`)

`ROAD_BODY`'s carriageway is **deleted** — dashes, edge lines, junction hatch, kerb, and the
`onRoad` concept itself. Not restyled: the lattice it was drawn on is not this city's geometry, and
12 % of the buildings stood on it.

What gives the deck structure now comes from how volcanic glass breaks, which needs no lattice and
therefore cannot disagree with the city:

- **fracture plates** — a domain-warped cell id on a ~19 m pitch varying *roughness*, so the
  reflection breaks across a seam the way glass does and a single uniform mirror never does;
- **conchoidal ripple** inside each plate, centred on the plate's own hashed focus so the arcs stop
  at a seam. Long wavelength on purpose: at the 15 m the first draft used, the deck read as corduroy;
- **per-plate normal tilt** (±0.052) — the term that actually sells fractured glass. Injected at
  `emissivemap_fragment`, which three.js runs *after* `normal_fragment_maps`, so `normal` is in
  scope. Past ~0.06 it stops being a glass floor and becomes crumpled foil;
- **service panels** — sparse, hashed, ~1 in 6 cells on a 25.6 m pitch, each at its own hashed spot
  inside its cell and turned a quarter for half of them, so nothing lines up into anything that
  could be read as a lane;
- **an irregular wash** at 43.7 m and 29.1 m periods, deliberately incommensurate with 51.2 so no
  beat between them can redraw the grid that was just removed.

`groundMaterial` drops `metalness` **0.62 → 0.16**. Obsidian is a dielectric: ~4 % reflectance
looking straight down, approaching 100 % at a grazing angle. At 0.62 the deck returned the same
light from every angle, which is *why* it needed paint to have any structure at all. Fresnel now
does that work and nothing else in the frame had to change.

> **The wash is not decoration.** Deleting `onRoad` took the deck's ambient light with it, and
> gates_p11 P5 caught it at once: forcing the whole road term to zero moved the frame by 0.08 of a
> channel against a 0.25 bar. A deck lit only at sparse panels is a black void with dots on it.

### The lateral clearance steer (`js/traffic.js`)

One primitive, both populations. A lane runs down a street; a mass intruding on one hardly ever
spans it, so the clearance is **sideways**, not up.

`_clearOffset(axis, x, y, z, half, cap, hl)` returns signed metres across the lane. Budgets are
sized from the city, not from round numbers: **9.0 m** for a flying lane (the worst seeded
encroachment is 8.36 m past the centreline, and a lane sits 3.4 m off it), **11.0 m** on the street
(the carriageway that justified 5.4 no longer exists — Aaron: *"they need to go on the black"*).

Four properties are load-bearing:

1. **It cannot snap.** `gates_steer` S5 walks the offset at 1/30 s and bounds the largest
   single-step change. The first draft failed at **2.11 m in a thirtieth of a second** — a vehicle
   covers 0.4 m in that time. Every metre came from a term that switched rather than ramped: the
   tap being inside the mass's along extent or not; `need` staying large until the hull was clear
   and then vanishing; the over-budget case dropped with a bare `continue`; and — the largest
   single one — the bore suppression cutting the offset to zero the instant `spanAt` answered.
   All four are ramps now. **Worst step: 0.126 m.**
2. **It stays a pure function of position.** Nothing integrates, nothing remembers the last frame.
   `posOf` is still the definition of where a craft is and `hash()` still re-derives from it, so the
   golden hash `f29beaf9` is **unchanged** and determinism still means what it says. The steer is a
   render-time displacement against streamed geometry, which is exactly why it is outside the hash.
3. **A ladder is a sampling rate, not a guarantee.** The fixed taps cannot know how long the hull
   using them is, and two failures came from asking them to: a 32 m haulier's nose arrived at the
   wall at 0.875 weight, and a 22 m tram's tail was still alongside a corner when the offset had
   decayed to 0.149 of the 0.9 m it needed. **The hull's own two ends are now sampled explicitly at
   full weight**, in addition to the ladder.
4. **Every box near a tap is considered, not the first `solidAt` returns.** Which of two
   overlapping masses comes back changes as the query point moves — a jump on screen for no reason
   in the world. A max over continuous terms is continuous.

Then, only for what sideways cannot solve: **climb** a mass whose roof is within 26 m (a podium),
and otherwise **withhold the mesh — but only once the hull is entirely inside**. That last clause
matters: withholding at first contact blinks the craft out with its tail still in open air, where
withholding once swallowed is invisible, because the facade writes depth and cuts the hull for you.
Same argument `js/tunnels.js` makes about a bore's two portal planes.

The road steer is suppressed inside `spanAt`'s approach window — a bore's mouth is a 4.80 m opening
on the exact line the vehicle drives, and any offset there puts the hull into the jamb.

---

## Where it stands

`gates_steer` 11/11 · `gates_p11` 8/8 · `gates_road` 10/10 · `gates_tunnel` 20/20 · `gates_p5`
18/18 · `determinism` 9/9 (hash `f29beaf9`, 25,039 buildings — **unmoved**) · `budget` green.

| | fixed | residue |
|---|---|---|
| flying craft | 0 drawn inside a mass at 6 real crossings, 244 steers, max 7.96 m | **117 withheld inside landmarks** |
| road transports | **0** buried in a seeded mass (was up to 16 m) | **27 of 2,235 (1.21 %)** inside undressed landmarks |

### The residue is one thing, and it is named

`js/tunnels.js` declines to dress exactly three landmark shapes, and both residues above are those
three: **`kiln`** (a 96 m drum, dropped past `ROUND_LIMIT`), **`hollow`** (a `bridged` pair — two
58 m slabs whose gap must not be merged across), **`spindle`** (a `spire` nested inside its own
podium). `gates_steer` S2b asserts the residue is bounded **and that no fourth name appears** — a
new one means tunnels.js has started dropping a crossing it used to dress, which a bare percentage
would have reported as "still 1.2 %".

### The obvious next move

**Extend `js/tunnels.js` to dress landmark crossings, and to dress them at ALTITUDE.** Aaron already
likes the answer at street level — *"trains look good going through buildings … an auto door slides
open and train goes into a dark tunnel"* — and it is the same answer for the 117 withheld craft and
the 27 buried transports. A flying lane entering a lit portal in the face of the Ninefold is the
version of this that is not merely correct but good. It needs the three shape cases above solved
and the portal placed off a lane altitude rather than off the deck.

