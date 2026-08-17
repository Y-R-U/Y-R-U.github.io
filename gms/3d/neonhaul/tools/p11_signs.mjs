// P11 — what sizes is the signage actually spanning? ART_PASS item 2 is "the occasional big
// sign", and 746850_03 spans roughly 30x from a street blade to the ENFIELD board. This walks the
// live sign meta around a named world position and prints the distribution, so "we added big
// signs" is a measurement and not an impression.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, waitFor, settle, evalJSON, quiesce, cleanup } from './shot.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `=${d}`).split('=').slice(1).join('=');

async function main() {
  const pos = arg('pos', '1350,320,180').split(',').map(Number);
  const ctx = await open({ w: 900, h: 506, dpr: 1, headed: false });
  const { S, base, close } = ctx;
  await S('Page.navigate', { url: `${base}/index.html?dpr=1&nohud&nosave&var=stormnight&freecam=1&debug=1` });
  await waitFor(S, 'window.__ready', 30000);
  await evalJSON(S, `(window.__game.setCamera({pos:[${pos.join(',')}],yaw:0,pitch:-20,fov:64}),1)`);
  await quiesce(S, { label: 'p11/signs' });
  await settle(S, 30);
  const meta = await evalJSON(S, 'window.__game.signMeta()');

  const by = {};
  for (const m of meta) {
    const k = m.cls === 'megahero' ? 'L5 megahero (landmark)' : `L${m.layer} ${m.kind}`;
    (by[k] = by[k] || []).push(Math.max(m.w, m.h));
  }
  const rows = Object.entries(by).map(([k, v]) => {
    v.sort((a, b) => a - b);
    return { class: k, n: v.length, min: +v[0].toFixed(1), median: +v[(v.length / 2) | 0].toFixed(1), max: +v[v.length - 1].toFixed(1) };
  }).sort((a, b) => a.max - b.max);
  const all = meta.map(m => Math.max(m.w, m.h)).sort((a, b) => a - b);
  console.log(rows.map(r => `${r.class.padEnd(24)} n=${String(r.n).padStart(5)}  ${r.min} / ${r.median} / ${r.max} m`).join('\n'));
  console.log(`\nlargest dimension across ALL ${all.length} signs: ${all[0].toFixed(1)} m → ${all[all.length - 1].toFixed(1)} m  = ${(all[all.length - 1] / all[0]).toFixed(1)}x span`);
  console.log(`heroes >= 100 m: ${all.filter(v => v >= 100).length}    >= 140 m: ${all.filter(v => v >= 140).length}`);
  await close();
}

main().catch(e => { console.error(e.message); cleanup(); process.exit(1); });
