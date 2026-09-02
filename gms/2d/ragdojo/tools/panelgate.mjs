#!/usr/bin/env node
/**
 * Every panel closes the same way: an X pinned to its top-right corner, and a tap on the
 * darkened area outside it. The results card keeps its X but is deliberately NOT dismissed
 * by a backdrop tap — after a fight your thumb is already moving.
 *
 *   node tools/panelgate.mjs
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const vis = (id) => `document.getElementById('${id}').classList.contains('show')`;

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(900, 470, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
  await c.eval(`(()=>{ const s = window.__ragdojo.save; s.ink = 9000; s.completed = true; s.everWon = true; })()`);

  const OPEN = { shop: 'btnShop', settings: 'btnSettings', help: 'btnHelp', victory: 'btnTrophy' };
  for (const id in OPEN) {
    await c.eval(`document.getElementById('${OPEN[id]}').click()`);
    await c.frames(6);
    // The X must be in the corner of the sheet, not trailing the title.
    const box = JSON.parse(await c.eval(`(()=>{
      const p = document.getElementById('${id}');
      const sheet = p.querySelector('.sheet'), x = p.querySelector('.close');
      if (!x) return 'null';
      const s = sheet.getBoundingClientRect(), b = x.getBoundingClientRect();
      return JSON.stringify({ top: Math.round(b.top - s.top), right: Math.round(s.right - b.right) });
    })()`));
    ok(`${id} has a close X`, !!box);
    ok(`${id}'s X sits in the top-right corner`, box && box.top < 16 && box.right < 16, JSON.stringify(box));

    // A drag that starts inside the sheet and ends outside must NOT close it.
    await c.eval(`(()=>{
      const p = document.getElementById('${id}'), s = p.querySelector('.sheet');
      const r = s.getBoundingClientRect();
      s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 20, clientY: r.top + 40 }));
      p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 4, clientY: 4 }));
    })()`);
    await c.frames(4);
    ok(`${id} survives a drag that ends off the sheet`, await c.eval(vis(id)));

    await c.eval(`(()=>{
      const p = document.getElementById('${id}');
      p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 4, clientY: 4 }));
      p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 4, clientY: 4 }));
    })()`);
    await c.frames(8);
    ok(`${id} closes on a tap outside it`, !(await c.eval(vis(id))));
  }

  // Results: X yes, backdrop no.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1&level=3`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.frames(20);
  await c.eval(`window.__ragdojo.match.enemies.forEach(e => e.hurt(99999, {from:[0,0], kb:900, stagger:1}))`);
  await c.waitFor('document.getElementById("results").classList.contains("show")', 20000);
  await c.eval(`(()=>{
    const p = document.getElementById('results');
    p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 4, clientY: 4 }));
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 4, clientY: 4 }));
  })()`);
  await c.frames(8);
  ok('the results card ignores a backdrop tap', await c.eval(vis('results')));
  await c.eval(`document.getElementById('btnResClose').click()`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 8000);
  ok('but its X does close it', !(await c.eval(vis('results'))));

  log(c.errors.length ? `\nCONSOLE ERRORS:\n${c.errors.slice(0, 5).join('\n')}` : '\nno console errors');
  if (c.errors.length) fail++;
  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
