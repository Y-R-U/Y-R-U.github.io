#!/usr/bin/env node
// Plays the `listen` format inside the real shell (music packs injected until data/music is indexed) and screenshots it.
//   node tools/au_shell.mjs [outDir]     (cdp on port 9405)
import { connect } from './au_cdp.mjs';

const OUT = process.argv[2] || '/tmp/au_shell';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const c = await connect(9405);
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, m) => { console.log((cond ? 'PASS ' : 'FAIL ') + m); if (!cond) fails++; };

async function boot(kids = false) {
  await c.goto(URL, 'window.__cluedReady === true');
  await c.evaluate(`localStorage.setItem('clued.settings', JSON.stringify({ sound: true, kids: ${kids} })); true`);
  await c.goto(URL, 'window.__cluedReady === true');
  await c.evaluate(`(async () => {
    const P = globalThis.__cluedPacks; const { summarize } = await import('./js/core/packs.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1));
    for (const id of ['hits-1980s','hits-2010s','classical-piano','nursery-rhymes','anthems','kids-film-tv','screen-themes','music-artists']) {
      const p = await (await fetch('data/music/' + id + '.json')).json();
      P.packs.set(id, p); P.index.packs[id] = { ...summarize(p), id };
    }
    return true; })()`);
}

for (const [mode, vp] of [['portrait', [384, 854]], ['landscape', [854, 384]], ['desktop', [1280, 800]]]) {
  await boot();
  await c.send('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 2, mobile: vp[0] < 900 });
  const packs = mode === 'landscape' ? ['classical-piano'] : mode === 'desktop' ? ['anthems'] : ['hits-1980s', 'hits-2010s'];
  await c.evaluate(`window.__clued.start({ structure: 'quick', format: 'listen', packs: ${JSON.stringify(packs)}, count: 3, opts: { clip: 10, art: 'blur' } }); true`);
  let t0 = Date.now(), seen = false;
  while (Date.now() - t0 < 30000) { await sleep(400); if (await c.evaluate('!!document.querySelector(".au-listen")')) { seen = true; break; } }
  ok(seen, `${mode}: listen question rendered`);
  for (let i = 0; i < 25 && !(await c.evaluate("+getComputedStyle(document.querySelector('.au-ring')).getPropertyValue('--p') > 0.1")); i++) await sleep(400);
  const st = await c.evaluate(`({ p: +getComputedStyle(document.querySelector('.au-ring')).getPropertyValue('--p'), s: document.querySelector('.au-status').textContent, prompt: document.querySelector('.q-prompt').textContent, n: document.querySelectorAll('.choice').length })`);
  ok(st.p > 0.1, `${mode}: clip playing (progress ${st.p.toFixed(2)}, "${st.s}", "${st.prompt}", ${st.n} answers)`);
  await c.screenshot(`${OUT}/${mode}-q.png`, vp[0], vp[1]);
  await c.evaluate(`document.querySelectorAll('.choice')[0].click(); true`);
  for (let i = 0; i < 16 && !(await c.evaluate("!!document.querySelector('.reveal.show .au-rv')")); i++) await sleep(250);
  const rv = await c.evaluate(`({ rv: !!document.querySelector('.reveal.show .au-rv'), apple: !!document.querySelector('.reveal.show .au-apple'), pts: document.querySelector('.reveal.show .pts')?.textContent || '' })`);
  ok(rv.rv, `${mode}: reveal card has the AU block (apple badge ${rv.apple}, ${rv.pts})`);
  await c.screenshot(`${OUT}/${mode}-reveal.png`, vp[0], vp[1]);
}

await boot(true);
await c.send('Emulation.setDeviceMetricsOverride', { width: 384, height: 854, deviceScaleFactor: 2, mobile: true });
await c.evaluate(`window.__clued.start({ structure: 'quick', format: 'listen', packs: ['nursery-rhymes', 'kids-film-tv'], count: 3, kids: true, opts: {} }); true`);
await sleep(6000);
const k = await c.evaluate(`({ n: document.querySelectorAll('.choice').length, again: document.querySelector('.au-again')?.textContent })`);
ok(k.n >= 2 && k.n <= 3, `kids: ${k.n} answers`);
await c.screenshot(`${OUT}/kids-q.png`, 384, 854);
console.log(c.logs.filter((l) => /EXC|error/i.test(l)).slice(0, 8).join('\n'));
console.log(fails ? `${fails} FAILED` : 'all passed');
c.close();
process.exit(fails ? 1 : 0);
