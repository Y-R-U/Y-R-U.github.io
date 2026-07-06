// A* over the terrain cell grid. Slope raises cost, leylines cut it (×0.55).
// Diagonals allowed only when both orthogonal neighbours are walkable. Paths
// get line-of-sight smoothed. A tiny per-frame budget queue keeps 40 villagers
// from stalling a frame.

import { GRID, CELL } from './config.js';
import { cellToWorld, worldToCell, inIsle } from './terrain.js';

export function createPathfinder(T) {
  // binary min-heap of node indices keyed by f
  const cap = GRID * GRID;
  const gScore = new Float32Array(cap);
  const fScore = new Float32Array(cap);
  const came = new Int32Array(cap);
  const state = new Uint8Array(cap);     // 0 clean 1 open 2 closed
  let stamp = new Int32Array(cap), curStamp = 0;

  const heap = new Int32Array(cap + 1);
  let heapN = 0;
  const less = (a, b) => fScore[a] < fScore[b];
  function push(i) {
    heap[++heapN] = i;
    let c = heapN;
    while (c > 1 && less(heap[c], heap[c >> 1])) { const t = heap[c]; heap[c] = heap[c >> 1]; heap[c >> 1] = t; c >>= 1; }
  }
  function pop() {
    const top = heap[1];
    heap[1] = heap[heapN--];
    let p = 1;
    for (;;) {
      let s = p, l = p * 2, r = l + 1;
      if (l <= heapN && less(heap[l], heap[s])) s = l;
      if (r <= heapN && less(heap[r], heap[s])) s = r;
      if (s === p) break;
      const t = heap[p]; heap[p] = heap[s]; heap[s] = t; p = s;
    }
    return top;
  }

  const idx = (cx, cz) => cx + cz * GRID;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function findCells(sx, sz, tx, tz, relax = false) {
    if (!inIsle(sx, sz) || !inIsle(tx, tz)) return null;
    const walk = relax
      ? (x, z) => inIsle(x, z) && T.isLand(x, z) && T.cellSlope(x, z) < 1.15
      : (x, z) => T.walkable(x, z);
    if (!walk(tx, tz)) {
      // aim at the nearest walkable neighbour of the target
      let best = null, bd = Infinity;
      for (let r = 1; r <= 3 && !best; r++)
        for (const [dx, dz] of DIRS) {
          const nx = tx + dx * r, nz = tz + dz * r;
          if (walk(nx, nz)) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [nx, nz]; } }
        }
      if (!best) return null;
      tx = best[0]; tz = best[1];
    }
    curStamp++;
    heapN = 0;
    const s = idx(sx, sz), t = idx(tx, tz);
    const seen = (i) => stamp[i] === curStamp;
    const open = (i) => { stamp[i] = curStamp; state[i] = 1; };
    gScore[s] = 0;
    fScore[s] = Math.hypot(tx - sx, tz - sz);
    came[s] = -1;
    open(s);
    push(s);
    let iter = 0;
    while (heapN > 0 && iter++ < 5200) {
      const cur = pop();
      if (cur === t) {
        const out = [];
        for (let i = cur; i !== -1; i = came[i]) out.push([i % GRID, (i / GRID) | 0]);
        out.reverse();
        return out;
      }
      state[cur] = 2;
      const cx = cur % GRID, cz = (cur / GRID) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (!walk(nx, nz)) continue;
        if (dx && dz && (!walk(cx + dx, cz) || !walk(cx, cz + dz))) continue;
        const ni = idx(nx, nz);
        if (seen(ni) && state[ni] === 2) continue;
        const step = (dx && dz ? 1.4142 : 1) * T.moveCost(nx, nz);
        const g = gScore[cur] + step;
        if (!seen(ni)) {
          came[ni] = cur; gScore[ni] = g;
          fScore[ni] = g + Math.hypot(tx - nx, tz - nz);
          open(ni); push(ni);
        } else if (g < gScore[ni]) {
          came[ni] = cur; gScore[ni] = g;
          fScore[ni] = g + Math.hypot(tx - nx, tz - nz);
          push(ni);   // lazy decrease-key: duplicate entry is fine
        }
      }
    }
    return null;
  }

  // straight-line walkability sampling for smoothing
  function los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (CELL * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const { cx, cz } = worldToCell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (!T.walkable(cx, cz)) return false;
    }
    return true;
  }

  function find(ax, az, bx, bz, relax = false) {
    const s = worldToCell(ax, az), t = worldToCell(bx, bz);
    const cells = findCells(s.cx, s.cz, t.cx, t.cz, relax);
    if (!cells) return null;
    let pts = cells.map(([cx, cz]) => cellToWorld(cx, cz));
    // only walk to the exact target if it isn't inside a blocked cell
    // (building sites / the fire live on blocked cells — stop adjacent)
    const ec = worldToCell(bx, bz);
    if (T.walkable(ec.cx, ec.cz)) pts.push({ x: bx, z: bz });
    // LoS smoothing
    const out = [{ x: ax, z: az }];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 8);
      for (; j > i + 1; j--)
        if (los(out[out.length - 1].x, out[out.length - 1].z, pts[j].x, pts[j].z)) break;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  // budgeted queue — villagers ask, we answer a batch per frame. `key` dedupes:
  // a new request for the same walker replaces the queued one (stale requests
  // otherwise snowball when the queue runs behind).
  const queue = [];
  return {
    find,                                   // synchronous (god tools, spawns)
    request(ax, az, bx, bz, cb, relax = false, key = null) {
      if (key) {
        const i = queue.findIndex(q => q.key === key);
        if (i >= 0) queue.splice(i, 1);
      }
      queue.push({ ax, az, bx, bz, cb, relax, key });
    },
    tick() {
      for (let n = 0; n < 14 && queue.length; n++) {
        const q = queue.shift();
        q.cb(find(q.ax, q.az, q.bx, q.bz, q.relax));
      }
    },
    queueLen: () => queue.length,
  };
}
