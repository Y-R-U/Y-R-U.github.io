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
 */
import { harness, ROOT } from './cdp.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const SCENES = ['dune', 'tide', 'kiln', 'jelly', 'glass', 'dissolve', 'mixed'];
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

const { cdp, base, close } = await harness({ gpu: !!args.gpu });
try {
  await cdp.viewport(W, H, 1, true);
  const tag = args.tag ? args.tag + '_' : '';

  for (const j of jobs) {
    const q = new URLSearchParams({
      preserve: '1', dpr: '1', scene: j.scene, biome: j.biome,
      anim: args.anim ? '1' : '0', bot: '0', seed: String(args.seed || 7),
    });
    if (args.q) q.set('q', args.q);
    if (args.dt) q.set('dt', args.dt);
    if (args.tint) q.set('tint', args.tint);

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
} finally {
  close();
  process.exit(0);
}
