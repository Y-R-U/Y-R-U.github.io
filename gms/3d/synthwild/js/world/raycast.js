// Amanatides-Woo DDA on the 0.25 fine grid.
import { BLOCKS } from '../data/blocks.js';

const LIQ = new Uint8Array(256), PLANT = new Uint8Array(256);
for (const b of BLOCKS) if (b) { LIQ[b.id] = b.liquid ? 1 : 0; PLANT[b.id] = b.plant ? 1 : 0; }

// opts: { liquids:false, plants:true }
export function raycast(world, origin, dir, maxDist = 8, opts = {}) {
  const ox = origin.x ?? origin[0], oy = origin.y ?? origin[1], oz = origin.z ?? origin[2];
  let dx = dir.x ?? dir[0], dy = dir.y ?? dir[1], dz = dir.z ?? dir[2];
  const len = Math.hypot(dx, dy, dz);
  if (!len) return null;
  dx /= len; dy /= len; dz /= len;
  const liquids = !!opts.liquids, plants = opts.plants !== false;
  const px = ox * 4, py = oy * 4, pz = oz * 4;
  let ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0, sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
  let tmx = sx ? ((sx > 0 ? ix + 1 - px : px - ix) * tdx) : Infinity;
  let tmy = sy ? ((sy > 0 ? iy + 1 - py : py - iy) * tdy) : Infinity;
  let tmz = sz ? ((sz > 0 ? iz + 1 - pz : pz - iz) * tdz) : Infinity;
  const tMax = maxDist * 4;
  let t = 0, nx = 0, ny = 0, nz = 0;
  for (let guard = 0; guard < 4096; guard++) {
    if (iy >= 0 && iy < 512) {
      const m = world.getSub(ix, iy, iz);
      if (m !== 0 && (liquids || !LIQ[m]) && (plants || !PLANT[m])) {
        const d = t / 4;
        return { sub: [ix, iy, iz], normal: [nx, ny, nz], mat: m, dist: d, point: [ox + dx * d, oy + dy * d, oz + dz * d] };
      }
    } else if (iy < 0 && sy <= 0) return null;
    else if (iy >= 512 && sy >= 0) return null;
    if (tmx < tmy && tmx < tmz) { t = tmx; ix += sx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { t = tmy; iy += sy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { t = tmz; iz += sz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    if (t > tMax) return null;
  }
  return null;
}
