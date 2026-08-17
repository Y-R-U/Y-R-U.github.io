# Sub-levels — the design note, not the build

**Status: a DESIGN NOTE for Aaron and the manager to decide in front of. Nothing here is
implemented and nothing here should be implemented until they have.** ART_PASS's steer is explicit:
*"get the game playable first. Then do the colour/variety/detail work, which is cheap and
high-impact. Then decide on sub-levels with Aaron, with a real design note in front of both of
you."* This is that note. It answers the four questions ART_PASS asks and adds a fifth that P11
turned up.

## Where the idea came from

Aaron, after flying P4:

> "maybe have every tunnels, since it kind of looks like the city currently keeps going down, maybe
> the road is just a level of the city and you can go sub level? maybe sub level can be added to
> plan."

The instinct is sound and it is a reaction to something real: the ground plane read as arbitrary.
**P11 has since found and fixed the cause of that specific reading** — see the "What P11 changed"
section below — which materially changes the case for building this. Read that before deciding.

---

## Q1. Is a sub-level a real navigable volume, or a visual suggestion of depth below a solid floor?

**Three options, priced.**

### A — the cheap version: deepen the apparent well, keep the floor solid

The deck stays at `y = 0` and stays solid. What changes is what you can see *through* it in a few
authored places: light wells, vent shafts and service voids cut into the road grid, each a dark box
with a lit floor 40–70 m down and a couple of emissive strips on its walls.

- **Cost:** one more instanced field (a box with an inverted normal, ~12 tris each, ~40 instances
  in the near ring) = **1 draw, ~0.5k tris**. No collision change, no fog change, no LOD change, no
  minimap change, no mission change.
- **Risk:** essentially zero. It cannot break anything, because nothing else in the game knows it
  exists.
- **What it buys:** the *look* of a city that continues downward, in the frames where the player is
  low enough to see the deck at all. It does not buy anywhere to go.

### B — the middle version: one authored under-deck, not an infinite one

A single hand-placed sub-level under the core districts only — a 3×3-chunk slab at `y = -55` with
its own ceiling at `y = -8`, reached through four authored ramps in the road grid. Seeded
generation is **not** extended downward; what is down there is authored data in the same style as
`data/landmarks.json`.

- **Cost:** a second collision layer, a second fog authored for a low-ceiling volume, a minimap
  layer toggle, a flight-floor change, and about 8–14 authored structures. Call it **a full phase**,
  comparable to P2 in scope but smaller in surface area because it is bounded.
- **Risk:** moderate and *bounded*. Everything it touches, it touches in one region.
- **What it buys:** somewhere to go, one memorable place, and a real answer to "the city keeps
  going down". It does not buy an infinite underworld and should not pretend to.

### C — the expensive version: the seeded field extends downward everywhere

Every chunk generates an under-deck. **Not recommended, and this note should be read as arguing
against it.** It multiplies the generator's work, doubles the collision store, breaks §3.2.1's
altitude-keyed fog interlock (which is authored around a smog band with a *top*, not a floor),
gives the minimap two layers everywhere, and gives the mission system a Y axis it currently does
not have. It is the version that turns a tuning pass into a second game.

**Recommendation: price A first and build A before deciding on B.** A is cheap enough to try in an
afternoon, and it is the version most likely to satisfy the observation that prompted the idea,
which was about *how the city reads*, not about *where the player can fly*.

---

## Q2. If navigable: what is down there, why would a courier go, and what stops it being a dark empty box?

This is the question that kills option C and constrains option B. NEONHAUL has **no combat, no
pursuit, no heat and no fail state** (DECISIONS 6). So a sub-level cannot be justified by danger,
and "a place you can go" is not a reason to go there.

The three honest answers, in order of strength:

1. **It pays more.** Under-deck pads are tier-gated and pay a premium because the approach is
   harder — a low ceiling, columns, and a vertical descent through a shaft rather than an open
   drop. That is *skill* pressure, which the game already has (§7.2's 0.6 s hold, the ledge-pad
   descent) and which does not need a fail state to matter.
2. **It is where the cheap charge is.** §7's CHARGE pads are an economy sink. Putting the cheapest
   charge under the deck gives a reason to learn one route down.
3. **It looks like nothing else in the game.** Everything above the deck is sky, fog and distance.
   A ceiling is the one thing the player has never seen. That is worth a phase on its own terms —
   but only if it is *authored*, which is option B, not option C.

**What stops it being a dark empty box** is the ceiling, and specifically light *coming down through
the deck*: the light wells from option A become the sub-level's only daylight-equivalent, so the two
options are the same feature seen from two sides. Build A and you have already built the most
important half of B.

---

## Q3. How does it interact with §3.2.1's fog model, which is authored around altitude?

**This is the real technical objection and it needs stating precisely.**

§4.2's fog term is `sm = 1 - smoothstep(uSmogTop, uClearY, y)` — 1 in the murk, 0 in clean air, with
`uSmogTop = 90` and `uClearY = 260`. It is monotonic in `y` and it has no floor: **at `y = -55` it
returns exactly what it returns at `y = 0`**, i.e. full murk at `uSmogMul = 2.2`, `V = 442 m`.

That is not wrong, but it is not right either. A covered volume is not "the bottom of the smog
band" — it is a different room, with its own much shorter visibility and its own colour. So:

- Option A needs **nothing**. A light well is a hole you look into; the fog inside it is the same
  fog and that reads correctly.
- Option B needs a **third term**, not a change to the existing two: an `underDeck` factor that
  ramps in below `y = -8` and swaps `V` to something like 160 m in a warmer, dirtier colour. It
  must be gated the way DECISIONS 11's aerial vista is gated — **zero cost above the deck**, which
  is where the entire game happens. §3.2.1's C1/C2 interlock is about the LOD bands and is
  unaffected as long as the sub-level's own draw distance is shorter than `R₀`; it must not extend
  it.
- Option C would require §3.2.1 to be reopened, because the fog would have to serve three regimes
  at two LOD radii. **That is the escalation DECISIONS 11 tells a builder to raise rather than
  silently solve.**

---

## Q4. Does the ground plane become a deck with holes, and what does that do to collision and the minimap?

**Collision.** `render_city.js` stores one AABB per building covering its whole footprint from the
ground to `h` — P7b's ledge-pad defect was caused by exactly this and the lesson is recorded in
`P7B_NOTES.md`. The ground itself is **not** in that store; the flight model treats `y = 0` as a
floor separately. So:

- Option A: no change. The wells are visual and the floor stays solid over them.
- Option B: the floor becomes conditional — solid except inside four authored ramp mouths. That is
  a rectangle test in the flight model, not a new collision system. **But** the sub-level's own
  ceiling and columns need AABBs, and the existing store is keyed by chunk with no Y partition, so
  it would need a `y0` on the AABB record. That is a small, real change to a load-bearing file, and
  it is the single most likely place for this feature to introduce a bug of the ledge-pad kind.
  **Any implementation must re-run `gates_wire` W8's burial probe against the under-deck pads
  before it is believed** — and must call `__game.cityChunkLive()` first, because `solidAt()`
  returns `null` for an ungenerated chunk and `null` is indistinguishable from open air.
- Option C: the AABB store gains a second axis everywhere. Not recommended.

**The minimap.** `minimap.js` takes zones as DATA through `setZones()` and draws a plan view. A
sub-level means two plans, and the honest UI for that is not two layers — it is **one plan with the
current deck's zones and a count of what is on the other one**, because a phone minimap that has to
be switched is a minimap nobody switches. Option A needs nothing here.

---

## Q5 — the question ART_PASS did not ask, and P11's answer to it

**"The ground appears semi transparent" was NOT evidence for sub-levels. It was two defects, and
both are now fixed.** Measured before it was styled, with both controls reported
(`tools/p11_ground.mjs`):

| | mirror group off | water film off | null control | positive control |
|---|---|---|---|---|
| `canyon_dive` | Δ **0.005** / 255 | Δ 0.039 | 0.000 | 1.81 |
| `wet_street` | Δ **0.145** | Δ **3.344** | 0.000 | 3.27 |

- The §3.7(b) mirror group — the thing that would have painted an inverted city *below* the floor
  and is the obvious suspect for "the city keeps going down" — moves the frame by 0.145 of a
  channel in the one shot built to show it off, and by 0.005 in the shot Aaron's view most
  resembles. **It was never what he was looking at.**
- What he *was* looking at: §3.6 specifies "faint lane markings, drain grates" and `atlas.js` baked
  neither, so there was nothing on the deck that said "road"; and the water film was an additive
  environment reflection at a **fixed** strength with no Fresnel term, so it washed the deck equally
  hard from every view angle instead of falling to a few per cent when you look down at it.

Both are fixed in P11. The deck now carries lane markings, kerbs, junction hatching, drain grates
and street lighting on §3.1's own 51.2 m street grid (0 of 4,132 seeded footprints encroach on the
painted corridor; widen the corridor to 26.4 m and 91 % do), and the film has the missing angle
term.

**So the observation that motivated sub-levels has been answered by a different fix.** That does
not make the idea bad — it is still a good idea — but it removes the *urgency* argument for it, and
it means the decision can be taken on whether the feature is worth a phase, rather than on whether
it repairs something.

---

## Recommendation, in one paragraph

Build **option A** (light wells and service voids, one draw call, no system changes) as a small
item in a polish phase, and look at it. If it satisfies the "the city keeps going down" read —
which is what Aaron actually described — stop there. If after flying it he still wants somewhere to
go, **option B** is a phase of its own with a bounded blast radius, and its brief must name the
fog's third term, the AABB `y0`, the flight floor and W8's burial probe explicitly, because those
are the four places it can quietly break something that currently works. **Option C should be
refused**, and this note is the reason to refuse it.
