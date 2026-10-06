// Surface-nets mesher for an SDF + relax/project passes. Pure JS (node + browser).
// mesh(f, bmin, bmax, h, {relax}) -> {pos:Float32Array, idx:Uint32Array}

export function surfaceNets(f, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz);
  const p = [0, 0, 0];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    p[0] = bmin[0] + i * h; p[1] = bmin[1] + j * h; p[2] = bmin[2] + k * h;
    val[i + nx * (j + ny * k)] = f(p);
  }
  const V = (i, j, k) => val[i + nx * (j + ny * k)];
  const cellIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const C = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { const o = corners[c]; cv[c] = V(i + o[0], j + o[1], k + o[2]); if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      const A = corners[a], B = corners[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    cellIdx[C(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / n) * h, bmin[1] + (j + sy / n) * h, bmin[2] + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = V(i, j, k), b = V(i + 1, j, k);
    if ((a < 0) === (b < 0)) continue;
    quad(cellIdx[C(i, j - 1, k - 1)], cellIdx[C(i, j, k - 1)], cellIdx[C(i, j, k)], cellIdx[C(i, j - 1, k)], a < 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = V(i, j, k), b = V(i, j + 1, k);
    if ((a < 0) === (b < 0)) continue;
    quad(cellIdx[C(i - 1, j, k - 1)], cellIdx[C(i - 1, j, k)], cellIdx[C(i, j, k)], cellIdx[C(i, j, k - 1)], a < 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = V(i, j, k), b = V(i, j, k + 1);
    if ((a < 0) === (b < 0)) continue;
    quad(cellIdx[C(i - 1, j - 1, k)], cellIdx[C(i, j - 1, k)], cellIdx[C(i, j, k)], cellIdx[C(i - 1, j, k)], a < 0);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

export function neighbours(nv, idx) {
  const sets = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
  }
  return sets.map((s) => Int32Array.from(s));
}

// Newton projection of every vertex onto f=0
export function project(f, pos, iters = 3, e = 0.0004) {
  const p = [0, 0, 0];
  for (let v = 0; v < pos.length; v += 3) {
    for (let it = 0; it < iters; it++) {
      p[0] = pos[v]; p[1] = pos[v + 1]; p[2] = pos[v + 2];
      const d = f(p);
      if (Math.abs(d) < 1e-6) break;
      const gx = (f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]])) / (2 * e);
      const gy = (f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]])) / (2 * e);
      const gz = (f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e])) / (2 * e);
      const g2 = gx * gx + gy * gy + gz * gz || 1;
      pos[v] -= d * gx / g2; pos[v + 1] -= d * gy / g2; pos[v + 2] -= d * gz / g2;
    }
  }
}

// tangential relaxation: move toward neighbour centroid, then caller re-projects
export function relax(pos, nb, amount = 0.5, iters = 2) {
  const tmp = new Float32Array(pos.length);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < nb.length; v++) {
      const n = nb[v];
      if (!n.length) { tmp[v * 3] = pos[v * 3]; tmp[v * 3 + 1] = pos[v * 3 + 1]; tmp[v * 3 + 2] = pos[v * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (let q = 0; q < n.length; q++) { x += pos[n[q] * 3]; y += pos[n[q] * 3 + 1]; z += pos[n[q] * 3 + 2]; }
      x /= n.length; y /= n.length; z /= n.length;
      tmp[v * 3] = pos[v * 3] + (x - pos[v * 3]) * amount;
      tmp[v * 3 + 1] = pos[v * 3 + 1] + (y - pos[v * 3 + 1]) * amount;
      tmp[v * 3 + 2] = pos[v * 3 + 2] + (z - pos[v * 3 + 2]) * amount;
    }
    pos.set(tmp);
  }
}

// smooth a per-vertex attribute (stride s) over the mesh graph
export function smoothAttr(arr, s, nb, amount = 0.5, iters = 2) {
  const tmp = new Float32Array(arr.length);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < nb.length; v++) {
      const n = nb[v];
      for (let c = 0; c < s; c++) {
        let a = 0;
        for (let q = 0; q < n.length; q++) a += arr[n[q] * s + c];
        a = n.length ? a / n.length : arr[v * s + c];
        tmp[v * s + c] = arr[v * s + c] + (a - arr[v * s + c]) * amount;
      }
    }
    arr.set(tmp);
  }
}

export function sdfMesh(f, bmin, bmax, h, { relaxIters = 3 } = {}) {
  const m = surfaceNets(f, bmin, bmax, h);
  const nb = neighbours(m.pos.length / 3, m.idx);
  project(f, m.pos, 4);
  for (let i = 0; i < relaxIters; i++) { relax(m.pos, nb, 0.5, 1); project(f, m.pos, 3); }
  return { ...m, nb };
}
