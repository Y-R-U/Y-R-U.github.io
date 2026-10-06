// Quadric-error edge-collapse decimation for closed triangle meshes. Pure JS.
// decimate(pos:Float32Array, idx:Uint32Array, targetTris) -> {pos, idx}

class Heap {
  constructor() { this.c = []; this.d = []; }
  push(cost, data) {
    const c = this.c, d = this.d; let i = c.length; c.push(cost); d.push(data);
    while (i > 0) { const p = (i - 1) >> 1; if (c[p] <= c[i]) break; [c[p], c[i]] = [c[i], c[p]]; [d[p], d[i]] = [d[i], d[p]]; i = p; }
  }
  pop() {
    const c = this.c, d = this.d; const top = d[0]; const lc = c.pop(), ld = d.pop();
    if (c.length) {
      c[0] = lc; d[0] = ld; let i = 0; const n = c.length;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && c[l] < c[m]) m = l; if (r < n && c[r] < c[m]) m = r; if (m === i) break; [c[m], c[i]] = [c[i], c[m]]; [d[m], d[i]] = [d[i], d[m]]; i = m; }
    }
    return top;
  }
  get size() { return this.c.length; }
}

export function decimate(pos0, idx0, targetTris, { edgePenalty = 0.0 } = {}) {
  const nv = pos0.length / 3;
  const P = Float64Array.from(pos0);
  const F = Int32Array.from(idx0);
  const nf = F.length / 3;
  const alive = new Uint8Array(nf).fill(1);
  const vf = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) vf[F[f * 3 + k]].push(f);
  const Q = new Float64Array(nv * 10);
  const ver = new Int32Array(nv);
  const dead = new Uint8Array(nv);

  const faceNormal = (f, out) => {
    const a = F[f * 3] * 3, b = F[f * 3 + 1] * 3, c = F[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return Math.hypot(out[0], out[1], out[2]);
  };
  const n = [0, 0, 0];
  for (let f = 0; f < nf; f++) {
    const area2 = faceNormal(f, n); if (!area2) continue;
    const a = n[0] / area2, b = n[1] / area2, c = n[2] / area2;
    const v0 = F[f * 3] * 3;
    const d = -(a * P[v0] + b * P[v0 + 1] + c * P[v0 + 2]);
    const w = area2 * 0.5;
    const q = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    for (let k = 0; k < 3; k++) { const v = F[f * 3 + k]; for (let i = 0; i < 10; i++) Q[v * 10 + i] += q[i] * w; }
  }
  const qerr = (a, b, x, y, z) => {
    const q = (i) => Q[a * 10 + i] + Q[b * 10 + i];
    return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9);
  };
  const heap = new Heap();
  const pushEdge = (a, b) => {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
    const cands = [[ax, ay, az], [bx, by, bz], [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]];
    let best = 1e30, bi = 0;
    for (let i = 0; i < 3; i++) { const e = qerr(a, b, ...cands[i]); if (e < best) { best = e; bi = i; } }
    const L2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
    heap.push(best + edgePenalty * L2, [a, b, ver[a], ver[b], cands[bi]]);
  };
  const neigh = (v) => { const s = new Set(); for (const f of vf[v]) if (alive[f]) for (let k = 0; k < 3; k++) { const u = F[f * 3 + k]; if (u !== v) s.add(u); } return s; };
  for (let v = 0; v < nv; v++) for (const u of neigh(v)) if (u > v) pushEdge(v, u);

  let faces = nf;
  const n0 = [0, 0, 0], n1 = [0, 0, 0];
  while (faces > targetTris && heap.size) {
    const [a, b, va, vb, t] = heap.pop();
    if (dead[a] || dead[b] || ver[a] !== va || ver[b] !== vb) continue;
    const na = neigh(a), nb = neigh(b);
    if (!na.has(b)) continue;
    let shared = 0; for (const u of na) if (nb.has(u)) shared++;
    if (shared !== 2) continue;
    // flip check
    const old = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2]];
    let ok = true;
    for (const v of [a, b]) {
      for (const f of vf[v]) {
        if (!alive[f]) continue;
        let hasA = false, hasB = false;
        for (let k = 0; k < 3; k++) { if (F[f * 3 + k] === a) hasA = true; if (F[f * 3 + k] === b) hasB = true; }
        if (hasA && hasB) continue;
        const l0 = faceNormal(f, n0);
        P[a * 3] = t[0]; P[a * 3 + 1] = t[1]; P[a * 3 + 2] = t[2]; P[b * 3] = t[0]; P[b * 3 + 1] = t[1]; P[b * 3 + 2] = t[2];
        const l1 = faceNormal(f, n1);
        P[a * 3] = old[0]; P[a * 3 + 1] = old[1]; P[a * 3 + 2] = old[2]; P[b * 3] = old[3]; P[b * 3 + 1] = old[4]; P[b * 3 + 2] = old[5];
        if (!l1 || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1) < 0.25) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) { ver[a]++; ver[b]++; pushEdge(a, b); ver[a]--; ver[b]--; /* retry later at higher cost? skip */ continue; }
    P[a * 3] = t[0]; P[a * 3 + 1] = t[1]; P[a * 3 + 2] = t[2];
    for (const f of vf[b]) {
      if (!alive[f]) continue;
      let hasA = false;
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === a) hasA = true;
      if (hasA) { alive[f] = 0; faces--; continue; }
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === b) F[f * 3 + k] = a;
      vf[a].push(f);
    }
    vf[a] = vf[a].filter((f) => alive[f]);
    dead[b] = 1;
    for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
    ver[a]++;
    for (const u of neigh(a)) pushEdge(a, u);
  }
  const remap = new Int32Array(nv).fill(-1);
  const outP = [], outI = [];
  for (let f = 0; f < nf; f++) {
    if (!alive[f]) continue;
    for (let k = 0; k < 3; k++) {
      const v = F[f * 3 + k];
      if (remap[v] < 0) { remap[v] = outP.length / 3; outP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
      outI.push(remap[v]);
    }
  }
  return { pos: new Float32Array(outP), idx: new Uint32Array(outI) };
}
