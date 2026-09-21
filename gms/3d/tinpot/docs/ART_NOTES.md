# TINPOT — art direction notes

Written 2026-09-22 by the managing Opus 5 session after reviewing `docs/evidence/m1-portrait.png`.
**Read this before doing any more work on `render/`.** It is a critique of a real frame, not a
wishlist, and every item below is visible in that screenshot.

## The honest verdict on m1-portrait.png

It is competent and it is boring. It reads as a texture swatch of "forest", not as a place you
are about to fight over. A player seeing this still would not tap it. Specifics:

### 1. The camera is wrong — this is 90°, not 74°
There is no visible side on a single tree. Every canopy is a plan-view disc. The brief asks for
the camera **~16° off vertical**, and the entire reason is so that helmets, tree canopies and
(later) vehicles have a lit side and a shaded side, and so the world has a readable *up*. Fix
this first: it changes every other judgement below. After the fix, a tree at the top of frame
and a tree at the bottom should be visibly differently foreshortened, and the treeline should
occlude a sliver of the grass behind it.

### 2. It is one colour
Mint green, mint green, mint green, and a beige smear. There is no value range and no hue range,
so there is no depth and nothing for the eye to land on. The frame needs:
- **Three or four tree species** with genuinely different silhouettes and hues — a dark blue-green
  conifer, a yellow-green broadleaf, a rusty/olive scrub, the odd bare dead trunk. Vary trunk
  visibility, canopy radius and height by a real amount, not ±5%.
- **Ground that is not one shade.** Patches of dry straw-yellow, trampled mud, darker damp
  hollows, moss at the treeline. Break it with a low-frequency noise mask, not a uniform tint.
- **A dark value anchor.** Right now the darkest pixel is a soft shadow. The treeline interior
  should go genuinely dark so the lit corridor pops out of it.

### 3. The light is doing nothing
"06:15" is on the HUD, but the frame is flat midday. Commit to the hour: a **low warm key raking
across the corridor**, long cool-blue shadows, warm rim on the top of every canopy, and real
contact darkening where the treeline meets the grass. Add distance haze and a gentle vignette so
the edges of the portrait frame fall away. Bloom should be visible on the lit canopy tops even
before anything is on fire — then fire has somewhere to go.

### 4. The corridor is a bowling alley
It is a dead-straight ribbon of constant width running top to bottom, with nothing in it. That is
a bad map before it is a bad picture. It needs to **bend**, to pinch and open into bays and
clearings, to have islands of trees standing in it and inlets cut into the treeline. The shape of
the grass *is* the level design; a straight corridor has exactly one tactic.

### 5. There is no cover and no clutter
Not one object in the open ground. It needs boulders, fallen logs, stumps, bramble clumps, a
broken cart, a low stone wall, shell craters, a signpost. These are the things soldiers stand
behind, grenades destroy, and fire spreads through — so they are gameplay, not decoration. They
also give scale, which the frame currently has none of.

### 6. The treeline edge is a hard cut
Grass stops, canopy starts. Real edges have a transition: scrub, saplings, bracken, ferns, a
scatter of individual trees loosening out into the open. That band is also where most of the
fighting will happen, so it should be the most interesting part of the frame.

### 7. The grass detail reads as flies
Small hard black specks, evenly spread. Make them lighter than the ground they sit on, not
darker, vary their height and tint, thin them out with the same noise mask that colours the
ground, and let them bend in the wind.

### 8. The path is a smear
Soft-edged, uniform width, dead centre, no surface. Give it wheel ruts, a gravelly edge, puddles,
and let it wander and occasionally leave frame.

## The bar

`gms/3d/facet` in this repo is the low-poly diorama test bed and `aaa_refs/refs/lowpoly` holds
its style bible — the target is that kind of confident, saturated, strongly-lit low-poly, not
untextured pastel geometry. Low-poly is a *style choice*, which means the colour, light and
composition have to carry everything the missing texture detail would have.

## How to know you have fixed it

Put the old `m1-portrait.png` and the new one side by side and look at them. If you cannot tell
which is which in a thumbnail, it is not fixed. Specifically, the new frame should have: an
obvious light direction, at least a 3:1 value range between the darkest treeline and the lit
grass, four or more distinguishable greens, visible tree sides, at least half a dozen objects in
the open ground, and a corridor whose shape you could describe out loud.


## Addendum, after seeing the finished slice (2026-09-22)

The game is built and it plays. Two things the finished frames make obvious:

**The title screen is already right and the mission view is not.** `m9-title-final.png` has a
vignette, a proper grade, depth, and a burning treeline in warm orange with glowing embers that
looks genuinely good. `m9-mission-6-start.png` is the same engine with none of that — flat,
bright, one hue. Whatever the title screen is doing, the mission view should be doing. This is
the cheapest large win available: it is not new tech, it is the same tech, turned on.

**Soldiers are dots.** A helmet sphere and a stick. The brief asks for the camera to be tilted
specifically so you see "a little bit of body/legs" — right now you see neither. They need
shoulders, a torso, two boots that swing as they walk, and three distinguishable silhouettes:
standing, running, firing. At this camera height that is maybe forty triangles each; it is the
difference between commanding men and dragging counters.
