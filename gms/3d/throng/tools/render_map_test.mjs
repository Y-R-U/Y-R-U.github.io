// node tools/render_map_test.mjs [seeds=200]
import { generateMap } from '../js/world/map.js';

const SEEDS = +(process.argv[2] || 200);
let fails = 0;
const fail = (seed, msg) => { fails++; console.log(`seed ${seed}: FAIL ${msg}`); };

function flood(map, step) {
  const H = map.size / 2, n = Math.ceil(map.size / step);
  const idx = (x, z) => Math.floor((z + H) / step) * n + Math.floor((x + H) / step);
  const walk = new Uint8Array(n * n), seen = new Uint8Array(n * n);
  let total = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (map.walkable(-H + (i + 0.5) * step, -H + (j + 0.5) * step)) { walk[j * n + i] = 1; total++; }
  }
  const s0 = map.spawns[0];
  const q = [idx(s0.x, s0.z)];
  seen[q[0]] = 1;
  let reached = 0;
  while (q.length) {
    const c = q.pop(); reached++;
    const i = c % n, j = (c / n) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const k = b * n + a;
      if (walk[k] && !seen[k]) { seen[k] = 1; q.push(k); }
    }
  }
  return { total, reached, seen, idx };
}

let minSpawnGap = Infinity, minStreet = Infinity, maxObs = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const m = generateMap(seed);
  if (process.env.BREAK) { const w = m.walkable; m.walkable = (x, z) => w(x, z) && Math.abs(x - 30) > 1; }
  if (m.size !== 240) fail(seed, 'size');
  if (m.spawns.length < 12) fail(seed, `only ${m.spawns.length} spawns`);
  if (m.obstacles.length >= 150) fail(seed, `${m.obstacles.length} obstacles`);
  maxObs = Math.max(maxObs, m.obstacles.length);
  if (m.plazas.length < 4) fail(seed, `${m.plazas.length} plazas`);
  for (const r of [...m.roadsX, ...m.roadsZ]) minStreet = Math.min(minStreet, r.w);
  for (let a = 0; a < m.spawns.length; a++) for (let b = a + 1; b < m.spawns.length; b++) {
    minSpawnGap = Math.min(minSpawnGap, Math.hypot(m.spawns[a].x - m.spawns[b].x, m.spawns[a].z - m.spawns[b].z));
  }
  for (const s of m.spawns) {
    for (let k = 0; k < 8; k++) {
      const an = k * Math.PI / 4;
      if (!m.walkable(s.x + Math.cos(an) * 3, s.z + Math.sin(an) * 3)) fail(seed, `spawn ${s.x},${s.z} not clear`);
    }
  }
  const H = m.size / 2;
  for (const [x, z] of [[-H + 1, 0], [H - 1, 0], [0, -H + 1], [0, H - 1], [H + 5, 0], [0, -H - 5]]) {
    if (m.walkable(x, z)) fail(seed, `perimeter open at ${x},${z}`);
  }
  const f = flood(m, 1);
  for (const s of m.spawns) if (!f.seen[f.idx(s.x, s.z)]) fail(seed, `spawn ${s.x.toFixed(1)},${s.z.toFixed(1)} unreachable`);
  if (f.reached / f.total < 0.995) fail(seed, `only ${(100 * f.reached / f.total).toFixed(1)}% of walkable reached`);
  const tmp = {};
  let stuck = 0, inside = 0;
  for (let k = 0; k < 600; k++) {
    const x = (Math.random() - 0.5) * 200, z = (Math.random() - 0.5) * 200;
    if (m.walkable(x, z)) continue;
    inside++;
    m.pushOut(x, z, 0.05, tmp);
    if (!m.walkable(tmp.x, tmp.z)) stuck++;
  }
  if (stuck > inside * 0.02) fail(seed, `pushOut left ${stuck}/${inside} points inside`);
}
console.log(`${SEEDS} seeds · min spawn gap ${minSpawnGap.toFixed(1)} m · min street ${minStreet.toFixed(1)} m (+3 m sidewalk each side) · max obstacles ${maxObs}`);
if (minSpawnGap < 30) fail('-', `spawns too close: ${minSpawnGap.toFixed(1)}`);
if (minStreet < 14) fail('-', `street ${minStreet.toFixed(1)} < 14`);
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
process.exit(fails ? 1 : 0);
