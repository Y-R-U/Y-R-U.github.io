// uiproof.mjs — phone-viewport UI + audio-unlock check over raw CDP.
//
//   python3 -m http.server 8771 --bind 127.0.0.1     (from the site root)
//   ~/.claude/bin/cdp start --port 9241 -- --use-angle=metal --autoplay-policy=user-gesture-required
//   node tools/uiproof.mjs [--port 9241] [--base http://127.0.0.1:8771] [--shots DIR]
//
// Real touch events (Input.dispatchTouchEvent) drive the buttons, so a footer
// hidden behind something or a dead handler fails here, not just in a screenshot.

import fs from 'node:fs';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const PORT = opt('port', '9241');
const BASE = opt('base', 'http://127.0.0.1:8771');
const SHOTS = opt('shots', null);
const URL = BASE + '/gms/2d/crazyspace/?test';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
async function tap(x, y, { endOnly = false, startOnly = false } = {}) {
  if (!endOnly) await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (!startOnly) await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(120);
}
async function tapSel(sel, text) {
  const r = await ev(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent && (${JSON.stringify(text || '')} === '' || e.textContent.includes(${JSON.stringify(text || '')})));
    const e = els[0]; if (!e) return null; const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const hit = document.elementFromPoint(x, y); return { x, y, ok: !!hit && (hit === e || e.contains(hit)) }; })()`);
  if (!r) throw new Error(`no visible ${sel} "${text || ''}"`);
  if (!r.ok) throw new Error(`${sel} "${text || ''}" is covered at its centre`);
  await tap(r.x, r.y);
}
async function shot(name) {
  if (!SHOTS) return;
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.data, 'base64'));
}
const fails = []; const notes = [];
const check = (ok, msg) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + msg); };

// every header/footer control on the active screen must sit fully inside the viewport,
// uncovered, and nothing may overflow sideways
const LAYOUT = `(() => {
  const s = [...document.querySelectorAll('.screen.active')].pop(); if (!s) return { err: 'no active screen' };
  const out = { overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth, bad: [], sideways: [] };
  for (const b of s.querySelectorAll('.shead button, .sfoot button')) {
    const r = b.getBoundingClientRect();
    const inside = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5 && r.height > 0;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!inside || !(hit === b || b.contains(hit))) out.bad.push(b.textContent.trim() || b.getAttribute('aria-label'));
  }
  for (const e of s.querySelectorAll('.sbody, .sfoot, .shead')) if (e.scrollWidth > e.clientWidth + 1) out.sideways.push(e.className);
  return out; })()`;
async function layout(name) {
  const r = await ev(LAYOUT);
  check(!r.err && !r.overflow && !r.bad.length && !r.sideways.length, `${name}: layout ${JSON.stringify(r)}`);
}

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

for (const [W, H] of [[390, 844], [375, 667]]) {
  const tag = `${W}x${H}`;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL }); await wait(900);
  await ev(`localStorage.clear()`);
  await send('Page.reload', { ignoreCache: true }); await wait(1200);
  check(await ev(`!!window.__crazyspace`), `${tag}: game booted`);
  check(await ev(`__crazyspace.settings.lastDiff`) === 'rookie', `${tag}: fresh save defaults to Rookie`);

  // ---- audio: a bare touchstart must NOT be what unlocks (that was the Android bug);
  // a full tap must reach 'running', and so must a tap after a suspend.
  if (W === 390) {
    // Headless Chrome runs any AudioContext without a gesture, so ctx.state alone
    // proves nothing here. The browser's own navigator.userActivation is the
    // instrument: every resume() the game makes must happen while activation is
    // live, and a bare touchstart (the old unlock event) must not grant it.
    await ev(`(() => { const a = __crazyspace.audio, o = a.resume.bind(a); window.__res = [];
      a.resume = () => { window.__res.push(navigator.userActivation.isActive); o(); }; })()`);
    await ev(`window.addEventListener('touchstart', () => { window.__tsActive = navigator.userActivation.isActive; }, { once: true, capture: true })`);
    await tap(195, 200, { startOnly: true });
    const ts = await ev(`({ active: window.__tsActive, ever: navigator.userActivation.hasBeenActive, ctx: __crazyspace.audio.ctx ? __crazyspace.audio.ctx.state : 'none', calls: window.__res.length })`);
    check(ts.active === false && ts.ever === false, `${tag}: falsifier — touchstart grants no user activation ${JSON.stringify(ts)}`);
    check(ts.calls === 0, `${tag}: no audio unlock attempted on touchstart (would be wasted on Android)`);
    await tap(195, 200, { endOnly: true }); await wait(200);
    const afterTap = await ev(`({ state: __crazyspace.audio.ctx ? __crazyspace.audio.ctx.state : 'none', calls: window.__res.slice() })`);
    await ev(`__crazyspace.audio.ctx.suspend()`);
    const suspended = await ev(`__crazyspace.audio.ctx.state`);
    await ev(`window.__res = []`);
    await tap(195, 200); await wait(200);
    const re = await ev(`({ state: __crazyspace.audio.ctx.state, calls: window.__res.slice() })`);
    notes.push(`info audio: touchstart ${JSON.stringify(ts)}; after touchend ${JSON.stringify(afterTap)}; suspended=${suspended}; after re-tap ${JSON.stringify(re)}`);
    check(afterTap.state === 'running' && afterTap.calls.length > 0 && afterTap.calls.every(Boolean), `${tag}: tap unlocks audio inside live user activation`);
    check(suspended === 'suspended' && re.state === 'running' && re.calls.length > 0 && re.calls.every(Boolean), `${tag}: audio recovers after suspend on the next tap`);
  }

  await layout(`${tag} title`); await shot(`${tag}-title`);
  check(await ev(`document.querySelector('.upg-hint').textContent.includes('easier')`), `${tag}: upgrade hint on main menu`);

  // ---- hangar via a real tap from the title, buy something with a real tap
  await ev(`__crazyspace.setHangar({ credits: 300 })`);
  await tapSel('.title-screen .hangar-btn');
  check(await ev(`document.querySelector('.hangar-screen').classList.contains('active')`), `${tag}: Hangar opens from main menu`);
  await layout(`${tag} hangar`); await shot(`${tag}-hangar`);
  await tapSel('.hangar-screen .btn.buy.primary');
  const h1 = await ev(`JSON.parse(localStorage.getItem('crazyspace.hangar.v1'))`);
  check(h1 && h1.levels.hull === 1 && h1.credits === 280, `${tag}: buying Hull L1 by tap saves (credits ${h1 && h1.credits})`);
  // falsifier: un-pin the footer (the old single-scroller layout) — the check must catch it
  await ev(`(() => { const st = document.createElement('style'); st.id = '__unpin'; st.textContent = '.sbody{flex:none!important;overflow:visible!important}'; document.head.append(st); })()`);
  const unpinned = await ev(LAYOUT);
  check(unpinned.bad.length > 0, `${tag}: falsifier — unpinned footer is caught (${JSON.stringify(unpinned.bad)})`);
  await ev(`document.getElementById('__unpin').remove()`);
  await ev(`document.querySelector('.hangar-screen .sbody').scrollTop = 99999`); await wait(100);
  await layout(`${tag} hangar scrolled`);

  // ---- ship select: LAUNCH pinned in the footer
  await ev(`__crazyspace.menu.show('ship')`); await wait(100);
  await layout(`${tag} ship`); await shot(`${tag}-ship`);
  check(await ev(`(() => { const b = [...document.querySelectorAll('.sfoot .btn')].find(b => b.textContent.includes('LAUNCH') && b.offsetParent); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight; })()`), `${tag}: LAUNCH visible without scrolling`);
  for (const k of ['help', 'settings', 'career', 'mode']) { await ev(`__crazyspace.menu.show('${k}')`); await wait(60); await layout(`${tag} ${k}`); }

  // ---- a real match with max upgrades, then results -> Upgrade -> Rematch
  await ev(`__crazyspace.setHangar({ levels: { hull: 8, reactor: 8, engines: 8, guns: 8, bombs: 8, headstart: 8, shield: 8, aim: 8 }, credits: 0 })`);
  await ev(`__crazyspace.menu.show('ship')`); await wait(60);
  await tapSel('.sfoot .btn', 'LAUNCH'); await wait(300);
  const g = await ev(`(() => { const g = __crazyspace.game; return { scene: __crazyspace.app.scene, pUpg: !!g.player.upg, botUpg: g.ships.filter(s => !s.isPlayer).some(s => s.upg), maxE: g.player.maxEff(), def: g.player.def.maxEnergy, aim: g.player.upg.aim.cone }; })()`);
  check(g.scene === 'game' && g.pUpg && !g.botUpg && g.maxE > g.def, `${tag}: launch applies upgrades to player only ${JSON.stringify(g)}`);
  await ev(`__crazyspace.step(1/60, 600)`);
  await ev(`__crazyspace.endMatch('Test Over'); __crazyspace.showResults()`); await wait(200);
  const credits = await ev(`JSON.parse(localStorage.getItem('crazyspace.hangar.v1')).credits`);
  const earnTxt = await ev(`document.querySelector('.earn b').textContent`);
  check(credits > 0 && earnTxt === `+${credits} credits`, `${tag}: results award credits (${earnTxt}, saved ${credits})`);
  await layout(`${tag} results`); await shot(`${tag}-results`);
  // showResults twice must not pay twice
  await ev(`__crazyspace.showResults()`);
  check(await ev(`JSON.parse(localStorage.getItem('crazyspace.hangar.v1')).credits`) === credits, `${tag}: credits paid once per match`);
  await tapSel('.results-screen .sfoot .btn', 'Upgrade'); await wait(150);
  check(await ev(`document.querySelector('.hangar-screen').classList.contains('active') && document.querySelector('.hangar-screen .sfoot').textContent.includes('Rematch')`), `${tag}: Upgrade opens Hangar with Rematch`);
  await layout(`${tag} hangar after match`);
  await tapSel('.hangar-screen .sfoot .btn', 'Rematch'); await wait(200);
  check(await ev(`__crazyspace.app.scene === 'game' && !document.querySelector('.screen.active')`), `${tag}: Rematch from Hangar starts a match`);
  await ev(`__crazyspace.quitToMenu()`);
}

// difficulty: picker explains the buff, and it lands on bots only
await send('Page.navigate', { url: URL }); await wait(1200);
await ev(`__crazyspace.menu.show('ship')`); await wait(100);
await tapSel('.seg', 'Veteran');
check((await ev(`document.querySelector('.diff-line').textContent`)).includes('+25% hull & firepower'), `Veteran picker line names the +25% buff`);
await layout('ship veteran');
await ev(`__crazyspace.setHangar({ levels: { hull: 5, reactor: 5, engines: 5, guns: 6, bombs: 7, headstart: 5, shield: 5, aim: 5 }, credits: 1234 })`);
await ev(`__crazyspace.menu.show('hangar')`); await wait(100); await layout('hangar late levels'); await shot('hangar-late');
for (const [skill, k] of [[0.4, 1], [0.62, 1.25], [0.85, 1.5]]) {
  const r = await ev(`(() => { __crazyspace.startGame('team', 'warbird', ${skill}); const g = __crazyspace.game; const bots = g.ships.filter(s => !s.isPlayer);
    return { player: [g.player.hullK, g.player.fireK], bots: bots.every(b => b.hullK === ${k} && b.fireK === ${k} && Math.abs(b.maxEff() - b.def.maxEnergy * ${k}) < 1e-6) }; })()`);
  check(r.player[0] === 1 && r.player[1] === 1 && r.bots, `skill ${skill}: bots x${k} hull/fire, player x1 ${JSON.stringify(r)}`);
  await ev(`__crazyspace.quitToMenu()`);
}

// ?noupg flies without upgrades even when they are bought
await send('Page.navigate', { url: URL + '&noupg' }); await wait(1200);
await ev(`__crazyspace.setHangar({ levels: { hull: 8 } }); __crazyspace.startGame('deathmatch', 'warbird', 0.4)`);
check(await ev(`__crazyspace.game.player.upg === null`), `?noupg leaves the player un-upgraded`);

// favicon.ico is a local http.server artefact (the live hosts serve the site's own)
const real = errors.filter(e => !/favicon\.ico/.test(e));
check(real.length === 0, `console errors: ${JSON.stringify(real)}`);
console.log([...notes, ...fails].join('\n'));
console.log(fails.length ? `UI PROOF FAIL (${fails.length})` : 'UI PROOF PASS');
ws.close();
process.exit(fails.length ? 1 : 0);
