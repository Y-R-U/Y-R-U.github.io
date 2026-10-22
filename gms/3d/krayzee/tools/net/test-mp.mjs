// Two-window online tests over raw CDP (port 9561) against a local krayzeenet.
//   node tools/net/test-mp.mjs                 sandbox runs (direct, relay, falsify) + the real-game run + its falsification
//   node tools/net/test-mp.mjs --only=sandbox  tools/net/sandbox.html only (O2)
//   node tools/net/test-mp.mjs --only=game     two real game pages (O3): tools/net/gen/ = js/main.js + the ONLINE §15 wiring
//   node tools/net/test-mp.mjs --keep          leave Chrome running
// Serves the repo root itself on :8739. Screenshots: docs/shots/net/.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildGame } from './gen-main.mjs';

const CDP_PORT = 9561, NET_PORT = 8738, WEB_PORT = 8739;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const SITE = `${WEB}/gms/3d/krayzee/tools/net/sandbox.html`;
const NETURL = `ws://127.0.0.1:${NET_PORT}/gms/3d/krayzee/net`;
const CDP = `${process.env.HOME}/.claude/bin/cdp`;
const SERVER = fileURLToPath(new URL('../../server/', import.meta.url));
const SHOTS = fileURLToPath(new URL('../../docs/shots/net/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Own static server for the repo root: the shared python one on :8888 stalled module loads for 30 s under two pages.
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', glb: 'model/gltf-binary', bin: 'application/octet-stream', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', woff2: 'font/woff2', ktx2: 'image/ktx2', wasm: 'application/wasm', txt: 'text/plain' };
const web = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, WEB).pathname);
  if (p.includes('..')) { res.writeHead(400).end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = join(REPO, p);
  let st; try { st = statSync(f); } catch (e) { res.writeHead(404).end(); return; }
  if (st.isDirectory()) { res.writeHead(301, { Location: p + '/' }).end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[p.split('.').pop().toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  createReadStream(f).pipe(res);
}).listen(WEB_PORT, '127.0.0.1');

const bin = join(tmpdir(), 'krayzeenet-mp');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, stdio: 'inherit' });
const srv = spawn(bin, [], { env: { ...process.env, KRAYZEE_ADDR: `127.0.0.1:${NET_PORT}`, KRAYZEE_DEV_AUTH: '1', KRAYZEE_ICE_URL: 'off', KRAYZEE_GRACE_MS: '3000' }, stdio: 'ignore' });
execFileSync(CDP, ['start', '--port', String(CDP_PORT), '--idle', '120', '--max', '900', '--', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-angle=metal'], { stdio: 'inherit' });
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

// Each tab gets its own window: a background tab is hidden, and a hidden host hands off (as it should).
let browser = null;
async function ensureBrowser() {
  if (!browser) {
    const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const wait = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d.result); wait.delete(d.id); } };
    browser = { ws, send: (method, params) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }) };
  }
  return browser;
}
async function newWindow(ctx) {
  await ensureBrowser();
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true, ...(ctx ? { browserContextId: ctx } : {}) });
  return { id: targetId, webSocketDebuggerUrl: `ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}` };
}

async function tab(ctx) {
  const t = await newWindow(ctx);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const { res, rej } = wait.get(d.id); wait.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const until = async (expr, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr).catch(() => false)) return true; await sleep(100); }
    return false;
  };
  const point = async (sel) => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n || n.disabled) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const click = async (p) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  };
  const tap = async (sel) => { const p = await point(sel); if (!p) throw new Error(`no tappable ${sel}`); await click(p); await sleep(200); };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name), Buffer.from(r.data, 'base64')); };
  const close = () => { try { ws.close(); } catch (e) { /* closed */ } return fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`).catch(() => {}); };
  return { send, ev, until, tap, point, click, shot, close, errors, go: (q, base = SITE) => send('Page.navigate', { url: `${base}?${q}` }) };
}

async function run(mode) {
  const fails = [], passes = [];
  const ok = (cond, label, extra = '') => { (cond ? passes : fails).push(label + (cond || !extra ? '' : ` — ${extra}`)); console.log(`${cond ? 'ok  ' : 'FAIL'} [${mode}] ${label}${cond || !extra ? '' : ` — ${extra}`}`); };
  const extra = mode === 'relay' ? '&p2p=0' : '';
  const A = await tab(), B = await tab();
  try {
    await A.go(`net=${encodeURIComponent(NETURL)}&name=Dirk&voices=toff,bubba&rank=king&uid=dirk-${mode}${extra}${mode === 'falsify' ? '&freeze=1' : ''}`);
    await B.go(`net=${encodeURIComponent(NETURL)}&name=Mo&g=f&voices=toff,bubba&uid=mo-${mode}${extra}`);
    ok(await A.until('window.__sb?.net.connected') && await B.until('window.__sb?.net.connected'), 'both tabs reach the room server');

    await A.tap('[data-a="create"]');
    ok(await A.until('!!document.querySelector(".kzn-type[data-type=\\"court\\"][aria-pressed=\\"true\\"]")'), 'create screen shows room types (court default)');
    await A.tap('[data-a="ok"]');
    ok(await A.until('__sb.net.room && document.querySelector(".kzn").dataset.view === "room"'), 'host lands in the room view');
    const code = await A.ev('document.querySelector("[data-s=code]").textContent');
    ok(/^[A-HJ-NP-Z2-9]{6}$/.test(code), 'room code shown', code);

    await B.tap('#kzn-code');
    await B.send('Input.insertText', { text: code.toLowerCase() });
    await B.tap('[data-a="join"]');
    ok(await B.until('__sb.net.room?.members.length === 2') && await A.until('__sb.net.room?.members.length === 2'), 'second tab joins by code');
    const voices = await B.ev('__sb.net.room.members.map(m => m.voice).join()');
    ok(voices === 'toff,bubba', 'first favourite to the host, fallback to the next', voices);
    ok(await B.ev('(() => { const c = document.querySelector(".kzn-voice[data-v=toff]"); return c.disabled && c.dataset.taken === "1" && /Taken by Dirk/.test(c.textContent); })()'), "host's voice card is greyed with the holder's name");
    ok(await B.until('[...document.querySelectorAll(".kzn-players li")].some(li => /Dirk/.test(li.textContent) && li.querySelector(".kzn-crown svg"))'), 'player list shows the host crown, titles and names');

    // Voice conflict: both tap the same free card in the same instant.
    const pa = await A.point('.kzn-voice[data-v=tex]'), pb = await B.point('.kzn-voice[data-v=tex]');
    await Promise.all([A.click(pa), B.click(pb)]);
    await sleep(700);
    const owners = await A.ev('__sb.net.room.members.filter(m => m.voice === "tex").map(m => m.name)');
    ok(owners.length === 1, 'simultaneous voice tap: exactly one winner', JSON.stringify(owners));
    // The loser either lost the race at the server (told who holds it) or its card was already greyed when tapped.
    const L = owners[0] === 'Dirk' ? B : A, win = owners[0];
    const lost = await L.ev('JSON.stringify({ claims: __sb.claims, msg: document.querySelector(".kzn-msg").textContent, card: document.querySelector(".kzn-voice[data-v=tex]").textContent })');
    const lj = JSON.parse(lost), refused = lj.claims.find((c) => c.voice === 'tex' && !c.ok);
    ok(new RegExp(`Taken by ${win}`).test(lj.card) && (!refused || (refused.byName === win && /taken by/i.test(lj.msg))), 'loser is told who holds it', lost);
    if (refused) console.log(`     [${mode}] the tap race reached the server: ${win} won, the other was refused`);
    await A.shot(`lobby-room-${mode}.png`);

    await B.tap('[data-a="ready"]');
    ok(await A.until('__sb.net.room.members.find(m => m.name === "Mo")?.rdy === true'), 'ready tick reaches the host');
    await A.tap('[data-a="start"]');
    ok(await A.until('__sb.flying') && await B.until('__sb.flying'), 'host Start puts both tabs in flight');

    const bId = await B.ev('__sb.net.id'), aId = await A.ev('__sb.net.id');
    await sleep(1800);
    const s1 = await B.ev(`__sb.remotePos(${JSON.stringify(aId)})`), a1 = await A.ev('__sb.localAt()');
    await sleep(1000);
    const s2 = await B.ev(`__sb.remotePos(${JSON.stringify(aId)})`), a2 = await A.ev('__sb.localAt()');
    const moved = s1 && s2 ? Math.hypot(s2.x - s1.x, s2.z - s1.z) : 0;
    const err = s2 ? Math.hypot(s2.x - a2.x, s2.z - a2.z) : 1e9;
    ok(moved > 30, "B sees A's plane move", `moved ${moved.toFixed(1)} m in 1 s`);
    ok(s2?.st === 'interp' && err < 40, "B's view of A tracks A (interpolated, behind by the render delay)", `state ${s2?.st}, ${err.toFixed(1)} m off`);
    const r1 = await A.ev(`__sb.remotePos(${JSON.stringify(bId)})`);
    await sleep(600);
    const r2 = await A.ev(`__sb.remotePos(${JSON.stringify(bId)})`);
    ok(r1 && r2 && Math.hypot(r2.x - r1.x, r2.z - r1.z) > 15, "A sees B's plane move");
    const clk = await Promise.all([A.ev('__sb.net.roomTime()'), B.ev('__sb.net.roomTime()')]);
    ok(Math.abs(clk[0] - clk[1]) < 60, 'room clocks agree', `${Math.round(clk[0] - clk[1])} ms`);
    const links = await B.ev('__sb.net.linkSummary()');
    if (mode === 'relay') ok(links.relayed === 1, 'p2p=0: traffic goes through the relay', JSON.stringify(links));
    else ok(links.relayed === 0, 'WebRTC data channel is up (direct)', JSON.stringify(links));
    ok(await B.ev('__sb.net.claim && true') && await B.ev('(() => { __sb.net.claim("nan"); return true; })()'), 'claim sent in flight');
    await sleep(400);
    ok(await B.ev('__sb.net.me.voice !== "nan"'), 'no voice change while airborne (D5)');
    await A.shot(`sky-${mode}.png`);

    // Host leaves: closing the tab says goodbye, the guest takes over at once.
    const ep = await B.ev('__sb.net.room.epoch');
    await A.close();
    ok(await B.until('__sb.net.isHost && __sb.net.room.members.length === 1', 4000), 'host closes the tab → the guest becomes host');
    ok((await B.ev('__sb.net.room.epoch')) > ep, 'epoch bumped on handoff');
    await B.ev('document.getElementById("toLobby").click()');
    await sleep(300);
    ok(await B.ev('!!document.querySelector(`.kzn-players li[data-id="${__sb.net.id}"] .kzn-crown svg`)'), 'lobby shows the crown on the new host');
    await B.shot(`handoff-${mode}.png`);
    ok(!A.errors.length && !B.errors.length, 'no page errors', [...A.errors, ...B.errors].join(' | '));
  } catch (e) {
    ok(false, 'run threw', e.message);
  } finally {
    await A.close(); await B.close();
  }
  return { fails, passes };
}

// Phone-size screenshots of the lobby screens, and no horizontal overflow at 390 px.
async function phoneShots() {
  const P = await tab();
  await P.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await P.go(`net=${encodeURIComponent(NETURL)}&name=Phone&rank=king&uid=phone`);
  await P.until('window.__sb?.net.connected');
  await sleep(400);
  await P.shot('phone-home.png');
  await P.tap('[data-a="create"]');
  await sleep(300);
  await P.shot('phone-create.png');
  const wide = await P.ev('document.querySelector(".kzn-body").scrollWidth > document.querySelector(".kzn-body").clientWidth + 1');
  await P.tap('[data-a="ok"]');
  await P.until('__sb.net.room');
  await sleep(300);
  await P.shot('phone-room.png');
  const wide2 = await P.ev('document.querySelector(".kzn-body").scrollWidth > document.querySelector(".kzn-body").clientWidth + 1');
  await P.close();
  console.log(`${!wide && !wide2 ? 'ok  ' : 'FAIL'} phone 390 px: lobby has no horizontal overflow`);
  return wide || wide2 ? 1 : 0;
}

// ---------------------------------------------------------------- O3: two real game pages
const GAME = `${WEB}/gms/3d/krayzee/tools/net/gen/index.html`;
const profileFor = (name, g, voice, reg, primary) => JSON.stringify({ name, gender: g, company: `${name} Air`, primary, secondary: '#f4efe6', accent: '#d4a017', voice, registration: reg, favourites: [voice] });
async function gameTab(name, g, voice, reg, primary) {
  const { browserContextId } = await (await ensureBrowser()).send('Target.createBrowserContext', {});
  const T = await tab(browserContextId);
  const seed = `try { if (!localStorage.getItem('krayzee.profile')) { localStorage.setItem('krayzee.profile', ${JSON.stringify(profileFor(name, g, voice, reg, primary))});
    localStorage.setItem('krayzee.coach', '{"done":true,"seen":["goal","stick","release","radio","bank"]}'); } } catch (e) {}`;
  await T.send('Page.addScriptToEvaluateOnNewDocument', { source: seed });
  return T;
}
const near = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 1e9);

async function runGame(mode) {
  const fails = [], passes = [];
  const ok = (cond, label, extra = '') => { (cond ? passes : fails).push(label + (cond || !extra ? '' : ` — ${extra}`)); console.log(`${cond ? 'ok  ' : 'FAIL'} [game${mode === 'falsify' ? '-falsify' : ''}] ${label}${cond || !extra ? '' : ` — ${extra}`}`); };
  const falsify = mode === 'falsify';
  const A = await gameTab('Dirk', 'm', 'toff', 'K-DIRK', '#b3122e'), B = await gameTab('Mo', 'f', 'bubba', 'K-MOMO', '#1f4e8c');
  const q = (uid) => `net=${encodeURIComponent(NETURL)}&uid=${uid}-${mode}&noaccount=1&quality=low&intro=0`;
  try {
    await A.go(q('dirk'), GAME); await B.go(q('mo'), GAME);
    ok(await A.until('window.__krayzeeReady === true', 60000) && await B.until('window.__krayzeeReady === true', 60000), 'both game pages boot');
    await sleep(800);
    for (const T of [A, B]) {
      for (let i = 0; i < 20 && !(await T.ev('!!document.querySelector(".kzn.on")')); i++) { await T.tap('[data-a="online"]').catch(() => {}); await sleep(500); }
      if (!(await T.ev('!!document.querySelector(".kzn.on")'))) {
        await T.shot(`game-fail-online-${mode}-${T === A ? 'a' : 'b'}.png`);
        console.log('     lobby did not open:', await T.ev('JSON.stringify({ k: !!window.__krzNet, kzn: !!document.querySelector(".kzn"), mode: window.__game?.S?.mode, hit: (() => { const b = document.querySelector("[data-a=online]").getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e ? e.tagName + "." + e.className : null; })(), soon: document.querySelector("[data-a=online]").className, pending: performance.getEntriesByType("resource").filter((r) => /net\\//.test(r.name)).map((r) => r.name.split("/").pop() + ":" + Math.round(r.duration)) })'), T.errors.slice(0, 5).join(' | '));
      }
    }
    ok(await A.until('window.__krzNet?.net?.connected', 15000) && await B.until('window.__krzNet?.net?.connected', 15000), 'menu Online opens the lobby and reaches the room server');
    await A.tap('[data-a="create"]'); await A.tap('[data-a="ok"]');
    await A.until('__krzNet.net.room && document.querySelector(".kzn").dataset.view === "room"');
    const code = await A.ev('document.querySelector("[data-s=code]").textContent');
    await B.tap('#kzn-code'); await B.send('Input.insertText', { text: code }); await B.tap('[data-a="join"]');
    ok(await A.until('__krzNet.net.room?.members.length === 2'), 'second game page joins the room by code');
    await A.tap('[data-a="start"]');
    const inPlay = 'window.__game.S.mode === "play" && __game.S.playMode === "online" && __krzNet.session?.attached';
    ok(await A.until(inPlay, 30000) && await B.until(inPlay, 30000), 'host Start puts both pages into an online flight with a session attached');
    const roles = [await A.ev('__krzNet.session.role'), await B.ev('__krzNet.session.role')];
    ok(roles[0] === 'host' && roles[1] === 'follower', 'roles: creator hosts, joiner follows', roles.join());
    const aId = await A.ev('__krzNet.net.id'), bId = await B.ev('__krzNet.net.id');

    // Each sees the other's plane in-world (a rig in the scene, a remote Traffic entry, where the owner says it is)
    const seen = (who) => `(() => { const h = __krzNet.session.state().humans.find((x) => x.id === 'p:${who}'); const e = __game.traffic.list.find((x) => x.ac.id === 'p:${who}');
      return h && e && e.remote && h.inScene ? { x: e.ac.pos.x, z: e.ac.pos.z, st: h.st, mk: e.marker?.kind } : null; })()`;
    ok(await A.until(seen(bId), 15000) && await B.until(seen(aId), 15000), 'each page has the other human as a remote plane rig in its scene');
    await A.ev(`(async () => { const R = await import('/gms/3d/krayzee/js/flight/routes.js'); const e = R.runwayEnd(__game.wiring.activeEnd()); const [x, z] = R.fromRunway(e, 400, 0);
      __game.teleport({ x, z, alt: 120, heading: e.hdg, speedKt: 85, throttle: 0.7 }); return true; })()`);
    await sleep(2500);
    const [bv1, a1] = await Promise.all([B.ev(seen(aId)), A.ev('__game.state().player')]);
    await sleep(1000);
    const [bv2, a2] = await Promise.all([B.ev(seen(aId)), A.ev('__game.state().player')]);
    const moved = near(bv1, bv2), off = near(bv2, a2);
    ok(moved > 25, "B sees A's real plane fly (rig follows the stream)", `moved ${moved.toFixed(1)} m in 1 s`);
    ok(off < 45 && /interp|reckon/.test(bv2?.st || ''), "B's copy of A is where A says it is (render delay only)", `${off.toFixed(1)} m off, state ${bv2?.st}`);
    const [av, bme] = await Promise.all([A.ev(seen(bId)), B.ev('__game.state().player')]);
    ok(near(av, bme) < 25, "A's copy of B sits where B is", `${near(av, bme).toFixed(1)} m`);
    ok(av?.mk === 'player', 'remote humans get a player marker (D12)', av?.mk);

    // Host AI traffic replicated to the follower; the follower spawns none of its own
    ok(await B.until('__krzNet.session.state().ai.filter((a) => a.entered).length > 0', 10000), "host AI traffic appears on B as remote planes");
    const hostAI = await A.ev('__game.traffic.list.filter((e) => !e.player && !e.remote).map((e) => ({ id: e.ac.id, x: e.ac.pos.x, z: e.ac.pos.z }))');
    const bAI = await B.ev('__krzNet.session.state().ai');
    const match = hostAI.filter((h) => { const r = bAI.find((x) => x.id === h.id && x.entered); return r && near(r, h) < 60; }).length;
    ok(hostAI.length > 0 && match >= Math.max(1, hostAI.length - 1), "B's AI copies match the host's AI (id + position)", `${match}/${hostAI.length}`);
    ok(await B.ev('__game.traffic.list.filter((e) => !e.player && !e.remote).length === 0'), 'B runs no local AI (host-authoritative traffic)');
    ok(await A.until(`!!__game.wiring.atc.strip('p:${bId}')`, 5000) && await B.until(`!!__game.wiring.atc.strip('p:${aId}')`, 5000), 'host ATC tracks B; B\'s ATC replica (restored from the host) tracks A');

    // Cut-in: A on a 2.1 km final, B joins inside it from the side (atc-sim's flight cut-in geometry). The host's AI
    // is parked out of the way first (an AI rival on final would be number one instead of A).
    await A.ev('(() => { const t = __krzNet.attract; t.update = () => {}; for (const e of [...t.ai]) if (!e.ac.onGround || e.ap.leg?.kind === "takeoff") t.despawn(e); return true; })()');
    const E = await A.ev(`(async () => { const R = await import('/gms/3d/krayzee/js/flight/routes.js'); const E = __game.wiring.activeEnd(), e = R.runwayEnd(E); const [x, z] = R.fromRunway(e, -2100, 0);
      __game.teleport({ x, z, alt: 160, heading: e.hdg, speedKt: 68, flaps: 1, throttle: 0.4 }); return E; })()`);
    ok(await A.until(`__game.wiring.atc.sequence(${JSON.stringify(E)})[0] === 'player'`, 15000), 'host ATC sequences A number one on final');
    if (falsify) await B.ev('__krzNet.net.toHost = () => {}; true');
    await B.ev(`(async () => { const R = await import('/gms/3d/krayzee/js/flight/routes.js'); const E = ${JSON.stringify(E)}, e = R.runwayEnd(E);
      const [px, pz] = R.fromRunway(e, -1700, -750); __game.teleport({ x: px, z: pz, alt: 130, heading: (e.hdg + 50) % 360, speedKt: 85, throttle: 0.6 });
      const [cx, cz] = R.fromRunway(e, -1000, -250), P = __game.S.player;
      P.ap.setRoute({ name: 'circuits ' + E, legs: [{ kind: 'fly', to: [cx, 75, cz], speed: 80, flaps: 1 / 3 }, { kind: 'approach', end: E }, ...R.circuitRoute(E).legs.slice(-2)], loop: null });
      window.__hold = setInterval(() => { P.ap.lastOverride = P.ac.time; }, 100);
      __game.wiring.atc.grace('player', 0); return true; })()`);
    if (process.argv.includes('--trace')) for (let i = 0; i < 6; i++) {
      await sleep(3000);
      const tb = await B.ev(`(() => { const P = __game.S.player, a = __game.wiring.atc; return JSON.stringify({ p: [P.ac.pos.x|0, P.ac.agl|0, P.ac.pos.z|0, P.ac.heading|0], leg: P.ap.leg?.kind, sub: P.ap.sub, seq: a.sequence(${JSON.stringify(E)}), me: a.strip('player'), ev: a.log.slice(-3).map((e) => e.type + ':' + e.actor) }); })()`);
      const ta = await A.ev(`(() => { const a = __game.wiring.atc, P = __game.S.player; return JSON.stringify({ p: [P.ac.pos.x|0, P.ac.agl|0, P.ac.pos.z|0], seq: a.sequence(${JSON.stringify(E)}), me: a.strip('player'), cmds: Object.keys(a._debug().S.strips.player?.cmds || {}), ev: a.log.slice(-4).map((e) => e.type + ':' + e.actor + '>' + e.victim) }); })()`);
      console.log('  B', tb, '\n  A', ta);
    }
    const cutB = await B.until(`__krzNet.session.state().sentInf.some((m) => m.rule === 'cut_in_final' && m.victim === 'p:${aId}')`, 90000);
    ok(cutB, "B's replica learns of its cut-in on A (own detection or the host's) and reports it", await B.ev('JSON.stringify(__krzNet.session.state().sentInf.map((m) => m.rule))'));
    const hostCut = await A.until(`__krzNet.session.state().infs.some((m) => m.id === 'p:${bId}' && m.rule === 'cut_in_final' && m.ok) && __krzNet.session.state().ledger['p:${bId}']?.acc > 0`, falsify ? 8000 : 15000);
    ok(hostCut, 'the cut-in by B scores on the host (accepted into its ledger)', await A.ev('JSON.stringify({ infs: __krzNet.session.state().infs, ledger: __krzNet.session.state().ledger })'));
    if (falsify) return { fails, passes };
    ok((await B.ev('__game.wiring.game.state().pending')) > 0, "B's own game holds the cut-in PP as pending");
    ok(await A.until(`__game.wiring.atc.log.some((e) => e.type === 'cut_in_final' && e.actor === 'p:${bId}')`, 3000), 'host ATC logs the cut-in against B (cooldown + radio)');
    console.log('     host-side detections:', await A.ev('JSON.stringify(__krzNet.session.state().hostDet)'));
    ok(await B.until('__krzNet.session.state().radioIn.some((m) => m.tower && m.about === "player")', 15000), 'host tower lines about B reach B with B\'s own callsign id', await B.ev('JSON.stringify(__krzNet.session.state().radioIn.slice(-5))'));

    // B lands (teleported onto the runway), banks: the host credits it to the Court, the Crown moves, B is told
    await B.ev(`(async () => { clearInterval(window.__hold); const R = await import('/gms/3d/krayzee/js/flight/routes.js'); const e = R.runwayEnd(${JSON.stringify(E)}); const [x, z] = R.fromRunway(e, 700, 0); __game.teleport({ x, z, heading: e.hdg }); return true; })()`);
    ok(await A.until(`__krzNet.session.state().ledger['p:${bId}']?.landed`, 6000), 'host sees B land (from B\'s state stream)');
    const pend = await B.ev('__game.wiring.game.state().pending');
    await B.ev('__game.wiring.game.bank(); true');
    ok(await A.until(`(() => { const s = __krzNet.session.state(); const b = s.court.find((p) => p.id === 'p:${bId}'); return b && b.pp > 0 && s.holder === 'p:${bId}'; })()`, 6000), 'bank report → host Court credits B and hands B the Crown', await A.ev('JSON.stringify(__krzNet.session.state().court)') + ` pending was ${pend}`);
    ok(await B.until(`__krzNet.session.state().holder === 'p:${bId}' && __krzNet.session.state().crowns.some((c) => c.id === 'p:${bId}')`, 5000), "B's Court replica and crown event agree");
    ok(await B.until('__game.wiring.game.state().rankIndex === 8', 3000), 'B\'s own rank follows the Court (King/Queen: no career Emperor, D4)', String(await B.ev('__game.wiring.game.state().rankIndex')));
    ok(await A.ev(`__krzNet.session.state().court.find((p) => p.id === 'p:${aId}')?.rank === 'baron'`), 'A on 0 room PP is Baron');

    // Radio floor: B's bark goes through the host and is scheduled there
    await B.ev('(() => { const r = __game.wiring.radio; r.closeWindow?.("closed"); r.openMenu(); return r.choose(0); })()');
    ok(await A.until(`__krzNet.session.state().barks.some((b) => b.id === 'p:${bId}' && b.ok)`, 5000), "B's bark reaches the host's floor controller and is scheduled", await A.ev('JSON.stringify(__krzNet.session.state().barks)'));

    // End of round → podium on both, a counted win for B's career
    const winsB = await B.ev('__game.wiring.game.career?.onlineWins ?? -1');
    await A.ev('__krzNet.session.endRound(); true');
    ok(await A.until('!!document.querySelector(".kzp")', 4000) && await B.until('!!document.querySelector(".kzp")', 4000), 'end of round shows the podium on both pages');
    ok(await B.until(`(__game.wiring.game.career?.onlineWins ?? -1) === ${winsB + 1}`, 3000), 'B\'s career gets the online win (2 humans: counted, D2)', `${winsB} → ${await B.ev('__game.wiring.game.career?.onlineWins')}`);
    await A.shot('game-podium-a.png'); await B.shot('game-podium-b.png');
    await B.ev('document.querySelector(".kzp")?.remove(); true');
    await A.ev('document.querySelector(".kzp")?.remove(); true');

    // Host leaves: B takes over the shared world
    await A.close();
    ok(await B.until('__krzNet.net.isHost && __krzNet.session.role === "host"', 6000), 'host closes → B becomes host and its session takes authority');
    ok(await B.ev(`__krzNet.session.state().holder === 'p:${bId}' && __krzNet.session.state().court.find((p) => p.id === 'p:${bId}')?.pp > 0`), 'the Court survives the handoff (restored from B\'s replica)');
    ok(await B.until('__game.traffic.list.filter((e) => !e.player && !e.remote).length > 0', 20000), 'new host flies its own AI traffic');
    ok(await B.until(`!__game.traffic.list.some((e) => e.ac.id === 'p:${aId}')`, 15000), "the old host's plane leaves B's world");
    await B.shot('game-handoff-b.png');
    const errs = [...A.errors, ...B.errors].filter((e) => !/favicon|ERR_|net::|WebSocket/.test(e));
    ok(!errs.length, 'no page errors', errs.slice(0, 5).join(' | '));
  } catch (e) {
    ok(false, 'game run threw', e.message);
  } finally {
    await A.close(); await B.close();
  }
  return { fails, passes };
}

let bad = 0;
try {
  if (ONLY !== 'game') {
    bad += await phoneShots();
    for (const mode of ['direct', 'relay']) bad += (await run(mode)).fails.length;
    // Falsification: A sends a frozen plane. The movement check must fail, or it was never measuring anything.
    const f = await run('falsify');
    const caught = f.fails.some((x) => x.startsWith("B sees A's plane move"));
    console.log(`${caught ? 'ok  ' : 'FAIL'} falsify: a frozen plane fails "B sees A's plane move"`);
    if (!caught) bad++;
  }
  if (ONLY !== 'sandbox') {
    buildGame();
    bad += (await runGame('real')).fails.length;
    if (process.argv.includes('--trace')) throw new Error('trace run: falsification skipped');
    // Falsification: B's reports never reach the host. B still detects the cut-in, so only the host-side check may fail.
    const g = await runGame('falsify');
    const caught = g.fails.some((x) => x.startsWith('the cut-in by B scores on the host')) && g.passes.some((x) => x.startsWith("B's replica learns"));
    console.log(`${caught ? 'ok  ' : 'FAIL'} falsify: with B's reports dropped, "the cut-in by B scores on the host" fails (and B still detected it)`);
    if (!caught) bad++;
  }
} finally {

  srv.kill(); web.close();
  if (!process.argv.includes('--keep')) { try { execFileSync(CDP, ['stop', String(CDP_PORT)], { stdio: 'ignore' }); } catch (e) { /* stopped */ } }
}
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
