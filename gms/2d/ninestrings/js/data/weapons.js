// js/data/weapons.js — the sixteen. Declarative only, CONTRACTS §8.1.
//
// `levels[i]` are DELTAS applied at level i+2, so levels[0] is the level-2 step
// and there are exactly 7 of them (max weapon level 8, DESIGN §5).
// Deltas are ADDITIVE to the base block, including negative cooldown steps.
//
// `cuts` is a real design lever, not flavour: half the arsenal severs threads
// and half does not. Sweeping shapes cut (arcs, orbits, rings, arcs of
// lightning across gaps); point projectiles and ground effects do not. Silver
// Shears is the specialist — cheap, frequent, and it scales on count, which is
// the stat that decides how many threads you cross per second.
//
// Units: damage per hit · cooldown seconds · area world units (420 visible
// across) · speed units/s, or rad/s for 'orbit' · duration seconds · knock
// impulse · crit 0..1. For 'orbit'/'aura'/'zone'/'trail', `cooldown` is the
// per-target re-hit interval.

export const WEAPONS = Object.freeze({

  emberlash: {
    id: 'emberlash', name: 'Emberlash', tag: 'LSH',
    desc: 'A lamp-wick soaked and swung. It draws a line of fire through the gap in front of you.',
    kind: 'arc', colour: [1.00, 0.62, 0.22], cuts: true, charOnly: 'wick',
    base: { damage: 11, cooldown: 1.15, area: 46, speed: 0, count: 1, duration: 0.28, pierce: 99, knock: 40, crit: 0.05 },
    levels: [
      { damage: 4, text: '+4 damage' },
      { count: 1, text: '+1 arc, on the other side' },
      { area: 10, text: 'Wider sweep' },
      { duration: 0.24, damage: 3, text: 'The fire stays where the arc passed' },
      { cooldown: -0.22, text: '-0.22s between lashes' },
      { damage: 7, knock: 35, text: '+7 damage, heavier shove' },
      { count: 1, area: 8, text: '+1 arc, wider still' }
    ],
    evolvesTo: 'gospel', requires: 'widowspan'
  },

  censer: {
    id: 'censer', name: 'Censer', tag: 'CNS',
    desc: 'A thurible on a long chain. It keeps its own time and does not need your attention.',
    kind: 'orbit', colour: [1.00, 0.84, 0.45], cuts: true, charOnly: 'vane',
    base: { damage: 9, cooldown: 0.45, area: 64, speed: 2.4, count: 2, duration: 0, pierce: 99, knock: 20, crit: 0.05 },
    levels: [
      { count: 1, text: '+1 censer' },
      { damage: 4, text: '+4 damage' },
      { area: 14, text: 'Wider orbit' },
      { speed: 1.1, area: 10, text: 'The chain pays out and the swing goes wild' },
      { count: 1, text: '+1 censer' },
      { damage: 6, knock: 20, text: '+6 damage, knocks them off their feet' },
      { count: 2, speed: 0.6, text: '+2 censers, faster' }
    ],
    evolvesTo: 'ninecenser', requires: 'waxseal'
  },

  bonesaw: {
    id: 'bonesaw', name: 'Bonesaw', tag: 'SAW',
    desc: 'Thrown flat and low, the way you would skim a stone. It always comes back.',
    kind: 'boomerang', colour: [0.86, 0.88, 0.78], cuts: true, charOnly: 'dredge',
    base: { damage: 16, cooldown: 1.5, area: 12, speed: 280, count: 1, duration: 1.6, pierce: 3, knock: 30, crit: 0.15 },
    levels: [
      { damage: 6, text: '+6 damage' },
      { count: 1, text: '+1 saw' },
      { pierce: 2, text: 'Cuts through two more bodies' },
      { pierce: 4, duration: 0.8, text: 'The saw stops stopping for bodies' },
      { cooldown: -0.3, text: '-0.3s cooldown' },
      { count: 1, damage: 8, text: '+1 saw, +8 damage' },
      { crit: 0.15, damage: 10, text: '+15% crit, +10 damage' }
    ],
    evolvesTo: 'exhumer', requires: 'whetstone'
  },

  shears: {
    id: 'shears', name: 'Silver Shears', tag: 'SHR',
    desc: 'Small, cold, and thrown at nothing in particular. They are not aimed at bodies.',
    kind: 'shot', colour: [0.78, 0.92, 1.00], cuts: true, charOnly: 'ilse',
    base: { damage: 7, cooldown: 0.65, area: 7, speed: 340, count: 2, duration: 1.1, pierce: 1, knock: 6, crit: 0.10 },
    levels: [
      { count: 1, text: '+1 blade' },
      { cooldown: -0.10, text: 'Faster snips' },
      { pierce: 1, area: 2, text: 'Blades pass through one more body' },
      { count: 2, cooldown: -0.08, text: 'The pair becomes a flight, fanned across the gaps' },
      { damage: 5, text: '+5 damage' },
      { count: 1, duration: 0.5, text: '+1 blade, and they travel further' },
      { count: 2, crit: 0.10, area: 3, text: '+2 blades, +10% crit' }
    ],
    evolvesTo: 'quietpair', requires: 'ilseedge'
  },

  pyrebell: {
    id: 'pyrebell', name: 'Pyre Bell', tag: 'BEL',
    desc: 'Rung once. The sound goes out as a ring of fire and does not come back.',
    kind: 'aura', colour: [1.00, 0.45, 0.20], cuts: true, charOnly: 'ash',
    base: { damage: 14, cooldown: 2.2, area: 70, speed: 120, count: 1, duration: 0.5, pierce: 99, knock: 120, crit: 0.05 },
    levels: [
      { damage: 6, text: '+6 damage' },
      { area: 16, text: 'The ring goes further' },
      { cooldown: -0.35, text: '-0.35s between tolls' },
      { count: 1, duration: 0.3, text: 'A second ring follows the first out' },
      { damage: 9, knock: 60, text: '+9 damage, harder push' },
      { area: 22, speed: 30, text: 'Wider, faster ring' },
      { count: 1, cooldown: -0.30, damage: 10, text: '+1 ring, +10 damage' }
    ],
    evolvesTo: 'cathedral', requires: 'graveash'
  },

  marionette: {
    id: 'marionette', name: 'Marionette', tag: 'MAR',
    desc: 'You have the same trick they do. You have simply been polite about it.',
    kind: 'summon', colour: [0.72, 0.45, 1.00], cuts: false, charOnly: 'hand',
    base: { damage: 12, cooldown: 6.0, area: 20, speed: 90, count: 1, duration: 9, pierce: 0, knock: 10, crit: 0.10 },
    levels: [
      { count: 1, text: '+1 puppet' },
      { damage: 6, duration: 3, text: '+6 damage, they last longer' },
      { cooldown: -1.2, text: '-1.2s between liftings' },
      { duration: 6, damage: 8, text: 'Your puppets keep the thread when they fall, and stand once more' },
      { count: 1, text: '+1 puppet' },
      { damage: 12, area: 8, text: '+12 damage, longer reach' },
      { count: 2, cooldown: -1.0, text: '+2 puppets' }
    ],
    evolvesTo: 'longhand', requires: 'splittongue'
  },

  gravepistol: {
    id: 'gravepistol', name: 'Gravepistol', tag: 'PST',
    desc: 'Buried with an officer who expected to need it. He was not wrong, only early.',
    kind: 'shot', colour: [0.95, 0.90, 0.72], cuts: false,
    base: { damage: 26, cooldown: 1.4, area: 5, speed: 520, count: 1, duration: 0.9, pierce: 0, knock: 70, crit: 0.20 },
    levels: [
      { damage: 10, text: '+10 damage' },
      { count: 1, cooldown: 0.15, text: 'Second barrel, slower to reload' },
      { pierce: 1, text: 'Rounds punch through one body' },
      { cooldown: -0.50, count: 1, text: 'It fires as fast as you can be frightened' },
      { damage: 16, crit: 0.10, text: '+16 damage, +10% crit' },
      { pierce: 2, speed: 80, text: 'Punches through two more' },
      { damage: 22, count: 1, text: '+22 damage, +1 round' }
    ],
    evolvesTo: 'widowmaker', requires: 'boneawl'
  },

  hexcandle: {
    id: 'hexcandle', name: 'Hex Candle', tag: 'HEX',
    desc: 'Set down and left burning. The wax spreads further than wax should.',
    kind: 'zone', colour: [0.55, 0.30, 0.85], cuts: false,
    base: { damage: 8, cooldown: 3.0, area: 52, speed: 0, count: 1, duration: 4.0, pierce: 99, knock: 0, crit: 0 },
    levels: [
      { duration: 1.5, text: 'Burns longer' },
      { count: 1, text: '+1 candle' },
      { area: 14, text: 'The pool spreads' },
      { damage: 6, duration: 2.5, text: 'The wax sets — what crosses it keeps the limp' },
      { cooldown: -0.8, text: '-0.8s between candles' },
      { count: 1, area: 12, text: '+1 candle, wider pool' },
      { damage: 10, duration: 3, text: '+10 damage, burns far longer' }
    ],
    evolvesTo: 'blackrite', requires: 'hangedcharm'
  },

  lantern: {
    id: 'lantern', name: 'Lantern', tag: 'LTN',
    desc: 'Carried high. Nothing in the circle of it gets to be a surprise.',
    kind: 'aura', colour: [1.00, 0.78, 0.38], cuts: false,
    base: { damage: 6, cooldown: 0.50, area: 58, speed: 0, count: 1, duration: 0, pierce: 99, knock: 0, crit: 0 },
    levels: [
      { area: 12, text: 'A wider circle of light' },
      { damage: 3, text: '+3 damage' },
      { cooldown: -0.12, text: 'The light burns faster' },
      { area: 20, damage: 3, text: 'Anything lit cannot hide its thread' },
      { damage: 4, text: '+4 damage' },
      { area: 16, text: 'Wider still' },
      { damage: 6, cooldown: -0.12, text: '+6 damage, faster burn' }
    ]
  },

  chain: {
    id: 'chain', name: 'Chain', tag: 'CHN',
    desc: 'It jumps the distance between one body and the next, which is where the threads are.',
    kind: 'chain', colour: [0.60, 0.85, 1.00], cuts: true,
    base: { damage: 18, cooldown: 2.0, area: 150, speed: 0, count: 3, duration: 0.20, pierce: 0, knock: 15, crit: 0.10 },
    levels: [
      { count: 1, text: '+1 jump' },
      { damage: 7, text: '+7 damage' },
      { area: 30, text: 'Longer reach between jumps' },
      { count: 2, duration: 0.15, text: 'The arc prefers the gap to the body' },
      { cooldown: -0.4, text: '-0.4s cooldown' },
      { damage: 12, count: 1, text: '+12 damage, +1 jump' },
      { count: 3, area: 40, text: '+3 jumps, longer reach' }
    ],
    evolvesTo: 'ninefold', requires: 'quickstep'
  },

  salt: {
    id: 'salt', name: 'Sanctified Salt', tag: 'SLT',
    desc: 'Poured behind you as you walk. An old habit that turns out to have been right.',
    kind: 'trail', colour: [0.95, 0.97, 1.00], cuts: false,
    base: { damage: 10, cooldown: 0.35, area: 16, speed: 0, count: 1, duration: 2.5, pierce: 99, knock: 0, crit: 0 },
    levels: [
      { duration: 1.0, text: 'The line lasts longer' },
      { damage: 4, text: '+4 damage' },
      { area: 5, text: 'A thicker line' },
      { duration: 2.0, count: 1, text: 'You leave a double line. They will not cross it twice' },
      { damage: 5, cooldown: -0.10, text: '+5 damage, poured faster' },
      { area: 6, duration: 1.5, text: 'Thicker, and it keeps' },
      { damage: 8, count: 1, text: '+8 damage, +1 line' }
    ]
  },

  kite: {
    id: 'kite', name: "Reaper's Kite", tag: 'KTE',
    desc: 'A paper kite on a very long line. The kite is not the weapon.',
    kind: 'orbit', colour: [0.85, 0.75, 0.95], cuts: true,
    base: { damage: 13, cooldown: 0.50, area: 130, speed: 1.2, count: 1, duration: 0, pierce: 99, knock: 25, crit: 0.10 },
    levels: [
      { area: 24, text: 'More line paid out' },
      { damage: 6, text: '+6 damage' },
      { speed: 0.5, text: 'It circles faster' },
      { count: 1, area: -30, text: 'A second kite on a short line, turning the other way' },
      { damage: 8, knock: 20, text: '+8 damage, heavier drag' },
      { area: 30, speed: 0.4, text: 'Longer line, faster turn' },
      { count: 1, damage: 10, text: '+1 kite, +10 damage' }
    ]
  },

  choirbreaker: {
    id: 'choirbreaker', name: 'Choirbreaker', tag: 'BRK',
    desc: 'It comes down on whichever of them is holding the most thread. It is not subtle.',
    kind: 'strike', colour: [1.00, 1.00, 0.92], cuts: true,
    base: { damage: 60, cooldown: 4.5, area: 46, speed: 0, count: 1, duration: 0.30, pierce: 99, knock: 200, crit: 0.15 },
    levels: [
      { damage: 22, text: '+22 damage' },
      { area: 10, text: 'Wider crater' },
      { cooldown: -0.8, text: '-0.8s cooldown' },
      { count: 1, text: 'It picks two, and it picks the ones holding the most thread' },
      { damage: 34, area: 10, text: '+34 damage, wider' },
      { cooldown: -0.9, knock: 80, text: 'Falls sooner, lands harder' },
      { count: 1, damage: 50, text: '+1 strike, +50 damage' }
    ],
    evolvesTo: 'requiem', requires: 'lodestone'
  },

  gravebloom: {
    id: 'gravebloom', name: 'Grave Bloom', tag: 'BLM',
    desc: 'Something grows where the ground has been disturbed. It opens upward, through whatever is standing there.',
    kind: 'zone', colour: [0.60, 0.90, 0.55], cuts: false,
    base: { damage: 22, cooldown: 2.6, area: 34, speed: 0, count: 2, duration: 0.8, pierce: 99, knock: 60, crit: 0.10 },
    levels: [
      { count: 1, text: '+1 bloom' },
      { damage: 9, text: '+9 damage' },
      { area: 8, text: 'Wider blooms' },
      { duration: 1.4, damage: 6, text: 'A bloom that kills seeds another where the body fell' },
      { count: 2, text: '+2 blooms' },
      { cooldown: -0.6, area: 8, text: 'Faster, wider' },
      { count: 2, damage: 16, text: '+2 blooms, +16 damage' }
    ]
  },

  nails: {
    id: 'nails', name: 'Iron Nails', tag: 'NLS',
    desc: 'Coffin nails, thrown by the handful. There has been no shortage of them for some time.',
    kind: 'shot', colour: [0.72, 0.70, 0.66], cuts: false,
    base: { damage: 6, cooldown: 1.0, area: 4, speed: 400, count: 5, duration: 0.6, pierce: 0, knock: 8, crit: 0.10 },
    levels: [
      { count: 2, text: '+2 nails' },
      { damage: 3, text: '+3 damage' },
      { pierce: 1, text: 'Nails punch through one body' },
      { duration: 0.5, speed: -120, text: 'Nails that miss fall and stay point-up in the ground' },
      { count: 3, text: '+3 nails' },
      { damage: 4, crit: 0.10, text: '+4 damage, +10% crit' },
      { count: 4, pierce: 1, text: '+4 nails, more punch-through' }
    ]
  },

  tolling: {
    id: 'tolling', name: 'Tolling', tag: 'TLL',
    desc: 'One note, held, on a count nobody set. The dead know it and it stops them dead.',
    kind: 'aura', colour: [0.82, 0.86, 0.95], cuts: false,
    base: { damage: 34, cooldown: 3.6, area: 96, speed: 0, count: 1, duration: 0.25, pierce: 99, knock: 90, crit: 0.05 },
    levels: [
      { damage: 12, text: '+12 damage' },
      { area: 18, text: 'The note carries further' },
      { cooldown: -0.6, text: '-0.6s between tolls' },
      { duration: 0.35, knock: 60, text: 'They are held still for as long as the note lasts' },
      { damage: 18, text: '+18 damage' },
      { area: 24, cooldown: -0.5, text: 'Wider, and sooner' },
      { damage: 26, area: 20, text: '+26 damage, wider still' }
    ]
  }

});

export const list = Object.freeze(Object.keys(WEAPONS).map(k => WEAPONS[k]));
