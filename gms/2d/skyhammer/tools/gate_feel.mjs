#!/usr/bin/env node
/**
 * Manager gate for haptics: does a hit actually buzz, and does the setting actually stop it?
 *
 *   node tools/gate_feel.mjs            run the checks
 *   node tools/gate_feel.mjs --falsify  leave haptics ON while claiming it is off
 *
 * navigator.vibrate is a no-op in headless Chrome, so it is stubbed and counted. That is the
 * only way to tell "wired up" from "silently doing nothing", which is exactly what the Haptics
 * setting was doing before this gate existed.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';

const FALSIFY = process.argv.includes('--falsify');
const { cdp, base, close } = await harness({ gpu: true });
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

try {
  await cdp.viewport(844, 390, 1, true);
  // the stub has to exist BEFORE the modules evaluate: haptics.js latches typeof navigator.vibrate
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__vibes = []; navigator.vibrate = (p) => { window.__vibes.push(p); return true; };`,
  });
  await cdp.goto(`${base}/index.html?level=a1-01&nosave&preserve=1&dpr=1`);
  await sleep(1400);
  await cdp.eval(`document.getElementById('tapbtn').click()`);
  await sleep(900);

  const avail = await cdp.eval(`(async () => (await import('/js/core/haptics.js')).haptics.available)()`);
  check('haptics module sees navigator.vibrate', avail === true, `available=${avail}`);

  // haptics ON: hurt the player and count the buzzes
  await cdp.eval(`(async () => { const P = await import('/js/ui/prefs.js'); P.setPref('haptics', true); })()`);
  await cdp.eval(`window.__vibes.length = 0`);
  await cdp.eval(`(async () => { const D = await import('/js/sim/damage.js');
    for (let i = 0; i < 4; i++) D.applyDamage(__game.world, __game.world.player, 3, 1, 'gate'); })()`);
  await sleep(500);
  const on = await cdp.eval(`window.__vibes.length`);
  check('a hit on the player buzzes', on > 0, `${on} vibrate call(s)`);

  // haptics OFF: the same damage must produce nothing
  await cdp.eval(`(async () => { const P = await import('/js/ui/prefs.js'); P.setPref('haptics', ${FALSIFY ? 'true' : 'false'}); })()`);
  await cdp.eval(`window.__vibes.length = 0`);
  await cdp.eval(`(async () => { const D = await import('/js/sim/damage.js');
    for (let i = 0; i < 4; i++) D.applyDamage(__game.world, __game.world.player, 3, 1, 'gate'); })()`);
  await sleep(500);
  const off = await cdp.eval(`window.__vibes.length`);
  check('the Haptics setting actually silences it', off === 0, `${off} vibrate call(s) with the switch off`);

  if (cdp.errors.length) console.log(`\n--- ${cdp.errors.length} page error(s) ---\n` + cdp.errors.slice(0, 6).join('\n'));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exitCode = bad.length ? 1 : 0;
} finally { close(); }
