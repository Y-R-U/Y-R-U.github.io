#!/usr/bin/env node
/**
 * Rotate 20x mid-flight and prove the sim did not notice.
 *
 * ARCHITECTURE §4.1: "Rotation must not disturb the sim. On view:change the
 * camera and HUD relayout, the sim is untouched." The gate that ratifies that is
 * the manager's (`gates_orientation.mjs`); this is the build agent's own check
 * that the plumbing is right and the numbers to report.
 *
 * There is no sim yet, so the brief's instruction applies: run it against a
 * scripted dummy entity list on `ctx`. Every entity moves at constant velocity,
 * so any disturbance shows up as a step in a straight line — which is a far
 * sharper instrument than "did anything look wrong".
 *
 *   node tools/orient.mjs [--rotations 20] [--gpu]
 *   node tools/orient.mjs --falsify        # break each thing, require RED
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';
import { Touch } from './touch.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ROT = Number(arg('--rotations', 20));
const gpu = argv.includes('--gpu');

async function run({ bug = '', quiet = false } = {}) {
const { cdp, base, close } = await harness({ gpu });
let fails = 0;
const failed = [];
const ok = (n, c, d) => { if (!c) { fails++; failed.push(n); } if (!quiet) console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n.padEnd(46)} ${d ?? ''}`); };

try {
  await cdp.viewport(390, 844, 1, true);
  await cdp.goto(`${base}/index.html?preserve=1&dpr=1&nosave${bug === 'canvas-measure' ? '&viewbug=canvas' : ''}`);
  if (!await cdp.waitFor('window.__kh && window.__kh.cam', 20000)) throw new Error('did not boot');

  // The scripted world. Constant velocity everywhere; the camera tracks it, so
  // the camera is exercised by the rotation as well as the sim.
  await cdp.eval(`(() => {
    const ctx = window.__kh;
    ctx.player = { x: 0, y: -3000, vx: 300, vy: -40, hull: 64 };
    ctx.entities = [];
    for (let i = 0; i < 6; i++) ctx.entities.push({ id: 'e' + i, x: 150 + i * 220, y: -3000 + i * 90, vx: -80 - i * 13, vy: 17 + i * 5, hostile: true });
    window.__trace = [];
    window.__rotTicks = [];
    window.__latched = [];
    ctx.bus.on('view:change', () => window.__rotTicks.push(window.__simTick));
    window.__simTick = 0;
    ctx.scenes.boot.update = (dt) => {
      const p = ctx.player;
      p.x += p.vx * dt; p.y += p.vy * dt;
      for (const e of ctx.entities) { e.x += e.vx * dt; e.y += e.vy * dt; ctx.cam.track(e.id, e.x, e.y, 64, 34, 1); }
      window.__simTick++;
      window.__trace.push([window.__simTick, p.x, p.y, ctx.entities[0].x, ctx.entities[0].y, ctx.entities[5].x, ctx.cam.zoom]);
      window.__latched.push(ctx.input.axisY);
      if (window.__trace.length > 20000) { window.__trace.shift(); window.__latched.shift(); }
    };
    return true;
  })()`);

  /* The two harness-side bugs. They live here rather than in the engine because
     they are about what a CARELESS scene would do on a rotation — nudge the
     world to "re-fit" it, or clear the input to "reset" the layout. Both are
     plausible and both are exactly what this test exists to forbid. */
  if (bug === 'nudge-on-rotate') {
    await cdp.eval(`window.__kh.bus.on('view:change', () => { for (const e of window.__kh.entities) e.x += 0.5; })`);
  }
  if (bug === 'clear-input-on-rotate') {
    await cdp.eval(`window.__kh.bus.on('view:change', () => window.__kh.input.releaseAll())`);
  }
  await cdp.frames(30);

  // hold a thumb on the stick through every rotation
  const t = new Touch(cdp);
  const z = await cdp.eval(`(()=>{const r=window.__kh.input.getZones()[0].rectFn({});return {x:r.x,y:r.y,w:r.w,h:r.h};})()`);
  await t.down(z.x + z.w * 0.5, z.y + z.h * 0.5);
  await t.slideTo(z.x + z.w * 0.5, z.y + z.h * 0.5 - 60, 120);
  const axisHeld = await cdp.eval('window.__kh.input.axisY');

  const sizes = [];
  for (let i = 0; i < ROT; i++) {
    const portrait = i % 2 === 0;
    await cdp.viewport(portrait ? 844 : 390, portrait ? 390 : 844, 1, true);
    sizes.push(portrait ? '844x390' : '390x844');
    await cdp.frames(6);
  }
  await cdp.frames(20);

  const trace = await cdp.eval('window.__trace');
  const rotTicks = await cdp.eval('window.__rotTicks');
  const modeSeq = await cdp.eval('window.__state.view.mode');
  const axisDuring = await cdp.eval('window.__kh.input.axisY');
  await t.allUp();
  await sleep(400); await cdp.frames(4);
  const axisAfter = await cdp.eval('window.__kh.input.axisY');
  const heldAfter = await cdp.eval(`['pitchUp','pitchDown','slipLeft','slipRight','special','brake','pause'].filter(a=>window.__kh.input.held(a))`);

  /* --- 1. the tick counter is continuous --------------------------------- */
  let gaps = 0, worstGap = 0;
  for (let i = 1; i < trace.length; i++) {
    const d = trace[i][0] - trace[i - 1][0];
    if (d !== 1) { gaps++; worstGap = Math.max(worstGap, Math.abs(d)); }
  }
  ok('sim tick counter is continuous', gaps === 0, `${trace.length} ticks, ${gaps} discontinuity(ies), worst delta ${worstGap || 1}`);

  /* --- 2. no entity position changed on a rotation frame ----------------- */
  // Every entity is at constant velocity, so the per-tick delta is a constant.
  // The instrument is the WORST deviation from that constant on a rotation
  // tick, compared against the worst on any other tick.
  const DT = 1 / 60;
  const cols = [{ i: 1, v: 300, n: 'player.x' }, { i: 2, v: -40, n: 'player.y' },
                { i: 3, v: -80, n: 'e0.x' }, { i: 4, v: 17, n: 'e0.y' },
                { i: 5, v: -80 - 5 * 13, n: 'e5.x' }];
  const rotSet = new Set(rotTicks);
  let worstRot = 0, worstOther = 0, worstRotName = '', firstRotTick = rotTicks[0];
  for (let i = 1; i < trace.length; i++) {
    const onRot = rotSet.has(trace[i][0]) || rotSet.has(trace[i][0] - 1);
    for (const c of cols) {
      const err = Math.abs((trace[i][c.i] - trace[i - 1][c.i]) - c.v * DT);
      if (onRot) { if (err > worstRot) { worstRot = err; worstRotName = c.n; } }
      else if (err > worstOther) worstOther = err;
    }
  }
  ok('no entity position changed on a rotation frame', worstRot < 1e-6,
    `worst deviation from constant velocity on a rotation tick ${worstRot.toExponential(2)} wu (${worstRotName || 'none'}); on any other tick ${worstOther.toExponential(2)} wu; ${rotTicks.length} view:change events, first at tick ${firstRotTick}`);

  /* --- 3. no input latched ---------------------------------------------- */
  ok('the held stick survives every rotation', Math.abs(axisDuring - axisHeld) < 0.02,
    `axisY ${axisHeld.toFixed(3)} before, ${axisDuring.toFixed(3)} after ${ROT} rotations`);
  ok('no input latched after release', Math.abs(axisAfter) < 1e-6 && heldAfter.length === 0,
    `axisY ${axisAfter}, held [${heldAfter.join(' ')}]`);

  /* --- 4. the camera relaid out ----------------------------------------- */
  ok('view:change fired once per rotation', rotTicks.length >= ROT,
    `${rotTicks.length} events for ${ROT} rotations (extra events are the initial layout); ended in ${modeSeq}`);
  const zooms = trace.map((r) => r[6]);
  ok('zoom stayed inside the clamp through every rotation',
    Math.min(...zooms) >= 0.78 - 1e-9 && Math.max(...zooms) <= 1.22 + 1e-9,
    `zoom ${Math.min(...zooms).toFixed(4)} .. ${Math.max(...zooms).toFixed(4)}`);

  if (cdp.errors.length) { fails++; failed.push('page errors'); if (!quiet) console.log('  page errors: ' + cdp.errors.join(' | ')); }
} finally { close(); }
return { fails, failed };
}

if (!argv.includes('--falsify')) {
  const r = await run({});
  console.log(r.fails ? `\nFAIL — ${r.fails} case(s)\n` : `\nPASS — ${ROT} rotations, the sim did not notice\n`);
  process.exit(r.fails ? 1 : 0);
}

const EXPECT = {
  'canvas-measure': 'view:change fired once per rotation',
  'nudge-on-rotate': 'no entity position changed on a rotation frame',
  'clear-input-on-rotate': 'the held stick survives every rotation',
};
console.log('\nFALSIFICATION — break each thing, the named criterion must go RED\n');
const b = await run({ quiet: true });
console.log(`  baseline                      ${b.fails === 0 ? 'GREEN' : 'RED: ' + b.failed.join(', ')}`);
let bad = b.fails ? 1 : 0;
for (const [bug, expect] of Object.entries(EXPECT)) {
  const r = await run({ bug, quiet: true });
  const caught = r.failed.includes(expect);
  if (!caught) bad++;
  console.log(`  ${bug.padEnd(29)} ${caught ? 'RED as required' : 'STILL GREEN — the criterion does not test it'}   (failed: ${r.failed.join(', ') || 'nothing'})`);
}
console.log(bad ? `\nFAIL — ${bad} problem(s)\n` : '\nPASS — every criterion is genuinely under test\n');
process.exit(bad ? 1 : 0);
