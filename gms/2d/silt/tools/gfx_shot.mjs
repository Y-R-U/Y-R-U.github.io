#!/usr/bin/env node
/**
 * Lane A's own capture + perf tool. Drives dev/gfx.html through cdp.mjs.
 *
 * Both of cdp.mjs's gotchas apply and are honoured here: capture goes through
 * canvas.toDataURL (never Page.captureScreenshot, which hangs forever on an
 * animating WebGL canvas under headless), which is why every URL carries
 * ?preserve=1, and every URL carries ?dpr=1 because the software rasteriser
 * takes minutes a frame at dpr 2.
 *
 *   node tools/gfx_shot.mjs                       # every scene, default biome
 *   node tools/gfx_shot.mjs --scene=dissolve --biome=kiln --dt=9
 *   node tools/gfx_shot.mjs --all                 # scene x biome matrix
 *   node tools/gfx_shot.mjs --perf --gpu          # timed run, real GPU
 *   node tools/gfx_shot.mjs --check               # V-flip regression gate (exit 1 on fail)
 */
import { harness, ROOT } from './cdp.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const SCENES = ['dune', 'tide', 'kiln', 'jelly', 'glass', 'dissolve', 'mixed', 'tints'];
const BIOMES = ['dune', 'abyss', 'kiln', 'lumen', 'quartz'];
const W = +(args.w || 420), H = +(args.h || 900);
const SHOTS = join(ROOT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const jobs = [];
if (args.all) {
  for (const s of SCENES) for (const b of BIOMES) jobs.push({ scene: s, biome: b });
} else if (args.scene) {
  jobs.push({ scene: args.scene, biome: args.biome || 'dune' });
} else {
  for (const s of SCENES) jobs.push({ scene: s, biome: args.biome || (s === 'kiln' ? 'kiln' : s === 'glass' ? 'abyss' : 'dune') });
}


/* ------------------------------------------------------------------ gates */
/**
 * V-FLIP GATE. The board was once rendered upside down: the sim piles sand at
 * the BOTTOM (grid row 0 is the ceiling) and the renderer drew it across the
 * top, because a GL texture's row 0 is its BOTTOM. Settled convention, in one
 * place only — RESOLVE_FS does `cell = v_uv * u_grid`, so cell.y counts UP from
 * the floor and the texture row is `rows - 1 - cell.y`. Nothing else flips.
 *
 * The gate does not eyeball anything: it renders an empty board and a board
 * with material in the bottom 10 rows ONLY, diffs the two framebuffers, and
 * asserts the difference mass is in the bottom of the image. Verified to FAIL
 * on the flipped build before it was trusted on the fixed one.
 */
async function vflipGate(cdp, base) {
  await cdp.goto(`${base}/dev/gfx.html?preserve=1&dpr=1&scene=empty&biome=dune&anim=0&bot=0&t=3.5`);
  if (!await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000)) throw new Error('harness never became ready');
  const r = await cdp.eval(`(async () => {
    const g = window.__gfx;
    g.hidePanel();
    const grab = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const c = document.getElementById('gl');
      const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
      const x = o.getContext('2d'); x.drawImage(c, 0, 0);
      res(x.getImageData(0, 0, o.width, o.height));
    })));
    g.build('empty');  const A = await grab();
    g.build('vflip');  const B = await grab();
    const w = A.width, h = A.height;
    const rows = new Float64Array(h);
    let total = 0;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        s += Math.abs(B.data[i] - A.data[i]) + Math.abs(B.data[i+1] - A.data[i+1]) + Math.abs(B.data[i+2] - A.data[i+2]);
      }
      rows[y] = s; total += s;
    }
    let acc = 0, mean = 0, bottom = 0;
    for (let y = 0; y < h; y++) { mean += rows[y] * y; if (y > h * 0.5) bottom += rows[y]; }
    // ImageData row 0 is the TOP of the canvas, so a big meanY means low on screen.
    return { h, total, meanY: total ? mean / total : 0, bottomFrac: total ? bottom / total : 0 };
  })()`);
  const ok = r.total > 1e5 && r.bottomFrac > 0.70 && r.meanY > r.h * 0.65;
  console.log('v-flip gate: mass %s%% in the lower half, mean row %s of %d (%s)',
    (r.bottomFrac * 100).toFixed(1), r.meanY.toFixed(0), r.h, ok ? 'PASS' : 'FAIL');
  if (!ok) {
    console.log('  the bottom 10 grid rows must light the BOTTOM of the image.');
    console.log('  diff signal=%s bottomFrac=%s (need >0.70) meanY/h=%s (need >0.65)',
      r.total.toFixed(0), r.bottomFrac.toFixed(3), (r.meanY / r.h).toFixed(3));
  }
  return ok;
}

/**
 * BOARD-RECT GATE. The renderer used to compute its OWN letterbox fit —
 * `Math.min(vw/cols, vh/rows) * 0.985`, centred — while core/viewport.js
 * computed a different one that respects the safe-area insets and biases the
 * board upward. input.js converts touches through view.board and the shell
 * anchors its controls to it, so every touch was ~16 px off what was drawn.
 * view.board is now the only board rect there is, and this proves it.
 *
 * It does not eyeball anything: it fills every cell, diffs against an empty
 * board, and finds the drawn edges from the row/column diff profiles at half
 * the plateau — a threshold the bloom halo outside the lip never reaches.
 * Falsify with --falsify=rect, which hands the renderer a 0.985-shrunk rect
 * through dev/gfx.html's ?boardfudge= while the gate still reads view.board.
 */
async function boardRectGate(cdp, base, fudge, vp) {
  await cdp.viewport(vp[0], vp[1], 1, true);
  const q = new URLSearchParams({ preserve: '1', dpr: '1', scene: 'empty', biome: 'dune', anim: '0', bot: '0', t: '3.5' });
  if (fudge) q.set('boardfudge', String(fudge));
  await cdp.goto(`${base}/dev/gfx.html?${q}`);
  if (!await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000)) throw new Error('harness never became ready');
  const r = await cdp.eval(`(async () => {
    const g = window.__gfx;
    g.hidePanel();
    const grab = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const c = document.getElementById('gl');
      const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
      const x = o.getContext('2d'); x.drawImage(c, 0, 0);
      res(x.getImageData(0, 0, o.width, o.height));
    })));
    g.build('empty'); const A = await grab();
    g.build('full');  const B = await grab();
    const w = A.width, h = A.height;
    const cols = new Float64Array(w), rows = new Float64Array(h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.abs(B.data[i] - A.data[i]) + Math.abs(B.data[i+1] - A.data[i+1]) + Math.abs(B.data[i+2] - A.data[i+2]);
      cols[x] += d; rows[y] += d;
    }
    // half-plateau edge finder: the fill is a solid rectangle, so each profile
    // is a plateau with steep sides. The median of the middle half is the
    // plateau height whatever the vignette does to the corners.
    const edges = (p) => {
      const n = p.length;
      const mid = [...p].slice(Math.floor(n * 0.25), Math.ceil(n * 0.75)).sort((a, b) => a - b);
      const plateau = mid[mid.length >> 1];
      if (!(plateau > 0)) return null;
      const th = plateau * 0.5;
      let lo = 0, hi = n - 1;
      while (lo < n && p[lo] < th) lo++;
      while (hi >= 0 && p[hi] < th) hi--;
      return { lo, hi, plateau };
    };
    const ex = edges(cols), ey = edges(rows);
    const s = document.getElementById('gl').width / g.view.w;   // css px -> device px
    const b = g.view.board;
    return { ex, ey, s, w, h,
      want: { x0: b.x * s, x1: (b.x + b.w) * s, y0: b.y * s, y1: (b.y + b.h) * s } };
  })()`);
  if (!r || !r.ex || !r.ey) { console.log('board-rect gate: no diff signal at all (FAIL)'); return false; }
  // profile index i covers [i, i+1), so the drawn span is [lo, hi+1)
  const got = { x0: r.ex.lo, x1: r.ex.hi + 1, y0: r.ey.lo, y1: r.ey.hi + 1 };
  const TOL = 2.0;
  const err = {
    left: got.x0 - r.want.x0, right: got.x1 - r.want.x1,
    top: got.y0 - r.want.y0, bottom: got.y1 - r.want.y1,
  };
  const worst = Math.max(...Object.values(err).map(Math.abs));
  const ok = worst <= TOL;
  console.log('board-rect gate %dx%d: drawn %s vs view.board %s — worst edge %s px (%s)',
    vp[0], vp[1],
    `[${got.x0},${got.y0},${got.x1},${got.y1}]`,
    `[${r.want.x0.toFixed(1)},${r.want.y0.toFixed(1)},${r.want.x1.toFixed(1)},${r.want.y1.toFixed(1)}]`,
    worst.toFixed(1), ok ? 'PASS' : 'FAIL');
  if (!ok) {
    console.log('  the drawn board MUST be view.board. Edge errors (drawn - view, px):');
    console.log('   left %s  right %s  top %s  bottom %s   (tolerance %s)',
      err.left.toFixed(1), err.right.toFixed(1), err.top.toFixed(1), err.bottom.toFixed(1), TOL);
  }
  return ok;
}

const { cdp, base, close } = await harness({ gpu: !!args.gpu });
let failed = false;
try {
  await cdp.viewport(W, H, 1, true);
  const tag = args.tag ? args.tag + '_' : '';

  if (args.check) {
    if (!await vflipGate(cdp, base)) failed = true;
    const fudge = args.falsify === 'rect' ? 0.985 : 0;
    // 390x844 letterboxes the board VERTICALLY (a real phone); 900x520 letterboxes
    // it HORIZONTALLY. One shape alone leaves two of the four edges untested,
    // and the bottom and the sides were both wrong.
    let rectOk = true;
    for (const vp of [[390, 844], [900, 520]]) {
      if (!await boardRectGate(cdp, base, fudge, vp)) rectOk = false;
    }
    await cdp.viewport(W, H, 1, true);
    if (fudge) {
      // the falsification arm passes only when the gate goes RED
      console.log('falsify=rect: gate went %s (%s)', rectOk ? 'GREEN' : 'RED', rectOk ? 'FAIL — the gate is not evidence' : 'PASS');
      if (rectOk) failed = true;
    } else if (!rectOk) failed = true;
    if (!args.all && !args.scene && !args.perf) jobs.length = 0;
  }

  for (const j of jobs) {
    const q = new URLSearchParams({
      preserve: '1', dpr: '1', scene: j.scene, biome: j.biome,
      anim: args.anim ? '1' : '0', bot: '0', seed: String(args.seed || 7),
    });
    if (args.q) q.set('q', args.q);
    if (args.dt) q.set('dt', args.dt);
    if (args.tint) q.set('tint', args.tint);
    for (const k of ['ptint', 'fill', 'py', 'ticks', 'tints']) if (args[k]) q.set(k, args[k]);
    // Pin the renderer clock so two captures of the same build are the same
    // image. Without it the haze, motes and grain move between runs and any
    // diff measures dust. --anim wants motion, so it opts out.
    if (!args.anim) q.set('t', String(args.t || 6.0));

    await cdp.goto(`${base}/dev/gfx.html?${q}`);
    const ok = await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000);
    if (!ok) { console.log(`  !! ${j.scene}/${j.biome} never became ready`); continue; }
    if (!args.panel) await cdp.eval('window.__gfx.hidePanel()');
    await cdp.frames(+(args.frames || 8));

    const file = join(SHOTS, `${tag}${j.scene}_${j.biome}.png`);
    await cdp.capture(file, '#gl');
    console.log(`  ${j.scene.padEnd(9)} ${j.biome.padEnd(6)} -> shots/${tag}${j.scene}_${j.biome}.png`);
  }

  if (args.perf) {
    const q = new URLSearchParams({
      preserve: '1', dpr: '1', scene: args.scene || 'mixed', biome: args.biome || 'dune', bot: '1', seed: '7',
    });
    if (args.q) q.set('q', args.q);
    await cdp.goto(`${base}/dev/gfx.html?${q}`);
    await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000);
    await cdp.frames(90);            // let the tier probe settle first
    await cdp.eval('window.__gfx.R.stats && 1');
    await cdp.frames(200);
    const s = await cdp.eval('JSON.stringify(window.__gfx.stats())');
    const st = JSON.parse(s);
    console.log('\nperf  (%s, %dx%d dpr1, %s)', args.gpu ? 'ANGLE Metal' : 'SwiftShader — numbers are NOT device-representative', W, H, st.tier);
    for (const k of ['fps', 'frameMs', 'frameP95', 'cpuP95', 'gpuP95', 'gpuSupported', 'uploadMs', 'passes', 'motes', 'verdict']) {
      console.log('  %s %s', String(k).padEnd(13), typeof st[k] === 'number' ? st[k].toFixed(2) : st[k]);
    }
  }

  const errs = cdp.errors.filter((e) => !/favicon/.test(e));
  if (errs.length) { console.log('\nconsole errors:'); errs.slice(0, 12).forEach((e) => console.log('  ' + e)); }
  else console.log('\nno console errors');
  const off = cdp.offOrigin(base);
  console.log(off.length ? `OFF-ORIGIN REQUESTS: ${off.join(', ')}` : 'no off-origin requests');
} catch (e) {
  // process.exit() in finally kills the process before an uncaught throw prints,
  // which reads as a silent success. Never let that happen again.
  console.error('gfx_shot failed:', e && e.stack || e);
  failed = true;
} finally {
  close();
  process.exit(failed ? 1 : 0);
}
