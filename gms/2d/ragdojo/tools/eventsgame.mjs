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
 *     RULE puts them; approved art arrives as tiles of opened squares only; the guess is checked
 *     by the server and pays ink; the panel refreshes (Solved, PRIZES) without reopening;
 *   - no answers in the page: the practice picture offers no guess, a guess needs a battle,
 *     guess buttons are >= 40 px tall; battles are stamped on the SERVER's clock.
 *   - THE TOWER: a real tap on FIGHT FLOOR N starts a real fight; a win climbs, a loss drops,
 *     never below 1, winning floor 12 is the TOP (ink + prize); a tower fight also banks as a
 *     campaign fight elsewhere; tower rivals and floors come from the server;
 *   - STORY: points walk the circles; the last circle opens the chapter's picture and text;
 *     NEXT CHAPTER and re-reading by real taps;
 *   - the campaign cap: paid (supporter / Pass) = no daily limit, 15 s apart, free = 10 a day,
 *     with the panel copy to match, and the server agreeing with the client both ways;
 *   - a save still holding the retired SCROLLS & ROPES / MONTHLY PICTURE loads clean.
 *
 *   node tools/eventsgame.mjs              (EVENTS_TEST_PORT moves its ports; default 9500-9502)
 *   node tools/eventsgame.mjs --falsify    breaks the game 22 ways in a temp copy; each must go red
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, cpSync, symlinkSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP, ROOT, serve } from './cdp.mjs';
import { die } from '../js/events/hash.js';
import { activeEvents, defById, windowOf, eventIdOf } from '../js/events/calendar.js';
import * as V from '../js/events/vines.js';
import { storyOf } from '../js/events/story.js';

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

const slug = (id) => id.replace(/[^A-Za-z0-9-]+/g, '-');
const NOW0 = Date.now();
const REV0 = eventIdOf(defById('reveal-week'), windowOf(defById('reveal-week'), NOW0));
// Test art for this week's picture: server-side only, plus the public manifest entry the page
// would get from the repo (served through CDP Fetch, since the repo's manifest has no entry).
const ART_MANIFEST = { v: 1, pictures: { [REV0]: { w: 1024, h: 640, choices: ['A CANOE', 'A KITE', 'A TEA PARTY', 'A SUMO MATCH'] } } };

/** A stand-in payment service: every dev account holds the Pass, except ids with "free" in them. */
function entitlementStub(port) {
  const srv = createServer((req, res) => {
    const tok = String(req.headers.authorization || '');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ entitlements: /free/.test(tok) ? {} : { br8t_pass: true } }));
  });
  srv.listen(port, '127.0.0.1');
  return srv;
}

async function startArena(serverDir, port, dir) {
  const bin = join(dir, 'arena'), db = join(dir, 'a.db');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: serverDir, stdio: 'inherit' });
  mkdirSync(join(dir, 'art'));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-z', '640', '1024', join(ROOT, '../../../assets/screenshots/ragdojo.jpg'), '--out', join(dir, 'art', slug(REV0) + '.jpg')], { stdio: 'ignore' });
  writeFileSync(join(dir, 'answers.json'), JSON.stringify({ answers: { [REV0]: 'A KITE' } }));
  const proc = spawn(bin, [], { env: { ...process.env, ARENA_ADDR: `127.0.0.1:${port}`, ARENA_DB: db, ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off',
    ARENA_ENTITLEMENT_URL: `http://127.0.0.1:${port + 1}/ent`, ARENA_DEV_AUTH: '1', ARENA_EVENT_ANSWERS: join(dir, 'answers.json'), ARENA_EVENT_ART: join(dir, 'art') }, stdio: 'ignore' });
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
  const ent = entitlementStub(P0 + 2);
  const arena = await startArena(serverDir, P0 + 1, tmp);
  const tabs = [];
  const done = () => { for (const t of tabs) { try { t.chrome.kill('SIGKILL'); } catch {} } web.close(); ent.close(); arena.proc.kill('SIGKILL'); rmSync(tmp, { recursive: true, force: true }); };
  try {
    for (const [w, h, name] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
      const c = await CDP.launch();
      tabs.push(c);
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      let artOn = false;
      c.on('Fetch.requestPaused', (p) => {
        const body = Buffer.from(JSON.stringify(artOn ? ART_MANIFEST : { v: 1, pictures: {} })).toString('base64');
        void c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body });
      });
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*assets/events/manifest.json*' }] });
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
      ok(L + 'offline: the practice picture offers no guess', await c.eval(`!document.querySelector('[data-guess]') && /practice picture/.test(document.getElementById('evSide').textContent)`));
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
      // Approved art: only opened squares come down, as tiles; the guess goes to the server.
      artOn = true;
      await c.goto(url(`auto=1&arena=${encodeURIComponent(arena.base)}&arenauid=${me}`));
      await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
      await tap(c, '#btnEvents');
      await c.waitFor(vis('events'), 3000);
      await tap(c, `#evTabs [data-ev="${REV}"]`);
      ok(L + 'the server says the art is up', await c.waitFor(`window.__events.artOn('${REV}')`, 5000));
      await c.waitFor(`document.querySelector('[data-guess]')`, 3000);
      const heights = await c.eval(`[...document.querySelectorAll('[data-guess]')].map(b => Math.round(b.getBoundingClientRect()[${name === 'portrait' ? "'width'" : "'height'"}]))`);
      ok(L + 'guess buttons are at least 40 px tall to the thumb', heights.length === 4 && heights.every((x) => x >= 40), JSON.stringify(heights));
      await c.eval(`window.__events.uncover(7)`);
      ok(L + 'an opened square arrives as a tile from the server', await c.waitFor(`window.__events.arts.get('${REV}')?.have.has(7)`, 5000));
      await sleep(400);
      ok(L + 'only that tile, nothing else', await c.eval(`[...window.__events.arts.get('${REV}').have].join() === '7' && !window.__events.arts.get('${REV}').full`));
      const tileReqs = await c.eval(`performance.getEntriesByType('resource').map(e => e.name).filter(n => /events\\/art\\//.test(n))`);
      const peek = await fetch(arena.base + `/events/art/tile?event=${encodeURIComponent(REV)}&cell=8`, { headers: { Authorization: `Bearer dev:${me}` } });
      ok(L + 'the server refuses a tile for a square this player has not opened', peek.status === 403, `${peek.status}`);
      ok(L + 'the page asked for the opened square only (no whole picture)', tileReqs.length >= 1 && tileReqs.every((u) => /tile\?.*cell=7$/.test(u)), JSON.stringify(tileReqs));
      const ink0 = await c.eval('window.__ragdojo.save.ink');
      await tap(c, `[data-guess="A KITE"]`);
      ok(L + 'a right guess solves it through the server', await c.waitFor(`window.__events.state.ev['${REV}']?.solved === true`, 5000));
      const ink1 = await c.eval('window.__ragdojo.save.ink');
      ok(L + 'the guess bonus pays ink (24 covered x 2)', ink1 - ink0 === 48, `${ink0} -> ${ink1}`);
      ok(L + 'the panel refreshes at once: Solved line, no guess buttons, PRIZES tab', await c.waitFor(`!!document.getElementById('evSolved') && !document.querySelector('[data-guess]') && !!document.querySelector('#evTabs [data-ev="prizes"]')`, 2000));
      ok(L + 'the picture is unlocked as a background', await c.waitFor(`document.querySelector('[data-bg]')`, 2000));
      await tap(c, `[data-bg]`);
      ok(L + 'USE IT sets the arena/menu background', await c.eval(`window.__ragdojo.save.eventPrizes.bg === '${REV}'`));
      await c.shot(join(SHOTS, `events_art_${name}.png`));

      // A player with no battle in the event sees the choices, but cannot guess yet.
      await c.eval('localStorage.clear()');
      await c.goto(url(`auto=1&arena=${encodeURIComponent(arena.base)}&arenauid=fresh${name}`));
      await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
      await tap(c, '#btnEvents');
      await c.waitFor(vis('events'), 3000);
      await tap(c, `#evTabs [data-ev="${REV}"]`);
      ok(L + 'no battle yet: the choices are shown disabled, "fight once"', await c.waitFor(`document.querySelectorAll('[data-guess]').length === 4 && [...document.querySelectorAll('[data-guess]')].every(b => b.disabled) && /fight once/.test(document.getElementById('evSide').textContent)`, 5000),
        await c.eval(`JSON.stringify({ n: document.querySelectorAll('[data-guess]').length, dis: [...document.querySelectorAll('[data-guess]')].map(b => b.disabled), side: document.getElementById('evSide').textContent.slice(0, 300), ev: window.__events.state.ev['${REV}'] })`));

      await towerAndStory(c, L, name, url, arena, ok);

      // A phone whose clock is a day behind: the fight is stamped on the server's clock.
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source: 'Date.now = ((n) => () => n() - 86400000)(Date.now);' });
      await c.eval('localStorage.clear()');
      await c.goto(url(`auto=1&arena=${encodeURIComponent(arena.base)}&arenauid=skew${name}`));
      await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
      await c.waitFor('window.__events.online || window.__events.net.online', 5000);
      const awardSkew = await c.eval(`(()=>{const d={at:Date.now(),src:'campaign',won:true,oppDmg:1}; window.dispatchEvent(new CustomEvent('ragdojo:battle',{detail:d})); return d.award?.pts || 0})()`);
      const today = await c.eval(`Object.keys(window.__events.state.ev).filter(k => k.startsWith('vines-day:')).join()`);
      ok(L + 'a clock a day behind still fights in TODAY\'s events (server time)', today === VEV && awardSkew === 3, `${today} vs ${VEV}, award ${awardSkew}`);
      ok(L + 'zero console errors', c.errors.length === 0, c.errors.join(' | '));
      c.chrome.kill('SIGKILL');
    }
  } catch (e) { ok('no exception', false, e.stack); } finally { done(); }
  return { pass, fail };
}

const evTab = (prefix) => `[...document.querySelectorAll('#evTabs [data-ev]')].map(b => b.dataset.ev).find(i => i.startsWith('${prefix}'))`;
const sideText = `document.getElementById('evSide').textContent`;

async function openEvents(c, u) {
  await c.goto(u);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
  await c.eval(`(() => { const o = { v: 0 }; window.__clock = o; const n = Date.now; Date.now = () => n() + o.v; })()`);
  await tap(c, '#btnEvents');
  await c.waitFor(vis('events'), 3000);
}

/** THE TOWER, the STORY, the paid cap, a retired-event save. */
async function towerAndStory(c, L, name, url, arena, ok) {
  const off = 'arena=http://127.0.0.1:1/x';
  // A save from before: the retired Pass events are still in it.
  await c.eval(`(() => { localStorage.clear(); localStorage.setItem('ragdojo.save.v2', JSON.stringify({ events: { v: 1, seenDay: '', ev: {
    'vines-month:2026-10': { b: [['arena:1', 3, 'arena', 1]], rolls: 2 }, 'reveal-month:2026-10': { b: [], open: [1, 2] } } } })) })()`);
  const errs0 = c.errors.length;
  await openEvents(c, url(`auto=1&${off}`));
  ok(L + 'a save holding SCROLLS & ROPES / MONTHLY PICTURE loads, and they are gone', await c.eval(`!Object.keys(window.__ragdojo.save.events.ev).some(k => /month/.test(k)) && ![...document.querySelectorAll('#evTabs [data-ev]')].some(b => /month/.test(b.dataset.ev))`) && c.errors.length === errs0);
  const TW = await c.eval(evTab('tower:')), ST = await c.eval(evTab('story:'));
  ok(L + 'THE TOWER and STORY tabs are listed', !!TW && !!ST, `${TW} ${ST}`);

  // ── THE TOWER: real fights from the panel ──
  const fight = async (win) => {
    await c.eval('window.__clock.v += 20000');
    await tap(c, `#evTabs [data-ev="${TW}"]`);
    const label = await c.eval(`document.getElementById('evFight')?.textContent || ''`);
    if (!(await tap(c, '#evFight'))) return { label, started: false };
    const started = await c.waitFor(`window.__state && window.__state.mode === "fight" && !!window.__ragdojo.match?.tower`, 5000);
    const floor = await c.eval('window.__ragdojo.match?.tower');
    await c.eval(win ? `window.__ragdojo.match.enemies.forEach(e => e.hurt(99999, {from:[0,0], kb:900, stagger:1}))`
      : `window.__ragdojo.match.player.hurt(99999, {from:[0,0], kb:900, stagger:1})`);
    await c.waitFor(vis('events') + ` && window.__state.mode === 'hub'`, 15000);
    await c.frames(4);
    return { label, started, floor, note: await c.eval(`document.getElementById('evNote')?.textContent || ''`) };
  };
  const floorNow = () => c.eval(`(() => { const t = window.__events.state.ev['${TW}']?.t || []; let f = 1; for (const r of t) f = r[1] ? Math.min(12, f + 1) : Math.max(1, f - 1); return f; })()`);
  const VEV = await c.eval(evTab('vines-day:'));
  const vb0 = await c.eval(`window.__events.state.ev['${VEV}']?.b.length || 0`);
  let f = await fight(true);
  ok(L + 'a real tap on FIGHT FLOOR 1 starts a real fight on floor 1', f.started && f.floor === 1 && /FLOOR 1/.test(f.label), JSON.stringify(f));
  ok(L + 'a win climbs to floor 2, and the panel says so', await floorNow() === 2 && /WON on floor 1 — up to floor 2/.test(f.note), f.note);
  ok(L + 'the tower fight also banked as a campaign fight (Vines & Ladders +3)', await c.eval(`window.__events.state.ev['${VEV}']?.b.length || 0`) === vb0 + 1 && /\+3 event points/.test(f.note), f.note);
  f = await fight(false);
  ok(L + 'a loss drops a floor (2 -> 1)', f.floor === 2 && await floorNow() === 1 && /down to floor 1/.test(f.note), f.note);
  f = await fight(false);
  ok(L + 'a loss on floor 1 stays on floor 1', f.floor === 1 && await floorNow() === 1 && /still on floor 1/.test(f.note), f.note);
  // Quitting a losing tower fight from pause is a loss (and the pause panel says so), and so is a reload.
  const upOne = (k) => c.eval(`(() => { window.__clock.v += 20000; window.__ragdojo.save.events.ev['${TW}'].t.push(['tower:up${k}', 1, Date.now()]); window.__clock.v += 20000; })()`);
  await upOne(1);
  await tap(c, `#evTabs [data-ev="${TW}"]`);
  await tap(c, '#evFight');
  await c.waitFor(`window.__state && window.__state.mode === "fight" && window.__ragdojo.match?.tower === 2`, 5000);
  await tap(c, '#btnPause');
  await c.waitFor(vis('settings'), 3000);
  const qn = await c.eval(`(() => { const n = document.getElementById('evQuitNote'); return n && n.offsetParent ? n.textContent : ''; })()`);
  ok(L + 'the pause panel says quitting a tower fight counts as a loss', /counts as a loss/.test(qn), qn);
  await tap(c, '#btnQuit');
  await c.waitFor(`window.__state.mode === 'hub'`, 5000);
  await sleep(200);
  ok(L + 'QUIT from a tower fight on floor 2: a loss, back to floor 1', await floorNow() === 1 && await c.eval(`!window.__events.state.ev['${TW}'].pend && window.__events.state.ev['${TW}'].t.at(-1)[1] === 0`), await c.eval(`JSON.stringify(window.__events.state.ev['${TW}'])`));
  ok(L + 'the note is gone outside a tower fight', await c.eval(`!document.getElementById('evQuitNote')?.offsetParent`));
  await tap(c, '#btnEvents');
  await c.waitFor(vis('events'), 3000);
  await upOne(2);
  await tap(c, `#evTabs [data-ev="${TW}"]`);
  await tap(c, '#evFight');
  await c.waitFor(`window.__state && window.__state.mode === "fight" && window.__ragdojo.match?.tower === 2`, 5000);
  await openEvents(c, url(`auto=1&${off}`));
  await c.eval('window.__clock.v += 200000');
  ok(L + 'a reload in the middle of a tower fight on floor 2: a loss, floor 1', await floorNow() === 1 && await c.eval(`!window.__events.state.ev['${TW}'].pend`), await c.eval(`JSON.stringify(window.__events.state.ev['${TW}'])`));
  await c.eval('window.__clock.v += 20000');
  // Straight to floor 12: eleven wins (stamped an hour back, a minute apart).
  await c.eval(`(() => { const S = window.__ragdojo.save, e = S.events.ev['${TW}']; const t0 = Date.now() - 7200e3;
    e.t = [...e.t.map((r, i) => [r[0], r[1], t0 - 600e3 + i * 60e3]), ...Array.from({ length: 11 }, (_, i) => ['tower:seed' + i, 1, t0 + i * 60e3])]; })()`);
  const ink0 = await c.eval('window.__ragdojo.save.ink');
  f = await fight(true);
  ok(L + 'floor 12 shows FIGHT THE TOP; winning it is the TOP', /THE TOP/.test(f.label) && f.floor === 12 && await floorNow() === 12 && /tower is yours/.test(f.note), `${f.label} / ${f.note}`);
  ok(L + 'the TOP pays 600 ink and a prize backdrop', await c.eval('window.__ragdojo.save.ink') - ink0 === 600 && await c.eval(`window.__ragdojo.save.eventPrizes.bgs.some(b => b.id === '${TW}' && b.kind === 'tower')`));
  f = await fight(true);
  ok(L + 'defending the TOP pays nothing twice', await c.eval('window.__ragdojo.save.ink') - ink0 === 600 && /defended the TOP/.test(f.note), f.note);
  await sleep(1500);
  await c.shot(join(SHOTS, `events_tower_${name}.png`));

  // ── STORY: points walk the circles; the chapter opens at the last one ──
  await tap(c, `#evTabs [data-ev="${ST}"]`);
  const st = storyOf(ST.slice(6)), first = st.chapters[0].circles;
  const pts = await c.eval(`window.__events.state.ev['${ST}'] ? window.__events.state.ev['${ST}'].b.reduce((a, x) => a + x[1], 0) : 0`);
  ok(L + 'STORY: the tower fights walked it too (any battle)', pts >= 3, `${pts}`);
  // Exactly to the end of chapter 1: campaign fights a minute apart.
  const need = first - pts;
  await c.eval(`(() => { let n = ${need}; const t0 = Date.now() - 3600e3; for (let i = 0; n > 0; i++) { const w = n >= 3; window.dispatchEvent(new CustomEvent('ragdojo:battle', { detail: { at: t0 + i * 70e3, src: 'campaign', won: w, oppDmg: n === 2 ? 1 : 0 } })); n -= w ? 3 : n === 2 ? 2 : 1; } })()`);
  const pts1 = await c.eval(`window.__events.state.ev['${ST}'].b.reduce((a, x) => a + x[1], 0)`);
  ok(L + `STORY: ${first} points banked = chapter 1's ${first} circles`, pts1 === first, `${pts1}`);
  await c.eval(`window.__events.setTab('${ST}')`);
  ok(L + 'the walker walks the circles, then chapter 1 opens: picture + its text', await c.waitFor(`window.__events.story.mode === 'page' && window.__events.story.ch === 0`, 12000)
    && await c.eval(`${sideText}.includes(${JSON.stringify(st.chapters[0].text.slice(0, 40))}) && /NEXT CHAPTER/.test(${sideText})`));
  await c.shot(join(SHOTS, `events_story_page_${name}.png`));
  await tap(c, '#evNext');
  ok(L + 'NEXT CHAPTER (real tap): chapter 2\'s track, at its first circle', await c.waitFor(`window.__events.story.mode === 'track' && window.__events.story.ch === 1 && window.__events.sview.at === 0`, 3000)
    && await c.eval(`/CHAPTER 2/.test(${sideText}) && /circle/.test(${sideText})`));
  await c.eval(`window.__clock.v += 20000; window.dispatchEvent(new CustomEvent('ragdojo:battle', { detail: { at: Date.now(), src: 'campaign', won: true, oppDmg: 1 } }))`);
  await c.eval(`window.__events.setTab('${ST}')`);
  ok(L + 'a win walks 3 circles into chapter 2', await c.waitFor(`window.__events.sview.at === 3 && !window.__events.sview.busy()`, 6000), await c.eval('window.__events.sview.at'));
  await c.shot(join(SHOTS, `events_story_track_${name}.png`));
  await tap(c, '[data-ch="0"]');
  ok(L + 'an opened chapter is re-readable (tap 1): picture, text, BACK', await c.waitFor(`window.__events.story.mode === 'page' && window.__events.story.ch === 0 && window.__events.story.reread`, 2000)
    && await c.eval(`/BACK/.test(document.getElementById('evNext')?.textContent || '')`));
  ok(L + 'chapter 3 is not open yet', await c.eval(`document.querySelector('[data-ch="2"]').disabled`));
  await tap(c, '#evNext');
  ok(L + 'BACK returns to the chapter 2 track', await c.waitFor(`window.__events.story.mode === 'track' && window.__events.story.ch === 1`, 2000));

  // ── the campaign cap, paid vs free, client and server agreeing ──
  ok(L + 'paid copy: "unlimited, thanks for supporting"', await c.eval(`/unlimited, thanks for supporting/.test(${sideText})`));
  for (const [who, q, gap, want] of [['paid', '', 20e3, 14], ['free', '&evpaid=0', 70e3, 10]]) {
    // Fought before the panel is opened (an open panel syncs, and nothing older than a sync is taken).
    await c.eval('localStorage.clear()');
    await c.goto(url(`auto=1&arena=${encodeURIComponent(arena.base)}&arenauid=${who}cap${name}${q}`));
    await c.waitFor('window.__state && window.__state.mode === "hub" && window.__events.net.online', 20000);
    const V0 = eventIdOf(defById('vines-day'), windowOf(defById('vines-day'), await c.eval('Date.now()')));
    await c.eval(`(() => { const t0 = Date.now() - 14 * ${gap}; for (let i = 0; i < 14; i++) window.dispatchEvent(new CustomEvent('ragdojo:battle', { detail: { at: t0 + i * ${gap}, src: 'campaign', won: false, oppDmg: 0 } })); })()`);
    const local = await c.eval(`window.__events.state.ev['${V0}'].b.length`);
    for (let i = 0; i < 6; i++) { await sleep(700); await c.eval(`window.__events.sync('${V0}')`); if (await c.eval('window.__events.online')) break; }
    await sleep(400);
    const srv = await (await fetch(arena.base + '/events/sync', { method: 'POST', headers: { Authorization: `Bearer dev:${who}cap${name}` }, body: JSON.stringify({ event: V0 }) })).json();
    const after = await c.eval(`window.__events.state.ev['${V0}'].b.length`);
    ok(L + `${who}: 14 campaign fights ${gap / 1000} s apart -> client ${want}, server ${want}, and they agree`, local === want && srv.b.length === want && after === want && (!srv.cap.checked || srv.cap.paid === (who === 'paid')),
      `client ${local} (after sync ${after}), server ${srv.b.length}, cap ${JSON.stringify(srv.cap)}`);
    await tap(c, '#btnEvents');
    await c.waitFor(vis('events'), 3000);
    await tap(c, `#evTabs [data-ev="${V0}"]`);
    if (who === 'free') ok(L + 'free copy: "campaign fights count (10 a day)"', await c.eval(`/campaign fights count \\(10 a day\\)/.test(${sideText})`), await c.eval(sideText));
  }

  // ── tower rivals come from the server, on their floors ──
  const now = Date.now(), rname = `Tower${name}`;
  const tr = await fetch(arena.base + '/events/sync', { method: 'POST', headers: { Authorization: `Bearer dev:tw${name}` },
    body: JSON.stringify({ event: TW, name: rname, t: [1, 1, 1].map((w, i) => [`tower:r${i}`, w, now - 600e3 + i * 60e3]) }) });
  ok(L + 'seed a tower rival through the real API (3 wins: floor 4)', tr.ok && (await tr.json()).floor === 4);
  await c.eval('localStorage.clear()');
  await openEvents(c, url(`auto=1&arena=${encodeURIComponent(arena.base)}&arenauid=climber${name}`));
  await tap(c, `#evTabs [data-ev="${TW}"]`);
  ok(L + 'online: the rival is listed on floor 4', await c.waitFor(`[...document.querySelectorAll('#evSide .evriv > div')].some(d => d.textContent.includes('${rname}') && /fl 4/.test(d.textContent))`, 6000));
  // The raw save, not __events.state (load() would strip the fields on the way out).
  const rawST = `window.__ragdojo.save.events.ev['${ST}']`;
  const afterSync = await c.eval(`(async () => { await new Promise((r) => setTimeout(r, 600)); await window.__events.sync('${ST}'); return JSON.stringify(${rawST} || null); })()`);
  ok(L + 'an online STORY sync writes no picture fields into the save', /"b":/.test(afterSync) && !/"open"|"bonus"|"guesses"/.test(afterSync), afterSync);
  ok(L + 'and drawn on the tower', await c.waitFor(`(window.__events.rivals.get('${TW}') || []).some(r => r.name === '${rname}' && r.floor === 4 && !('uid' in r))`, 2000));
  await c.shot(join(SHOTS, `events_tower_online_${name}.png`));

  // ── locked for a player without the Pass ──
  await c.eval('localStorage.clear()');
  await openEvents(c, url(`auto=1&${off}&evpass=0`));
  for (const id of [TW, ST]) {
    await tap(c, `#evTabs [data-ev="${id}"]`);
    ok(L + `${id.split(':')[0]} without the Pass: locked tab, SUPPORT / PASS, no FIGHT or NEXT`, await c.eval(`document.querySelector('#evTabs [data-ev="${id}"]').textContent.includes('🔒') && !!document.getElementById('evPass') && !document.getElementById('evFight') && !document.getElementById('evNext')`));
  }
  await c.eval(`window.__events.setTab('${TW}'); window.__events.fightTower()`);
  ok(L + 'a locked tower cannot be fought (no fight starts)', await c.eval(`window.__state.mode === 'hub' && !window.__ragdojo.match?.tower`));
  await c.shot(join(SHOTS, `events_tower_locked_${name}.png`));

  // ── a tower fight that ends after Monday 00:00 UTC counts for the week it started in ──
  await c.eval('localStorage.clear()');
  await openEvents(c, url(`auto=1&${off}`));
  const end = windowOf(defById('tower'), await c.eval('Date.now()')).end;
  await c.eval(`window.__clock.v = ${end} - 10000 - (Date.now() - window.__clock.v)`);
  await c.eval(`window.__events.open('${TW}')`);
  await tap(c, '#evFight');
  await c.waitFor(`window.__state && window.__state.mode === "fight" && !!window.__ragdojo.match?.tower`, 5000);
  await c.eval('window.__clock.v += 40000');
  await c.eval(`window.__ragdojo.match.enemies.forEach(e => e.hurt(99999, {from:[0,0], kb:900, stagger:1}))`);
  await c.waitFor(vis('events') + ` && window.__state.mode === 'hub'`, 15000);
  const edge = await c.eval(`document.getElementById('evNote')?.textContent || ''`);
  ok(L + 'a tower win across Monday 00:00 counts for the week it started (not "too quick")', await c.eval(`(window.__events.state.ev['${TW}']?.t || []).length === 1`) && /WON on floor 1 — up to floor 2/.test(edge), edge);
}

const MUTANTS = [
  ['no emit at the end of a campaign fight', 'js/main.js', "try { window.dispatchEvent(new CustomEvent('ragdojo:battle', { detail: battle })); } catch {}", ''],
  ['ROLL does not persist the roll count', 'js/events/ui.js', 'setSt(E.setEv(st(), id, { ...ev, uid, rolls: r.rolls }));', 'setSt(E.setEv(st(), id, { ...ev, uid }));'],
  ['the canvas ignores the portrait rotation', 'js/events/ui.js', 'const rot = isRotated();', 'const rot = false;'],
  ['the server shows rivals at their real turn', 'server/events.go', 'shown := min(theirs, myTurns)', 'shown := min(theirs, myTurns+1000)'],
  ['battles stamped with the device clock (M4)', 'js/events/ui.js', ': Date.now()) + net.skew;', ': Date.now());'],
  ['the panel is not refreshed after a guess (L5)', 'js/events/ui.js', '    if (tab === id && isOpen()) paint();', '    if (tab === id && isOpen()) paintSide();'],
  ['guess buttons are short (L10)', 'js/events/ui.js', 'line-height: 1.1; min-height: 40px; }', 'line-height: 1.1; }'],
  ['the practice picture offers a guess (M1)', 'js/events/ui.js', 'const ask = !real ?', 'const ask = false ?'],
  ['the server sends any tile asked for', 'server/eventart.go', '(!whole && !containsInt(open, cell))', '(!whole && false)'],
  ['a tower loss climbs too', 'js/events/tower.js', '} else floor = Math.max(1, floor - 1);', '} else floor = Math.min(FLOORS, floor + 1);'],
  ['tower fights start on floor 1 always', 'js/events/ui.js', 'floor: before, save: h.getSave(),', 'floor: 1, save: h.getSave(),'],
  ['a tower fight is not a campaign battle', 'js/events/ui.js', "try { window.dispatchEvent(new CustomEvent('ragdojo:battle', { detail })); } catch {}", ''],
  ['the TOP pays nothing', 'js/events/ui.js', "!['reveal', 'tower', 'story'].includes(p.def.kind)", "!['reveal', 'story'].includes(p.def.kind)"],
  ['the story chapter never opens', 'js/events/ui.js', 'if (to >= end) sv.pending = true;', ''],
  ['the client ignores the paid cap', 'js/events/ui.js', 'E.recordBattle(before, b, { cap: capNow() })', 'E.recordBattle(before, b)'],
  ['quitting a tower fight saves the floor (M3)', 'js/events/ui.js', "setSt(E.setEv(st(), id, { ...E.evState(st(), id), pend: [bid, at] }));", ''],
  ['no quit note in the pause panel (M3)', 'js/events/ui.js', '    quitNote(true);\n', ''],
  ['a tower result stamped when it ends (L1)', 'js/events/ui.js', '[bid, won ? 1 : 0, late ? end : at]', '[bid, won ? 1 : 0, end]'],
  ['STORY adopted as a picture (H2)', 'js/events/ui.js', "else if (p.def.kind === 'reveal') {", 'else {'],
  ['the server never counts anyone as paid', 'server/events.go', 'Paid: pass || out.Entitlements["ragdojo_supporter"]', 'Paid: false'],
  ['the retired SCROLLS & ROPES is back', 'js/events/calendar.js', "  { id: 'tower', kind: 'tower',", "  { id: 'vines-month', kind: 'vines', cadence: 'monthly', pass: true, anyBattle: false, title: 'SCROLLS & ROPES' },\n  { id: 'tower', kind: 'tower',"],
  ['THE TOWER is open without the Pass', 'js/events/calendar.js', "{ id: 'tower', kind: 'tower', cadence: 'weekly', pass: true,", "{ id: 'tower', kind: 'tower', cadence: 'weekly', pass: false,"],
];

if (process.argv.includes('--falsify')) {
  let red = 0;
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
  for (const [what, file, from, to] of MUTANTS.filter((m) => m[0].includes(only))) {
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
  log(`\nfalsify: ${red}/${MUTANTS.filter((m) => m[0].includes(only)).length} mutants caught`);
  process.exit(red === MUTANTS.filter((m) => m[0].includes(only)).length ? 0 : 1);
} else {
  const r = await run(ROOT, join(ROOT, 'server'));
  log(`\n${r.pass} passed, ${r.fail} failed`);
  process.exit(r.fail ? 1 : 0);
}
