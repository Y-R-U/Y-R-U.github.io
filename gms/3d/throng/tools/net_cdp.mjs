// node tools/net_cdp.mjs --cdp=9284 --cdp2=9285 [--static=8764] [--server=18090] [--shots=DIR] [--break=sync|rejoin|hidden] [--mode=teams|koth|lcs|infection] [--quick]
// Two real headless Chrome tabs (one per browser = separate players) play one online match:
// create room → join by code (share link) → ready → start → same crowds on both → host tab closed →
// the other tab carries on → results. Starts its own Go server and static server and stops them.
// Needs two Chromes (one per player, so each tab is in front and really renders):
//   ~/.claude/bin/cdp start --port 9284 -- --use-angle=metal; ~/.claude/bin/cdp start --port 9285 -- --use-angle=metal
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../js/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, '../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const CDP = +(args.cdp || 9284), CDP2 = +(args.cdp2 || CDP + 1), SPORT = +(args.static || 8764), NPORT = +(args.server || 18090);
const SHOTS = args.shots || join(tmpdir(), 'throng-net-shots');
const BREAK = args.break || '';
const MODE = args.mode && args.mode !== 'classic' ? args.mode : '';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failures.push(m); };

// ---------------------------------------------------------------- servers
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.wasm': 'application/wasm' };
const stat = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(req.url.split('?')[0]));
  const f = join(SITE, p);
  if (!f.startsWith(SITE)) { res.writeHead(403); return res.end(); }
  fs.readFile(f.endsWith('/') ? f + 'index.html' : f, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(SPORT, '127.0.0.1');
const tmp = fs.mkdtempSync(join(tmpdir(), 'throng-cdp-'));
const bin = join(tmp, 'throng');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(ROOT, 'server'), env: { ...process.env, CGO_ENABLED: '0' }, stdio: 'inherit' });
const srv = spawn(bin, [], { env: { ...process.env, THRONG_ADDR: '127.0.0.1:' + NPORT, THRONG_DATA: join(tmp, 'data'), THRONG_ORIGINS: `http://127.0.0.1:${SPORT}` }, stdio: 'ignore' });
await sleep(700);
const BASE = `http://127.0.0.1:${SPORT}/gms/3d/throng/index.html`;
const NET = `net=127.0.0.1:${NPORT}`;

// ---------------------------------------------------------------- CDP
async function rpc(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map(), logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) logs.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push('log: ' + msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
  };
  const send = (method, params = {}, ms = 20000) => new Promise((res, rej) => {
    const i = ++id;
    const t = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout: ' + method)); }, ms);
    pending.set(i, (v) => { clearTimeout(t); res(v); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { ws, send, logs };
}
const browsers = {};
for (const port of [CDP, CDP2]) browsers[port] = await rpc((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl);

async function tab(name, port) {
  const browser = browsers[port];
  const ctx = (await browser.send('Target.createBrowserContext')).result.browserContextId;
  const tid = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: ctx })).result.targetId;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const t = list.find((x) => x.id === tid);
  const c = await rpc(t.webSocketDebuggerUrl);
  const ev = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(name + ' eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('Log.enable');
  await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await c.send('Page.bringToFront');
  const T = {
    name, ctx, tid, ev, logs: c.logs, send: c.send, browser,
    async size(w, h) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 1000 ? 2 : 1, mobile: w < 1000 });
      await c.send('Emulation.setTouchEmulationEnabled', { enabled: w < 1000, maxTouchPoints: 5 });
      await sleep(400);
    },
    async go(url) {
      await c.send('Page.navigate', { url });
      for (let i = 0; i < 150; i++) { if (await ev('!!(window.__game && window.__game.ready)').catch(() => false)) break; await sleep(200); }
      await sleep(600);
    },
    async rect(sel) {
      return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, vis: r.width > 0 && !e.closest('.hidden') }; })()`);
    },
    async tap(sel) {
      await c.send('Page.bringToFront');
      const r = await T.rect(sel);
      if (!r || !r.vis) throw new Error(`${name}: not visible ${sel}`);
      const top = await ev(`(() => { const e = document.elementFromPoint(${r.x}, ${r.y}); const t = document.querySelector(${JSON.stringify(sel)}); return t.contains(e) ? 'ok' : (e ? String(e.className || e.tagName) : 'none'); })()`);
      if (top !== 'ok') throw new Error(`${name}: ${sel} covered by ${top}`);
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
      await sleep(40);
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(250);
    },
    async type(sel, text) {
      await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select && e.select(); })()`);
      await c.send('Input.insertText', { text });
      await ev(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new Event('change', { bubbles: true }))`);
    },
    async drag(x0, y0, x1, y1, ms = 900) {
      await c.send('Page.bringToFront');
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 2 }] });
      for (let i = 1; i <= 12; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 12, y: y0 + (y1 - y0) * i / 12, id: 2 }] }); await sleep(ms / 12); }
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async shot(file) {
      await c.send('Page.bringToFront');
      await sleep(150);
      const s = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(join(SHOTS, file + '.png'), Buffer.from(s.result.data, 'base64'));
    },
    async errors() { return (await ev('(window.__game && window.__game.errors || []).concat(window.__bootErrors || [])')).concat(c.logs); },
    async waitFor(expr, ms = 15000, what = expr) {
      for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev(expr).catch(() => false)) return true; await sleep(150); }
      throw new Error(`${name}: timed out: ${what}`);
    },
    // Authoritative counts per tick (host: the sim; guest: its latest snapshot), every 30 ticks.
    sampler: () => ev(`(() => { window.__samples = {}; setInterval(() => { const m = __game.online && __game.online.match; if (!m) return;
      const st = m.role === 'host' ? m.sim.state : m.guest.latest; if (st && st.tick % 30 === 0 && !__samples[st.tick]) {
        const md = m.role === 'host' ? (st.mode !== 'classic' ? st.crowds.map((c) => (Math.round(c.score * 10) / 10) + '|' + c.horde + '|' + c.out) : []) : (st.mode ? st.mode.crowds.map((c) => c.score + '|' + c.horde + '|' + c.out) : []);
        __samples[st.tick] = st.crowds.map((c) => c.count).concat(md).join(','); } }, 8); return true; })()`),
  };
  return T;
}

let A, B;
try {
  // ------------------------------------------------------------ the online entry, offline handling
  A = await tab('A', CDP); B = await tab('B', CDP2);
  await A.size(390, 844);
  await A.go(`${BASE}?net=127.0.0.1:1`);
  await A.tap('.m-online');
  await A.waitFor(`document.querySelector('.on-status').dataset.tone === 'bad'`, 12000, 'unavailable status');
  const offTxt = await A.ev(`document.querySelector('.on-status span').textContent`);
  check(/not available/.test(offTxt), `unreachable server: the Online sheet says so ("${offTxt.slice(0, 50)}…")`);
  await A.shot('online_unavailable_p');
  await A.tap('.sheet-x');
  await A.tap('.menu .play');
  await A.waitFor(`__game.mode === 'match' || __game.mode === 'lobby'`, 8000, 'ladder Play still works');
  check(true, 'Play (ladder mode) still works with the server unreachable');

  // ------------------------------------------------------------ create → share link → join by code
  await A.go(`${BASE}?${NET}`);
  await A.ev(`(() => { localStorage.clear(); return true; })()`);
  await A.go(`${BASE}?${NET}`);
  await A.tap('.m-online');
  await A.waitFor(`document.querySelector('.on-status').dataset.tone === 'ok'`, 8000, 'online status');
  await A.type('.on-name', 'Alice');
  // Alice wears a cowboy hat, a mascot leader and a star flag: Bob must see them on her crowd.
  await A.ev(`(() => { const s = __game.save; Object.assign(s.equip, { hat: 'cowboy', leader: 'mascot', flag: 'star', trail: 'confetti', ring: 'flame' }); __game.app.persist(); return true; })()`);
  await A.shot('online_sheet_p');
  await A.tap('.on-create');
  await A.waitFor(`__game.mode === 'olobby' && !!document.querySelector('.ol-code b').textContent`, 8000, 'room lobby');
  const code = await A.ev(`document.querySelector('.ol-code b').textContent`);
  const link = await A.ev(`__game.net.shareLink(${JSON.stringify(code)})`);
  check(/^[A-Z2-9]{6}$/.test(code) && link.includes('?room=' + code), `room ${code}, share link ${link}`);
  await A.shot('room_host_p');

  await B.size(844, 390);
  await B.go(link);
  await B.waitFor(`!!document.querySelector('.sh-online .on-code')`, 8000, 'join sheet from the link');
  check(await B.ev(`document.querySelector('.on-code').value`) === code, 'the share link opens the Online sheet with the code filled in');
  await B.type('.on-name', 'Bob');
  await B.shot('online_join_l');
  await B.tap('.on-go');
  await B.waitFor(`__game.mode === 'olobby'`, 8000, 'B in the lobby');
  await A.waitFor(`document.querySelectorAll('.ol-list .slot:not(.ol-bots)').length === 2`, 5000, 'A sees B');
  check(true, 'host lobby lists both players');
  await B.tap('.ol-ready');
  await A.waitFor(`/1\\/1 ready/.test(document.querySelector('.ol-start').textContent)`, 5000, 'ready shown to host');
  check(true, "guest's Ready shows on the host's Start button");
  await B.shot('room_guest_l');
  await A.shot('room_host_ready_p');
  await A.size(1440, 900); await A.shot('room_host_d'); await A.size(844, 390); await A.shot('room_host_l'); await A.size(390, 844);

  // ------------------------------------------------------------ start → same crowds
  await A.sampler(); await B.sampler();
  if (MODE) {
    await A.tap(`.olm-strip [data-mode="${MODE}"]`);
    check(await A.ev('__game.net.roomMode') === MODE && await A.ev(`document.querySelector('.olm-strip [data-mode="${MODE}"]').classList.contains('on')`), `host picked ${MODE} in the room lobby by touch`);
    const want = CONFIG.MODES[MODE].name;
    await B.waitFor(`document.querySelector('.olm-strip').classList.contains('hidden') && document.querySelector('.olm-t').textContent.includes(${JSON.stringify(want)})`, 5000, 'guest sees the pick').catch(() => {});
    check(await B.ev(`document.querySelector('.olm-strip').classList.contains('hidden') && document.querySelector('.olm-t').textContent.includes(${JSON.stringify(want)})`), `the guest sees the host's pick ("${await B.ev(`document.querySelector('.olm-t').textContent`)}"), no picker`);
    await B.shot('room_guest_mode_l');
    await A.shot('room_host_mode_p');
  }
  await A.tap('.ol-start');
  await Promise.all([A.waitFor(`__game.mode === 'match' && !!__game.state`, 10000, 'A match'), B.waitFor(`__game.mode === 'match' && !!__game.state`, 10000, 'B match')]);
  const roles = [await A.ev('__game.online.match.role'), await B.ev('__game.online.match.role')];
  check(roles[0] === 'host' && roles[1] === 'guest', `roles ${roles.join('/')}`);
  if (MODE) {
    const ms = [await A.ev('__game.state.mode'), await B.ev('__game.state.mode')];
    check(ms[0] === MODE && ms[1] === MODE, `both tabs play ${MODE} (${ms.join('/')})`);
  }
  console.log(`       visibility A ${await A.ev('document.visibilityState')}, B ${await B.ev('document.visibilityState')}`);
  const meA = await A.ev('__game.online.match.me');
  const cosB = await B.ev(`JSON.stringify(__game.online.match.players[${meA}].cos)`);
  check(/cowboy/.test(cosB) && /mascot/.test(cosB) && /star/.test(cosB), `the guest has the host's cosmetics from the join: ${cosB}`);
  // Look at Alice's crowd from Bob's tab (hats off screen are culled from the count).
  await B.ev(`__game.renderer.setFocus(${meA})`);
  await sleep(2000);
  const rs = await B.ev('(() => { const s = __game.renderer.stats(); return { hats: s.hats, heroes: s.heroes }; })()');
  await B.shot('match_guest_sees_host_cos_l');
  await B.ev(`__game.renderer.setFocus(__game.online.match.me)`);
  check(rs.heroes >= 1 && rs.hats >= 1, `the guest's renderer draws them (hats ${rs.hats}, leader figures ${rs.heroes})`);
  await sleep(6000);
  const bw = await B.rect('#stage');
  const meB = await B.ev('__game.online.match.me');
  const p0 = await B.ev(`(() => { const c = __game.state.crowds[${meB}]; return [c.x, c.z]; })()`);
  await B.drag(bw.x, bw.y, bw.x + 120, bw.y + 10, 1200);
  await sleep(300);
  const p1 = await B.ev(`(() => { const c = __game.state.crowds[${meB}]; return [c.x, c.z]; })()`);
  const pa = await A.ev(`(() => { const c = __game.state.crowds[${meB}]; return [c.x, c.z]; })()`);
  check(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 4, `guest's touch drag moved its crowd ${Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(1)} m`);
  check(Math.hypot(pa[0] - p1[0], pa[1] - p1[1]) < 6, `host sees the guest's crowd where the guest predicts it (${Math.hypot(pa[0] - p1[0], pa[1] - p1[1]).toFixed(2)} m apart)`);
  await sleep(6000);
  // Falsification: the guest's copy of crowd 0's count is off by one in every 3rd snapshot.
  if (BREAK === 'sync') await B.ev(`(() => { const m = __game.online.match; const on = m.onSnap; let k = 0; m.onSnap = (b, n) => { if (b[0] === 1 && ++k % 3 === 0) { b = b.slice(); b[26] ^= 1; } on(b, n); }; return true; })()`);
  await sleep(BREAK === 'sync' ? 9000 : 4000);
  const sA = await A.ev('__samples'), sB = await B.ev('__samples');
  let n = 0, bad = 0;
  for (const t of Object.keys(sA)) if (sB[t]) { n++; if (sA[t] !== sB[t]) bad++; }
  check(n >= 10 && bad === 0, `both tabs saw the same crowd counts${MODE ? ' and mode state' : ''} at ${n} sampled ticks (${bad} differ)`);
  const viewA = await A.ev(`__game.state.crowds.map((c) => c.count).join(',')`), viewB = await B.ev(`__game.state.crowds.map((c) => c.count).join(',')`);
  console.log(`       on screen now  A ${viewA}\n                      B ${viewB} (B is ~120 ms behind)`);
  await A.shot('match_host_p'); await B.shot('match_guest_l');
  const pill = await B.ev(`document.querySelector('.net-pill span').textContent`);
  check(/ms/.test(pill), `in-match ping pill on the guest: "${pill}"`);

  // ------------------------------------------------------------ the guest reloads its page mid-match
  if (!args.quick) {
    const meBefore = await B.ev('__game.online.match.me');
    if (BREAK === 'rejoin') await B.ev(`(() => { sessionStorage.removeItem('throng.live'); return true; })()`);
    await B.send('Page.reload', { ignoreCache: true });
    await sleep(800);
    await B.waitFor('!!(window.__game && window.__game.ready)', 20000, 'B booted after the reload');
    const back = await B.waitFor(`__game.mode === 'match' && !!(__game.online && __game.online.match && __game.online.match.ready)`, 12000, 'B back in its match by itself').catch(() => false);
    const meAfter = back ? await B.ev('__game.online.match.me') : -1;
    check(back && meAfter === meBefore && await B.ev('__game.online.match.role') === 'guest', `after a reload the guest is back on its own crowd without touching anything (${meAfter}, was ${meBefore})`);
    if (back) {
      await B.sampler();
      await sleep(4000);
      const a2 = await A.ev('__samples'), b2 = await B.ev('__samples');
      let n2 = 0, bad2 = 0;
      for (const t of Object.keys(b2)) if (a2[t]) { n2++; if (a2[t] !== b2[t]) bad2++; }
      check(n2 >= 4 && bad2 === 0, `the reloaded guest mirrors the host again (${n2} sampled ticks, ${bad2} differ)`);
      await B.shot('match_guest_reloaded_l');
    }
  }

  // ------------------------------------------------------------ host tab hidden 30 s (phone in a pocket): the room must not freeze
  let H = A, Gt = B;
  if (!args.quick) {
    if (BREAK === 'hidden') await A.ev('(() => { __game.online.handoff = () => {}; return true; })()');
    await A.send('Emulation.setFocusEmulationEnabled', { enabled: false });   // focus emulation keeps a tab "visible"
    const cover = (await A.browser.send('Target.createTarget', { url: 'about:blank', browserContextId: A.ctx, newWindow: false })).result.targetId;
    await A.browser.send('Target.activateTarget', { targetId: cover });
    await sleep(300);
    const vis = await A.ev('document.visibilityState');
    check(vis === 'hidden', `the host tab is really hidden (visibilityState ${vis}; timers throttled by Chrome)`);
    const hidAt = Date.now(), t0b = await B.ev('__game.state.tick');
    // The other player's view: the longest time its shown tick stood still (sampled every 50 ms).
    await B.ev(`(() => { window.__stall = { max: 0, at: performance.now(), tick: -1 }; clearInterval(window.__stallT); window.__stallT = setInterval(() => { const s = __game.state; if (!s) return; const n = performance.now(); if (s.tick !== __stall.tick) { __stall.tick = s.tick; __stall.at = n; } else __stall.max = Math.max(__stall.max, n - __stall.at); }, 50); return true; })()`);
    const took = await B.waitFor(`__game.online.match && __game.online.match.role === 'host'`, 8000, 'B took over').then(() => Date.now() - hidAt).catch(() => -1);
    check(took >= 0, `the guest took over from the hidden host after ${took} ms`);
    await B.ev('(() => { __stall.max = 0; return true; })()');
    // A phone browser suspends a background page outright: freeze the hidden tab for most of the 30 s (not under the break arm).
    await sleep(2000);
    if (BREAK !== 'hidden') await A.send('Page.setWebLifecycleState', { state: 'frozen' });
    const ticks = [];
    for (let k = 0; k < 5; k++) { await sleep(5000); ticks.push(await B.ev('__game.state.tick')); }
    if (BREAK !== 'hidden') await A.send('Page.setWebLifecycleState', { state: 'active' });
    const rates = ticks.map((t, k) => (t - (k ? ticks[k - 1] : t0b)) / 5);
    const stall = await B.ev('__stall.max');
    check(Math.min(...rates.slice(1)) > 24 && stall < 700, `the match kept running for the other player while the host tab was hidden ~30 s (ticks/s ${rates.map((r) => r.toFixed(0)).join(' ')}, longest stall ${stall.toFixed(0)} ms)`);
    await A.browser.send('Target.activateTarget', { targetId: A.tid });
    await A.browser.send('Target.closeTarget', { targetId: cover });
    await A.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await A.send('Page.bringToFront');
    await sleep(2500);
    const roleA = await A.ev('__game.online.match && __game.online.match.role');
    const lagA = (await B.ev('__game.state.tick')) - (await A.ev('__game.state.tick'));
    check(roleA === 'guest' && Math.abs(lagA) < 30, `back in front, the old host follows as a guest (role ${roleA}, ${lagA} ticks behind)`);
    const pauseShown = await A.ev(`!!document.querySelector('.pause:not(.hidden)')`).catch(() => false);
    await A.shot('match_old_host_back_p');
    console.log(`       old host on return: pause sheet ${pauseShown ? 'shown' : 'not shown'}`);
    if (roleA === 'guest') { H = B; Gt = A; }
  }

  // ------------------------------------------------------------ host tab closed → the other carries on
  const tickBefore = await Gt.ev('__game.state.tick');
  await H.browser.send('Target.closeTarget', { targetId: H.tid });
  const closedAt = Date.now();
  await Gt.waitFor(`__game.online.match && __game.online.match.role === 'host'`, 8000, 'promoted after the host tab closed');
  check(true, `the guest tab took over as host ${Date.now() - closedAt} ms after the host tab closed`);
  if (Gt === A) { const t = A; A = B; B = t; }
  await sleep(2500);
  const tickAfter = await B.ev('__game.state.tick');
  check(tickAfter > tickBefore + 40, `the match continues on the new host (tick ${tickBefore} → ${tickAfter})`);
  await B.shot('match_host_changed_l');
  const left = await B.ev('__game.state.timeLeft');
  console.log(`       waiting ${Math.ceil(left)} s for the match to end`);
  await B.waitFor(`__game.mode === 'results'`, (left + 12) * 1000, 'results');
  const note = await B.ev(`document.querySelector('.rw-online') && document.querySelector('.rw-online').textContent`);
  check(!!note, `online results screen: "${note}"`);
  await sleep(2500);
  const note2 = await B.ev(`document.querySelector('.rw-online').textContent`);
  check(/Saved/.test(note2), `result saved to the Online leaderboard: "${note2}"`);
  await B.shot('results_online_l');
  await B.size(390, 844); await B.shot('results_online_p'); await B.size(1440, 900); await B.shot('results_online_d');

  // ------------------------------------------------------------ Online leaderboard tab
  await B.tap('.results .to-menu');
  await B.waitFor(`__game.mode === 'menu'`, 5000, 'menu');
  await B.tap('.m-nav [data-open="ladder"]');
  await B.tap('.ld-tabs [data-t="online"]');
  await B.waitFor(`!!document.querySelector('.ob-list li:not(.gap)')`, 10000, 'board rows').catch(async (e) => {
    console.log('       board says: ' + await B.ev(`document.querySelector('.ld-pane') && document.querySelector('.ld-pane').textContent`));
    console.log('       direct: ' + await (await fetch(`http://127.0.0.1:${NPORT}/gms/3d/throng/api/boards?period=day&kind=best`)).text());
    await B.shot('board_fail');
    throw e;
  });
  const rows = await B.ev(`[...document.querySelectorAll('.ob-list li')].map((l) => l.textContent.trim()).join(' | ')`);
  check(/Bob/.test(rows), `Online board (today, best crowd): ${rows}`);
  await B.shot('board_online_d');
  await B.size(390, 844); await B.shot('board_online_p'); await B.size(844, 390); await B.shot('board_online_l');
  await B.tap('.sheet-x');
  await B.tap('.m-nav [data-open="locker"]');
  await B.tap('.tabs [data-tab="hat"]');
  await B.shot('locker_hats_d');
  await B.size(390, 844); await B.tap('.tabs [data-tab="flag"]'); await B.shot('locker_flags_p');
  await B.size(844, 390); await B.tap('.tabs [data-tab="ring"]'); await B.shot('locker_rings_l');
  await B.tap('.sheet-x');
  await B.tap('.m-online');
  await B.shot('online_sheet_l');
  await B.size(1440, 900); await B.shot('online_sheet_d');

  // The tabs may have swapped roles (B is whichever survived): skip the deliberate unreachable-server probe and the
  // socket a navigation drops into the back-forward cache, on both.
  const probe = (l) => !/net::ERR_CONNECTION_REFUSED|net::ERR_UNSAFE_PORT|127\.0\.0\.1:1\/|Back-Forward Cache/.test(l);
  const errs = (await B.errors()).filter(probe);
  check(errs.length === 0, `tab B console/page errors: ${errs.length ? errs.join(' / ') : 'none'}`);
  const errsA = A.logs.filter(probe);
  check(errsA.length === 0, `tab A console errors (besides the deliberate unreachable-server probe): ${errsA.length ? errsA.join(' / ') : 'none'}`);
} catch (e) {
  check(false, 'harness: ' + (e && e.stack || e));
} finally {
  for (const T of [A, B]) if (T) { try { await T.browser.send('Target.closeTarget', { targetId: T.tid }, 3000); } catch {} try { await T.browser.send('Target.disposeBrowserContext', { browserContextId: T.ctx }, 3000); } catch {} }
  for (const b of Object.values(browsers)) { try { b.ws.close(); } catch {} }
  srv.kill(); stat.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\nscreenshots: ${SHOTS}\n${failures.length ? 'FAIL' : 'PASS'} (${failures.length} failed)${BREAK ? ' break=' + BREAK : ''}`);
process.exit(failures.length ? 1 : 0);
