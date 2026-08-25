#!/usr/bin/env node
/**
 * The half of P7's harness that needs a browser: H2, H4, H5, H11, H12.
 *
 * H11 and H12 are thumb numbers and they are driven through REAL touch, over
 * `Input.dispatchTouchEvent`, against `js/core/input.js` — not by writing an
 * axis into the sim. The thumb follows what the shipping pilot wants, closed
 * with a proportional controller on `input.axisY`, so the loop is
 *
 *   ai.js -> pilot.js -> a thumb position -> a real touch -> input.js -> flight.js
 *
 * and travel is a property of the flight model and the stick radius rather than
 * of a script I wrote. Deliberately: the controller reads `input.axisY` and
 * never re-implements `input.js`'s deadzone or its 1.35 exponent, so it cannot
 * drift away from the shaping the way a copied constant does (D72).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';
import { Touch } from './touch.mjs';

const SIZES = [[390, 844, 'portrait phone'], [844, 390, 'landscape phone'], [1440, 810, 'desktop']];

/**
 * P8b, additive: `mode` steers H4/H5/H11/H12 only. H2 already loops all three
 * SIZES. The default is 'portrait' at 390x844, so every shipped number
 * reproduces unchanged; 'landscape' runs the same driver at 844x390.
 */
export async function runCdp({ row, note, secs = 60, gpu = false, bug = '', tapeSide = '', thumbRest = 0.75, thumbGain = 0.3, sweep = false, gainSweep = false, mode = 'portrait' } = {}) {
  const MW = mode === 'portrait' ? 390 : 844, MH = mode === 'portrait' ? 844 : 390;
  // P8c: H4 swept a hardcoded 0.78..1.22 in BOTH modes. Landscape's clamp floor
  // is 0.74 (D128), so the 0.74..0.78 band a landscape player actually reaches
  // was never tested — the band, not the literal, is the criterion.
  const { VIEW_PROFILE: VP } = await import('../js/core/viewprofile.js');
  const FLOOR = VP[mode].zoomWide, CEIL = VP[mode].zoomIntimate;
  const out = {};
  const { cdp, base, close } = await harness({ gpu });
  const q = (extra) => `${base}/tools/pages/hud.html?preserve=1&dpr=1&nosave&seed=7` +
      `${bug ? '&hudbug=' + bug : ''}${tapeSide ? '&tapeside=' + tapeSide : ''}${extra}`;
  try {
    /* ------------------------------------------------------------- H2 --- */
    const h2 = [];
    for (const [w, h, name] of SIZES) {
      await cdp.viewport(w, h, 1, true);
      await cdp.goto(q(`&secs=1&mode=${w > h ? 'landscape' : 'portrait'}`));
      if (!await cdp.waitFor('window.__hud', 20000)) throw new Error('hud.html did not boot at ' + name);
      await cdp.frames(6);
      const r = await cdp.eval(`(() => {
        const L = window.__hud.hud.layout, v = window.__hud.view;
        const s = v.safe, play = L.play;
        const bad = [];
        for (const e of L.elements) {
          if (e.w <= 0 || e.h <= 0) bad.push(e.id + ':empty');
          if (e.x < play.x - 0.5 || e.y < play.y - 0.5 ||
              e.x + e.w > play.x + play.w + 0.5 || e.y + e.h > play.y + play.h + 0.5)
            bad.push(e.id + ':outside');
        }
        // the profile-owned slots must BE the profile's slot, not a copy of it
        const P = v.profile;
        const sl = (rect) => ({ x: s.left + rect.x * (v.w - s.left - s.right),
                                y: s.top + rect.y * (v.h - s.top - s.bottom),
                                w: rect.w * (v.w - s.left - s.right), h: rect.h * (v.h - s.top - s.bottom) });
        const eq = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 &&
                             Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - b.h) < 0.01;
        if (!eq(L.card, sl(P.radioCard))) bad.push('card:not-the-profile-slot');
        if (!eq({x:L.special.x,y:L.special.y,w:L.special.w,h:L.special.h}, sl(P.specialSlot)))
          bad.push('special:not-the-profile-slot');
        if (Math.abs(L.tape.w - P.altTape.w) > 0.01) bad.push('tape:width-not-from-profile');
        /**
         * H2b: elements must not overlap EACH OTHER. The brief has no such
         * criterion and it should: in landscape the profile's specialSlot lands
         * on the altitude tape's label column, which is visible in
         * shots/p7/hud_landscape.png and which no H1..H13 reading catches.
         * arc, belt, engine and stress live INSIDE the coaming by design and are
         * excluded from each other and from it.
         */
        const inCoam = new Set(['arc', 'belt', 'engine', 'stress', 'coaming', 'coaming2']);
        const over = [];
        for (let i = 0; i < L.elements.length; i++) for (let j = i + 1; j < L.elements.length; j++) {
          const a = L.elements[i], b = L.elements[j];
          if (inCoam.has(a.id) && inCoam.has(b.id)) continue;
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
            over.push(a.id + '/' + b.id);
        }
        return { bad, over, n: L.elements.length, hud: L.hud, tapeSide: L.tape.side, mode: v.mode };
      })()`);
      h2.push({ name, w, h, ...r });
    }
    const h2bad = h2.flatMap((r) => r.bad.map((b) => `${r.w}x${r.h} ${b}`));
    row('H2', 'every element inside its slot + safe area', h2bad.length === 0,
        h2bad.length ? h2bad.slice(0, 5).join(' ')
          : h2.map((r) => `${r.w}x${r.h} ${r.hud}/${r.tapeSide} ${r.n} elements`).join('; '));
    const h2over = h2.flatMap((r) => (r.over || []).map((o) => `${r.w}x${r.h} ${o}`));
    row('H2b', 'HUD elements do not overlap each other', h2over.length === 0,
        h2over.length ? h2over.join(' ') : 'no element rect intersects another');
    out.H2 = h2;

    /* ------------------------------------------------------------- H4 --- */
    await cdp.viewport(MW, MH, 1, true);
    await cdp.goto(q(`&secs=4&mode=${mode}`));
    await cdp.waitFor('window.__hud', 20000);
    await cdp.frames(40);
    const h4 = await cdp.eval(`(() => {
      const delta = (a, b) => {
        const rows = [];
        for (const k of Object.keys(a)) {
          if (!a[k] || !b[k]) { rows.push({ id: k, missing: true }); continue; }
          rows.push({ id: k,
            dx: Math.abs(a[k].x - b[k].x), dy: Math.abs(a[k].y - b[k].y),
            dw: Math.abs(a[k].w - b[k].w), dh: Math.abs(a[k].h - b[k].h) });
        }
        return rows;
      };
      const chrome = delta(window.__hud.bboxes(FLOOR), window.__hud.bboxes(CEIL));
      const wide = delta(window.__hud.bboxesWide(FLOOR), window.__hud.bboxesWide(CEIL));
      return { chrome, wide };
    })()`.replace(/FLOOR/g, String(FLOOR)).replace(/CEIL/g, String(CEIL)));
    const worstOf = (rows) => rows.reduce((m, r) => r.missing ? m : Math.max(m, r.dx, r.dy, r.dw, r.dh), 0);
    const worst4 = worstOf(h4.chrome);
    const wide4 = worstOf(h4.wide);
    const tapeWide = h4.wide.find((r) => r.id === 'tape') || {};
    const missing = h4.chrome.filter((r) => r.missing).map((r) => r.id);
    row('H4', 'the HUD does not zoom', worst4 <= 1 && missing.length === 0,
        `worst chrome bbox delta between zoom ${FLOOR} and ${CEIL} = ${worst4.toFixed(3)} px ` +
        `over ${h4.chrome.length} elements` + (missing.length ? ` (no ink: ${missing.join(',')})` : ''));
    if (note) note('H4r', 'tape readouts DO move with zoom',
        `including the viewport bracket and the off-screen pips, the tape's ink box moves ` +
        `${Math.max(tapeWide.dy || 0, tapeWide.dh || 0).toFixed(1)} px (worst element ${wide4.toFixed(1)} px) — ` +
        `that is the bracket reporting a changed frame, not the HUD scaling`);
    out.H4 = { worst: worst4, wide: wide4, rows: h4.chrome };

    /* -------------------------------------------------- H5, H11, H12 --- */
    await cdp.viewport(MW, MH, 1, true);

    const zone = await cdp.eval(`JSON.stringify(window.__hud.hud.layout.stickZone)`).then(JSON.parse);
    const R = await cdp.eval('window.__hud.stickR');

    /**
     * WHERE THE THUMB FIRST LANDS IS A CHOICE, AND H11 TURNS ON IT. The stick
     * is a floating relative stick, so the first contact point sets the anchor
     * and biases every frame after it. Resting the thumb at 45% of the stick
     * zone put the disc straight over the aeroplane and H11 read 24% of frames;
     * the same build with the thumb where a hand actually holds a phone reads
     * far less. That is a believable-wrong CONTROL (D82) and the answer is to
     * state the rest point, justify it, and report the sweep.
     *
     * Default 0.75 of the stick zone = 728 css px on a 390x844 screen, and it is
     * chosen for a reason that is not "it passes": it is the ONLY rest height at
     * which the thumb has the stick's full +-R of travel without running into
     * the bottom bezel. At 0.90 the thumb clamps against the screen edge 45% of
     * the time, which flatters both H11 (0.85% instead of 6.5%) and H12 (174 css
     * px/min instead of 583) by simply not letting the thumb move.
     *
     * Measured sweep, 60 s runs, overlap with the player rect:
     *   rest 0.35 -> 3.9%   0.55 -> 14.3%   0.75 -> 6.5%   0.90 -> 0.8%
     * H11 as specified does not have a single value. The sweep is the result.
     */
    async function runThumb(rest, gain = thumbGain) {
      await cdp.goto(q(`&auto=thumb&secs=${secs + 4}&mode=${mode}`));
      await cdp.waitFor('window.__hud', 20000);
      await cdp.frames(10);
      const t = new Touch(cdp);
      const restY = zone.y + zone.h * rest;
      const tx = zone.x + zone.w * 0.5;
      let off = 0;
      await t.down(tx, restY);
      await cdp.eval('window.__hud.traceStart()');
      const HZ = 20, GAIN = gain;
      const steps = Math.round(secs * HZ);
      let replaced = 0;
      for (let i = 0; i < steps; i++) {
        const s = await cdp.eval(
          `(() => { const h = window.__hud; return [h.wantAxis, h.input.axisY, h.input.stick.oy]; })()`);
        const [want, have, oy] = s;
        /**
         * The offset is held RELATIVE TO THE ANCHOR and bounded to +-R. The
         * first version integrated `ty` directly and clamped it to the stick
         * zone; because `input.js`'s anchor slides to follow the thumb, the
         * pair walked to the bottom of the screen and stuck there — median thumb
         * y 842 of 844, 209 css px/min, a pinned stick reported as a flown
         * mission. Bounding the offset is also what a hand does: past full
         * deflection there is nowhere further to push.
         */
        // 0.95R, not R: at exactly R `input.js` starts sliding the anchor to
        // follow the thumb, `oy` chases `ty`, and the pair walks off the bottom
        // of the screen. Staying inside the slide threshold keeps the anchor put.
        off = Math.max(-R * 0.95, Math.min(R * 0.95, off + GAIN * (want - have) * R));
        const ty = Math.max(zone.y + 2, Math.min(zone.y + zone.h - 2, oy + off));
        await t.moveTo(tx, ty);
        await sleep(1000 / HZ);
      }
      await t.allUp();
      const r = await cdp.eval('JSON.stringify(window.__hud.traceStats())').then(JSON.parse);
      r.replaced = replaced;
      return r;
    }

    const st = await runThumb(thumbRest);
    out.trace = st;
    if (gainSweep) {
      out.gainSweep = [];
      for (const g of [0.15, 0.45, 0.7]) {
        const r = await runThumb(thumbRest, g);
        out.gainSweep.push({ gain: g, travelPerMin: r.travelPerMin, discOverlapPct: r.discOverlapPct });
      }
      if (note) note('H12s', 'thumb travel vs driver gain',
        [{ gain: thumbGain, travelPerMin: st.travelPerMin, discOverlapPct: st.discOverlapPct }]
          .concat(out.gainSweep)
          .map((r) => `gain ${r.gain} -> ${r.travelPerMin.toFixed(0)} px/min`).join('; '));
    }
    if (sweep) {
      out.sweep = [];
      for (const rest of [0.35, 0.55, 0.9]) {
        const r = await runThumb(rest);
        out.sweep.push({ rest, y: zone.y + zone.h * rest, medianY: r.medianY,
                         discOverlapPct: r.discOverlapPct, sweptPct: r.sweptPct,
                         travelPerMin: r.travelPerMin });
      }
      if (note) note('H11s', 'thumb-rest sensitivity',
        [{ rest: thumbRest, y: zone.y + zone.h * thumbRest, medianY: st.medianY,
           discOverlapPct: st.discOverlapPct, sweptPct: st.sweptPct, travelPerMin: st.travelPerMin }]
          .concat(out.sweep)
          .map((r) => `rest ${r.rest} (y ${r.y.toFixed(0)}) -> overlap ${r.discOverlapPct.toFixed(1)}%, ` +
                      `swept ${r.sweptPct.toFixed(1)}%, travel ${r.travelPerMin.toFixed(0)}`).join('; '));
    }

    const occlOk = st.occlPct === 0;
    row('H5', 'nothing occludes the aeroplane', occlOk,
        `${st.occlFrames}/${st.frames} frames (${st.occlPct.toFixed(2)}%) over ${st.secs.toFixed(0)} s` +
        (occlOk ? '' : ` — ${JSON.stringify(st.occlBy)}`));

    const h11 = st.sweptPct <= 18 && st.discOverlapPct <= 2;
    row('H11', 'thumb occlusion', h11,
        `165 px disc = ${st.discPct.toFixed(2)}% of screen, swept union ${st.sweptPct.toFixed(2)}% ` +
        `(cap 18%); overlaps the player rect on ${st.discOverlapPct.toFixed(2)}% of frames (cap 2%)`);

    const h12 = st.travelPerMin <= 2200;
    row('H12', 'thumb travel per minute', h12,
        `${st.travelPerMin.toFixed(0)} css px/min over ${st.secs.toFixed(0)} s at stickR ${st.stickR.toFixed(1)} px ` +
        `(cap 2200, fail 3000)`);
    out.H5 = { occlPct: st.occlPct };
    out.H11 = { sweptPct: st.sweptPct, discOverlapPct: st.discOverlapPct };
    out.H12 = { travelPerMin: st.travelPerMin, stickR: st.stickR };

    if (cdp.errors.length) row('Hx', 'console clean', false, cdp.errors.slice(0, 3).join(' | '));
    const off = cdp.offOrigin(base);
    row('Hcdn', 'nothing loaded from a CDN', off.length === 0, off.length ? off.join(' ') : 'all same-origin');
  } finally { close(); }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { row } = await import('./hudcheck.mjs');
  const i = process.argv.indexOf('--secs');
  await runCdp({ row, secs: i >= 0 ? parseFloat(process.argv[i + 1]) : 60 });
}
