import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, stop, openPage, GAME, ORIGIN, VIEWPORTS, sleep } from './cdp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

console.log('static');
const BUILD = readFileSync(join(ROOT, 'js/core/version.js'), 'utf8').match(/BUILD = '([^']+)'/)[1];
const files = walk(join(ROOT, 'js'));
let badImports = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) {
    if (!m[1].endsWith('?v=' + BUILD)) badImports.push(relative(ROOT, f) + ' → ' + m[1]);
  }
  const rel = relative(ROOT, f);
  if (/^js\/(state|data)\//.test(rel) && /\bdocument\.|\bwindow\.|THREE\.|Date\.now|Math\.random/.test(src)) badImports.push(rel + ' is not pure');
  if (/^js\/(state|data)\//.test(rel) && /from\s*['"]\.\.\/(render|ui|core)\//.test(src)) badImports.push(rel + ' imports another layer');
}
check(!badImports.length, `every relative import carries ?v=${BUILD}; layer rules hold` + (badImports.length ? '\n    ' + badImports.join('\n    ') : ''));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
check(!/cdn|unpkg|jsdelivr/i.test(html) && html.includes('/gms/lib/three/0.160.0/three.module.js'), 'three is local, no CDN');

const port = launch();
try {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    console.log(`${name} ${vp.width}x${vp.height}`);
    const page = await openPage(port);
    const t0 = Date.now();
    await page.goto(GAME + '?nosave=1&debug=1', vp);
    let ready = false;
    try { ready = await page.wait('window.__iw2 && window.__iw2.ready', 8000); } catch {}
    check(ready, `__iw2.ready (${Date.now() - t0} ms)`);
    if (ready) {
      await sleep(1500);
      const r = await page.eval(`(() => {
        const h = __iw2.host, d = h.debug;
        const vis = d.listViews().filter(v => v.visible);
        return {
          nLines: __iw2.game.data.lines.length, views: d.views, frames: d.frames, presented: d.presented, calls: d.calls, tris: d.tris, tier: d.tier, dpr: d.dpr,
          bootHidden: document.getElementById('boot').hidden,
          vis: vis.map(v => ({ id: v.id, presented: v.presented, w: v.w, h: v.h, ...d.sample(v.id) })),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      })()`);
      console.log(`    views=${r.views} visible=${r.vis.length} frames=${r.frames} presented=${r.presented} calls=${r.calls} tris=${r.tris} tier=${r.tier} dpr=${r.dpr}`);
      check(r.views === r.nLines + 1, `${r.nLines + 1} views registered (hero + ${r.nLines} lines), got ${r.views}`);
      check(r.vis.some((v) => v.id === 'hero') && r.vis.length >= 2, `hero + at least one card visible (${r.vis.length})`);
      for (const v of r.vis) check(v.presented > 0 && v.lum > 0.05 && v.alpha === 255, `${v.id} presented ${v.presented}x, lum ${v.lum.toFixed(2)}, alpha ${v.alpha}`);
      check(r.bootHidden, 'boot panel hidden');
      check(!r.overflow, 'no horizontal overflow');

      const t = await page.eval(`(() => {
        const g = __iw2.game;
        const L = g.data.lines[0], n = Math.ceil(L.baseCost / g.data.econ.bootTap);
        let a = true;
        for (let i = 0; i < n; i++) a = g.act('tap').ok && a;
        const b = g.act('unlock', { lineId: L.id });
        return { a, b: b.ok, owned: g.stats(L.id).owned };
      })()`);
      check(t.a && t.b && t.owned, 'bootstrap: hero taps → first business bought');
    }
    const ours = (u) => u.startsWith(ORIGIN) || u.startsWith('data:') || u.startsWith('blob:');
    const foreign = page.requests.filter((u) => !ours(u));
    check(!foreign.length, 'all requests same-origin' + (foreign.length ? ': ' + foreign.slice(0, 3).join(', ') : ''));
    const bad = page.consoleLog.filter((c) => (c.type === 'error' || c.type === 'warning') && (!c.url || c.url.startsWith(ORIGIN)));
    check(!bad.length && !page.exceptions.length && !page.failures.length,
      'zero console errors/warnings, exceptions, failed requests' + [...bad.map((c) => c.type + ': ' + c.text), ...page.exceptions, ...page.failures].map((s) => '\n    ' + s).join(''));
    await page.close();
  }
} finally {
  stop(port);
}

console.log(fails.length ? `\nFAILED ${fails.length}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
