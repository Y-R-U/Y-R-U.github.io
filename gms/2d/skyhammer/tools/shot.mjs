#!/usr/bin/env node
/**
 * Capture. Everything about HOW is in cdp.mjs; this is the command line.
 *
 *   node tools/shot.mjs --url /index.html --out shots/p2 [options]
 *
 *   --url  <path|url>   path is resolved against the built-in static server
 *   --size 390x844      repeatable
 *   --dpr  1            device scale factor (1 under SwiftShader — see cdp.mjs)
 *   --at   0,2,5        seconds to capture at, repeatable
 *   --eval "<js>"       run after load, before capturing; awaited
 *   --wait 1200         ms to settle after load
 *   --name shot         filename prefix
 *   --gpu               real GPU (ANGLE Metal) instead of SwiftShader
 *   --state             print window.__state as JSON with each capture
 *   --console           print the page console
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';

const a = { sizes: [], at: [], out: 'shots/p2', wait: 1200, name: 'shot', evals: [], dpr: 1, url: '/index.html' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i], v = argv[i + 1];
  if (k === '--url') { a.url = v; i++; }
  else if (k === '--out') { a.out = v; i++; }
  else if (k === '--size') { a.sizes.push(v); i++; }
  else if (k === '--dpr') { a.dpr = Number(v); i++; }
  else if (k === '--at') { a.at.push(...v.split(',').map(Number)); i++; }
  else if (k === '--eval') { a.evals.push(v); i++; }
  else if (k === '--wait') { a.wait = Number(v); i++; }
  else if (k === '--name') { a.name = v; i++; }
  else if (k === '--gpu') a.gpu = true;
  else if (k === '--state') a.state = true;
  else if (k === '--console') a.console = true;
}
if (!a.sizes.length) a.sizes.push('390x844');
if (!a.at.length) a.at.push(0);

const { cdp, base, close } = await harness({ gpu: a.gpu });
mkdirSync(a.out, { recursive: true });
const written = [];

try {
  for (const size of a.sizes) {
    const [w, h] = size.split('x').map(Number);
    await cdp.viewport(w, h, a.dpr, w < 700);

    // ?preserve=1 keeps the drawing buffer (gotcha 2); ?dpr= pins the ratio.
    const url = /^https?:/.test(a.url) ? a.url : base + a.url;
    const sep = url.includes('?') ? '&' : '?';
    await cdp.goto(`${url}${sep}preserve=1&dpr=${a.dpr}&nosave`);
    await sleep(a.wait);

    for (const js of a.evals) {
      try { await cdp.eval(js); } catch (e) { console.log('[EVAL ERROR] ' + e.message); }
    }

    let prev = 0;
    for (const t of a.at) {
      if (t > prev) await sleep((t - prev) * 1000);
      prev = t;
      const file = `${a.out}/${a.name}_${w}x${h}_t${String(t).replace('.', 'p')}.png`;
      const got = await cdp.capture(file);
      if (got) written.push(got); else console.log('[SHOT] no canvas');
      if (a.state) {
        const s = await cdp.state();
        writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify(s, null, 1));
        console.log(`${w}x${h} t${t}  fps ${s?.fps?.toFixed(1)}  draws ${s?.drawCalls}  zoom ${s?.cam?.zoom?.toFixed(3)}`);
      }
    }
  }

  if (a.console && cdp.logs.length) {
    console.log('--- page console ---');
    for (const l of cdp.logs.slice(0, 100)) console.log(l);
  } else if (cdp.errors.length) {
    console.log(`--- ${cdp.errors.length} page error(s) ---`);
    for (const l of cdp.errors.slice(0, 20)) console.log(l);
  }
  const off = cdp.offOrigin(base);
  if (off.length) console.log('OFF-ORIGIN REQUESTS: ' + off.join(', '));
} finally {
  close();
}

console.log(written.join('\n'));
process.exit(0);
