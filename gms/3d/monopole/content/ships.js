// mesh is the shipClass() id in js/world/kit/ship.js. hull is what the kit reads for scale.

export default Object.freeze([
  Object.freeze({
    id: 'kite', name: 'Kite-class Hauler', role: 'haul', mesh: 'hauler',
    hold: 120, speed: 1.0, upkeep: 260, cost: 18000, mine: 0,
    hull: Object.freeze({ len: 84, kit: 'boxspine', greeble: 0.6 }),
    palette: 'ferrous', lights: 14, lod: Object.freeze([0, 900, 2600]),
  }),
  Object.freeze({
    id: 'ossa', name: 'Ossa-class Rig', role: 'mine', mesh: 'rig',
    hold: 90, speed: 0.8, upkeep: 340, cost: 26000, mine: 47,
    hull: Object.freeze({ len: 62, kit: 'gantry', greeble: 0.8 }),
    palette: 'ferrous', lights: 10, lod: Object.freeze([0, 800, 2200]),
  }),
  Object.freeze({
    id: 'lance', name: 'Lance-class Tender', role: 'escort', mesh: 'escort',
    hold: 40, speed: 1.35, upkeep: 180, cost: 12000, mine: 0,
    hull: Object.freeze({ len: 38, kit: 'wedge', greeble: 0.4 }),
    palette: 'ferrous', lights: 6, lod: Object.freeze([0, 700, 1800]),
  }),
]);
