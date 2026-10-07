#!/usr/bin/env node
/**
 * The worlds past DARK, and what they carry back:
 *   DARK's five extra skill levels apply in the light once DARK is open
 *   INK WELL is locked until the dojo is won, then multiplies what a fight pays
 *   win THUG -> the DARK toggle becomes a WORLDS list; CYBORG opens, GOD says what it wants
 *   CYBORG -> its own page, ranks and moves; the replay run is SIMULANT; +1 level on tracks
 *   win SIMULANT -> GOD opens; its replay run is DEMON and the page goes with it
 *   after a THUG win -> WHITE BELT restarts the dojo keeping every skill, move and ink
 *
 *   node tools/worldgate.mjs
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const S = (expr) => `(()=>{ const s = window.__ragdojo.save; return ${expr}; })()`;
const cls = (c) => `document.getElementById('app').classList.contains('${c}')`;
const txt = (id) => `document.getElementById('${id}').textContent`;

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(900, 470, 1, true);
  const boot = async (patch) => {
    await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
    await c.waitFor('document.getElementById("hub").classList.contains("show")', 20000);
    await c.eval(`(()=>{
      const K = 'ragdojo.save.v2';
      localStorage.setItem(K, JSON.stringify(${JSON.stringify(patch)}));
    })()`);
    await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
    await c.waitFor('document.getElementById("hub").classList.contains("show")', 20000);
    c.errors.length = 0;
  };
  const winFight = async () => {
    await c.eval(`window.__ragdojo.match.enemies.forEach(e => e.hurt(99999, {from:[0,0], kb:900, stagger:1}))`);
    await c.waitFor(`document.getElementById('results').classList.contains('show') || document.getElementById('victory').classList.contains('show')`, 15000);
  };
  const shopDots = async (tab, name) => c.eval(`(()=>{
    document.getElementById('btnShop').click();
    document.querySelector('#shop .tab[data-tab="${tab}"]').click();
    const card = [...document.querySelectorAll('#shopList .card')].find(k => k.querySelector('.cname').textContent === '${name}');
    const r = { dots: card.querySelector('.dots') ? card.querySelector('.dots').querySelectorAll('i').length : 0, locked: card.classList.contains('locked'),
      btn: card.querySelector('.buy').textContent, disabled: card.querySelector('.buy').disabled };
    document.getElementById('btnShopClose').click();
    return r; })()`);

  // ── DARK's deeper skills, seen from the daylight ──────────────────────────
  await boot({ everWon: true, completed: true, darkUnlocked: false, ink: 99999 });
  const before = await shopDots('perks', 'PAPER THICKNESS');
  ok('before DARK opens, a skill has its base levels', before.dots === 10, `${before.dots}`);
  await boot({ everWon: true, completed: true, darkUnlocked: true, ink: 99999 });
  const after = await shopDots('perks', 'PAPER THICKNESS');
  ok('once DARK is open, the light shop shows five more', after.dots === 15, `${after.dots}`);
  const stiff = await shopDots('perks', 'STIFF JOINTS');
  ok('a skill already at its floor does not grow dead levels', stiff.dots === 6, `${stiff.dots}`);

  // ── INK WELL ──────────────────────────────────────────────────────────────
  await boot({ everWon: false, ink: 99999 });
  const wellLocked = await shopDots('perks', 'INK WELL');
  ok('INK WELL is locked until the dojo is won', wellLocked.locked && wellLocked.disabled);
  await boot({ everWon: true, completed: true, ink: 99999, perks: { ink: 3 }, level: 2 });
  const wellOpen = await shopDots('perks', 'INK WELL');
  ok('and buyable after', !wellOpen.locked && !wellOpen.disabled, wellOpen.btn);
  await c.eval(`document.getElementById('btnFight').click()`);
  await c.frames(6);
  await winFight();
  const res = await c.eval(`document.getElementById('resBody').textContent`);
  ok('a win shows what the Ink Well added', /Ink Well \(×1\.40\)/.test(res), res.replace(/\s+/g, ' ').slice(0, 160));

  // ── THUG won: the ladder ──────────────────────────────────────────────────
  await boot({ everWon: true, completed: true, darkUnlocked: true, thugWon: true, ink: 99999 });
  ok('past DARK the toggle names your world', (await c.eval(txt('btnDark'))).includes('LIGHT'));
  await c.eval(`document.getElementById('btnDark').click()`);
  await c.frames(4);
  ok('and opens the world list', await c.eval(`document.getElementById('worlds').classList.contains('show')`));
  const rows = JSON.parse(await c.eval(`JSON.stringify([...document.querySelectorAll('#worldRows [data-world]')].map(b => ({ w: b.dataset.world, d: b.disabled, t: b.textContent })))`));
  const row = (w) => rows.find((r) => r.w === w);
  ok('four worlds are listed', rows.length === 4);
  ok('CYBORG is open', !row('cyborg').d, row('cyborg').t);
  ok('GOD says what it wants', row('god').d && /SIMULANT/.test(row('god').t), row('god').t);
  const powerMax = await shopDots('moves', 'POWER HIT');
  ok('CYBORG adds a level to move tracks', powerMax.dots === 8, `${powerMax.dots}`);
  const hpCyb = await shopDots('perks', 'PAPER THICKNESS');
  ok('and to skills that still have room', hpCyb.dots === 16, `${hpCyb.dots}`);

  await c.eval(`document.querySelector('#worldRows [data-world="cyborg"]').click()`);
  await c.frames(8);
  ok('CYBORG switches world', await c.eval(S('s.theme')) === 'cyborg');
  ok('with its own page', await c.eval(cls('cyborg')) && await c.eval(cls('night')) && !(await c.eval(cls('dark'))));
  ok('its own ranks', /SCRAP/.test(await c.eval(txt('hubRank'))));
  const cybMoves = JSON.parse(await c.eval(`(async()=>{
    const cfg = await import('/js/config.js');
    return JSON.stringify(cfg.activeMoves(window.__ragdojo.save).map(m => m.name)); })()`));
  ok('and its own moves', cybMoves[0] === 'PISTON PUNCH' && cybMoves.includes('RAILGUN'), cybMoves.join(', '));
  ok('the light run waits in the stash', await c.eval(S('!!s.stash.light')));
  await c.eval(`document.getElementById('btnFight').click()`);
  await c.frames(8);
  ok('a CYBORG fight starts', await c.eval(`window.__ragdojo.match && !window.__ragdojo.match.demo`));
  ok('nobody is carrying a knife', !(await c.eval(`window.__ragdojo.match.player.armed`)));

  // ── SIMULANT -> GOD -> DEMON ──────────────────────────────────────────────
  await boot({ everWon: true, completed: true, darkUnlocked: true, thugWon: true, ink: 99999,
    theme: 'cyborg', bully: true, bullyLevel: 44, level: 44 });
  ok('the CYBORG replay run is SIMULANT', (await c.eval(txt('btnFight'))) === 'SIMULANT');
  await c.eval(`document.getElementById('btnFight').click()`);
  await c.frames(6);
  await winFight();
  ok('winning SIMULANT reaches the victory screen', await c.eval(`document.getElementById('victory').classList.contains('show')`));
  ok('and opens GOD', await c.eval(S('s.simulantWon')) === true);
  ok('it offers WHITE BELT too', !(await c.eval(`document.getElementById('btnWhiteBelt').classList.contains('hidden')`)));
  await c.eval(`document.getElementById('btnVicClose').click()`);
  await c.eval(`document.getElementById('btnDark').click()`);
  await c.frames(4);
  await c.eval(`document.querySelector('#worldRows [data-world="god"]').click()`);
  await c.frames(8);
  ok('GOD switches world', await c.eval(S('s.theme')) === 'god' && await c.eval(cls('god')));
  ok('a daylit page', !(await c.eval(cls('night'))));
  ok('with wings for ranks', /MORTAL/.test(await c.eval(txt('hubRank'))));
  await c.eval(`(()=>{ const s = window.__ragdojo.save; s.completed = true; })()`);
  await c.eval(`document.getElementById('btnTrophy').click()`);
  await c.frames(2);
  ok('the GOD replay run is DEMON', (await c.eval(txt('btnBully'))).includes('DEMON'));
  await c.eval(`document.getElementById('btnBully').click()`);
  await c.frames(4);
  ok('and the page goes to hell with it', await c.eval(cls('demon')) && await c.eval(cls('night')));

  // ── victory rewards ───────────────────────────────────────────────────────
  const finish = async (patch, def) => {
    await boot(patch);
    await c.eval(`document.getElementById('btnFight').click()`);
    await c.frames(30);
    await c.eval(`(()=>{const m=window.__ragdojo.match; m.enemies.forEach(e=>{e.invuln=0; m.land(m.player, e, ${def}, [e.x-20, e.y-60]);});})()`);
    await c.frames(40);
    return JSON.parse(await c.eval(`(()=>{const m=window.__ragdojo.match; return JSON.stringify({ lasers: !!m.flair.lasers,
      torn: m.enemies.map(e => e.severed ? e.severed.size : 0),
      finite: m.enemies.every(e => [...e.rag.x, ...e.rag.y].every(Number.isFinite)) });})()`));
  };
  const SPECIAL = '{dmg:99999, kb:900, stagger:1, p:1.4, id:"x"}', PUNCH = '{dmg:99999, kb:600, stagger:1, p:0.8}';
  const W = { everWon: true, darkUnlocked: true, thugWon: true, simulantWon: true, completed: true, level: 15 };
  let v = await finish({ ...W, theme: 'god' }, PUNCH);
  ok('winning in GOD tears the loser apart', v.torn[0] >= 3 && v.finite, JSON.stringify(v));
  v = await finish({ ...W, theme: 'god', settings: { gore: false } }, PUNCH);
  ok('unless blood & gore is switched off', v.torn[0] === 0, JSON.stringify(v));
  v = await finish({ ...W, theme: 'light' }, SPECIAL);
  ok('the dojo stays clean', v.torn[0] === 0 && !v.lasers, JSON.stringify(v));
  v = await finish({ ...W, theme: 'cyborg' }, SPECIAL);
  ok('a CYBORG special finish fires the eye lasers', v.lasers && v.torn[0] === 0, JSON.stringify(v));
  v = await finish({ ...W, theme: 'cyborg' }, PUNCH);
  ok('a punch finish does not', !v.lasers, JSON.stringify(v));

  // ── WHITE BELT after a THUG win ───────────────────────────────────────────
  const perks = { hp: 9, atk: 7, ink: 2 };
  await boot({ everWon: true, completed: true, darkUnlocked: true, thugWon: true, ink: 4321, perks,
    moves: { power: { owned: true, power: 5, cd: 4 }, d_shank: { owned: true, power: 6, cd: 6 }, d_molotov: { owned: true, power: 3, cd: 2 } },
    theme: 'dark', bully: true, bullyLevel: 44, level: 44, completed: true,
    stash: { light: { level: 44, completed: true, bully: true, bullyLevel: 30, records: { championships: 3, bullyRuns: 1 } } } });
  await c.eval(`document.getElementById('btnTrophy').click()`);
  await c.frames(2);
  ok('a won THUG run offers WHITE BELT', !(await c.eval(`document.getElementById('btnWhiteBelt').classList.contains('hidden')`)));
  ok('and explains it', /White Belt/.test(await c.eval(`document.getElementById('vicFine').textContent`)));
  await c.eval(`document.getElementById('btnWhiteBelt').click()`);
  await c.frames(2);
  ok('the first press asks', await c.eval(S('s.theme')) === 'dark' && /SURE/.test(await c.eval(txt('btnWhiteBelt'))));
  await c.eval(`document.getElementById('btnWhiteBelt').click()`);
  await c.frames(8);
  ok('the second puts you in the dojo', await c.eval(S('s.theme')) === 'light' && !(await c.eval(cls('night'))));
  ok('at fight 1', await c.eval(S('s.level')) === 0 && await c.eval(S('!s.bully && !s.completed')));
  ok('as a white belt', /YOU WHITE/.test(await c.eval(txt('hubRank'))));
  ok('with the pencil case', !(await c.eval(S('s.carryDark'))));
  ok('every skill kept', await c.eval(S(`JSON.stringify(s.perks)`)) === JSON.stringify(perks));
  ok('every move kept', await c.eval(S('s.moves.power.power === 5 && s.moves.d_shank.power === 6')));
  ok('every drop of ink kept', await c.eval(S('s.ink')) === 4321);
  ok('the dojo records kept', await c.eval(S('s.records.championships')) === 3);
  ok('the THUG run waits in the stash', await c.eval(S('s.stash.dark.bully && s.stash.dark.bullyLevel === 44')));
  ok('and the worlds stay open', await c.eval(S('s.thugWon && s.darkUnlocked')));

  log(c.errors.length ? `console errors:\n  ${c.errors.join('\n  ')}` : '\nno console errors');
  if (c.errors.length) fail++;
} finally {
  await c.close();
  srv.close();
}
log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
