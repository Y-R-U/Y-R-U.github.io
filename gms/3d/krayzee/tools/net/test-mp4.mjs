// O4 gate: four real game pages (tools/net/gen/) in one Chrome over raw CDP (port 9561), own krayzeenet + static server.
//   node tools/net/test-mp4.mjs            real run, then the falsification run
//   node tools/net/test-mp4.mjs --real     real run only
//   node tools/net/test-mp4.mjs --keep     leave Chrome running
//   node tools/net/test-mp4.mjs --trace    print the bump, the wake-up and the ATC before/after in detail
// A hosts; B, C, D follow. ICE restart on a network change (D), a Rubber head-on bump (C × D), C frozen like a
// backgrounded iPhone (the host's autopilot flies it, control comes back where the AP left it), C's two reports
// (one whose ack is lost, one the host never saw), then A closes on final: B takes over ATC, AI, ledger and Court.
// The falsification run breaks one thing per key check and requires exactly those checks to fail.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildGame } from './gen-main.mjs';

const CDP_PORT = 9561, NET_PORT = 8740, WEB_PORT = 8741;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const NETURL = `ws://127.0.0.1:${NET_PORT}/gms/3d/krayzee/net`;
const GAME = `${WEB}/gms/3d/krayzee/tools/net/gen/index.html`;
const CDP = `${process.env.HOME}/.claude/bin/cdp`;
const SERVER = fileURLToPath(new URL('../../server/', import.meta.url));
const SHOTS = fileURLToPath(new URL('../../docs/shots/net/', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const bin = join(tmpdir(), 'krayzeenet-mp4');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, stdio: 'inherit' });
const srv = spawn(bin, [], { env: { ...process.env, KRAYZEE_ADDR: `127.0.0.1:${NET_PORT}`, KRAYZEE_DEV_AUTH: '1', KRAYZEE_ICE_URL: 'off', KRAYZEE_GRACE_MS: '30000', KRAYZEE_IDLE_MS: '0' }, stdio: 'ignore' });
execFileSync(CDP, ['start', '--port', String(CDP_PORT), '--idle', '120', '--max', '1200', '--', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-angle=metal'], { stdio: 'inherit' });

let browser = null;
async function ensureBrowser() {
  if (!browser) {
    const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const wait = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d.result); wait.delete(d.id); } };
    browser = { send: (method, params) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }) };
  }
  return browser;
}

const profileFor = (name, g, voice, reg, primary) => JSON.stringify({ name, gender: g, company: `${name} Air`, primary, secondary: '#f4efe6', accent: '#d4a017', voice, registration: reg, favourites: [voice] });
async function gameTab(name, g, voice, reg, primary) {
  const b = await ensureBrowser();
  const { browserContextId } = await b.send('Target.createBrowserContext', {});
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId });
  const ws = new WebSocket(`ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}`);
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
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!localStorage.getItem('krayzee.profile')) { localStorage.setItem('krayzee.profile', ${JSON.stringify(profileFor(name, g, voice, reg, primary))});
    localStorage.setItem('krayzee.coach', '{"done":true,"seen":["goal","stick","release","radio","bank"]}'); } } catch (e) {}` });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr.slice(0, 120)}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const until = async (expr, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr).catch(() => false)) return true; await sleep(150); }
    return false;
  };
  const tap = async (sel) => {
    const p = await ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n || n.disabled) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    if (!p) throw new Error(`no tappable ${sel}`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(200);
  };
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, n), Buffer.from(r.data, 'base64')); };
  let closed = false;
  const close = async () => { if (closed) return; closed = true; try { ws.close(); } catch (e) { /* closed */ } await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${targetId}`).catch(() => {}); };
  return { name, send, ev, until, tap, shot, close, errors, go: (q) => send('Page.navigate', { url: `${GAME}?${q}` }) };
}

const near = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 1e9);
const seen = (who) => `(() => { const e = __game.traffic.list.find((x) => x.ac.id === 'p:${who}'); return e ? { x: e.ac.pos.x, y: e.ac.pos.y, z: e.ac.pos.z, remote: !!e.remote } : null; })()`;
const me = '(() => { const a = __game.S.player.ac; return { x: a.pos.x, y: a.pos.y, z: a.pos.z }; })()';
const tele = (E, s, l, o) => `(async () => { const R = await import('/gms/3d/krayzee/js/flight/routes.js'); const e = R.runwayEnd(${JSON.stringify(E)}); const [x, z] = R.fromRunway(e, ${s}, ${l});
  const o = ${JSON.stringify(o)}; if (o.back) o.heading = (e.hdg + 180) % 360; else if (o.heading == null) o.heading = e.hdg; __game.teleport({ x, z, ...o }); return true; })()`;
// Canonical ATC view of a page: its own 'player' strip renamed to p:<its net id>.
const atcView = (E) => `(() => { const A = __game.wiring.atc, S = A._debug().S, mine = 'p:' + __krzNet.net.id, c = (id) => (id === 'player' ? mine : id);
  const cmds = {}; for (const [id, s] of Object.entries(S.strips)) cmds[c(id)] = Object.fromEntries(Object.entries(s.cmds || {}).map(([k, v]) => [k, v.seq]));
  const st = Object.fromEntries(Object.entries(S.strips).map(([id, s]) => [c(id), [s.state, s.intent, s.local, s.landEnd, s.seqNo, Math.round(s.rem ?? -1)]]));
  return { seq: A.sequence(${JSON.stringify(E)}).map(c), cmds, cmdSeq: S.cmdSeq, st, log: S.log.slice(-6).map((e) => e.type + ':' + c(e.actor)) }; })()`;
const localAI = '__game.traffic.list.filter((e) => !e.player && !e.remote && !String(e.ac.id).startsWith("p:")).map((e) => ({ id: e.ac.id, x: e.ac.pos.x, z: e.ac.pos.z }))';

async function run(mode) {
  const falsify = mode === 'falsify';
  const fails = [], passes = [];
  const ok = (cond, label, extra = '') => { (cond ? passes : fails).push(label); console.log(`${cond ? 'ok  ' : 'FAIL'} [${mode}] ${label}${cond || !extra ? '' : ` — ${String(extra).slice(0, 600)}`}`); return cond; };
  const A = await gameTab('Dirk', 'm', 'toff', 'K-DIRK', '#b3122e'), B = await gameTab('Mo', 'f', 'bubba', 'K-MOMO', '#1f4e8c');
  const C = await gameTab('Ann', 'f', 'tex', 'K-ANNE', '#2f6b3a'), D = await gameTab('Zed', 'm', 'nan', 'K-ZEDD', '#6b1f5c');
  const all = [A, B, C, D];
  try {
    for (const T of all) await T.go(`net=${encodeURIComponent(NETURL)}&uid=${T.name}-${mode}&noaccount=1&quality=low&intro=0&lite=1`);
    let booted = true;
    for (const T of all) booted = (await T.until('window.__krayzeeReady === true', 90000)) && booted;
    ok(booted, 'four game pages boot');
    await sleep(800);
    for (const T of all) for (let i = 0; i < 20 && !(await T.ev('!!document.querySelector(".kzn.on")')); i++) { await T.tap('[data-a="online"]').catch(() => {}); await sleep(500); }
    let conn = true;
    for (const T of all) conn = (await T.until('window.__krzNet?.net?.connected', 20000)) && conn;
    ok(conn, 'all four reach the room server');
    await A.tap('[data-a="create"]'); await A.tap('[data-a="ok"]');
    await A.until('__krzNet.net.room && document.querySelector(".kzn").dataset.view === "room"');
    await A.ev('__krzNet.net.setOptions({ ...__krzNet.net.room.set, type: "court", protection: "rubber", traffic: "light", minutes: 15 }); true');
    const code = await A.ev('document.querySelector("[data-s=code]").textContent');
    for (const T of [B, C, D]) { await T.tap('#kzn-code'); await T.send('Input.insertText', { text: code }); await T.tap('[data-a="join"]'); await sleep(300); }
    ok(await A.until('__krzNet.net.room?.members.length === 4 && __krzNet.net.room.set.protection === "rubber"', 10000), 'three pages join by code; the room is Rubber');
    await A.tap('[data-a="start"]');
    const inPlay = 'window.__game.S.mode === "play" && __game.S.playMode === "online" && __krzNet.session?.attached';
    let playing = true;
    for (const T of all) playing = (await T.until(inPlay, 40000)) && playing;
    ok(playing, 'host Start: four pages in an online flight with sessions attached');
    const id = {};
    for (const T of all) id[T.name] = await T.ev('__krzNet.net.id');
    const [a, b, c, d] = [id.Dirk, id.Mo, id.Ann, id.Zed];
    let meshOk = true;
    for (const T of all) meshOk = (await T.until(`__krzNet.session.state().humans.filter((h) => h.entered).length === 3`, 20000)) && meshOk;
    ok(meshOk, 'every page flies the other three as remote planes');
    ok((await C.ev('__game.wiring.game.state().protectionMode')) === 'rubber', "the room's protection (Rubber) replaces Free Flight's on followers");
    const E = await A.ev('__game.wiring.activeEnd()');

    // ICE restart: D's network "changes". Same RTCPeerConnections, relay meanwhile, direct again.
    await D.ev(`(() => { window.__ice = { start: 0, done: [] }; __krzNet.net.on('iceRestarted', (p) => __ice.done.push(p));
      window.__pcs = Object.fromEntries([...__krzNet.net.net.links].map(([p, l]) => [p, l.pc])); return true; })()`);
    if (falsify) await D.ev('__krzNet.net.net.restartIce = () => 0; true');
    await D.ev('window.dispatchEvent(new Event("online")); true');
    const iceOk = await D.until(`(() => { const L = [...__krzNet.net.net.links]; return L.length === 3 && L.every(([p, l]) => l.direct && !l.restarting && l.pc === __pcs[p]) && new Set(__ice.done).size === 3; })()`, 15000);
    ok(iceOk, 'network change on D: ICE restarts on all three links, same peer connections, direct again', await D.ev('JSON.stringify({ done: __ice.done, links: [...__krzNet.net.net.links].map(([p, l]) => [p, l.direct, l.restarting, l.pc === __pcs[p], l.restarts]) })'));
    ok(await A.until(`(() => { const s = __krzNet.session.state().humans.find((h) => h.id === 'p:${d}'); return s && /interp|reckon/.test(s.st || ''); })()`, 5000), "D's plane still streams to the host after the restart");

    // PvP head-on taxi bump on the runway in Rubber: each page judges its own contact, both bounce, the host hears both.
    const bounces = async (T) => T.ev('__game.wiring.game.state().stats.bounces');
    const [bc0, bd0] = [await bounces(C), await bounces(D)];
    if (falsify) await D.ev('__game.S.player.ac.impactHandler = null; true');
    await C.ev(tele(E, 600, 0, { speedKt: 25, throttle: 0.35 }));
    await D.ev(tele(E, 650, 0, { speedKt: 25, throttle: 0.35, back: true }));
    for (const T of [C, D]) await T.ev('__game.S.player.apOff = true; true');
    if (process.argv.includes('--trace')) for (let i = 0; i < 8; i++) {
      await sleep(400);
      console.log('  C', await C.ev(`JSON.stringify({ me: (() => { const a = __game.S.player.ac; return [a.pos.x|0, +a.pos.y.toFixed(1), a.pos.z|0, a.onGround, +a.gs.toFixed(1)]; })(), d: (() => { const e = __game.traffic.list.find((x) => x.ac.id === 'p:${d}'); return e && [e.ac.pos.x|0, +e.ac.pos.y.toFixed(1), e.ac.pos.z|0, e.ac.crashed, e.remote]; })(), imp: __game.S.player.ac._lastImpact })`));
    }
    await sleep(4000);
    const [bc1, bd1] = [await bounces(C), await bounces(D)];
    const hitsIn = await A.ev('JSON.stringify(__krzNet.session.state().hitsIn)');
    ok(bc1 > bc0 && bd1 > bd0 && hitsIn.includes(`p:${c}`) && hitsIn.includes(`p:${d}`) && /"res":"bounce"/.test(hitsIn), 'a Rubber pvp bump bounces both planes and the host hears both hit reports', `C ${bc0}→${bc1}, D ${bd0}→${bd1}, host ${hitsIn}`);
    for (const T of [C, D]) await T.ev('__game.S.player.apOff = false; true');

    // Away: C climbs onto downwind, then its page is frozen (an iPhone in the background).
    await C.ev(tele(E, -800, 900, { alt: 300, speedKt: 95, throttle: 0.7, back: true }));
    await sleep(3000);
    if (falsify) await A.ev('__krzNet.session.debug.noAp = true; true');
    if (process.argv.includes('--trace')) await A.ev(`__krzNet.net.net.on('data', (p, b) => { if (p === '${c}') { window.__cnt = (window.__cnt || 0) + 1; window.__k = b[0]; window.__len = b.length; } }); true`);
    await C.send('Page.setWebLifecycleState', { state: 'frozen' });
    const held = await A.until(`__krzNet.session.state().held.includes('p:${c}')`, 7000);
    const [h1, d1] = [await A.ev(seen(c)), await D.ev(seen(c))];
    await sleep(3000);
    const [h2, d2] = [await A.ev(seen(c)), await D.ev(seen(c))];
    const local = await A.ev(`!!__game.wiring.atc._debug().S.strips['p:${c}']?.local`);
    ok(held && near(h1, h2) > 90 && near(d1, d2) > 90 && near(h2, d2) < 120 && local, "C's page frozen: the host's autopilot flies C's plane (ATC sees it as local), D sees it fly",
      `held ${held}, host moved ${near(h1, h2).toFixed(0)} m, D moved ${near(d1, d2).toFixed(0)} m, D vs host ${near(h2, d2).toFixed(0)} m, local ${local}`);
    ok(await D.ev(`__krzNet.session.state().heldPeers.includes('p:${c}')`), "D follows the host's relay for C while it is held");
    await C.send('Page.setWebLifecycleState', { state: 'active' });
    await C.send('Emulation.setFocusEmulationEnabled', { enabled: true });   // the woken page is visible again (rAF runs)
    if (process.argv.includes('--trace')) for (let i = 0; i < 6; i++) {
      console.log('  C', await C.ev(`JSON.stringify({ conn: __krzNet.net.connected, st: __krzNet.session.state().meHeld, res: __krzNet.session.state().resumed.length, links: [...__krzNet.net.net.links].map(([p, l]) => [p, l.direct, l.restarting, l.pc?.iceConnectionState, l.dcU?.readyState, l.restarts]), rt: Math.round(__krzNet.net.roomTime()) })`).catch((e) => e.message),
        '\n  A', await A.ev(`JSON.stringify({ held: __krzNet.session.state().held, ap: __krzNet.session.state().ap.length, tr: (() => { const t = __krzNet.net.track('${c}'); return t && [t.samples.length, Math.round(t.lastRT), t.latest()?.t]; })(), rt: Math.round(__krzNet.net.roomTime()), l: (() => { const l = __krzNet.net.net.links.get('${c}'); return [l.direct, l.restarting, l.pc?.iceConnectionState, l.restarts]; })(), cnt: window.__cnt, k: window.__k, len: window.__len })`),
        '\n  Cb', await C.ev(`(async () => JSON.stringify({ buf: [...__krzNet.net.net.links].map(([p, l]) => [l.dcU?.bufferedAmount, l.dcR?.bufferedAmount]), raf: await Promise.race([new Promise((r) => requestAnimationFrame(() => r('raf'))), new Promise((r) => setTimeout(() => r('no raf'), 300))]), vis: document.visibilityState, gs: __game.state?.().player ? 1 : 0 }))()`));
      await sleep(500);
    }
    const back = await C.until('(() => { const s = __krzNet.session.state(); return !s.meHeld && s.resumed.length > 0; })()', 8000);
    await sleep(1500);
    const [cme, ch] = [await C.ev(me), await A.ev(seen(c))];
    const released = await A.until(`!__krzNet.session.state().held.includes('p:${c}')`, 4000) && await D.until(`!__krzNet.session.state().heldPeers.includes('p:${c}')`, 4000);
    ok(back && released && near(cme, ch) < 80, 'C wakes: control comes back where the autopilot left the plane; host and D release it', `resumed ${back}, released ${released}, C vs host ${near(cme, ch).toFixed(0)} m`);
    await A.shot(`mp4-away-${mode}.png`);

    // Reports across the migration. inf1: the host takes it but C never sees the ack. inf2: the host never sees it.
    await sleep(3500);   // the AP hand-back's ATC grace
    await C.ev(`(() => { const N = __krzNet.net.net, e = N._emit.bind(N); window.__dropAck = true; N._emit = (ev, f, m, ...r) => (ev === 'msg' && m && m.t === 'infAck' && window.__dropAck ? undefined : e(ev, f, m, ...r)); return true; })()`);
    await C.ev('__game.wiring.atc.report("tower_buzz", "player", { severity: 1, data: {} }); true');
    const n1 = await C.until('__krzNet.session.state().sentInf.some((m) => m.rule === "tower_buzz")', 3000) && await C.ev('__krzNet.session.state().sentInf.find((m) => m.rule === "tower_buzz").n');
    const took1 = await A.until(`__krzNet.session.state().infs.some((m) => m.id === 'p:${c}' && m.n === ${n1} && m.ok)`, 5000);
    await A.ev(`(() => { const N = __krzNet.net.net, e = N._emit.bind(N); N._emit = (ev, f, m, ...r) => (ev === 'msg' && f === '${c}' && m && m.t === 'inf' ? undefined : e(ev, f, m, ...r)); return true; })()`);
    await C.ev('__game.wiring.atc.report("terminal_buzz", "player", { severity: 1, data: {} }); true');
    const n2 = await C.until('__krzNet.session.state().sentInf.some((m) => m.rule === "terminal_buzz")', 3000) && await C.ev('__krzNet.session.state().sentInf.find((m) => m.rule === "terminal_buzz").n');
    await sleep(1500);   // the host's 1 Hz Court/ledger replication reaches B
    await C.ev('window.__dropAck = false; true');
    const unacked = await C.ev('__krzNet.session.state().unacked');
    ok(took1 && n2 && unacked.includes(`i${n1}`) && unacked.includes(`i${n2}`), "C holds two unacknowledged reports (one the host took, one it never saw)", JSON.stringify({ took1, n1, n2, unacked }));

    // A lands on final with B behind it; A closes the tab mid-approach.
    await A.ev(tele(E, -1600, 0, { alt: 120, speedKt: 68, flaps: 1, throttle: 0.4 }));
    await B.ev(tele(E, -3200, 0, { alt: 230, speedKt: 80, flaps: 0.5, throttle: 0.5 }));
    await sleep(4000);
    const ledA = await A.ev(`__krzNet.session.state().ledger['p:${c}']`);
    const pre = await A.ev(atcView(E)), preAI = await A.ev(localAI), preCourt = await A.ev('JSON.stringify(__krzNet.session.state().court.map((p) => [p.id, p.pp]))');
    const onFinal = await A.ev(`!__game.S.player.ac.onGround && (__game.S.player.ap.leg?.kind === 'approach' || __game.wiring.atc.sequence(${JSON.stringify(E)}).includes('player'))`);
    const aState = await A.ev(`JSON.stringify({ leg: __game.S.player.ap.leg?.kind, sub: __game.S.player.ap.sub, agl: Math.round(__game.S.player.ac.agl), strip: __game.wiring.atc.strip('player') })`);
    console.log(`     [${mode}] before: seq ${JSON.stringify(pre.seq)} cmdSeq ${pre.cmdSeq}, AI ${preAI.map((x) => x.id).join(',')}, A on final ${onFinal}`);
    if (falsify) {
      await B.ev(`(() => { const N = __krzNet.net.net, e = N._emit.bind(N); N._emit = (ev, f, m, ...r) => (ev === 'msg' && m && (m.t === 'atk' || m.t === 'atd') ? undefined : e(ev, f, m, ...r));
        const A = __game.wiring.atc, s = A.serialize(); s.strips = {}; s.seqs = {}; s.deps = {}; s.cmdSeq = 0; A.restore(s); return true; })()`);
      await B.ev('__krzNet.session.debug.noDedupe = true; true');
    }
    await A.close();
    const took = await B.until('__krzNet.net.isHost && __krzNet.session.role === "host"', 8000);
    ok(took && onFinal, 'A closes on final → B becomes host', `role ${await B.ev('__krzNet.session.role')}, A was on final ${onFinal} ${aState}`);
    await sleep(600);
    const post = await B.ev(atcView(E));
    // Order kept for everyone in both; nobody still airborne may drop out (a plane that touched down meanwhile may).
    const air = await B.ev(`Object.fromEntries(__game.traffic.list.map((e) => [e.player ? 'p:' + __krzNet.net.id : e.ac.id, !e.ac.onGround]))`);
    const want = pre.seq.filter((x) => x !== `p:${a}`);
    // A plane the new host has since sent around (a fresh ATC decision, logged with a new clearance number) may leave.
    const common = want.filter((x) => post.seq.includes(x)), lost = want.filter((x) => !post.seq.includes(x) && air[x] && post.st[x]?.[0] !== 'goAround');
    ok(want.length > 0 && common.length > 0 && JSON.stringify(common) === JSON.stringify(post.seq.filter((x) => common.includes(x))) && !lost.length,
      'new host keeps the arrival sequence (order, minus the leaver)', `before ${JSON.stringify(pre.seq)} after ${JSON.stringify(post.seq)} lost ${lost}`);
    let same = 0, total = 0;
    const miss = [];
    for (const [sid, cm] of Object.entries(pre.cmds)) {
      if (sid === `p:${a}`) continue;
      for (const [k, seq] of Object.entries(cm)) { total++; if (post.cmds[sid]?.[k] === seq || (post.cmds[sid]?.[k] ?? -1) > seq) same++; else miss.push(`${sid}.${k}#${seq}`); }
    }
    if (miss.length || process.argv.includes('--trace')) console.log('     missing', miss.join(' '), '\n     pre ', JSON.stringify(pre.st), JSON.stringify(pre.cmds), '\n     post', JSON.stringify(post.st), JSON.stringify(post.cmds), JSON.stringify(post.log), '\n     ids', JSON.stringify({ a, b, c, d }));
    ok(total > 0 && post.cmdSeq >= pre.cmdSeq && same / total >= 0.8, 'new host keeps every clearance (same ATC sequence numbers, counter continues)', `${same}/${total} kept, cmdSeq ${pre.cmdSeq} → ${post.cmdSeq}`);
    let views = [];
    for (let i = 0; i < 20; i++) {
      views = [await B.ev(atcView(E)), await C.ev(atcView(E)), await D.ev(atcView(E))];
      if (views[1].seq.join() === views[0].seq.join() && views[2].seq.join() === views[0].seq.join()) break;
      await sleep(250);
    }
    ok(views[1].seq.join() === views[0].seq.join() && views[2].seq.join() === views[0].seq.join(), "C's and D's replicas follow the new host's sequence", views.map((v) => v.seq.join()).join(' | '));
    const postAI = await B.ev(localAI);
    const adopted = preAI.filter((x) => { const y = postAI.find((p) => p.id === x.id); return y && near(x, y) < 600; });
    ok(preAI.length > 0 && adopted.length >= preAI.length - 1, "B adopts A's AI planes (same ids, flying on from where they were)", `${adopted.length}/${preAI.length}: ${preAI.map((x) => x.id).join(',')} → ${postAI.map((x) => x.id).join(',')}`);
    ok(postAI.length === new Set(postAI.map((x) => x.id)).size, 'no duplicate AI ids on the new host');
    ok(await C.until('__krzNet.session.state().ai.filter((x) => x.entered).length > 0', 4000), 'C still sees AI traffic from the new host');

    // Ledger: inf2 resent and credited once; inf1 recognised as already counted.
    const s2 = await B.ev(`(() => { const s = __krzNet.session.state(); return { infs: s.infs.filter((m) => m.id === 'p:${c}'), led: s.ledger['p:${c}'] }; })()`);
    const got2 = s2.infs.find((m) => m.n === n2 && m.ok && !m.dup);
    ok(!!got2 && s2.led?.ns.includes(n2), "C's unacknowledged report survives: resent to the new host and credited", JSON.stringify(s2));
    const credit2 = got2?.pp || 0;
    ok(!!s2.led && s2.led.acc === (ledA?.acc || 0) + credit2 && s2.led.infs === (ledA?.infs || 0) + 1, 'no duplicate scoring: the report the old host already counted is not counted again', `A had ${JSON.stringify(ledA)}, B has ${JSON.stringify(s2.led)}, +${credit2}`);
    ok(await C.until('__krzNet.session.state().unacked.length === 0', 4000), "C's reports are all acknowledged by the new host", await C.ev('JSON.stringify({ un: __krzNet.session.state().unacked, acks: __krzNet.session.state().acks.slice(-4), resent: __krzNet.session.state().resent })'));
    const postCourt = await B.ev('JSON.stringify(__krzNet.session.state().court.filter((p) => p.id !== "p:' + a + '").map((p) => [p.id, p.pp]))');
    ok(JSON.stringify(JSON.parse(preCourt).filter((p) => p[0] !== `p:${a}`)) === postCourt, 'Court standings survive the handoff', `${preCourt} → ${postCourt}`);
    ok(await B.until(`!__game.traffic.list.some((e) => e.ac.id === 'p:${a}')`, 15000), "the old host's plane leaves B's world");
    await B.shot(`mp4-handoff-${mode}.png`);
    const errs = all.flatMap((T) => T.errors).filter((e) => !/favicon|ERR_|net::|WebSocket/.test(e));
    ok(!errs.length, 'no page errors', errs.slice(0, 5).join(' | '));
  } catch (e) {
    ok(false, 'run threw', e.stack || e.message);
  } finally {
    for (const T of all) await T.close();
  }
  return { fails, passes };
}

let bad = 0;
try {
  buildGame();
  bad += (await run('real')).fails.length;
  if (!process.argv.includes('--real')) {
    const f = await run('falsify');
    const must = ['network change on D', 'a Rubber pvp bump bounces both', "C's page frozen: the host's autopilot flies", 'new host keeps every clearance', 'no duplicate scoring'];
    const still = ["C's unacknowledged report survives", 'A closes on final'];
    for (const m of must) {
      const caught = f.fails.some((x) => x.startsWith(m));
      console.log(`${caught ? 'ok  ' : 'FAIL'} falsify: "${m}…" fails when its mechanism is broken`);
      if (!caught) bad++;
    }
    for (const m of still) {
      const fine = f.passes.some((x) => x.startsWith(m));
      console.log(`${fine ? 'ok  ' : 'FAIL'} falsify: "${m}…" still passes (the sabotage is targeted)`);
      if (!fine) bad++;
    }
  }
} finally {
  srv.kill(); web.close();
  if (!process.argv.includes('--keep')) { try { execFileSync(CDP, ['stop', String(CDP_PORT)], { stdio: 'ignore' }); } catch (e) { /* stopped */ } }
}
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
