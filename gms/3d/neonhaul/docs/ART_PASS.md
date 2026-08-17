# P11 — the colour, variety and depth pass

> **STATUS: BUILT 2026-08-18.** `tools/gates_p11.mjs` 8/8 on both presets, `SCORES.md` round 7 is
> the critic round this document specifies, and `docs/SUBLEVELS.md` is the design note it asks for
> (written, not implemented — the steer below stands). The one-paragraph verdict, so nobody has to
> reconstruct it: **the colour half of the diagnosis is answered and no critic names it any more;
> the lighting half is not.** "The window grid is a tiling decal", "one window value" and "the same
> flat blue ambient" are gone from every list; "every light source in this image is a sticker" is
> still six of six. The gap is statistically unchanged (−5.17 → −5.00 and −4.83 → −4.67 against a
> ±1.5 noise floor). Details in the P11 section of `MANAGER_STATE.md`. **Aaron flies it next and has
> the final say, which is what the last line of this document has always said.**

**Scheduled AFTER the initial coding pass, on Aaron's instruction.** Do not pull this work forward:
the cockpit, HUD, vehicles, missions and docking panel are still missing, and a game you cannot
play is not improved by prettier buildings. This runs after P8, before P10 ship.

## Where this came from

Aaron flew the P4 build and reported. His words:

> "my initial flight was easy. promising. […] three buildings look good but very repetitive, from a
> distance we should still see a bigger variety of colours on the buildings, some of the plate
> images show this well e.g the canyon one (746850_03). the occasional big sign as well. I think up
> closer I think we will need more detail/texture. the ground appears semi transparent […] many of
> the plate images are better cool, very colourful. ours looks good, but very un colourful and
> repetitive. can we use those plates to ensure we follow some of those cool patterns, e.g. large
> sections of a building will have 1 colour pattern but other parts another or a very large
> billboard or sign etc."

**This corroborates the blind critic independently.** P3b's critics, who never saw Aaron's notes,
named the same root cause: *"no light hierarchy — every building face is lit by the same flat blue
ambient."* Two independent observers converging is the strongest evidence we have. Treat this as
the single highest-value art work remaining.

## The reference — read the plates, do not invent

`~/cc/yru/gms/3d/aaa_refs/cyber/refs/board/`. **Open them and look**, do not work from these notes
alone. `746850_03` is the plate Aaron named; `1488490_00`, `1488490_08` and `1939970_00` carry the
same lessons.

What those frames actually do that we do not:

1. **A building is not one colour.** In `746850_03` a single tower carries a band of cyan windows,
   then a band of warm amber, then a dark unlit section, then a magenta-lit crown. Our buildings
   pick one district tint and apply it uniformly to every window on every face. **The variation is
   WITHIN a building, not just between buildings.**
2. **Adjacent buildings differ hard.** Not a gentle spread around a district mean — a cold blue-white
   block next to a hot orange one next to an unlit black one. High contrast between neighbours is
   what makes the frame read as a city rather than a texture.
3. **Signage has enormous scale range.** `746850_03` has a huge `ENFIELD` board, a tall vertical
   `HOTEL` blade, and dozens of tiny ones — spanning maybe 30× in size. Ours cluster around the
   middle of the range. **Aaron specifically asked for "the occasional big sign."**
4. **Colour comes from light, not paint.** Every colour in those frames is an emissive source or
   something reflecting one. This is already our model — we are simply not varying it enough.
5. **Depth reads as layers of different colour temperature**, not just fog density.

## The work

**1. Per-building and intra-building colour variety.** The mechanism exists — `iTint` per instance
and the district palettes. It is the *distribution* that is wrong. Give a building 2–3 vertical
colour zones with hard boundaries at setbacks or floor bands, and widen the between-building
spread so neighbours genuinely clash. Some buildings unlit entirely. This should cost close to
nothing: it is instance attribute data, not new geometry or draws.

**2. The occasional very large sign.** P3a produced 13 portrait heroes, correctly, after finding
§3.5.5's 60–110 m landscape band impossible on a 38 m-wide seeded lot (DECISIONS T6.1). Aaron wants
more big signage presence anyway. Options, in preference order: raise hero count and spread them
wider; allow a *landmark* (authored, not seeded) to carry a genuinely huge board since landmarks
are not lot-limited; add a rooftop-mounted sign class that overhangs its footprint legitimately.

**3. Close-up detail.** Aaron: *"up closer I think we will need more detail/texture."* We are at
37–42 draws against a 65 gate and 118–144k tris against 260k, so there is real budget. Prefer
techniques that cost per-pixel rather than per-object: facade detail in the shader, panel lines,
grime and variation in the window atlas, a normal-ish term on the glass. **Do not add geometry
per building** — the instancing architecture is why this runs at 42 draws and it must survive.

**4. The ground — investigate before styling it.** **ANSWERED: it was a DEFECT, and the mirror was
not it.** Measured before it was styled (`tools/p11_ground.mjs`, null and positive controls both
reported): the §3.7(b) mirror group moves the frame by **0.145 of a channel in `wet_street`** — the
one shot built to show it off — and by 0.005 in `canyon_dive`. What Aaron was looking at was (a)
§3.6 specifying "faint lane markings, drain grates" while `atlas.js` baked neither, so nothing on
the deck said "road", and (b) the water film being an additive environment reflection at a FIXED
strength with no Fresnel term, so it washed the deck equally hard from every view angle. Both fixed.
Original note follows.

Aaron: *"the ground appears semi transparent."*
**Check whether this is a bug first.** P3b added a water film and a mirror group; a mirrored bucket
or the film's blend could be showing through, in which case it is a defect, not an art choice. Once
it is understood: make it read as **road** — lane markings, kerbs, painted hatching, the wet
reflection we already have. Aaron's exact ask: *"make it more road like?"*

## Sub-levels — a DESIGN ADDITION, needs planning before building

Aaron:

> "maybe have every tunnels, since it kind of looks like the city currently keeps going down, maybe
> the road is just a level of the city and you can go sub level? maybe sub level can be added to
> plan."

This is a genuinely good instinct and it is *already implied by what he is seeing* — the city reads
as continuing downward, so the ground plane reads as arbitrary. It is also the natural answer to
"the ground looks semi-transparent": it looks like a floor that should not be there.

**But it is a new feature, not a tuning pass.** It touches the city generator, collision, the fog
and LOD interlock, the flight ceiling/floor, the minimap and probably the mission system. It must
be **planned before it is built** — a short design note answering:

- Is a sub-level a real navigable volume, or a visual suggestion of depth below a solid floor?
  (The cheap version — deepening the apparent well without opening it — may buy most of the look.)
- If navigable: what is down there, why would a courier go, and what stops it being a dark empty box?
- How does it interact with §3.2.1's fog model, which is authored around altitude?
- Does the ground plane become a deck with holes, and what does that do to collision and to the
  minimap?

**Manager's steer:** get the game playable first. Then do the colour/variety/detail work, which is
cheap and high-impact. Then decide on sub-levels with Aaron, with a real design note in front of
both of you. Do not let a speculative feature delay a playable build.

## Gate for this pass

Not a number. **A blind critic round on `fog_city` and `canyon_dive` against `746850_01` and
`746850_03`, with three fresh critics and the mean gap reported** (DECISIONS 12). The differences
lists are the signal, not the score. The specific question to answer: do the critics stop saying
"flat", "uniform", "no hierarchy", "same ambient"? That is the target, not a number going up.

Aaron flies it afterwards and has the final say.

---

## Vehicle colour — settled during P5, applies to all future vehicle work

Aaron, watching P5 build:

> "most cars imo should be a very dark colour, like very dark red/ blue etc, but they would have
> colour highlights, maybe a neon trim, headlights etc. the very dark colour should be reflective?
> [...] like the buildings there should be different dark colours and different trim colours and
> some cars may only have partial trim etc"

Matches the original brief's *"mostly black or metal/glass (some reflective surfaces)"*.

1. **Body is very dark with a hue** — near-black burgundy, navy, green, gunmetal. The hue is barely
   readable in shadow and only declares itself where light hits. If it reads as "a red car" it is
   far too saturated.
2. **The dark body must be REFLECTIVE.** This is the whole point of the material. In a mostly-black
   city a dark matte hull is invisible and dead; a dark *reflective* hull picks up every sign,
   strip and lit window it passes and becomes the most interesting object in frame. **The
   reflection is what makes it exciting, not the colour.**
3. **All colour comes from highlights** — neon trim, headlights, engine glow, lit panel seams.
4. **Vary it exactly like the buildings**: different dark body colours, **different trim colours**,
   and **some vehicles with only partial trim or none at all.** Variety includes absence.
5. **Lights stay shared across civilian types** — the brief's rule refers to light fixtures and
   their placement. **Trim colour is a separate per-vehicle attribute and varies.** Police and
   other specials remain the exception.

Cost: per-instance attribute data plus a material setting, not new draws — the same mechanism as
the city's `iTint`.

**Process note for the manager.** Aaron reported the red hull, then immediately added *"oh i think
i was just early"* — he had been looking at a work-in-progress render, and confirmed shortly after
that the hulls were "now darker". The first message went out as an urgent correction and had to be
softened. **When Aaron reports on a phase that is still running, establish whether he is looking at
a finished surface before firing an urgent correction at the builder.** The design guidance was
worth capturing regardless; the urgency was not.
