// node tools/engine_light_bench.mjs: cost of a 64x16x64 m Build fill + its relight (sync world, no workers)
import { World } from '../js/world/world.js';
import { BLOCK } from '../js/data/blocks.js';
import { PerformanceObserver } from 'node:perf_hooks';
let gcN = 0, gcMs = 0;
new PerformanceObserver((l) => { for (const e of l.getEntries()) { gcN++; gcMs += e.duration; } }).observe({ entryTypes: ['gc'] });
const w = new World({ seed: 'bugstamp', mode: 'build', sync: true });
w.deferLightOver = 1e12; // run relight synchronously so the timing includes it
w.ensureArea(40, 0, 6);
const S = 4, y = 50;
let lightMs = 0;
const orig = w._afterEdit.bind(w);
w._afterEdit = (cells) => { const t = performance.now(); orig(cells); lightMs += performance.now() - t; };
const runs = [];
for (const [dx, m] of [[0, BLOCK.BASALT_MATRIX], [0, 0], [-40, BLOCK.POLYMER_BRICK], [0, BLOCK.BASALT_MATRIX], [0, 0]]) {
  const h0 = process.memoryUsage().heapUsed, g0 = gcN; lightMs = 0;
  const t = performance.now();
  const r = w.setBox([(dx) * S, y * S, -32 * S], [(dx + 64) * S, (y + 16) * S, 32 * S], m, 'fill', {});
  w.finishLight();
  runs.push({ mat: m, ms: +(performance.now() - t).toFixed(1), lightMs: +lightMs.toFixed(1), changed: r.changed, gcs: gcN - g0, heapMB: +((process.memoryUsage().heapUsed - h0) / 1048576).toFixed(1) });
}
await new Promise((r) => setTimeout(r, 50));
for (const r of runs) console.log(JSON.stringify(r));
console.log('gc total', gcN, gcMs.toFixed(0) + 'ms');
