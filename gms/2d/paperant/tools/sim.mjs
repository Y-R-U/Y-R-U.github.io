// Node vm harness: level geometry validator + bot solvability under the ink rules.
// usage: node tools/sim.mjs [mode=new|old|inf] [trials] [orient=portrait|landscape] [levels e.g. 1-100]
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const DIR = new URL('../js/', import.meta.url).pathname;
const mode = process.argv[2] || 'new';
const TRIALS = +(process.argv[3] || 10);
const orient = process.argv[4] || 'portrait';
const [L0, L1] = (process.argv[5] || '1-100').split('-').map(Number);

const AREA = orient === 'portrait' ? { x: 47, y: 88, w: 335, h: 692 } : { x: 72, y: 52, w: 520, h: 274 };
const ctx = vm.createContext({ console, Math, performance: { now: () => 0 } });
vm.runInContext(`
const Renderer = { getPlayArea: () => (${JSON.stringify(AREA)}), toCanvas: (fx, fy) => ({ x: ${AREA.x} + fx * ${AREA.w}, y: ${AREA.y} + fy * ${AREA.h} }), getDpr: () => 1 };
const GameAudio = { SFX: new Proxy({}, { get: () => () => {} }), vibrate() {} };
const Input = { isDrawing: false, get pointCount() { return 0; } };
const UI = { flashInkEmpty() {} };
`, ctx);
for (const f of ['config.js', 'levels-ext.js', 'ant.js', 'drawing.js']) vm.runInContext(readFileSync(DIR + f, 'utf8'), ctx, { filename: f });
const [LEVELS, CONFIG, AntSystem, Drawing] = vm.runInContext('[LEVELS, CONFIG, AntSystem, Drawing]', ctx);

// ---- geometry validation ----
let geoBad = 0;
for (const L of LEVELS) {
  const problems = [];
  const sweep = (o) => ({ x0: o.x - Math.abs(o.moveX || 0), x1: o.x + o.w + Math.abs(o.moveX || 0), y0: o.y - Math.abs(o.moveY || 0), y1: o.y + o.h + Math.abs(o.moveY || 0) });
  const pts = [...L.goals.map(g => ['goal', g]), ...L.ants.map(a => ['ant', a])];
  for (const [k, p] of pts) {
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) problems.push(`${k} out of area ${p.x},${p.y}`);
    for (const o of L.obstacles) {
      const s = sweep(o), px = p.x * AREA.w, py = p.y * AREA.h, r = 14;
      if (px + r > s.x0 * AREA.w && px - r < s.x1 * AREA.w && py + r > s.y0 * AREA.h && py - r < s.y1 * AREA.h) problems.push(`${k} (${p.x},${p.y}) overlaps obstacle sweep`);
    }
  }
  if (problems.length) { geoBad++; console.log(`GEO L${L.id}: ${problems.join('; ')}`); }
}
// ---- early-path check: straight-line ant for the first EARLY_S seconds vs MOVING obstacles at their live positions ----
const EARLY_S = +(process.env.EARLY_S || 1.5), EARLY_PX = +(process.env.EARLY_PX || 2 * CONFIG.ANT_SIZE);
let earlyBad = 0;
for (const L of LEVELS) {
  const hits = [];
  L.ants.forEach((a, ai) => {
    const m = CONFIG.ANT_SIZE * 0.8 + 2;
    for (let t = 0; t <= EARLY_S; t += 1 / 60) {
      const px = a.x * AREA.w + Math.cos(a.angle || 0) * L.antSpeed * 60 * t, py = a.y * AREA.h + Math.sin(a.angle || 0) * L.antSpeed * 60 * t;
      const o = L.obstacles.find(o => {
        if (!o.moveX && !o.moveY) return false;
        const k = t * Math.PI * 2 / (o.period || 4) + (o.phase || 0);
        const ox = (o.x + (o.moveX ? Math.sin(k) * o.moveX : 0)) * AREA.w, oy = (o.y + (o.moveY ? Math.sin(k) * o.moveY : 0)) * AREA.h;
        return px + m > ox && px - m < ox + o.w * AREA.w && py + m > oy && py - m < oy + o.h * AREA.h;
      });
      if (o) { const d = L.antSpeed * 60 * t; if (d < EARLY_PX) hits.push(`ant${ai} (${a.x},${a.y}) meets moving obstacle after ${d.toFixed(0)}px (${t.toFixed(2)}s)`); break; }
    }
  });
  if (hits.length) { earlyBad++; console.log(`EARLY L${L.id}: ${hits.join('; ')}`); }
}
console.log(`early path: ${LEVELS.length - earlyBad}/${LEVELS.length} levels clean (${orient}, moving obstacle within ${EARLY_PX}px of travel)`);
console.log(`geometry: ${LEVELS.length - geoBad}/${LEVELS.length} levels clean (${orient})`);

// ---- bot ----
// BFS over a coarse grid around inflated obstacles; returns path length and a waypoint ~70px along it
const CELL = 10, GW = Math.ceil(AREA.w / CELL), GH = Math.ceil(AREA.h / CELL);
function pathDist(obstacles, ant, goal) {
  const blocked = new Uint8Array(GW * GH), m = 12;
  for (const o of obstacles) {
    const x0 = Math.max(0, Math.floor((o.x * AREA.w - m) / CELL)), x1 = Math.min(GW - 1, Math.floor((o.x * AREA.w + o.w * AREA.w + m) / CELL));
    const y0 = Math.max(0, Math.floor((o.y * AREA.h - m) / CELL)), y1 = Math.min(GH - 1, Math.floor((o.y * AREA.h + o.h * AREA.h + m) / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * GW + x] = 1;
  }
  const cell = (px, py) => { const x = Math.max(0, Math.min(GW - 1, Math.floor((px - AREA.x) / CELL))), y = Math.max(0, Math.min(GH - 1, Math.floor((py - AREA.y) / CELL))); return y * GW + x; };
  const s = cell(ant.cx, ant.cy), g = cell(goal.x, goal.y);
  blocked[s] = 0; blocked[g] = 0;
  const prev = new Int32Array(GW * GH).fill(-1); prev[s] = s;
  const q = [s];
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]; if (c === g) break;
    const cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx; if (blocked[n] || prev[n] >= 0) continue;
      if (dx && dy && (blocked[cy * GW + nx] || blocked[ny * GW + cx])) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (prev[g] < 0) return { len: Math.hypot(goal.x - ant.cx, goal.y - ant.cy) * 3, way: goal };
  const path = []; for (let c = g; c !== s; c = prev[c]) path.push(c); path.reverse();
  const ctr = (c) => ({ x: AREA.x + (c % GW + 0.5) * CELL, y: AREA.y + (((c / GW) | 0) + 0.5) * CELL });
  let way = goal;
  for (const c of path) { const p = ctr(c); if (Math.hypot(p.x - ant.cx, p.y - ant.cy) >= 70) { way = p; break; } }
  if (path.length * CELL < 70) way = goal;
  return { len: path.length * CELL, way };
}
const OLD = { MAX: 1.25, REGEN: 0.1, START: 0.5, SPEED: 300 }; // old time-based rule, 300 css px/s drawing
function runLevel(L, seed) {
  let s = seed * 9301 + 49297;
  Math.random = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  Drawing.init(); Drawing.setDpr(1);
  let oldInk = OLD.MAX;
  const ants = L.ants.map(d => { const a = AntSystem.createAnt(d, 1); a.targetSpeed = a.baseSpeed = L.antSpeed; a.cool = 0; return a; });
  const goals = L.goals.map(g => ({ ...g, collected: false }));
  const obstacles = L.obstacles.map(o => ({ ...o, baseX: o.x, baseY: o.y }));
  const dt = 1 / 60; let t = 0, inkUsed = 0, strokes = 0;
  while (t < L.timeLimit) {
    t += dt;
    for (const o of obstacles) if (o.moveX || o.moveY) { const k = t * Math.PI * 2 / (o.period || 4) + (o.phase || 0); if (o.moveX) o.x = o.baseX + Math.sin(k) * o.moveX; if (o.moveY) o.y = o.baseY + Math.sin(k) * o.moveY; }
    Drawing.update(dt);
    oldInk = Math.min(OLD.MAX, oldInk + OLD.REGEN * dt);
    for (const ant of ants) {
      ant.cool -= dt;
      const elig = goals.filter(g => !g.collected && !(g.order > 1 && goals.some(h => h.order === g.order - 1 && !h.collected)));
      if (!elig.length || ant.cool > 0) continue;
      let best = null, bd = 1e9;
      for (const g of elig) { const p = ({ x: AREA.x + g.x * AREA.w, y: AREA.y + g.y * AREA.h }); const d = pathDist(obstacles, ant, p); if (d.len < bd) { bd = d.len; best = d.way; } }
      if (!best) continue;
      bd = Math.hypot(best.x - ant.cx, best.y - ant.cy) || 1;
      const gx = (best.x - ant.cx) / bd, gy = (best.y - ant.cy) / bd;
      const vx = Math.cos(ant.angle), vy = Math.sin(ant.angle);
      const dot = gx * vx + gy * vy;
      if (dot > Math.cos(+(process.env.CONE || 0.35))) continue;
      // desired normal: toward goal but facing back against travel
      let nx = gx, ny = gy;
      if (dot > -0.1) { const k = dot + 0.35; nx = gx - k * vx; ny = gy - k * vy; const n = Math.hypot(nx, ny); nx /= n; ny /= n; }
      const ahead = +(process.env.AHEAD || 28), half = +(process.env.HALF || 25);
      const cx = ant.cx + vx * ahead, cy = ant.cy + vy * ahead;
      const tx = -ny, ty = nx;
      const len = half * 2, cost = len / CONFIG.INK_UNIT_PX;
      if (mode === 'new' && Drawing.getInk() < CONFIG.INK_START_MIN) continue;
      if (mode === 'old') { if (oldInk < OLD.START) continue; oldInk -= Math.min(oldInk, len / OLD.SPEED); }
      if (mode !== 'new') Drawing.refillInk();
      const ink0 = Drawing.getInk();
      if (!Drawing.startStroke({ x: cx - tx * half, y: cy - ty * half })) continue;
      for (let i = 1; i <= 8; i++) Drawing.addPoint({ x: cx - tx * half + tx * len * i / 8, y: cy - ty * half + ty * len * i / 8 });
      Drawing.endStroke();
      inkUsed += Math.max(0, ink0 - Drawing.getInk()) || cost; strokes++;
      ant.cool = +(process.env.COOL || 0.6);
    }
    for (const ant of ants) AntSystem.updateAnt(ant, dt, AREA, Drawing.getLines(), obstacles, goals, 1);
    if (goals.every(g => g.collected)) return { ok: true, t, inkUsed, strokes };
  }
  return { ok: false, t, inkUsed, strokes };
}
let fails = [], tot = 0, totInk = 0, totStrokes = 0, totT = 0;
const rows = [];
for (const L of LEVELS.slice(L0 - 1, L1)) {
  let ok = 0, ink = 0, st = 0, tt = 0;
  for (let i = 0; i < TRIALS; i++) { const r = runLevel(L, i + 1); if (r.ok) { ok++; ink += r.inkUsed; st += r.strokes; tt += r.t; } }
  rows.push(`L${L.id}:${ok}/${TRIALS}`);
  if (ok === 0) fails.push(L.id);
  tot += ok; totInk += ink; totStrokes += st; totT += tt;
}
console.log(rows.join(' '));
console.log(`mode=${mode} ${orient}: solved ${tot}/${(L1 - L0 + 1) * TRIALS} runs; levels never solved: [${fails.join(',')}]; avg strokes/solve ${(totStrokes / tot).toFixed(1)}, avg ink/solve ${(totInk / tot).toFixed(3)}, avg time ${(totT / tot).toFixed(1)}s`);
