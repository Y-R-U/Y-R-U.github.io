#!/usr/bin/env node
// Builds every hole and checks it is beatable: a greedy planner searches aim x power with the real
// sim and plays shot after shot until the ball drops.   node tools/holes_test.mjs [holeId] [--verbose]
import { buildHole } from '../js/course/builder.js';
import { World, Ball } from '../js/engine/physics.js';
import { simulateShot } from '../js/engine/sim.js';
import { SHOT_MIN, SHOT_MAX, CUP_R } from '../js/engine/constants.js';
import { COURSES } from '../js/course/holes/index.js';

const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const verbose = process.argv.includes('--verbose');
let fails = 0;

export function sOf(h, x, y, z) {
  let best = Infinity, s = 0;
  for (const f of h.frames) { const d = (f.p[0] - x) ** 2 + (f.p[1] - y) ** 2 * 4 + (f.p[2] - z) ** 2; if (d < best) { best = d; s = f.s; } }
  return s;
}

function plan(h, w, b, t0) {
  const cupS = sOf(h, h.cup.x, h.cup.y, h.cup.z);
  const s0 = sOf(h, b.px, b.py, b.pz);
  // aim reference: toward the track point ~2.5 m ahead (or the cup if close)
  let tgt = h.frames.find(f => f.s >= Math.min(cupS, s0 + 2.5) && !f.loop) || h.frames[h.frames.length - 1];
  if (cupS - s0 < 3) tgt = { p: [h.cup.x, h.cup.y, h.cup.z] };
  const base = Math.atan2(tgt.p[0] - b.px, -(tgt.p[2] - b.pz));
  let best = null;
  for (let da = -70; da <= 70; da += 1.5) {
    for (let pw = 0.06; pw <= 1.0001; pw += 0.03) {
      const ang = base + da * Math.PI / 180, sp = SHOT_MIN + (SHOT_MAX - SHOT_MIN) * pw;
      const bb = b.clone();
      const r = simulateShot(w, bb, Math.sin(ang) * sp, -Math.cos(ang) * sp, { t0 });
      let score;
      if (r.state === 'cup') score = -1000 + pw;              // prefer the softest make
      else if (r.state === 'oob') score = 1000;
      else {
        const s = sOf(h, r.x, r.y, r.z);
        const dc = Math.hypot(r.x - h.cup.x, r.z - h.cup.z);
        score = (cupS - s) + (cupS - s < 2 ? dc : 0);
      }
      if (!best || score < best.score) best = { score, ang, sp, pw, da, r };
    }
  }
  return best;
}

for (const course of Object.values(COURSES)) {
  for (const def of course.holes) {
    if (only && def.id !== only) continue;
    const t0 = Date.now();
    const h = buildHole(def);
    const w = new World({ tris: h.colliders.tris, mats: h.colliders.mats, cup: h.cup, kinematics: h.kinematics, killY: h.killY });
    console.log(`${def.id} "${def.name}" par ${def.par}: length ${h.total.toFixed(1)} m, ${h.colliders.mats.length} collider tris, ${h.kinematics.length} kinematic, ${Object.keys(h.geo).length} mesh groups`);
    const b = new Ball(h.tee.x, h.tee.y, h.tee.z);
    let strokes = 0, t = 0, done = false;
    while (strokes < def.par + 4 && !done) {
      const p = plan(h, w, b, t);
      strokes++;
      const r = simulateShot(w, b, Math.sin(p.ang) * p.sp, -Math.cos(p.ang) * p.sp, { t0: t });
      t = r.t1 + 2;
      console.log(`   shot ${strokes}: aim ${p.da >= 0 ? '+' : ''}${p.da.toFixed(1)}° power ${(p.pw * 100).toFixed(0)}% → ${r.state} at (${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)}) in ${r.time.toFixed(1)} s` +
        (verbose ? '  ' + r.events.filter(e => e.type !== 'rest').map(e => e.type).join(',') : ''));
      if (r.state === 'cup') done = true;
      if (r.state === 'oob') { b.place(b.rest.x, b.rest.y, b.rest.z); strokes++; }
    }
    const ok = done && strokes <= def.par;
    if (!ok) fails++;
    console.log(`   ${ok ? 'ok  ' : 'FAIL'} holed in ${done ? strokes : '-'} (par ${def.par})  [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
  }
}
process.exit(fails ? 1 : 0);
