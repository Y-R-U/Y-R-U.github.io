/**
 * Materials and damage types.
 *
 * Both are small integers so resistance lookups are a flat Float32Array index
 * rather than a string hash in the damage path, which runs thousands of times
 * a second once acid is eating a wall.
 */

export const MATERIAL = {
  MASONRY: 0,
  ROCK: 1,
  TIMBER: 2,
  FOLIAGE: 3,
  GLASS: 4,
  METAL: 5,
  BONE: 6,
  EARTH: 7,   // additive: terrain soil / grass. ARCHITECTURE §6 lists the seven above.
  FLESH: 8,   // additive: creatures, so damage() has one code path
};

export const MATERIAL_NAMES = ['MASONRY', 'ROCK', 'TIMBER', 'FOLIAGE', 'GLASS', 'METAL', 'BONE', 'EARTH', 'FLESH'];
export const MATERIAL_COUNT = 9;

export const DAMAGE = {
  IMPACT: 0,
  FIRE: 1,
  ACID: 2,
  LIGHTNING: 3,
  VOID: 4,
  DECAY: 5,
  LIFE: 6,
};
export const DAMAGE_NAMES = ['impact', 'fire', 'acid', 'lightning', 'void', 'decay', 'life'];
export const DAMAGE_COUNT = 7;

const BY_NAME = new Map();
for (let i = 0; i < DAMAGE_NAMES.length; i++) BY_NAME.set(DAMAGE_NAMES[i], i);
BY_NAME.set('physical', DAMAGE.IMPACT);
BY_NAME.set('storm', DAMAGE.LIGHTNING);
BY_NAME.set('heal', DAMAGE.LIFE);

/** Accept either the constant or the lowercase string, so callers stay readable. */
export function dmgType(t) {
  if (typeof t === 'number') return t;
  const v = BY_NAME.get(t);
  return v === undefined ? DAMAGE.IMPACT : v;
}

export function matByName(n) {
  const i = MATERIAL_NAMES.indexOf(String(n).toUpperCase());
  return i < 0 ? MATERIAL.ROCK : i;
}

/* resist rows, in DAMAGE order: impact fire acid lightning void decay life */
const R_ = (a, b, c, d, e, f) => Float32Array.of(a, b, c, d, e, f, 0);

function def(o) {
  return {
    density: 1, minDamage: 0, flammable: 0, soluble: 0, conducts: 0,
    debrisShape: 'lump', bounce: 0.18, spin: 6, dustScale: 1, sparks: 0, glow: 0,
    hardness: 1, chunk: 1,
    ...o,
  };
}

/** Indexed by MATERIAL. Colours are authored the way they should LOOK (the renderer squares them). */
export const MAT = [
  def({ // MASONRY
    id: MATERIAL.MASONRY, name: 'MASONRY', density: 2.2, hardness: 1.1, minDamage: 5,
    resist: R_(1.00, 0.15, 2.20, 0.50, 1.20, 0.60),
    soluble: 1.0, debrisShape: 'slab', bounce: 0.12, spin: 3.2, dustScale: 1.5, chunk: 1.2,
    dust: [0.72, 0.68, 0.62], chip: [0.86, 0.80, 0.70], body: [0.40, 0.375, 0.34],
    sfx: { crack: 'stone_crack', break: 'stone_break', debris: 'stone_debris', burn: null },
  }),
  def({ // ROCK
    id: MATERIAL.ROCK, name: 'ROCK', density: 2.7, hardness: 1.4, minDamage: 8,
    resist: R_(0.80, 0.10, 1.40, 0.60, 1.20, 0.30),
    soluble: 0.35, debrisShape: 'shard', bounce: 0.16, spin: 5, dustScale: 1.8, chunk: 1.3,
    dust: [0.60, 0.58, 0.56], chip: [0.72, 0.70, 0.66], body: [0.32, 0.32, 0.34],
    sfx: { crack: 'rock_crack', break: 'rock_break', debris: 'rock_debris', burn: null },
  }),
  def({ // TIMBER
    id: MATERIAL.TIMBER, name: 'TIMBER', density: 0.75, hardness: 0.8, minDamage: 0,
    resist: R_(1.10, 2.50, 1.80, 1.20, 1.00, 1.60),
    flammable: 1.0, soluble: 0.8, debrisShape: 'splinter', bounce: 0.24, spin: 9, dustScale: 0.7,
    dust: [0.48, 0.38, 0.26], chip: [0.70, 0.52, 0.30], body: [0.36, 0.27, 0.17],
    sfx: { crack: 'wood_crack', break: 'wood_break', debris: 'wood_debris', burn: 'wood_burn' },
  }),
  def({ // FOLIAGE
    id: MATERIAL.FOLIAGE, name: 'FOLIAGE', density: 0.3, hardness: 0.4, minDamage: 0,
    resist: R_(1.30, 3.50, 2.00, 1.40, 0.90, 2.20),
    flammable: 1.7, soluble: 0.5, debrisShape: 'clump', bounce: 0.05, spin: 4, dustScale: 0.4,
    dust: [0.30, 0.42, 0.24], chip: [0.42, 0.62, 0.30], body: [0.19, 0.31, 0.18],
    sfx: { crack: 'leaf_rustle', break: 'leaf_burst', debris: 'leaf_fall', burn: 'leaf_burn' },
  }),
  def({ // GLASS
    id: MATERIAL.GLASS, name: 'GLASS', density: 1.4, hardness: 0.5, minDamage: 0,
    resist: R_(3.00, 0.60, 0.80, 2.50, 1.00, 0.20),
    conducts: 0.2, debrisShape: 'sliver', bounce: 0.42, spin: 16, dustScale: 0.35, sparks: 1, glow: 0.5,
    dust: [0.72, 0.86, 0.95], chip: [0.90, 0.97, 1.00], body: [0.48, 0.64, 0.74],
    sfx: { crack: 'glass_crack', break: 'glass_break', debris: 'glass_tinkle', burn: null },
  }),
  def({ // METAL
    id: MATERIAL.METAL, name: 'METAL', density: 4.5, hardness: 2.2, minDamage: 26,
    resist: R_(0.45, 0.25, 1.60, 2.00, 1.10, 0.80),
    conducts: 1.0, soluble: 0.6, debrisShape: 'slab', bounce: 0.3, spin: 7, dustScale: 0.3, sparks: 1.6,
    dust: [0.45, 0.44, 0.46], chip: [1.00, 0.82, 0.45], body: [0.29, 0.31, 0.36],
    sfx: { crack: 'metal_dent', break: 'metal_break', debris: 'metal_clang', burn: null },
  }),
  def({ // BONE
    id: MATERIAL.BONE, name: 'BONE', density: 1.1, hardness: 0.6, minDamage: 0,
    resist: R_(1.40, 0.80, 1.20, 0.70, 1.60, 0.40),
    flammable: 0.15, soluble: 0.6, debrisShape: 'shard', bounce: 0.35, spin: 12, dustScale: 0.6,
    dust: [0.78, 0.74, 0.64], chip: [0.92, 0.90, 0.80], body: [0.58, 0.56, 0.49],
    sfx: { crack: 'bone_crack', break: 'bone_break', debris: 'bone_clatter', burn: null },
  }),
  def({ // EARTH
    id: MATERIAL.EARTH, name: 'EARTH', density: 1.5, hardness: 0.7, minDamage: 0,
    resist: R_(1.00, 0.30, 1.30, 0.50, 1.00, 0.80),
    flammable: 0, soluble: 0.4, debrisShape: 'clump', bounce: 0.06, spin: 3, dustScale: 1.2,
    dust: [0.46, 0.38, 0.28], chip: [0.40, 0.34, 0.24], body: [0.28, 0.23, 0.16],
    sfx: { crack: 'dirt_crack', break: 'dirt_break', debris: 'dirt_fall', burn: null },
  }),
  def({ // FLESH
    id: MATERIAL.FLESH, name: 'FLESH', density: 1.0, hardness: 0.3, minDamage: 0,
    resist: R_(1.00, 1.00, 1.00, 1.00, 1.00, 1.00),
    flammable: 0.4, debrisShape: 'clump', bounce: 0.1, spin: 5, dustScale: 0.5,
    dust: [0.35, 0.12, 0.14], chip: [0.72, 0.16, 0.18], body: [0.45, 0.24, 0.24],
    sfx: { crack: 'flesh_hit', break: 'flesh_burst', debris: 'gib', burn: 'flesh_burn' },
  }),
];

/** LIFE is healing on flesh and inert on everything else — the one special case. */
export function resistOf(material, type) {
  if (type === DAMAGE.LIFE) return material === MATERIAL.FLESH ? 1 : 0;
  const m = MAT[material] || MAT[MATERIAL.ROCK];
  return m.resist[type];
}
