#!/usr/bin/env node
/**
 * Real touch, over Input.dispatchTouchEvent with real touchPoint arrays — so a
 * hold-and-slide is actually a hold-and-slide and not a synthesised mouse drag
 * with a different code path. Screenshots alone miss interaction bugs; this is
 * the module that catches them.
 *
 * As a library:
 *   import { Touch } from './touch.mjs';
 *   const t = new Touch(cdp);
 *   await t.down(x, y); await t.slideTo(x2, y2, 300); await t.up();
 *   await t.tap(x, y);  await t.doubleTap(x, y);  await t.flick(x, y, dx, dy, 90);
 *
 * As a command line it runs the P2 input suite against js/main.js:
 *   node tools/touch.mjs [--size 390x844] [--gpu]
 *   node tools/touch.mjs --falsify        # reverts each fix and requires RED
 *
 * --falsify is the half that makes the other half mean something. Each of the
 * four pointer fixes has a `?inputbug=` control in input.js; the suite is run
 * once per bug and the named case MUST fail. A suite that still passes with the
 * fix reverted was never testing the fix.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';

export class Touch {
  constructor(cdp) { this.cdp = cdp; this.points = []; this.nextId = 1; }

  async #send(type, changed) {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' && this.points.length === 0 ? [] : this.points.slice(),
      modifiers: 0,
    });
    void changed;
  }

  /** Returns the touch id, so a second finger can be driven independently. */
  async down(x, y) {
    const id = this.nextId++;
    this.points.push({ x, y, id, radiusX: 12, radiusY: 12, force: 1 });
    await this.#send('touchStart');
    return id;
  }

  async moveTo(x, y, id) {
    const p = id === undefined ? this.points[this.points.length - 1] : this.points.find((q) => q.id === id);
    if (!p) return;
    p.x = x; p.y = y;
    await this.#send('touchMove');
  }

  async up(id) {
    if (id === undefined) this.points.pop(); else this.points = this.points.filter((q) => q.id !== id);
    await this.#send('touchEnd');
  }

  async allUp() { this.points.length = 0; await this.#send('touchEnd'); }

  /** A held slide, in steps, with real intermediate touchMoves. */
  async slideTo(x, y, ms = 240, steps = 12, id) {
    const p = id === undefined ? this.points[this.points.length - 1] : this.points.find((q) => q.id === id);
    if (!p) return;
    const x0 = p.x, y0 = p.y;
    for (let i = 1; i <= steps; i++) {
      await this.moveTo(x0 + (x - x0) * (i / steps), y0 + (y - y0) * (i / steps), id);
      await sleep(ms / steps);
    }
  }

  async tap(x, y, holdMs = 60) {
    const id = await this.down(x, y);
    await sleep(holdMs);
    await this.up(id);
  }

  async doubleTap(x, y, gapMs = 90) {
    await this.tap(x, y, 40);
    await sleep(gapMs);
    await this.tap(x, y, 40);
  }

  /**
   * > 900 css px/s inside 160 ms, which is what input.js calls a flick.
   *
   * NO sleeps. Each CDP round trip already costs several ms of real time, and
   * a flick is defined against real time — adding waits on top pushes the
   * gesture past the 160 ms window and the harness then "proves" that flicks do
   * not work. Two intermediate moves is the minimum that still looks like a
   * throw rather than a teleport.
   */
  async flick(x, y, dx, dy, steps = 2) {
    const id = await this.down(x, y);
    for (let i = 1; i <= steps; i++) await this.moveTo(x + dx * (i / steps), y + dy * (i / steps), id);
    await this.up(id);
  }
}

/* ------------------------------------------------------------------ suite */

export async function suite({ W = 390, H = 844, gpu = false, bug = '', quiet = false } = {}) {
  const { cdp, base, close } = await harness({ gpu });
  let fails = 0;
  const failed = [];
  const ok = (name, cond, detail) => {
    if (!cond) { fails++; failed.push(name); }
    if (!quiet) console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(42)} ${detail ?? ''}`);
  };

  try {
    await cdp.viewport(W, H, 1, true);
    await cdp.goto(`${base}/index.html?preserve=1&dpr=1&nosave&debug${bug ? '&inputbug=' + bug : ''}`);
    const up = await cdp.waitFor('window.__kh && window.__kh.input', 20000);
    if (!up) throw new Error('game did not boot');
    await cdp.frames(4);

    const t = new Touch(cdp);
    const zone = await cdp.eval(`(()=>{const z=window.__kh.input.getZones()[0];const r=z.rectFn({});return {x:r.x,y:r.y,w:r.w,h:r.h};})()`);
    const stickR = await cdp.eval('window.__kh.input.stickRadius()');
    if (!quiet) console.log(`viewport ${W}x${H}  stick zone ${JSON.stringify(zone)}  stickR ${stickR.toFixed(2)} css px${bug ? '   [inputbug=' + bug + ']' : ''}`);

    const cx = zone.x + zone.w * 0.5, cy = zone.y + zone.h * 0.5;

    /* 1. touchdown must not twitch the aircraft (DESIGN §2.2) */
    await t.down(cx, cy);
    await cdp.frames(2);
    let ax = await cdp.eval('[window.__kh.input.axisX, window.__kh.input.axisY]');
    ok('touchdown produces no input', ax[0] === 0 && ax[1] === 0, `axis ${ax}`);

    /* 2. hold-and-slide UP is nose-up: axisY < 0 */
    await t.slideTo(cx, cy - stickR * 0.9, 200);
    await cdp.frames(2);
    ax = await cdp.eval('[window.__kh.input.axisX, window.__kh.input.axisY]');
    ok('slide up -> axisY < 0 (nose up)', ax[1] < -0.5, `axisY ${ax[1].toFixed(3)}`);
    ok('pitchUp action held', await cdp.eval("window.__kh.input.held('pitchUp')"));

    /* 3. slide DOWN */
    await t.slideTo(cx, cy + stickR * 0.9, 200);
    await cdp.frames(2);
    ax = await cdp.eval('[window.__kh.input.axisX, window.__kh.input.axisY]');
    ok('slide down -> axisY > 0', ax[1] > 0.5, `axisY ${ax[1].toFixed(3)}`);

    /* 4. anchor slide — push far past R and the deflection saturates at 1 */
    await t.slideTo(cx, Math.min(H - 2, cy + stickR * 3), 260);
    await cdp.frames(2);
    const far = await cdp.eval('[window.__kh.input.axisY, window.__kh.input.stick.oy, window.__kh.input.stick.y]');
    ok('anchor slides so |axis| stays 1', Math.abs(far[0] - 1) < 0.02, `axisY ${far[0].toFixed(3)}`);
    ok('anchor moved with the thumb', Math.abs(far[2] - far[1] - stickR) < 1.5, `|y-oy| ${(far[2] - far[1]).toFixed(1)} vs R ${stickR.toFixed(1)}`);

    /* 5. release eases to zero over 0.18 s, not instantly */
    await t.up();
    await cdp.frames(2);
    const mid = await cdp.eval('window.__kh.input.axisY');
    ok('release eases, does not snap', mid > 0.05, `axisY 2 frames after up = ${mid.toFixed(3)}`);
    await sleep(400); await cdp.frames(2);
    const end = await cdp.eval('window.__kh.input.axisY');
    ok('release reaches zero', Math.abs(end) < 1e-6, `axisY ${end}`);

    /* 6. a tap outside the stick zone fires the special */
    await cdp.eval('window.__sp = 0; window.__kh.input.onTap(()=>{}); window.__spOff = (()=>{let n=0; return n;})();');
    await cdp.eval('window.__specialPresses = 0;');
    await t.tap(W * 0.5, zone.y * 0.4);
    await cdp.frames(2);
    const sp = await cdp.eval("window.__kh.input.pressed('special') || window.__lastSpecial === true");
    // `pressed` is a one-tick edge, so poll it from inside the loop instead
    await cdp.eval(`window.__lastSpecial = false; window.__kh.bus.on('scene:change', ()=>{});
      (function(){ const i = window.__kh.input; const u = i.update.bind(i);
        i.update = function(){ u(); if (i.pressed('special')) window.__lastSpecial = true; }; })();`);
    await t.tap(W * 0.5, zone.y * 0.4);
    await cdp.frames(4);
    ok('tap outside the stick zone fires special', await cdp.eval('window.__lastSpecial === true'), `edge-poll (direct read was ${sp})`);

    /* 7. a tap INSIDE the stick zone does not */
    await cdp.eval('window.__lastSpecial = false;');
    await t.tap(cx, cy);
    await cdp.frames(4);
    ok('tap inside the stick zone does not', await cdp.eval('window.__lastSpecial === false'));

    /* 8. double tap in the stick zone */
    await cdp.eval('window.__dt = 0; window.__kh.input.onDoubleTap(()=>{window.__dt++;});');
    await t.doubleTap(cx, cy);
    await cdp.frames(2);
    ok('double tap fires once', (await cdp.eval('window.__dt')) === 1, `count ${await cdp.eval('window.__dt')}`);

    /* 9. flick. The gesture is defined against REAL time, so the harness also
          records what it actually delivered — a failure here is far more often
          the driver being slow than the detector being wrong. */
    await cdp.eval(`window.__fl = null; window.__kh.input.onFlick(e=>{window.__fl={dx:e.dx,dy:e.dy,speed:e.speed,inStick:e.inStick};});
      window.__ptr = {t0:0,t1:0,x0:0,y0:0,x1:0,y1:0};
      const cv = window.__kh.R.canvas;
      cv.addEventListener('pointerdown', e => { window.__ptr.t0 = performance.now(); window.__ptr.x0 = e.clientX; window.__ptr.y0 = e.clientY; }, true);
      window.addEventListener('pointerup', e => { window.__ptr.t1 = performance.now(); window.__ptr.x1 = e.clientX; window.__ptr.y1 = e.clientY; }, true);`);
    await t.flick(cx, cy, 0, -170);
    await cdp.frames(2);
    const fl = await cdp.eval('window.__fl');
    const ptr = await cdp.eval('window.__ptr');
    const dtMs = ptr.t1 - ptr.t0;
    const delivered = Math.hypot(ptr.x1 - ptr.x0, ptr.y1 - ptr.y0) / (dtMs / 1000);
    ok('flick up detected', !!fl && fl.dy < -100 && fl.speed > 900,
      (fl ? `dy ${fl.dy} speed ${fl.speed.toFixed(0)} px/s` : 'none') +
      `  [driver delivered ${dtMs.toFixed(0)} ms, ${delivered.toFixed(0)} px/s; detector needs < 160 ms and > 900 px/s]`);

    /* 10. the lost pointerup. A touch whose up never arrives must not latch. */
    await cdp.eval(`window.__pid = -1; window.__kh.R.canvas.addEventListener('pointerdown', e => { window.__pid = e.pointerId; }, true);`);
    await t.down(cx, cy);
    await t.slideTo(cx, cy - stickR, 120);
    await cdp.frames(2);
    const heldDuring = await cdp.eval("window.__kh.input.held('pitchUp')");
    await cdp.eval(`window.__kh.R.canvas.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: window.__pid, bubbles: true }));`);
    await sleep(350); await cdp.frames(4);
    const heldAfter = await cdp.eval("window.__kh.input.held('pitchUp')");
    ok('lost pointer capture releases the stick', heldDuring && !heldAfter, `during ${heldDuring} after ${heldAfter}`);
    await t.allUp();

    /* 11. blur zeroes everything */
    await t.down(cx, cy);
    await t.slideTo(cx, cy - stickR, 120);
    await cdp.eval(`window.dispatchEvent(new Event('blur'));`);
    await cdp.frames(3);
    ok('blur zeroes every action', !(await cdp.eval("window.__kh.input.held('pitchUp')")) && (await cdp.eval('window.__kh.input.axisY')) === 0);
    await t.allUp();

    /* 12. releaseAll on a scene change */
    await t.down(cx, cy);
    await t.slideTo(cx, cy - stickR, 120);
    await cdp.frames(2);
    await cdp.eval("window.__kh.go('title')");
    await cdp.frames(3);
    ok('scene change releases the stick', (await cdp.eval('window.__kh.input.axisY')) === 0 && !(await cdp.eval('window.__kh.input.stick.active')));
    await t.allUp();

    if (!quiet) console.log(cdp.errors.length ? `\npage errors:\n  ${cdp.errors.join('\n  ')}` : '\nno page errors');
    if (cdp.errors.length) { fails++; failed.push('page errors: ' + cdp.errors[0]); }
  } finally {
    close();
  }
  return { fails, failed, stickR: await Promise.resolve(null) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const si = argv.indexOf('--size');
  const size = (si >= 0 ? argv[si + 1] : null) || '390x844';
  const [W, H] = size.split('x').map(Number);
  const gpu = argv.includes('--gpu');

  if (!argv.includes('--falsify')) {
    const r = await suite({ W, H, gpu });
    console.log(r.fails ? `\nFAIL — ${r.fails} case(s)` : '\nPASS — every case behaved');
    process.exit(r.fails ? 1 : 0);
  }

  // Each bug must break its own named case, and ONLY confirms the fix if it does.
  const EXPECT = {
    nocapture: 'lost pointer capture releases the stick',
    noblur: 'blur zeroes every action',
    norelease: 'scene change releases the stick',
    twitch: 'touchdown produces no input',
  };
  console.log('\nFALSIFICATION — revert each fix, the named case must go RED\n');
  const base = await suite({ W, H, gpu, quiet: true });
  console.log(`  baseline (no bug)          ${base.fails === 0 ? 'GREEN' : 'RED: ' + base.failed.join(', ')}`);
  let bad = base.fails ? 1 : 0;
  for (const [bug, expect] of Object.entries(EXPECT)) {
    const r = await suite({ W, H, gpu, bug, quiet: true });
    const caught = r.failed.includes(expect);
    if (!caught) bad++;
    console.log(`  ?inputbug=${bug.padEnd(12)} ${caught ? 'RED as required' : 'STILL GREEN — the case does not test the fix'}` +
      `   (failed: ${r.failed.join(', ') || 'nothing'})`);
  }
  console.log(bad ? `\nFAIL — ${bad} problem(s)\n` : '\nPASS — every fix is genuinely under test\n');
  process.exit(bad ? 1 : 0);
}
