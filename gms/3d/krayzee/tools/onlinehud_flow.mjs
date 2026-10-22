// UI round 4: in-flight online HUD (Court ladder + connection pill), locked aircraft chips, podium.
//   node tools/onlinehud_flow.mjs [--port=9441] [--only=bench|game] [--keep]
// bench: tools/onlinehud.html with a real js/game/court.js fed by fake session events.
// game:  the real game in Free Flight with ghud.online fed a fake session, overlap-checked against the real HUD + controls.
// Real taps (CDP touch at 390×844 / 844×390, mouse at 1280×800). Screenshots: docs/shots/ui4/.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const PORT = +arg('port', 9441), ONLY = arg('only', '');
const ROOT = 'http://localhost:8888/gms/3d/krayzee/';
const CDP = `${process.env.HOME}/.claude/bin/cdp`;
const SHOTS = fileURLToPath(new URL('../docs/shots/ui4/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWS = [
  { name: '390x844', w: 390, h: 844, touch: true },
  { name: '844x390', w: 844, h: 390, touch: true },
  { name: '1280x800', w: 1280, h: 800, touch: false },
];
const PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#b3122e', secondary: '#f4efe6', accent: '#d4a017', voice: 'toff', registration: 'K-DIRK' };

async function connect() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(); const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const { res, rej } = wait.get(d.id); wait.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, errors, close: () => { ws.close(); return fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {}); } };
}

const hit = (a, b) => a && b && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

async function run(view) {
  const c = await connect();
  const { send } = c;
  const fails = [], passes = [];
  const ok = (cond, label, extra = '') => { (cond ? passes : fails).push(label + (cond || !extra ? '' : ` — ${extra}`)); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: view.w, height: view.h, deviceScaleFactor: view.touch ? 2 : 1, mobile: view.touch,
    screenOrientation: { type: view.w > view.h ? 'landscapePrimary' : 'portraitPrimary', angle: view.w > view.h ? 90 : 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: view.touch, maxTouchPoints: view.touch ? 5 : 1 });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const until = async (expr, secs = 3, step = 120) => { const t0 = Date.now(); let v; while (Date.now() - t0 < secs * 1000) { v = await ev(expr).catch(() => null); if (v) return v; if (step) await sleep(step); } return v; };
  const rect = (sel) => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; const b = n.getBoundingClientRect(); return b.width ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; })()`);
  const tapAt = async (x, y) => {
    if (view.touch) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(50);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(40);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
  };
  const tap = async (sel) => { const r = await rect(sel); if (!r) throw new Error(`no element ${sel}`); await tapAt(r.x + r.w / 2, r.y + r.h / 2); await sleep(120); };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${SHOTS}${name}-${view.name}.png`, Buffer.from(r.data, 'base64')); };
  const noOverflow = () => ev('document.documentElement.scrollWidth <= innerWidth + 1');
  const O = '__bench.ghud.online.state';

  if (ONLY !== 'game') {
    const bench = async (q) => {
      await send('Page.navigate', { url: `${ROOT}tools/onlinehud.html?shot=1&${q}` });
      await until('window.__benchReady && !!document.querySelector(".krz-court:not([hidden]) li")', 8);
      await sleep(250);
    };
    // 1. ladder content, D4 titles, you outside the top rows
    await bench('n=7&me=5&collapsed=0');
    let s = await ev(O);
    ok(s.on && !s.collapsed && s.rows >= 3 && s.rows <= 5, 'ladder visible, 3–5 rows', JSON.stringify(s));
    ok(s.shown[0] === 'p:0' && s.shown.at(-1) === 'p:5' && s.shown.length === s.rows, 'top rows + your row last when you are outside', s.shown.join());
    ok(await ev(`document.querySelector('.krz-crt-list li.gap')?.dataset.id === 'p:5'`), 'gap marker above your row');
    ok(s.me === '6th/7', 'header shows your place', s.me);
    const titles = await ev(`[...document.querySelectorAll('.krz-crt-list li')].map((li) => li.querySelector('small').textContent + ':' + li.querySelector('b').textContent)`);
    ok(titles[0] === 'Queen:Mo' && titles[1] === 'Crown Prince:Bertie' && titles.at(-1) === 'Marquess:You', 'D4: leader Queen (no Emperor earned), one rung down per place', titles.join());
    ok(await ev(`!!document.querySelector('.krz-crt-list li.crown .krz-crt-pl svg') && document.querySelectorAll('.krz-crt-pl svg').length === 1`), 'crown icon on the leader only');
    ok(await ev(`document.querySelector('.krz-crt-list li.you')?.dataset.id === 'p:5'`), 'your row highlighted');
    ok(s.link?.q === 'direct' && s.link.label === 'DIRECT' && s.link.bars === 4, 'pill: Direct, 4 bars at 48 ms', JSON.stringify(s.link));
    const pause = await rect('[data-act="pause"]'), pill = await rect('.krz-net'), court = await rect('.krz-court'), score = await rect('.krz-score'), base = await rect('.krz-stick-base');
    ok(pill && pill.y >= pause.y + pause.h && pill.y - (pause.y + pause.h) < 14 && Math.abs(pill.x - pause.x) < 2, 'pill sits just under the pause button', JSON.stringify({ pill, pause }));
    ok(!hit(court, pause) && !hit(court, score) && !hit(court, pill) && !hit(pill, score), 'ladder/pill clear of pause and score', JSON.stringify({ court, score }));
    ok(!hit(await rect('.krz-crt-list'), base), 'ladder rows clear of the stick', JSON.stringify({ court, base }));
    ok(await noOverflow(), 'no horizontal overflow');
    await shot('bench');
    await bench('n=7&me=0&emp=1&collapsed=0');
    const t2 = await ev(`[...document.querySelectorAll('.krz-crt-list li')].map((li) => li.querySelector('small').textContent)`);
    ok(t2[0] === 'Empress' && t2[1] === 'King', 'D4: leader who earned Emperor is Empress (Mo), 2nd is King', t2.join());
    ok((await ev(O)).me === 'YOURS', 'header says YOURS when you hold the Crown');
    await bench('n=3&me=2&collapsed=0');
    ok((await ev(`__bench.join('<img src=x onerror=window.__pwn=1>'), __bench.bank(__bench.ids.at(-1), 50), 1`)) && await until(`document.querySelectorAll('.krz-crt-list li').length === 4`), 'a join adds a row');
    ok(await ev(`!document.querySelector('.krz-court img') && !window.__pwn && [...document.querySelectorAll('.krz-crt-who b')].some((b) => b.textContent.startsWith('<img'))`), 'names are text, never HTML');
    await bench('n=8&me=7');
    ok(await ev(`document.querySelector('.krz-crt-list li.you small').textContent === 'Baron'`), '0 PP = Baron');

    // 2. crown change by fake session events: you overtake the leader
    await bench('n=5&me=2&collapsed=0');
    const before = await ev(`document.querySelector('.krz-crt-list li[data-id="p:2"]').getBoundingClientRect().top`);
    await ev('__bench.crownTo(__bench.me)');
    await until(`(${O}).holder === 'p:2'`, 1, 0);
    await sleep(60);
    const mid = await ev(`document.querySelector('.krz-crt-list li[data-id="p:2"]').getBoundingClientRect().top`);
    const midT = await ev(`getComputedStyle(document.querySelector('.krz-crt-list li[data-id="p:2"]')).transform`);
    await shot('crown-change');
    s = await until(`(${O}).crowns === 1 && ${O}`, 2);
    ok(s && s.holder === 'p:2' && s.news === 'You take the Crown!' && s.me === 'YOURS', 'crown change: news line + YOURS', JSON.stringify(s));
    ok(await ev(`document.querySelector('.krz-crt-list li[data-id="p:2"]').classList.contains('crowned') && document.querySelector('.krz-court').classList.contains('krz-crt-flash')`), 'crown change animates (row + panel)');
    const after = await ev(`document.querySelector('.krz-crt-list li[data-id="p:2"]').getBoundingClientRect().top`);
    ok(mid > after + 2 && midT !== 'none', 'your row slides up (FLIP), not a jump', `${before} → ${mid} (${midT}) → ${after}`);
    ok((await ev(`[...document.querySelectorAll('.krz-crt-list li')][0].dataset.id`)) === 'p:2', 'you are now top');
    ok(await until(`!(${O}).news`, 4.5), 'news line clears');
    await ev(`__bench.crownTo('p:0')`);
    ok(await until(`(${O}).news === 'Mo takes the Crown'`, 2), 'a rival taking it is announced by name');

    // 3. collapse by real tap, persisted, crown change peeks
    await tap('.krz-crt-head');
    ok(await until(`(${O}).collapsed && getComputedStyle(document.querySelector('.krz-crt-list')).display === 'none'`), 'header tap collapses');
    ok(await ev(`localStorage.getItem('krayzee.courtCollapsed') === '1'`), 'collapsed state saved');
    const head = await rect('.krz-crt-head');
    ok(head && head.h >= 24 && (await rect('.krz-court')).h < 40, 'collapsed = just the header chip', JSON.stringify(head));
    await shot('collapsed');
    await ev('__bench.crownTo(__bench.me)');
    ok(await until(`(${O}).peek && !(${O}).collapsed`, 1.5), 'crown change while collapsed peeks the ladder open');
    ok(await until(`(${O}).collapsed && !(${O}).peek`, 5.5), 'then folds back');
    await bench('n=5&me=2');
    ok((await ev(O)).collapsed, 'collapsed survives a reload');
    await tap('.krz-crt-head');
    ok(await until(`!(${O}).collapsed`), 'tap again expands');

    // 4. connection pill
    await ev(`__bench.link('relay', 210)`);
    s = await until(`(${O}).link?.q === 'relay' && ${O}`, 2);
    ok(s && s.link.label === 'RELAY' && s.link.bars === 2, 'Relayed + 2 bars at 210 ms', JSON.stringify(s?.link));
    await ev(`__bench.link('mixed', 120)`);
    ok(await until(`(${O}).link?.label === 'MIXED' && (${O}).link.bars === 3`, 2), 'mixed links, 3 bars');
    await tap('.krz-net');
    ok(await until(`/1\\/3 relayed · 120 ms/.test(document.querySelector('.krz-net').textContent)`, 1), 'pill tap shows the detail', await ev(`document.querySelector('.krz-net').textContent`));
    ok(!hit(await rect('.krz-net'), await rect('.krz-court')), 'open pill clear of the ladder');
    await shot('pill-detail');
    ok(await until(`(${O}).link.label === 'MIXED'`, 4), 'detail folds back');
    await ev(`__bench.link('solo')`);
    ok(await until(`(${O}).link?.label === 'SOLO'`, 2), 'alone in the room → SOLO');
    await ev(`__bench.link('off')`);
    ok(await until(`(${O}).link?.q === 'off' && (${O}).link.bars === 0`, 2), 'disconnected → OFFLINE, no bars');
    await ev('__bench.setLive(false)');
    ok(await until(`!(${O}).on && document.querySelector('.krz-court').hidden && document.querySelector('.krz-net').hidden`), 'no session → hidden');
    ok(await ev(`!document.querySelector('.krz-court:not([hidden]) li')`), 'rows cleared');

    // 5. parked aircraft chips: locked up front, requirement on tap
    await bench('n=3&me=1&chips=0');
    let g = await ev('__bench.ghud.ground.state');
    ok(g.locked.join() === 'tiger,bathtub', 'career 0: Moth + Bathtub locked up front', JSON.stringify(g));
    ok(await ev(`!!document.querySelector('[data-a="tiger"] svg') && !document.querySelector('[data-a="c172"] svg') && document.querySelector('[data-a="tiger"]').textContent === 'Moth' && /0\\.5\\)$/.test(getComputedStyle(document.querySelector('[data-a="tiger"]')).color)`), 'padlock + dimmed label on locked chips only');
    await tap('[data-a="tiger"]');
    g = await until(`__bench.ghud.ground.state.why && __bench.ghud.ground.state`, 1);
    ok(g && /^Moth · Reach Earl · 6,000 PP$/.test(g.why), 'tap a locked chip → requirement', g?.why);
    ok(!(await ev('window.__benchLog || []')).some((l) => l[0] === 'aircraft'), 'locked tap does not switch the plane');
    await shot('chips-locked');
    await tap('[data-a="bathtub"]');
    ok(await until(`/Bathtub · Finish the Story/.test(__bench.ghud.ground.state.why)`, 1), 'Bathtub says finish the Story');
    ok(!hit(await rect('.krz-plane-why'), await rect('.krz-court')), 'requirement line clear of the ladder');
    await bench('n=3&me=1&chips=6000&g=f');
    g = await ev('__bench.ghud.ground.state');
    ok(g.locked.join() === 'bathtub', 'Countess (6,000 PP): Moth unlocked', JSON.stringify(g));
    await tap('[data-a="tiger"]');
    ok(await until(`(window.__benchLog || []).some((l) => l[0] === 'aircraft' && l[1] === 'tiger')`, 1), 'unlocked chip fires onAircraft');
    ok(!(await ev('__bench.ghud.ground.state.why')), 'no requirement line for an unlocked pick');

    // 6. podium (NET's js/net/podium.js) — layout check only
    await bench('n=6&me=2&podium=1');
    await until(`!!document.querySelector('.kzp-card')`, 2);
    const card = await rect('.kzp-card');
    ok(card && card.y >= 0 && card.y + card.h <= view.h + 1 && card.x >= 0 && card.x + card.w <= view.w + 1, 'podium card fits the screen', JSON.stringify(card));
    ok(await ev(`document.querySelectorAll('.kzp li').length === 6 && document.querySelector('.kzp li.you') && document.querySelector('.kzp li .kzp-place').textContent === '♛'`), 'podium rows, crown, you');
    const btnR = await rect('.kzp button');
    if (!(btnR && btnR.y + btnR.h <= Math.min(view.h, card.y + card.h))) console.log(`  NOTE (NET, js/net/podium.js): podium button below the fold at ${view.name} — card scrolls`);
    await shot('podium');
    await ev(`document.querySelector('.kzp button').scrollIntoView({ block: 'nearest' }), 1`);
    await tap('.kzp button');
    ok(await until(`!document.querySelector('.kzp') && (window.__benchLog || []).some((l) => l[0] === 'podiumClose')`, 1), 'podium button closes by real tap');
  }

  async function game(tag, extra = {}) {
    // 7. the real game: Free Flight, ghud.online fed a fake session; overlap against the live HUD and controls.
    await send('Page.navigate', { url: `${ROOT}docs/` }); await sleep(300);
    await ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
      localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
      localStorage.setItem('krayzee.settings', ${JSON.stringify(JSON.stringify({ v: 3, ...extra }))}); return 1; })()`);
    await send('Page.navigate', { url: `${ROOT}?noaccount=1&intro=0` });
    ok(await until('!!window.__krayzeeReady', 40), 'game boots');
    await until(`!!document.querySelector('.kz-menu [data-a="free"]') && __game.state().mode === 'attract'`, 10);
    await sleep(800);
    await tap('.kz-menu [data-a="free"]');
    ok(await until(`__game.state().mode === 'play' && !!__game.ghud?.online`, 15), 'Free Flight starts; ghud.online exists');
    await sleep(1200);
    await ev(`(() => { try { __game.ghud.coach.complete(); } catch (e) {} return 1; })()`);
    const chips = await until(`__game.ghud.ground.state.aircraft && __game.ghud.ground.state`, 6);
    ok(chips && chips.locked.join() === 'tiger,bathtub', 'game: parked chips show Moth/Bathtub locked', JSON.stringify(chips));
    await tap('[data-a="tiger"]');
    ok(await until(`/Reach Earl/.test(__game.ghud.ground.state.why)`, 1.5), 'game: locked chip explains by real tap', await ev('__game.ghud.ground.state.why'));
    await sleep(400);
    ok((await ev('__game.S.type || "c172"')) === 'c172' && (await ev(`__game.state().mode`)) === 'play', 'game: still the Runabout, still flying');
    await shot('game-chips');
    if (!extra.stickRight) {
      // PLAYTEST_2 B9: the papers toast must not cover the speed/alt strip; PP popups go below the plane band in portrait
      await ev(`(() => { const g = __game.wiring.game; g.handleEvent({ type: 'tower_buzz', id: 9002, actor: 'player', data: { dist: 20, close: true } });
        g.handleEvent({ type: 'scandal', key: 'tower', actor: 'player', t: 1 }); return 1; })()`);
      const toast = await until(`document.querySelector('.krz-paper-toast.in') && (() => { const b = document.querySelector('.krz-paper-toast').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`, 3);
      const strip = await rect('.krz-hud-strip'), pops = await rect('.krz-pops'), stick = await rect('.krz-stick-zone'), vb = await rect('[data-act="view"]');
      ok(toast && !hit(toast, strip) && !hit(toast, vb), `game: papers toast clear of the KT/FT strip and view button`, JSON.stringify({ toast, strip }));
      if (view.w < view.h) ok(pops && pops.y > view.h * 0.5 && !hit(pops, stick), 'game portrait: PP popups below the plane band, clear of the stick', JSON.stringify(pops));
      await sleep(300);
      await shot('game-toast');
      await sleep(2500);
    }
    // an online room flies with playMode 'online' (no warp chip, no parked Free Flight chips) — emulate that here
    await ev(`__game.S.playMode = 'online', 1`);
    ok(await until(`!document.querySelector('.krz-warp') || document.querySelector('.krz-warp').closest('[hidden]') || !document.querySelector('.krz-warp').getBoundingClientRect().width`, 3), 'game: warp chip gone in online mode');
    await ev(`(async () => {
      const { createCourt } = await import('/gms/3d/krayzee/js/game/court.js');
      const court = createCourt({ roomType: 'court' });
      [['Mo','f'],['Bertie','m'],['Dirk','m'],['Lady Penelope','f'],['Hamish','m'],['Gigi','f']].forEach(([n, g], i) => court.addPlayer('p:' + i, { name: n, gender: g }, i));
      [4200, 3100, 2500, 1800, 900, 300].forEach((v, i) => court.addPP('p:' + i, v, 10 + i));
      window.__fake = { court, session: { attached: true, standings: () => court.standings() }, net: { id: 2, connected: true, linkSummary: () => ({ relayed: 1, total: 1, rtt: 95 }) } };
      window.__fakeT = setInterval(() => __game.ghud.online.sync(__fake.session, __fake.net), 30);
      return 1; })()`);
    ok(await until(`__game.ghud.online.state.on && __game.ghud.online.state.shown.length >= 3`, 3), 'game: ladder shows from session.standings()', JSON.stringify(await ev('__game.ghud.online.state')));
    await sleep(2300);
    const layout = async (tag) => {
      const r = await ev(`(() => {
        const R = (n) => { if (!n) return null; const b = n.getBoundingClientRect(); return b.width && getComputedStyle(n).visibility !== 'hidden' ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
        const q = (s) => R(document.querySelector(s));
        const c = __game.controlsRects();
        const o = { court: q('.krz-court'), list: q('.krz-crt-list'), pill: q('.krz-net'), pause: c.topL, topR: c.topR, score: q('.krz-score'), strip: q('.krz-hud-strip'),
          tower: q('.krz-r-tower'), radio: q('.krz-r-btn'), stick: q('.krz-stick-base'), thr: c.thr, pad: c.pad, land: q('.krz-land'), chips: q('.krz-ground'), actions: q('.krz-finish'), coach: q('.krz-coach-bub'), warp: q('.krz-warp'), subs: q('.krz-r-subs .krz-r-pill.in') };
        return o; })()`);
      const mine = ['court', 'pill'], bad = [];
      for (const m of mine) for (const k of Object.keys(r)) if (!mine.includes(k) && k !== 'list' && hit(r[m], r[k])) bad.push(`${m}×${k}`);
      if (hit(r.list, r.stick)) bad.push('list×stick');
      ok(!bad.length, `game ${tag}: ladder + pill clear of HUD, radio, tower and both thumbs`, bad.join(', ') + ' ' + JSON.stringify({ court: r.court, pill: r.pill }));
      if (view.w < view.h) {
        const subs = await ev(`(() => { const s = getComputedStyle(document.querySelector('.krz-r-subs')); return innerWidth - parseFloat(s.right); })()`);
        ok(r.court.x >= subs - 0.5, `game ${tag}: portrait ladder stays in the column the subtitles keep clear`, `${r.court.x} vs subs right ${subs}`);
      }
      return r;
    };
    await layout(tag);
    ok(await noOverflow(), 'game: no horizontal overflow');
    await shot(`game${extra.stickRight ? '-stickright' : ''}`);
    const paused = await ev('__game.state().paused');
    await tap('.krz-crt-head');
    const topEl = await ev(`(() => { const b = document.querySelector('.krz-crt-head').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e ? (e.className?.baseVal ?? e.className) + '|' + e.tagName + '|' + (e.closest('[id]')?.id || '') : 'none'; })()`);
    ok(await until(`__game.ghud.online.state.collapsed`, 1.5) && (await ev('__game.state().paused')) === paused, 'game: header tap collapses without pausing', `top=${topEl} paused=${paused}→${await ev('__game.state().paused')} ${JSON.stringify(await ev('__game.ghud.online.state'))}`);
    await tap('.krz-crt-head');
    ok(await until(`!__game.ghud.online.state.collapsed`, 1.5), 'game: tap again expands');
    await ev(`__fake.court.addPP('p:2', 2500, 99), 1`);
    ok(await until(`__game.ghud.online.state.holder === 'p:2' && __game.ghud.online.state.news === 'You take the Crown!'`, 2), 'game: crown change animates in flight');
    await sleep(300);
    await shot('game-crown');
    await ev('clearInterval(__fakeT), __game.ghud.online.sync(null, null), 1');
    ok(await until(`!__game.ghud.online.state.on && document.querySelector('.krz-court').hidden`), 'game: session detached → hidden');
  }
  if (ONLY !== 'bench') {
    await game('stick left');
    if (view.touch && view.w > view.h) await game('stick right', { stickRight: true });
  }

  const real = c.errors.filter((e) => !/sample\.mp3|404|Failed to load resource/.test(e));
  ok(real.length === 0, 'no page errors', real.slice(0, 3).join(' | '));
  await c.close();
  return { view: view.name, passes, fails };
}

const keep = process.argv.includes('--keep');
try { execFileSync(CDP, ['start', '--port', String(PORT), '--', '--use-angle=metal'], { stdio: 'ignore' }); } catch (e) { /* may already run */ }
let bad = 0;
try {
  for (const v of VIEWS) {
    const r = await run(v);
    bad += r.fails.length;
    console.log(`${r.view}: ${r.passes.length}/${r.passes.length + r.fails.length} pass`);
    for (const f of r.fails) console.log(`  FAIL ${f}`);
  }
} finally {
  if (!keep) try { execFileSync(CDP, ['stop', String(PORT)], { stdio: 'ignore' }); } catch (e) { /* */ }
}
process.exit(bad ? 1 : 0);
