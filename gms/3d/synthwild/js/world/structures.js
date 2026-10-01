// Explorable structures: grower outposts, sunken server vaults, mountain observatories, desert ruins.
// One candidate per grid cell per kind; whether it exists (and its exact layout) depends only on pure column data,
// so every chunk it touches builds the same whole structure. Caches are placed empty: lane 4 rolls loot on first open.
import { hash2, rand2, rand3 } from './noise.js';
import { BLOCK } from '../data/blocks.js';
import { BIO } from './terrain.js';

const B = BLOCK;
const NEON = [B.NEON_CYAN, B.NEON_MAGENTA, B.NEON_LIME, B.NEON_AMBER, B.NEON_VIOLET, B.NEON_CORAL, B.NEON_WHITE, B.NEON_COBALT];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAST_TOP = 21; // antenna tip height above the starter floor

export function makeStructures(S, column, spawn) {
  const flatness = (cx, cz, rad) => {
    let lo = 1e9, hi = -1e9, wet = false;
    for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad, rad], [-rad, -rad], [rad, -rad], [-rad, rad]]) {
      const c = column(cx + dx, cz + dz);
      lo = Math.min(lo, c.h); hi = Math.max(hi, c.h);
      if (c.water) wet = true;
    }
    return { spread: hi - lo, wet };
  };

  const KINDS = [
    { kind: 'outpost', grid: 160, salt: 0x0b05, pct: 45, edge: 14, make(cx, cz, r) {
      const c = column(cx, cz);
      if ((c.biome !== BIO.FOREST && c.biome !== BIO.PLAINS) || c.water || c.h > 90) return null;
      const st = starter();
      if (st && Math.abs(st.cx - cx) < 48 && Math.abs(st.cz - cz) < 48) return null;
      const f = flatness(cx, cz, 6);
      if (f.wet || f.spread > 3) return null;
      return { y: c.h, rad: 12 };
    } },
    { kind: 'vault', grid: 192, salt: 0x5a17, pct: 45, edge: 10, make(cx, cz) {
      const c = column(cx, cz);
      if (c.biome !== BIO.DEEP || c.water - c.h < 9) return null;
      const f = flatness(cx, cz, 5);
      if (f.spread > 3) return null;
      return { y: c.h, rad: 7, water: c.water };
    } },
    { kind: 'observatory', grid: 256, salt: 0x0b5e, pct: 40, edge: 10, make(cx, cz) {
      const c = column(cx, cz);
      if (c.biome !== BIO.MOUNTAINS || c.h < 76 || c.h > 112) return null;
      for (let dz = -4; dz <= 4; dz += 2) for (let dx = -4; dx <= 4; dx += 2) if (column(cx + dx, cz + dz).h > c.h + 4) return null; // near a summit
      return { y: c.h, rad: 6 };
    } },
    { kind: 'ruin', grid: 72, salt: 0x2a1e, pct: 30, edge: 12, make(cx, cz, r) {
      const c = column(cx, cz);
      if (c.biome !== BIO.DESERT || c.water || flatness(cx, cz, 5).spread > 5) return null;
      return { y: c.h, rad: 6, w: 5 + ((r >>> 4) % 5), d: 5 + ((r >>> 24) % 5) };
    } },
  ];

  // guaranteed starter outpost 60-120 m from spawn, door facing spawn, with a tall glowing antenna
  let starterInfo;
  function starter() {
    if (starterInfo !== undefined) return starterInfo;
    starterInfo = null;
    const [sx, sy, sz] = spawn();
    const a0 = (hash2(Math.floor(sx), Math.floor(sz), S ^ 0x57a7) % 24);
    // terrain must stay below the line from a kid's eye at spawn to the antenna tip
    const sightline = (cx, cz, h) => {
      const eye = sy + 1.6, tip = h + MAST_TOP;
      for (let t = 0.08; t < 0.95; t += 0.06) {
        const c = column(Math.round(sx + (cx - sx) * t), Math.round(sz + (cz - sz) * t));
        if (c.h > eye + (tip - eye) * t - 2) return false;
      }
      return true;
    };
    for (const pass of [0, 1, 2]) for (const d of [80, 70, 92, 104, 62, 116]) for (let k = 0; k < 24 && !starterInfo; k++) {
      const a = ((a0 + k) % 24) / 24 * Math.PI * 2;
      const cx = Math.round(sx + Math.cos(a) * d), cz = Math.round(sz + Math.sin(a) * d), c = column(cx, cz);
      if (c.water || c.h < 33 || c.h > 70 || !(c.biome === BIO.FOREST || c.biome === BIO.SHORE || c.biome === BIO.PLAINS)) continue;
      if (pass === 0 && Math.abs(c.h - sy) > 6) continue;
      if (pass < 2 && !sightline(cx, cz, c.h)) continue;
      const f = flatness(cx, cz, 4);
      if (f.wet || f.spread > 2) continue;
      const dx = sx - cx, dz = sz - cz;
      const face = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz) || 1];
      starterInfo = { kind: 'starter', starter: true, cx, cz, y: c.h, r: hash2(cx, cz, S ^ 0x57), rad: 6, face, cache: [cx + 1, c.h, cz - 1] };
    }
    return starterInfo;
  }

  // spawn kit: a lumen-bloom cluster and a carbon-nodule outcrop within ~30 m of spawn (glowbulbs before night 1)
  let kitList;
  function kits() {
    if (kitList) return kitList;
    kitList = [];
    const [sx, , sz] = spawn();
    const a0 = hash2(Math.floor(sx), Math.floor(sz), S ^ 0x61f7) % 16;
    const find = (dists, wantForest, avoid) => {
      for (const pass of wantForest ? [true, false] : [false]) for (const d of dists) for (let k = 0; k < 16; k++) {
        const a = ((a0 + k) % 16) / 16 * Math.PI * 2;
        const cx = Math.round(sx + Math.cos(a) * d), cz = Math.round(sz + Math.sin(a) * d), c = column(cx, cz);
        if (c.water || c.h < 33 || (pass && c.biome !== BIO.FOREST)) continue;
        if (avoid && Math.abs(avoid.cx - cx) + Math.abs(avoid.cz - cz) < 8) continue;
        const f = flatness(cx, cz, 2);
        if (f.wet || f.spread > 2) continue;
        return { cx, cz, y: c.h };
      }
      return null;
    };
    const bloom = find([14, 18, 22, 26, 10], true, null);
    if (bloom) kitList.push({ kind: 'kit', sub: 'blooms', rad: 3, ...bloom });
    const ore = find([12, 16, 20, 24, 28], false, bloom);
    if (ore) kitList.push({ kind: 'kit', sub: 'outcrop', rad: 2, ...ore });
    return kitList;
  }

  const cache = new Map();
  function info(K, gx, gz) {
    const key = K.salt * 7 + gx * 100003 + gz * 7919;
    if (cache.has(key)) return cache.get(key);
    let I = null;
    const r = hash2(gx, gz, S ^ K.salt);
    if (r % 100 < K.pct) {
      const span = K.grid - 2 * K.edge;
      const cx = gx * K.grid + K.edge + ((r >>> 7) % span), cz = gz * K.grid + K.edge + ((r >>> 17) % span);
      const m = K.make(cx, cz, r);
      if (m) I = { kind: K.kind, cx, cz, r, ...m };
    }
    if (cache.size > 4096) cache.clear();
    cache.set(key, I);
    return I;
  }

  function each(xa, xb, za, zb, fn) {
    for (const kt of kits()) if (kt.cx + kt.rad >= xa && kt.cx - kt.rad <= xb && kt.cz + kt.rad >= za && kt.cz - kt.rad <= zb) fn(kt);
    const st = starter();
    if (st && st.cx + st.rad >= xa && st.cx - st.rad <= xb && st.cz + st.rad >= za && st.cz - st.rad <= zb) fn(st);
    for (const K of KINDS) {
      for (let gz = Math.floor((za - K.grid) / K.grid); gz <= Math.floor((zb + K.grid) / K.grid); gz++)
        for (let gx = Math.floor((xa - K.grid) / K.grid); gx <= Math.floor((xb + K.grid) / K.grid); gx++) {
          const I = info(K, gx, gz);
          if (I && I.cx + I.rad >= xa && I.cx - I.rad <= xb && I.cz + I.rad >= za && I.cz - I.rad <= zb) fn(I);
        }
    }
  }

  // true if (x,z) is within `pad` of any structure footprint (trees/spires keep clear)
  function covers(x, z, pad = 2) {
    let hit = false;
    each(x - pad, x + pad, z - pad, z + pad, () => { hit = true; });
    return hit;
  }

  function near(x, z, r) {
    const out = [];
    each(x - r, x + r, z - r, z + r, (I) => {
      if (I.kind === 'kit') return;
      const dx = I.cx - x, dz = I.cz - z;
      if (dx * dx + dz * dz <= r * r) {
        const e = { kind: I.kind, pos: [I.cx + 0.5, I.y, I.cz + 0.5], dist: Math.sqrt(dx * dx + dz * dz) };
        if (I.starter) { e.starter = true; e.cache = I.cache.slice(); }
        out.push(e);
      }
    });
    return out.sort((a, b) => a.dist - b.dist);
  }

  // ---------- builders (put rule 0 = force, 2 = air only) ----------
  function build(put, x0, z0) {
    each(x0, x0 + 15, z0, z0 + 15, (I) => {
      if (I.kind === 'kit') kit(put, I);
      else if (I.kind === 'starter') starterHut(put, I);
      else if (I.kind === 'outpost') outpost(put, I);
      else if (I.kind === 'vault') vault(put, I);
      else if (I.kind === 'observatory') observatory(put, I);
      else ruin(put, I);
    });
  }

  const foundation = (put, x, z, y, mat) => {
    const gh = column(x, z).h;
    for (let k = Math.min(gh, y - 1); k < y - 1; k++) put(x, k, z, mat, 0);
  };

  function outpost(put, I) {
    const { cx, cz, y, r } = I;
    const face = DIRS[(r >>> 3) & 3], trim = NEON[(r >>> 5) & 7];
    if (((r >>> 9) % 100) < 40) dome(put, cx, y, cz, 4 + ((r >>> 11) & 1), face, trim, r);
    else hut(put, cx, y, cz, 7 + 2 * ((r >>> 11) & 1), 7 + 2 * ((r >>> 12) & 1), face, trim, r);
    // satellite pods and a little garden of lumen blooms
    const pods = (r >>> 14) % 3;
    for (let p = 0; p < pods; p++) {
      const a = ((r >>> (16 + p * 4)) & 15) / 16 * Math.PI * 2;
      const px = cx + Math.round(Math.cos(a) * 9), pz = cz + Math.round(Math.sin(a) * 9);
      if (Math.abs(column(px, pz).h - y) <= 2) pod(put, px, y, pz, DIRS[(r >>> (17 + p)) & 3]);
    }
    for (let k = 0; k < 10; k++) {
      const a = rand3(cx, k, cz, S ^ 0x6a) * Math.PI * 2, d = 6 + rand3(cz, k, cx, S ^ 0x6b) * 5;
      const bx = cx + Math.round(Math.cos(a) * d), bz = cz + Math.round(Math.sin(a) * d), c = column(bx, bz);
      if (!c.water) put(bx, c.h, bz, B.LUMEN_BLOOM, 2);
    }
  }

  function kit(put, I) {
    const { cx, cz, y } = I;
    if (I.sub === 'blooms') {
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dz * dz > 9 || rand3(cx + dx, 7, cz + dz, S ^ 0xb10) > 0.45) continue;
        const c = column(cx + dx, cz + dz);
        if (!c.water && Math.abs(c.h - y) <= 2) put(cx + dx, c.h, cz + dz, B.LUMEN_BLOOM, 2);
      }
      put(cx, y, cz, B.LUMEN_BLOOM, 2);
    } else {
      // a knee-high basalt boulder studded with carbon nodules, sunk into the ground
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const tall = dx === 0 && dz === 0 ? 3 : (dx && dz) ? 1 : 2;
        for (let k = -1; k < tall; k++) {
          const ore = k >= 0 && rand3(cx + dx, y + k, cz + dz, S ^ 0x0c) < 0.6;
          put(cx + dx, y + k, cz + dz, ore || (dx === 0 && dz === 0 && k === 2) ? B.ORE_CARBON : B.BASALT_MATRIX, 0);
        }
      }
    }
  }

  function starterHut(put, I) {
    const { cx, cz, y, face } = I;
    hut(put, cx, y, cz, 5, 5, face, B.NEON_CYAN, 0);
    // hut() puts the fabricator at (cx-1,cz-1), the cache at (cx+1,cz-1) (reported as I.cache), a glowbulb at (cx-1,cz+1)
    put(cx + 1, y, cz + 1, B.GLOWBULB, 0);
    const mx = cx - 2, mz = cz - 2;
    for (let k = 1; k < MAST_TOP - 4; k++) put(mx, y + 4 + k, mz, k % 3 === 0 ? B.NEON_WHITE : B.NEON_CYAN, 0);
    put(mx, y + MAST_TOP, mz, B.LIGHT_PANEL, 0);
    for (const [ax, az] of DIRS) { put(mx + ax, y + MAST_TOP - 2, mz + az, B.NEON_CYAN, 0); put(mx + ax * 2, y + MAST_TOP - 2, mz + az * 2, B.LIGHT_PANEL, 0); }
  }

  function hut(put, cx, y, cz, w, d, face, trim, r) {
    const x0 = cx - (w >> 1), z0 = cz - (d >> 1), H = 4;
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      foundation(put, x, z, y, B.POLYMER_BRICK);
      put(x, y - 1, z, B.LATTICE_PLANKS, 0);
      for (let k = 0; k <= H + 2; k++) put(x, y + k, z, 0, 0);
      const ex = x === x0 || x === x0 + w - 1, ez = z === z0 || z === z0 + d - 1;
      if (ex && ez) { for (let k = 0; k < H; k++) put(x, y + k, z, B.POLYMER_BRICK, 0); put(x, y + H, z, trim, 0); continue; }
      if (ex || ez) {
        for (let k = 0; k < H; k++) put(x, y + k, z, k === 0 || k === H - 1 ? B.POLYMER_BRICK : (x + z) % 2 ? B.CLEARGLASS : B.LATTICE_PLANKS, 0);
        put(x, y + H, z, trim, 0);
      } else put(x, y + H, z, x === cx && z === cz ? B.LIGHT_PANEL : B.CLEARGLASS, 0);
    }
    // door in the middle of the facing wall
    const [fx, fz] = face, dx = cx + fx * (w >> 1), dz = cz + fz * (d >> 1);
    put(dx, y, dz, 0, 0); put(dx, y + 1, dz, 0, 0); put(dx, y + 2, dz, B.GLOWBULB, 0);
    put(x0 + 1, y, z0 + 1, B.FABRICATOR, 0);
    put(x0 + w - 2, y, z0 + 1, B.CACHE, 0);
    put(x0 + 1, y, z0 + d - 2, B.GLOWBULB, 0);
    if ((r >>> 13) & 1) put(x0 + w - 2, y, z0 + d - 2, B.SLEEP_POD, 0);
  }

  function dome(put, cx, y, cz, R, face, trim, r) {
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const fd = Math.sqrt(dx * dx + dz * dz);
      if (fd > R + 0.5) continue;
      foundation(put, cx + dx, cz + dz, y, B.POLYMER_BRICK);
      put(cx + dx, y - 1, cz + dz, B.POLYMER_BRICK, 0);
      for (let dy = 0; dy <= R + 1; dy++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let m = 0;
        if (d >= R - 0.5 && d < R + 0.5) m = dy === 0 ? B.POLYMER_BRICK : dy === 2 ? trim : B.CLEARGLASS;
        put(cx + dx, y + dy, cz + dz, m, 0);
      }
    }
    const [fx, fz] = face;
    put(cx + fx * R, y, cz + fz * R, 0, 0); put(cx + fx * R, y + 1, cz + fz * R, 0, 0);
    put(cx, y + R - 1, cz, B.LIGHT_PANEL, 0);
    put(cx - fx * (R - 2) + fz, y, cz - fz * (R - 2) + fx, B.FABRICATOR, 0);
    put(cx - fx * (R - 2) - fz, y, cz - fz * (R - 2) - fx, B.CACHE, 0);
    put(cx + fz * (R - 2), y, cz + fx * (R - 2), B.GLOWBULB, 0);
    if ((r >>> 13) & 1) put(cx - fz * (R - 2), y, cz - fx * (R - 2), B.SLEEP_POD, 0);
  }

  function pod(put, px, y, pz, face) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      foundation(put, px + dx, pz + dz, y, B.POLYMER_BRICK);
      put(px + dx, y - 1, pz + dz, B.POLYMER_BRICK, 0);
      const wall = dx || dz;
      for (let k = 0; k < 3; k++) put(px + dx, y + k, pz + dz, wall ? (k === 1 && dx && dz ? B.CLEARGLASS : B.POLYMER_BRICK) : 0, 0);
      put(px + dx, y + 3, pz + dz, wall ? B.MIRROR_TILE : B.LIGHT_PANEL, 0);
    }
    put(px + face[0], y, pz + face[1], 0, 0); put(px + face[0], y + 1, pz + face[1], 0, 0);
    put(px, y, pz, B.GLOWBULB, 0);
  }

  function vault(put, I) {
    const { cx, cz, y, r, water } = I;
    const R = 4 + ((r >>> 11) & 1);
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const fd = Math.sqrt(dx * dx + dz * dz);
      if (fd > R + 1.5) continue;
      const x = cx + dx, z = cz + dz;
      for (let k = y; k < water; k++) put(x, k, z, B.WATER, 3); // kelp above the footprint goes
      if (fd > R + 0.5) { if (((dx + dz) & 1) === 0) put(x, y - 1, z, B.SEABED_NODE, 0); continue; }
      foundation(put, x, z, y, B.MIRROR_TILE);
      put(x, y - 1, z, fd < 1.5 ? B.SEABED_NODE : B.MIRROR_TILE, 0);
      for (let dy = 0; dy <= R + 1; dy++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < R - 0.5) put(x, y + dy, z, 0, 0);
        else if (d < R + 0.5) put(x, y + dy, z, dy === 0 ? B.MIRROR_TILE : B.CLEARGLASS, 0);
      }
    }
    put(cx, y, cz, B.CACHE, 0);
    put(cx + 2, y, cz, B.GLOWBULB, 0);
    put(cx - 2, y, cz, B.GLOWBULB, 0);
    put(cx, y + R - 1, cz, B.LIGHT_PANEL, 0);
  }

  function observatory(put, I) {
    const { cx, cz, y, r } = I;
    const R = 4, [fx, fz] = DIRS[(r >>> 3) & 3];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const fd = Math.sqrt(dx * dx + dz * dz);
      if (fd > R + 0.5) continue;
      const x = cx + dx, z = cz + dz;
      foundation(put, x, z, y, B.FIBRE_STONE);
      put(x, y - 1, z, B.POLYMER_BRICK, 0);
      const ring = fd >= R - 0.5;
      for (let k = 0; k < 3; k++) put(x, y + k, z, ring ? (k === 1 && ((dx * 3 + dz) & 3) === 0 ? B.CLEARGLASS : B.MIRROR_TILE) : 0, 0);
      for (let dy = 0; dy <= R + 4; dy++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        put(x, y + 3 + dy, z, d >= R - 0.5 && d < R + 0.5 ? (dy === 0 ? B.NEON_COBALT : B.CLEARGLASS) : 0, 0);
      }
    }
    put(cx + fx * R, y, cz + fz * R, 0, 0); put(cx + fx * R, y + 1, cz + fz * R, 0, 0);
    // telescope: a glowing tube climbing towards the dome
    for (let k = 0; k < 4; k++) {
      const tx = cx - fx * (1 - k), tz = cz - fz * (1 - k);
      put(tx, y + 1 + k, tz, k === 3 ? B.LIGHT_PANEL : B.NEON_COBALT, 0);
      if (k < 3) put(tx, y + 2 + k, tz, B.NEON_COBALT, 0); // stair-step so every piece touches the next by a face
    }
    put(cx - fx, y, cz - fz, B.POLYMER_BRICK, 0);
    put(cx + fz * 2, y, cz + fx * 2, B.CACHE, 0);
    put(cx - fz * 2, y, cz - fx * 2, B.GLOWBULB, 0);
  }

  function ruin(put, I) {
    const { cx, cz, y, r, w, d } = I;
    const x0 = cx - (w >> 1), z0 = cz - (d >> 1);
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      foundation(put, x, z, y, B.MIRROR_SANDSTONE);
      put(x, y - 1, z, rand3(x, y, z, S ^ 0x71) < 0.3 ? B.MIRROR_TILE_CRACKED : B.MIRROR_TILE, 0);
      for (let k = y; k < y + 9; k++) put(x, k, z, 0, 0);
      const edge = x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1;
      if (!edge) continue;
      const corner = (x === x0 || x === x0 + w - 1) && (z === z0 || z === z0 + d - 1);
      const wallH = corner ? 4 + ((r >>> 3) & 1) : Math.floor(rand2(x, z, S ^ 0x72) * 4);
      for (let k = 0; k < wallH; k++) {
        const win = !corner && k === 1 && rand3(x, k, z, S ^ 0x74) < 0.25;
        put(x, y + k, z, win ? B.CLEARGLASS : rand3(x, y + k, z, S ^ 0x73) < 0.25 ? B.MIRROR_TILE_CRACKED : B.MIRROR_TILE, 0);
      }
      if (corner && ((r >>> 5) & 3) === 0) put(x, y + wallH, z, B.GLOWBULB, 0);
    }
    if (((r >>> 9) % 100) < 35) put(x0 + 1, y, z0 + 1, B.CACHE, 0);
  }

  return { build, covers, near, kinds: KINDS.map((k) => k.kind) };
}
