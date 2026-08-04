// base is credits per tonne at demand == supply. baseDemand/baseSupply are the rest of the
// Reach, in tonnes per week — the player is a rounding error against them at week 1.

export default Object.freeze([
  Object.freeze({
    id: 'ore', name: 'Kestrel Ore', unit: 't', base: 52, elasticity: 0.55,
    volume: 1, decay: 0, from: null, baseDemand: 880, baseSupply: 860,
    minMult: 0.5, maxMult: 1.9, tint: '#c98a45',
  }),
  Object.freeze({
    id: 'halide', name: 'Sodium Halide', unit: 't', base: 196, elasticity: 0.62,
    volume: 1, decay: 0.02, from: Object.freeze({ ore: 2 }),
    baseDemand: 300, baseSupply: 292, minMult: 0.5, maxMult: 2.0, tint: '#9fe0ff',
  }),
  Object.freeze({
    id: 'filament', name: 'Filament', unit: 't', base: 940, elasticity: 0.7,
    volume: 1, decay: 0.04, from: Object.freeze({ halide: 2 }),
    baseDemand: 128, baseSupply: 120, minMult: 0.55, maxMult: 2.2, tint: '#ffb347',
  }),
]);
