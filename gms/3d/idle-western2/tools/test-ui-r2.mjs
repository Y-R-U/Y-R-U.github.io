// Round-2 UI regressions from PLAYTEST_1, all with real CDP touches at S22, Chrome forced to the Android autoplay
// policy (user gesture required). PT#1 hint queue never sticks, PT#3/#4 fling swipe → target, PT#8 gen-2 skips the
// mud opening, PT#9 audio unlocks on touchend and re-arms after an interruption. --strict also fails on S-owned
// framing (PT#3: drunk + targets on screen).
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { openPage, stop, GAME, VIEWPORTS, sleep } from './cdp.mjs';

const PORT = +(process.env.CDP_PORT || 9361);
const STRICT = process.argv.includes('--strict');
const fails = [], warns = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };
const soft = (ok, msg) => { if (STRICT) return check(ok, msg); console.log((ok ? '  ok   ' : '  WARN ') + msg); if (!ok) warns.push(msg); };

stop(PORT);
execFileSync(homedir() + '/.claude/bin/cdp', ['start', '--port', String(PORT), '--idle', '120', '--max', '900', '--', '--use-angle=metal', '--autoplay-policy=user-gesture-required'], { stdio: ['ignore', 'ignore', 'inherit'] });

async function open(q) {
  const page = await openPage(PORT);
  await page.goto(GAME + q, VIEWPORTS.s22);
  await page.wait('window.__iw2 && window.__iw2.ready && window.__iw2ui', 30000);
  const touch = (type, pts) => page.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  page.touch = touch;
  page.tap = async (x, y, hold = 40) => { await touch('touchStart', [[x, y]]); await sleep(hold); await touch('touchEnd', []); await sleep(60); };
  page.rect = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`);
  page.tapEl = async (sel) => { const r = await page.rect(sel); if (!r) return false; await page.tap(r.x, r.y); return true; };
  page.swipe = async (x0, y0, x1, y1, ms = 150, n = 5) => {
    await touch('touchStart', [[x0, y0]]);
    for (let i = 1; i <= n; i++) { await sleep(ms / n); await touch('touchMove', [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]]); }
    await touch('touchEnd', []); await sleep(80);
  };
  page.S = (expr) => page.eval(`(() => { const g = __iw2.game, st = g.state, ui = __iw2ui.debug; return ${expr}; })()`);
  page.until = async (expr, ms = 10000, step = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.S(expr)) return true; await sleep(step); } return false; };
  return page;
}
const warnCount = (page) => page.consoleLog.filter((c) => /not allowed to start/i.test(c.text)).length;

try {
  // ---------- PT#9: audio unlock ----------
  console.log('PT#9 audio unlock (fresh, Android autoplay policy)');
  let p = await open('?nosave=1');
  await sleep(800);
  check(await p.S('!ui.audio.ctx && ui.audio.listening'), 'no AudioContext before a gesture, unlock listeners armed');
  const hv = await p.rect('.hero-view');
  await p.touch('touchStart', [[hv.x - 60, hv.y + 120]]);
  await sleep(120);
  check(await p.S('!ui.audio.running'), 'a bare touchstart/pointerdown does not count as the unlock');
  await p.touch('touchEnd', []);
  check(await p.until('ui.audio.running', 3000), `touchend unlocks: context ${await p.S('ui.audio.ctx && ui.audio.ctx.state')}`);
  check(await p.S('!ui.audio.listening'), 'listeners removed once running');
  for (let i = 0; i < 4; i++) await p.tap(hv.x - 60 + i * 12, hv.y + 120);
  check(warnCount(p) === 0, `no "AudioContext was not allowed to start" warnings (${warnCount(p)})`);
  await p.S('(ui.audio.ctx.suspend(), 0)');
  await sleep(300);
  await p.eval(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); 0`);
  await sleep(300);
  const relisten = await p.S('ui.audio.running || ui.audio.listening');
  check(relisten, 'after an interruption the unlock listeners re-arm (or resume succeeded)');
  await p.tap(hv.x - 60, hv.y + 120);
  check(await p.until('ui.audio.running', 3000), 'the next tap resumes the context');
  await p.close();

  // ---------- PT#1: hint queue ----------
  console.log('PT#1 hint queue (fresh)');
  p = await open('?nosave=1');
  await sleep(1000);
  check(await p.S(`ui.coach.current === 'mud'`), 'opening coach: tap the mud');
  const spots = await p.eval(`(() => { const hv = document.querySelector('.hero-view').getBoundingClientRect(), hat = document.querySelector('.mud-hat').getBoundingClientRect(); const out = []; for (let y = hv.top + 80; y < hv.bottom - 60 && out.length < 6; y += 41) for (let x = hv.left + 50; x < hv.right - 50 && out.length < 6; x += 57) { if (x > hat.left - 24 && x < hat.right + 24 && y > hat.top - 24 && y < hat.bottom + 24) continue; const h = __iw2ui.debug.spectacle.pickHero(x, y); if (h.kind === 'street') out.push([x, y]); } return out; })()`);
  for (let i = 0; i < 6; i++) await p.tap(...spots[i % spots.length]);
  check(await p.until(`ui.coach.current === 'hat'`, 3000), 'coach moves to the hat');
  await p.tapEl('.mud-hat');
  await p.S('(st.cash = Math.max(st.cash, 60), 0)');
  await p.eval(`document.querySelector('.line-card[data-line="shine"]').scrollIntoView({ block: 'center' })`);
  await sleep(600);
  await p.tapEl('.line-card[data-line="shine"]');
  check(await p.S('!!st.build.shine'), 'Spit & Shine is building');
  await p.eval('scrollTo(0, 0)');
  // Do NOT hurry. B1: the hurry coach used to stick on the hero forever and block every later hint.
  const stuck = ['hurry', 'hurry-hero', 'mud', 'hat', 'buy'];
  check(await p.until(`st.lines.shine.lv > 0`, 15000), 'first build opens without a single hurry');
  await sleep(1500);
  check(!stuck.includes(await p.S('ui.coach.current')), `no stale hint after the build (${await p.S('ui.coach.current')})`);
  await p.S('(st.lines.shine.stock = (st.lines.shine.stock || 0), 0)');
  await p.eval(`document.querySelector('.line-card[data-line="shine"]').scrollIntoView({ block: 'center' })`);
  const later = await p.until(`['pile', 'level'].includes(ui.coach.current) || ui.reveal.is('h:pile')`, 25000, 400);
  check(later, `a later hint (sell / level up) reaches the player (${await p.S('ui.coach.current')} · queue ${await p.S('JSON.stringify(ui.coach.queued)')})`);
  // A long build: the hurry coach shows only while its card is visible and leaves when the build ends.
  await p.S('(st.cash = 1e6, 0)');
  await sleep(400);
  const next = await p.S(`(() => { const c = [...document.querySelectorAll('.line-card.ghost')].find((e) => !e.hidden && e.offsetParent); return c ? c.dataset.line : null; })()`);
  if (next) {
    await p.eval(`document.querySelector('.line-card[data-line="${next}"]').scrollIntoView({ block: 'center' })`);
    await sleep(600);
    await p.tapEl(`.line-card[data-line="${next}"]`);
    const T = await p.S(`st.build['${next}'] ? st.build['${next}'].T : 0`);
    if (T > 8) {
      check(await p.until(`ui.coach.current === 'hurry'`, 4000), `long build (${next}, ${T}s): hurry coach on its card`);
      await p.eval('scrollTo(0, 0)');
      await sleep(1200);
      check(await p.S(`ui.coach.current !== 'hurry'`), 'scrolled away: the card hurry coach steps aside');
      await p.S(`(st.build['${next}'] && (st.build['${next}'].t = st.build['${next}'].T - 0.05), g.tick(0.2), 0)`);
      await sleep(1200);
      check(!stuck.includes(await p.S('ui.coach.current')), `build done: no hurry hint left (${await p.S('ui.coach.current')})`);
    } else console.log(`  (skip long build: ${next} T=${T})`);
  }
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();

  // ---------- PT#3/#4: fling targets ----------
  console.log('PT#3/#4 fling (demo)');
  p = await open('?nosave=1&demo=1');
  await sleep(2500);
  await p.eval('scrollTo(0, 0)');
  await sleep(500);
  const h = await p.rect('.hero-view');
  const flingStats = () => p.S(`({ trough: st.stats.flingTrough, dentist: st.stats.flingDentist, jail: st.stats.flingJail, pomfrey: st.stats.flingPomfrey })`);
  for (const [want, dx, dy] of [['jail', 0, 1], ['trough', -1, 0], ['dentist', 1, 0], ['pomfrey', 0, -1], ['jail', 0.35, 1]]) {
    await p.S(`(st.saloon.held = null, st.saloon.next = g.simTime, g.tick(0.05), 0)`);
    const up = await p.until(`!!st.saloon.held && !document.querySelector('.fling').hidden`, 3000, 100);
    if (!up) { check(false, `fling overlay up for ${want}`); continue; }
    await sleep(500);
    const f = await p.eval(`(() => { const f = __iw2ui.debug.spectacle.fling(), g = __iw2ui.debug.geo; return f ? { on: f.x > 0 && f.x < g.viewW && f.y > 0 && f.y < g.heroH, vis: f.targets.filter((t) => t.visible).map((t) => t.id) } : null; })()`);
    soft(!!f && f.on && f.vis.length >= 2, `PT#3 (lane S): the held drunk is in shot with targets ${f ? JSON.stringify(f) : 'none'}`);
    const before = await flingStats();
    await p.swipe(h.x, h.y, h.x + dx * 150, h.y + dy * 150);
    await sleep(300);
    const after = await flingStats();
    const hit = Object.keys(after).find((k) => after[k] > before[k]) || 'none';
    check(hit === want, `swipe ${dx < 0 ? '←' : dx > 0.5 ? '→' : dy > 0 ? '↓' : '↑'}${dx && dy ? ' (diagonal)' : ''} → ${hit} (want ${want})`);
    await sleep(400);
  }
  await p.S(`(st.saloon.held = null, st.saloon.next = g.simTime, g.tick(0.05), 0)`);
  await p.until(`!document.querySelector('.fling').hidden`, 3000, 100);
  const lab = await p.eval(`[...document.querySelectorAll('.fling-t .ft-l')].map((e) => [e.textContent, getComputedStyle(e).display, parseFloat(getComputedStyle(e).fontSize)])`);
  console.log('  labels', JSON.stringify(lab));
  const jb = await p.rect('.fling-t.down');
  if (jb) { const b0 = (await flingStats()).jail; await p.tap(jb.x, jb.y); await sleep(250); check((await flingStats()).jail === b0 + 1, 'tapping the ↓ chip jails him'); }
  check(await p.eval(`document.querySelectorAll('.tab.dot').length <= 1`), `at most one red tab dot (${await p.eval(`[...document.querySelectorAll('.tab.dot')].map((t) => t.dataset.tab).join(',')`)})`);
  check(await p.eval(`(() => { const t = [...document.querySelectorAll('.tab')].filter((b) => !b.hidden).map((b) => b.dataset.tab); const s = t.indexOf('season'); return s < 0 || t.indexOf('goals') < s; })()`), 'Ghosts tab sits after Demands');
  check(p.exceptions.length === 0, 'no exceptions');

  // ---------- PT#8: gen 2 skips the mud opening ----------
  console.log('PT#8 gen 2 (demo → Fake Your Death)');
  await p.tapEl('.tab[data-tab="boothill"]');
  await sleep(800);
  await p.tapEl('.cta.danger'); await sleep(300); await p.tapEl('.cta.danger');
  await sleep(1200);
  const during = await p.eval(`(() => { const vis = (s) => [...document.querySelectorAll(s)].some((e) => !e.closest('[hidden]') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0); return { cap: document.querySelector('.hero').classList.contains('cap-on'), coach: vis('.hero .coach'), ring: vis('.hero-tapzone.coach-pulse'), hat: vis('.mud-hat') }; })()`);
  check(during.cap && !during.coach && !during.ring && !during.hat, `no coach, mud ring or hat over the funeral captions ${JSON.stringify(during)}`);
  for (let i = 0; i < 70 && (await p.eval(`document.querySelector('.hero').classList.contains('cap-on')`)); i++) await sleep(500);
  await sleep(1500);
  const g2 = await p.S(`({ gen: st.gen, coach: ui.coach.current, ring: !!document.querySelector('.hero-tapzone.coach-pulse'), hat: !document.querySelector('.mud-hat').hidden, cash: st.cash })`);
  check(g2.gen >= 2 && !['mud', 'hat'].includes(g2.coach) && !g2.ring && !g2.hat, `gen ${g2.gen}: no "Tap the mud" opening (coach ${g2.coach}, ring ${g2.ring}, hat ${g2.hat})`);
  check(await p.eval(`document.querySelector('.welcome')?.hidden !== false`), 'gen 2 skips the fresh-start poster');
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();
} finally {
  stop(PORT);
}
if (warns.length) console.log(`\n${warns.length} warning(s) owned by other lanes`);
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nALL OK');
process.exit(fails.length ? 1 : 0);
