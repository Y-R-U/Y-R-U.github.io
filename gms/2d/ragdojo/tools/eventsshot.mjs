// dev/events.html in headless Chrome: phone landscape, real taps, zero console errors, screenshots.
//   node tools/eventsshot.mjs [outdir]
import { serve, CDP, ROOT } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const out = process.argv[2] || join(ROOT, 'shots');
mkdirSync(out, { recursive: true });
const srv = await serve(ROOT, +(process.env.PORT || 0));
const cdp = await CDP.launch({ gpu: true });
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };
try {
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.viewport(844, 390, 2, true);
  await cdp.goto(`${srv.base}/dev/events.html?now=2026-10-13T09:00:00Z`);
  await cdp.waitFor('!!window.__ev');
  await cdp.eval('localStorage.clear(); document.getElementById("reset").click()');
  await sleep(600);
  await cdp.shot(join(out, 'ev_vines_start.png'));
  const tap = async (sel) => {
    const r = await cdp.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
    for (const type of ['touchStart', 'touchEnd'])
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: r[0], y: r[1] }] });
    await sleep(120);
  };
  for (const s of ['[data-res=win]', '[data-res=loss]', '[data-res=close]']) await tap(s);
  const txt = (id) => cdp.eval(`document.getElementById(${JSON.stringify(id)}).textContent`);
  check(await txt('rolls') === '3' && await txt('turn') === '1', 'a 3-point win opens turn 1 with 3 rolls');
  const shownMax = async () => Math.max(...await cdp.eval('[...document.querySelectorAll("#rivals div")].map(d => +d.textContent.match(/turn (\\d+)\\//)[1])'));
  for (let i = 0; i < 2; i++) { await tap('#roll'); await sleep(2600); }
  check(await txt('turn') === '1' && await txt('rolls') === '1' && await shownMax() === 0, 'mid-turn: nobody else has moved');
  await tap('#roll'); await sleep(2600);
  check(await txt('turn') === '2' && await txt('rolls') === '1' && await shownMax() === 1, 'end of turn 1: rivals shown at turn 1, turn 2 has 1 roll');
  await tap('#roll'); await sleep(2600);
  const turn = await txt('turn'), left = await txt('rolls');
  check(turn === '3' && left === '2' && await shownMax() === 2, `after the 1-point battle: on turn 3 with 2 rolls, others at turn 2, saw ${turn}/${left}`);
  await cdp.shot(join(out, 'ev_vines_turn4.png'));
  await tap('#others'); await tap('#others'); await sleep(300);
  const shown = await cdp.eval('[...document.querySelectorAll("#rivals div")].map(d => +d.textContent.match(/turn (\\d+)\\//)[1])');
  check(shown.length === 10 && shown.every((t) => t <= 2), `rivals shown no further than turn 2: ${shown}`);
  await cdp.shot(join(out, 'ev_vines_others.png'));
  await tap('[data-tab=reveal]');
  const cells = [0, 12, 9, 16, 23, 2, 20];  // 6 points banked
  const pr = await cdp.eval('window.__ev.picRect()');
  for (const c of cells) {
    const x = pr.x + (c % 5 + 0.5) * pr.w / 5, y = pr.y + (Math.floor(c / 5) + 0.5) * pr.h / 5;
    for (const type of ['touchStart', 'touchEnd'])
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await sleep(100);
  }
  const open = await cdp.eval(`window.__ev.st.ev[window.__ev.REV].open`);
  check(JSON.stringify(open) === JSON.stringify(cells.slice(0, 6)), `6 points open the first 6 tapped squares, got ${JSON.stringify(open)}`);
  await sleep(300);
  await cdp.shot(join(out, 'ev_reveal.png'));
  await cdp.viewport(390, 844, 2, true); await sleep(500);
  await cdp.shot(join(out, 'ev_portrait.png'));
  await cdp.viewport(667, 375, 2, true); await sleep(300); await cdp.eval('document.querySelector("[data-tab=vines]").click()'); await sleep(500);
  await cdp.shot(join(out, 'ev_small_landscape.png'));
  check(cdp.errors.length === 0, `console errors: ${JSON.stringify(cdp.errors)}`);
} finally { cdp.close(); srv.close(); }
console.log(fails ? `${fails} failed` : 'events preview ok');
process.exit(fails ? 1 : 0);
