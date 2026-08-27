// Materials are data. Adding one is a table entry, not code — that is what lets
// modes and events be configuration rather than new systems.

export const EMPTY = 0;
export const WALL = 1;
export const SAND = 2;
export const WATER = 3;
export const JELLY = 4;
export const OIL = 5;
export const LAVA = 6;
export const ICE = 7;
export const ASH = 8;
export const CRYSTAL = 9;
export const FIRE = 10;
export const STEAM = 11;
export const MAT_COUNT = 12;

// kind drives which movement routine runs. 'blob' is handled by blobs.js and
// skipped entirely by the cellular step.
export const POWDER = 1, LIQUID = 2, GAS = 3, STATIC = 4, BLOB = 5, NONE = 0;

const M = [];
function def(id, name, kind, props) { M[id] = { id, name, kind, ...props }; }

//                                   density  spread slip  tintable flammable life
def(EMPTY,   'empty',   NONE,   { density: 0,   spread: 0, slip: 0,    tintable: 0, flammable: 0, life: 0 });
def(WALL,    'wall',    STATIC, { density: 255, spread: 0, slip: 0,    tintable: 0, flammable: 0, life: 0 });
def(SAND,    'sand',    POWDER, { density: 60,  spread: 0, slip: 0.72, tintable: 1, flammable: 0, life: 0 });
def(WATER,   'water',   LIQUID, { density: 30,  spread: 5, slip: 1,    tintable: 1, flammable: 0, life: 0 });
def(JELLY,   'jelly',   BLOB,   { density: 45,  spread: 0, slip: 0,    tintable: 1, flammable: 0, life: 0 });
def(OIL,     'oil',     LIQUID, { density: 22,  spread: 2, slip: 1,    tintable: 1, flammable: 1, life: 0 });
def(LAVA,    'lava',    LIQUID, { density: 70,  spread: 1, slip: 1,    tintable: 0, flammable: 0, life: 0 });
def(ICE,     'ice',     STATIC, { density: 28,  spread: 0, slip: 0,    tintable: 1, flammable: 0, life: 0 });
def(ASH,     'ash',     POWDER, { density: 12,  spread: 0, slip: 0.92, tintable: 0, flammable: 0, life: 0 });
def(CRYSTAL, 'crystal', STATIC, { density: 200, spread: 0, slip: 0,    tintable: 0, flammable: 0, life: 0 });
def(FIRE,    'fire',    GAS,    { density: 4,   spread: 1, slip: 0,    tintable: 0, flammable: 0, life: 55 });
def(STEAM,   'steam',   GAS,    { density: 2,   spread: 2, slip: 0,    tintable: 0, flammable: 0, life: 190 });

export const MATS = M;

// Flat typed lookups — the step loop reads these per cell, so keep them out of
// object property access.
export const KIND = new Uint8Array(MAT_COUNT);
export const DENSITY = new Uint8Array(MAT_COUNT);
export const SPREAD = new Uint8Array(MAT_COUNT);
export const SLIP = new Float32Array(MAT_COUNT);
export const TINTABLE = new Uint8Array(MAT_COUNT);
export const FLAMMABLE = new Uint8Array(MAT_COUNT);
export const LIFE = new Uint8Array(MAT_COUNT);
for (const m of M) {
  KIND[m.id] = m.kind; DENSITY[m.id] = m.density; SPREAD[m.id] = m.spread;
  SLIP[m.id] = m.slip; TINTABLE[m.id] = m.tintable;
  FLAMMABLE[m.id] = m.flammable; LIFE[m.id] = m.life;
}

export const isFluid = (m) => KIND[m] === LIQUID || KIND[m] === GAS;
export const byName = (n) => M.find((m) => m && m.name === n);
