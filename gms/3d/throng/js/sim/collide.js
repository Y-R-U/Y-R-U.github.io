const MARGIN = 2.2;

export function createCollider(map, cellSize = 8) {
  const size = map.size, half = size / 2;
  const n = Math.ceil(size / cellSize);
  const cells = Array.from({ length: n * n }, () => []);
  const obs = map.obstacles;
  const cellOf = (v) => Math.min(n - 1, Math.max(0, Math.floor((v + half) / cellSize)));

  obs.forEach((o, i) => {
    const ex = (o.type === 'rect' ? o.w / 2 : o.r) + MARGIN;
    const ez = (o.type === 'rect' ? o.d / 2 : o.r) + MARGIN;
    const x0 = cellOf(o.x - ex), x1 = cellOf(o.x + ex), z0 = cellOf(o.z - ez), z1 = cellOf(o.z + ez);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) cells[cz * n + cx].push(i);
  });

  function distTo(o, x, z) {
    if (o.type === 'rect') {
      const dx = Math.max(Math.abs(x - o.x) - o.w / 2, 0);
      const dz = Math.max(Math.abs(z - o.z) - o.d / 2, 0);
      if (dx === 0 && dz === 0) return -1;
      return Math.sqrt(dx * dx + dz * dz);
    }
    return Math.sqrt((x - o.x) ** 2 + (z - o.z) ** 2) - o.r;
  }

  function blocked(x, z, pad = 0) {
    if (x < -half + pad || x > half - pad || z < -half + pad || z > half - pad) return true;
    const list = cells[cellOf(z) * n + cellOf(x)];
    for (let k = 0; k < list.length; k++) if (distTo(obs[list[k]], x, z) < pad) return true;
    return false;
  }

  // Resolves p (mutated) out of obstacles and bounds. Returns true if it was pushed.
  function pushOut(p, r) {
    let hit = false;
    const lim = half - r;
    if (p.x < -lim) { p.x = -lim; hit = true; } else if (p.x > lim) { p.x = lim; hit = true; }
    if (p.z < -lim) { p.z = -lim; hit = true; } else if (p.z > lim) { p.z = lim; hit = true; }
    for (let iter = 0; iter < 2; iter++) {
      const list = cells[cellOf(p.z) * n + cellOf(p.x)];
      let moved = false;
      for (let k = 0; k < list.length; k++) {
        const o = obs[list[k]];
        if (o.type === 'rect') {
          const hw = o.w / 2, hd = o.d / 2;
          const qx = Math.min(Math.max(p.x, o.x - hw), o.x + hw);
          const qz = Math.min(Math.max(p.z, o.z - hd), o.z + hd);
          const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            p.x = qx + dx / d * r; p.z = qz + dz / d * r;
          } else {
            const l = p.x - (o.x - hw), rr = o.x + hw - p.x, b = p.z - (o.z - hd), t = o.z + hd - p.z;
            const m = Math.min(l, rr, b, t);
            if (m === l) p.x = o.x - hw - r; else if (m === rr) p.x = o.x + hw + r;
            else if (m === b) p.z = o.z - hd - r; else p.z = o.z + hd + r;
          }
          moved = true;
        } else {
          const dx = p.x - o.x, dz = p.z - o.z, d2 = dx * dx + dz * dz, rr = o.r + r;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-6;
          p.x = o.x + (d2 > 1e-12 ? dx / d : 1) * rr; p.z = o.z + (d2 > 1e-12 ? dz / d : 0) * rr;
          moved = true;
        }
      }
      if (!moved) break;
      hit = true;
    }
    return hit;
  }

  function segmentClear(x0, z0, x1, z1, pad = 0, step = 1.5) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz);
    const k = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i <= k; i++) if (blocked(x0 + dx * i / k, z0 + dz * i / k, pad)) return false;
    return true;
  }

  return { blocked, pushOut, segmentClear, distTo, half, size };
}
