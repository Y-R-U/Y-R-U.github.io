// TASKS lane (D34) in the real game: real taps (tools/loop/driver.mjs), window.__game only read.
//   ~/.claude/bin/cdp start --port 9671 -- --use-angle=metal ; python3 -m http.server 8889 (repo root)
//   node tools/test-tasks.mjs [--port=9671] [--url=http://127.0.0.1:8889/gms/3d/krayzee/] [--timescale=6]
// Checks: menu → Tasks grid opens and fits at 390×844 and 844×390; a real Free Flight completes tasks (take-off,
// first landing) → the tick toast shows and the grid ticks; the pause screen link. Shots: docs/shots/tasks/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep, SNAP } from './loop/driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'shots', 'tasks');
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}`)); return a ? a.split('=')[1] ?? true : d; };
const PORT = +arg('port', 9671), BASE = arg('url', 'http://127.0.0.1:8889/gms/3d/krayzee/'), TS = +arg('timescale', 6);
const PROFILE = { name: 'Tasker', gender: 'f', company: 'Ledger Air', primary: '#1d4f91', secondary: '#f4efe6', accent: '#d4a017', voice: 'duchess', registration: 'K-TASK' };
const COACH_SEEN = { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1 };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } return c; };
const waitReal = async (fn, ms, every = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };

const D = await connect(PORT);
await D.send('Runtime.enable'); await D.send('Page.enable'); await D.send('Network.enable');
await D.send('Network.setCacheDisabled', { cacheDisabled: true });

async function fresh(w, h, seed = {}) {
  await D.viewport(w, h);
  await D.send('Page.navigate', { url: BASE + 'docs/' }); await sleep(400);
  await D.ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
    localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
    const x = ${JSON.stringify(COACH_SEEN)}; for (const k in x) localStorage.setItem(k, JSON.stringify(x[k]));
    const s = ${JSON.stringify(seed)}; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k]));
    localStorage.setItem('krayzee.settings', JSON.stringify({ v: 3, difficulty: 'easy' })); return 1; })()`);
  D.errors.length = 0;
  await D.send('Page.navigate', { url: `${BASE}?noaccount=1&intro=0&timescale=${TS}` });
  await waitReal(() => D.evSafe('!!window.__krayzeeReady'), 40000, 300);
  await waitReal(() => D.rect('.kz-tk-menu'), 8000);
  await sleep(1200);
}
// layout audit of the open grid: nothing wider than the screen, the panel inside it, tiles not overlapping
const AUDIT = `(() => { const p = document.querySelector('.kz-tasks.on .kz-panel'); if (!p) return null; const r = p.getBoundingClientRect(), b = p.querySelector('.kz-body');
  const tiles = [...p.querySelectorAll('.kz-tk-tile')], rs = tiles.slice(0, 40).map((t) => t.getBoundingClientRect());
  let overlap = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], c = rs[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) overlap++; }
  const n = p.querySelector('.kz-tk-n'); const cols = new Set(rs.filter((x) => Math.abs(x.top - rs[0].top) < 2).map((x) => Math.round(x.left))).size;
  return { panel: [r.left, r.top, r.right, r.bottom].map(Math.round), vw: innerWidth, vh: innerHeight, hScroll: b.scrollWidth > b.clientWidth + 1, docScroll: document.documentElement.scrollWidth > innerWidth + 1,
    tiles: tiles.length, done: p.querySelectorAll('.kz-tk-tile.done').length, overlap, cols, minTile: Math.round(Math.min(...rs.map((x) => x.width))), minH: Math.round(Math.min(...rs.map((x) => x.height))),
    nameFont: n ? parseFloat(getComputedStyle(n).fontSize) : 0, foot: Math.round(p.querySelector('.kz-foot').getBoundingClientRect().bottom) }; })()`;

for (const [w, h, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
  console.log(`\n# menu → Tasks (${tag} ${w}×${h})`);
  await fresh(w, h);
  const btn = await D.rect('.kz-tk-menu');
  ok(btn && btn.cx > 0 && btn.cy < h && btn.y + btn.h <= h, `Tasks button on the menu (${btn?.txt})`);
  ok(btn && (await D.onTop('.kz-tk-menu', btn.cx, btn.cy)), 'Tasks button is not covered');
  await D.shot(OUT, `menu-${tag}`);
  await D.tap('.kz-tk-menu');
  await waitReal(() => D.rect('.kz-tasks.on .kz-panel'), 3000); await sleep(600); // the panel's 0.3 s slide-in
  const open = await waitReal(() => D.evSafe(AUDIT), 3000);
  ok(!!open, 'the Tasks grid opens from a real tap');
  if (open) {
    ok(open.panel[0] >= 0 && open.panel[1] >= 0 && open.panel[2] <= w && open.panel[3] <= h, `panel inside the screen ${JSON.stringify(open.panel)}`);
    ok(!open.hScroll && !open.docScroll, 'no horizontal scroll');
    ok(open.tiles >= 120, `${open.tiles} tiles`);
    ok(!open.overlap, 'tiles do not overlap');
    ok(open.cols >= 3 && open.minTile >= 90 && open.minH >= 70, `grid ${open.cols} columns, tiles ≥ ${open.minTile}×${open.minH} px`);
    ok(open.nameFont >= 11, `tile text ${open.nameFont} px`);
  }
  await sleep(500);
  await D.shot(OUT, `grid-${tag}`);
  const tile = await D.rect('.kz-tk-tile[data-id="butter"]');
  if (tile) await D.tapAt(tile.cx, tile.cy);
  const det = await waitReal(() => D.evSafe(`document.querySelector('.kz-tk-detail')?.innerText || ''`).then((t) => /Butter Fingers/.test(t) && t), 2000);
  ok(!!det, `tap a tile → one-line description (${String(det).replace(/\s+/g, ' ').slice(0, 90)})`);
  await D.shot(OUT, `grid-detail-${tag}`);
  // the Heavy Metal set: a tile is locked ("coming soon") exactly when its plane is not status 'ready'
  await D.ev(`document.querySelector('.kz-tk-set[data-set="heavy"]')?.scrollIntoView({ block: 'start' })`); await sleep(300);
  const lock = await D.evSafe(`document.querySelectorAll('.kz-tk-set[data-set="heavy"] .kz-tk-tile.lock').length`);
  const notReady = (await import('../data/aircraft.js')).AIRCRAFT;
  const want = ['jumbo', 'herc', 'f35'].some((k) => notReady[k]?.status !== 'ready');
  ok(want ? lock > 0 : lock === 0, `Heavy Metal tiles locked only while a jet is not ready (${lock} locked; jets ${want ? 'not all ready' : 'ready'})`);
  await D.shot(OUT, `grid-heavy-${tag}`);
  await D.tap('.kz-tasks .kz-x');
  ok(await waitReal(() => D.evSafe(`!document.querySelector('.kz-tasks.on')`), 2000), 'close button closes it');
}

console.log('\n# earned state: a seeded ledger with two sets done (badges, pilot medal)');
{
  await fresh(390, 844, { 'krayzee.tasks': { v: 1, done: Object.fromEntries(['touch_down', 'gentle', 'butter', 'firm', 'boing', 'hat_trick', 'crosswind', 'deadstick', 'textbook', 'castle', 'church', 'land_10', 'rule_tower_buzz', 'rule_queue_jump', 'fly_c172'].map((k) => [k, 1])),
    sets: { wheels: 1 }, stats: { landings: 23, airSecs: 4350, distM: 152000, infractions: 41, takeoffs: 12 }, uniq: {}, best: { landings: 3 }, worn: 'wheels', unseen: ['castle', 'church'], savedAt: 1 } });
  const medal = await D.rect('.kz-tk-medal');
  ok(!!medal, 'the worn badge shows on the pilot card roundel');
  const dot = await D.rect('.kz-tk-new');
  ok(!!dot, 'unseen ticks put a dot on the Tasks button');
  await D.shot(OUT, 'menu-earned-portrait');
  await D.tap('.kz-tk-menu'); await sleep(700);
  await D.shot(OUT, 'grid-earned-portrait');
  await D.tap('.kz-tasks .kz-x'); await sleep(500);
  ok(!(await D.rect('.kz-tk-new')), 'opening the grid clears the dot');
}

console.log('\n# set complete: the celebration card waits for the menu or a parked plane');
{
  const wheels = ['gentle', 'butter', 'firm', 'boing', 'hat_trick', 'crosswind', 'deadstick', 'textbook'];
  await fresh(390, 844, { 'krayzee.tasks': { v: 1, done: Object.fromEntries(wheels.map((k) => [k, 1])), sets: {}, stats: {}, uniq: {}, best: {}, worn: null, unseen: [], savedAt: 1 } });
  // the one missing task arrives as an event (in the menu: not attached, so no toast, straight to the card)
  await D.ev(`import('./js/game/tasks.js').then((m) => { m.peekTasks().handle({ type: 'touchdown', fpm: 300, surface: 'runway' }); return 1; })`);
  const card = await waitReal(() => D.rect('.kz-tk-cele.on .kz-tk-cc'), 3000);
  ok(!!card && /Wheels, Mostly Down/.test(card.txt), `set card in the menu: "${card?.txt}"`);
  await sleep(400);
  await D.shot(OUT, 'set-complete-portrait');
  await D.tap('.kz-tk-cele [data-c="ok"]');
  ok(await waitReal(async () => !(await D.rect('.kz-tk-cele')), 2000), 'Splendid closes it');
  ok(await D.evSafe(`import('./js/game/tasks.js').then((m) => m.peekTasks().worn()?.id === 'wheels')`), 'first set badge worn');
}

console.log('\n# real Free Flight: take off, LAND, first touchdown → toast + grid tick');
{
  await fresh(390, 844);
  const before = await D.evSafe(`import('./js/game/tasks.js').then((m) => m.peekTasks()?.summary().done)`);
  ok(before === 0, `fresh ledger (${before} done)`);
  // record every toast the page shows
  await D.ev(`(() => { window.__tkToasts = []; setInterval(() => { const t = document.querySelector('.kz-tk-toast.on'); if (t && window.__tkToasts.at(-1)?.id !== t.dataset.id) { const r = t.getBoundingClientRect(); window.__tkToasts.push({ id: t.dataset.id, text: t.innerText.replace(/\\s+/g, ' '), rect: [r.left, r.top, r.width, r.height].map(Math.round) }); } }, 100); return 1; })()`);
  await D.tap('.kz-btn[data-a="free"]');
  const shown = await waitReal(() => D.rect('.kz-tk-toast.on'), 90000, 60);
  // what the toast overlaps at that moment (HUD it must not cover)
  const cover = await D.evSafe(`(() => { const t = document.querySelector('.kz-tk-toast.on').getBoundingClientRect(); const hit = [];
    for (const s of ['.krz-score', '.krz-top-l', '.krz-top-r', '#krz-hud .krz-hud-strip', '#krz-hud .krz-ap', '#krz-hud .krz-axes', '#krz-hud .krz-banner', '.krz-r-subs', '.krz-r-tower', '.krz-stick-base', '.krz-land', '.krz-r-btn'])
      for (const n of document.querySelectorAll(s)) { if (n.hidden || n.closest('[hidden]')) continue; const r = n.getBoundingClientRect(); if (r.width > 2 && r.left < t.right && t.left < r.right && r.top < t.bottom && t.top < r.bottom) hit.push(s); }
    return hit; })()`, ['?']);
  if (shown) await D.shot(OUT, 'flight-toast-portrait');
  const t1 = await waitReal(() => D.evSafe('window.__tkToasts.find((t) => t.id === "fly_c172")'), 6000, 100);
  ok(!!t1, `take-off toast: "${t1?.text}"`);
  if (t1) {
    const r = t1.rect;
    ok(r[0] < 80 && r[1] < 844 * 0.6, `toast sits top-left (${r.join(',')})`);
    ok(!cover.length, `toast covers no HUD (${cover.join(', ') || 'clear'})`);
    ok(r[2] <= 270 && r[3] <= 40, `toast is small (${r[2]}×${r[3]})`);
  }
  const t0 = Date.now(); await waitReal(async () => !(await D.rect('.kz-tk-toast.on')), 4000, 50);
  const lasted = (Date.now() - t0) / 1000 + 0.1;
  ok(lasted < 2.6, `toast gone after about 2 s (${lasted.toFixed(1)} s after first seen)`);
  const air = await waitReal(async () => { const s = await D.evSafe(SNAP); return s?.p && !s.p.gnd && s.p.agl > 60 && s; }, 90000, 300);
  ok(!!air, 'airborne on the autopilot');
  await D.tap('.krz-land');
  const down = await waitReal(async () => { const s = await D.evSafe(SNAP); return s?.p?.gnd && s; }, 150000, 300);
  ok(!!down, `LAND → on the ground (${down?.p?.surf})`);
  const t2 = await waitReal(() => D.evSafe('window.__tkToasts.find((t) => t.id === "touch_down")'), 6000, 100);
  ok(!!t2, `first landing toast: "${t2?.text}"`);
  await D.shot(OUT, 'flight-landed-portrait');
  const toasts = await D.evSafe('window.__tkToasts');
  console.log('   toasts:', toasts.map((t) => t.text).join(' | '));
  const ids = toasts.map((t) => t.id);
  ok(new Set(ids).size === ids.length, 'every toast once');
  // pause → the Tasks link → the grid shows the tick
  await waitReal(() => D.rect('[data-act="pause"]'), 3000);
  await D.tap('[data-act="pause"]');
  const link = await waitReal(() => D.rect('.kz-tk-pause'), 3000);
  ok(!!link && /\d+\/\d+/.test(link.txt), `pause screen link: "${link?.txt}"`);
  await D.shot(OUT, 'pause-link-portrait');
  await D.tap('.kz-tk-pause');
  await sleep(700);
  const ticked = await D.evSafe(`!!document.querySelector('.kz-tasks.on .kz-tk-tile.done[data-id="touch_down"]') && !!document.querySelector('.kz-tasks.on .kz-tk-tile.done[data-id="fly_c172"]')`);
  ok(ticked, 'the grid shows Touch Down and Royal Runabout ticked');
  await D.shot(OUT, 'pause-grid-portrait');
  const saved = await D.evSafe(`JSON.parse(localStorage.getItem('krayzee.tasks'))?.done || {}`);
  ok(saved.touch_down && saved.fly_c172, `saved to krayzee.tasks (${Object.keys(saved).join(', ')})`);
  const warp = await D.evSafe(`[window.__game.wiring.simK, (JSON.parse(localStorage.getItem('krayzee.tasks'))?.stats?.airSecs) ?? null, window.__game.traffic.time]`);
  ok(warp && warp[0] === TS, `wiring gets main's warp × timescale (simK ${warp?.[0]}; ?timescale=${TS})`);
  const life = await D.evSafe(`JSON.parse(localStorage.getItem('krayzee.career'))?.lifetimePP`);
  ok(life >= 200, `task PP reached the career (${life} lifetime PP)`);
}

console.log('\n# landscape take-off toast (844×390)');
{
  await fresh(844, 390);
  await D.tap('.kz-btn[data-a="free"]');
  const shown = await waitReal(() => D.rect('.kz-tk-toast.on'), 90000, 60);
  const cover = await D.evSafe(`(() => { const t = document.querySelector('.kz-tk-toast.on')?.getBoundingClientRect(); if (!t) return ['none']; const hit = [];
    for (const s of ['.krz-score', '.krz-top-l', '.krz-top-r', '#krz-hud .krz-hud-strip', '#krz-hud .krz-ap', '#krz-hud .krz-axes', '#krz-hud .krz-banner', '.krz-r-subs', '.krz-r-tower', '.krz-stick-base', '.krz-land', '.krz-r-btn'])
      for (const n of document.querySelectorAll(s)) { if (n.hidden || n.closest('[hidden]')) continue; const r = n.getBoundingClientRect(); if (r.width > 2 && r.left < t.right && t.left < r.right && r.top < t.bottom && t.top < r.bottom) hit.push(s); }
    return hit; })()`, ['?']);
  if (shown) await D.shot(OUT, 'flight-toast-landscape');
  ok(!!shown && /Royal Runabout/.test(shown.txt), `landscape toast: "${shown?.txt}" at ${shown ? Math.round(shown.x) + ',' + Math.round(shown.y) : '-'}`);
  ok(!cover.length, `landscape toast covers no HUD (${cover.join(', ') || 'clear'})`);
}

console.log(`\npage errors: ${D.errors.length ? D.errors.slice(0, 5).join(' || ') : 'none'}`);
ok(!D.errors.length, 'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
D.close();
process.exit(fail ? 1 : 0);
