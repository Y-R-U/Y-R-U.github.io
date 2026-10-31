#!/usr/bin/env node
// Online agent end-to-end test: two real browsers play each other through the online UI.
//
//   LIMITS=1 tools/server_run.sh --bg            # local server :8094, dev auth, fake allowance
//   ~/.claude/bin/cdp start --port 9514 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   ~/.claude/bin/cdp start --port 9515 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   node tools/online_cdp.mjs [all|quick|friend|disconnect|allowance] [--out=DIR] [--shots=0]
//
// Players get fresh dev uids per run (A = a BR8T Pass account, B = signed in 5/day, G = a guest 2/day),
// so the daily allowance never leaks between runs. Exits 1 on any failed check or console error.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(3).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const MODE = process.argv[2] || 'all';
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const OUT = args.out || '/tmp/gambit-online';
const SHOTS = args.shots !== '0';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TS = Date.now().toString(36).slice(-5);

class Page {
  constructor(name, port) { this.name = name; this.port = port; this.id = 0; this.pending = new Map(); this.errors = []; }
  async open() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
    let page = list.find(t => t.type === 'page');
    if (!page) page = await (await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' })).json();
    this.target = page.id;
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
      const P = m.params || {};
      if (m.method === 'Runtime.consoleAPICalled' && (P.type === 'error' || P.type === 'assert')) this.err('console.error: ' + P.args.map(a => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.consoleAPICalled' && P.type === 'warning' && /^\[gambit\]/.test(String(P.args[0]?.value || '')) && !/account layer/.test(P.args[0].value)) this.err('warning: ' + P.args.map(a => a.value).join(' '));
      if (m.method === 'Runtime.exceptionThrown') this.err('exception: ' + (P.exceptionDetails.exception?.description || P.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && P.entry.level === 'error' && !this.allowNet(P.entry)) this.err('log: ' + P.entry.text + ' ' + (P.entry.url || ''));
    };
    await this.send('Page.navigate', { url: 'about:blank' }); await sleep(300);   // drop the last run's page + its console backlog
    for (const d of ['Runtime', 'Log', 'Page', 'Network']) await this.send(`${d}.enable`);
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
  }
  // a real disconnect: close the tab (navigating away can park the page, socket and all, in the bfcache)
  async closeTab() {
    const old = this.target;
    await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' });
    try { this.ws.close(); } catch { /* ignore */ }
    await fetch(`http://127.0.0.1:${this.port}/json/close/${old}`);
    await sleep(300);
    this.pending.clear();
    await this.open();
  }
  allowNet(e) { return this.quietNet && /ERR_|WebSocket/.test(e.text || ''); }
  err(s) { this.errors.push(s); console.log(`  [${this.name}] ${s}`); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name} eval: ` + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + `\n  in: ${expr.slice(0, 120)}`);
    return r.result.value;
  }
  async size(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1, mobile: w < 500 }); await this.send('Emulation.setTouchEmulationEnabled', { enabled: w < 500 }); }
  async go(url) { await this.send('Page.navigate', { url }); await this.waitFor('window.__booted === true', 20000); }
  async hash(hh) {
    await this.eval(`location.hash = ${JSON.stringify(hh)}`); await sleep(150);
    if (hh === '#/online') {   // the home remembers its tab: go back to Play
      await this.waitFor('document.querySelector(".ol-tabs")', 15000, 'online home');
      await this.eval(`document.querySelector('.ol-tabs a[data-tab=play]').click()`);
    }
  }
  async waitFor(expr, ms = 15000, what = expr) {
    const t = Date.now();
    while (Date.now() - t < ms) { try { if (await this.eval(`!!(${expr})`)) return true; } catch { /* page loading */ } await sleep(120); }
    throw new Error(`${this.name}: timed out waiting for ${what}`);
  }
  click(sel) { return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no element ${sel.replace(/'/g, '')}'); e.click(); return true; })()`); }
  async shot(file) {
    if (!SHOTS) return;
    await sleep(350);
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${file}.png`, Buffer.from(r.data, 'base64'));
    console.log(`  shot ${OUT}/${file}.png`);
  }
  T() { return this.eval('window.__gambitOnlineTest && (() => { const t = window.__gambitOnlineTest(); return t && {ready:t.ready,id:t.id,you:t.you,myTurn:t.myTurn,over:t.over,plies:t.plies,srvPlies:t.srvPlies,result:t.result,drawOffer:t.drawOffer,opponentGone:t.opponentGone,fen:t.fen}; })()'); }
}

let fails = 0;
function check(ok, msg) { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; }
const url = (uid, name, extra = '') => `${BASE}?nocloud&devuid=${uid}&devname=${encodeURIComponent(name)}${extra}`;

// both players reach the game screen of the same game
async function bothInGame(A, B) {
  await A.waitFor('window.__gambitOnlineTest && window.__gambitOnlineTest() && window.__gambitOnlineTest().ready', 20000, 'A in game');
  await B.waitFor('window.__gambitOnlineTest && window.__gambitOnlineTest() && window.__gambitOnlineTest().ready', 20000, 'B in game');
  const [a, b] = [await A.T(), await B.T()];
  check(a.id === b.id && a.you !== b.you, `paired into one game (${a.id}), A=${a.you} B=${b.you}`);
  return a.you === 'w' ? [A, B] : [B, A];
}
// play uci moves alternately (white first), waiting for each to land on both sides
async function playMoves(W, Bk, moves, { from = 0 } = {}) {
  for (let i = 0; i < moves.length; i++) {
    const P = (from + i) % 2 === 0 ? W : Bk, Q = P === W ? Bk : W;
    await P.waitFor('window.__gambitOnlineTest().myTurn', 15000, `${P.name} turn for ${moves[i]}`);
    const ok = await P.eval(`window.__gambitOnlineTest().play(${JSON.stringify(moves[i])})`);
    if (!ok) throw new Error(`${P.name}: move ${moves[i]} refused locally`);
    const n = from + i + 1;
    await Q.waitFor(`window.__gambitOnlineTest().plies >= ${n}`, 15000, `${Q.name} sees ply ${n}`);
    await P.waitFor(`window.__gambitOnlineTest().srvPlies >= ${n}`, 15000, `${P.name} server ply ${n}`);
  }
}
async function waitOver(P) { await P.waitFor('window.__gambitOnlineTest().over && document.querySelector(".results")', 15000, `${P.name} results`); return (await P.T()).result; }
const closeSheets = P => P.eval(`document.querySelectorAll('.scrim').forEach(s => s.remove()); true`);

// ---------------------------------------------------------------- scenarios
async function quick(A, B) {
  console.log('\n== quick match + mate');
  await A.go(url(`pass${TS}`, 'Alice Pass', '&devsigned=1') + '#/online');
  await B.go(url(`bob${TS}`, 'Bob', '&devsigned=1') + '#/online');
  await A.waitFor('document.querySelector(".ol-tc")', 15000, 'A online home');
  await B.waitFor('document.querySelector(".ol-tc")', 15000, 'B online home');
  await A.shot('home_play_' + A.tag);
  await A.click('.ol-tc[data-tc="5+0"]');
  await A.waitFor('document.querySelector(".ol-radar")', 5000, 'A seeking');
  await sleep(900);
  await A.shot('seek_' + A.tag);
  await B.waitFor('document.querySelector(\'.ol-tc[data-tc="5+0"] .ol-seekn\')', 5000, 'B sees 1 waiting on 5+0');
  check(true, 'lobby seeking count shows on the quick-match chip');
  await B.click('.ol-tc[data-tc="5+0"]');
  await A.waitFor('document.querySelector(".ol-found")', 8000, 'A opponent found');
  await A.shot('found_' + A.tag);
  check(/Bob/.test(await A.eval('document.querySelector(".ol-found").textContent')), 'found card shows the opponent name');
  const [W, Bk] = await bothInGame(A, B);
  await sleep(600);
  await W.shot('game_start_' + W.tag);
  // optimistic move refused by the server -> rollback
  await W.waitFor('window.__gambitOnlineTest().myTurn', 8000);
  const mid = await W.eval('(() => { window.__gambitOnlineTest().playRefused(); return window.__gambitOnlineTest().plies; })()');
  await W.waitFor('window.__gambitOnlineTest().plies === 0 && window.__gambitOnlineTest().myTurn', 8000, 'rollback to ply 0');
  check(mid === 1, `refused move was shown optimistically (plies ${mid}) then rolled back to 0`);
  await playMoves(W, Bk, ['f2f3', 'e7e5', 'g2g4']);
  await sleep(400);
  await Bk.shot('game_mid_' + Bk.tag);
  await playMoves(W, Bk, ['d8h4'], { from: 3 });
  const rw = await waitOver(W), rb = await waitOver(Bk);
  check(rw.result === '0-1' && rw.reason === 'checkmate' && rw.outcome === 'loss' && rb.outcome === 'win', `Fool's mate: ${rw.result} ${rw.reason}`);
  check(!!(rb.ratings && rb.ratings[(await Bk.T()).you]), 'rated result carries rating change');
  await sleep(800);
  await Bk.shot('results_win_' + Bk.tag);
  await W.shot('results_loss_' + W.tag);
  await closeSheets(W); await closeSheets(Bk);
}

async function friend(A, B) {
  console.log('\n== private room by code + draw + rematch + resign');
  await A.hash('#/online');
  await A.waitFor('document.querySelector("[data-act=friend]")');
  await A.click('[data-act=friend]');
  await A.waitFor('document.querySelector(".ol-create")');
  await A.click('.ol-create [data-ctc="10+0"]');
  await A.shot('create_sheet_' + A.tag);
  await A.click('.ol-create [data-act=go]');
  await A.waitFor('document.querySelector(".ol-code-txt")', 8000, 'room code');
  const code = await A.eval('document.querySelector(".ol-code-txt").textContent');
  const link = await A.eval('document.querySelector(".ol-link input").value');
  check(/^[A-Z0-9]{4,8}$/.test(code) && link.endsWith('#/online/join/' + code), `room code ${code}, link ${link}`);
  await A.shot('room_' + A.tag);
  await B.hash('#/online/join/' + code.toLowerCase());
  await B.waitFor('document.querySelector("[data-act=join]")', 8000, 'join preview');
  await B.shot('join_' + B.tag);
  await B.click('[data-act=join]');
  const [W, Bk] = await bothInGame(A, B);
  await playMoves(W, Bk, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  await W.click('[data-act=draw]');
  await Bk.waitFor('document.querySelector(".ol-ban.offer [data-act=accept]")', 8000, 'draw offer banner');
  await sleep(300);
  await Bk.shot('draw_offer_' + Bk.tag);
  check((await W.eval('document.querySelector("[data-act=draw]").disabled')), 'offerer\'s Draw button shows Offered');
  await Bk.click('.ol-ban.offer [data-act=accept]');
  const r = await waitOver(W); await waitOver(Bk);
  check(r.result === '1/2-1/2' && r.reason === 'agreement', `draw by agreement: ${r.result} ${r.reason}`);
  await Bk.shot('results_draw_' + Bk.tag);
  // rematch: A offers from the results sheet, B accepts
  const gid = (await W.T()).id;
  await A.click('.results [data-act=rematch]');
  await B.waitFor('/Accept rematch/.test(document.querySelector(".results [data-act=rematch]")?.textContent || "")', 8000, 'B sees Accept rematch');
  await B.click('.results [data-act=rematch]');
  await A.waitFor(`window.__gambitOnlineTest() && window.__gambitOnlineTest().id !== ${JSON.stringify(gid)} && window.__gambitOnlineTest().ready`, 10000, 'A in rematch');
  const [W2, B2] = await bothInGame(A, B);
  check(W2 === Bk, 'rematch swapped colours');
  await playMoves(W2, B2, ['d2d4', 'd7d5']);
  // resign through the button + confirm dialog
  await B2.click('[data-act=resign]');
  await B2.waitFor('document.querySelector(".dialog [data-v=\'1\']")');
  await B2.shot('resign_confirm_' + B2.tag);
  await B2.click('.dialog [data-v="1"]');
  const r2 = await waitOver(W2);
  check(r2.reason === 'resign' && r2.outcome === 'win', `resign: ${r2.result} ${r2.reason}`);
  await closeSheets(A); await closeSheets(B);
}

async function disconnect(A, B) {
  console.log('\n== disconnect + resume after reload + claim');
  await A.hash('#/online'); await B.hash('#/online');
  await A.waitFor('document.querySelector(".ol-tc")'); await B.waitFor('document.querySelector(".ol-tc")');
  await A.click('.ol-tc[data-tc="3+2"]'); await sleep(500); await B.click('.ol-tc[data-tc="3+2"]');
  const [W, Bk] = await bothInGame(A, B);
  await playMoves(W, Bk, ['e2e4', 'c7c5', 'g1f3']);
  const gid = (await Bk.T()).id;
  // Bk drops off (page gone), W sees the banner and countdown
  await Bk.closeTab();
  await W.waitFor('document.querySelector(".ol-ban.gone")', 10000, 'opponent gone banner');
  await sleep(500);
  await W.shot('opp_gone_' + W.tag);
  check(/claim/.test(await W.eval('document.querySelector(".ol-ban.gone").textContent')), 'gone banner offers a claim countdown');
  // Bk comes back by reloading the game URL
  await Bk.size(+(args.w || 360), +(args.h || 740));
  await Bk.go(url(Bk.uid, Bk.dname, Bk.extra) + '#/online/game/' + gid);
  await Bk.waitFor('window.__gambitOnlineTest && window.__gambitOnlineTest() && window.__gambitOnlineTest().ready', 15000, 'resumed game');
  const t = await Bk.T();
  check(t.id === gid && t.plies === 3, `resumed after reload at ply ${t.plies}`);
  await W.waitFor('!document.querySelector(".ol-ban.gone")', 8000, 'banner cleared on return');
  check(true, 'opponent-back clears the banner');
  await playMoves(W, Bk, ['d7d6'], { from: 3 });
  await sleep(300);
  await Bk.shot('resumed_' + Bk.tag);
  // leave again and let the grace run out -> claim the win
  await Bk.closeTab();
  await W.waitFor('document.querySelector(".ol-ban.gone [data-act=claimwin]")', 45000, 'claim buttons after the grace');
  await W.shot('claim_' + W.tag);
  await W.click('.ol-ban.gone [data-act=claimwin]');
  const r = await waitOver(W);
  check(r.reason === 'abandoned' && r.outcome === 'win', `claimed: ${r.result} ${r.reason}`);
  await W.shot('results_claim_' + W.tag);
  await closeSheets(W);
  await Bk.size(+(args.w || 360), +(args.h || 740));
  await Bk.go(url(Bk.uid, Bk.dname, Bk.extra) + '#/online');
}

async function allowanceRun(A, G) {
  console.log('\n== guest allowance runs out (2/day)');
  await G.go(url(`guest${TS}`, 'Gus') + '#/online');
  await G.waitFor('document.querySelector(".ol-allow")', 15000, 'allowance chip');
  check(/2 of 2/.test(await G.eval('document.querySelector(".ol-allow").textContent')), 'guest starts with 2 of 2');
  check(!!(await G.eval('document.querySelector(".ol-allow [data-act=signin]")')), 'guest chip offers sign in for 5 a day');
  for (let i = 0; i < 2; i++) {
    await A.hash('#/online'); await G.hash('#/online');
    await A.waitFor('document.querySelector(".ol-tc")'); await G.waitFor('document.querySelector(".ol-tc")');
    await A.click('.ol-tc[data-tc="1+0"]'); await sleep(400); await G.click('.ol-tc[data-tc="1+0"]');
    const [W, Bk] = await bothInGame(A, G);
    await playMoves(W, Bk, ['e2e4', 'e7e5']);
    await A.click('[data-act=resign]'); await A.waitFor('document.querySelector(".dialog [data-v=\'1\']")'); await A.click('.dialog [data-v="1"]');
    await waitOver(A); await waitOver(G);
    await closeSheets(A); await closeSheets(G);
  }
  await G.hash('#/online');
  await G.waitFor('document.querySelector(".ol-allow.out")', 8000, 'allowance shows out');
  check(/0 of 2/.test(await G.eval('document.querySelector(".ol-allow").textContent')), 'guest at 0 of 2 after two games');
  await G.shot('home_out_' + G.tag);
  await G.click('.ol-tc[data-tc="5+0"]');
  await G.waitFor('document.querySelector(".ol-out")', 5000, 'out-of-games sheet');
  check(/Sign in for 5/.test(await G.eval('document.querySelector(".ol-out").textContent')), 'out sheet: sign-in offer');
  await sleep(300);
  await G.shot('out_sheet_' + G.tag);
  await closeSheets(G);
  // server-side gate too: create a room bypassing the UI guard
  const code = await G.eval(`import('./js/app/net.js').then(m => m.net.createRoom({tc:'5+0'}).then(() => 'created', e => e.code))`);
  check(code === 'no_games_left', `server refuses a room with ${code}`);
}

async function extras(A, B) {
  console.log('\n== abort before the first moves + an Unlimited game');
  await A.hash('#/online'); await B.hash('#/online');
  await A.click('.ol-tc[data-tc="10+5"]'); await sleep(400); await B.click('.ol-tc[data-tc="10+5"]');
  const [W, Bk] = await bothInGame(A, B);
  await W.waitFor('document.querySelector(".ol-ban.first")', 5000, 'first-move banner');
  await W.shot('first_move_' + W.tag);
  check(/Abort/.test(await Bk.eval('document.querySelector("[data-act=resign]").textContent')), 'Abort button before the first moves');
  await Bk.click('[data-act=resign]'); await Bk.waitFor('document.querySelector(".dialog [data-v=\'1\']")'); await Bk.click('.dialog [data-v="1"]');
  const r = await waitOver(W);
  check(r.reason === 'aborted' && r.outcome === 'aborted', `aborted: ${r.result} ${r.reason}`);
  await W.shot('results_abort_' + W.tag);
  await closeSheets(A); await closeSheets(B);
  // Unlimited through a private room
  await A.hash('#/online');
  await A.click('[data-act=friend]'); await A.waitFor('document.querySelector(".ol-create")');
  await A.click('.ol-create [data-ctc="unlimited"]'); await A.click('.ol-create [data-act=go]');
  await A.waitFor('document.querySelector(".ol-code-txt")', 8000, 'room code');
  const code = await A.eval('document.querySelector(".ol-code-txt").textContent');
  await B.hash('#/online/join/' + code); await B.waitFor('document.querySelector("[data-act=join]")'); await B.click('[data-act=join]');
  const [W2, B2] = await bothInGame(A, B);
  await playMoves(W2, B2, ['e2e4', 'e7e5', 'd2d4']);
  const clk = await B2.eval('document.querySelector(".bar-bottom .clock").textContent');
  check(/\dd \d+h/.test(clk), `Unlimited shows days left to move (${clk})`);
  await B2.shot('unlimited_' + B2.tag);
  await B2.click('[data-act=resign]'); await B2.waitFor('document.querySelector(".dialog [data-v=\'1\']")'); await B2.click('.dialog [data-v="1"]');
  await waitOver(W2); await closeSheets(A); await closeSheets(B);
}

async function lobbyShots(A, B) {
  console.log('\n== lobby + leaderboard');
  await A.hash('#/online');
  await A.waitFor('document.querySelector("[data-act=friend]")');
  await A.eval(`document.querySelector('.ol-tabs a[data-tab=lobby]').click()`);
  await A.click('[data-act=create]');
  await A.waitFor('document.querySelector(".ol-create")');
  await A.click('.ol-create [data-ctc="3+2"]');
  await A.click('.ol-create [data-act=go]');
  await A.waitFor('document.querySelector(".ol-code-txt")', 8000, 'public room up');
  await B.hash('#/online');
  await B.waitFor('document.querySelector(".ol-tabs")');
  await B.eval(`document.querySelector('.ol-tabs a[data-tab=lobby]').click()`);
  await B.waitFor('document.querySelector(".ol-rooms [data-join]")', 8000, 'room in lobby');
  check(true, 'public room appears in the live lobby');
  await B.shot('lobby_' + B.tag);
  await B.eval(`document.querySelector('.ol-tabs a[data-tab=leaders]').click()`);
  await B.waitFor('!document.querySelector(".ol-tab .boot-spin")', 8000);
  await B.shot('leaders_' + B.tag);
  await A.hash('#/online');   // closes the room
  await B.eval(`document.querySelector('.ol-tabs a[data-tab=play]').click()`);
}

// ---------------------------------------------------------------- main
const A = new Page('A', 9514), B = new Page('B', 9515);
await A.open(); await B.open();
const W = +(args.w || 360), H = +(args.h || 740);
for (const P of [A, B]) { await P.size(W, H); P.tag = `${W}`; }
A.uid = `pass${TS}`; A.dname = 'Alice Pass'; A.extra = '&devsigned=1';
B.uid = `bob${TS}`; B.dname = 'Bob'; B.extra = '&devsigned=1';
try {
  if (['all', 'quick'].includes(MODE)) await quick(A, B);
  else { await A.go(url(A.uid, A.dname, A.extra) + '#/online'); await B.go(url(B.uid, B.dname, B.extra) + '#/online'); }
  if (['all', 'friend'].includes(MODE)) await friend(A, B);
  if (['all', 'lobby'].includes(MODE)) await lobbyShots(A, B);
  if (['all', 'extras'].includes(MODE)) await extras(A, B);
  if (['all', 'disconnect'].includes(MODE)) await disconnect(A, B);
  if (['all', 'allowance'].includes(MODE)) { B.uid = `guest${TS}`; B.dname = 'Gus'; B.extra = ''; await allowanceRun(A, B); }
} catch (e) { console.log('FAIL', e.message); fails++; }
const errs = [...A.errors, ...B.errors];
check(errs.length === 0, `no console errors (${errs.length})`);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
