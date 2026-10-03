// The static town around the plots. PLACEHOLDER western main street: a dirt road with wheel ruts, plank boardwalks,
// false-front backdrop buildings both sides, lantern posts, cacti, rocks and far mesas. The art lane replaces this file.
// Output is a handful of merged chunks (one draw each) split by x so the frustum and shadow passes cull them.
import * as props from './props.js?v=20261004a';
import { contactMesh } from './build.js?v=20261004a';

export function buildTown(kit, data, field, pal) {
  const ST = data.STREET;
  const CELL = 44, X0 = ST.x0 - 120;
  const cells = new Map(), gcells = new Map();
  const cellKey = (x, z) => Math.floor((x - X0) / CELL) + ':' + (z < -32 ? 'n' : z > 24 ? 's' : 'm');
  const B = (x, z = 0) => { const k = cellKey(x, z); if (!cells.has(k)) cells.set(k, kit.builder(pal, { seed: 100 + cells.size * 31 })); return cells.get(k); };
  const G = (x, z = 0) => { const k = cellKey(x, z); if (!gcells.has(k)) gcells.set(k, kit.builder(pal, { seed: 500 + gcells.size * 17 })); return gcells.get(k); };
  const far = kit.builder(pal, { seed: 999 });
  const lamps = [];
  const life = { pigeonSpots: [], joggerPaths: [], gullSpots: [], benches: [] };
  const rz = ST.z, hw = ST.width / 2;
  const roadN = rz - hw, roadS = rz + hw;
  const X1 = ST.x1 + 60, XA = ST.x0 - 60;

  // ---- the street: packed dirt, two wheel ruts, boardwalks both sides
  for (let x = XA; x < X1; x += 30) {
    const xb = Math.min(X1, x + 30), cx = (x + xb) / 2, g = G(cx);
    g.slab('road', cx, -0.1, rz, xb - x, 0.12, ST.width + 2, { round: 0.04, taper: 0 });
    for (const dz of [-1.6, 1.6]) g.slab('dirt', cx, 0.0, rz + dz, xb - x, 0.03, 0.5, { round: 0.01, taper: 0, noAo: true });
    for (const z of [roadN - 1.3, roadS + 1.3]) {
      for (let px = x; px < xb; px += 0.7) g.slab((px * 10) % 3 < 1.5 ? 'wood' : 'wood2', px + 0.35, 0.05, z, 0.66, 0.14, 2.2, { round: 0.02, taper: 0 });
    }
  }

  // ---- backdrop: false-front buildings behind the plots (north) and facing the street (south)
  const fronts = (z, ry, x0, x1, seed) => {
    for (let x = x0; x < x1;) {
      const r = rngOf(x * 7 + seed);
      const w = 5 + r() * 3;
      falseFront(B(x + w / 2, z), x + w / 2, z, ry, w, 4 + r() * 3, 3 + r() * 2.5, r);
      x += w + 0.6 + r() * 2.5;
    }
  };
  fronts(-17, 0, XA, X1, 1);
  fronts(roadS + 7.5, Math.PI, XA, X1, 2);

  // ---- lanterns, hitching rails, barrels along the boardwalks
  for (let x = XA + 6; x < X1; x += 16) {
    const b = B(x);
    lamps.push(props.lamp(b, x, roadS + 2.3, { h: 3 }));
    hitch(b, x + 6, roadS + 0.6);
    barrel(b, x + 3, roadS + 2.1);
  }

  // ---- desert: cacti, rocks near town; mesas on the horizon
  const { x0, x1, z0, z1 } = data.WORLD_BOUNDS;
  for (let i = 0; i < 240; i++) {
    const r = rngOf(i * 31 + 7);
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    if (Math.abs(z - rz) < 34 && x > ST.x0 - 40 && x < ST.x1 + 30) continue;
    const h = field.height(x, z);
    if (r() < 0.55) cactus(far, x, z, h - 0.1, 1 + r() * 1.4, r);
    else far.ball('rock', x, h - 0.2, z, 0.8 + r() * 1.6, { sy: 0.6, detail: 0 });
  }
  for (let i = 0; i < 9; i++) {
    const r = rngOf(i * 13 + 41);
    const x = x0 + 40 + i * ((x1 - x0 - 80) / 8) + (r() - 0.5) * 30, z = z0 + 30 + r() * 40;
    const w = 30 + r() * 40, d = 18 + r() * 14, hgt = 18 + r() * 22;
    far.slab('rock', x, field.height(x, z) - 2, z, w, hgt, d, { round: 1.2, taper: 0.18 });
    far.slab('rock2', x, field.height(x, z) - 2 + hgt * 0.45, z + 0.3, w * 1.01, hgt * 0.08, d * 1.01, { round: 0.6, taper: 0 });
  }

  life.pigeonSpots.push([-6, roadN - 3], [ST.x1 * 0.5, roadN - 2.5], [ST.x1 - 10, roadS + 3.5]);
  life.joggerPaths.push([[ST.x0 - 30, roadS + 1.3], [ST.x1 + 30, roadS + 1.3]]);

  const chunks = [...cells.entries()].map(([k, b]) => { const m = b.finish(); m.name = 'town:' + k; return m; });
  const ground = [...gcells.entries()].map(([k, b]) => { const m = b.finish({ cast: false }); m.name = 'ground:' + k; return m; });
  const farMesh = far.finish({ cast: false });
  farMesh.name = 'town:far';
  const rows = [...cells.values(), ...gcells.values()].flatMap((b) => b.contacts);
  const out = [...chunks, ...ground, farMesh];
  if (rows.length) out.push(contactMesh(kit.materials, rows));
  return { chunks: out, lamps, life };
}

function falseFront(b, x, z, ry, w, h, d, r) {
  const wall = ['wall', 'wall2', 'wood', 'wood2'][Math.floor(r() * 4)];
  const s = Math.cos(ry) >= 0 ? 1 : -1;
  b.slab(wall, x, 0, z - s * d / 2, w, h, d, { round: 0.06, taper: 0 });
  b.slab(wall, x, h - 0.1, z + s * 0.1, w + 0.3, 1.6 + r() * 1.2, 0.3, { round: 0.04, taper: 0 });
  b.slab('trim', x, h + 1.5, z + s * 0.12, w + 0.5, 0.18, 0.4, { round: 0.03, taper: 0 });
  b.slab('sign', x, h + 0.2, z + s * 0.28, w * 0.6, 0.8, 0.06, { round: 0.02, taper: 0, noAo: true });
  b.slab('door', x, 0, z + s * 0.04, 1.1, 2.1, 0.1, { round: 0.02, taper: 0 });
  for (const k of [-1, 1]) b.slab('window', x + k * w * 0.3, 1.1, z + s * 0.04, 1.0, 1.1, 0.06, { round: 0.02, taper: 0, noAo: true });
  b.slab('roof2', x, 2.6, z + s * 1.1, w, 0.12, 2.2, { round: 0.03, taper: 0, rx: s * 0.12 });
  for (const k of [-1, 1]) b.cyl('woodDark', x + k * (w / 2 - 0.2), 0, z + s * 2.0, 0.09, 2.6, 0, { sides: 6 });
}

function cactus(b, x, z, y, s, r) {
  b.cyl('cactus', x, y, z, 0.32 * s, 3.2 * s, 0, { sides: 7, taper: 0.85 });
  b.ball('cactus', x, y + 3.2 * s, z, 0.3 * s, { detail: 0 });
  for (const k of [-1, 1]) {
    if (r() < 0.3) continue;
    const ay = y + (1.2 + r() * 0.8) * s;
    b.slab('cactus', x + k * 0.55 * s, ay, z, 0.7 * s, 0.4 * s, 0.4 * s, { round: 0.12 });
    b.cyl('cactus', x + k * 0.85 * s, ay, z, 0.22 * s, 1.1 * s, 0, { sides: 6, taper: 0.85 });
  }
}

function hitch(b, x, z) {
  for (const k of [-1, 1]) b.cyl('woodDark', x + k * 1.2, 0, z, 0.07, 1.1, 0, { sides: 5 });
  b.slab('wood2', x, 1.0, z, 2.6, 0.12, 0.12, { round: 0.03, taper: 0 });
}

function barrel(b, x, z) {
  b.cyl('wood', x, 0, z, 0.36, 0.95, 0, { sides: 9, taper: 0.92 });
  for (const y of [0.15, 0.75]) b.cyl('iron', x, y, z, 0.37, 0.05, 0, { sides: 9 });
}

export function rngOf(seed) {
  let a = (Math.floor(seed * 1000) ^ 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
