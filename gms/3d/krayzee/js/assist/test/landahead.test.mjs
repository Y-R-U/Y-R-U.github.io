// node js/assist/test/landahead.test.mjs [--falsify] [--n=400]
// --falsify hands the planner a world with no colliders, trees or water: the safety check MUST then fail.
import { planLandAhead, LAND } from '../landahead.js';
import { fakeWorld, layout } from './fakeworld.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const N = +args.n || 400;
const world = fakeWorld();
const blind = args.falsify ? { ...world, colliders: [], trees: [], surfaceAt: (x, z) => { const s = world.surfaceAt(x, z); return s === 'water' || s === 'building' ? 'grass' : s; } } : world;
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const DEG = Math.PI / 180;
const plan = (x, z, alt, hdg, kt = 80, w = blind) => {
  const v = kt * 0.5144;
  return planLandAhead({ pos: [x, alt, z], vel: [Math.sin(hdg * DEG) * v, 0, -Math.cos(hdg * DEG) * v], heading: hdg, altitude: alt, world: w, layout });
};

// Exact independent check of the chosen strip: no collider box, no tree, no water/building anywhere on it.
function stripViolations(p) {
  const out = [];
  const [sx, sz] = p.strip.start, [ex, ez] = p.strip.end;
  const L = Math.hypot(ex - sx, ez - sz), ux = (ex - sx) / L, uz = (ez - sz) / L, half = 10;
  for (let s = 0; s <= L; s += 2) for (let l = -half; l <= half; l += 2) {
    const x = sx + ux * s - uz * l, z = sz + uz * s + ux * l;
    const surf = world.surfaceAt(x, z);
    if (surf === 'water' || surf === 'building') { out.push(`${surf}@${x | 0},${z | 0}`); return out; }
    for (const c of world.colliders) if (x >= c.min[0] - 1 && x <= c.max[0] + 1 && z >= c.min[2] - 1 && z <= c.max[2] + 1) { out.push(`${c.kind}@${x | 0},${z | 0}`); return out; }
    for (const t of world.trees) if (Math.hypot(t[0] - x, t[1] - z) < 4) { out.push(`tree@${x | 0},${z | 0}`); return out; }
  }
  return out;
}

console.log('aligned runway preference');
{
  const p = plan(-700 - 2500, 0, 180, 90);
  ok(p.kind === 'runway' && p.runway === '09', 'final 09 picks RWY 09', JSON.stringify({ k: p.kind, r: p.runway, f: p.fail }));
  const q = plan(700 + 2200, 30, 160, 268);
  ok(q.kind === 'runway' && q.runway === '27', 'final 27 picks RWY 27', JSON.stringify({ k: q.kind, r: q.runway, f: q.fail }));
  const c = plan(-450, 1500, 200, 0);
  ok(c.kind === 'runway' && (c.runway === '09' || c.runway === '27'), 'crosswise runway ahead still preferred over grass', JSON.stringify({ k: c.kind, r: c.runway, f: c.fail }));
  ok(c.approach?.some((w) => w.kind === 'base'), 'crosswise runway uses a base turn', c.pattern);
  const c4 = plan(-200, 1800, 200, 355);
  ok(c4.runway === '04', 'heading 355 near 04/22 → RWY 04 (40°) beats 09/27 (90°)', JSON.stringify({ k: c4.kind, r: c4.runway }));
  const d = plan(-700 - 2500, 0, 180, 90 + 30);
  ok(d.kind !== 'runway' || Math.abs(d.heading - 90) < 1, 'runway direction is the one closest to heading', `${d.kind} ${d.heading}`);
}

console.log('grass when no pavement in the cone');
{
  const p = plan(2600, 1400, 220, 90);
  ok(!p.fail && p.kind === 'grass', 'east of field heading east → grass', JSON.stringify({ k: p.kind, f: p.fail }));
  ok(!p.fail && p.stripLength >= LAND.minLen, 'strip ≥ 350 m', p.stripLength);
  if (!p.fail) ok(stripViolations(p).length === 0, 'grass strip clear', stripViolations(p).join(' '));
}

console.log('nothing suitable / too high');
{
  // heading straight at the town from close in: houses everywhere in a narrow, short cone
  const town = fakeWorld({ extra: Array.from({ length: 400 }, (_, i) => ({ min: [-2500 + (i % 20) * 250, 0, -6000 + Math.floor(i / 20) * 250], max: [-2500 + (i % 20) * 250 + 240, 20, -6000 + Math.floor(i / 20) * 250 + 240], kind: 'house' })) });
  const n = plan(0, -1100, 40, 0, 70, args.falsify ? blind : town);
  ok(n.fail === 'nothingAhead', 'built-up ahead → nothingAhead', JSON.stringify({ f: n.fail, k: n.kind, s: n.strip }));
  const h = plan(-700 - 1200, 0, 1400, 90);
  ok(h.fail === 'tooHigh', '1400 m over a field 1.2 km out → tooHigh', JSON.stringify({ f: h.fail, k: h.kind }));
  ok(h.hint === 'GO LOWER', 'tooHigh hint text');
  const o = plan(-700 - 2500, 0, 330, 90);
  ok(!o.fail && o.feasibility.orbits >= 1, 'a bit high → descending orbit planned', JSON.stringify({ f: o.fail, orb: o.feasibility?.orbits }));
  const g = planLandAhead({ pos: [0, 1, 0], vel: [0, 0, -10], heading: 0, world: blind, layout, onGround: true });
  ok(g.fail === 'onGround', 'on the ground → onGround');
}

console.log(`random sweep ×${N}`);
{
  let n = 0, viol = 0, plans = 0, ms = 0, maxMs = 0, kinds = {}, badCone = 0, badAlt = 0;
  let s = 99;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (; n < N; n++) {
    const x = (r() - 0.5) * 7000, z = (r() - 0.5) * 7000, hdg = r() * 360, alt = 40 + r() * 500;
    const t0 = performance.now();
    const p = plan(x, z, alt, hdg, 65 + r() * 50);
    const dt = performance.now() - t0; ms += dt; maxMs = Math.max(maxMs, dt);
    if (p.fail) { kinds[p.fail] = (kinds[p.fail] || 0) + 1; continue; }
    plans++; kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    const v = stripViolations(p);
    if (v.length) { viol++; if (viol <= 5) console.log(`  violation ${p.kind} ${p.label} from (${x | 0},${z | 0}) hdg ${hdg | 0}: ${v[0]}`); }
    if (p.stripLength < LAND.minLen - 1) badCone++;
    for (const w of p.approach) if (w.kind !== 'rollout' && w.kind !== 'touchdown' && w.alt < world.groundHeightAt(w.x, w.z) + 20) { badAlt++; break; }
  }
  console.log(`  ${plans} plans, ${JSON.stringify(kinds)}, avg ${(ms / N).toFixed(1)} ms, max ${maxMs.toFixed(1)} ms`);
  ok(viol === 0, 'no strip crosses a building, tree, collider or water', `${viol} violations`);
  ok(badCone === 0, 'every strip ≥ minLen');
  ok(badAlt === 0, 'approach waypoints clear terrain by ≥ 20 m', `${badAlt}`);
  ok(plans > N * 0.3, 'planner finds something most of the time', `${plans}/${N}`);
}

console.log(`\n${pass} passed, ${fail} failed${args.falsify ? '  (falsify mode: failures expected)' : ''}`);
process.exit(args.falsify ? (fail > 0 ? 0 : 1) : (fail ? 1 : 0));
