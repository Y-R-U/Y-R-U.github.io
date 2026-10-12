#!/usr/bin/env node
/**
 * The EVENTS panel in the real game, in Chrome, with REAL touches, at a landscape phone
 * (844x390) and in portrait (390x844, the app rotated):
 *   - a campaign fight earns event points (the results card says so) and the board advances;
 *   - reloading the page cannot re-roll: same square, same roll count, and the next die is the
 *     engine's die for the NEXT roll index;
 *   - a tap on the picture opens the square under the finger (rotation undone);
 *   - Pass events are visible but locked for a non-Pass player, with a non-blocking note;
 *   - X in the corner, backdrop dismiss, zero console errors;
 *   - online (a real arena server): rivals come from the server and stand where THE REPLAY
 *     RULE puts them, the guess is checked by the server and pays ink, the prize background.
 *
 *   node tools/eventsgame.mjs              (EVENTS_TEST_PORT moves its ports; default 9500-9502)
 *   node tools/eventsgame.mjs --falsify    breaks the game 4 ways in a temp copy; each must go red
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, symlinkSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP, ROOT, serve } from './cdp.mjs';
import { die } from '../js/events/hash.js';
import { activeEvents, defById, windowOf, eventIdOf } from '../js/events/calendar.js';
import * as V from '../js/events/vines.js';

const SHOTS = process.env.SHOTS || join(ROOT, 'shots');
const P0 = +(process.env.EVENTS_TEST_PORT || 9500);
const log = (m) => process.stderr.write(m + '\n');

async function tap(c, sel) {
  const r = await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'nearest'}); const b=e.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,h:b.height}})()`);
  if (!r || !r.w) return false;
  await touchAt(c, r.x, r.y);
  return true;
}
async function touchAt(c, x, y) {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(30);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.frames(3);
}
const vis = (id) => `document.getElementById('${id}').classList.contains('show')`;

async function startArena(serverDir, port, dir) {
  const bin = join(dir, 'arena'), db = join(dir, 'a.db');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: serverDir, stdio: 'inherit' });
  const proc = spawn(bin, [], { env: { ...process.env, ARENA_ADDR: `127.0.0.1:${port}`, ARENA_DB: db, ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off',
    ARENA_ENTITLEMENT_URL: 'off', ARENA_DEV_AUTH: '1', ARENA_EVENT_ANSWERS: join(dir, 'answers.json') }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/gms/2d/ragdojo/arena`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await sleep(100); }
  return { proc, base };
}

/** One full pass against the game at `root` and the server built from `serverDir`. */
export async function run(root, serverDir, { label = '' } = {}) {
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${label}${n}${x && !c ? '  ' + x : ''}`); };
  const tmp = mkdtempSync(join(tmpdir(), 'eventsgame-'));
  const web = await serve(root, P0);
  const arena = await startArena(serverDir, P0 + 1, tmp);
  const tabs = [];
  const done = () => { for (const t of tabs) { try { t.chrome.kill('SIGKILL'); } catch {} } web.close(); arena.proc.kill('SIGKILL'); rmSync(tmp, { recursive: true, force: true }); };
  try {
    for (const [w, h, name] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
      const c = await CDP.launch();
      tabs.push(c);
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.viewport(w, h, 1, true);
      const L = `${name}: `;
      const url = (q) => `${web.base}/index.html?dpr=1&${q}`;

      // ── offline (no arena reachable): a campaign fight earns points ──
      await c.goto(url('auto=1&arena=http://127.0.0.1:1/x&level=0'));
      await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
      await c.eval(`window.__ragdojo.match.enemies.forEach(e => e.hurt(99999, {from:[0,0], kb:900, stagger:1}))`);
      ok(L + 'campaign fight ends in a results card', await c.waitFor(vis('results'), 15000));
      const award = await c.eval(`document.querySelector('#resBody .evaward')?.textContent || ''`);
      ok(L + 'results card says "+3 event points"', /\+3 event points/.test(award), award);
      await c.shot(join(SHOTS, `events_results_${name}.png`));
      await tap(c, '#btnResult');
      await c.waitFor('window.__state && window.__state.mode === "hub"', 8000);

      const now = await c.eval('Date.now()');
      const VEV = eventIdOf(defById('vines-day'), windowOf(defById('vines-day'), now));
      ok(L + 'EVENTS button on the hub', await c.eval(`!!document.getElementById('btnEvents').offsetParent`));
      await tap(c, '#btnEvents');
      ok(L + 'a real tap opens the EVENTS panel', await c.waitFor(vis('events'), 3000));
      const tabsN = await c.eval(`document.querySelectorAll('#evTabs [data-ev]').length`);
      ok(L + 'one tab per running event', tabsN === activeEvents(now).length, `${tabsN}`);
      const box = await c.eval(`(()=>{const p=document.getElementById('events'),s=p.querySelector('.sheet').getBoundingClientRect(),x=p.querySelector('.close').getBoundingClientRect();return {top:x.top-s.top,right:s.right-x.right,bottom:s.bottom-x.bottom,left:x.left-s.left}})()`);
      // Rotated 90°, the sheet's top-right corner lands at the screen's bottom-right.
      const corner = name === 'portrait' ? box.right < 18 && box.bottom < 18 : box.top < 16 && box.right < 16;
      ok(L + 'X in the sheet corner', corner, JSON.stringify(box));
      ok(L + 'vines: 3 points banked from the fight', await c.waitFor(`window.__events.state.ev['${VEV}']?.b.length === 1`, 3000));
      const uid = await c.eval(`window.__events.net.localUid()`);
      await tap(c, '#evRoll');
      await c.waitFor(`window.__events.state.ev['${VEV}'].rolls === 1`, 2000);
      await sleep(2600);
      const d0 = die(uid, VEV, 0);
      const shown = await c.eval(`window.__events.vview.lastDie`);
      ok(L + 'a real tap on ROLL rolls the engine\'s die for roll 0', shown === d0, `${shown} vs ${d0}`);
      const board = V.makeBoard(VEV);
      const pos1 = V.positionAfterRolls(board, uid, VEV, 1).pos;
      ok(L + 'the stick man stands on the computed square', await c.eval(`document.querySelector('#evSide .evstat b').textContent`) === String(pos1));
      await c.shot(join(SHOTS, `events_vines_${name}.png`));

      // ── reload: no re-roll ──
      await c.goto(url('auto=1&arena=http://127.0.0.1:1/x'));
      await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
      await tap(c, '#btnEvents');
      await c.waitFor(vis('events'), 3000);
      const after = await c.eval(`JSON.stringify(window.__events.state.ev['${VEV}'])`);
      ok(L + 'after a reload: still 1 roll taken, same square', JSON.parse(after).rolls === 1 && await c.eval(`document.querySelector('#evSide .evstat b').textContent`) === String(pos1), after);
      await tap(c, '#evRoll');
      await c.waitFor(`window.__events.state.ev['${VEV}'].rolls === 2`, 2000);
      const shown1 = await c.eval(`window.__events.vview.lastDie`);
      ok(L + 'the next roll is roll 1, not a re-roll of roll 0', shown1 === die(uid, VEV, 1), `${shown1} vs ${die(uid, VEV, 1)}`);

      // ── the picture: a real tap opens the square under the finger ──
      const REV = eventIdOf(defById('reveal-week'), windowOf(defById('reveal-week'), now));
      await tap(c, `#evTabs [data-ev="${REV}"]`);
      await c.frames(6);
      const target = 13;   // row 2, column 3
      const pt = await c.eval(`(()=>{
        const cv = document.getElementById('evCanvas'), p = window.__events.rview.r, r = cv.getBoundingClientRect();
        const lx = p.x + (${target} % 5 + 0.5) * p.w / 5, ly = p.y + (Math.floor(${target} / 5) + 0.5) * p.h / 5;
        const rot = r.width < r.height && cv.clientWidth > cv.clientHeight;
        return rot ? { x: r.right - ly, y: r.top + lx } : { x: r.left + lx, y: r.top + ly };
      })()`);
      await touchAt(c, pt.x, pt.y);
      const opened = await c.eval(`JSON.stringify(window.__events.state.ev['${REV}'].open)`);
      ok(L + 'a tap on the picture opens the square under the finger', opened === `[${target}]`, opened);
      await c.shot(join(SHOTS, `events_reveal_${name}.png`));

      // ── backdrop: a drag ending outside keeps it, a tap outside closes it ──
      await c.eval(`(()=>{const p=document.getElementById('events'),s=p.querySelector('.sheet'),r=s.getBoundingClientRect();
        s.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+20,clientY:r.top+40}));
        p.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:2,clientY:2}));})()`);
      await c.frames(3);
      ok(L + 'survives a drag that ends off the sheet', await c.eval(vis('events')));
      await touchAt(c, 3, 3);
      ok(L + 'a tap on the backdrop closes it', !(await c.eval(vis('events'))));

      // ── Pass events: visible, locked, a note, no modal ──
      await c.goto(url('auto=1&arena=http://127.0.0.1:1/x&evpass=0'));
      await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
      await tap(c, '#btnEvents');
      await c.waitFor(vis('events'), 3000);
      const lockedTabs = await c.eval(`[...document.querySelectorAll('#evTabs [data-ev]')].filter(b=>b.textContent.includes('🔒')).map(b=>b.dataset.ev)`);
      ok(L + 'Pass events are listed, locked', lockedTabs.length === activeEvents(now).filter((a) => a.def.pass).length && lockedTabs.length > 0, JSON.stringify(lockedTabs));
      await tap(c, `#evTabs [data-ev="${lockedTabs[0]}"]`);
      ok(L + 'a locked event says why and offers SUPPORT / PASS, no ROLL', await c.eval(`!!document.getElementById('evPass') && !document.getElementById('evRoll') && /Pass event/.test(document.getElementById('evSide').textContent)`));
      await c.shot(join(SHOTS, `events_locked_${name}.png`));
      await tap(c, '#evPass');
      ok(L + 'SUPPORT / PASS opens the support panel (a panel, not a modal)', await c.waitFor(vis('premium'), 2000));

      // ── online: rivals from the server, THE REPLAY RULE, the server's guess ──
      const me = `kid${name}`, rival = `rv${name}`, rivalName = `Rival${name}`;
      const seedPts = [3, 1, 2, 3, 2];
      const vstart = windowOf(defById('vines-day'), now).start;
      const t0 = Math.max(vstart + 60e3, now - 3 * 3600e3);
      const rb = seedPts.map((p, i) => [`camp:${rival}-${i}`, p, 'campaign', t0 + i * 120e3]);
      const sr = await fetch(arena.base + '/events/sync', { method: 'POST', headers: { Authorization: `Bearer dev:${rival}` }, body: JSON.stringify({ event: VEV, name: rivalName, b: rb, rolls: 99 }) });
      ok(L + 'seed a rival through the real API', sr.ok);
      await c.eval('localStorage.clear()');
      await c.goto(url(`auto=1&arena=${encodeURIComponent(arena.base)}&arenauid=${me}`));
      await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
      await tap(c, '#btnEvents');
      await c.waitFor(vis('events'), 3000);
      const rowOf = `[...document.querySelectorAll('#evSide .evriv > div')].find(d => d.textContent.includes('${rivalName}'))`;
      ok(L + 'online: the rival is listed', await c.waitFor(`!!${rowOf}`, 5000));
      const rpos = (k) => V.positionAtTurn(V.makeBoard(VEV), rival, VEV, seedPts, k).pos;
      ok(L + 'the replay check is not blind (their turn 2 and turn 5 differ)', rpos(2) !== rpos(5));
      const listedJS = `+((${rowOf})?.querySelector('span')?.textContent || '').replace('sq ', '')`;
      const listed = () => c.eval(listedJS);
      ok(L + 'with 0 turns of mine, the rival stands at their turn 0', await listed() === rpos(0), `${await listed()} vs ${rpos(0)}`);
      // Two fights (60 s apart, the campaign cap), then roll them: the rival may only reach their turn 2.
      for (const k of [0, 1]) await c.eval(`window.dispatchEvent(new CustomEvent('ragdojo:battle',{detail:{at:Date.now()-${(2 - k) * 70e3},src:'campaign',won:true,oppDmg:1}}))`);
      ok(L + 'online: the server accepted both fights', await c.waitFor(`window.__events.state.ev['${VEV}']?.b.length === 2 && window.__events.online`, 5000));
      for (let i = 0; i < 6; i++) {
        await c.waitFor(`!window.__events.vview.busy() && !document.getElementById('evRoll').disabled`, 6000);
        await tap(c, '#evRoll');
      }
      await c.waitFor(`window.__events.state.ev['${VEV}'].rolls === 6`, 3000);
      await sleep(1500);
      const myTurns = 2;
      ok(L + 'after my turn 2 the rival stands at THEIR turn 2, not their 5', await c.waitFor(`${listedJS} === ${rpos(myTurns)}`, 5000), `${await listed()} vs ${rpos(myTurns)} (their now: ${rpos(5)})`);
      const srv = await (await fetch(arena.base + '/events/sync', { method: 'POST', headers: { Authorization: `Bearer dev:${me}` }, body: JSON.stringify({ event: VEV }) })).json();
      ok(L + 'the server holds my 6 rolls', srv.rolls === 6, JSON.stringify(srv.rolls));
      await c.shot(join(SHOTS, `events_online_${name}.png`));
      // The guess goes to the server; a right one pays ink and unlocks the background.
      await tap(c, `#evTabs [data-ev="${REV}"]`);
      await c.waitFor(`document.querySelector('[data-guess]')`, 3000);
      const ink0 = await c.eval('window.__ragdojo.save.ink');
      await tap(c, `[data-guess="A FLYING KICK"]`);
      ok(L + 'a right guess solves it through the server', await c.waitFor(`window.__events.state.ev['${REV}']?.solved === true`, 5000));
      const ink1 = await c.eval('window.__ragdojo.save.ink');
      ok(L + 'the guess bonus pays ink (25 covered x 2)', ink1 - ink0 === 50, `${ink0} -> ${ink1}`);
      ok(L + 'the picture is unlocked as a background', await c.waitFor(`document.querySelector('[data-bg]')`, 2000));
      await tap(c, `[data-bg]`);
      ok(L + 'USE IT sets the arena/menu background', await c.eval(`window.__ragdojo.save.eventPrizes.bg === '${REV}'`));
      ok(L + 'zero console errors', c.errors.length === 0, c.errors.join(' | '));
      c.chrome.kill('SIGKILL');
    }
  } catch (e) { ok('no exception', false, e.stack); } finally { done(); }
  return { pass, fail };
}

const MUTANTS = [
  ['no emit at the end of a campaign fight', 'js/main.js', "try { window.dispatchEvent(new CustomEvent('ragdojo:battle', { detail: battle })); } catch {}", ''],
  ['ROLL does not persist the roll count', 'js/events/ui.js', 'setSt(E.setEv(st(), id, { ...ev, uid, rolls: r.rolls }));', 'setSt(E.setEv(st(), id, { ...ev, uid }));'],
  ['the canvas ignores the portrait rotation', 'js/events/ui.js', 'const rot = isRotated();', 'const rot = false;'],
  ['the server shows rivals at their real turn', 'server/events.go', 'shown := min(theirs, myTurns)', 'shown := min(theirs, myTurns+1000)'],
];

if (process.argv.includes('--falsify')) {
  let red = 0;
  for (const [what, file, from, to] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'eventsmut-'));
    for (const d of ['js', 'css', 'server', 'dev']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
    for (const f of ['index.html']) cpSync(join(ROOT, f), join(dir, f));
    mkdirSync(join(dir, 'assets'));
    for (const a of ['events', 'audio', 'fonts']) { try { symlinkSync(join(ROOT, 'assets', a), join(dir, 'assets', a)); } catch {} }
    const src = readFileSync(join(dir, file), 'utf8');
    if (!src.includes(from)) { log(`MUTANT MISSED (source moved): ${what}`); process.exitCode = 1; continue; }
    writeFileSync(join(dir, file), src.replace(from, to));
    if (file.startsWith('server/')) {
      try { execFileSync('go', ['vet', '.'], { cwd: join(dir, 'server'), stdio: 'pipe' }); } catch (e) {
        log(`BROKEN MUTANT (does not compile): ${what}\n${e.stderr}`); process.exitCode = 1; rmSync(dir, { recursive: true, force: true }); continue;
      }
    }
    log(`\n── mutant: ${what}`);
    const r = await run(dir, join(dir, 'server'), { label: '[mut] ' });
    rmSync(dir, { recursive: true, force: true });
    log(r.fail ? `RED   ${what} (${r.fail} failed)` : `GREEN ${what} — the gate did not notice`);
    if (r.fail) red++;
  }
  log(`\nfalsify: ${red}/${MUTANTS.length} mutants caught`);
  process.exit(red === MUTANTS.length ? 0 : 1);
} else {
  const r = await run(ROOT, join(ROOT, 'server'));
  log(`\n${r.pass} passed, ${r.fail} failed`);
  process.exit(r.fail ? 1 : 0);
}
