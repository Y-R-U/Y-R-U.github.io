#!/usr/bin/env node
/**
 * The DARK campaign and its unlock chain, end to end:
 *   win the dojo -> DARK appears, locked
 *   win a BULLY run -> DARK unlocks
 *   DARK -> inverted page, gang ranks, knives, five more skill levels, its own run+records
 *   start a THUG run -> walking back into the light asks "stay a THUG?", with YES locked
 *   win the THUG run -> YES works, and you keep the knife in the daylight
 *
 *   node tools/darkgate.mjs
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const shown = (id) => `!document.getElementById('${id}').classList.contains('hidden')`;
const S = (expr) => `(()=>{ const s = window.__ragdojo.save; return ${expr}; })()`;

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(900, 470, 1, true);
  const boot = async (patch) => {
    await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
    await c.waitFor('document.getElementById("hub").classList.contains("show")', 20000);
    if (patch) {
      await c.eval(`(()=>{
        const K = 'ragdojo.save.v2';
        const s = JSON.parse(localStorage.getItem(K) || '{}');
        Object.assign(s, ${JSON.stringify(patch)});
        localStorage.setItem(K, JSON.stringify(s));
      })()`);
      await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
      await c.waitFor('document.getElementById("hub").classList.contains("show")', 20000);
    }
    c.errors.length = 0;
  };

  await boot({ everWon: false, darkUnlocked: false, completed: false, level: 0 });
  ok('a new player is not shown DARK at all', await c.eval(shown('btnDark')) === false);

  await boot({ everWon: true, completed: true, darkUnlocked: false });
  ok('winning the dojo reveals DARK', await c.eval(shown('btnDark')));
  ok('but it is locked', await c.eval(`document.getElementById('btnDark').classList.contains('locked')`));
  ok('and it says what it wants', (await c.eval(`document.getElementById('btnDark').textContent`)).includes('🔒'));
  await c.eval(`document.getElementById('btnDark').click()`);
  await c.frames(8);
  ok('a locked DARK does not switch theme', await c.eval(S('s.theme')) === 'light');

  await boot({ everWon: true, completed: true, darkUnlocked: true, level: 44, ink: 5000, wins: 40 });
  ok('winning a bully run unlocks DARK', !(await c.eval(`document.getElementById('btnDark').classList.contains('locked')`)));

  await c.eval(`document.getElementById('btnDark').click()`);
  await c.frames(10);
  ok('DARK switches theme', await c.eval(S('s.theme')) === 'dark');
  ok('and inverts the page', await c.eval(`document.getElementById('app').classList.contains('dark')`));
  ok('the dark campaign starts at the beginning', await c.eval(S('s.level')) === 0);
  ok('your ink comes with you', await c.eval(S('s.ink')) === 5000);
  ok('the light run is stashed intact', await c.eval(S('s.stash.light.level')) === 44);
  ok('records are separate', await c.eval(S('JSON.stringify(s.records) !== JSON.stringify(s.stash.light.records)'))
    || await c.eval(S('s.records.wins === 0')));

  const ranks = await c.eval(`document.getElementById('hubRank').textContent`);
  ok('the ranks are gang colours, not bandanas', /NOBODY/i.test(ranks), ranks.replace(/\s+/g, ' ').trim());

  const moves = JSON.parse(await c.eval(`(async()=>{
    const cfg = await import('/js/config.js');
    return JSON.stringify(cfg.activeMoves(window.__ragdojo.save).map(m => m.name));
  })()`));
  ok('you are holding knives now', moves[0] === 'SHANK' && moves.includes('SAWN-OFF'), moves.join(', '));

  const caps = JSON.parse(await c.eval(`(async()=>{
    const cfg = await import('/js/config.js');
    const p = cfg.PERKS[0];
    return JSON.stringify({ light: cfg.perkMax(p, 'light'), dark: cfg.perkMax(p, 'dark') });
  })()`));
  ok('skills go five levels deeper in the dark', caps.dark === caps.light + 5, JSON.stringify(caps));

  // Back to the light with no thug run in play: straight through, no question asked.
  await c.eval(`document.getElementById('btnDark').click()`);
  await c.frames(10);
  ok('toggling back returns to the light', await c.eval(S('s.theme')) === 'light');
  ok('and restores the light run exactly', await c.eval(S('s.level')) === 44);
  ok('with the pencil case back', (await c.eval(`(async()=>{
    const cfg = await import('/js/config.js');
    return cfg.activeMoves(window.__ragdojo.save)[0].name;
  })()`)) === 'POWER HIT');

  // A THUG run in play: the question, with YES out of reach.
  await boot({ everWon: true, completed: true, darkUnlocked: true, theme: 'dark',
    bully: true, bullyLevel: 12, thugWon: false, stash: { light: { level: 44 } } });
  ok('the dark bully run is called THUG', (await c.eval(`(()=>{
    document.getElementById('btnTrophy').click();
    const t = document.getElementById('btnBully').textContent;
    document.getElementById('btnVicClose').click();
    return t; })()`)).includes('THUG'));
  await c.eval(`document.getElementById('btnDark').click()`);
  await c.frames(8);
  ok('leaving mid-THUG asks the question', await c.eval(`document.getElementById('thug').classList.contains('show')`));
  ok('YES is locked until you win it', await c.eval(`document.getElementById('btnThugYes').disabled`));
  ok('and says so', (await c.eval(`document.getElementById('thugFine').textContent`)) === 'win as THUG to enable');
  await c.eval(`document.getElementById('btnThugYes').click()`);
  await c.frames(6);
  ok('a locked YES does nothing', await c.eval(S('s.theme')) === 'dark');
  await c.eval(`document.getElementById('btnThugNo').click()`);
  await c.frames(10);
  ok('NO walks you back into the light', await c.eval(S('s.theme')) === 'light' && await c.eval(S('!s.carryDark')));

  // Won the thug run: now you may keep the knife.
  await boot({ everWon: true, completed: true, darkUnlocked: true, theme: 'dark',
    bully: true, bullyLevel: 20, thugWon: true, stash: { light: { level: 44 } } });
  await c.eval(`document.getElementById('btnDark').click()`);
  await c.frames(8);
  ok('a proven THUG gets the choice', !(await c.eval(`document.getElementById('btnThugYes').disabled`)));
  await c.eval(`document.getElementById('btnThugYes').click()`);
  await c.frames(10);
  ok('YES puts you in the light...', await c.eval(S('s.theme')) === 'light');
  ok('...still carrying the knife', await c.eval(S('s.carryDark')) === true);
  ok('and the page is not inverted', !(await c.eval(`document.getElementById('app').classList.contains('dark')`)));
  ok('with the dark moves in hand', (await c.eval(`(async()=>{
    const cfg = await import('/js/config.js');
    return cfg.activeMoves(window.__ragdojo.save)[0].name;
  })()`)) === 'SHANK');

  log(c.errors.length ? `\nCONSOLE ERRORS:\n${c.errors.slice(0, 5).join('\n')}` : '\nno console errors');
  if (c.errors.length) fail++;
  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
