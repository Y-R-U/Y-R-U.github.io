// Graphics-owned budgets. Leave room for the launch, wake and marine instances
// before allocating the remaining tier triangle budget to streamed islands.
export const MARINE_LIMITS=Object.freeze({
  high:Object.freeze({buoys:24,spots:6,fish:16,reserve:19000}),
  standard:Object.freeze({buoys:24,spots:6,fish:16,reserve:19000}),
  low:Object.freeze({buoys:12,spots:3,fish:12,reserve:11500}),
  emergency:Object.freeze({buoys:6,spots:1,fish:8,reserve:7000}),
});

// Graphics-only prevailing wind, world X/Z. Shared by launch pennant and smoke.
export const VISUAL_WIND=Object.freeze({x:.94,z:-.34,speed:1.4});
export const SETTLEMENT_LIMITS=Object.freeze({
  high:Object.freeze({chimneys:8,puffs:6,reserve:600}),
  standard:Object.freeze({chimneys:6,puffs:5,reserve:400}),
  low:Object.freeze({chimneys:3,puffs:4,reserve:180}),
  emergency:Object.freeze({chimneys:0,puffs:0,reserve:0}),
});
export const ISLAND_VISIBILITY=Object.freeze({range:1000,fadeStart:420,fadeEnd:1050});

// Navigation lights (js/render/beacon.mjs). `lamps` is the number of harbour
// signals lit at once, nearest first; the pinned goal's own signal is extra and
// stays on at every tier because it is navigation, not decoration.
export const BEACON_LIMITS=Object.freeze({
  high:Object.freeze({lamps:10,goal:true}),
  standard:Object.freeze({lamps:8,goal:true}),
  low:Object.freeze({lamps:5,goal:true}),
  emergency:Object.freeze({lamps:3,goal:true}),
});

// Aerial perspective for distant rock (js/render/islands.mjs). Backlit land at
// golden hour goes DARK and cool a long way before the airlight bleaches it.
// The first build faded straight to the haze colour, so a 900 m island sat at
// the same luminance as the sky behind it and read as nothing at all. These are
// linear-space multipliers applied to the island's own lit colour, chosen by how
// close the island's bearing is to the sun's. Nothing here touches HORIZON_FADE,
// the water shader or the collision circle.
export const AERIAL=Object.freeze({
  range:Object.freeze([240,760]),  // metres over which the silhouette comes in
  strength:.88,                    // how much of it lands on bare rock
  built:.58,                       // how much is WITHHELD from roofs/walls/masts
  chroma:.34,                      // rock chroma kept, so geologies stay distinct
  builtChroma:.82,
  cool:Object.freeze([.38,.41,.56]),
  warm:Object.freeze([.64,.48,.40]),
  crest:.075,                      // warm top-light, so the skyline separates
});

// Horizon weather in the shared sky shader (js/render/shaders.mjs). One scalar,
// so a suite can render the identical frame with it at 0 as a negative control.
// The sun stays exactly where it is: this is cloud, shafts and one drifting
// squall, not a day/night cycle.
export const WEATHER=Object.freeze({
  intensity:1,
  squallPeriod:2094,   // seconds for one lap of the compass (= the cloud wrap)
});
