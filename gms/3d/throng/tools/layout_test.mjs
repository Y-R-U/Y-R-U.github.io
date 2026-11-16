// node tools/layout_test.mjs --port 9282 --base http://127.0.0.1:8761/gms/3d/throng/ [--sizes 384x314,384x360,360x300,384x692,844x390]
//   [--shots DIR] [--only menu,hud,lcs,results,leave,crown,mouse]
// Small-screen layout and the G6 display fixes, measured in the page:
//   menu   no sideways overflow; every visible menu control inside the viewport
//   hud    timer/pause/kills/mode pill/leaderboard/minimap/account badge do not overlap, all inside the viewport
//   lcs    knock-out banner: right text (no "respawning"), names who knocked you out or the circle, clear of the HUD,
//          collapses to a Spectating chip after ~3 s, gone when the winner banner shows
//   results card fits sideways (no horizontal scroll), Play Again reachable, clear of the account badge
//   leave  leaving a rated match early lists you last under "Counted as last place"
//   crown  no crown (3D or leaderboard) while everyone is tied at kick-off; a crown once someone leads outright
//   mouse  Settings shows the Mouse row only with a fine pointer that is not a touch-first device's stylus
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']] : a), []));
const port = +(args.port || 9282);
const base = args.base || 'http://127.0.0.1:8761/gms/3d/throng/';
const sizes = (args.sizes || '384x314,384x360,360x300,384x692,844x390').split(',').map((s) => s.split('x').map(Number));
const only = new Set((args.only || 'menu,hud,lcs,results,absorb,leave,crown,mouse').split(','));
const shots = args.shots || '';
if (shots) fs.mkdirSync(shots, { recursive: true });

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let target = list.find((t) => t.type === 'page');
if (!target) target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(expr.slice(0, 80) + ': ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');

const fails = [];
const F = (s) => { fails.push(s); console.log('  FAIL ' + s); };
const shot = async (name) => { if (!shots) return; const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shots}/${name}.png`, Buffer.from(s.result.data, 'base64')); };

const HELP = `window.__L = {
  R: (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; },
  vis: (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05,
  hit: (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5,
  fab: () => { const a = document.getElementById('br8t-account'); const f = a && a.shadowRoot && a.shadowRoot.querySelector('.fab'); return f && f.getClientRects().length ? f : null; },
  hudRects() { const root = document.getElementById('hud'); const out = [...root.querySelectorAll('.timer, .pause-btn, .kills, .mode-pill, .lb, .mm-wrap, .team-bar')].filter(this.vis).map((e) => ({ n: e.className.split(' ')[0], ...this.R(e) }));
    const f = this.fab(); if (f) out.push({ n: 'account', ...this.R(f) }); return out; },
};`;

async function boot(w, h, url, touch = true) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: touch });
  await send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await send('Page.navigate', { url });
  for (let k = 0; k < 150 && !(await ev('!!(window.__game && window.__game.ready)').catch(() => false)); k++) await sleep(200);
  await sleep(700);
  await ev(HELP);
}
const startMatch = async (kind = 'practice') => {
  await ev(`(() => { const G = __game; G.start({ kind: '${kind}' }); G.setAuto(true); })()`);
  for (let k = 0; k < 60 && (await ev('__game.state && __game.state.phase')) !== 'play'; k++) await sleep(150);
};

for (const [w, h] of sizes) {
  const tag = `${w}x${h}`;
  console.log(tag);
  if (only.has('menu')) {
    await boot(w, h, `${base}?seed=7`);
    const r = await ev(`(() => { const W = innerWidth, H = innerHeight; const sc = document.scrollingElement;
      const bad = [...document.querySelectorAll('#screens .menu button, #screens .menu .play, #screens .menu .logo')].filter((e) => __L.vis(e)).map((e) => ({ c: e.className, ...__L.R(e) })).filter((r) => r.l < -1 || r.r > W + 1 || r.t < -1 || r.b > H + 1);
      return { sw: sc.scrollWidth, W, bad: bad.slice(0, 4) }; })()`);
    if (r.sw > r.W + 1) F(`${tag} menu: page scrolls sideways (${r.sw} > ${r.W})`);
    for (const b of r.bad) F(`${tag} menu: ${b.c} outside viewport ${JSON.stringify([b.l, b.t, b.r, b.b].map(Math.round))}`);
    await shot(`menu_${tag}`);
  }
  if (only.has('hud') || only.has('lcs')) {
    await boot(w, h, `${base}?seed=7&mode=lcs`);
    await startMatch();
    await ev('__game.stepSeconds(20)');
    await sleep(500);
    const r = await ev(`(() => { const rs = __L.hudRects(), W = innerWidth, H = innerHeight, out = [];
      for (const a of rs) if (a.l < -0.5 || a.t < -0.5 || a.r > W + 0.5 || a.b > H + 0.5) out.push(a.n + ' outside viewport');
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (__L.hit(rs[i], rs[j])) out.push(rs[i].n + ' overlaps ' + rs[j].n);
      const lb = rs.find((x) => x.n === 'lb'), left = rs.filter((x) => ['timer', 'pause-btn', 'kills', 'mode-pill'].includes(x.n) && lb && x.t < lb.b && x.b > lb.t);
      const gap = lb && left.length ? Math.min(...left.map((x) => lb.l - x.r)) : null;
      return { out, n: rs.map((x) => x.n), gap, lbH: lb ? Math.round(lb.b - lb.t) : 0 }; })()`);
    console.log(`  hud: gap between the left HUD and the leaderboard ${r.gap == null ? 'n/a (no shared rows)' : r.gap.toFixed(0) + ' px'}, board ${r.lbH} px tall`);
    if (r.gap != null && r.gap < 12) F(`${tag} hud: left HUD and leaderboard only ${r.gap.toFixed(0)} px apart`);
    for (const o of r.out) F(`${tag} hud: ${o}`);
    if (!r.n.includes('lb') || !r.n.includes('pause-btn')) F(`${tag} hud: missing panels (${r.n})`);
    await shot(`hud_${tag}`);
  }
  if (only.has('lcs')) {
    // Knock the player out on top of the biggest crowd: banner must name it.
    await ev(`(() => { const G = __game, S = G.state, me = S.crowds[0]; G.setAuto(false);
      const big = S.crowds.filter((c) => c.alive && c.index !== 0).sort((a, b) => b.count - a.count)[0]; window.__bigName = G.hud && big ? big.index : -1;
      G.__probe = setInterval(() => { if (!me.alive) return; me.count = 1; me.protect = 0; me.x = big.x; me.z = big.z; }, 16); })()`);
    let gone = false;
    for (let k = 0; k < 60 && !gone; k++) { await sleep(100); gone = await ev('!__game.state.crowds[0].alive'); }
    await sleep(250);
    const v = await ev(`(() => { clearInterval(__game.G_probe); clearInterval(__game.__probe); const root = document.getElementById('hud'), veil = root.querySelector('.dead-veil');
      const sub = root.querySelector('.dv-sub'), t = root.querySelector('.dv-title');
      const after = getComputedStyle(sub, '::after').content;
      const rs = __L.hudRects(); const over = [];
      for (const e of [t, sub]) for (const a of rs) if (__L.vis(e) && __L.hit(__L.R(e), a)) over.push(e.className + ' x ' + a.n);
      const S = __game.state, big = S.crowds[window.__bigName];
      return { shown: __L.vis(veil), title: t.textContent, sub: sub.textContent, after, over, bigName: big ? document.querySelectorAll('.lb-name')[big.index].textContent : '' }; })()`);
    if (!gone) F(`${tag} lcs: could not knock the player out`);
    else {
      if (!v.shown) F(`${tag} lcs: no knock-out banner`);
      if (v.title !== 'OUT!') F(`${tag} lcs: banner title "${v.title}"`);
      if (/respawning/i.test(v.sub + v.after)) F(`${tag} lcs: banner still says respawning ("${v.sub}" + ${v.after})`);
      if (!v.sub.includes('Knocked out by ' + v.bigName)) F(`${tag} lcs: banner "${v.sub}" does not name ${v.bigName}`);
      for (const o of v.over) F(`${tag} lcs: banner overlaps HUD: ${o}`);
    }
    await shot(`lcs_out_${tag}`);
    await sleep(3400);
    const c = await ev(`(() => { const root = document.getElementById('hud'), chip = root.querySelector('.spec-chip');
      if (!chip) return { veil: __L.vis(root.querySelector('.dead-veil')), chip: false, text: '', over: [], inside: true };
      const rs = __L.hudRects(); const over = rs.filter((a) => __L.vis(chip) && __L.hit(__L.R(chip), a)).map((a) => a.n);
      const cr = __L.R(chip);
      return { veil: __L.vis(root.querySelector('.dead-veil')), chip: __L.vis(chip), text: chip.textContent, over, inside: cr.l >= 0 && cr.r <= innerWidth && cr.b <= innerHeight }; })()`);
    if (c.veil) F(`${tag} lcs: banner still full size after 3.6 s`);
    if (!c.chip || !/SPECTATING/.test(c.text)) F(`${tag} lcs: no Spectating chip ("${c.text}")`);
    if (c.chip && !c.inside) F(`${tag} lcs: chip outside the viewport`);
    for (const o of c.over) F(`${tag} lcs: chip overlaps ${o}`);
    await shot(`lcs_chip_${tag}`);
    // run to the end: chip and banner gone when "X takes it" shows
    // fast-forward (which drains events) only until the end is close, then play the finish in real time
    await ev(`(() => { const G = __game; for (let k = 0; k < 200; k++) { const S = G.state; if (S.phase !== 'play' || S.timeLeft < 4 || S.crowds.filter((c) => !c.out).length <= 2) break; G.stepSeconds(1); } })()`);
    let end = null;
    for (let k = 0; k < 700; k++) {
      await sleep(100);
      end = await ev(`(() => { const root = document.getElementById('hud'); const toast = [...root.querySelectorAll('.toast')].map((t) => t.textContent).join('|');
        return { phase: __game.state.phase, toast, veil: __L.vis(root.querySelector('.dead-veil')), chip: __L.vis(root.querySelector('.spec-chip')) }; })()`);
      if (end.phase === 'over' && /takes it/.test(end.toast)) break;
    }
    if (!/takes it/.test(end.toast)) F(`${tag} lcs: no winner toast at the end (${end.phase}, "${end.toast}")`);
    else if (end.veil || end.chip) F(`${tag} lcs: knock-out banner/chip still showing with the winner toast`);
    await shot(`lcs_end_${tag}`);
  }
  if (only.has('results')) {
    await boot(w, h, `${base}?seed=7`);
    await startMatch('sim-online');
    await ev('__game.stepSeconds(200)');
    for (let k = 0; k < 60 && !(await ev('(__game.resultsShown || 0) > 0')); k++) await sleep(150);
    await sleep(1600);
    const r = await ev(`(() => { const card = document.querySelector('.results .res-card'), again = card && card.querySelector('.again'), menu = card && card.querySelector('.to-menu');
      if (!card || !__L.vis(card)) return { none: true };
      const c = __L.R(card), a = __L.R(again), m = __L.R(menu), f = __L.fab();
      return { sw: card.scrollWidth, cw: card.clientWidth, c, a, m, W: innerWidth, H: innerHeight, docW: document.scrollingElement.scrollWidth,
        fab: f ? __L.hit(__L.R(f), c) : false, scrollable: card.scrollHeight > card.clientHeight + 1 }; })()`);
    if (r.none) F(`${tag} results: no results card`);
    else {
      if (r.sw > r.cw + 1) F(`${tag} results: card scrolls sideways (${r.sw} > ${r.cw})`);
      if (r.docW > r.W + 1) F(`${tag} results: page scrolls sideways`);
      if (r.c.l < -0.5 || r.c.r > r.W + 0.5 || r.c.t < -0.5 || r.c.b > r.H + 0.5) F(`${tag} results: card outside viewport ${JSON.stringify(r.c)}`);
      for (const [n, b] of [['Play Again', r.a], ['Menu', r.m]]) if (b.l < r.c.l - 0.5 || b.r > r.c.r + 0.5) F(`${tag} results: ${n} clipped sideways ${Math.round(b.l)}..${Math.round(b.r)} in ${Math.round(r.c.l)}..${Math.round(r.c.r)}`);
      if (r.fab) F(`${tag} results: card under the account badge`);
    }
    await shot(`results_${tag}`);
    // scroll to the buttons to check they are reachable
    const reach = await ev(`(() => { const card = document.querySelector('.results .res-card'); const a = card.querySelector('.again'); a.scrollIntoView({ block: 'nearest' }); const r = __L.R(a); return r.t >= 0 && r.b <= innerHeight; })()`);
    if (!reach) F(`${tag} results: Play Again not reachable by scrolling`);
    await shot(`results_scrolled_${tag}`);
  }
}

if (only.has('absorb')) {
  // Classic: the respawning banner is unchanged and clears on respawn.
  await boot(384, 692, `${base}?seed=7&mode=classic`);
  await startMatch();
  await ev('__game.stepSeconds(15)');
  await ev(`(() => { const G = __game, S = G.state, me = S.crowds[0]; G.setAuto(false);
    const big = S.crowds.filter((c) => c.alive && c.index !== 0).sort((a, b) => b.count - a.count)[0]; window.__bigName = big.index;
    G.__probe = setInterval(() => { if (!me.alive) return; me.count = 1; me.protect = 0; me.x = big.x; me.z = big.z; }, 16); })()`);
  let gone = false;
  for (let k = 0; k < 60 && !gone; k++) { await sleep(100); gone = await ev('!__game.state.crowds[0].alive'); }
  await sleep(200);
  const v = await ev(`(() => { clearInterval(__game.__probe); const root = document.getElementById('hud'), sub = root.querySelector('.dv-sub');
    return { shown: __L.vis(root.querySelector('.dead-veil')), title: root.querySelector('.dv-title').textContent, sub: sub.textContent, after: getComputedStyle(sub, '::after').content,
      name: document.querySelectorAll('.lb-name')[window.__bigName].textContent }; })()`);
  await shot('absorbed_classic');
  let back = false;
  for (let k = 0; k < 80 && !back; k++) { await sleep(100); back = await ev(`__game.state.crowds[0].alive && document.querySelector('#hud .dead-veil').classList.contains('hidden')`); }
  console.log(`absorb: ${v.title} "${v.sub}" ${v.after}; cleared on respawn ${back}`);
  if (!gone || !v.shown || v.title !== 'ABSORBED!' || v.sub !== 'by ' + v.name || !/respawning/.test(v.after)) F(`absorb: classic banner wrong (${JSON.stringify(v)})`);
  if (!back) F('absorb: classic banner did not clear on respawn');
}

if (only.has('leave')) {
  const [w, h] = [384, 692];
  await boot(w, h, `${base}?seed=7`);
  await startMatch('sim-online');
  // make the player clearly rank 1, then leave
  await ev(`(() => { const S = __game.state; S.crowds[0].count = 999; })()`);
  await sleep(400);
  const rank = await ev('__game.state.crowds[0].rank');
  await ev(`(() => { __game.pause(); })()`);
  await sleep(300);
  await ev(`document.querySelector('.pz-leave').click()`);
  await sleep(200);
  await ev(`document.querySelector('.pz-leave').click()`);
  for (let k = 0; k < 30 && !(await ev('(__game.resultsShown || 0) > 0')); k++) await sleep(150);
  await sleep(1200);
  const r = await ev(`(() => { const lis = [...document.querySelectorAll('.results .res-list li:not(.rl-teams)')]; const i = lis.findIndex((li) => li.classList.contains('me'));
    return { sub: document.querySelector('.results .res-sub').textContent, n: lis.length, i, rank: lis[i] ? lis[i].textContent.trim().slice(0, 3) : '' }; })()`);
  console.log(`leave: was rank ${rank}; results "${r.sub}", your row ${r.i + 1}/${r.n} (${r.rank})`);
  if (r.sub !== 'Counted as last place') F(`leave: results subtitle "${r.sub}"`);
  else if (r.i !== r.n - 1) F(`leave: your row is ${r.i + 1} of ${r.n}, not last`);
  await shot('leave_384x692');
}

if (only.has('crown')) {
  await boot(384, 692, `${base}?seed=7`);
  await ev(`(() => { const G = __game; G.start({ kind: 'practice' }); G.setAuto(true); })()`);
  await sleep(700);
  const a = await ev(`(() => { const S = __game.state; return { phase: S.phase, counts: S.crowds.map((c) => c.count).join(','), lb: document.querySelectorAll('#hud .lb-row.first').length, crown: __game.renderer.three ? __game.renderer.three.scene.getObjectByProperty('isGroup', true) && 0 : 0 }; })()`);
  // the renderer crown alpha: look for the crown group visibility via _dbg if exposed; otherwise trust crownTop()
  const crown3d = await ev(`(() => { let vis = null; __game.renderer.three.scene.traverse((o) => { if (o.userData && o.userData.isCrown) vis = o.visible; }); return vis; })()`);
  await shot('crown_kickoff');
  for (let k = 0; k < 40 && (await ev('__game.state.phase')) !== 'play'; k++) await sleep(150);
  await sleep(600);
  const b = await ev(`(() => { const S = __game.state; return { counts: S.crowds.map((c) => c.count).join(','), tie: S.crowds.filter((c) => c.count === S.crowds[S.leader].count).length > 1, lb: document.querySelectorAll('#hud .lb-row.first').length }; })()`);
  console.log(`crown: countdown ${a.phase} counts ${a.counts} lb crowns ${a.lb} 3d ${crown3d}; play counts ${b.counts} tie ${b.tie} lb crowns ${b.lb}`);
  if (a.lb !== 0) F(`crown: leaderboard crown during an all-tied kick-off`);
  if (crown3d === true) F('crown: 3D crown visible during an all-tied kick-off');
  if (b.tie && b.lb !== 0) F('crown: leaderboard crown on a tie after kick-off');
  await ev('__game.stepSeconds(15)');
  await sleep(500);
  const c = await ev(`(() => { const S = __game.state; let vis = null; __game.renderer.three.scene.traverse((o) => { if (o.userData && o.userData.isCrown) vis = o.visible; }); const L = S.crowds[S.leader]; return { tie: S.crowds.filter((c) => c.count === L.count).length > 1, lb: document.querySelectorAll('#hud .lb-row.first').length, vis }; })()`);
  if (!c.tie && c.lb !== 1) F(`crown: no leaderboard crown once someone leads outright`);
  if (!c.tie && c.vis === false) F('crown: no 3D crown once someone leads outright');
}

if (only.has('mouse')) {
  // CDP cannot emulate any-pointer by itself: touch emulation gives a touch-only phone; a stylus phone is
  // stubbed (any-pointer fine + pointer coarse); a real mouse move is a synthetic pointermove of type mouse.
  const row = async () => { await ev(`(() => { document.querySelector('.sheet-layer .sheet-x, .sheet .close')?.click(); __game.openSheet('settings'); })()`); await sleep(400); return ev(`(() => { const r = document.querySelector('.st-mouse'); return !!r && r.getClientRects().length > 0; })()`); };
  await boot(384, 692, `${base}?seed=7`);
  const phone = await row();
  await ev(`(() => { const real = window.matchMedia.bind(window); window.matchMedia = (q) => (q === '(any-pointer: fine)' || q === '(pointer: coarse)' ? { matches: true } : real(q)); })()`);
  const pen = await row();
  await ev(`window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }))`);
  const mouse = await row();
  await boot(1440, 900, `${base}?seed=7`, false);
  const desk = await row();
  console.log(`mouse row: phone ${phone}, phone+stylus ${pen}, phone after a real mouse move ${mouse}, desktop ${desk}`);
  if (phone) F('mouse: row shown on a touch-only phone');
  if (pen) F('mouse: row shown on a touch-first phone whose fine pointer is a stylus (no mouse moved)');
  if (!mouse) F('mouse: row hidden after a real mouse moved on a phone with a fine pointer');
  if (!desk) F('mouse: row hidden on desktop');
}

const errs = await ev('__game.errors.slice(0, 5)').catch(() => []);
if (errs && errs.length) F('page errors: ' + errs.join(' | '));
console.log(fails.length ? `FAIL (${fails.length})` : 'PASS');
ws.close();
process.exit(fails.length ? 1 : 0);
