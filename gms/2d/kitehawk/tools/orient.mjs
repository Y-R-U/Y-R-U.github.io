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
 *   node tools/orient.mjs --bug noreanchor # one break-switch, with its numbers
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';
import { Touch } from './touch.mjs';
import { VIEW_PROFILE, stickRadius } from '../js/core/viewprofile.js';

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
  // `noreanchor` is an INPUT bug and rides `?inputbug=`, which reaches the
  // shipped createInput through js/main.js — not a harness-side override.
  const q = bug === 'canvas-measure' ? '&viewbug=canvas' : bug === 'noreanchor' ? '&inputbug=noreanchor' : '';
  await cdp.goto(`${base}/index.html?preserve=1&dpr=1&nosave&scene=boot${q}`);
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
      // index 7 is the view MODE. The clamp floor is per-profile (landscape 0.74,
      // portrait 0.78) and this trace crosses orientations 20 times, so a single
      // literal cannot bound it — see the assert below.
      window.__trace.push([window.__simTick, p.x, p.y, ctx.entities[0].x, ctx.entities[0].y, ctx.entities[5].x, ctx.cam.zoom, ctx.view.mode]);
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

  /**
   * D131. Reading the axis after a rotation the thumb did not follow proves
   * nothing: it is the same number either way, because nothing recomputes it.
   * The failure is in the FIRST MOVEMENT after the rotation — the anchor is a
   * css-pixel position in a frame that no longer exists, so a 1 px twitch is
   * measured against an anchor several hundred pixels away and the axis slams
   * to the rim. So: rotate into an orientation the anchor was not set in, move
   * the thumb ONCE (moveTo, never slideTo — a slide would re-anchor on its
   * first sub-step and then legitimately drive the axis to the target), and ask
   * whether the pilot still has the deflection he was holding.
   */
  await cdp.viewport(844, 390, 1, true);
  await cdp.frames(6);
  // Read the frame back rather than assuming the viewport call took: the radius
  // assert below is judged against THIS, so a harness that measured a different
  // frame than it asked for cannot quietly certify one (skygate's --falsify arms
  // did exactly that for a whole phase).
  const liveView = await cdp.eval(`(()=>{const v=window.__kh.view;return {mode:v.mode,w:v.w,h:v.h};})()`);
  const zL = await cdp.eval(`(()=>{const r=window.__kh.input.getZones()[0].rectFn({});return {x:r.x,y:r.y,w:r.w,h:r.h};})()`);
  const px = zL.x + zL.w * 0.5, py = zL.y + zL.h * 0.5;
  await t.moveTo(px, py);
  await cdp.frames(2);
  const axisMoved = await cdp.eval('window.__kh.input.axisY');
  const rawMoved = await cdp.eval('window.__kh.input.axisRaw.y');
  const stickRLive = await cdp.eval('window.__kh.input.stick.r');
  const NUDGE = 8;
  await t.moveTo(px, py - NUDGE);
  await cdp.frames(2);
  const rawNudged = await cdp.eval('window.__kh.input.axisRaw.y');

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
  ok('the held stick survives every rotation', Math.abs(axisMoved - axisHeld) < 0.02,
    `axisY ${axisHeld.toFixed(3)} held, ${axisDuring.toFixed(3)} after ${ROT} rotations,` +
    ` ${axisMoved.toFixed(3)} after the first thumb movement in the new frame`);
  /**
   * The other half of the same fix: re-anchoring with the OLD radius preserves
   * the axis at the instant of the move and then scales every later movement
   * wrongly. Landscape's radius is 56.8 px against portrait's 81.1, so an 8 px
   * nudge is 43% larger in landscape and a stale radius cannot fake it. The
   * expected radius comes from `stickRadius` — the shipped function, given the
   * harness's own view — not from a literal copied into the test.
   */
  const viewL = { profile: VIEW_PROFILE[liveView.mode], w: liveView.w, h: liveView.h,
                  safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  const rExp = stickRadius(viewL);
  ok('the re-anchor frame is the one that was asked for', liveView.mode === 'landscape' && liveView.w === 844 && liveView.h === 390,
    `page reports ${liveView.w}x${liveView.h} ${liveView.mode}`);
  const measuredPx = (rawMoved - rawNudged) * rExp;
  ok('the re-anchored stick uses the new profile radius', Math.abs(measuredPx - NUDGE) < NUDGE * 0.02,
    `an ${NUDGE} px nudge moved axisRaw ${(rawNudged - rawMoved).toFixed(4)}, = ${measuredPx.toFixed(2)} px` +
    ` against r ${rExp.toFixed(2)} for ${liveView.w}x${liveView.h} ${liveView.mode}` +
    ` (live ${Number(stickRLive).toFixed(2)}, portrait would be ${stickRadius({ profile: VIEW_PROFILE.portrait, w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } }).toFixed(2)})`);
  ok('no input latched after release', Math.abs(axisAfter) < 1e-6 && heldAfter.length === 0,
    `axisY ${axisAfter}, held [${heldAfter.join(' ')}]`);

  /* --- 4. the camera relaid out ----------------------------------------- */
  ok('view:change fired once per rotation', rotTicks.length >= ROT,
    `${rotTicks.length} events for ${ROT} rotations (extra events are the initial layout); ended in ${modeSeq}`);
  /**
   * P8c: this read `>= 0.78`, a LITERAL of portrait's clamp floor, against a
   * trace that rotates into landscape 20 times — and landscape's floor is 0.74
   * (D128). It went red at a perfectly legal 0.7577 the moment the floor moved.
   * The criterion is unchanged; it is now asked of the right PROFILE.
   *
   * "The right profile" is the PREVIOUS row's, not this row's. `main.js` runs
   * `cam.update` AFTER the scene update, and this trace is pushed from the scene
   * update — so row i carries the zoom `cam.update` produced during frame i-1,
   * under whichever profile was in force then. Judging a rotation row against
   * its own new profile flags one stale sample per rotation (10 of 20 here) as
   * a clamp violation that the renderer never saw: `cam.update` re-clamps to
   * `P.zoomWide` at camera.js:360 before `render` runs. Checked against
   * `js/main.js`'s loop rather than assumed.
   */
  const zooms = trace.map((r) => r[6]);
  const outside = trace.filter((r, i) => {
    const P = VIEW_PROFILE[(trace[i - 1] || r)[7]] || VIEW_PROFILE.portrait;
    return r[6] < P.zoomWide - 1e-9 || r[6] > P.zoomIntimate + 1e-9;
  });
  ok('zoom stayed inside the clamp through every rotation', outside.length === 0,
    `zoom ${Math.min(...zooms).toFixed(4)} .. ${Math.max(...zooms).toFixed(4)}` +
    ` against floors {portrait ${VIEW_PROFILE.portrait.zoomWide}, landscape ${VIEW_PROFILE.landscape.zoomWide}}` +
    (outside.length ? `; ${outside.length} tick(s) outside, worst ${outside[0][7]} ${outside[0][6].toFixed(4)}` : ', judged against the profile in force when cam.update ran'));

  if (cdp.errors.length) { fails++; failed.push('page errors'); if (!quiet) console.log('  page errors: ' + cdp.errors.join(' | ')); }
} finally { close(); }
return { fails, failed };
}

if (!argv.includes('--falsify')) {
  const r = await run({ bug: arg('--bug', '') });
  console.log(r.fails ? `\nFAIL — ${r.fails} case(s)\n` : `\nPASS — ${ROT} rotations, the sim did not notice\n`);
  process.exit(r.fails ? 1 : 0);
}

const EXPECT = {
  'canvas-measure': 'view:change fired once per rotation',
  'nudge-on-rotate': 'no entity position changed on a rotation frame',
  'clear-input-on-rotate': 'the held stick survives every rotation',
  // the shipped-code bug D131 named. `?inputbug=noreanchor` is the pre-fix
  // input.js, shipped alongside so the assert can be shown to catch it.
  'noreanchor': 'the held stick survives every rotation',
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
