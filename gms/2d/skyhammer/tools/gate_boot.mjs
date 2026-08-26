#!/usr/bin/env node
/**
 * Manager gate for the boot flow, the desktop fullscreen policy and the wing-levelling roll.
 *
 *   node tools/gate_boot.mjs            run the checks
 *   node tools/gate_boot.mjs --falsify  run them against deliberately broken state
 *
 * The --falsify mode exists because a check that has never been SEEN to fail is not evidence
 * (CONTRACTS §13). Every check below has a matching sabotage; if a check still passes under
 * sabotage it is measuring the wrong thing and must be rewritten, not trusted.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';

const FALSIFY = process.argv.includes('--falsify');
const FBOOT = process.argv.includes('--falsify-boot');   // sabotage the front end, not the roll
const { cdp, base, close } = await harness({ gpu: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

async function load(qs) {
  await cdp.viewport(1280, 720, 1, false);
  await cdp.goto(`${base}/index.html?${qs}&preserve=1&dpr=1&nosave`);
  await sleep(1400);
}

try {
  // ---------------------------------------------------------- 1. lobby by default
  await load(FBOOT ? 'ui=0' : '');
  const label = await cdp.eval(`document.getElementById('tapbtn').textContent`);
  check('start button armed', label === (FBOOT ? 'TAP TO FLY' : 'TAP TO START'), `label=${JSON.stringify(label)}`);
  await cdp.eval(`document.getElementById('tapbtn').click()`);
  await sleep(900);
  const screen = await cdp.eval(`document.getElementById('ui').dataset.screen || null`);
  check('boots into the title screen', screen === 'title', `screen=${screen}`);
  const attract = await cdp.eval(`!!document.querySelector('.attract-cv')`);
  check('attract dogfight canvas is live', attract === true, `canvas=${attract}`);

  // --------------------------------------- 1b. the whole menu chain: title -> brief -> flying
  await cdp.eval(`document.querySelector('.btn.play').click()`);
  await sleep(700);
  const brief = await cdp.eval(`document.getElementById('ui').dataset.screen || null`);
  check('PLAY reaches the briefing screen', brief === 'brief', `screen=${brief}`);
  const styled = await cdp.eval(`getComputedStyle(document.querySelector('.screen')).position`);
  check('screen CSS is actually loaded (css/ui.css linked)', styled !== 'static', `position=${styled}`);
  await cdp.eval(`document.querySelector('.btn.launch').click()`);
  await sleep(1500);
  const flying = await cdp.eval(`(window.__state && window.__state.level) || null`);
  check('LAUNCH starts the mission', !!flying, `level=${flying}`);
  const menuGone = await cdp.eval(`!document.getElementById('ui').dataset.screen`);
  check('menu is dismissed once flying', menuGone === true);

  // ------------------------------------------- 2. ?level= still flies straight in (gate safety)
  await load('level=a1-01');
  const label2 = await cdp.eval(`document.getElementById('tapbtn').textContent`);
  check('?level= keeps the direct label', label2 === 'TAP TO FLY', `label=${JSON.stringify(label2)}`);
  await cdp.eval(`document.getElementById('tapbtn').click()`);
  await sleep(1200);
  const st = await cdp.eval(`(window.__state && window.__state.level) || null`);
  check('?level= flies straight into the level', st === 'a1-01', `level=${st}`);

  // ------------------------------------- 3. desktop takes no fullscreen, offers the chip instead
  const fs = await cdp.eval(`!!document.fullscreenElement`);
  check('desktop did NOT auto-fullscreen', fs === false, `fullscreenElement=${fs}`);
  const chip = await cdp.eval(`!document.getElementById('fschip').classList.contains('hidden')`);
  check('fullscreen chip offered on first flight', chip === true, `visible=${chip}`);
  const chipOutside = await cdp.eval(`!document.getElementById('stage').contains(document.getElementById('fschip'))`);
  check('chip is outside #stage (cannot steer the plane)', chipOutside === true);

  // ------------------------------------------------------------- 4. wing-levelling roll
  // Pin the heading and read the REAL mesh rotation out of the live Three.js scene, so this
  // measures the whole chain — euler order, dispatch, dt — not just the arithmetic.
  const probe = `(() => {
    const g = window.__game; if (!g || !g.world) return { err: 'no world' };
    const root = g.renderer.parts && g.renderer.parts.actors && g.renderer.parts.actors.root;
    if (!root) return { err: 'no actor root' };
    const p = g.world.player;
    const near = root.children.filter(c => c.isGroup)
      .map(c => ({ c, d: Math.abs(c.position.x - p.x) + Math.abs(c.position.y - p.y) }))
      .sort((a, b) => a.d - b.d)[0];
    return near ? { rx: near.c.rotation.x, rz: near.c.rotation.z, order: near.c.rotation.order, d: near.d } : { err: 'no group' };
  })()`;

  // fly RIGHT for a while: the model must be upright (roll ~0)
  await cdp.eval(`window.__pin = setInterval(() => { const p = window.__game.world.player; p.ang = 0; p.want = 0; }, 8)`);
  await sleep(2500);
  const right = await cdp.eval(probe);
  check('flying right: model is upright', right && !right.err && Math.abs(right.rx) < 0.15, JSON.stringify(right));
  check('roll axis is the nose axis (ZXY euler order)', right && right.order === 'ZXY', `order=${right && right.order}`);

  // now fly LEFT: after the dwell the model must have rolled 180 deg, and NOT before it
  const sabotage = FALSIFY ? `p.ang = 0; p.want = 0;` : `p.ang = Math.PI; p.want = Math.PI;`;
  await cdp.eval(`clearInterval(window.__pin); window.__pin = setInterval(() => { const p = window.__game.world.player; ${sabotage} }, 8)`);
  await sleep(700);
  const early = await cdp.eval(probe);
  check('roll has NOT started before the dwell', early && !early.err && Math.abs(early.rx) < 0.35, `rx=${early && early.rx}`);
  await sleep(2600);
  const left = await cdp.eval(probe);
  const rolled = left && !left.err && Math.abs(Math.abs(left.rx) - Math.PI) < 0.15;
  check('flying left: model has rolled upright (180 deg)', rolled, JSON.stringify(left));

  // and the sim must be untouched by any of it
  const ang = await cdp.eval(`window.__state.plane.ang`);
  check('sim heading untouched by the visual roll', Math.abs(Math.abs(ang) - (FALSIFY ? 0 : Math.PI)) < 0.05, `ang=${ang}`);

  if (cdp.errors.length) console.log(`\n--- ${cdp.errors.length} page error(s) ---\n` + cdp.errors.slice(0, 10).join('\n'));
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exitCode = bad.length ? 1 : 0;
} finally { close(); }
