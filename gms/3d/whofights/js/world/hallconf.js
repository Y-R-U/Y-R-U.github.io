// The great hall's shape knobs, on their own so both surfaces of a hall can read them.
// They live here rather than in interior.js because buildings.js — which draws the OUTSIDE of
// the same hall — needs the bay spacing and the wall-plate fraction, and importing the whole
// interior module into the building kit to get two numbers would drag the room, its stairs, its
// boards and its colliders in behind them.
//
// registerHallKnobs() in interior.js mutates this object in place, so a live knob change is seen
// by the exterior too.

// Everything the great hall is shaped by. Registered as knobs through registerHallKnobs() —
// lighting.js calls it, because that is the module that already gets handed the quality registry.
// The geometry ones rebuild; the light ones are read live out of this object every frame.
export const HALL = {
  plate: 0.52,      // wall-plate height as a fraction of the exterior wall — the rest is roof
  pitch: 0.55,      // roof rise over half-span
  // The flat crown of the roof, as a fraction of the half-span. A camp ceiling rather than a
  // full gable, and not only for the look: buildings.js puts a solid roof slab over the house
  // and its underside is the real ceiling of the world. Measured over this hall it sits at about
  // 13.5 m at the ridge and comes down to 8.5 m near the side walls, so an interior roof that
  // ran to a point would push straight through it. Clipping the top is what fits inside.
  crown: 0.45,
  bay: 5.8,         // metres between pilasters, and therefore between roof trusses
  bake: 1,          // strength of the baked vertex gradient
  sconces: 6,       // real point lights among the wall sconces
  sconcePower: 22,
  dress: 1,         // furniture density
  shadows: true,    // let the building's own roof shadow its interior
};
