// Caves: worm tunnels (deterministic per 96 m region, cached), spaghetti noodles, caverns, mountain overhangs,
// and glowing cave flora. Everything is keyed to world coordinates.
import { makeNoise, hash2, hash3, rand3 } from './noise.js';
import { BLOCK, SOLID } from '../data/blocks.js';

const B = BLOCK;
const WG = 96;          // worm region size
const REACH = 200;      // max horizontal reach of a worm from its region
const NL = 5 * 5 * 33;  // lattice: 4-cell spacing, 5x5 columns x 33 levels

export function makeCaves(S) {
  const nK1 = makeNoise((S ^ 0x51ed27) >>> 0), nK2 = makeNoise((S ^ 0x2c1b3c6d) >>> 0);
  const nCav = makeNoise((S ^ 0x5be0cd19) >>> 0), nOv = makeNoise((S ^ 0x428a2f98) >>> 0);
  const wormCache = new Map();

  function regionWorms(rx, rz) {
    const key = rx * 100003 + rz;
    let w = wormCache.get(key);
    if (w) return w;
    w = [];
    const r = hash2(rx, rz, S ^ 0xc0ffee);
    const count = (r % 3) + ((r >>> 4) % 4 === 0 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const h = hash3(rx, rz, k, S ^ 0x77);
      let x = rx * WG + (h % WG), z = rz * WG + ((h >>> 8) % WG), y = 10 + ((h >>> 16) % 50);
      let yaw = rand3(rx, rz, k, S ^ 0x91) * Math.PI * 2, pitch = (rand3(rx, k, rz, S ^ 0x92) - 0.5) * 0.6;
      const steps = 70 + (h % 110), phase = (h >>> 24) / 40;
      const pts = new Float32Array(steps * 4);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ymax = 0;
      for (let i = 0; i < steps; i++) {
        const rad = 1.3 + 1.5 * (0.5 + 0.5 * Math.sin(i * 0.13 + phase)) + (i % 37 === 20 ? 1.5 : 0);
        pts[i * 4] = x; pts[i * 4 + 1] = y; pts[i * 4 + 2] = z; pts[i * 4 + 3] = rad;
        x0 = Math.min(x0, x - rad); x1 = Math.max(x1, x + rad); z0 = Math.min(z0, z - rad); z1 = Math.max(z1, z + rad);
        ymax = Math.max(ymax, y + rad);
        x += Math.cos(yaw) * Math.cos(pitch); z += Math.sin(yaw) * Math.cos(pitch); y += Math.sin(pitch);
        yaw += (rand3(i, k, rx * 7 + rz, S ^ 0x93) - 0.5) * 0.6;
        pitch = pitch * 0.85 + (rand3(i, rz, k, S ^ 0x94) - 0.5) * 0.35;
        if (y < 6) pitch = Math.abs(pitch) + 0.05;
        pitch = Math.max(-0.8, Math.min(0.8, pitch));
      }
      w.push({ pts, steps, x0, x1, z0, z1, ymax });
    }
    if (wormCache.size > 2048) wormCache.clear();
    wormCache.set(key, w);
    return w;
  }

  function forWorms(xa, xb, za, zb, fn) {
    for (let rz = Math.floor((za - REACH) / WG); rz <= Math.floor((zb + REACH) / WG); rz++)
      for (let rx = Math.floor((xa - REACH) / WG); rx <= Math.floor((xb + REACH) / WG); rx++)
        for (const w of regionWorms(rx, rz)) if (w.x1 >= xa && w.x0 <= xb && w.z1 >= za && w.z0 <= zb) fn(w);
  }

  // does any worm pass within `r` (horizontal) of (x,z) above yMin? used to keep trees off cave mouths
  function wormNear(x, z, yMin, r = 3) {
    let hit = false;
    forWorms(x - r, x + r, z - r, z + r, (w) => {
      if (hit || w.ymax < yMin) return;
      const p = w.pts;
      for (let i = 0; i < w.steps; i++) {
        const dx = p[i * 4] - x, dz = p[i * 4 + 2] - z, rr = r + p[i * 4 + 3];
        if (dx * dx + dz * dz < rr * rr && p[i * 4 + 1] + p[i * 4 + 3] >= yMin) { hit = true; return; }
      }
    });
    return hit;
  }

  const GA = new Float32Array(NL), GB = new Float32Array(NL), GC = new Float32Array(NL);

  function carve(cells, x0, z0, heights, waters, ph, pw, mtn, slopes) {
    // max water level of the column and its 4 neighbours: never open a cell beside water
    const wetAt = (x, z) => {
      const p = (x + 1) + (z + 1) * 18;
      return Math.max(pw[p], pw[p - 1], pw[p + 1], pw[p - 18], pw[p + 18]);
    };
    const canCarve = (x, y, z) => {
      if (y < 3) return false;
      const v = cells[x + z * 16 + y * 256];
      return v !== 0 && v !== B.WATER && v !== B.COREPLATE && wetAt(x, z) <= y;
    };

    // worms: may break through the surface (cave mouths)
    forWorms(x0, x0 + 15, z0, z0 + 15, (w) => {
      const p = w.pts;
      for (let i = 0; i < w.steps; i++) {
        const px = p[i * 4], py = p[i * 4 + 1], pz = p[i * 4 + 2], r = p[i * 4 + 3];
        if (px + r < x0 || px - r > x0 + 16 || pz + r < z0 || pz - r > z0 + 16) continue;
        const r2 = r * r;
        for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(126, Math.ceil(py + r)); y++)
          for (let z = Math.max(0, Math.floor(pz - r) - z0); z <= Math.min(15, Math.ceil(pz + r) - z0); z++)
            for (let x = Math.max(0, Math.floor(px - r) - x0); x <= Math.min(15, Math.ceil(px + r) - x0); x++) {
              const dx = x0 + x + 0.5 - px, dy = (y + 0.5 - py) * 1.25, dz = z0 + z + 0.5 - pz;
              if (dx * dx + dy * dy + dz * dz < r2 && canCarve(x, y, z)) cells[x + z * 16 + y * 256] = 0;
            }
      }
    });

    // noise caves under dry land: noodles everywhere, caverns low down
    let maxH = 0, any = false;
    for (let i = 0; i < 256; i++) if (heights[i] >= 34 && waters[i] === 0) { any = true; if (heights[i] > maxH) maxH = heights[i]; }
    if (any) {
      const gyMax = Math.min(32, Math.ceil((maxH - 7) / 4) + 1);
      for (let gy = 0; gy <= gyMax; gy++) for (let gz = 0; gz < 5; gz++) for (let gx = 0; gx < 5; gx++) {
        const wx = x0 + gx * 4, wy = gy * 4, wz = z0 + gz * 4, k = gx + gz * 5 + gy * 25;
        GA[k] = nK1.n3(wx / 36, wy / 20, wz / 36);
        GB[k] = nK2.n3(wx / 36, wy / 20, wz / 36);
        GC[k] = wy < 52 ? nCav.n3(wx / 48, wy / 22, wz / 48) : -1;
      }
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const ci = x + z * 16, h = heights[ci];
        if (h < 34 || waters[ci] !== 0) continue;
        const top = h - 7;
        const gx = x >> 2, fx = (x & 3) / 4, gz = z >> 2, fz = (z & 3) / 4;
        for (let y = 3; y < top; y++) {
          const gy = y >> 2, fy = (y & 3) / 4;
          const a = tri(GA, gx, gy, gz, fx, fy, fz), b = tri(GB, gx, gy, gz, fx, fy, fz);
          let cut = a * a + b * b < (y < 24 ? 0.011 : 0.006);
          if (!cut && y < 48) {
            const sq = (y - 22) / 24;
            cut = tri(GC, gx, gy, gz, fx, fy, fz) > 0.4 + sq * sq * 0.35;
          }
          if (cut && canCarve(x, y, z)) cells[ci + y * 256] = 0;
        }
      }
    }

    // mountain overhangs: notch steep cliff faces below a kept lip
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = x + z * 16, h = heights[ci];
      if (mtn[ci] < 0.3 || slopes[ci] < 3 || h < 50) continue;
      for (let y = h - 14; y < h - 1; y++) {
        const o = nOv.n3((x0 + x) / 16, y / 9, (z0 + z) / 16);
        if (o > 0.42 && canCarve(x, y, z)) cells[ci + y * 256] = 0;
      }
    }

    // cave flora: glowcaps on floors, filament moss hanging from ceilings (light <= 6 keeps caves spawnable)
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = x + z * 16, top = heights[ci] - 5;
      for (let y = 4; y < top; y++) {
        const i = ci + y * 256;
        if (cells[i] !== 0) continue;
        const wx = x0 + x, wz = z0 + z;
        if (SOLID[cells[i - 256]] && cells[i - 256] !== B.WATER) {
          if (rand3(wx, y, wz, S ^ 0xcafe) < 0.045) cells[i] = B.GLOWCAP;
        } else if (SOLID[cells[i + 256]] && rand3(wx, y, wz, S ^ 0xbeef) < 0.03) {
          const len = 1 + (hash3(wx, y, wz, S) % 3);
          for (let k = 0; k < len && y - k >= 4 && cells[i - k * 256] === 0; k++) cells[i - k * 256] = B.FILAMENT_MOSS;
        }
      }
    }
  }

  return { carve, wormNear };
}

function tri(G, gx, gy, gz, fx, fy, fz) {
  const k = gx + gz * 5 + gy * 25;
  const c00 = G[k] + (G[k + 1] - G[k]) * fx, c10 = G[k + 5] + (G[k + 6] - G[k + 5]) * fx;
  const c01 = G[k + 25] + (G[k + 26] - G[k + 25]) * fx, c11 = G[k + 30] + (G[k + 31] - G[k + 30]) * fx;
  const c0 = c00 + (c10 - c00) * fz, c1 = c01 + (c11 - c01) * fz;
  return c0 + (c1 - c0) * fy;
}
