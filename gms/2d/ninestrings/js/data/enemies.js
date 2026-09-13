// NOTE (balance, after the first full 12-stage harness run): the HP curve was
// compressed at the top. The original table ran 22hp for a shambler to 6000 for
// a throneguard - 273x - while the weapon set only grows about 12x across a run
// (11 base damage to ~46, times build multipliers). The result was that Acts III
// and IV were not hard, they were arithmetically unreachable: a level-25 seeded
// build killed NOTHING in 37 seconds on Stage 11. Fodder under 60hp is untouched;
// everything above is 60 + (hp-60)*0.30, and bosses 1500 + (hp-1500)*0.34, which
// keeps every relative ordering the original table expressed.
//
// Contact damage was compressed the same way and for the same reason: it ran
// 6 to 45 across the game (7.5x) against a player health pool that only grows
// 2.3x, so Act IV killed you in three touches regardless of build. Above 12 it
// is 12 + (dmg-12)*0.55.
// js/data/enemies.js — the bestiary. Declarative only, see docs/CONTRACTS.md §8.2.
//
// Palettes are per-act (DESIGN §8): Act I wet black + cold amber, Act II drowned
// green-blue, Act III ash and ember, Act IV bone and violet.
// `hp` is tuned against the DPS curve recorded in docs/lanes/C-content.md.

const P1 = ['#c9c3ae', '#191b1f', '#f2a94f'];  // town
const P2 = ['#93a89c', '#11241e', '#4fd4c4'];  // marsh
const P3 = ['#b3a89b', '#231a17', '#ff5c2e'];  // city
const P4 = ['#e7e1d3', '#151122', '#b16dff'];  // below

export const ENEMIES = Object.freeze({

  // ——————————————————————————————————————— Act I · The Town

  shambler: {
    id: 'shambler', name: 'Shambler',
    hp: 22, speed: 26, dmg: 6, armour: 0, radius: 8, xp: 1, mass: 1,
    sprite: { rig: 'humanoid', palette: P1, build: 0.42, tatter: 0.55, extra: [], frames: 4 },
    ai: 'chase', aiParams: { turn: 3.0 }, onDeath: null,
    strungChance: 0.98,
    codex: "Someone's neighbour, still in the coat they were buried in. The thread does the walking. The body only has to remember the way home."
  },

  crawler: {
    id: 'crawler', name: 'Crawler',
    hp: 14, speed: 62, dmg: 5, armour: 0, radius: 6, xp: 1, mass: 0.6,
    sprite: { rig: 'crawler', palette: P1, build: 0.20, tatter: 0.75, extra: ['jaw'], frames: 6 },
    ai: 'chase', aiParams: { turn: 6.0, weave: 0.35 }, onDeath: null,
    strungChance: 0.92,
    codex: "It broke something climbing out and never stopped to mind. Faster on four than most of the standing dead are on two."
  },

  lamplost: {
    id: 'lamplost', name: 'Lamplost',
    hp: 46, speed: 24, dmg: 9, armour: 1, radius: 9, xp: 3, mass: 1.4,
    sprite: { rig: 'humanoid', palette: P1, build: 0.50, tatter: 0.40, extra: ['lantern'], frames: 4 },
    ai: 'chase', aiParams: { turn: 2.4, glow: 36 }, onDeath: null,
    strungChance: 0.95,
    codex: "The lamplighters went first; they were the ones still out at that hour. Their lamps are all still lit. Nobody has had the heart to ask what is keeping them lit."
  },

  bellrunner: {
    id: 'bellrunner', name: 'Bellrunner',
    hp: 30, speed: 34, dmg: 13, armour: 0, radius: 8, xp: 3, mass: 0.9,
    sprite: { rig: 'humanoid', palette: P1, build: 0.30, tatter: 0.65, extra: ['chains'], frames: 6 },
    ai: 'charge',
    // wind-up is deliberately long and loud: this is the enemy that teaches sidestepping.
    aiParams: { windup: 0.9, dashSpeed: 190, dashTime: 0.55, restTime: 1.4, range: 150 },
    onDeath: null,
    strungChance: 0.9,
    codex: "It hears the bell, and it runs at the bell. You are simply in between."
  },

  bloated: {
    id: 'bloated', name: 'Bloated',
    hp: 60, speed: 16, dmg: 8, armour: 0, radius: 12, xp: 5, mass: 2.2,
    sprite: { rig: 'bloat', palette: P1, build: 0.95, tatter: 0.5, extra: [], frames: 4 },
    ai: 'burst', aiParams: { fuse: 1.1, blastRadius: 54, blastDmg: 30, triggerRange: 34 },
    onDeath: 'explode',
    strungChance: 0.85,
    codex: "Gas, mostly. The Choirmasters favour them because a full one carries further than a thrown stone."
  },

  pallbearer: {
    id: 'pallbearer', name: 'Pallbearer',
    hp: 96, speed: 18, dmg: 16, armour: 4, radius: 15, xp: 9, mass: 6,
    sprite: { rig: 'hulk', palette: P1, build: 0.88, tatter: 0.30, extra: ['armour'], frames: 4 },
    ai: 'chase', aiParams: { turn: 1.2, shove: 130 }, onDeath: null,
    strungChance: 0.7, elite: true,
    codex: "Six of them carried the box in. One of them carries it still, and will not be told that the box is empty."
  },

  screamer: {
    id: 'screamer', name: 'Screamer',
    hp: 63, speed: 30, dmg: 4, armour: 0, radius: 9, xp: 8, mass: 1,
    sprite: { rig: 'humanoid', palette: P1, build: 0.24, tatter: 0.85, extra: ['jaw'], frames: 6 },
    // support: keeps its distance and hastens everything inside buffRadius.
    ai: 'orbit', aiParams: { standoff: 160, buffRadius: 130, buffSpeed: 1.45, buffDmg: 1.15, pulse: 2.0 },
    onDeath: null,
    strungChance: 0.45,
    codex: "It has no jaw left to scream with, which has not slowed it. The note it holds makes the others quicker. Cut it first."
  },

  // ——————————————————————————————————————— Act II · The Marsh

  drowned: {
    id: 'drowned', name: 'Drowned',
    hp: 78, speed: 21, dmg: 12, armour: 2, radius: 9, xp: 4, mass: 1.8,
    sprite: { rig: 'humanoid', palette: P2, build: 0.62, tatter: 0.5, extra: [], frames: 4 },
    ai: 'chase', aiParams: { turn: 2.0, waterlogged: 1 }, onDeath: null,
    strungChance: 0.98,
    codex: "The Row flooded in a night and the water never left. Neither did they. Weeks under, and the thread still finds the nape."
  },

  spitter: {
    id: 'spitter', name: 'Spitter',
    hp: 69, speed: 26, dmg: 7, armour: 0, radius: 9, xp: 6, mass: 1.2,
    sprite: { rig: 'humanoid', palette: P2, build: 0.36, tatter: 0.7, extra: ['jaw'], frames: 6 },
    ai: 'spit', aiParams: { standoff: 190, every: 2.6, projSpeed: 130, projDmg: 14, projRadius: 6, arc: 0, lob: 1 },
    onDeath: null,
    strungChance: 0.88,
    codex: "Something in the marsh taught it to hold bile the way a mouth holds a word, and to let go of it at range."
  },

  fenlice: {
    id: 'fenlice', name: 'Fen Lice',
    hp: 18, speed: 78, dmg: 3, armour: 0, radius: 4, xp: 1, mass: 0.25,
    sprite: { rig: 'crawler', palette: P2, build: 0.10, tatter: 0.9, extra: [], frames: 6 },
    ai: 'swarm', aiParams: { cohesion: 0.6, jitter: 1.2, turn: 8 }, onDeath: null,
    strungChance: 0.6,
    codex: "Not one thing. Hundreds, each on a thread of its own, so fine you will not see them until they are already on you."
  },

  weeper: {
    id: 'weeper', name: 'Weeper',
    hp: 120, speed: 19, dmg: 14, armour: 2, radius: 13, xp: 11, mass: 3.4,
    sprite: { rig: 'bloat', palette: P2, build: 0.80, tatter: 0.6, extra: ['chains'], frames: 4 },
    ai: 'split', aiParams: { splitInto: 'fenlice', splitCount: 6, splitSpread: 44 },
    onDeath: 'split',
    strungChance: 0.9,
    codex: "It comes apart when it dies, and what comes out of it was never one body to begin with."
  },

  corpselight: {
    id: 'corpselight', name: 'Corpselight',
    hp: 75, speed: 40, dmg: 10, armour: 0, radius: 7, xp: 7, mass: 0.4,
    // hover: does not touch the ground, so it ignores terrain and drifts.
    sprite: { rig: 'wisp', palette: P2, build: 0.15, tatter: 0.2, extra: ['halo'], frames: 6 },
    ai: 'ranged', aiParams: { standoff: 220, every: 2.0, projSpeed: 165, projDmg: 11, homing: 0.9, hover: 1 },
    onDeath: null,
    strungChance: 0.25,
    codex: "A lamp with nobody holding it. Follow it and you join the row of things that followed it."
  },

  // ——————————————————————————————————————— Act III · The City

  ashwalker: {
    id: 'ashwalker', name: 'Ashwalker',
    hp: 168, speed: 25, dmg: 14, armour: 4, radius: 9, xp: 6, mass: 1.9,
    sprite: { rig: 'humanoid', palette: P3, build: 0.52, tatter: 0.65, extra: [], frames: 4 },
    ai: 'chase', aiParams: { turn: 2.2, auraRadius: 30, auraDmg: 9 }, onDeath: null,
    strungChance: 0.97,
    codex: "Ashgate burned for nine days and these walked the whole of it. Whatever is left of them is still burning. The thread does not mind."
  },

  emberling: {
    id: 'emberling', name: 'Emberling',
    hp: 96, speed: 70, dmg: 12, armour: 0, radius: 6, xp: 4, mass: 0.5,
    sprite: { rig: 'crawler', palette: P3, build: 0.18, tatter: 0.8, extra: ['jaw'], frames: 6 },
    ai: 'burst', aiParams: { fuse: 0, dashSpeed: 220, dashTime: 0.35, restTime: 0.8, blastRadius: 0 },
    onDeath: null,
    strungChance: 0.85,
    codex: "Small, quick, and hot enough to leave a mark on stone. They travel in the updraught, and they arrive together."
  },

  bellplate: {
    id: 'bellplate', name: 'Bellplate',
    hp: 462, speed: 20, dmg: 22, armour: 14, radius: 17, xp: 34, mass: 9,
    sprite: { rig: 'hulk', palette: P3, build: 0.94, tatter: 0.2, extra: ['armour', 'horns'], frames: 4 },
    ai: 'charge', aiParams: { windup: 1.2, dashSpeed: 165, dashTime: 0.8, restTime: 2.0, range: 240, shove: 220 },
    onDeath: null,
    strungChance: 0.6, elite: true,
    codex: "Cathedral plate, worn by nobody in particular. The armour was never the point. The point is how long it takes you to get through it."
  },

  cantor: {
    id: 'cantor', name: 'Cantor',
    hp: 222, speed: 34, dmg: 8, armour: 6, radius: 10, xp: 26, mass: 1.2,
    sprite: { rig: 'demon', palette: P3, build: 0.35, tatter: 0.1, extra: ['halo', 'chains'], frames: 6 },
    // support: carries spare thread and re-strings anything cut inside restringRadius.
    ai: 'orbit', aiParams: { standoff: 210, restringRadius: 150, restringEvery: 2.4, restringMax: 3, hover: 1 },
    onDeath: null,
    strungChance: 0.1, elite: true,
    codex: "It carries spare thread. Cut a puppet within its sight and the cantor will string it again, and watch you while it does."
  },

  surgeon: {
    id: 'surgeon', name: 'Pale Surgeon',
    hp: 156, speed: 28, dmg: 9, armour: 2, radius: 9, xp: 12, mass: 1.3,
    sprite: { rig: 'humanoid', palette: P3, build: 0.30, tatter: 0.25, extra: ['chains'], frames: 6 },
    ai: 'ranged', aiParams: { standoff: 230, every: 1.5, burst: 3, projSpeed: 200, projDmg: 13, bleed: 4 },
    onDeath: null,
    strungChance: 0.8,
    codex: "The Long Hospital kept working after the staff stopped. It still sorts the wounded from the dead. It has never been good at telling them apart."
  },

  // ——————————————————————————————————————— Act IV · Below

  namewraith: {
    id: 'namewraith', name: 'Namewraith',
    hp: 312, speed: 46, dmg: 18, armour: 4, radius: 8, xp: 18, mass: 0.5,
    sprite: { rig: 'wisp', palette: P4, build: 0.12, tatter: 0.15, extra: ['halo'], frames: 6 },
    ai: 'ranged', aiParams: { standoff: 250, every: 1.8, projSpeed: 150, projDmg: 24, homing: 1.4, blink: 4.0, hover: 1 },
    onDeath: null,
    strungChance: 0.2,
    codex: "It is the shape a person leaves when their name has been taken off them. It knows yours. It has been told."
  },

  loomspawn: {
    id: 'loomspawn', name: 'Loomspawn',
    hp: 702, speed: 23, dmg: 20, armour: 8, radius: 14, xp: 40, mass: 4.5,
    sprite: { rig: 'demon', palette: P4, build: 0.70, tatter: 0.35, extra: ['horns'], frames: 4 },
    ai: 'split', aiParams: { splitInto: 'namewraith', splitCount: 2, splitSpread: 50 },
    onDeath: 'split',
    strungChance: 0.7,
    codex: "Off-cuts. The Loom makes more of these than it has names for, and every one of them is trying to become something."
  },

  throneguard: {
    id: 'throneguard', name: 'Throneguard',
    hp: 1842, speed: 36, dmg: 30, armour: 26, radius: 19, xp: 90, mass: 14,
    sprite: { rig: 'hulk', palette: P4, build: 1.0, tatter: 0.1, extra: ['armour', 'horns', 'chains'], frames: 4 },
    ai: 'charge', aiParams: { windup: 0.8, dashSpeed: 230, dashTime: 0.9, restTime: 1.6, range: 300, shove: 300 },
    onDeath: null,
    strungChance: 0.35, elite: true,
    codex: "It stood at the Ninth's door long enough to stop being a corpse and start being furniture. It is still faster than you are."
  },

  // ——————————————————————————————————————— Choirmasters (DESIGN §7)
  // Lane B-strings/boss owns phase logic. Everything below is parameters only:
  // `phases` gives the hp fraction each phase begins at, plus its kit.

  hollowth: {
    id: 'hollowth', name: 'Hollowth, the First Note',
    hp: 3030, speed: 17, dmg: 24, armour: 6, radius: 34, xp: 500, mass: 100,
    sprite: { rig: 'boss', palette: ['#d6cfb8', '#101216', '#ffbe5c'], build: 0.98, tatter: 0.45, extra: ['halo', 'jaw'], frames: 6 },
    ai: 'chase', boss: true, strungChance: 0,
    aiParams: {
      arena: 300, enrageAt: 120, enrageSpeed: 1.35,
      phases: [
        { at: 1.00, name: 'Intake',  move: 'chase',  speed: 17, resing: { every: 9.0, n: 6, of: 'shambler' }, tells: ['inhale'] },
        { at: 0.60, name: 'Descant', move: 'charge', speed: 26, resing: { every: 6.0, n: 10, of: 'bloated' }, shout: { every: 5.0, radius: 150, dmg: 26, knock: 260 }, tells: ['inhale', 'swell'] },
        { at: 0.25, name: 'Held Note', move: 'chase', speed: 22, resing: { every: 3.5, n: 14, of: 'crawler' }, shout: { every: 3.0, radius: 200, dmg: 34, knock: 320 }, summonChoir: 18, tells: ['swell', 'break'] }
      ]
    },
    codex: "The First Note. It was a chorister once, and the habit held: whenever its Choir falls quiet it simply sings them back onto their feet."
  },

  vellish: {
    id: 'vellish', name: 'Vellish the Weaver',
    hp: 11190, speed: 30, dmg: 30, armour: 12, radius: 30, xp: 1200, mass: 100,
    sprite: { rig: 'boss', palette: ['#a9c4b6', '#0c1d19', '#57e8d4'], build: 0.45, tatter: 0.15, extra: ['chains', 'halo'], frames: 6 },
    ai: 'orbit', boss: true, strungChance: 0,
    aiParams: {
      arena: 340, standoff: 170, hover: 1, enrageAt: 210, enrageSpeed: 1.3,
      phases: [
        { at: 1.00, name: 'Warp',   move: 'orbit',  speed: 30, restring: { every: 4.0, n: 4, radius: 260 }, weave: { every: 7.0, walls: 2, dmg: 18 }, tells: ['pull'] },
        { at: 0.65, name: 'Weft',   move: 'orbit',  speed: 38, restring: { every: 2.5, n: 8, radius: 320 }, weave: { every: 5.0, walls: 4, dmg: 24 }, spawn: { every: 8.0, n: 6, of: 'drowned' }, tells: ['pull', 'cinch'] },
        { at: 0.30, name: 'Cat’s Cradle', move: 'chase', speed: 44, restring: { every: 1.5, n: 12, radius: 400 }, weave: { every: 3.0, walls: 6, dmg: 32 }, spawn: { every: 5.0, n: 8, of: 'weeper' }, lattice: 1, tells: ['cinch', 'snap'] }
      ]
    },
    codex: "The Weaver does not fight you. It sits behind the fight and re-strings everything you have cut, patiently, as though you were a mess it had agreed to tidy."
  },

  morrow: {
    id: 'morrow', name: 'Cantor Morrow',
    hp: 38390, speed: 24, dmg: 40, armour: 20, radius: 32, xp: 3000, mass: 100,
    sprite: { rig: 'boss', palette: ['#cbb9a6', '#1c1210', '#ff6a2a'], build: 0.60, tatter: 0.05, extra: ['horns', 'halo', 'armour'], frames: 6 },
    ai: 'orbit', boss: true, strungChance: 0,
    aiParams: {
      arena: 360, standoff: 140, hover: 1, enrageAt: 240, enrageSpeed: 1.25,
      // bars: Morrow conducts in strict 4/4. `invert` bars flip the player's input.
      bpm: 96, barBeats: 4,
      phases: [
        { at: 1.00, name: 'Andante', move: 'orbit', speed: 24, conduct: { barsPerCycle: 8, invertBars: [4], sweepBars: [2, 6] }, spawn: { every: 6.0, n: 5, of: 'ashwalker' }, tells: ['baton'] },
        { at: 0.62, name: 'Allegro', move: 'orbit', speed: 34, conduct: { barsPerCycle: 6, invertBars: [3, 5], sweepBars: [1, 4] }, spawn: { every: 4.0, n: 6, of: ['emberling', 'surgeon'] }, beams: { every: 5.0, n: 3, dmg: 44 }, tells: ['baton', 'downbeat'] },
        { at: 0.25, name: 'Tutti',   move: 'chase', speed: 40, conduct: { barsPerCycle: 4, invertBars: [2, 3], sweepBars: [1, 4] }, spawn: { every: 3.0, n: 8, of: ['ashwalker', 'emberling'] }, beams: { every: 3.0, n: 5, dmg: 56 }, summonChoir: 24, tells: ['downbeat', 'coda'] }
      ]
    },
    codex: "Cantor Morrow conducts in strict time and expects the room to keep it. For four bars at a stretch, you are part of the room."
  },

  ninth: {
    id: 'ninth', name: 'The Ninth',
    hp: 400000, speed: 28, dmg: 60, armour: 30, radius: 40, xp: 9000, mass: 100,
    sprite: { rig: 'boss', palette: ['#f2ecdc', '#120e1f', '#c07dff'], build: 0.75, tatter: 0.0, extra: ['horns', 'halo', 'chains'], frames: 6 },
    ai: 'chase', boss: true, strungChance: 0,
    aiParams: {
      arena: 380, enrageAt: 300, enrageSpeed: 1.2,
      // Phase 3 has no puppets in it at all (DESIGN §7). `spawn: null` is load-bearing.
      phases: [
        { at: 1.00, name: 'The Throne', move: 'orbit', speed: 28, hover: 1, standoff: 200, spawn: { every: 4.0, n: 8, of: ['loomspawn', 'namewraith'] }, beams: { every: 4.5, n: 4, dmg: 60 }, tells: ['open'] },
        { at: 0.66, name: 'The Loom',   move: 'chase', speed: 36, spawn: { every: 2.5, n: 12, of: ['throneguard', 'namewraith'] }, restring: { every: 3.0, n: 16, radius: 420 }, lattice: 1, weave: { every: 4.0, walls: 6, dmg: 48 }, tells: ['open', 'pull'] },
        { at: 0.33, name: 'The Ninth',  move: 'chase', speed: 52, spawn: null, clearField: 1, beams: { every: 2.0, n: 6, dmg: 80 }, sweeps: { every: 3.0, arcs: 3, dmg: 70 }, ownString: 1, tells: ['coda', 'silence'] }
      ]
    },
    codex: "The Ninth has no Choir. It never needed one. There is a thread out of the top of its head as well, and it goes up, and nobody has ever followed it far enough to say where."
  }

});

export const list = Object.freeze(Object.keys(ENEMIES).map(k => ENEMIES[k]));
