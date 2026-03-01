// ===== A* Pathfinder for the tile grid =====
// Works on any object with isWalkable(x, y) and .width / .height.
// Returns an array of {x, y} tile-centre waypoints, or null if no path.

function heuristic(ax, ay, bx, by) {
  // Manhattan distance — matches 4-directional movement
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/**
 * findPath(map, sx, sy, gx, gy, maxNodes)
 *  sx/sy  — start position (float tile coords, will be floored)
 *  gx/gy  — goal position  (float tile coords, will be floored)
 *  maxNodes — bail out after this many nodes to keep it real-time safe
 */
export function findPath(map, sx, sy, gx, gy, maxNodes = 8000) {
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  gx = Math.floor(gx);
  gy = Math.floor(gy);

  const W = map.width;
  const H = map.height;

  // Clamp goal to map bounds
  gx = Math.max(0, Math.min(W - 1, gx));
  gy = Math.max(0, Math.min(H - 1, gy));

  // If goal tile is not walkable, find nearest walkable tile within radius 3
  if (!map.isWalkable(gx, gy)) {
    let found = null, bestDist = Infinity;
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // shell only
          const nx = gx + dx, ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (map.isWalkable(nx, ny)) {
            const d = Math.abs(dx) + Math.abs(dy);
            if (d < bestDist) { bestDist = d; found = { x: nx, y: ny }; }
          }
        }
      }
      if (found) break;
    }
    if (!found) return null;
    gx = found.x;
    gy = found.y;
  }

  if (sx === gx && sy === gy) return []; // Already there

  const idx = (x, y) => y * W + x;
  const size = W * H;

  const gScore  = new Float32Array(size).fill(Infinity);
  const parent  = new Int32Array(size).fill(-1);
  const closed  = new Uint8Array(size);

  const startIdx = idx(sx, sy);
  const goalIdx  = idx(gx, gy);

  gScore[startIdx] = 0;

  // Open set: array of {i, f} — linear-scan min is fine for 80×80 grid
  const open = [{ i: startIdx, f: heuristic(sx, sy, gx, gy) }];

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  let iterations = 0;

  while (open.length > 0) {
    if (++iterations > maxNodes) return null; // bail — no real-time safe path

    // Pop node with lowest f
    let bestPos = 0;
    for (let k = 1; k < open.length; k++) {
      if (open[k].f < open[bestPos].f) bestPos = k;
    }
    const { i: ci } = open.splice(bestPos, 1)[0];

    if (closed[ci]) continue;
    closed[ci] = 1;

    if (ci === goalIdx) {
      // Reconstruct path from goal back to start
      const path = [];
      let cur = ci;
      while (cur !== startIdx && cur !== -1) {
        const cx = cur % W;
        const cy = Math.floor(cur / W);
        path.unshift({ x: cx + 0.5, y: cy + 0.5 });
        cur = parent[cur];
      }
      return path.length > 0 ? path : null;
    }

    const cx = ci % W;
    const cy = Math.floor(ci / W);
    const cg = gScore[ci];

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!map.isWalkable(nx, ny)) continue;

      const ni = idx(nx, ny);
      if (closed[ni]) continue;

      const ng = cg + 1;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        parent[ni] = ci;
        open.push({ i: ni, f: ng + heuristic(nx, ny, gx, gy) });
      }
    }
  }

  return null; // No path found
}

/**
 * Smooth the path by removing collinear middle waypoints.
 * Keeps corners but strips unnecessary in-between points on straight runs.
 */
export function smoothPath(path) {
  if (!path || path.length <= 2) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = path[i];
    const next = path[i + 1];
    // Keep point only if it's a turn
    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
    if (dx1 !== dx2 || dy1 !== dy2) out.push(curr);
  }
  out.push(path[path.length - 1]);
  return out;
}
