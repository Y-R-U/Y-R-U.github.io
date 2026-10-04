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

  // ---------- PT2#1 + PT2#5: the opening ring is on screen, "And STAY out!" waits for the first touch ----------
  console.log('PT2#1/#5 opening ring + opening bark (fresh)');
  p = await open('?nosave=1');
  await sleep(2500);
  const ring = await p.eval(`(() => { const z = document.querySelector('.hero-tapzone'), hv = document.querySelector('.hero').getBoundingClientRect(), hud = document.querySelector('.hud').getBoundingClientRect();
    const r = z.getBoundingClientRect(), c = document.querySelector('.hero-tapzone .coach'), cr = c && c.getBoundingClientRect(), a = __iw2ui.debug.spectacle.bubbleAnchor('mud');
    return { pulse: z.classList.contains('coach-pulse'), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, hero: [hv.left, hv.top, hv.right, hv.bottom], hud: hud.bottom,
      anchor: a && a.visible ? [hv.left + a.x, hv.top + a.y] : null, coach: cr ? [cr.left, cr.top, cr.right, cr.bottom, c.textContent] : null,
      before: getComputedStyle(z, '::before').animationName }; })()`);
  check(ring.pulse && ring.before === 'tapring', `mud ring pulses on its ::before (${ring.before})`);
  check(ring.cx > ring.hero[0] + 20 && ring.cx < ring.hero[2] - 20 && ring.cy > ring.hud + 20 && ring.cy < ring.hero[3] - 20, `mud ring centre is inside the hero, below the HUD (${ring.cx | 0}, ${ring.cy | 0})`);
  if (ring.anchor) check(Math.hypot(ring.cx - ring.anchor[0], ring.cy - ring.anchor[1]) < 6, `ring sits on Spectacle's mud anchor (${ring.anchor.map((v) => v | 0)})`);
  check(!!ring.coach && ring.coach[0] >= 0 && ring.coach[2] <= ring.hero[2] && ring.coach[1] >= ring.hud && /mud/i.test(ring.coach[4]), `"Tap the mud" text is on screen ${JSON.stringify(ring.coach)}`);
  const pre = await p.S(`({ bubble: !!ui.barks.showing, pend: ui.barks.debug.pend.map((q) => q.char + '/' + q.trig) })`);
  check(!pre.bubble && pre.pend.some((q) => /\/opening$/.test(q)), `before any touch the opening bark is queued, not dropped (${pre.pend.join(',') || 'none'})`);
  await p.tap(ring.cx, ring.cy);
  check(await p.until('st.stats.bootTaps >= 1', 2000), 'a real tap on the ring pays a mud coin');
  const said = await p.until(`ui.barks.debug.log.some((l) => l.trig === 'opening')`, 6000, 100);
  const op = await p.S(`(() => { const l = ui.barks.debug.log.find((x) => x.trig === 'opening'); return l ? l.char + ': ' + l.id : null; })()`);
  check(said, `the opening bark plays on the first touch (${op})`);
  if (pre.pend.some((q) => q.startsWith('mabel/'))) check(/^mabel/.test(op || ''), 'it is Mabel\'s "And STAY out!" (Spectacle\'s staged opening wins)');
  check(await p.until(`!!ui.barks.showing && document.querySelector('.bubble').hidden === false`, 5000, 100), 'its bubble shows with the voice');
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();

  // ---------- PT2#4: W5 bark budget ----------
  console.log('PT2#4 bark budget (demo, virtual clock)');
  p = await open('?nosave=1&demo=1');
  await p.eval('scrollTo(0, 0)');
  await sleep(1500);
  const hb = await p.rect('.hero-view');
  await p.tap(hb.x - 80, hb.y + 140);
  check(await p.until('ui.barks.ready && ui.audio.running', 6000), 'barks indexed after the first touch');
  await p.until('!ui.barks.showing', 8000);
  const budget = await p.S(`(() => {
    const B = ui.barks, who = ['pickles', 'pomfrey', 'nubbin', 'fingers', 'mabel', 'wendell'];
    B.debug.log.length = 0;
    for (let i = 0; i < 240; i++) {
      B.debug.skew(2500);
      const c = who[i % who.length];
      if (i % 2) B.say(c, 'idle'); else __iw2.bus.emit('bark', { char: c, trig: 'idle', src: 'spectacle' });
      if (i % 5 === 0) B.say(who[(i + 1) % who.length], 'eject');
      B.hide();
    }
    const L = B.debug.log.filter((l) => l.kind === 'ambient');
    let minGap = Infinity, minChar = Infinity, repeat = null;
    for (let i = 1; i < L.length; i++) minGap = Math.min(minGap, L[i].t - L[i - 1].t);
    const by = {};
    for (const l of L) { if (by[l.char] != null) minChar = Math.min(minChar, l.t - by[l.char]); by[l.char] = l.t; }
    const seen = {};
    for (const l of B.debug.log) { if (seen[l.id] != null && l.t - seen[l.id] < 600e3) repeat = l.id; seen[l.id] = l.t; }
    return { n: L.length, span: (240 * 2.5) | 0, minGap: minGap / 1000, minChar: minChar / 1000, repeat };
  })()`);
  check(budget.n >= 8 && budget.n <= 20, `${budget.n} ambient sentences in ${budget.span} s of virtual time (W5: one per 30–45 s)`);
  check(budget.minGap >= 30, `ambient sentences ≥ 30 s apart (min ${budget.minGap.toFixed(1)} s)`);
  check(budget.minChar >= 90, `one character ≤ 1 ambient sentence per 90 s (min ${budget.minChar.toFixed(1)} s)`);
  check(!budget.repeat, `no line repeats inside 10 min (${budget.repeat || 'none'})`);
  const charSpots = await p.eval(`(() => { const hv = document.querySelector('.hero-view').getBoundingClientRect(); const out = []; for (let y = hv.top + 60; y < hv.bottom - 40; y += 14) for (let x = hv.left + 20; x < hv.right - 20; x += 14) { const h = __iw2ui.debug.spectacle.pickHero(x, y); if (h.kind === 'char' && h.char && h.char !== 'stranger') { out.push([x, y, h.char]); if (out.length > 2) return out; } } return out; })()`);
  if (charSpots.length) {
    const [cx, cy, ch] = charSpots[0];
    await p.S('(ui.barks.debug.skew(60e3), ui.barks.hide(), ui.barks.debug.log.length = 0, 0)');
    await p.tap(cx, cy);
    await sleep(300);
    const n1 = await p.S('ui.barks.debug.log.length');
    await p.S('(ui.barks.hide(), 0)');
    await p.tap(cx, cy);
    await sleep(300);
    const n2 = await p.S('ui.barks.debug.log.length');
    check(n1 <= 1 && n2 === n1, `tapping ${ch} twice: one sentence at most, the second tap inside the 20 s cooldown is wordless (${n1} → ${n2})`);
  } else console.log('  (skip char tap: no character under the hero right now)');
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();

  // ---------- PT2#2: ⤒ Watch closes a sheet / Town and the special begins ----------
  console.log('PT2#2 Watch from a sheet and from Town (demo)');
  p = await open('?nosave=1&demo=1');
  await p.eval('scrollTo(0, 0)');
  await sleep(2500);
  const FORCE = (kind) => `(() => { for (let i = 0; i < 60; i++) { const cur = g.special(); if (cur && cur.kind === '${kind}') return cur.id; if (cur) g.act('claimEvent', { eventId: cur.id }); st.events.nextSpecial = g.simTime; g.tick(0.05); } return null; })()`;
  for (const [tab, open1, closed] of [['goals', `document.querySelector('.sheet.open')`, `!document.querySelector('.sheet.open')`], ['town', `__iw2ui.debug.town.active`, `!__iw2ui.debug.town.active`]]) {
    await p.until('!ui.specials.active && !ui.captions.active', 15000);
    await p.tapEl(`.tab[data-tab="${tab}"]`);
    await sleep(700);
    check(await p.eval(`!!(${open1})`), `${tab} open`);
    const id = await p.S(FORCE('duel'));
    await sleep(400);
    const chip = await p.rect('.sp-chip:not(.fade)');
    check(!!id && !!chip && await p.eval(`/Watch/.test(document.querySelector('.sp-chip').textContent)`), `duel wind-up shows "⤒ Watch" over ${tab} (${id} ${JSON.stringify(chip)} ${await p.eval(`document.querySelector('.sp-chip').className + ' ' + document.querySelector('.sp-chip').textContent`)})`);
    if (chip) await p.tap(chip.x, chip.y);
    const begun = await p.until(`!!ui.specials.active`, 8000, 150);
    check(begun && await p.eval(`!!(${closed}) && __iw2ui.heroVisible()`), `tap Watch: ${tab} closes, hero visible, the duel begins (${await p.S('ui.specials.active')})`);
    await p.S(`(ui.specials.debug.finish(0), 0)`);
    await p.until('!ui.specials.active', 15000);
    await p.S(`(() => { const cur = g.special(); if (cur) g.act('claimEvent', { eventId: cur.id }); return 0; })()`);
    await p.until('!g.special() && !ui.specials.active', 15000);
    await sleep(800);
  }
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();

  // ---------- PT2#3: the Saloon Row Deed is signposted ----------
  console.log('PT2#3 Deed signpost (fresh → 3 Lower Street businesses)');
  p = await open('?nosave=1&debug=1');
  await sleep(1500);
  const hv3 = await p.rect('.hero-view');
  await p.tap(hv3.x, hv3.y + 120);
  await p.S(`(() => { g.act('cheat', { cash: 1e5 }); g.act('hat'); for (const id of ['shine', 'tubs', 'livery']) { g.act('buy', { lineId: id }); for (let i = 0; i < 80 && st.build[id]; i++) g.tick(0.5); } return 0; })()`);
  const cost = await p.S(`g.nextGoal().cost`);
  await p.S(`(st.cash = ${cost} * 0.9, 0)`);
  await p.eval('scrollTo(0, 0)');
  await p.until('!ui.captions.active && __iw2ui.heroVisible()', 15000);
  const blocked = await p.until(`g.nextGoal().hint === 'blocked' && !document.querySelector('.deed-chip').hidden`, 5000);
  const bt = await p.eval(`document.querySelector('.deed-chip').textContent`);
  check(blocked && /Demands \d\/3/.test(bt), `Deed blocked: hero chip names the Demands owed (${bt})`);
  await p.until(`!document.querySelector('.hat-promo')`, 6000);
  await sleep(600);
  const dc = await p.eval(`(() => { const r = document.querySelector('.deed-chip').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y); return { x, y, hit: e && e.className }; })()`);
  await p.tap(dc.x, dc.y);
  check(await p.until(`ui.sheets.top === 'goals'`, 2000), `tapping it opens Demands (${dc.hit})`);
  await sleep(600);
  await p.tapEl('.sheet-close');
  await sleep(500);
  check(await p.S('!ui.sheets.isOpen'), `✕ closes Demands (${await p.S('ui.sheets.top')})`);
  await p.S(`(st.lines.shine.lv = Math.max(st.lines.shine.lv, 30), st.stats.pileTaps = Math.max(st.stats.pileTaps, 12), st.cash = ${cost} * 1.05, 0)`);
  const ready = await p.until(`g.nextGoal().hint === 'buy' && /Open/.test(document.querySelector('.deed-chip').textContent) && !document.querySelector('.deed-chip').hidden`, 6000);
  check(ready, `Deed affordable: "${await p.eval(`document.querySelector('.deed-chip').textContent`)}" on the hero`);
  await p.until(`!document.querySelector('.hat-promo')`, 6000);
  await sleep(400);
  const dc2 = await p.eval(`(() => { const r = document.querySelector('.deed-chip').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y); return { x, y, hit: e && e.className }; })()`);
  await p.tap(dc2.x, dc2.y);
  await sleep(1200);
  if (dc2.hit !== 'hero-chip deed-chip ready') console.log('  (chip tap hit ' + dc2.hit + ')');
  const gv = await p.eval(`(() => { const r = document.querySelector('.gate-main').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()`);
  check(gv, 'tapping it brings the gate on screen');
  check(await p.until(`(ui.coach.current || '').startsWith('deed:')`, 4000), `coach sits on the gate (${await p.S('ui.coach.current')})`);
  await p.tapEl('.gate-main');
  check(await p.until(`st.districts.includes('saloonrow')`, 3000), 'tapping the gate opens Saloon Row');
  check(await p.until(`document.querySelector('.deed-chip').hidden || !/Saloon Row/.test(document.querySelector('.deed-chip').textContent)`, 3000), 'the Saloon Row chip goes once it is yours');
  check(p.exceptions.length === 0, 'no exceptions');
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

  // ---------- R4: toasts keep off the hero's central 50% ----------
  console.log('R4 toasts (demo, hero centre stays clear)');
  p = await open('?nosave=1&demo=1');
  await p.eval('scrollTo(0, 0)');
  await p.until('__iw2ui.heroVisible() && !ui.specials.active && !ui.captions.active', 15000);
  await p.until(`ui.quietQ.length === 0 && !document.querySelector('.toast:not(.out)')`, 20000);
  await sleep(600);
  const sample = () => p.eval(`(() => { const h = document.querySelector('.hero').getBoundingClientRect(); const c = { l: h.left + h.width * .25, r: h.left + h.width * .75, t: h.top + h.height * .25, b: h.top + h.height * .75 };
    const ts = [...document.querySelectorAll('.toast, .hero > .stamp')].filter((t) => !t.classList.contains('out')).map((t) => { const r = t.getBoundingClientRect(); return { text: t.textContent, inHero: !!t.closest('.hero'), hit: r.width > 0 && r.right > c.l && r.left < c.r && r.bottom > c.t && r.top < c.b }; });
    return { n: document.querySelectorAll('.toast:not(.out)').length, hits: ts.filter((t) => t.hit).map((t) => t.text), texts: ts.map((t) => t.text), inHero: ts.every((t) => t.inHero) }; })()`);
  await sleep(2500);
  await p.until(`ui.quietQ.length === 0 && !document.querySelector('.toast:not(.out)')`, 20000);
  const got = await p.S(`(() => { const ids = Object.keys(st.achievements).filter((k) => st.achievements[k]).slice(0, 3); ids.forEach((k) => delete st.achievements[k]); const ls = Object.keys(st.links || {}).filter((k) => st.links[k]).slice(0, 2); ls.forEach((k) => delete st.links[k]); return { a: ids.length, l: ls.length }; })()`);
  for (let i = 0; i < 6; i++) await p.S(`(__iw2ui.toast('🧪 Toast ${i}'), 0)`);
  let maxN = 0, hits = [], seen = new Set(), allIn = true;
  for (let i = 0; i < 30; i++) {
    const s = await sample();
    maxN = Math.max(maxN, s.n); hits.push(...s.hits); s.texts.forEach((t) => seen.add(t)); allIn &&= s.inHero;
    await sleep(150);
  }
  check(hits.length === 0, `no toast/stamp rect overlaps the hero's central 50% box (${[...new Set(hits)].join(' | ') || 'none'})`);
  check(maxN <= 2, `toasts stack at most 2 (max ${maxN})`);
  check(allIn, 'with the hero up, toasts sit inside the hero');
  const achT = [...seen].filter((t) => /achievement|\+1%/.test(t));
  if (got.a > 1) check(achT.filter((t) => /\d+ achievements/.test(t)).length === 1 && achT.some((t) => t.includes(`${got.a} achievements`)), `${got.a} achievements at once → one toast (${achT.join(' | ') || 'none'})`);
  if (got.l > 1) check([...seen].filter((t) => /gag link/.test(t)).length === 1, `${got.l} gag links at once → one toast`);
  const long = [...seen].filter((t) => !/🧪/.test(t) && t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length > 4);
  check(!long.length, `achievement / link toasts ≤ 4 words (${long.join(' | ') || 'ok'})`);
  await p.eval(`document.querySelector('.line-card:nth-of-type(3)').scrollIntoView({ block: 'center' })`);
  await p.until('!__iw2ui.heroVisible()', 3000);
  await sleep(700);
  await p.S(`(__iw2ui.toast('🧪 Away'), 0)`);
  await sleep(200);
  const away = await p.eval(`(() => { const t = [...document.querySelectorAll('.toast')].find((e) => e.textContent === '🧪 Away'); if (!t) return null; const r = t.parentNode.getBoundingClientRect(), hud = document.querySelector('.hud').getBoundingClientRect(); return { inHero: !!t.closest('.hero'), top: r.top, hud: hud.bottom }; })()`);
  check(away && !away.inHero && away.top >= away.hud && away.top < away.hud + 40, `hero away: toast drops to just under the HUD ${JSON.stringify(away)}`);
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();
  // ---------- Aaron: card badge mirrors bottom-left when the top is scrolled off ----------
  console.log('Badge mirror (demo, real touch scrolling)');
  p = await open('?nosave=1&demo=1');
  await sleep(1500);
  const BCARD = `[...document.querySelectorAll('.line-card')].filter((c) => !c.hidden && !c.classList.contains('ghost') && !c.classList.contains('compact'))[2]`;
  const bgeo = () => p.eval(`(() => { const c = ${BCARD}; const R = (e) => { if (!e || getComputedStyle(e).display === 'none' || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, r: r.right, t: r.top, b: r.bottom } : null; };
    return { id: c.dataset.line, low: c.classList.contains('low'), card: R(c), top: R(c.querySelector(':scope > .badge')), mir: R(c.querySelector('.badge-low')), glyphs: [...c.querySelectorAll('.glyph')].map(R).filter(Boolean), prog: R(c.querySelector('.prog')),
      hud: document.querySelector('.hud').getBoundingClientRect().bottom, bar: document.querySelector('.tabbar').getBoundingClientRect().top, vh: innerHeight,
      t1: c.querySelector(':scope > .badge .b-text').textContent, t2: c.querySelector('.badge-low .b-text').textContent }; })()`);
  // Drag the list with a real finger until the card's top sits `want` px from the HUD's bottom edge.
  const bdragTo = async (want) => {
    for (let i = 0; i < 12; i++) {
      const g = await bgeo();
      const d = g.card.t - g.hud - want;
      if (Math.abs(d) < 14) return g;
      const step = Math.max(-380, Math.min(380, d));
      const x = 30, y0 = step > 0 ? g.vh * 0.75 : g.vh * 0.3;
      await p.touch('touchStart', [[x, y0]]);
      for (let k = 1; k <= 10; k++) { await sleep(25); await p.touch('touchMove', [[x, y0 - step * k / 10]]); }
      await sleep(250);
      await p.touch('touchEnd', []);
      await sleep(450);
    }
    return bgeo();
  };
  const bhit = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  let bm0 = await bdragTo(-90);
  await sleep(300);
  bm0 = await bgeo();
  const glyphsOn = bm0.glyphs.length && bm0.glyphs.every((r) => r.b <= bm0.bar && r.t >= bm0.hud);
  check(bm0.top && bm0.top.b <= bm0.hud + 4 && glyphsOn, `setup: ${bm0.id} top badge under the HUD, buttons on screen (card ${bm0.card.t | 0}, hud ${bm0.hud | 0})`);
  check(bm0.low && !!bm0.mir, `badge mirror shows bottom-left beside the buttons (${bm0.t2 || 'none'})`);
  if (bm0.mir) {
    check(bm0.mir.l < bm0.card.l + 20 && bm0.mir.b > bm0.card.b - 70, 'mirror sits in the card\'s bottom-left corner');
    check(!bm0.glyphs.some((r) => bhit(r, bm0.mir)), 'mirror never overlaps a glyph button');
    check(!bhit(bm0.prog, bm0.mir) && bm0.mir.b <= bm0.card.b - 7, 'mirror clear of the progress border');
    check(bm0.mir.b <= bm0.bar, 'mirror clear of the tab bar / jump dock');
    check(bm0.t1 === bm0.t2 && /Lv \d+/.test(bm0.t2), `mirror text matches the top badge (${bm0.t2})`);
    const blv0 = await p.S(`st.lines['${bm0.id}'].lv`);
    const blg = await p.eval(`(() => { const r = ${BCARD}.querySelector('.glyph[data-act="level"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await p.tap(blg.x, blg.y);
    await sleep(400);
    const bm1 = await bgeo();
    check((await p.S(`st.lines['${bm0.id}'].lv`)) > blv0 && /Lv \d+/.test(bm1.t2) && bm1.t2 === bm1.t1, `level-up tap works with the mirror up and it updates live (${bm0.t2} → ${bm1.t2})`);
  }
  let bm2 = await bdragTo(40);
  check(!bm2.low && !bm2.mir, `top badge visible → mirror hidden (card ${bm2.card.t | 0})`);
  bm2 = await bdragTo(-bm2.card.b + bm2.card.t - 200);
  check(!bm2.low && !bm2.mir, 'card scrolled past → mirror hidden');
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();

  // ---------- Aaron: a double tap on Open never closes the strongbox before the loot shows ----------
  console.log('Strongbox double tap');
  p = await open('?nosave=1&demo=1');
  await p.S(`(st.boxes.silver = 2, __iw2.ui.openTab('crew'), 0)`);
  await sleep(600);
  const obx = await p.rect('.box-btn.silver');
  await p.tap(obx.x, obx.y, 30);
  await p.tap(obx.x, obx.y, 30);
  const bpill = await p.rect('.box-open .pill');
  if (bpill) await p.tap(bpill.x, bpill.y, 30);
  await sleep(300);
  let bxs = await p.eval(`({ open: !!document.querySelector('.box-open:not(.out)'), loot: document.querySelectorAll('.box-open .box-loot .item').length, left: __iw2.game.state.boxes.silver })`);
  check(bxs.open && bxs.loot >= 1 && bxs.left === 1, `double tap on Open + a tap on Yee-haw! fast-forward to the reveal, popup stays, one box used (${JSON.stringify(bxs)})`);
  check(await p.until('ui.boxes.ready', 3000), 'popup becomes closable once the reveal settles');
  await p.tap(bpill.x, bpill.y);
  await sleep(350);
  check(await p.eval(`!document.querySelector('.box-open:not(.out)')`), 'then Yee-haw! closes it');
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();

  // ---------- Aaron: Graphics Auto/High/Medium/Low persists ----------
  console.log('Graphics setting');
  p = await open('?nosave=1&demo=1');
  await p.eval(`(localStorage.removeItem('iw2.gfx'), 0)`);
  const gOpenSettings = async () => { await p.tapEl('.hud-btn.gear'); await sleep(500); };
  await gOpenSettings();
  const ghint0 = await p.eval(`document.querySelector('.seg-row.gfx .seg-hint')?.textContent || ''`);
  check(/^Auto · (High|Medium|Low)$/.test(ghint0), `Auto shows the chosen tier (${ghint0})`);
  await p.tapEl('.seg-row.gfx .seg-b[data-v="medium"]');
  await sleep(400);
  check(await p.eval(`__iw2.host.quality.current().label === 'medium' && __iw2.host.quality.current().mode === 'medium' && localStorage.getItem('iw2.gfx') === 'medium'`), `Medium applies (${await p.eval('JSON.stringify([__iw2.host.quality.current().mode, __iw2.host.quality.current().label])')})`);
  await p.close();
  p = await open('?nosave=1&demo=1');
  await sleep(500);
  check(await p.eval(`__iw2.host.quality.current().mode === 'medium'`), `Medium survives a reload (${await p.eval('JSON.stringify([__iw2.host.quality.current().mode, __iw2.host.quality.current().label])')})`);
  await gOpenSettings();
  check(await p.eval(`document.querySelector('.seg-row.gfx .seg-b.on')?.dataset.v === 'medium'`), 'settings shows Medium selected after reload');
  await p.tapEl('.seg-row.gfx .seg-b[data-v="auto"]');
  await sleep(400);
  check(await p.eval(`localStorage.getItem('iw2.gfx') === 'auto'`), 'back to Auto');
  await p.eval(`(localStorage.removeItem('iw2.gfx'), 0)`);
  check(p.exceptions.length === 0, 'no exceptions');
  await p.close();
} finally {
  stop(PORT);
}
if (warns.length) console.log(`\n${warns.length} warning(s) owned by other lanes`);
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nALL OK');
process.exit(fails.length ? 1 : 0);
