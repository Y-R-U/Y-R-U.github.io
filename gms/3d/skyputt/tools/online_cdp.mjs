#!/usr/bin/env node
// Two-client online check in headless Chrome (raw CDP), against the local server on :8098.
//   ~/.claude/bin/cdp start --port 9512    and    ~/.claude/bin/cdp start --port 9513
//   (one browser per client: headless Chrome only sends frames to one window per browser)
//   tools/server_run.sh --bg
//   node tools/online_cdp.mjs [--out=DIR] [--port=9512] [--port2=9513] [--blp]   (--blp: Bob plays on an 844x390 landscape phone)
// Alice (portrait phone) creates a room through the UI (3 holes, 2 ghost AIs), Bob (desktop landscape)
// joins with the code; both play every hole with a planner bot driving the real Round (shots are
// relayed, ghosts replay), tap Next on each scoreboard, Bob reloads mid-round and rejoins, then both
// reach the results. Own browser contexts + targets, so other agents' tabs are untouched.
// Exits 1 on console errors / exceptions or a failed check.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9512), PORT2 = +(args.port2 || 9513);
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/skyputt/';
const OUT = args.out || '/tmp/skyputt-online';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
let fails = 0;
const check = (c, msg) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) fails++; };

function rpc(ws) {
  let id = 0; const pending = new Map(), handlers = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) handlers.forEach(h => h(m));
  };
  return {
    send: (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pending.set(i, { res, rej })); },
    on: f => handlers.push(f),
  };
}
const open = url => new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(ws); ws.onerror = rej; });

class Page {
  static async create(browser, name, port = PORT) {
    const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const p = new Page();
    p.name = name; p.targetId = targetId;
    p.ws = await open(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
    p.c = rpc(p.ws);
    await p.c.send('Runtime.enable'); await p.c.send('Log.enable'); await p.c.send('Page.enable');
    await p.c.send('Network.enable'); await p.c.send('Network.setCacheDisabled', { cacheDisabled: true });
    p.c.on(m => {
      const tag = `[${name}]`;
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) errors.push(`${tag} console.error: ` + m.params.args.map(a => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning') console.log(`  ${tag} warn:`, m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 240));
      if (m.method === 'Runtime.exceptionThrown') errors.push(`${tag} exception: ` + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errors.push(`${tag} log: ` + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    });
    return p;
  }
  async size(w, h, mobile) {
    await this.c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });   // DPR 1: software GL is slow
    await this.c.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await this.c.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  }
  async eval(expr) {
    const r = await this.c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name} eval: ` + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async waitFor(expr, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await this.eval(expr)) return true; } catch { /* navigating */ } await sleep(150); }
    throw new Error(`${this.name}: timeout waiting for ${expr}`);
  }
  async go(qs) {
    await this.c.send('Page.navigate', { url: `${BASE}?${qs}&t=${Date.now()}` });
    await sleep(400);
    await this.waitFor('window.__booted === true', 40000);
    await sleep(600);
  }
  async click(sel) { return this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`); }
  async shot(file) {
    const r = await this.c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${file}.png`, Buffer.from(r.data, 'base64'));
    console.log('  shot', `${OUT}/${file}.png`);
  }
}

// In-page bot: plan with the real planner on the main thread and putt through Round.shoot (which
// relays it). Returns what it did.
const BOT = `window.__bot = async () => {
  const S = window.__skyputt, r = S.round, g = S.online.game;
  if (!r || !g) return 'nogame';
  if (r.state !== 'ready') return r.state;
  if (!window.__P) { window.__P = await import('/gms/3d/skyputt/js/ai/planner.js'); window.__C = await import('/gms/3d/skyputt/js/engine/constants.js'); }
  if (!r._pl || r._pl.hole !== r.hole) r._pl = new window.__P.Planner(r.hole);
  const p = r._pl.plan(r.ball, { t0: r.world.time, budget: 9000 });
  const v = window.__C.shotSpeed(p.power);
  r.shoot(Math.sin(p.aim) * v, -Math.cos(p.aim) * v, p.power);
  return 'shot';
}; true`;

const state = p => p.eval(`(() => { const S = window.__skyputt, g = S.online.game, r = g?.room || S.online.net.room;
  return { view: S.online.view, game: !!g, card: g?.cardKind || null, roomState: r?.state || null, phase: r?.phase || null, hole: r?.hole ?? -1,
    rstate: S.round?.state || null, index: S.round?.index ?? -1, seats: r?.seats?.length || 0, code: r?.code || null, you: r?.you,
    ghosts: S.round?.peers ? S.round.peers.size : 0 }; })()`);

async function main() {
  const browserAt = async port => { const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); const ws = await open(ver.webSocketDebuggerUrl); return { ws, b: rpc(ws) }; };
  const b1 = await browserAt(PORT), b2 = await browserAt(PORT2);
  const A = await Page.create(b1.b, 'alice', PORT), B = await Page.create(b2.b, 'bob', PORT2);
  await A.size(412, 915, true); await (args.blp ? B.size(844, 390, true) : B.size(1440, 900, false));   // --blp: Bob on a landscape phone
  const qs = name => `devuid=${name}${Date.now().toString(36)}&devname=${name[0].toUpperCase() + name.slice(1)}&fresh&noflyover&q=low`;
  await Promise.all([A.go(qs('alice')), B.go(qs('bob'))]);
  await A.shot('a-title');
  check(await A.eval(`!!document.querySelector('#t-online') && !document.querySelector('#t-online').hidden`), 'title has the Online button');

  // Alice: Online → home → create room (defaults: 3 holes, 2 mixed ghost AIs, helpers 2 each, 30 s clock)
  await A.click('#t-online');
  await A.waitFor(`window.__skyputt.online.view === 'home'`);
  await sleep(500);
  await A.shot('a-home');
  await A.click('[data-a=create]');
  await A.waitFor(`window.__skyputt.online.view === 'create'`);
  await A.eval(`(() => { const s = document.querySelector('[data-k=holeSet]'); s.value = '0-3'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(300);
  await A.shot('a-create');
  await A.click('[data-a=make]');
  await A.waitFor(`window.__skyputt.online.view === 'lobby'`);
  const code = await A.eval(`window.__skyputt.online.net.room.code`);
  check(/^[A-Z2-9]{6}$/.test(code), `room code ${code}`);
  await A.shot('a-lobby');

  // Bob: Online → type the code → Join
  await B.click('#t-online');
  await B.waitFor(`window.__skyputt.online.view === 'home'`);
  await B.eval(`(() => { const i = document.querySelector('[data-k=code]'); i.value = ${JSON.stringify(code.toLowerCase())}; return true; })()`);
  await B.click('[data-a=join]');
  await B.waitFor(`window.__skyputt.online.view === 'lobby'`);
  await A.waitFor(`window.__skyputt.online.net.room.seats.length === 2`);
  await sleep(400);
  await B.shot('b-lobby');
  await A.shot('a-lobby-2');
  check((await state(B)).you === 1, 'bob is seat 2');

  // Alice starts
  await A.click('[data-a=start]');
  await Promise.all([A.waitFor('!!window.__skyputt.online.game && !!window.__skyputt.round', 20000), B.waitFor('!!window.__skyputt.online.game && !!window.__skyputt.round', 20000)]);
  await A.eval(BOT); await B.eval(BOT);
  const sa = await state(A);
  check(sa.seats === 4 && sa.ghosts === 3, `4 seats (2 players + 2 ghost AIs), ${sa.ghosts} ghosts on Alice's screen`);
  await sleep(1500);
  await A.shot('a-hole1-start'); await B.shot('b-hole1-start');

  const nHoles = await A.eval(`window.__skyputt.online.game.room.opts.holes.length`);
  let rejoined = false, shotsTaken = { alice: 0, bob: 0 }, sawGhostMove = false, boards = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 12 * 60e3) {
    const [s1, s2] = await Promise.all([state(A), state(B)]);
    if (s1.roomState === 'ended' && s2.roomState === 'ended' && s1.card === 'results' && s2.card === 'results') break;
    for (const [p, s] of [[A, s1], [B, s2]]) {
      if (!s.game) continue;
      if (s.phase === 'play' && s.rstate === 'ready') { const r = await p.eval('window.__bot()'); if (r === 'shot') shotsTaken[p.name]++; }
      if (s.phase === 'board' && s.card === 'board') {
        if (p === A && s.hole === 0 && boards === 0) { boards++; await A.shot('a-board'); await B.shot('b-board'); }
        await p.click('.net-card [data-a=next]');
      }
    }
    if (!sawGhostMove) sawGhostMove = await A.eval(`[...(window.__skyputt.round?.peers?.values() || [])].some(g => g.ball.playing)`);
    if (sawGhostMove && !await A.eval('window.__shotGhost || false')) { await A.eval('window.__shotGhost = true'); await A.shot('a-ghosts'); await B.shot('b-ghosts'); }
    // Bob reloads in the middle of hole 2 and comes back through the Online screen
    if (!rejoined && s2.hole === 1 && s2.phase === 'play') {
      rejoined = true;
      console.log('  bob reloads mid-round…');
      await B.c.send('Page.reload', { ignoreCache: true });
      await sleep(500);
      await B.waitFor('window.__booted === true', 40000);
      await B.click('#t-online');
      await B.waitFor('!!window.__skyputt.online.game && !!window.__skyputt.round', 20000);
      await B.eval(BOT);
      const sb = await state(B);
      check(sb.code === code && sb.you === 1 && sb.roomState === 'playing', `bob rejoined room ${sb.code} on hole ${sb.hole + 1}`);
      await sleep(800);
      await B.shot('b-rejoined');
    }
    await sleep(350);
  }
  const [e1, e2] = await Promise.all([state(A), state(B)]);
  check(e1.card === 'results' && e2.card === 'results', `both reached the results (${nHoles} holes)`);
  check(shotsTaken.alice > 0 && shotsTaken.bob > 0, `both putted (alice ${shotsTaken.alice}, bob ${shotsTaken.bob} shots)`);
  check(sawGhostMove, 'other balls replayed as ghosts');
  check(rejoined, 'reload + rejoin exercised');
  const totals = await A.eval(`window.__skyputt.online.game.room.seats.map(s => s.name + ' ' + s.total + ' [' + s.scores.join(',') + ']')`);
  console.log('  results:', totals.join(' · '));
  const totB = await B.eval(`window.__skyputt.online.game.room.seats.map(s => s.total).join()`);
  check(totB === (await A.eval(`window.__skyputt.online.game.room.seats.map(s => s.total).join()`)), 'both see the same totals');
  await A.shot('a-results'); await B.shot('b-results');

  // Play again → both back in the lobby; then leave
  await A.click('.net-card [data-a=again]');
  await Promise.all([A.waitFor(`window.__skyputt.online.view === 'lobby'`), B.waitFor(`window.__skyputt.online.view === 'lobby'`)]);
  check(true, 'play again → both back in the lobby');
  await B.click('[data-a=leave]');
  await A.waitFor(`window.__skyputt.online.net.room.seats.length === 1`);
  check(true, 'bob left, alice sees one seat');
  await A.shot('a-lobby-after');

  // Quick play: Alice leaves and taps Quick play → a public room that starts on a timer with 3 ghost AIs
  await A.click('[data-a=leave]');
  await A.waitFor(`window.__skyputt.online.view === 'home'`);
  await A.click('[data-a=quick]');
  await A.waitFor(`window.__skyputt.online.view === 'lobby' && window.__skyputt.online.net.room?.quick === true`);
  await sleep(600);
  await A.shot('a-quick-lobby');
  await A.waitFor('!!window.__skyputt.online.game && !!window.__skyputt.round', 40000);
  const q = await state(A);
  check(q.seats === 4, `quick play started with ${q.seats} seats (1 player + 3 ghost AIs)`);
  await sleep(4000);
  await A.shot('a-quick-play');
  await A.eval(`window.__skyputt.online.game.leave()`);
  await A.waitFor(`window.__skyputt.online.view === 'home'`);

  // Landscape phone: title + online home fit
  await B.size(844, 390, true);
  await B.click('[data-a=back]');
  await B.waitFor(`window.__skyputt.online.view === null`);
  await sleep(800);
  await B.shot('b-title-landscape-phone');
  await B.click('#t-online');
  await B.waitFor(`window.__skyputt.online.view === 'home'`);
  await sleep(600);
  await B.shot('b-home-landscape-phone');

  await b1.b.send('Target.closeTarget', { targetId: A.targetId }).catch(() => {});
  await b2.b.send('Target.closeTarget', { targetId: B.targetId }).catch(() => {});
  b1.ws.close(); b2.ws.close();
}

main().then(() => {
  if (errors.length) { console.log('\nconsole errors:'); errors.forEach(e => console.log('  ' + e)); }
  console.log(fails || errors.length ? `\nFAILED (${fails} checks, ${errors.length} errors)` : '\nALL PASS');
  process.exit(fails || errors.length ? 1 : 0);
}).catch(e => { console.error(e); if (errors.length) errors.forEach(x => console.log('  ' + x)); process.exit(1); });
