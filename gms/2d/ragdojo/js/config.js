// Tunables, campaign table, shop definitions. No logic here beyond table generation.

export const SHEET_W = 1680;
export const SHEET_H = 1020;
export const GROUND_Y = 742;          // sits exactly on a ruled line
export const RULE = 46;
export const RULE_TOP = 96;
export const WALL_PAD = 96;           // fighters stop this far from the sheet edge

export const GRAVITY = 2100;
export const DT = 1 / 60;

/**
 * Two campaigns on the same 45-level frame. LIGHT is the dojo: bandanas, a scrap yard, a
 * pencil. DARK is the same sheet of paper after hours — the page inverts, the bandana
 * becomes an armband, and you are carrying a knife.
 */
export const RANK_SETS = {
  light: [
    { key: 'white',  name: 'White',  col: '#fdfdfa', edge: '#20242c', dojo: 'The Scrap Yard' },
    { key: 'yellow', name: 'Yellow', col: '#f2cd2e', edge: '#8a6a08', dojo: 'Sunspot Alley' },
    { key: 'orange', name: 'Orange', col: '#ef8a2b', edge: '#8a4708', dojo: 'Rind Row' },
    { key: 'green',  name: 'Green',  col: '#49a95a', edge: '#1c5626', dojo: 'The Grass Line' },
    { key: 'blue',   name: 'Blue',   col: '#3d7fd6', edge: '#153f75', dojo: 'Biro Heights' },
    { key: 'purple', name: 'Purple', col: '#8c50c6', edge: '#42206a', dojo: 'Bruise District' },
    { key: 'brown',  name: 'Brown',  col: '#8a5a33', edge: '#402616', dojo: 'The Cardboard Quarter' },
    { key: 'red',    name: 'Red',    col: '#d5352f', edge: '#6d120f', dojo: 'Red Pen Row' },
    { key: 'black',  name: 'Black',  col: '#23262d', edge: '#000000', dojo: "The Ink Master's Page" },
  ],
  dark: [
    { key: 'nobody',    name: 'Nobody',    col: '#9aa0ad', edge: '#20242c', dojo: 'The Gutter' },
    { key: 'runner',    name: 'Runner',    col: '#f2cd2e', edge: '#8a6a08', dojo: 'Lamplight Row' },
    { key: 'fence',     name: 'Fence',     col: '#ef8a2b', edge: '#8a4708', dojo: 'The Pawn Line' },
    { key: 'bruiser',   name: 'Bruiser',   col: '#49a95a', edge: '#1c5626', dojo: 'The Loading Bay' },
    { key: 'enforcer',  name: 'Enforcer',  col: '#3d7fd6', edge: '#153f75', dojo: 'Cold Storage' },
    { key: 'lieutenant',name: 'Lieutenant',col: '#8c50c6', edge: '#42206a', dojo: 'The Velvet Stair' },
    { key: 'capo',      name: 'Capo',      col: '#8a5a33', edge: '#402616', dojo: 'The Dockside' },
    { key: 'underboss', name: 'Underboss', col: '#d5352f', edge: '#6d120f', dojo: 'Red Ink Alley' },
    { key: 'boss',      name: 'The Boss',  col: '#23262d', edge: '#000000', dojo: 'The Last Page, After Dark' },
  ],
};
RANK_SETS.cyborg = [
  { key: 'scrap',     name: 'Scrap',       col: '#9aa0ad', edge: '#20242c', dojo: 'The Junk Heap' },
  { key: 'proto',     name: 'Prototype',   col: '#f2cd2e', edge: '#8a6a08', dojo: 'The Assembly Line' },
  { key: 'drone',     name: 'Drone',       col: '#ef8a2b', edge: '#8a4708', dojo: 'The Server Farm' },
  { key: 'sentinel',  name: 'Sentinel',    col: '#49a95a', edge: '#1c5626', dojo: 'The Cooling Tower' },
  { key: 'android',   name: 'Android',     col: '#3d7fd6', edge: '#153f75', dojo: 'Neon Undercity' },
  { key: 'synth',     name: 'Synth',       col: '#8c50c6', edge: '#42206a', dojo: 'The Clean Room' },
  { key: 'chrome',    name: 'Chrome',      col: '#8a5a33', edge: '#402616', dojo: 'The Chrome Spire' },
  { key: 'overclock', name: 'Overclock',   col: '#d5352f', edge: '#6d120f', dojo: 'The Mainframe' },
  { key: 'core',      name: 'Singularity', col: '#23262d', edge: '#000000', dojo: 'The Core' },
];
RANK_SETS.god = [
  { key: 'mortal',    name: 'Mortal',      col: '#fdfdfa', edge: '#20242c', dojo: "The Clouds' Edge" },
  { key: 'acolyte',   name: 'Acolyte',     col: '#f2cd2e', edge: '#8a6a08', dojo: 'The Pearly Gate' },
  { key: 'cherub',    name: 'Cherub',      col: '#ef8a2b', edge: '#8a4708', dojo: 'Halo Heights' },
  { key: 'angel',     name: 'Angel',       col: '#49a95a', edge: '#1c5626', dojo: 'The Choir Loft' },
  { key: 'archangel', name: 'Archangel',   col: '#3d7fd6', edge: '#153f75', dojo: 'The Golden Stair' },
  { key: 'seraph',    name: 'Seraph',      col: '#8c50c6', edge: '#42206a', dojo: 'Seventh Heaven' },
  { key: 'dominion',  name: 'Dominion',    col: '#8a5a33', edge: '#402616', dojo: 'The Firmament' },
  { key: 'throne',    name: 'Throne',      col: '#d5352f', edge: '#6d120f', dojo: 'The Throne Room' },
  { key: 'almighty',  name: 'Almighty',    col: '#23262d', edge: '#000000', dojo: 'The First Page' },
];

/**
 * Four worlds on one ladder, each a pair: its campaign (`mode`) and its replay run (`bully`),
 * which is what opens the next world. BULLY opens DARK, THUG opens CYBER, SIMULANT opens
 * DEITIES. `id` is what the save stores and never changes; `name` is only what is shown. `night` worlds invert the page,
 * which is what decides the disabled-control opacity in style.css.
 */
export const WORLDS = [
  { id: 'light',  name: 'LIGHT',   mode: 'LIGHT',  icon: '☀', bully: 'BULLY',    flag: 'everWon',      night: false },
  { id: 'dark',   name: 'DARK',    mode: 'DARK',   icon: '☾', bully: 'THUG',     flag: 'darkUnlocked', night: true },
  { id: 'cyborg', name: 'CYBER',   mode: 'CYBORG', icon: '⚙', bully: 'SIMULANT', flag: 'thugWon',      night: true },
  { id: 'god',    name: 'DEITIES', mode: 'GOD',    icon: '✦', bully: 'DEMON',    flag: 'simulantWon',  night: false },
];
export const THEMES = WORLDS.map((w) => w.id);
export const worldOf = (theme) => WORLDS.find((w) => w.id === theme) || WORLDS[0];
/** The save flag a world's replay run sets when you win it. */
export const BULLY_WIN_FLAG = { light: 'darkUnlocked', dark: 'thugWon', cyborg: 'simulantWon', god: 'demonWon' };
export const ranksFor = (theme) => RANK_SETS[theme] || RANK_SETS.light;
/** What a rank is worn as. "White bandana" in the dojo, "Runner colours" on the street. */
export const RANK_WORD = { light: 'bandana', dark: 'colours', cyborg: 'chassis', god: 'wings' };
export const RANKS = RANK_SETS.light;

export const FIGHTS_PER_RANK = 5;
export const TOTAL_LEVELS = RANKS.length * FIGHTS_PER_RANK;   // 45

const GRUNT_SETS = {
  light: [
    ['Blank', 'Doodle', 'Smudge', 'Crease', 'Nib'],
    ['Yolk', 'Highlighter', 'Buttercup', 'Wasp', 'Post-It'],
    ['Rind', 'Satsuma', 'Cone', 'Marigold', 'Ember'],
    ['Moss', 'Sprout', 'Bogey', 'Lichen', 'Fern'],
    ['Biro', 'Denim', 'Cobalt', 'Ballpoint', 'Bruise'],
    ['Plum', 'Beetroot', 'Violet', 'Aubergine', 'Iris'],
    ['Kraft', 'Cardboard', 'Parcel', 'Twine', 'Sepia'],
    ['Marker', 'Correction', 'Crimson', 'Scarlet', 'Vermilion'],
    ['Shade', 'Blot', 'Charcoal', 'Soot', 'Midnight'],
  ],
  dark: [
    ['Rat', 'Tack', 'Nine Toes', 'Weasel', 'Chalky'],
    ['Sprint', 'Whistle', 'Pockets', 'Lamppost', 'Yellowjack'],
    ['Tickets', 'Snide', 'Cousin Ray', 'Hock', 'Bent Penny'],
    ['Crowbar', 'Pallet', 'Big Moss', 'Hinge', 'Forklift'],
    ['Icepick', 'Freezer', 'Cold Denim', 'Blue Tony', 'Meathook'],
    ['Velvet', 'Bishop', 'Plum Suit', 'The Usher', 'Iris'],
    ['Tarpaulin', 'Crate', 'Salt', 'Rope', 'Barge'],
    ['Red Nails', 'Ledger', 'Scarlet', 'The Auditor', 'Vermin'],
    ['Soot', 'Blot', 'Hush', 'The Quiet One', 'Midnight'],
  ],
  cyborg: [
    ['Rustbucket', 'Sprocket', 'Tin Can', 'Washer', 'Loose Bolt'],
    ['Beta', 'Patch', 'Firmware', 'Test Unit', 'Prongs'],
    ['Buzz', 'Rotor', 'Quadcopter', 'Hover', 'Ping'],
    ['Watchdog', 'Lockout', 'Firewall', 'Turret', 'Tripwire'],
    ['Neon', 'Glitch', 'Hex', 'Pixel', 'Cache'],
    ['Silica', 'Lab Coat', 'Sterile', 'Clone Six', 'Iris Scan'],
    ['Polish', 'Mirror', 'Gleam', 'Alloy', 'Plating'],
    ['Redline', 'Heatsink', 'Turbo', 'Throttle', 'Meltdown'],
    ['Null', 'Void', 'Zero Day', 'Root', 'Kernel'],
  ],
  god: [
    ['Pilgrim', 'Shepherd', 'Monk', 'Nun', 'Choirboy'],
    ['Candle', 'Censer', 'Psalm', 'Vesper', 'Matins'],
    ['Pudge', 'Dimples', 'Harp', 'Cupid', 'Rosy'],
    ['Gabriel Jr', 'Feather', 'Trumpet', 'Lyre', 'Hymn'],
    ['Lightning', 'Thunder', 'Halo', 'Glory', 'Valour'],
    ['Six Wings', 'Blaze', 'Ember', 'Incense', 'Ardent'],
    ['Sceptre', 'Orb', 'Crown', 'Mantle', 'Edict'],
    ['Wheel', 'Many Eyes', 'Ophan', 'Spiral', 'Gyre'],
    ['Alpha', 'Omega', 'Genesis', 'Revelation', 'Amen'],
  ],
};

const CHAMPION_SETS = {
  light: [
    'CHALK', 'OLD YOLK', 'PIP THE PEELER', 'MOSSFOOT', 'BIRO BLUE',
    'BARON BRUISE', 'OLD KRAFT', 'RED PEN RITA', 'THE INK MASTER',
  ],
  dark: [
    'SPLIT LIP', 'OLD MERCY', 'THE FENCE', 'CRATE', 'MISTER COLD',
    'SILK', 'DOCKS DELANEY', 'RED HANDS', 'THE PENMAN',
  ],
  cyborg: [
    'SCRAPHEAP', 'UNIT ZERO', 'THE SWARM', 'WARDEN-9', 'NEON NINA',
    'DR. STERILE', 'CHROMEJAW', 'OVERCLOCK', 'THE SINGULARITY',
  ],
  god: [
    'BROTHER BASIL', 'SAINT WICK', 'CHERUB CHUCK', 'GABRIELLA', 'MICHAEL THE LOUD',
    'SERAPHINA', 'THE DOMINION', 'THE WHEEL', 'THE AUTHOR',
  ],
};

/** Player promotion levels — deliberately drifts above and below the enemy rank. */
const PROMOTE_AT = [0, 6, 12, 14, 19, 24, 32, 35, 41];

export function playerRankAt(level) {
  let r = 0;
  for (let i = 0; i < PROMOTE_AT.length; i++) if (level >= PROMOTE_AT[i]) r = i;
  return r;
}

export const EVENTS = {
  pencil:  { name: 'THE PENCIL',    desc: 'A giant pencil stabs the page. Do not be under it.' },
  eraser:  { name: 'THE ERASER',    desc: 'A giant eraser sweeps the page. Jump it.' },
  coffee:  { name: 'COFFEE SPILL',  desc: 'A stain spreads. Standing in it hurts.' },
  wind:    { name: 'DRAUGHT',       desc: 'The page lifts. Everything slides.' },
  tear:    { name: 'THE TEAR',      desc: 'The paper rips open. Mind the gap.' },
  rain:    { name: 'ERASER RAIN',   desc: 'Crumbs fall from above.' },
  scribble:{ name: 'SCRIBBLE STORM',desc: 'The artist loses patience.' },
};

const EVENT_AT = {
  7: 'wind', 11: 'coffee', 13: 'eraser', 17: 'pencil', 18: 'rain',
  21: 'tear', 23: 'coffee', 26: 'pencil', 27: 'wind', 31: 'eraser',
  32: 'tear', 33: 'rain', 36: 'scribble', 37: 'pencil', 38: 'coffee',
  40: 'tear', 41: 'eraser', 42: 'scribble', 43: 'rain', 44: 'scribble',
};

function enemyStats(tier, kind, i) {
  const base = 46 + tier * 17;
  const champ = kind === 'champion';
  const final = kind === 'final';
  return {
    hp: Math.round(base * (champ ? 1.74 : final ? 2.3 : 1) * (1 + i * 0.04)),
    dmg: (4.4 + tier * 1.5) * (champ ? 1.26 : final ? 1.5 : 1),
    speed: 128 + tier * 12 + (champ ? 22 : 0) + (final ? 40 : 0),
    skill: Math.min(0.84, 0.22 + tier * 0.075 + (champ ? 0.10 : 0) + (final ? 0.10 : 0)),
    scale: champ ? 1.14 : final ? 1.3 : 1 + tier * 0.008,
    mass: champ ? 1.35 : final ? 1.7 : 1,
    moves: Math.min(6, 1 + Math.floor(tier * 0.75) + (champ || final ? 1 : 0)),
  };
}

/** From CYBER on, every enemy has double the health and hits twice as hard (specials too). */
const WORLD_TOUGHNESS = { cyborg: 2, god: 2 };

function buildLevels(theme) {
  const tough = WORLD_TOUGHNESS[theme] || 1;
  const RANKS = ranksFor(theme);
  const GRUNT_NAMES = GRUNT_SETS[theme];
  const CHAMPIONS = CHAMPION_SETS[theme];
  const out = [];
  for (let t = 0; t < RANKS.length; t++) {
    for (let f = 0; f < FIGHTS_PER_RANK; f++) {
      const idx = t * FIGHTS_PER_RANK + f;
      const last = t === RANKS.length - 1 && f === FIGHTS_PER_RANK - 1;
      const kind = last ? 'final' : f === FIGHTS_PER_RANK - 1 ? 'champion' : f === 3 ? 'gauntlet' : 'fight';
      const enemies = [];
      if (kind === 'champion' || kind === 'final') {
        enemies.push({ ...enemyStats(t, kind, f), name: CHAMPIONS[t], tier: t, boss: true });
      } else if (kind === 'gauntlet') {
        const n = t < 2 ? 2 : t < 6 ? 3 : 3;
        for (let e = 0; e < n; e++) {
          const s = enemyStats(t, kind, f);
          s.hp = Math.round(s.hp * 0.52);
          enemies.push({ ...s, name: GRUNT_NAMES[t][(f + e) % 5], tier: t });
        }
      } else {
        const n = t >= 3 && f === 2 ? 2 : 1;
        for (let e = 0; e < n; e++) {
          const s = enemyStats(t, kind, f);
          if (n > 1) s.hp = Math.round(s.hp * 0.75);
          enemies.push({ ...s, name: GRUNT_NAMES[t][(f + e) % 5], tier: t });
        }
      }
      for (const e of enemies) { e.hp = Math.round(e.hp * tough); e.dmg *= tough; }
      out.push({
        idx, tier: t, kind, enemies,
        event: EVENT_AT[idx] || null,
        dojo: RANKS[t].dojo,
        title: kind === 'final' ? 'THE FINAL PAGE'
          : kind === 'champion' ? `${RANKS[t].name} CHAMPION`
          : `${RANKS[t].name} ${f + 1} / ${FIGHTS_PER_RANK}`,
        reward: Math.round(28 + t * 21 + (kind === 'champion' ? 120 : 0) + (kind === 'final' ? 400 : 0)
          + (kind === 'gauntlet' ? 24 : 0)),
      });
    }
  }
  return out;
}

export const LEVEL_SETS = Object.fromEntries(THEMES.map((t) => [t, buildLevels(t)]));
export const levelsFor = (theme) => LEVEL_SETS[theme] || LEVEL_SETS.light;
export const LEVELS = LEVEL_SETS.light;

// ── Gestures ───────────────────────────────────────────────────────────────
// id must match the classifier in gestures.js
/**
 * Both sets fill the same eight gesture slots at the same eight prices, so the muscle memory
 * carries across — what changes is what you are holding. `kind` is the mechanic (that is
 * what fighter.js switches on); `id` is what the save records, so the two sets are bought
 * and upgraded entirely separately.
 */
export const MOVE_SETS = {
  light: [
    {
      id: 'power', kind: 'power', name: 'POWER HIT', gesture: 'slash', glyph: '/',
      hint: 'Draw a slash, low to high',
      desc: 'A committed overhand strike. Sends them tumbling.',
      owned: true, cost: 0, tier: 0,
      dmg: 15, dmgStep: 6.5, cd: 2.6, cdStep: 0.26, kb: 620,
    },
    {
      id: 'toss', kind: 'toss', name: 'RUBBER TOSS', gesture: 'archUp', glyph: '∩',
      hint: 'Draw the top half of an O',
      desc: 'Lob a rubber band. Arcs, bounces, stuns on contact.',
      cost: 140, tier: 0,
      dmg: 11, dmgStep: 5, cd: 3.2, cdStep: 0.3, kb: 300,
    },
    {
      id: 'rise', kind: 'rise', name: 'RISING PALM', gesture: 'up', glyph: '↑',
      hint: 'Draw a line straight up',
      desc: 'Launcher. Pops them into the air for a juggle.',
      cost: 260, tier: 1,
      dmg: 13, dmgStep: 5.5, cd: 3.6, cdStep: 0.34, kb: 480,
    },
    {
      id: 'dash', kind: 'dash', name: 'PENCIL DASH', gesture: 'right', glyph: '→',
      hint: 'Draw a line straight forward',
      desc: 'Shoulder-charge forward and smash into them, leaving a graphite smear.',
      cost: 380, tier: 2,
      dmg: 14, dmgStep: 6, cd: 4.0, cdStep: 0.4, kb: 540,
    },
    {
      id: 'flipF', kind: 'flipF', name: 'FLIP KICK', gesture: 'circleCW', glyph: '↻',
      hint: 'Draw a circle clockwise',
      desc: 'Somersault forward heel-first. Big arc, big knockback.',
      cost: 520, tier: 3,
      dmg: 19, dmgStep: 7.5, cd: 5.0, cdStep: 0.46, kb: 760,
    },
    {
      id: 'slam', kind: 'slam', name: 'INK SLAM', gesture: 'down', glyph: '↓',
      hint: 'Draw a line straight down',
      desc: 'Drive a fist into the page. Shockwave knocks over everything nearby.',
      cost: 660, tier: 4,
      dmg: 22, dmgStep: 8, cd: 5.6, cdStep: 0.5, kb: 700,
    },
    {
      id: 'flipB', kind: 'flipB', name: 'REVERSE FLIP', gesture: 'circleCCW', glyph: '↺',
      hint: 'Draw a circle anticlockwise',
      desc: 'Backflip out of trouble, kicking on the way up. Your escape button.',
      cost: 800, tier: 5,
      dmg: 16, dmgStep: 6.5, cd: 4.4, cdStep: 0.42, kb: 620,
    },
    {
      id: 'bomb', kind: 'bomb', name: 'ERASER BOMB', gesture: 'vee', glyph: 'V',
      hint: 'Draw a V',
      desc: 'Lob an eraser. It goes off like a bag of flour and rubs out everything close.',
      cost: 1100, tier: 6,
      dmg: 30, dmgStep: 11, cd: 7.5, cdStep: 0.7, kb: 900,
    },
  ],
  dark: [
    {
      id: 'd_shank', kind: 'power', name: 'SHANK', gesture: 'slash', glyph: '/',
      hint: 'Draw a slash, low to high',
      desc: 'A committed slash, low to high. Opens them up and puts them on the floor.',
      owned: true, cost: 0, tier: 0,
      dmg: 15, dmgStep: 6.5, cd: 2.6, cdStep: 0.26, kb: 620,
    },
    {
      id: 'd_bottle', kind: 'toss', name: 'BOTTLE', gesture: 'archUp', glyph: '∩',
      hint: 'Draw the top half of an O',
      desc: 'Lob a bottle. Arcs, bounces, and leaves them seeing stars.',
      cost: 140, tier: 0,
      dmg: 11, dmgStep: 5, cd: 3.2, cdStep: 0.3, kb: 300,
    },
    {
      id: 'd_hook', kind: 'rise', name: 'GUT HOOK', gesture: 'up', glyph: '↑',
      hint: 'Draw a line straight up',
      desc: 'Blade up under the ribs. Lifts them clean off the page.',
      cost: 260, tier: 1,
      dmg: 13, dmgStep: 5.5, cd: 3.6, cdStep: 0.34, kb: 480,
    },
    {
      id: 'd_knife', kind: 'knives', name: 'THROWN KNIVES', gesture: 'right', glyph: '→',
      hint: 'Draw a line straight forward',
      desc: 'Two knives, flat and fast. You are always carrying more.',
      cost: 380, tier: 2,
      dmg: 14, dmgStep: 6, cd: 4.0, cdStep: 0.4, kb: 540,
    },
    {
      id: 'd_boots', kind: 'flipF', name: 'BOOT PARTY', gesture: 'circleCW', glyph: '↻',
      hint: 'Draw a circle clockwise',
      desc: 'Spin into them boots-first. Everyone in the way goes over.',
      cost: 520, tier: 3,
      dmg: 19, dmgStep: 7.5, cd: 5.0, cdStep: 0.46, kb: 760,
    },
    {
      id: 'd_molotov', kind: 'slam', name: 'MOLOTOV', gesture: 'down', glyph: '↓',
      hint: 'Draw a line straight down',
      desc: 'Smash a burning bottle at your feet. The whole floor goes up.',
      cost: 660, tier: 4,
      dmg: 22, dmgStep: 8, cd: 5.6, cdStep: 0.5, kb: 700,
    },
    {
      id: 'd_smoke', kind: 'flipB', name: 'SMOKE AND RUN', gesture: 'circleCCW', glyph: '↺',
      hint: 'Draw a circle anticlockwise',
      desc: 'Drop smoke and go backwards over it, boots first. Your way out.',
      cost: 800, tier: 5,
      dmg: 16, dmgStep: 6.5, cd: 4.4, cdStep: 0.42, kb: 620,
    },
    {
      id: 'd_sawn', kind: 'gun', name: 'SAWN-OFF', gesture: 'vee', glyph: 'V',
      hint: 'Draw a V',
      desc: 'One barrel, flat and level, straight down the street. Nothing about it is subtle.',
      cost: 1100, tier: 6,
      dmg: 30, dmgStep: 11, cd: 7.5, cdStep: 0.7, kb: 900,
    },
  ],
  cyborg: [
    {
      id: 'c_piston', kind: 'power', name: 'PISTON PUNCH', gesture: 'slash', glyph: '/',
      hint: 'Draw a slash, low to high',
      desc: 'A hydraulic arm, fully extended. The hiss is the last thing they hear.',
      owned: true, cost: 0, tier: 0,
      dmg: 15, dmgStep: 6.5, cd: 2.6, cdStep: 0.26, kb: 620,
    },
    {
      id: 'c_emp', kind: 'toss', name: 'EMP GRENADE', gesture: 'archUp', glyph: '∩',
      hint: 'Draw the top half of an O',
      desc: 'Lob a pulse charge. Arcs, bounces, scrambles them on contact.',
      cost: 140, tier: 0,
      dmg: 11, dmgStep: 5, cd: 3.2, cdStep: 0.3, kb: 300,
    },
    {
      id: 'c_rocket', kind: 'rise', name: 'ROCKET UPPERCUT', gesture: 'up', glyph: '↑',
      hint: 'Draw a line straight up',
      desc: 'A thruster in the elbow. Lifts them clean off the page.',
      cost: 260, tier: 1,
      dmg: 13, dmgStep: 5.5, cd: 3.6, cdStep: 0.34, kb: 480,
    },
    {
      id: 'c_laser', kind: 'knives', name: 'TWIN LASERS', gesture: 'right', glyph: '→',
      hint: 'Draw a line straight forward',
      desc: 'Two bolts from the eyes, flat and fast. Recharges on its own.',
      cost: 380, tier: 2,
      dmg: 14, dmgStep: 6, cd: 4.0, cdStep: 0.4, kb: 540,
    },
    {
      id: 'c_gyro', kind: 'flipF', name: 'GYRO KICK', gesture: 'circleCW', glyph: '↻',
      hint: 'Draw a circle clockwise',
      desc: 'Spin up the hip servos and somersault through them heel-first.',
      cost: 520, tier: 3,
      dmg: 19, dmgStep: 7.5, cd: 5.0, cdStep: 0.46, kb: 760,
    },
    {
      id: 'c_quake', kind: 'slam', name: 'SEISMIC SLAM', gesture: 'down', glyph: '↓',
      hint: 'Draw a line straight down',
      desc: 'Hammer the page with a steel fist. From the air you drop straight onto them.',
      cost: 660, tier: 4,
      dmg: 22, dmgStep: 8, cd: 5.6, cdStep: 0.5, kb: 700,
    },
    {
      id: 'c_thrust', kind: 'flipB', name: 'REVERSE THRUST', gesture: 'circleCCW', glyph: '↺',
      hint: 'Draw a circle anticlockwise',
      desc: 'Fire the back jets and flip away, kicking on the way up. Your way out.',
      cost: 800, tier: 5,
      dmg: 16, dmgStep: 6.5, cd: 4.4, cdStep: 0.42, kb: 620,
    },
    {
      id: 'c_rail', kind: 'gun', name: 'RAILGUN', gesture: 'vee', glyph: 'V',
      hint: 'Draw a V',
      desc: 'One magnetic slug, the length of the page. Charges the air on its way.',
      cost: 1100, tier: 6,
      dmg: 30, dmgStep: 11, cd: 7.5, cdStep: 0.7, kb: 900,
    },
  ],
  god: [
    {
      id: 'g_hammer', kind: 'power', name: 'DIVINE HAMMER', gesture: 'slash', glyph: '/',
      hint: 'Draw a slash, low to high',
      desc: 'An overhand blow with the weight of heaven behind it.',
      owned: true, cost: 0, tier: 0,
      dmg: 15, dmgStep: 6.5, cd: 2.6, cdStep: 0.26, kb: 620,
    },
    {
      id: 'g_halo', kind: 'toss', name: 'HALO TOSS', gesture: 'archUp', glyph: '∩',
      hint: 'Draw the top half of an O',
      desc: 'Throw your halo. It arcs, bounces, and leaves them dazzled.',
      cost: 140, tier: 0,
      dmg: 11, dmgStep: 5, cd: 3.2, cdStep: 0.3, kb: 300,
    },
    {
      id: 'g_ascend', kind: 'rise', name: 'ASCENSION', gesture: 'up', glyph: '↑',
      hint: 'Draw a line straight up',
      desc: 'Lift them towards the light. They do not stay up there.',
      cost: 260, tier: 1,
      dmg: 13, dmgStep: 5.5, cd: 3.6, cdStep: 0.34, kb: 480,
    },
    {
      id: 'g_bolts', kind: 'knives', name: 'LIGHTNING BOLTS', gesture: 'right', glyph: '→',
      hint: 'Draw a line straight forward',
      desc: 'Two bolts thrown flat across the page. There are always more where those came from.',
      cost: 380, tier: 2,
      dmg: 14, dmgStep: 6, cd: 4.0, cdStep: 0.4, kb: 540,
    },
    {
      id: 'g_wheel', kind: 'flipF', name: 'FIRE WHEEL', gesture: 'circleCW', glyph: '↻',
      hint: 'Draw a circle clockwise',
      desc: 'Roll forward as a wheel of fire. Everyone in the way goes over.',
      cost: 520, tier: 3,
      dmg: 19, dmgStep: 7.5, cd: 5.0, cdStep: 0.46, kb: 760,
    },
    {
      id: 'g_judge', kind: 'slam', name: 'JUDGEMENT', gesture: 'down', glyph: '↓',
      hint: 'Draw a line straight down',
      desc: 'Strike the earth and everyone near it is judged. From the air you come down on them.',
      cost: 660, tier: 4,
      dmg: 22, dmgStep: 8, cd: 5.6, cdStep: 0.5, kb: 700,
    },
    {
      id: 'g_wings', kind: 'flipB', name: 'WINGBEAT', gesture: 'circleCCW', glyph: '↺',
      hint: 'Draw a circle anticlockwise',
      desc: 'One beat of the wings carries you backwards over trouble, heels first.',
      cost: 800, tier: 5,
      dmg: 16, dmgStep: 6.5, cd: 4.4, cdStep: 0.42, kb: 620,
    },
    {
      id: 'g_wrath', kind: 'gun', name: 'WRATH', gesture: 'vee', glyph: 'V',
      hint: 'Draw a V',
      desc: 'A beam straight down the page. Nothing about it is forgiving.',
      cost: 1100, tier: 6,
      dmg: 30, dmgStep: 11, cd: 7.5, cdStep: 0.7, kb: 900,
    },
  ],
};
export const movesFor = (theme) => MOVE_SETS[theme] || MOVE_SETS.light;
/**
 * Which set you are actually holding. Normally the theme's own, but a THUG who has won a
 * thug run can carry the dark moves back into the light world — that is what `carryDark` is.
 */
export const activeMoves = (save) => {
  if (!save) return MOVE_SETS.light;
  if (save.theme === 'light' || !MOVE_SETS[save.theme]) return save.carryDark ? MOVE_SETS.dark : MOVE_SETS.light;
  return MOVE_SETS[save.theme];
};
export const MOVES = MOVE_SETS.light;
const ALL_MOVES = Object.values(MOVE_SETS).flat();

/** The standard tap attack, renamed per theme. Same three-hit chain either way. */
export const STRIKE_WORD = { light: 'PUNCH', dark: 'STAB', cyborg: 'ZAP', god: 'SMITE' };

export const MOVE_MAX_LV = 7;
/** The worlds past DARK each add one more level to every track that still has room to grow. */
export const WORLD_BONUS_FLAGS = ['thugWon', 'simulantWon'];
const worldBonus = (save) => WORLD_BONUS_FLAGS.filter((f) => save && save[f]).length;

/**
 * The last two levels of anything are a long-haul goal rather than a purchase: they cost
 * four and eight times the old top price, so finishing a track is something you grind
 * towards over a whole campaign (or several) instead of something you tick off.
 */
export const DEEP_LEVELS = 2;
// 1x up to the soft cap, then 4x, 8x, and doubling for every dark level beyond that.
const deepMul = (lv, max) => {
  const soft = max - DEEP_LEVELS;
  return lv < soft ? 1 : Math.pow(2, 2 + (lv - soft));
};
const curveLv = (lv, max) => Math.min(lv, max - DEEP_LEVELS - 1);

/** Floor on any special's cooldown — a level that would only push past it buys nothing. */
export const MIN_CD = 0.7;
/**
 * Levels available on one move's power or cooldown track. `premium` false means no world
 * past LIGHT is open to this player, so nothing past the base cap is either.
 */
export function moveMaxLv(save, m, track, premium = true) {
  const max = MOVE_MAX_LV + (premium ? worldBonus(save) : 0);
  if (track !== 'cd' || !m) return max;
  return Math.min(max, Math.ceil((m.cd - MIN_CD) / m.cdStep - 1e-9));
}

/** Upgrade cost curves. Specials get separate power and cooldown tracks. */
export const moveBuyCost = (m) => m.cost;
export const movePowerCost = (m, lv) =>
  Math.round((m.cost * 0.5 + 70) * Math.pow(1.62, curveLv(lv, MOVE_MAX_LV)) * deepMul(lv, MOVE_MAX_LV));
export const moveCdCost = (m, lv) =>
  Math.round((m.cost * 0.42 + 60) * Math.pow(1.58, curveLv(lv, MOVE_MAX_LV)) * deepMul(lv, MOVE_MAX_LV));

export const PERKS = [
  { id: 'hp',    name: 'PAPER THICKNESS', max: 10, base: 90,  growth: 1.52,
    desc: 'More HP. +14 max health per level.', fmt: (l) => `+${l * 14} HP` },
  { id: 'atk',   name: 'HEAVIER HAND',    max: 10, base: 110, growth: 1.55,
    desc: 'Standard hits land harder. +11% damage per level.', fmt: (l) => `+${l * 11}% hit` },
  { id: 'spd',   name: 'QUICK FEET',      max: 7, base: 130, growth: 1.6,
    desc: 'Move faster. +8% speed per level.', fmt: (l) => `+${l * 8}% speed` },
  { id: 'jump',  name: 'SPRING LOADED',   max: 6, base: 150, growth: 1.62,
    desc: 'Jump higher, fall a little slower.', fmt: (l) => `+${l * 9}% jump` },
  { id: 'armor', name: 'INK SKIN',        max: 8, base: 170, growth: 1.6,
    desc: 'Take less damage and get thrown around less.', fmt: (l) => `-${l * 6}% taken` },
  { id: 'crit',  name: 'SHARP POINT',     max: 7, base: 200, growth: 1.66,
    desc: 'Chance to land a double-damage hit.', fmt: (l) => `${l * 6}% crit` },
  { id: 'combo', name: 'MOMENTUM',        max: 6, base: 230, growth: 1.7,
    desc: 'Each hit in a combo adds more damage than the last.', fmt: (l) => `+${l * 8}% combo` },
  { id: 'stiff', name: 'STIFF JOINTS',    max: 6, base: 210, growth: 1.64,
    desc: 'Recover from a knockdown faster. Stagger less.', fmt: (l) => `-${l * 14}% down time` },
  { id: 'drain', name: 'INK DRAIN',       max: 5, base: 320, growth: 1.8,
    desc: 'Heal for a slice of the damage you deal.', fmt: (l) => `${l * 4}% lifesteal` },
  { id: 'wind',  name: 'SECOND WIND',     max: 6, base: 190, growth: 1.6,
    desc: 'Start each fight with bonus health that regenerates between rounds.',
    fmt: (l) => `+${l * 8}% heal` },
  // Compounding, so every level is worth the same 12% of whatever the last one paid.
  { id: 'ink',   name: 'INK WELL',        max: 5, base: 260, growth: 1.7, needs: 'everWon',
    needsText: 'finish the dojo to unlock',
    desc: 'Every fight pays out more ink. Each level multiplies it by another 12%.',
    fmt: (l) => `×${inkMul(l).toFixed(2)} ink` },
];
export const inkMul = (lv) => Math.pow(1.12, lv || 0);

/**
 * Opening DARK adds five further levels to every skill, each one doubling the multiplier
 * again (16x, 32x, 64x, 128x, 256x the old top price), and each world after it one more.
 * They are yours in every world once earned, not only while you stand in the dark.
 *
 * `cap` is where a skill stops doing anything: STIFF JOINTS and INK SKIN run into the floors
 * in derive(), so levels past that would be ink for nothing.
 */
export const DARK_PERK_LEVELS = 5;
const PERK_CAP = { stiff: 6, armor: 12 };
export function perkMax(p, save, premium = true) {
  // Old callers passed a theme string; keep that meaning (dark = the five extra levels).
  if (typeof save === 'string') save = { darkUnlocked: save === 'dark' };
  const extra = premium && save && save.darkUnlocked ? DARK_PERK_LEVELS + worldBonus(save) : 0;
  return Math.min(PERK_CAP[p.id] ?? Infinity, p.max + extra);
}
export const perkLocked = (p, save) => !!(p.needs && !(save && save[p.needs]));
export const perkCost = (p, lv) =>
  Math.round(p.base * Math.pow(p.growth, curveLv(lv, p.max)) * deepMul(lv, p.max));

/** Everything the player's numbers are derived from, in one place. */
export function derive(save) {
  const p = save.perks || {};
  const L = (id) => p[id] || 0;
  return {
    maxHp: 100 + L('hp') * 14,
    atkMul: 1 + L('atk') * 0.11,
    speed: 200 * (1 + L('spd') * 0.08),
    jump: 640 * (1 + L('jump') * 0.09),
    // The deep levels push these further than the original tracks ever did — floor them so
    // a fully maxed player is tough, not invulnerable, and never negative.
    dr: Math.max(0.32, 1 - L('armor') * 0.06),
    kbResist: Math.max(0.4, 1 - L('armor') * 0.05),
    crit: L('crit') * 0.06,
    combo: L('combo') * 0.08,
    getUp: Math.max(0.22, 1 - L('stiff') * 0.14),
    drain: L('drain') * 0.04,
    heal: L('wind') * 0.08,
    inkMul: inkMul(L('ink')),
  };
}

export function moveStats(save, id) {
  const m = ALL_MOVES.find((x) => x.id === id);
  if (!m) return null;
  const s = (save.moves || {})[id];
  if (!s || !s.owned) return null;
  const d = derive(save);
  return {
    ...m,
    power: s.power || 0, cdLv: s.cd || 0,
    damage: (m.dmg + (s.power || 0) * m.dmgStep) * d.atkMul,
    cooldown: Math.max(MIN_CD, m.cd - (s.cd || 0) * m.cdStep),
    knockback: m.kb * (1 + (s.power || 0) * 0.11),
  };
}
