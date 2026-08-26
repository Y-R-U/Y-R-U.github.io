#!/usr/bin/env node
/**
 * Manager gate for the hangar economy loop: buy -> money leaves -> the SIM sees the upgrade,
 * plus the four loadout defects from Aaron's 2026-08-27 playtest.
 *
 *   node tools/gate_hangar.mjs            run the checks
 *   node tools/gate_hangar.mjs --falsify  buy nothing, and prove the economy checks go red
 *
 * The loadout half is falsified by reverting the fix in the source, not by a flag: an ES module
 * namespace is read-only, so a monkeypatch from the page cannot put the defect back and a flag
 * that silently patches nothing would be the worst kind of green. The three reverts, each of
 * which was run and seen to fail, and the red lines they produced:
 *
 *   1. `js/ui/screens/hangar.js`  renderBar/assign: `activePlane()` -> `PLANES[carouselIdx]`
 *   2. `js/ui/model.js`           setSlot / normaliseLoadout: drop the `stow(...)` calls
 *   3. `js/ui/screens/hangar.js`  arrow(): return the bare 44 px `btn(...)` with no pad
 *
 * The link that matters is never the UI. Upgrades were once stored per-plane while the sim read
 * a flat map, and a bomb was once loadable into a hardpoint the flown aeroplane did not have —
 * both looked perfect on the hangar screen. Reading the loadout back out of a live world is the
 * only check that would have caught either.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';
import { Touch } from './touch.mjs';

const FALSIFY = process.argv.includes('--falsify');
const { cdp, base, close } = await harness({ gpu: true });
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const hangar = async () => { await cdp.eval(`__ui.go('hangar')`); await sleep(400); };
const loadout = () => cdp.eval(`JSON.parse(JSON.stringify(__game.save.data.loadout))`);
const stores = () => cdp.eval(`JSON.parse(JSON.stringify(__game.save.data.weapons || []))`);
const chips = () => cdp.eval(`[...document.querySelectorAll('.wchip')].map(n => n.dataset.weapon)`);
const title = () => cdp.eval(`document.querySelector('.bay-title').textContent`);
const clickArrow = async (dir, n = 1) => {
  for (let i = 0; i < n; i++) { await cdp.eval(`document.querySelector('.btn.icon.arrow.${dir}').click()`); await sleep(160); }
  await sleep(200);
};

try {
  await cdp.viewport(844, 390, 2, true);            // landscape phone — where Aaron hit all of this
  await cdp.goto(`${base}/index.html?nosave`);
  await sleep(1400);
  await cdp.eval(`document.getElementById('tapbtn').click()`);
  await sleep(1000);

  /* ------------------------------------------------------- the economy loop (as before) */

  await cdp.eval(`__game.start('a1-01', 'story')`);
  await sleep(900);
  const before = await cdp.eval(`({ hp: __state.plane.hpMax, money: __game.save.data.money })`);
  check('baseline read from a live world', before.hp > 0, JSON.stringify(before));

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

  await cdp.eval(`__game.start('a1-01', 'story')`);
  await sleep(900);
  const after = await cdp.eval(`({ hp: __state.plane.hpMax })`);
  check('the SIM sees the upgrade (hpMax rose)', after.hp > before.hp, `${before.hp} -> ${after.hp}`);

  await cdp.eval(`__game.save.flush()`);
  const persisted = await cdp.eval(`(async () => {
    const M = await import('/js/ui/model.js');
    return M.upgradeLevel(__game.save, __game.save.data.planeId, '${buy.upgId}');
  })()`);
  check('upgrade persists in the save', (persisted || 0) > 0, `level=${persisted}`);

  /* -------------------------------------- 1. an unowned aeroplane cannot be loaded out */

  await cdp.eval(`(async () => {
    const M = await import('/js/ui/model.js');
    const D = await import('/js/data/planes.js');
    __game.save.data.planes = ['kestrel'];
    __game.save.data.planeId = 'kestrel';
    __game.save.data.loadouts = {};
    __game.save.data.loadout = ['bomb_std', 'rocket', null, null];
    __game.save.data.weapons = ['bomb_std', 'rocket'];
  })()`);
  await hangar();
  await clickArrow('right', 2);                    // kestrel(2) -> harrow(3) -> tempest(4), unowned
  const browsing = await title();
  const planeId = await cdp.eval(`__game.save.data.planeId`);
  check('browsing an unowned aeroplane does not change the one in service',
    browsing === 'Tempest' && planeId === 'kestrel', `browsing ${browsing}, planeId ${planeId}`);

  const locked = await cdp.eval(`document.querySelectorAll('.slot.locked').length`);
  const lab = await cdp.eval(`document.querySelector('.slots-lab').textContent`);
  check('the editor still shows the FLOWN plane\'s hardpoints while browsing',
    locked === 2 && /KESTREL/.test(lab), `${locked} locked, label "${lab}"`);

  // try to load a bomb into hardpoint 3, which the Kestrel does not have
  await cdp.eval(`(() => {
    const s = document.querySelectorAll('.slot')[2];
    s.click();
    const c = document.querySelector('.wchip[data-weapon="bomb_std"]');
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 100, clientY: 350 }));
    c.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, pointerId: 1, clientX: 100, clientY: 350 }));
  })()`);
  await sleep(300);
  const l1 = await loadout();
  check('a weapon cannot be committed past the flown plane\'s hardpoints',
    !l1[2] && !l1[3], JSON.stringify(l1));

  // THE ONE THAT MATTERS: what the sim actually hands the player
  await cdp.eval(`__game.start('a1-01', 'story')`);
  await sleep(900);
  const sim = await cdp.eval(`(() => { const p = __game.world.player;
    return { id: p.def.id, slots: p.def.slots, loadout: p.loadout.slice(), ammo: p.ammo.slice() }; })()`);
  const armedPastSlots = sim.loadout.slice(sim.slots).filter(Boolean);
  const armedAmmo = sim.ammo.slice(sim.slots).filter((a) => a > 0);
  check('the SIM arms nothing the aeroplane has no hardpoint for',
    typeof sim.slots === 'number' && armedPastSlots.length === 0 && armedAmmo.length === 0,
    `${sim.id} slots=${sim.slots} loadout=${JSON.stringify(sim.loadout)} ammo=${JSON.stringify(sim.ammo)}`);
  check('the bomb the player loaded is one the sim can actually fire',
    sim.loadout.indexOf('bomb_std') >= 0 && sim.loadout.indexOf('bomb_std') < sim.slots,
    `bomb_std at index ${sim.loadout.indexOf('bomb_std')} of ${sim.slots}`);

  // Aaron moved the bomb by DRAGGING it, so the drag path needs its own check — driven with REAL
  // touches. Synthetic PointerEvents are worthless here: `setPointerCapture` throws on a made-up
  // pointerId, the drag never arms, and the check passes because nothing at all happened.
  await hangar();
  await clickArrow('right', 2);          // browsing the 4-hardpoint Tempest, still flying the Kestrel
  const touch = new Touch(cdp);
  const box = (sel, i) => cdp.eval(`(() => { const n = document.querySelectorAll('${sel}')[${i}];
    if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const dragTo = async (from, to) => {
    await touch.down(from.x, from.y);
    await touch.slideTo(to.x, to.y, 220);
    await touch.up();
    await sleep(300);
  };
  const chipBox = await box('.wchip[data-weapon="bomb_std"]', 0);
  await dragTo(chipBox, await box('.slot', 2));   // hardpoint 3: the browsed Tempest has one, the flown Kestrel does not
  const afterLocked = await loadout();
  check('a DRAG onto a locked hardpoint is refused',
    !afterLocked[2] && !afterLocked[3], JSON.stringify(afterLocked));

  await dragTo(await box('.wchip[data-weapon="bomb_std"]', 0), await box('.slot', 1));
  const afterOpen = await loadout();
  check('a DRAG onto a real hardpoint still works',
    afterOpen[1] === 'bomb_std', JSON.stringify(afterOpen));

  // put it back the way section 2 expects to find it
  await cdp.eval(`(() => { __game.save.data.loadout = ['bomb_std', 'rocket', null, null]; })()`);

  /* ---------------------------------- 2. an unloaded weapon is never destroyed */

  // The EXACT fresh-save shape core/save.js writes: `loadout` carries a rocket and `weapons` does
  // not exist at all. Seeding save.weapons here instead would mock the fix — the first draft of
  // this section did, and stayed green with the whole stow invariant reverted.
  await cdp.eval(`(() => {
    const s = __game.save.data;
    delete s.weapons;
    s.planes = ['kestrel']; s.planeId = 'kestrel'; s.loadouts = {};
    s.loadout = ['bomb_std', 'rocket', null, null];
  })()`);
  await hangar();
  const freshChips = await chips();
  check('a weapon the fresh save equips is on the shelf before you touch anything',
    Array.isArray(freshChips) && freshChips.includes('rocket') && freshChips.includes('bomb_std'),
    JSON.stringify(freshChips));
  const storesBefore = await stores();
  await cdp.eval(`(() => { const s = document.querySelectorAll('.slot')[1]; s.click(); s.click(); })()`);
  await sleep(300);
  const l2 = await loadout();
  const storesAfter = await stores();
  const chipsAfter = await chips();
  check('unloading a weapon empties the hardpoint', l2[1] == null, JSON.stringify(l2));
  check('the unloaded weapon is still owned',
    Array.isArray(storesAfter) && storesAfter.includes('rocket'),
    `${JSON.stringify(storesBefore)} -> ${JSON.stringify(storesAfter)}`);
  check('and it is back on the shelf, not behind a price tag',
    Array.isArray(chipsAfter) && chipsAfter.includes('rocket'), JSON.stringify(chipsAfter));
  const armouryRocket = await cdp.eval(`(() => {
    document.querySelector('.armoury-open').click();
    const c = [...document.querySelectorAll('.arm-card')].find(n => /Rockets/i.test(n.textContent));
    const t = c ? c.textContent : 'MISSING';
    const x = document.querySelector('#armoury .btn.icon.close'); if (x) x.click();
    return t;
  })()`);
  await sleep(250);
  check('the armoury offers it back as EQUIP, not as a purchase',
    /EQUIP/.test(armouryRocket) && !/£/.test(armouryRocket), armouryRocket);

  /* ------------------- 3. switching to fewer hardpoints, and switching back */

  await cdp.eval(`(async () => {
    const M = await import('/js/ui/model.js');
    const D = await import('/js/data/planes.js');
    M.setMoney(__game.save, 99999);
    M.buyPlane(__game.save, D.PLANES, 'harrier1');
    M.buyPlane(__game.save, D.PLANES, 'tempest');
    M.selectPlane(__game.save, D.PLANES, 'tempest');
    // wipe the per-plane memory so the Kestrel has nothing to recall: this section is testing
    // the TRIM path, and a remembered loadout would quietly skip it
    __game.save.data.loadouts = {};
    // stores holds ONLY the free bomb: the other three exist purely because they are bolted to
    // the aeroplane. If the trim bins them instead of stowing them they are gone for good, which
    // is the whole point of the section. Listing them here would mock the fix.
    __game.save.data.weapons = ['bomb_std'];
    __game.save.data.loadout = ['bomb_std', 'rocket', 'cluster', 'napalm'];
  })()`);
  await hangar();
  const full = await loadout();
  check('the 4-hardpoint aeroplane carries four', full.filter(Boolean).length === 4, JSON.stringify(full));

  await clickArrow('left', 2);                     // browse the 2-slot Kestrel — do not select it
  const browsedOnly = await loadout();
  check('BROWSING a smaller aeroplane does not touch the loadout',
    browsedOnly.filter(Boolean).length === 4, JSON.stringify(browsedOnly));

  await cdp.eval(`[...document.querySelectorAll('.btn.wide')].find(b => b.textContent === 'SELECT').click()`);
  await sleep(400);
  const small = await loadout();
  const smallStores = await stores();
  check('selecting it unloads the overflow to two',
    small.filter(Boolean).length === 2 && !small[2] && !small[3], JSON.stringify(small));
  check('the overflow went to stores, not the bin',
    smallStores.includes('cluster') && smallStores.includes('napalm'), JSON.stringify(smallStores));

  await clickArrow('right', 2);
  await cdp.eval(`[...document.querySelectorAll('.btn.wide')].find(b => b.textContent === 'SELECT').click()`);
  await sleep(400);
  const backAgain = await loadout();
  check('switching back recalls the four-weapon loadout',
    backAgain.filter(Boolean).length === 4, JSON.stringify(backAgain));

  await cdp.eval(`__game.start('a1-01', 'story')`);
  await sleep(900);
  const sim2 = await cdp.eval(`(() => { const p = __game.world.player;
    return { slots: p.def.slots, loadout: p.loadout.slice(), ammo: p.ammo.slice() }; })()`);
  check('the SIM flies all four of them',
    sim2.slots === 4 && sim2.ammo.filter((a) => a > 0).length === 4,
    `slots=${sim2.slots} ammo=${JSON.stringify(sim2.ammo)}`);

  /* ------------------------------------------ 4. the carousel arrows are reachable */

  await hangar();
  // Measured from the ARROW BUTTON outward, not from the wrapper: the wrapper is part of the fix,
  // and a check keyed on it reads "selector missing" rather than "the target is 44 px" when the
  // fix is reverted. This way a bare button scores its own 1936 px and fails on the number.
  const tap = await cdp.eval(`(() => {
    const out = [];
    for (const btn of document.querySelectorAll('.bay-head .btn.icon.arrow')) {
      const w = btn.closest('.arrow-wrap') || btn;
      const b = btn.getBoundingClientRect();
      let n = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (let x = Math.round(b.x) - 26; x <= Math.round(b.right) + 26; x++)
        for (let y = Math.round(b.y) - 26; y <= Math.round(b.bottom) + 26; y++) {
          const e = document.elementFromPoint(x, y);
          if (e && w.contains(e)) { n++; minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
        }
      out.push({ px: n, w: maxx - minx + 1, h: maxy - miny + 1, btn: Math.round(b.width) });
    }
    return out;
  })()`);
  check('both carousel arrows present', tap.length === 2, JSON.stringify(tap));
  check('the arrow itself is drawn bigger than the 44 px floor',
    tap.length === 2 && tap.every((t) => t.btn >= 48), JSON.stringify(tap.map(t => t.btn)));
  check('each arrow is tappable well past the 44 px floor',
    tap.length === 2 && tap.every((t) => t.w >= 68 && t.h >= 64 && t.px >= 4200), JSON.stringify(tap));

  // and the enlarged target must not have eaten the topbar back button underneath it
  const backOk = await cdp.eval(`(() => {
    const b = document.querySelector('.btn.back'); const r = b.getBoundingClientRect();
    let n = 0, tot = 0;
    for (let x = Math.round(r.x); x < r.right; x++)
      for (let y = Math.round(Math.max(0, r.y)); y < r.bottom; y++) { tot++; if (b.contains(document.elementFromPoint(x, y))) n++; }
    return { n, tot };
  })()`);
  check('the topbar back button is still fully reachable',
    backOk.tot > 0 && backOk.n >= backOk.tot * 0.98, `${backOk.n}/${backOk.tot} px`);

  const t0 = await title();
  await cdp.eval(`(() => { const a = document.querySelector('.bay-art'); const r = a.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, clientX: cx + 60, clientY: cy }));
    a.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, pointerId: 9, clientX: cx - 60, clientY: cy + 6 })); })()`);
  await sleep(300);
  const t1 = await title();
  check('a swipe across the aeroplane also changes aeroplane', t1 !== t0, `${t0} -> ${t1}`);

  if (cdp.errors.length) console.log(`\n--- ${cdp.errors.length} page error(s) ---\n` + cdp.errors.slice(0, 8).join('\n'));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  if (bad.length) console.log('failed: ' + bad.map(r => r.n).join(' | '));
  process.exitCode = bad.length ? 1 : 0;
} finally { close(); }
