#!/usr/bin/env node
// Repeatable graphics-upgrade evidence. Explicitly resets the viewport for EVERY scene;
// the two authored portrait/aspect shots must not change subsequent landscape captures.
// node tools/graphics_capture.mjs --phase=after [--lite] [--portrait] [--headed]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const phase = String(args.phase || 'after');
if (!/^[a-z0-9-]+$/i.test(phase)) throw new Error('phase must be a simple directory name');
const out = resolve(root, 'shots/graphics-upgrade', phase);
const ids = args.shot ? String(args.shot).split(',') :
  ['fog_city', 'canyon_dive', 'hero_craft', 'wet_street', 'cockpit', 'day_smog'];
const portrait = !!args.portrait;
const lite = !!args.lite;
const suffix = portrait ? '-portrait' : lite ? '-low' : '';
const dpr = Number(args.dpr || 1);
const vehicleTime = Number(args['vehicle-time'] || 0.5);
if (!Number.isFinite(vehicleTime)) throw new Error('vehicle-time must be finite');
const summary = [];
mkdirSync(out, { recursive: true });
const ctx = await open({ w: portrait ? 390 : 1280, h: portrait ? 844 : 720,
  dpr, mobile: portrait, headed: !!args.headed });
try {
  for (const id of ids) {
    if (!/^[a-z0-9_]+$/i.test(id)) throw new Error('invalid shot id');
    const spec = JSON.parse(readFileSync(resolve(root, 'shots', id + '.json'), 'utf8'));
    const w = portrait ? 390 : spec.aspect ? 900 : 1280;
    const h = portrait ? 844 : spec.aspect ? Math.round(w / spec.aspect) : 720;
    if (w * h * dpr * dpr > 5e6 && !args.headed) throw new Error('headless capture exceeds safe pixel count');
    ctx.logs.length = 0;
    await ctx.setMetrics(w, h, dpr, portrait);
    await ctx.S('Page.navigate', { url: `${ctx.base}/index.html?shot=${id}&nosave&nohud&dpr=${dpr}${lite ? '&lite=1' : ''}` });
    await waitFor(ctx.S, 'window.__ready', 40000);
    const live = await evalJSON(ctx.S, `window.__game.scenarios.find(s=>s.id===${JSON.stringify(id)})`);
    for (const k of ['seed', 'variant', 'clock', 'pos', 'yaw', 'pitch', 'fov', 'craft', 'hud', 'ref', 'aspect']) {
      if (JSON.stringify(live?.[k]) !== JSON.stringify(spec[k])) throw new Error(`${id}: frozen ${k} drifted`);
    }
    await quiesce(ctx.S);
    await hook(ctx.S, 'freezeTime', true);
    await hook(ctx.S, 'stepVehicles', vehicleTime);
    if (await settle(ctx.S, 45) < 45) throw new Error(`${id}: frame settle timed out`);
    const state = await evalJSON(ctx.S, 'window.__state');
    if (Math.abs(state.craft.t - vehicleTime) > 0.0005) throw new Error(`${id}: vehicle clock was not pinned`);
    const expectedQuality = lite ? 'low' : 'high';
    if (state.quality !== expectedQuality) throw new Error(`${id}: quality ${state.quality}, expected ${expectedQuality}`);
    if (state.errors.length || ctx.logs.length) throw new Error(`${id}: errors ${JSON.stringify({errors:state.errors,console:ctx.logs})}`);
    const { data } = await ctx.S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const name = id + suffix;
    writeFileSync(resolve(out, name + '.png'), Buffer.from(data, 'base64'));
    const meta = { at: new Date().toISOString(), shot: id, spec, w, h, dpr, vehicleTime, mobile: portrait,
      headed: !!args.headed, state, console: [...ctx.logs],
      timing: 'state.ms is CPU submission time; not GPU timing or physical-phone performance' };
    writeFileSync(resolve(out, name + '.stats.json'), JSON.stringify(meta, null, 2));
    summary.push({ name, w, h, dpr, quality: state.quality, fps: state.fps,
      draws: state.draws, tris: state.tris, errors: state.errors });
    writeFileSync(resolve(out, '_summary' + suffix + '.json'), JSON.stringify(summary, null, 2));
    console.log(`${name}: ${w}x${h}@${dpr}, ${state.draws} draws, ${state.tris} tris, ${state.fps} fps`);
  }
} finally {
  await ctx.close();
}
