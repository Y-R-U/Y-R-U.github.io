// UI lane flows with real touch input at S22: opening (mud → hat → buy → hurry → OPEN), W7 taps, fling swipe,
// duel (DRAW timing + boot shot), brawl taps, bark bubble + Sunday School, strongbox, jump dock vs badges.
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';

const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };

const touch = (page, type, pts) => page.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
async function tapAt(page, x, y) { await touch(page, 'touchStart', [[x, y]]); await sleep(30); await touch(page, 'touchEnd', []); await sleep(40); }
async function rectOf(page, sel) {
  return page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`);
}
async function tapEl(page, sel) { const r = await rectOf(page, sel); if (!r) return false; await tapAt(page, r.x, r.y); return true; }
async function swipe(page, x0, y0, x1, y1, ms = 140) {
  await touch(page, 'touchStart', [[x0, y0]]);
  const n = 3;
  for (let i = 1; i <= n; i++) { await sleep(ms / n); await touch(page, 'touchMove', [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]]); }
  await touch(page, 'touchEnd', []);
  await sleep(60);
}
const S = (expr) => `(() => { const g = __iw2.game, st = g.state, ui = __iw2ui.debug; return ${expr}; })()`;

// Spawn a special of `kind` by rolling the state's own scheduler (settling the wrong kinds at Basic).
const IDLE = S(`!ui.specials.active`);
const FORCE = (kind) => S(`(() => {
  for (let i = 0; i < 60; i++) {
    const cur = g.special();
    if (cur && cur.kind === '${kind}') return cur.id;
    if (cur) g.act('claimEvent', { eventId: cur.id });
    st.events.nextSpecial = g.simTime; g.tick(0.05);
  }
  return null;
})()`);

const port = launch({ port: +(process.env.CDP_PORT || 9361) });
try {
  // ---------- A: the first five minutes (W15) ----------
  console.log('opening (fresh, S22)');
  let page = await openPage(port);
  await page.goto(GAME + '?nosave=1&debug=1', VIEWPORTS.s22);
  await page.wait('window.__iw2 && window.__iw2.ready', 15000);
  await sleep(1200);
  check(await page.eval(`!!document.querySelector('.hero-tapzone.coach-pulse') && /mud/i.test(document.querySelector('.coach')?.textContent || '')`), 'coach says "Tap the mud" on a fresh start');
  check(await page.eval(`!document.querySelector('.mud-hat').hidden`), 'the upturned hat sits in the mud');
  const hero = await rectOf(page, '.hero-view');
  // Mud spots: points the W7 resolver calls plain street, away from the hat.
  const spots = await page.eval(`(() => { const hv = document.querySelector('.hero-view').getBoundingClientRect(), hat = document.querySelector('.mud-hat').getBoundingClientRect(); const out = []; for (let y = hv.top + 60; y < hv.bottom - 40 && out.length < 8; y += 37) for (let x = hv.left + 40; x < hv.right - 40 && out.length < 8; x += 53) { if (x > hat.left - 20 && x < hat.right + 20 && y > hat.top - 20 && y < hat.bottom + 20) continue; const h = __iw2ui.debug.spectacle.pickHero(x, y); if (h.kind === 'street') out.push([x, y]); } return out; })()`);
  check(spots.length >= 4, `found ${spots.length} plain-mud tap spots`);
  const mud = (i) => spots[i % spots.length];
  for (let i = 0; i < 6; i++) await tapAt(page, ...mud(i));
  await sleep(300);
  let r = await page.eval(S(`({ hat: st.bootstrap.hat, cash: st.cash, badge: document.querySelector('.mud-n').textContent, coach: document.querySelector('.coach')?.textContent || '' })`));
  check(r.hat >= 10 && r.cash === 0, `mud taps drop coins into the hat (hat $${r.hat}, cash $${r.cash})`);
  check(/×\d/.test(r.badge), `hat shows its coin count (${r.badge})`);
  await sleep(500);
  check(await page.eval(`!!document.querySelector('.mud-hat.coach-pulse')`), 'coach points at the hat once it has coins');
  await tapEl(page, '.mud-hat');
  await sleep(200);
  r = await page.eval(S(`({ hat: st.bootstrap.hat, cash: st.cash })`));
  check(r.hat === 0 && r.cash >= 10, `tapping the hat banks it (cash $${r.cash})`);
  for (let i = 0; i < 22; i++) await tapAt(page, ...mud(i));
  await sleep(600);
  check(await page.eval(`document.querySelector('.line-card[data-line="shine"]').classList.contains('can')`), 'the Spit & Shine ghost card lights up at $50');
  await page.eval(`document.querySelector('.line-card[data-line="shine"]').scrollIntoView({ block: 'center' })`);
  await sleep(400);
  await tapEl(page, '.line-card[data-line="shine"]');
  await sleep(500);
  r = await page.eval(S(`({ b: !!st.build.shine, cls: document.querySelector('.line-card[data-line="shine"]').className, badge: document.querySelector('.line-card[data-line="shine"] .b-text').textContent, hurry: !document.querySelector('.line-card[data-line="shine"] .glyph[data-act="hurry"]').hidden, coach: document.querySelector('.coach')?.textContent || '' })`));
  check(r.b && /building/.test(r.cls), 'buying starts construction and the card shows the site');
  check(/\d+s/.test(r.badge), `stage badge with countdown (${r.badge})`);
  check(r.hurry, 'single hurry glyph shown');
  check(!/hurry/i.test(r.coach), `no hurry coach for a 6 s build (${r.coach || 'none'})`);
  await page.eval(`document.querySelector('.line-card[data-line="shine"]').scrollIntoView({ block: 'end' })`);
  await sleep(400);
  const h0 = await page.eval(S(`st.stats.hurries`));
  for (let i = 0; i < 4; i++) await tapEl(page, '.line-card[data-line="shine"] .glyph[data-act="hurry"]');
  const h1 = await page.eval(S(`st.stats.hurries`));
  check(h1 - h0 === 4, `each hurry tap takes 0.5 s off the build (${h1 - h0} hurries)`);
  let opened = false;
  for (let i = 0; i < 40 && !opened; i++) { await sleep(250); opened = await page.eval(S(`st.lines.shine.lv > 0`)); }
  await sleep(150);
  r = await page.eval(`({ stamp: [...document.querySelectorAll('.stamp')].map(s => s.textContent), cls: document.querySelector('.line-card[data-line="shine"]').className })`);
  check(opened && r.stamp.some((t) => /OPEN FOR BUSINESS/.test(t)), 'sign up → OPEN FOR BUSINESS stamp');
  check(!/building/.test(r.cls), 'card leaves construction mode');
  await sleep(600);
  check(await page.eval(`!document.querySelector('.ribbon').hidden && /You/.test(document.querySelector('.ribbon').textContent)`), 'hat ribbon appears after the first business');
  check(!page.exceptions.length, 'no exceptions' + (page.exceptions[0] ? ': ' + page.exceptions[0] : ''));
  await page.close();

  // ---------- B: the street (demo) ----------
  console.log('street (demo, S22)');
  page = await openPage(port);
  await page.goto(GAME + '?nosave=1&demo=1', VIEWPORTS.s22);
  await page.wait('window.__iw2 && window.__iw2.ready', 15000);
  await sleep(1500);
  await page.eval(`(() => { const g = __iw2.game; const a = g.act.bind(g); window.__acts = []; g.act = (t, p) => { const r = a(t, p); if (t === 'fling') __acts.push(t + ' ' + JSON.stringify(p) + ' ' + r.ok + ' ' + new Error().stack.split('\\n').slice(2,4).map(s=>s.trim().slice(0,70)).join(' | ')); return r; }; })()`);
  const h = await rectOf(page, '.hero-view');
  await tapAt(page, h.x, h.y - 60);
  await sleep(400);

  // piano (W11); a held drunk (fling-on) hides the 🎹, so wait for Mabel to let go first
  for (let i = 0; i < 40 && await page.eval(`document.querySelector('.hero').classList.contains('fling-on')`); i++) await sleep(150);
  const p0 = await page.eval(S('st.stats.pianoTaps'));
  if (await rectOf(page, '.hero-btn.piano')) await tapEl(page, '.hero-btn.piano'); else await page.eval(S('ui.playPiano()'));
  await sleep(200);
  check(await page.eval(S('st.stats.pianoTaps')) === p0 + 1, 'piano tap plays (pianoTaps +1)');

  // fling (W6)
  await page.eval(S(`(st.saloon.held = null, st.saloon.next = g.simTime, g.tick(0.05), 0)`));
  await sleep(250);
  r = await page.eval(`({ on: !document.querySelector('.fling').hidden, held: !!__iw2.game.state.saloon.held })`);
  check(r.on && r.held, 'Mabel holds a drunk: fling overlay up');
  // Swipes are cardinal (←trough →dentist ↓jail ↑Pomfrey) whatever the camera shows.
  const swipeTo = async (target, [dx, dy]) => {
    await swipe(page, h.x, h.y, h.x + dx * 140, h.y + dy * 140);
  };
  const fl0 = await page.eval(S('st.stats.flings'));
  await swipeTo('trough', [-1, 0]);
  await sleep(250);
  r = await page.eval(S(`({ flings: st.stats.flings, on: !document.querySelector('.fling').hidden, s: [st.stats.flingTrough, st.stats.flingDentist, st.stats.flingJail, st.stats.flingPomfrey].join(',') })`));
  check(r.flings === fl0 + 1 && !r.on, `a swipe flings him exactly once (trough,dentist,jail,pomfrey = ${r.s})`);
  await page.eval(S(`(st.saloon.held = null, st.saloon.next = g.simTime, g.tick(0.05), 0)`));
  await sleep(250);
  const pf0 = await page.eval(S('st.stats.flingPomfrey'));
  for (let i = 0; i < 20 && !(await rectOf(page, '.fling-t.up')); i++) await sleep(100);
  await tapEl(page, '.fling-t.up');
  await sleep(200);
  check(await page.eval(S('st.stats.flingPomfrey')) === pf0 + 1, 'tapping the 🪟 chip throws him through Pomfrey’s window');

  // duel (W8)
  await page.eval('scrollTo(0, 0)');
  await sleep(400);
  const id = await page.eval(FORCE('duel'));
  check(!!id, 'duel special spawned in wind-up');
  await sleep(150);
  check(await page.eval(`!document.querySelector('.sp-chip').hidden && /Duel/.test(document.querySelector('.sp-chip').textContent)`), 'wind-up chip + bell shown');
  let live = false;
  for (let i = 0; i < 30 && !live; i++) { await sleep(150); live = await page.eval(`!!document.querySelector('.mini-layer.duel:not([hidden])')`); }
  check(live, 'duel begins once the hero is visible');
  let drawn = false;
  for (let i = 0; i < 300 && !drawn; i++) { await sleep(50); drawn = await page.eval(`!!document.querySelector('.duel-draw.on')`); }
  check(drawn, 'DRAW! appears');
  await tapAt(page, h.x, h.y);
  await sleep(300);
  r = await page.eval(S(`({ duels: st.stats.duels, boot: st.stats.duelBoot, res: document.querySelector('.mini-result')?.textContent || '' })`));
  check(r.duels === 1 && r.boot === 0, `shot after DRAW counts (duels ${r.duels})`);
  check(/\d+ ms/.test(r.res), `reaction time shown (${r.res})`);
  await page.wait(IDLE, 8000).catch(() => {});
  await sleep(800);
  await page.eval('scrollTo(0, 0)');
  await page.eval(FORCE('duel'));
  live = false;
  for (let i = 0; i < 30 && !live; i++) { await sleep(150); live = await page.eval(`!!document.querySelector('.mini-layer.duel:not([hidden])')`); }
  await sleep(1300);
  await tapAt(page, h.x, h.y);
  await sleep(300);
  r = await page.eval(S(`({ boot: st.stats.duelBoot, res: document.querySelector('.mini-result')?.textContent || '' })`));
  check(r.boot === 1 && /boot/i.test(r.res), `tapping early shoots your own boot (${r.res})`);
  await page.wait(IDLE, 8000).catch(() => {});
  await sleep(800);
  await page.eval('scrollTo(0, 0)');

  // brawl (DOM stand-ins unless Spectacle declares caps.brawl)
  await page.eval(FORCE('brawl'));
  live = false;
  for (let i = 0; i < 30 && !live; i++) { await sleep(150); live = await page.eval(`!!document.querySelector('.mini-layer.brawl:not([hidden])')`); }
  check(live, 'brawl begins');
  const sLive = await page.eval(`!!__iw2.world.spectacle`);
  if (!sLive) {
    let hit = 0;
    for (let i = 0; i < 40 && hit < 2; i++) {
      await sleep(120);
      const t = await rectOf(page, '.mini-target.brawl:not(.hit)');
      if (t) { await tapAt(page, t.x, t.y); hit = await page.eval(S('st.stats.brawlHits')); }
    }
    check(hit >= 1, `tapping flying brawlers lands hits (${hit})`);
  }
  await page.eval(S(`ui.specials.debug.finish(ui.specials.debug.cur ? ui.specials.debug.cur.hits : 0)`));
  await sleep(2200);

  // barks (W5)
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) { await sleep(150); ready = await page.eval(S('ui.barks.ready')); }
  check(ready, 'bark lines loaded (manifest or script fallback)');
  await page.eval(S(`(ui.barks.hide(), ui.barks.say('mabel', 'tap', true), 0)`));
  await sleep(300);
  r = await page.eval(`({ on: !document.querySelector('.bubble').hidden, t: document.querySelector('.bubble-t')?.textContent, tf: getComputedStyle(document.querySelector('.bubble')).transform })`);
  check(r.on && r.t && r.tf !== 'none', `one bubble, placed by transform (${r.t})`);
  await page.eval(S(`(ui.barks.say('pickles', 'tap', false), 0)`));
  check(await page.eval(`document.querySelectorAll('.bubble:not([hidden])').length`) === 1, 'never two bubbles');
  await page.eval(S(`(g.act('sunday', { on: true }), 0)`));
  const rude = await page.eval(S(`(() => { const out = []; for (let i = 0; i < 40; i++) { ui.barks.hide(); ui.barks.debug.said.clear(); ui.barks.say('pickles', 'tap', true); out.push(document.querySelector('.bubble-t').textContent); } ui.barks.hide(); const rude = Object.values(ui.barks.debug.chars).flatMap(c => c.lines).filter(l => l.rude).map(l => l.text); return out.filter(t => rude.includes(t)); })()`));
  check(!rude.length, 'Sunday School never shows a rude line' + (rude.length ? ': ' + rude[0] : ''));
  check(await page.eval(`[...document.querySelectorAll('.line-card[data-line="garter"] .strip-name')].some(e => /Dance Hall/.test(e.textContent))`), 'Sunday School renames the Garter');
  await page.eval(S(`(g.act('sunday', { on: false }), 0)`));

  // strongbox
  await page.eval(S(`(st.boxes.silver = 1, __iw2.ui.openTab('crew'), 0)`));
  await sleep(500);
  await tapEl(page, '.box-btn.silver');
  await sleep(1200);
  r = await page.eval(`({ open: !!document.querySelector('.box-open'), loot: document.querySelectorAll('.box-loot .item').length })`);
  check(r.open && r.loot >= 1, `strongbox opens with loot (${r.loot})`);
  for (let i = 0; i < 30 && !(await page.eval(S('ui.boxes.ready'))); i++) await sleep(100);
  await tapEl(page, '.box-open .pill');
  await sleep(350);
  check(!(await page.eval(`!!document.querySelector('.box-open:not(.out)')`)), 'Yee-haw! closes the strongbox once the loot is shown');
  await page.eval(S('ui.sheets.close()'));
  await sleep(300);

  // jump dock never overlaps a card badge (IL2 backlog #1)
  let overlaps = 0, docked = 0, overlapWhy = '';
  for (const y of [500, 800, 1100, 1400, 1700, 2000, 2400, 2900]) {
    await page.eval(`scrollTo(0, ${y})`);
    for (let k = 0; k < 4; k++) {
      await sleep(70);
      // A control under the opaque tab bar is hidden by the bar itself; what must never happen is a jump button
      // floating over a control that is still on show (IL2's dock did exactly that).
      const o = await page.eval(`(() => { const bar = document.querySelector('.tabbar').getBoundingClientRect(); const btns = [...document.querySelectorAll('.jump-btn')].filter(b => !b.hidden && !b.closest('[hidden]')).map(b => b.getBoundingClientRect()); const inBar = btns.every(r => r.top >= bar.top - 0.5 && r.bottom <= bar.bottom + 0.5); const bad = [...document.querySelectorAll('.line-card:not([hidden]) .badge, .line-card:not([hidden]) .glyph:not([hidden]), .line-card:not([hidden]) .corner:not([hidden])')].map(b => b.getBoundingClientRect()).filter(r => r.width && r.bottom <= bar.top + 0.5); let n = inBar ? 0 : 100; for (const a of btns) for (const b of bad) if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) n++; return { n, d: btns.length, why: n ? JSON.stringify({ bar: [bar.top|0, bar.bottom|0], btns: btns.map(r => [r.left|0, r.top|0, r.bottom|0]), inBar }) : '' }; })()`);
      if (o.n && !overlapWhy) overlapWhy = o.why;
      overlaps += o.n; docked = Math.max(docked, o.d);
    }
  }
  check(docked >= 1, `jump dock shown while scrolled (${docked} buttons)`);
  check(overlaps === 0, `jump dock never covers a badge/glyph/corner (${overlaps} overlaps) ${overlapWhy}`);
  await page.eval('scrollTo(0, 0)');
  check(!page.exceptions.length, 'no exceptions' + (page.exceptions[0] ? ': ' + page.exceptions[0] : ''));
  await page.close();
} finally {
  stop(port);
}
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
