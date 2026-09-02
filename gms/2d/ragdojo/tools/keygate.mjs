#!/usr/bin/env node
/** Desktop keyboard: every punch key, every special key, and the number badges on the strip. */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(900, 460, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1&level=0`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.frames(30);

  const press = async (key) => {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key.length === 1 ? key : undefined });
    await c.frames(2);
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
    await c.frames(2);
  };
  const rest = async () => {
    await c.eval(`(()=>{ const p = window.__ragdojo.match.player; p.attack = null; p.cd = {}; })()`);
    await c.frames(2);
  };

  for (const [key, label] of [[' ', 'space'], ['j', 'J'], ['r', 'R'], ['0', '0']]) {
    await rest();
    await press(key);
    const struck = await c.eval(`!!window.__ragdojo.match.player.attack`);
    ok(`${label} punches`, struck);
  }

  // 1-8 must each fire their own special, in the order the shop and the strip show them.
  const expected = ['power', 'toss', 'rise', 'dash', 'flipF', 'slam', 'flipB', 'bomb'];
  for (let i = 0; i < expected.length; i++) {
    await rest();
    await press(String(i + 1));
    const key = await c.eval(`window.__ragdojo.match.player.attack?.key || ''`);
    ok(`key ${i + 1} fires ${expected[i]}`, key === expected[i], `got "${key}"`);
  }

  // Movement, both layouts.
  for (const [key, want] of [['a', -1], ['d', 1], ['ArrowLeft', -1], ['ArrowRight', 1]]) {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key.length === 1 ? key : undefined });
    await c.frames(4);
    const mx = await c.eval(`window.__input ? window.__input.moveX : null`);
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
    await c.frames(2);
    ok(`${key} moves ${want < 0 ? 'left' : 'right'}`, Math.sign(mx) === want, `moveX=${mx}`);
  }

  // Key badges are a desktop affordance: they must appear with a mouse and NOT on a phone.
  const kb = `(async()=>{ const m = await import('/js/input.js'); return m.hasKeyboard() })()`;
  ok('key badges are hidden under touch emulation', (await c.eval(kb)) === false);
  await c.viewport(900, 460, 1, false);
  await c.frames(4);
  ok('key badges appear on a mouse-and-keyboard viewport', (await c.eval(kb)) === true);

  log(c.errors.length ? `\nCONSOLE ERRORS:\n${c.errors.slice(0, 5).join('\n')}` : '\nno console errors');
  if (c.errors.length) fail++;
  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
