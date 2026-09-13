// js/data/evolutions.js — ten payoffs. CONTRACTS §8.4.
//
// A weapon at level 8 plus the named passive owned (any level) makes the chest
// from a Conductor kill roll the evolved form. Every one of these changes
// BEHAVIOUR — the `kind`, or what the weapon chooses to hit, or whether it
// severs — not just the numbers. `levels: []` is deliberate: an evolved weapon
// does not level further.

export const EVOLUTIONS = Object.freeze({

  gospel: {
    id: 'gospel', from: 'emberlash', requires: 'widowspan',
    name: 'Wildfire Gospel', tag: 'GSP',
    desc: 'The arcs stop being arcs. The fire simply stays lit all the way round you and turns, and it turns faster the more there are to burn.',
    kind: 'aura', colour: [1.00, 0.52, 0.12], cuts: true,
    base: { damage: 46, cooldown: 0.28, area: 118, speed: 3.2, count: 1, duration: 0, pierce: 99, knock: 70, crit: 0.10 },
    levels: []
  },

  ninecenser: {
    id: 'ninecenser', from: 'censer', requires: 'waxseal',
    name: 'Thurible of the Nine', tag: 'IX',
    desc: 'The chains let go. Each censer flies off at a Conductor — not a puppet, a Conductor — and comes back smoking.',
    kind: 'boomerang', colour: [1.00, 0.90, 0.55], cuts: true,
    base: { damage: 62, cooldown: 1.1, area: 22, speed: 380, count: 5, duration: 2.4, pierce: 99, knock: 60, crit: 0.15 },
    levels: []
  },

  exhumer: {
    id: 'exhumer', from: 'bonesaw', requires: 'whetstone',
    name: 'Exhumer', tag: 'EXH',
    desc: 'It never comes back. It settles into a wide slow circle out at the edge of sight and takes the top off everything that wanders into it.',
    kind: 'orbit', colour: [0.92, 0.94, 0.84], cuts: true,
    base: { damage: 74, cooldown: 0.30, area: 185, speed: 1.6, count: 3, duration: 0, pierce: 99, knock: 90, crit: 0.35 },
    levels: []
  },

  quietpair: {
    id: 'quietpair', from: 'shears', requires: 'ilseedge',
    name: 'The Quiet Pair', tag: 'QTP',
    desc: 'The blades stop travelling through air. They travel along the thread — puppet to Conductor, and every puppet hanging off it on the way.',
    kind: 'chain', colour: [0.86, 0.96, 1.00], cuts: true,
    base: { damage: 54, cooldown: 0.9, area: 230, speed: 0, count: 9, duration: 0.18, pierce: 0, knock: 20, crit: 0.25 },
    levels: []
  },

  cathedral: {
    id: 'cathedral', from: 'pyrebell', requires: 'graveash',
    name: 'Cathedral Bell', tag: 'CTH',
    desc: 'Too heavy to swing, so it falls instead. Where the densest part of the crowd is, a column of fire arrives with the note already in it.',
    kind: 'strike', colour: [1.00, 0.38, 0.14], cuts: true,
    base: { damage: 210, cooldown: 1.9, area: 92, speed: 0, count: 3, duration: 0.5, pierce: 99, knock: 300, crit: 0.15 },
    levels: []
  },

  longhand: {
    id: 'longhand', from: 'marionette', requires: 'splittongue',
    name: 'The Long Hand', tag: 'LNG',
    desc: 'You stop lifting them one at a time. Anything your puppets kill gets up on your thread, and none of them put themselves back down.',
    kind: 'summon', colour: [0.82, 0.58, 1.00], cuts: true,
    base: { damage: 58, cooldown: 2.4, area: 34, speed: 130, count: 4, duration: 26, pierce: 0, knock: 40, crit: 0.20 },
    levels: []
  },

  widowmaker: {
    id: 'widowmaker', from: 'gravepistol', requires: 'boneawl',
    name: 'Widowmaker', tag: 'WDW',
    desc: 'The round stops stopping. It goes through the whole rank, and it takes the threads with it on the way past — which the pistol never used to do.',
    kind: 'shot', colour: [1.00, 0.94, 0.66], cuts: true,
    base: { damage: 165, cooldown: 0.55, area: 9, speed: 760, count: 2, duration: 1.3, pierce: 99, knock: 140, crit: 0.40 },
    levels: []
  },

  blackrite: {
    id: 'blackrite', from: 'hexcandle', requires: 'hangedcharm',
    name: 'Black Rite', tag: 'RTE',
    desc: 'The wax stops being a burn and starts being an instruction. Whatever dies in the pool gets up in it, on your side, and walks out.',
    kind: 'summon', colour: [0.62, 0.24, 0.95], cuts: false,
    base: { damage: 44, cooldown: 3.2, area: 96, speed: 100, count: 3, duration: 14, pierce: 99, knock: 0, crit: 0.10 },
    levels: []
  },

  ninefold: {
    id: 'ninefold', from: 'chain', requires: 'quickstep',
    name: 'Ninefold Arc', tag: 'NIN',
    desc: 'The arc stops jumping. It stays — a standing lattice strung from you to every thread in reach, burning through all of them at once, for as long as they are stupid enough to hold it.',
    kind: 'aura', colour: [0.72, 0.94, 1.00], cuts: true,
    base: { damage: 88, cooldown: 0.22, area: 235, speed: 0, count: 9, duration: 0, pierce: 99, knock: 40, crit: 0.20 },
    levels: []
  },

  requiem: {
    id: 'requiem', from: 'choirbreaker', requires: 'lodestone',
    name: 'Requiem', tag: 'RQM',
    desc: 'It stops falling and starts opening. A pit under the Conductor that does not close, dragging the whole Choir in by their own threads for as long as it is hungry.',
    kind: 'zone', colour: [1.00, 1.00, 0.98], cuts: true,
    // negative knock = pull. The pit gathers inward; that is the whole point.
    base: { damage: 130, cooldown: 0.35, area: 130, speed: 0, count: 2, duration: 6.0, pierce: 99, knock: -240, crit: 0.25 },
    levels: []
  }

});

export const list = Object.freeze(Object.keys(EVOLUTIONS).map(k => EVOLUTIONS[k]));
