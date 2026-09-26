// Coarse walk grid over the district (1 m cells from world.blocked) + A* with string-pulling.
export function createNav(world, { cell = 1, radius = 0.45 } = {}) {
  const b = world.district.bounds;
  const x0 = b.x0, z0 = b.z0;
  const W = Math.ceil((b.x1 - b.x0) / cell), H = Math.ceil((b.z1 - b.z0) / cell);
  const grid = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) grid[j * W + i] = world.blocked(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell, radius) ? 1 : 0;
  const ci = (x) => Math.floor((x - x0) / cell), cj = (z) => Math.floor((z - z0) / cell);
  const ok = (i, j) => i >= 0 && j >= 0 && i < W && j < H && !grid[j * W + i];
  const cx = (i) => x0 + (i + 0.5) * cell, cz = (j) => z0 + (j + 0.5) * cell;

  function nearestOpen(i, j) {
    if (ok(i, j)) return [i, j];
    for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && ok(i + di, j + dj)) return [i + di, j + dj];
    return null;
  }

  // grid line of sight (supercover-ish sampling)
  function los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (cell * 0.35));
    for (let k = 1; k < n; k++) { const u = k / n; if (!ok(ci(ax + (bx - ax) * u), cj(az + (bz - az) * u))) return false; }
    return true;
  }

  const g = new Float32Array(W * H), came = new Int32Array(W * H), closed = new Uint8Array(W * H);
  function route(from, to, maxIter = 40000) {
    if (los(from.x, from.z, to.x, to.z)) return [{ x: to.x, z: to.z }];
    const s = nearestOpen(ci(from.x), cj(from.z)), t = nearestOpen(ci(to.x), cj(to.z));
    if (!s || !t) return null;
    g.fill(Infinity); came.fill(-1); closed.fill(0);
    const heap = [];
    const push = (id, f) => { heap.push([f, id]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const sid = s[1] * W + s[0], tid = t[1] * W + t[0];
    const hh = (i, j) => { const dx = Math.abs(i - t[0]), dy = Math.abs(j - t[1]); return dx + dy - 0.586 * Math.min(dx, dy); };
    g[sid] = 0; push(sid, hh(s[0], s[1]));
    let it = 0, found = false;
    while (heap.length && it++ < maxIter) {
      const [, id] = pop();
      if (closed[id]) continue;
      closed[id] = 1;
      if (id === tid) { found = true; break; }
      const i = id % W, j = (id / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!ok(ni, nj) || (di && dj && (!ok(i + di, j) || !ok(i, j + dj)))) continue;
        const nid = nj * W + ni;
        const ng = g[id] + (di && dj ? 1.414 : 1);
        if (ng < g[nid]) { g[nid] = ng; came[nid] = id; push(nid, ng + hh(ni, nj)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let id = tid; id !== -1; id = came[id]) cells.push({ x: cx(id % W), z: cz((id / W) | 0) });
    cells.reverse();
    cells[cells.length - 1] = { x: to.x, z: to.z };
    // string-pull
    const out = [];
    let a = { x: from.x, z: from.z }, k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) if (los(a.x, a.z, cells[m].x, cells[m].z)) { far = m; break; }
      out.push(cells[far]); a = cells[far]; k = far + 1;
    }
    return out;
  }

  return { route, los, blocked: (x, z) => !ok(ci(x), cj(z)), W, H, grid };
}
