// Collision primitives and the static-triangle broadphase. No allocation in the hot paths:
// results go into the module-level `CP` scratch object.

export const CP = { x: 0, y: 0, z: 0 };

// Closest point on triangle (a,b,c) to p (Ericson, Real-Time Collision Detection 5.1.5).
// t = Float64Array of 9 floats per triangle, o = offset of the triangle.
export function closestOnTri(t, o, px, py, pz) {
  const ax = t[o], ay = t[o + 1], az = t[o + 2];
  const bx = t[o + 3], by = t[o + 4], bz = t[o + 5];
  const cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { CP.x = ax; CP.y = ay; CP.z = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { CP.x = bx; CP.y = by; CP.z = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    CP.x = ax + v * abx; CP.y = ay + v * aby; CP.z = az + v * abz; return;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { CP.x = cx; CP.y = cy; CP.z = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    CP.x = ax + w * acx; CP.y = ay + w * acy; CP.z = az + w * acz; return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    CP.x = bx + w * (cx - bx); CP.y = by + w * (cy - by); CP.z = bz + w * (cz - bz); return;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  CP.x = ax + abx * v + acx * w; CP.y = ay + aby * v + acy * w; CP.z = az + abz * v + acz * w;
}

// Uniform 3D grid over triangle AABBs (expanded by `pad`), so a query only needs the one cell
// containing the ball centre. Cells are keyed by a packed integer in a Map.
export class TriGrid {
  constructor(tris, cell = 0.5, pad = 0.12) {
    this.cell = cell;
    const n = tris.length / 9;
    const tmp = new Map();
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < 9; k += 3) {
        const x = tris[o + k], y = tris[o + k + 1], z = tris[o + k + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      const ix0 = Math.floor((x0 - pad) / cell), ix1 = Math.floor((x1 + pad) / cell);
      const iy0 = Math.floor((y0 - pad) / cell), iy1 = Math.floor((y1 + pad) / cell);
      const iz0 = Math.floor((z0 - pad) / cell), iz1 = Math.floor((z1 + pad) / cell);
      for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
        const k = key(ix, iy, iz);
        let a = tmp.get(k); if (!a) tmp.set(k, a = []);
        a.push(i);
      }
    }
    this.cells = new Map();
    for (const [k, a] of tmp) this.cells.set(k, Int32Array.from(a));
  }
  query(x, y, z) {
    const c = this.cell;
    return this.cells.get(key(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c))) || EMPTY;
  }
}
const EMPTY = new Int32Array(0);
function key(ix, iy, iz) { return ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096); }

// ---------- kinematic shapes ----------
// A kinematic body = pivot + base frame (3 orthonormal axes) rotated about `axis` (unit, world)
// by angle(t) = omega * t + phase. Shapes live in the base frame: boxes {c:[x,y,z], h:[hx,hy,hz]}
// and vertical (local Y) cylinders {c:[x,y,z], r, hh}. Pose is a pure function of time.
export function rotAxis(out, ax, ay, az, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  out[0] = t * ax * ax + c;      out[1] = t * ax * ay - s * az; out[2] = t * ax * az + s * ay;
  out[3] = t * ax * ay + s * az; out[4] = t * ay * ay + c;      out[5] = t * ay * az - s * ax;
  out[6] = t * ax * az - s * ay; out[7] = t * ay * az + s * ax; out[8] = t * az * az + c;
  return out; // row-major 3x3
}
