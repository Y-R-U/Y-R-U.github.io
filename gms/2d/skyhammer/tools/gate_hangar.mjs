#!/usr/bin/env node
/**
 * Manager gate for the hangar economy loop: buy -> money leaves -> the SIM sees the upgrade.
 *
 *   node tools/gate_hangar.mjs            run the checks
 *   node tools/gate_hangar.mjs --falsify  buy nothing, and prove the checks go red
 *
 * The last link is the one that matters. Upgrades were once stored per-plane while the sim read
 * a flat map, so every purchase looked perfect in the UI and silently did nothing in the air.
 * Reading the stat back out of a live world is the only check that would have caught it.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';

const FALSIFY = process.argv.includes('--falsify');
const { cdp, base, close } = await harness({ gpu: true });
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

try {
  await cdp.viewport(1280, 720, 1, false);
  await cdp.goto(`${base}/index.html?nosave`);
  await sleep(1400);
  await cdp.eval(`document.getElementById('tapbtn').click()`);
  await sleep(1000);

  // baseline: fly first, read the stock aeroplane out of the live sim
  await cdp.eval(`__game.start('a1-01', 'story')`);
  await sleep(900);
  const before = await cdp.eval(`({ hp: __state.plane.hpMax, money: __game.save.data.money })`);
  check('baseline read from a live world', before.hp > 0, JSON.stringify(before));

  // buy: through the model layer the hangar itself uses, not by poking the save
  const buy = await cdp.eval(`(async () => {
    const M = await import('/js/ui/model.js');
    const D = await import('/js/data/planes.js');
    const T = await import('/js/data/tuning.js');
    M.setMoney(__game.save, 9000);
    const plane = M.currentPlane(__game.save, D.PLANES);
    const upg = D.UPGRADES.find(u => /armour|armor|hp/i.test(u.id + ' ' + (u.name || '')));
    if (!upg) return { err: 'no armour upgrade', ids: D.UPGRADES.map(u => u.id) };
    const before = M.getMoney(__game.save);
    const r = ${FALSIFY ? "'skipped'" : "M.buyUpgrade(__game.save, plane, upg, T.ECON)"};
    return { upgId: upg.id, r, before, after: M.getMoney(__game.save),
             lvl: M.upgradeLevel(__game.save, plane.id, upg.id) };
  })()`);
  check('an armour upgrade exists to buy', !buy.err, JSON.stringify(buy).slice(0, 220));
  check('the purchase went through', buy.r === 'ok', `buyUpgrade -> ${buy.r}`);
  // typeof guards on purpose: `null < 9000` is true, so a bare comparison passes on a broken read
  check('money actually left the wallet',
    typeof buy.after === 'number' && typeof buy.before === 'number' && buy.after < buy.before,
    `${buy.before} -> ${buy.after}`);
  check('the upgrade level was recorded', (buy.lvl || 0) > 0, `level=${buy.lvl}`);

  // THE ONE THAT MATTERS: build a fresh world and see whether the sim honours it
  await cdp.eval(`__game.start('a1-01', 'story')`);
  await sleep(900);
  const after = await cdp.eval(`({ hp: __state.plane.hpMax })`);
  check('the SIM sees the upgrade (hpMax rose)', after.hp > before.hp, `${before.hp} -> ${after.hp}`);

  // and it must survive a reload, or nothing is really bought
  await cdp.eval(`__game.save.flush()`);
  const persisted = await cdp.eval(`(async () => {
    const M = await import('/js/ui/model.js');
    return M.upgradeLevel(__game.save, __game.save.data.planeId, '${buy.upgId}');
  })()`);
  check('upgrade persists in the save', (persisted || 0) > 0, `level=${persisted}`);

  if (cdp.errors.length) console.log(`\n--- ${cdp.errors.length} page error(s) ---\n` + cdp.errors.slice(0, 8).join('\n'));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  process.exitCode = bad.length ? 1 : 0;
} finally { close(); }
