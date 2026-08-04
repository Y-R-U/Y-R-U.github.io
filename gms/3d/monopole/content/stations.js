// Default export is the four station modules. `stations` is the two built stations.
// mesh.kit ids match stationModule() in js/world/kit/station.js.

export default Object.freeze([
  Object.freeze({
    id: 'hub', name: 'Operations Hub', cost: 0, upkeep: 260, removable: false,
    converts: null, hold: 400,
    mesh: Object.freeze({ kit: 'hub', bays: 0, hero: true, windows: 260 }),
    blurb: 'Berths, bond store and the ledger the company is named after.',
  }),
  Object.freeze({
    id: 'bay', name: 'Dock Bay', cost: 9000, upkeep: 140, removable: true,
    converts: null, hold: 260,
    mesh: Object.freeze({ kit: 'bay', bays: 1, hero: false, windows: 90 }),
    blurb: 'One more mouth for one more hull. Storage, not throughput.',
  }),
  Object.freeze({
    id: 'refinery', name: 'Halide Refinery', cost: 16000, upkeep: 460, removable: true,
    converts: Object.freeze({ from: 'ore', per: 2, into: 'halide', rate: 12 }),
    hold: 200,
    mesh: Object.freeze({ kit: 'refinery', bays: 2, hero: false, windows: 140 }),
    blurb: 'Two tonnes of Kestrel ore, one tonne of sodium halide, a lot of waste heat.',
  }),
  Object.freeze({
    id: 'coilline', name: 'Coil Line', cost: 17000, upkeep: 900, removable: true,
    converts: Object.freeze({ from: 'halide', per: 2, into: 'filament', rate: 6 }),
    hold: 160,
    mesh: Object.freeze({ kit: 'coilline', bays: 4, hero: false, windows: 220 }),
    blurb: 'Draws halide into filament. Every lamp and drive coil in the Reach eats it.',
  }),
]);

export const stations = Object.freeze([
  Object.freeze({
    id: 'ledger', name: 'Ledger Station', owner: 'player', site: 'ledger',
    palette: 'ferrous', mesh: 'ledger',
    modules: Object.freeze(['hub', 'bay', 'refinery']),
  }),
  Object.freeze({
    id: 'drayyard', name: 'Dray Yard', owner: 'rival', site: 'drayyard',
    palette: 'corvain', mesh: 'drayyard',
    modules: Object.freeze(['hub', 'bay', 'bay', 'refinery', 'coilline']),
  }),
]);
