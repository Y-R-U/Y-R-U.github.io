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
