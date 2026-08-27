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
const BIOMES = ['dune', 'abyss', 'kiln'];
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

const { cdp, base, close } = await harness({ gpu: !!args.gpu });
let failed = false;
try {
  await cdp.viewport(W, H, 1, true);
  const tag = args.tag ? args.tag + '_' : '';

  if (args.check) {
    if (!await vflipGate(cdp, base)) failed = true;
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
