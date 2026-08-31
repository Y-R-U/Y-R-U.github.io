#!/usr/bin/env node
/**
 * The soundtrack panel: it must say what is playing, let you audition a track, and keep a
 * track you switched off out of the fight rotation without ever leaving you in silence.
 * Also checks that a button press reaches navigator.vibrate when haptics are on.
 *
 *   node tools/soundtrackgate.mjs
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(900, 460, 1, true);
  // A stub vibrate: the headless browser has none, and we want to count the calls anyway.
  await c.eval(`window.__vibes = []`).catch(() => {});
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);

  // Every track unlocked, so the whole list is exercised.
  await c.eval(`(()=>{ window.__ragdojo.save.level = 44; })()`);
  await c.eval(`document.getElementById('btnSettings').click()`);
  await c.frames(6);

  const now = await c.eval(`document.querySelector('#setRows .nowplaying b')?.textContent || ''`);
  ok('settings names the track that is playing', !!now, now);

  const rows = await c.eval(`document.querySelectorAll('#setRows .trackrow').length`);
  ok('every unlocked track is listed', rows === 10, `${rows} rows`);

  const marked = await c.eval(`document.querySelectorAll('#setRows .trackrow.playing').length`);
  ok('menu music is not mistaken for a fight track', marked === 0, `${marked} marked`);

  // Audition: tap the third row.
  await c.eval(`document.querySelectorAll('#setRows .trackrow')[2].click()`);
  await c.frames(6);
  const playing = await c.eval(`document.querySelector('#setRows .trackrow.playing span')?.textContent || ''`);
  const header = await c.eval(`document.querySelector('#setRows .nowplaying b')?.textContent || ''`);
  ok('tapping a track plays it', !!playing && header && playing.includes(header), `${playing} / ${header}`);

  // Switch two tracks off and make sure the rotation never reaches them.
  const off = await c.eval(`(()=>{
    const btns = [...document.querySelectorAll('#setRows [data-mute]')];
    btns[0].click(); btns[1].click();
    return JSON.stringify(Object.keys(window.__ragdojo.save.musicOff || {}));
  })()`);
  ok('switching tracks off records them', JSON.parse(off).length === 2, off);
  const leaked = await c.eval(`(()=>{
    const off = window.__ragdojo.save.musicOff || {};
    for (let i = 0; i < 300; i++) if (off[window.__ragdojo.fightTrack({ idx: 5, kind: 'fight' })]) return true;
    return false;
  })()`);
  ok('a track you switched off never plays in a fight', !leaked);

  // Switching every track off must not produce silence.
  const fallback = await c.eval(`(()=>{
    // Each click rebuilds the panel, so re-query every time rather than holding a NodeList.
    for (let i = 0; i < 40; i++) {
      const b = [...document.querySelectorAll('#setRows [data-mute]')]
        .find((x) => !x.disabled && x.textContent === 'ON');
      if (!b) break;
      b.click();
    }
    const disabled = [...document.querySelectorAll('#setRows [data-mute]')].filter(b => b.disabled).length;
    const pool = window.__ragdojo.fightPool(44);
    return JSON.stringify({ disabled, pool: pool.length, pick: window.__ragdojo.fightTrack({ idx: 5, kind: 'fight' }) });
  })()`);
  const F = JSON.parse(fallback);
  ok('the last track standing cannot be switched off', F.disabled === 1, `${F.disabled} locked on`);
  ok('a fight always gets a track', F.pool >= 1 && !!F.pick, JSON.stringify(F));

  // Haptics: press a button with vibrate stubbed and count the calls.
  const buzzes = await c.eval(`(()=>{
    window.__vibes = [];
    navigator.vibrate = (p) => { window.__vibes.push(p); return true; };
    return 'ok';
  })()`);
  await c.eval(`document.getElementById('btnSetClose').click()`);
  await c.frames(4);
  await c.eval(`document.getElementById('btnShop').click()`);
  await c.frames(4);
  const vibes = await c.eval(`window.__vibes.length`);
  ok('button presses reach navigator.vibrate', vibes >= 1, `${vibes} calls (stub=${buzzes})`);

  log(c.errors.length ? `\nCONSOLE ERRORS:\n${c.errors.slice(0, 8).join('\n')}` : '\nno console errors');
  if (c.errors.length) fail++;
  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
