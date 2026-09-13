#!/usr/bin/env node
// The mobile-first portrait gate (DESIGN 8.5). Runs the game on three real
// phones and asserts the things that make it a phone game rather than a
// desktop game that happens to fit.
//
//   node tools/portrait.mjs            all three devices
//   node tools/portrait.mjs --shots    also capture one PNG per device
//   node tools/portrait.mjs --falsify  break the viewport math; checks MUST go red
//
// Why three: 390x844 is the reference, 360x640 is the short cheap Android that
// breaks vertical layouts, and 430x932 is the big phone that exposes anything
// anchored to the top-left.

import { harness } from './cdp.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '../../../..');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
const FALSIFY = args.includes('--falsify');

const DEVICES = [
  { name: 'iPhone 14',     w: 390, h: 844, dpr: 2 },
  { name: 'small Android', w: 360, h: 640, dpr: 2 },
  { name: 'large phone',   w: 430, h: 932, dpr: 3 },
];

const VIEW_WIDTH = 420;   // must match js/core/viewport.js

const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(`${name}${detail ? ': ' + detail : ''}`);
  console.log(`    ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const { cdp, base, close } = await harness({ root: SITE });
mkdirSync(join(HERE, '../shots'), { recursive: true });

try {
  console.log('\nNINE STRINGS portrait gate' + (FALSIFY ? '  [falsify]' : '') + '\n');

  for (const d of DEVICES) {
    console.log(`  ${d.name}  ${d.w}x${d.h} @${d.dpr}`);
    await cdp.viewport(d.w, d.h, d.dpr, true);
    // dpr=1 in the query only when we are not measuring dpr behaviour
    await cdp.goto(`${base}/gms/2d/ninestrings/index.html?preserve=1&auto&seed=7`);
    await cdp.waitFor('!!window.__ns && window.__ns.ready', 12000).catch(() => {});
    if (FALSIFY) await cdp.eval('window.__ns.viewport.zoom = 0.01');
    await cdp.frames(20);

    const m = await cdp.eval(`(() => {
      const ns = window.__ns; if (!ns) return null;
      const vp = ns.viewport, c = document.getElementById('game');
      return {
        zoom: vp.zoom, w: vp.w, h: vp.h, dpr: vp.dpr, bw: c.width, bh: c.height,
        worldW: vp.w / vp.zoom,
        worldH: vp.h / vp.zoom,
        docW: document.documentElement.scrollWidth,
        docH: document.documentElement.scrollHeight,
        innerW: window.innerWidth, innerH: window.innerHeight,
        canvasCss: [c.clientWidth, c.clientHeight],
        safe: vp.safe,
      };
    })()`);

    if (!m) { check('booted', false); continue; }

    // The one number the whole balance rests on (D7).
    check('420 world units visible across', Math.abs(m.worldW - VIEW_WIDTH) < 0.5,
          `${m.worldW.toFixed(1)}u`);

    // A phone game must never scroll sideways. This is the classic failure and
    // it is invisible on a desktop window that is wider than the content.
    check('no horizontal overflow', m.docW <= m.innerW + 1, `doc ${m.docW} vs win ${m.innerW}`);
    check('no vertical page scroll', m.docH <= m.innerH + 1, `doc ${m.docH} vs win ${m.innerH}`);

    // Canvas must fill the viewport in CSS px and be backed at the real DPR.
    check('canvas fills viewport', Math.abs(m.canvasCss[0] - m.w) <= 1 && Math.abs(m.canvasCss[1] - m.h) <= 1,
          `${m.canvasCss[0]}x${m.canvasCss[1]} vs ${m.w}x${m.h}`);
    check('backing store at DPR', m.bw === Math.round(m.w * m.dpr) && m.bh === Math.round(m.h * m.dpr),
          `${m.bw}x${m.bh} @${m.dpr}`);

    // Portrait means taller than wide, in world units too.
    check('play area is portrait', m.worldH > m.worldW, `${m.worldW.toFixed(0)}x${m.worldH.toFixed(0)}u`);

    if (SHOTS) {
      const f = `shots/portrait-${d.w}x${d.h}.png`;
      await cdp.capture(join(HERE, '..', f));
      console.log(`    info  ${f}`);
    }
    console.log('');
  }
} finally {
  close();
}

if (FALSIFY) {
  const ok = fails.length > 0;
  console.log(`${ok ? 'FALSIFY OK' : 'FALSIFY FAILED'} - ${fails.length} check(s) went red`);
  process.exit(ok ? 0 : 1);
}
console.log(fails.length ? `${fails.length} FAILED` : 'all checks passed');
process.exit(fails.length ? 1 : 0);
